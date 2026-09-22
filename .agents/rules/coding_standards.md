# Coding Standards — Pose2Skill-Robot
# معايير الكود البرمجي

## 1. Python Standards
### متطلبات أساسية
- Python version: **3.10+**
- Style guide: **PEP 8** (enforced via `black` formatter + `flake8` linter)
- Type hints: **إلزامية** في كل الدوال
- Docstrings: **Google style** (إلزامية لكل class وfunction)

### أدوات الجودة (Linting & Formatting)
```bash
# تثبيت أدوات الجودة
pip install black flake8 mypy isort pytest

# تطبيق التنسيق
black src/ tests/

# فحص الأنواع
mypy src/

# فرز الاستيرادات
isort src/ tests/
```

### قواعد التسمية (Naming Conventions)
```python
# ✅ صحيح
class BodyPoseEstimator:          # PascalCase للكلاسات
    def extract_keypoints(self):  # snake_case للدوال
        pass

PERCEPTION_RATE_HZ = 25          # UPPER_SNAKE للثوابت
body_keypoints_topic = "/pose2skill/body_keypoints"  # snake_case للمتغيرات

# ❌ خاطئ
class bodyPoseEstimator:           # camelCase ممنوع للكلاسات
    def ExtractKeypoints(self):    # PascalCase ممنوع للدوال
```

### هيكل ملف Python النموذجي
```python
#!/usr/bin/env python3
"""
وصف الوحدة / Module Description.

This module implements the body pose estimation node for Pose2Skill-Robot.
يتضمن هذا الملف عقدة ROS 2 لتقدير وضعية جسم الإنسان.

References:
    RTMPose: https://github.com/open-mmlab/mmpose
    Jiang et al. (2023). RTMPose: Real-Time Multi-Person Pose Estimation.
"""

from __future__ import annotations

# Standard library
import time
from pathlib import Path
from typing import Optional

# Third-party
import cv2
import numpy as np
import rclpy
from rclpy.node import Node

# Local
from pose2skill_perception.utils.helpers import normalize_keypoints

# Constants
NODE_NAME = "body_pose_node"
DEFAULT_MODEL = "rtmpose-l_8xb32-270e_coco-wholebody-384x288"


class BodyPoseNode(Node):
    """
    عقدة ROS 2 لتقدير وضعية جسم الإنسان ثلاثية الأبعاد.
    ROS 2 node for 3D human body pose estimation.

    Subscribes:
        /camera/rgb/image_raw (sensor_msgs/Image)

    Publishes:
        /pose2skill/body_keypoints (geometry_msgs/PoseArray)
    """

    def __init__(self) -> None:
        super().__init__(NODE_NAME)
        self._setup_parameters()
        self._setup_publishers()
        self._setup_subscribers()
        self._load_model()
        self.get_logger().info("BodyPoseNode initialized ✅")

    def _setup_parameters(self) -> None:
        """تهيئة معاملات العقدة / Initialize node parameters."""
        self.declare_parameter("model_name", DEFAULT_MODEL)
        self.declare_parameter("device", "cuda:0")
        self.declare_parameter("confidence_threshold", 0.3)

    def _setup_publishers(self) -> None:
        """تهيئة ناشري ROS 2 / Initialize ROS 2 publishers."""
        from geometry_msgs.msg import PoseArray
        self.keypoints_pub = self.create_publisher(
            PoseArray, "/pose2skill/body_keypoints", 10
        )

    def _setup_subscribers(self) -> None:
        """تهيئة المشتركين / Initialize subscribers."""
        from sensor_msgs.msg import Image
        self.image_sub = self.create_subscription(
            Image, "/camera/rgb/image_raw", self._image_callback, 10
        )

    def _load_model(self) -> None:
        """تحميل نموذج RTMPose / Load RTMPose model."""
        model_name = self.get_parameter("model_name").value
        # Model loading logic here
        self.get_logger().info(f"Model loaded: {model_name}")

    def _image_callback(self, msg) -> None:
        """معالجة إطار الفيديو / Process video frame."""
        raise NotImplementedError("Implement in subclass")
```

## 2. ROS 2 Node Standards
### قواعد Topics
```
/pose2skill/<data_type>          ← الموضوعات الرئيسية
/pose2skill/debug/<data_type>    ← موضوعات التصحيح
/pose2skill/metrics/<metric>     ← موضوعات المقاييس
```

### قواعد Parameters
```yaml
# config/params.yaml — كل عقدة لها ملف parameters خاص
body_pose_node:
  ros__parameters:
    model_name: "rtmpose-l_8xb32-270e_coco-wholebody-384x288"
    device: "cuda:0"
    confidence_threshold: 0.3
    publish_rate_hz: 25
    input_topic: "/camera/rgb/image_raw"
    output_topic: "/pose2skill/body_keypoints"
```

