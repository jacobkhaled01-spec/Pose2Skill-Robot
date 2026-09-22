# ROS 2 Conventions — Pose2Skill-Robot
# اتفاقيات واعراف ROS 2 للمشروع

## 1. إعداد البيئة (Environment Setup)
```bash
# المتطلبات الأساسية
# OS: Ubuntu 22.04 LTS
# ROS 2: Humble Hawksbill

# تثبيت ROS 2 Humble
sudo apt install ros-humble-desktop
echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc

# تثبيت MoveIt 2
sudo apt install ros-humble-moveit

# تثبيت Gazebo Harmonic
sudo apt install gz-harmonic

# تثبيت حزم Franka و UR
sudo apt install ros-humble-franka-description
sudo apt install ros-humble-ur-description

# بناء مساحة العمل
cd ~/pose2skill_ws
colcon build --symlink-install
source install/setup.bash
```

## 2. هيكل مساحة عمل ROS 2
```
~/pose2skill_ws/
├── src/
│   ├── pose2skill_msgs/          ← Custom message types
│   ├── pose2skill_perception/    ← Vision & perception nodes
│   ├── pose2skill_core/          ← Skill extraction nodes
│   ├── pose2skill_planner/       ← Motion planning nodes
│   └── pose2skill_sim/           ← Simulation & evaluation nodes
├── build/                        ← Auto-generated (don't commit)
├── install/                      ← Auto-generated (don't commit)
└── log/                          ← Auto-generated (don't commit)
```

## 3. اتفاقيات التسمية في ROS 2
### Topics
```
/pose2skill/<category>/<data>

# أمثلة:
/pose2skill/body_keypoints          ← geometry_msgs/PoseArray
/pose2skill/hand_keypoints          ← geometry_msgs/PoseArray
/pose2skill/object_poses            ← pose2skill_msgs/ObjectPoseArray
/pose2skill/action_segment          ← pose2skill_msgs/ActionSegment
/pose2skill/skill_graph             ← pose2skill_msgs/SkillGraph
/pose2skill/joint_trajectory        ← trajectory_msgs/JointTrajectory
/pose2skill/execution_status        ← std_msgs/String
/pose2skill/metrics                 ← pose2skill_msgs/TaskMetrics

# Debug topics (لا تُستخدم في الإنتاج)
/pose2skill/debug/skeleton_image    ← sensor_msgs/Image
/pose2skill/debug/object_bbox       ← visualization_msgs/MarkerArray
```

### Services
```
/pose2skill/start_recording         ← std_srvs/Trigger
/pose2skill/stop_recording          ← std_srvs/Trigger
/pose2skill/build_skill_graph       ← std_srvs/Trigger
/pose2skill/execute_task            ← std_srvs/SetBool
/pose2skill/reset_simulation        ← std_srvs/Trigger
/pose2skill/get_metrics             ← std_srvs/Trigger
```

### Actions (للعمليات الطويلة)
```
/pose2skill/plan_and_execute        ← pose2skill_msgs/action/PlanAndExecute
/pose2skill/run_benchmark           ← pose2skill_msgs/action/RunBenchmark
```

## 4. package.xml القياسي
```xml
<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" ...?>
<package format="3">
  <name>pose2skill_perception</name>
  <version>1.0.0</version>
  <description>
    3D Perception pipeline for Pose2Skill-Robot.
    طبقة الإدراك ثلاثية الأبعاد لنظام Pose2Skill-Robot.
  </description>
  <maintainer email="team@pose2skill.ai">Pose2Skill Team</maintainer>
  <license>MIT</license>

  <depend>rclpy</depend>
  <depend>std_msgs</depend>
  <depend>sensor_msgs</depend>
  <depend>geometry_msgs</depend>
  <depend>pose2skill_msgs</depend>

  <test_depend>pytest</test_depend>

  <export>
    <build_type>ament_python</build_type>
  </export>
</package>
```

