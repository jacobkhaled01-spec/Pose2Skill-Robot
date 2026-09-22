---
name: pose-estimation-3d
description: >
  مهارة تطوير واختبار خط معالجة تقدير الوضعية ثلاثي الأبعاد للجسم البشري واليدين
  والأجسام. تشمل استخدام RTMPose لوضعية الجسم، HaMeR لوضعية اليد، YOLO-World
  لكشف الأجسام، وFoundationPose لتقدير الوضعية السداسية. تُفعَّل عند الحاجة
  لتطوير أي جزء من طبقة الإدراك في مشروع Pose2Skill-Robot.
---

# مهارة تقدير الوضعية ثلاثية الأبعاد
# Skill: 3D Pose Estimation Pipeline

## نظرة عامة (Overview)
هذه المهارة تُرشدك لبناء واختبار طبقة الإدراك الكاملة في مشروع Pose2Skill-Robot.

**المدخلات**: فيديو RGB أو RGB-D (كاميرا عادية أو RealSense)  
**المخرجات**: تدفقات إحداثيات متزامنة لـ:
- مفاصل الجسم (17+ نقطة ثلاثية الأبعاد)
- مفاصل اليد (21 نقطة + حالة الإغلاق)
- وضعيات الأجسام (6D pose: موقع + اتجاه)

---

## المكونات والنماذج

### 1. تقدير وضعية الجسم — RTMPose
```bash
# تثبيت
pip install openmim
mim install mmengine mmcv mmdet mmpose

# نموذج موصى به (توازن السرعة والدقة)
# RTMPose-l: دقة عالية، 25+ FPS على RTX 3060
# RTMPose-s: أسرع، مناسب للأجهزة الضعيفة
```

```python
from mmpose.apis import MMPoseInferencer

# تهيئة النموذج
inferencer = MMPoseInferencer(
    pose3d="human3d",           # نموذج ثلاثي الأبعاد
    pose3d_weights=None,        # يحمل الأوزان تلقائياً
    device="cuda:0"
)

# استخلاص الـ keypoints من إطار
result = inferencer(frame, show=False)
keypoints_3d = result["predictions"][0]["keypoints"]  # shape: (17, 3)
```

### 2. تقدير وضعية اليد — HaMeR
```bash
# تثبيت
git clone https://github.com/geopavlakos/hamer.git
cd hamer && pip install -e ".[all]"

# تحميل الأوزان
bash fetch_demo_data.sh
```

```python
from hamer.models import HAMER
from hamer.utils import recursive_to
from vitpose_model import ViTPoseModel

# تهيئة
hamer_model, model_cfg = HAMER.load("_DATA/hamer_ckpts/checkpoints/hamer.ckpt")
detector = ViTPoseModel(device)

# استخلاص mesh اليد
hands = detector.detect(image)
hamer_out = hamer_model(hands)
hand_joints = hamer_out["pred_keypoints_3d"]  # shape: (21, 3)
hand_aperture = compute_aperture(hand_joints)  # [0=open, 1=closed]
```

### 3. كشف وتتبع الأجسام — YOLO-World + ByteTrack
```bash
pip install ultralytics supervision
```

```python
from ultralytics import YOLO
import supervision as sv

# نموذج YOLO-World (open-vocabulary detection)
model = YOLO("yolov8l-worldv2.pt")
model.set_classes(["cup", "bottle", "block", "screwdriver"])

# ByteTrack للتتبع المستمر
tracker = sv.ByteTrack()

def track_objects(frame):
    results = model(frame)[0]
    detections = sv.Detections.from_ultralytics(results)
    tracked = tracker.update_with_detections(detections)
    return tracked  # كل كائن له ID ثابت
```

### 4. تقدير الوضعية السداسية — FoundationPose
```bash
# متطلبات: CUDA 11.8+, cuDNN 8+
git clone https://github.com/NVlabs/FoundationPose.git
cd FoundationPose
conda env create -f environment.yml
conda activate foundation_pose
```

