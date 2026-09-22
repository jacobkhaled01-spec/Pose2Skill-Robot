#!/usr/bin/env python3
"""
عقدة تقدير وضعية الجسم البشري ثلاثية الأبعاد باستخدام RTMPose.
ROS 2 node for 3D human body pose estimation using RTMPose.

References:
    Jiang et al. (2023). RTMPose: Real-Time Multi-Person Pose Estimation. arXiv:2303.07399.
"""
from __future__ import annotations

import time
from typing import Optional

import cv2
import numpy as np
import rclpy
from cv_bridge import CvBridge
from geometry_msgs.msg import Pose, PoseArray, Point, Quaternion
from rclpy.node import Node
from sensor_msgs.msg import Image
from std_msgs.msg import Header
from visualization_msgs.msg import Marker, MarkerArray


# اتصالات المفاصل لرسم الهيكل العظمي (COCO 17 keypoints)
SKELETON_CONNECTIONS = [
    (0, 1), (0, 2),        # الرأس - الأكتاف
    (1, 3), (2, 4),        # الأكتاف - المرفقين
    (3, 5), (4, 6),        # المرفقين - المعصمين
    (5, 7), (6, 8),        # المعصمين - الكفين
    (1, 7), (2, 8),        # الأكتاف - الوركين
    (7, 9), (8, 10),       # الوركين - الركبتين
    (9, 11), (10, 12),     # الركبتين - الكاحلين
]

KEYPOINT_NAMES = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"
]