### هيكل Launch File
```python
# launch/perception.launch.py
from launch import LaunchDescription
from launch_ros.actions import Node

def generate_launch_description():
    return LaunchDescription([
        Node(
            package="pose2skill_perception",
            executable="body_pose_node",
            name="body_pose_node",
            parameters=["config/params.yaml"],
            output="screen",
        )
    ])
```

## 3. Custom Message Types (pose2skill_msgs)
```
msg/
├── ObjectPose.msg        ← 6D pose + semantic label for one object
├── ObjectPoseArray.msg   ← Array of ObjectPose
├── ActionSegment.msg     ← Action label + timestamps + confidence
├── SkillNode.msg         ← Single node in the skill graph
├── SkillEdge.msg         ← Edge between two skill nodes
├── SkillGraph.msg        ← Complete skill graph
└── TaskMetrics.msg       ← Performance metrics per trial
```

### مثال ObjectPose.msg
```
# ObjectPose.msg
std_msgs/Header header
string object_id          # معرف الجسم (مثال: "cup_01")
string semantic_class     # التصنيف الدلالي (مثال: "cup", "bottle")
geometry_msgs/Pose pose   # 6D pose في الفضاء الديكارتي
float32 confidence        # درجة ثقة الكشف [0, 1]
```

## 4. Testing Standards
```python
# tests/unit/test_skill_graph.py
import pytest
from pose2skill_core.skill_graph_builder import SkillGraphBuilder

class TestSkillGraphBuilder:
    """اختبارات وحدة لبناء الرسم البياني للمهارة."""

    @pytest.fixture
    def builder(self):
        return SkillGraphBuilder(config={"threshold": 0.5})

    def test_empty_sequence_raises(self, builder):
        with pytest.raises(ValueError, match="empty"):
            builder.build([])

    def test_pick_place_generates_7_nodes(self, builder, sample_demo):
        graph = builder.build(sample_demo)
        assert len(graph.nodes) == 7  # Approach→Reach→Grasp→Lift→Transport→Place→Release

    def test_graph_has_valid_transitions(self, builder, sample_demo):
        graph = builder.build(sample_demo)
        for edge in graph.edges:
            assert edge.from_node < edge.to_node  # تسلسل منطقي
```

### أوامر التشغيل
```bash
# تشغيل جميع الاختبارات
cd src && python -m pytest tests/ -v --tb=short

# تشغيل اختبار محدد
python -m pytest tests/unit/test_skill_graph.py::TestSkillGraphBuilder -v

# تغطية الكود
python -m pytest tests/ --cov=pose2skill_core --cov-report=html
```

## 5. Configuration Files (YAML)
```yaml
# configs/pipeline_config.yaml
pipeline:
  version: "1.0"
  
  perception:
    body_pose:
      model: "rtmpose-l"
      device: "cuda:0"
      fps_target: 25
    hand_pose:
      model: "hamer"
      device: "cuda:0"
    object_tracking:
      detector: "yolo-world-l"
      tracker: "bytetrack"
      pose_estimator: "foundationpose"
  
  skill_extraction:
    model: "st_gcn"
    checkpoint: "models/st_gcn/checkpoint_best.pth"
    action_classes:
      - "Approach"
      - "Reach"
      - "Grasp"
      - "Lift"
      - "Transport"
      - "Place"
      - "Release"
    confidence_threshold: 0.7
  
  motion_planning:
    robot: "franka_panda"  # or "ur5e"
    planner: "RRTConnect"
    planning_time: 5.0
    ik_solver: "bio_ik"
    smoothing: "b_spline"
  
  simulation:
    backend: "gazebo"  # or "isaac_sim"
    world_file: "configs/worlds/tabletop.world"
```

## 6. Error Handling
```python
# استخدام custom exceptions
class Pose2SkillError(Exception):
    """Base exception for Pose2Skill-Robot."""

class PerceptionError(Pose2SkillError):
    """Raised when perception pipeline fails."""

class SkillGraphError(Pose2SkillError):
    """Raised when skill graph construction fails."""

class PlanningError(Pose2SkillError):
    """Raised when motion planning fails."""

# في الكود
try:
    graph = builder.build(demo_sequence)
except SkillGraphError as e:
    self.get_logger().error(f"Skill graph build failed: {e}")
    raise
```

## 7. Logging Standards
```python
# استخدام ROS 2 logger لعقد ROS 2
self.get_logger().info("Pipeline started ✅")
self.get_logger().warn("Low confidence detection: 0.25")
self.get_logger().error("IK solution not found for target pose")
self.get_logger().debug(f"Keypoints: {keypoints.shape}")

# استخدام Python logging للوحدات المستقلة
import logging
logger = logging.getLogger(__name__)
logger.info("Skill graph built with %d nodes", len(graph.nodes))
```