```python
from estimater import FoundationPose
import trimesh

# تحميل نموذج الجسم ثلاثي الأبعاد (mesh)
mesh = trimesh.load("models/cup.obj")
estimator = FoundationPose(model_pts=mesh.vertices, model_normals=mesh.vertex_normals)

# تقدير الوضعية السداسية
pose_6d = estimator.register(
    K=camera_intrinsics,       # مصفوفة الكاميرا الداخلية
    rgb=rgb_frame,
    depth=depth_frame,
    ob_mask=object_mask,       # قناع الجسم من YOLO
    iteration=5
)
# pose_6d: مصفوفة 4×4 تمثل التحويل الكامل (R|t)
```

---

## بناء عقدة ROS 2 الكاملة

### body_pose_node.py (هيكل كامل)
```python
#!/usr/bin/env python3
"""
عقدة تقدير وضعية الجسم البشري ثلاثية الأبعاد.
ROS 2 node for 3D human body pose estimation using RTMPose.
"""
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from geometry_msgs.msg import PoseArray, Pose, Point, Quaternion
from cv_bridge import CvBridge
import numpy as np


class BodyPoseNode(Node):
    def __init__(self):
        super().__init__("body_pose_node")
        
        # Parameters
        self.declare_parameter("device", "cuda:0")
        self.declare_parameter("confidence_threshold", 0.3)
        self.declare_parameter("publish_visualization", True)
        
        # ROS 2 I/O
        self.bridge = CvBridge()
        self.pub = self.create_publisher(PoseArray, "/pose2skill/body_keypoints", 10)
        self.sub = self.create_subscription(
            Image, "/camera/rgb/image_raw", self.callback, 10
        )
        
        # Load model
        self._load_model()
        self.get_logger().info("✅ BodyPoseNode ready")
    
    def _load_model(self):
        from mmpose.apis import MMPoseInferencer
        device = self.get_parameter("device").value
        self.inferencer = MMPoseInferencer(pose3d="human3d", device=device)
    
    def callback(self, msg: Image):
        frame = self.bridge.imgmsg_to_cv2(msg, "rgb8")
        result = self.inferencer(frame, show=False)
        
        if not result["predictions"]:
            return
        
        keypoints = result["predictions"][0]["keypoints"]  # (17, 3)
        scores = result["predictions"][0]["keypoint_scores"]  # (17,)
        
        # Build ROS 2 PoseArray
        pose_array = PoseArray()
        pose_array.header = msg.header
        for kp, score in zip(keypoints, scores):
            if score >= self.get_parameter("confidence_threshold").value:
                p = Pose()
                p.position = Point(x=float(kp[0]), y=float(kp[1]), z=float(kp[2]))
                pose_array.poses.append(p)
        
        self.pub.publish(pose_array)


def main():
    rclpy.init()
    node = BodyPoseNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


if __name__ == "__main__":
    main()
```

---

## مقاييس الأداء المستهدفة
| المقياس | الهدف |
|---------|-------|
| Body Pose FPS | ≥ 25 FPS |
| Hand Pose FPS | ≥ 25 FPS |
| Object Detection FPS | ≥ 30 FPS |
| 6D Pose Error (cm) | < 2 cm |
| Hand Aperture Accuracy | ≥ 90% |

## استكشاف الأخطاء (Troubleshooting)
| المشكلة | السبب المحتمل | الحل |
|---------|--------------|------|
| GPU OOM | نموذج كبير جداً | استخدم RTMPose-s بدلاً من RTMPose-l |
| Occlusion failures | احتجاب اليد | فعّل Kalman Filter للتنبؤ بالمسار المفقود |
| Low FPS | معالجة على CPU | تحقق من `device="cuda:0"` |
| Wrong detections | تصنيف غير دقيق | حدد القائمة المستهدفة في YOLO-World |

## المراجع
- Jiang et al. (2023). RTMPose: Real-Time Multi-Person Pose Estimation. arXiv.
- Pavlakos et al. (2024). Reconstructing Hands in 3D with Transformers. CVPR.
- Wen et al. (2023). FoundationPose. arXiv:2312.08344.