class BodyPoseNode(Node):
    """
    عقدة ROS 2 لتقدير وضعية الجسم البشري ثلاثية الأبعاد.
    
    Subscribes:
        /camera/rgb/image_raw (sensor_msgs/Image): دفق صور الكاميرا
    
    Publishes:
        /pose2skill/body_keypoints (geometry_msgs/PoseArray): إحداثيات المفاصل
        /pose2skill/debug/skeleton_markers (visualization_msgs/MarkerArray): للتصحيح
    """

    def __init__(self) -> None:
        super().__init__("body_pose_node")
        self._setup_parameters()
        self._setup_ros_interfaces()
        self._load_model()
        
        self.bridge = CvBridge()
        self.frame_count = 0
        self.last_fps_time = time.time()
        
        self.get_logger().info("✅ BodyPoseNode جاهز للاستخدام")

    def _setup_parameters(self) -> None:
        """تهيئة معاملات العقدة."""
        self.declare_parameter("model_name", "rtmpose-l_8xb32-270e_coco-wholebody-384x288")
        self.declare_parameter("device", "cuda:0")
        self.declare_parameter("confidence_threshold", 0.3)
        self.declare_parameter("input_topic", "/camera/rgb/image_raw")
        self.declare_parameter("publish_visualization", True)
        self.declare_parameter("fps_log_interval", 100)

    def _setup_ros_interfaces(self) -> None:
        """تهيئة Publishers و Subscribers."""
        # Publishers
        self.keypoints_pub = self.create_publisher(
            PoseArray, "/pose2skill/body_keypoints", 10
        )
        self.markers_pub = self.create_publisher(
            MarkerArray, "/pose2skill/debug/skeleton_markers", 10
        )
        
        # Subscriber
        input_topic = self.get_parameter("input_topic").value
        self.image_sub = self.create_subscription(
            Image, input_topic, self._image_callback, 10
        )
        self.get_logger().info(f"📷 مشترك في: {input_topic}")

    def _load_model(self) -> None:
        """تحميل نموذج RTMPose."""
        try:
            from mmpose.apis import MMPoseInferencer
            model_name = self.get_parameter("model_name").value
            device = self.get_parameter("device").value
            
            self.inferencer = MMPoseInferencer(
                pose3d="human3d",
                device=device
            )
            self.get_logger().info(f"✅ RTMPose محمّل على {device}")
        except ImportError:
            self.get_logger().warn(
                "⚠️ MMPose غير مثبت — استخدام نموذج وهمي للاختبار"
            )
            self.inferencer = None

    def _image_callback(self, msg: Image) -> None:
        """
        معالجة كل إطار من الكاميرا واستخراج نقاط المفاصل.
        
        Args:
            msg: رسالة الصورة من ROS 2
        """
        try:
            frame = self.bridge.imgmsg_to_cv2(msg, desired_encoding="rgb8")
        except Exception as e:
            self.get_logger().error(f"خطأ في تحويل الصورة: {e}")
            return

        keypoints, scores = self._run_inference(frame)
        
        if keypoints is None:
            return
        
        # نشر نقاط المفاصل
        pose_array = self._build_pose_array(keypoints, scores, msg.header)
        self.keypoints_pub.publish(pose_array)
        
        # نشر markers للتصحيح
        if self.get_parameter("publish_visualization").value:
            markers = self._build_skeleton_markers(keypoints, scores, msg.header)
            self.markers_pub.publish(markers)
        
        # إحصاء FPS
        self.frame_count += 1
        if self.frame_count % self.get_parameter("fps_log_interval").value == 0:
            elapsed = time.time() - self.last_fps_time
            fps = self.get_parameter("fps_log_interval").value / elapsed
            self.get_logger().info(f"⚡ Body Pose FPS: {fps:.1f}")
            self.last_fps_time = time.time()

    def _run_inference(
        self, frame: np.ndarray
    ) -> tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        """
        تشغيل نموذج RTMPose على الإطار.
        
        Returns:
            (keypoints [17, 3], scores [17]) أو (None, None) عند الفشل
        """
        if self.inferencer is None:
            # نموذج وهمي للاختبار
            keypoints = np.random.rand(17, 3).astype(np.float32)
            scores = np.random.rand(17).astype(np.float32)
            return keypoints, scores
        
        try:
            result = self.inferencer(frame, show=False)
            predictions = result.get("predictions", [])
            
            if not predictions or not predictions[0]:
                return None, None
            
            person = predictions[0][0]  # أول شخص مكتشف
            keypoints = np.array(person["keypoints"], dtype=np.float32)  # [17, 3]
            scores = np.array(person["keypoint_scores"], dtype=np.float32)  # [17]
            
            return keypoints, scores
        except Exception as e:
            self.get_logger().warn(f"خطأ في الاستنتاج: {e}")
            return None, None

    def _build_pose_array(
        self,
        keypoints: np.ndarray,
        scores: np.ndarray,
        header: Header
    ) -> PoseArray:
        """بناء PoseArray من نقاط المفاصل."""
        pose_array = PoseArray()
        pose_array.header = header
        pose_array.header.frame_id = "camera_frame"
        
        threshold = self.get_parameter("confidence_threshold").value
        
        for kp, score in zip(keypoints, scores):
            pose = Pose()
            if score >= threshold:
                pose.position = Point(x=float(kp[0]), y=float(kp[1]), z=float(kp[2]))
            # إذا الثقة منخفضة، نبعث (0,0,0) مع علامة
            pose.orientation = Quaternion(x=0.0, y=0.0, z=0.0, w=float(score))
            pose_array.poses.append(pose)
        
        return pose_array

    def _build_skeleton_markers(
        self,
        keypoints: np.ndarray,
        scores: np.ndarray,
        header: Header
    ) -> MarkerArray:
        """بناء MarkerArray للتصور في RViz."""
        markers = MarkerArray()
        threshold = self.get_parameter("confidence_threshold").value
        
        # نقاط المفاصل
        for i, (kp, score) in enumerate(zip(keypoints, scores)):
            if score < threshold:
                continue
            marker = Marker()
            marker.header = header
            marker.header.frame_id = "camera_frame"
            marker.id = i
            marker.type = Marker.SPHERE
            marker.action = Marker.ADD
            marker.pose.position = Point(x=float(kp[0]), y=float(kp[1]), z=float(kp[2]))
            marker.scale.x = marker.scale.y = marker.scale.z = 0.03
            marker.color.r = 1.0
            marker.color.g = float(score)
            marker.color.a = 1.0
            markers.markers.append(marker)
        
        return markers


def main(args=None) -> None:
    """نقطة دخول العقدة."""
    rclpy.init(args=args)
    node = BodyPoseNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        node.get_logger().info("إيقاف BodyPoseNode...")
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
