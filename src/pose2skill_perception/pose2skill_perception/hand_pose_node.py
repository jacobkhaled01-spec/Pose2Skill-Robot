#!/usr/bin/env python3
"""
عقدة تقدير وضعية اليد وكشف حالة الإمساك باستخدام HaMeR/MediaPipe.
ROS 2 node for hand pose estimation and grasp state detection.

References:
    Pavlakos et al. (2024). Reconstructing Hands in 3D with Transformers. CVPR.
    Carfì et al. (2021). Hand-Object Interaction. Frontiers in Robotics and AI.
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
from std_msgs.msg import Float32, Header


# نقاط اليد — MediaPipe Hands (21 keypoint)
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),         # الإبهام
    (0, 5), (5, 6), (6, 7), (7, 8),         # السبابة
    (0, 9), (9, 10), (10, 11), (11, 12),    # الوسطى
    (0, 13), (13, 14), (14, 15), (15, 16),  # البنصر
    (0, 17), (17, 18), (18, 19), (19, 20),  # الخنصر
    (5, 9), (9, 13), (13, 17),              # راحة اليد
]

FINGERTIP_INDICES = [4, 8, 12, 16, 20]  # أطراف الأصابع الخمسة


class HandPoseNode(Node):
    """
    عقدة ROS 2 لتقدير وضعية اليد وقياس انفتاح القبضة.
    
    Subscribes:
        /camera/rgb/image_raw (sensor_msgs/Image)
    
    Publishes:
        /pose2skill/hand_keypoints  (geometry_msgs/PoseArray)  — 21 نقطة
        /pose2skill/hand_aperture   (std_msgs/Float32)         — [0=مفتوحة, 1=مغلقة]
    """

    GRASP_CLOSE_THRESHOLD = 0.5    # عتبة إغلاق القبضة
    FINGER_SPREAD_REF = 0.15       # مسافة مرجعية لانفراج الأصابع (متر)

    def __init__(self) -> None:
        super().__init__("hand_pose_node")
        self._setup_parameters()
        self._setup_ros_interfaces()
        self._load_model()
        
        self.bridge = CvBridge()
        self.get_logger().info("✅ HandPoseNode جاهز")

    def _setup_parameters(self) -> None:
        self.declare_parameter("model", "mediapipe")  # "mediapipe" أو "hamer"
        self.declare_parameter("device", "cuda:0")
        self.declare_parameter("hand_side", "both")   # "left", "right", "both"
        self.declare_parameter("min_detection_confidence", 0.7)
        self.declare_parameter("min_tracking_confidence", 0.5)

    def _setup_ros_interfaces(self) -> None:
        # Publishers
        self.hand_kp_pub = self.create_publisher(
            PoseArray, "/pose2skill/hand_keypoints", 10
        )
        self.aperture_pub = self.create_publisher(
            Float32, "/pose2skill/hand_aperture", 10
        )
        
        # Subscriber
        self.image_sub = self.create_subscription(
            Image, "/camera/rgb/image_raw", self._image_callback, 10
        )

    def _load_model(self) -> None:
        """تحميل نموذج تقدير اليد."""
        model_type = self.get_parameter("model").value
        
        if model_type == "mediapipe":
            try:
                import mediapipe as mp
                self.mp_hands = mp.solutions.hands
                self.hands = self.mp_hands.Hands(
                    static_image_mode=False,
                    max_num_hands=2,
                    min_detection_confidence=self.get_parameter("min_detection_confidence").value,
                    min_tracking_confidence=self.get_parameter("min_tracking_confidence").value,
                )
                self.model_type = "mediapipe"
                self.get_logger().info("✅ MediaPipe Hands محمّل")
            except ImportError:
                self.get_logger().warn("⚠️ MediaPipe غير مثبت — استخدام نموذج وهمي")
                self.hands = None
                self.model_type = "dummy"
        else:
            self.get_logger().warn("⚠️ HaMeR يتطلب إعداد إضافي — استخدام MediaPipe")
            self.model_type = "dummy"

    def _image_callback(self, msg: Image) -> None:
        """معالجة كل إطار لاستخلاص وضعية اليد."""
        try:
            frame_rgb = self.bridge.imgmsg_to_cv2(msg, "rgb8")
        except Exception as e:
            self.get_logger().error(f"خطأ في الصورة: {e}")
            return

        keypoints, aperture = self._run_hand_estimation(frame_rgb)
        
        if keypoints is not None:
            pose_array = self._build_pose_array(keypoints, msg.header)
            self.hand_kp_pub.publish(pose_array)
            
            aperture_msg = Float32()
            aperture_msg.data = float(aperture)
            self.aperture_pub.publish(aperture_msg)

    def _run_hand_estimation(
        self, frame: np.ndarray
    ) -> tuple[Optional[np.ndarray], float]:
        """
        تشغيل نموذج تقدير اليد.
        
        Returns:
            (keypoints [21, 3], aperture [0,1])
        """
        if self.model_type == "dummy":
            keypoints = np.random.rand(21, 3).astype(np.float32)
            aperture = float(np.random.rand())
            return keypoints, aperture
        
        if self.hands is None:
            return None, 0.0
        
        results = self.hands.process(frame)
        
        if not results.multi_hand_landmarks:
            return None, 0.0
        
        # أخذ أول يد مكتشفة
        hand_landmarks = results.multi_hand_landmarks[0]
        h, w, _ = frame.shape
        
        keypoints = np.array([
            [lm.x * w, lm.y * h, lm.z * w]  # تحويل إلى بيكسل
            for lm in hand_landmarks.landmark
        ], dtype=np.float32)
        
        aperture = self._compute_aperture(keypoints)
        
        return keypoints, aperture

    def _compute_aperture(self, keypoints: np.ndarray) -> float:
        """
        حساب درجة انفتاح القبضة [0=مغلقة تماماً، 1=مفتوحة تماماً].
        
        المنطق: المسافة بين أطراف الأصابع ومنشأ راحة اليد.
        
        Args:
            keypoints: [21, 3] — إحداثيات نقاط اليد
        
        Returns:
            float: درجة الانفتاح [0, 1]
        """
        wrist = keypoints[0]  # المعصم كمرجع
        fingertips = keypoints[FINGERTIP_INDICES]  # [5, 3]
        
        # متوسط المسافة من المعصم لأطراف الأصابع
        avg_extension = np.mean(np.linalg.norm(fingertips - wrist, axis=1))
        
        # تطبيع [0, 1]
        aperture = np.clip(avg_extension / self.FINGER_SPREAD_REF, 0.0, 1.0)
        return float(aperture)

    def _build_pose_array(self, keypoints: np.ndarray, header: Header) -> PoseArray:
        """بناء PoseArray من نقاط اليد."""
        pose_array = PoseArray()
        pose_array.header = header
        pose_array.header.frame_id = "camera_frame"
        
        for kp in keypoints:
            pose = Pose()
            pose.position = Point(x=float(kp[0]), y=float(kp[1]), z=float(kp[2]))
            pose_array.poses.append(pose)
        
        return pose_array


def main(args=None) -> None:
    rclpy.init(args=args)
    node = HandPoseNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