## 5. setup.py القياسي
```python
from setuptools import setup, find_packages
import os
from glob import glob

package_name = "pose2skill_perception"

setup(
    name=package_name,
    version="1.0.0",
    packages=find_packages(exclude=["test"]),
    data_files=[
        ("share/ament_index/resource_index/packages",
         [f"resource/{package_name}"]),
        (f"share/{package_name}", ["package.xml"]),
        (os.path.join("share", package_name, "launch"),
         glob("launch/*.launch.py")),
        (os.path.join("share", package_name, "config"),
         glob("config/*.yaml")),
    ],
    install_requires=["setuptools"],
    zip_safe=True,
    maintainer="Pose2Skill Team",
    maintainer_email="team@pose2skill.ai",
    description="3D Perception pipeline for Pose2Skill-Robot",
    license="MIT",
    tests_require=["pytest"],
    entry_points={
        "console_scripts": [
            "body_pose_node = pose2skill_perception.body_pose_node:main",
            "hand_pose_node = pose2skill_perception.hand_pose_node:main",
            "object_tracker_node = pose2skill_perception.object_tracker_node:main",
        ],
    },
)
```

## 6. أوامر بناء وتشغيل المشروع
```bash
# بناء جميع الحزم
cd ~/pose2skill_ws
colcon build --symlink-install

# بناء حزمة محددة
colcon build --packages-select pose2skill_perception

# تشغيل عقدة مفردة
ros2 run pose2skill_perception body_pose_node

# تشغيل عبر launch file
ros2 launch pose2skill_perception perception.launch.py

# تشغيل النظام الكامل
ros2 launch pose2skill_sim full_pipeline.launch.py robot:=franka_panda

# مراقبة الـ Topics
ros2 topic list
ros2 topic echo /pose2skill/skill_graph
ros2 topic hz /pose2skill/body_keypoints

# تشغيل الاختبارات
colcon test --packages-select pose2skill_core
colcon test-result --verbose
```

## 7. إعدادات Launch Files الرئيسية
```python
# launch/full_pipeline.launch.py
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():
    robot_arg = DeclareLaunchArgument(
        "robot",
        default_value="franka_panda",
        description="Robot model: franka_panda or ur5e"
    )
    
    return LaunchDescription([
        robot_arg,
        
        # Perception
        Node(package="pose2skill_perception",
             executable="body_pose_node", name="body_pose"),
        Node(package="pose2skill_perception",
             executable="hand_pose_node", name="hand_pose"),
        Node(package="pose2skill_perception",
             executable="object_tracker_node", name="object_tracker"),
        
        # Skill Extraction
        Node(package="pose2skill_core",
             executable="temporal_segmentation_node", name="segmenter"),
        Node(package="pose2skill_core",
             executable="skill_graph_node", name="skill_builder"),
        
        # Motion Planning
        Node(package="pose2skill_planner",
             executable="kinematic_mapper_node", name="retargeter"),
        Node(package="pose2skill_planner",
             executable="motion_planner_node", name="planner"),
        
        # Simulation
        Node(package="pose2skill_sim",
             executable="gazebo_bridge_node", name="sim_bridge"),
    ])
```

## 8. TF Frames اتفاقيات
```
world                 ← الإطار العالمي للمحاكاة
  └── robot_base      ← قاعدة ذراع الروبوت
        └── panda_link0 → ... → panda_hand  (Franka)
        └── base → ... → tool0             (UR5e)
  └── camera_frame    ← إطار الكاميرا
  └── object_<id>     ← إطار كل جسم مرصود
```

## 9. ROSbridge للـ Web Dashboard
```bash
# تثبيت rosbridge
sudo apt install ros-humble-rosbridge-suite

# تشغيل WebSocket server
ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090

# في JavaScript (dashboard)
const ros = new ROSLIB.Ros({ url: 'ws://localhost:9090' });
const skillGraphTopic = new ROSLIB.Topic({
  ros: ros,
  name: '/pose2skill/skill_graph',
  messageType: 'pose2skill_msgs/SkillGraph'
});
```
