---
name: ros2-integration
description: >
  مهارة تكامل حزم ROS 2 وإعداد بيئة Gazebo للمحاكاة الروبوتية. تشمل إعداد
  Launch files، إدارة TF، تهيئة Gazebo مع Franka وUR5e، وربط ROSbridge مع
  الواجهة الرسومية. تُفعَّل عند العمل على التكامل بين مكونات النظام.
---

# مهارة تكامل ROS 2 والمحاكاة
# Skill: ROS 2 Integration & Gazebo Simulation

## نظرة عامة
هذه المهارة تضمن تشغيل النظام الكامل معاً داخل بيئة المحاكاة.

---

## إعداد بيئة Gazebo مع Franka Panda

### مشهد Gazebo الأساسي
```xml
<!-- configs/worlds/tabletop.world -->
<?xml version="1.0" ?>
<sdf version="1.9">
  <world name="tabletop_manipulation">
    
    <!-- إضاءة -->
    <light type="directional" name="sun">
      <cast_shadows>true</cast_shadows>
      <pose>0 0 10 0 0 0</pose>
      <diffuse>0.8 0.8 0.8 1</diffuse>
    </light>
    
    <!-- الأرضية -->
    <model name="ground_plane">
      <static>true</static>
      <link name="link">
        <collision name="surface">
          <geometry><plane><normal>0 0 1</normal></plane></geometry>
        </collision>
        <visual name="visual">
          <geometry><plane><normal>0 0 1</normal><size>20 20</size></plane></geometry>
          <material><ambient>0.8 0.8 0.8 1</ambient></material>
        </visual>
      </link>
    </model>
    
    <!-- الطاولة -->
    <model name="table">
      <static>true</static>
      <pose>0.5 0 0.375 0 0 0</pose>
      <link name="link">
        <collision name="surface">
          <geometry><box><size>1.0 0.8 0.75</size></box></geometry>
        </collision>
        <visual name="visual">
          <geometry><box><size>1.0 0.8 0.75</size></box></geometry>
          <material><ambient>0.6 0.4 0.2 1</ambient></material>
        </visual>
      </link>
    </model>
    
    <!-- الجسم الأول: كأس -->
    <model name="cup">
      <pose>0.5 0.0 0.8 0 0 0</pose>
      <link name="link">
        <inertial><mass>0.1</mass></inertial>
        <collision name="col">
          <geometry><cylinder><radius>0.04</radius><length>0.12</length></cylinder></geometry>
        </collision>
        <visual name="vis">
          <geometry><cylinder><radius>0.04</radius><length>0.12</length></cylinder></geometry>
          <material><ambient>0.2 0.5 0.9 1</ambient></material>
        </visual>
      </link>
    </model>
    
  </world>
</sdf>
```

### Launch File الكامل للنظام
```python
# launch/full_pipeline.launch.py
import os
from launch import LaunchDescription
from launch.actions import (
    DeclareLaunchArgument, IncludeLaunchDescription,
    ExecuteProcess, TimerAction
)
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    # Arguments
    robot_arg = DeclareLaunchArgument(
        "robot", default_value="franka_panda",
        choices=["franka_panda", "ur5e"],
        description="Robot model to use"
    )
    use_sim_time_arg = DeclareLaunchArgument(
        "use_sim_time", default_value="true"
    )
    
    robot = LaunchConfiguration("robot")
    use_sim_time = LaunchConfiguration("use_sim_time")
    
    # Gazebo
    gazebo = ExecuteProcess(
        cmd=["gz", "sim", "-r", "configs/worlds/tabletop.world"],
        output="screen"
    )
    
    # Robot spawner (delayed 3s for Gazebo to start)
    spawn_robot = TimerAction(
        period=3.0,
        actions=[
            Node(
                package="ros_gz_sim",
                executable="create",
                arguments=[
                    "-name", "robot",
                    "-topic", "/robot_description"
                ],
            )
        ]
    )
    
    # Perception nodes
    body_pose = Node(
        package="pose2skill_perception",
        executable="body_pose_node",
        name="body_pose_node",
        parameters=[
            {"use_sim_time": use_sim_time},
            "src/pose2skill_perception/config/params.yaml"
        ],
        output="screen",
    )
    
    hand_pose = Node(
        package="pose2skill_perception",
        executable="hand_pose_node",
        name="hand_pose_node",
        parameters=[{"use_sim_time": use_sim_time}],
        output="screen",
    )
    
    object_tracker = Node(
        package="pose2skill_perception",
        executable="object_tracker_node",
        name="object_tracker_node",
        parameters=[{"use_sim_time": use_sim_time}],
        output="screen",
    )
    
    # Skill extraction nodes
    segmenter = Node(
        package="pose2skill_core",
        executable="temporal_segmentation_node",
        name="temporal_segmentation_node",
        parameters=[
            {"model_path": "models/st_gcn/checkpoint_best.pth"},
            {"use_sim_time": use_sim_time},
        ],
        output="screen",
    )
    
    skill_builder = Node(
        package="pose2skill_core",
        executable="skill_graph_node",
        name="skill_graph_node",
        parameters=[{"use_sim_time": use_sim_time}],
        output="screen",
    )
    
    # Motion planning nodes
    retargeter = Node(
        package="pose2skill_planner",
        executable="kinematic_mapper_node",
        name="kinematic_mapper_node",
        parameters=[
            {"robot_config": f"configs/{robot}.yaml"},
            {"use_sim_time": use_sim_time},
        ],
        output="screen",
    )
    
    planner = Node(
        package="pose2skill_planner",
        executable="motion_planner_node",
        name="motion_planner_node",
        parameters=[{"use_sim_time": use_sim_time}],
        output="screen",
    )
    
    # ROSbridge for web dashboard
    rosbridge = Node(
        package="rosbridge_server",
        executable="rosbridge_websocket",
        name="rosbridge_websocket",
        parameters=[{"port": 9090}],
        output="screen",
    )
    
    # Evaluation logger
    evaluator = Node(
        package="pose2skill_sim",
        executable="evaluation_node",
        name="evaluation_node",
        parameters=[
            {"log_dir": "experiments/logs/"},
            {"use_sim_time": use_sim_time},
        ],
        output="screen",
    )
    
    return LaunchDescription([
        robot_arg,
        use_sim_time_arg,
        gazebo,
        spawn_robot,
        body_pose,
        hand_pose,
        object_tracker,
        segmenter,
        skill_builder,
        retargeter,
        planner,
        rosbridge,
        evaluator,
    ])
```

---

## جسر Gazebo — ROS 2
```python
# src/pose2skill_sim/pose2skill_sim/gazebo_bridge.py
import rclpy
from rclpy.node import Node
from trajectory_msgs.msg import JointTrajectory
from std_msgs.msg import Bool
import subprocess
import json


class GazeboBridgeNode(Node):
    """
    جسر بين نظام التخطيط الحركي وبيئة Gazebo.
    Bridge between motion planning system and Gazebo simulation.
    """
    
    def __init__(self):
        super().__init__("gazebo_bridge_node")
        
        # استقبال المسارات الحركية
        self.traj_sub = self.create_subscription(
            JointTrajectory,
            "/pose2skill/joint_trajectory",
            self.execute_trajectory,
            10
        )
        
        # نشر حالة التنفيذ
        self.status_pub = self.create_publisher(Bool, "/pose2skill/execution_done", 10)
        
        # نشر إحداثيات الأجسام في المحاكاة
        self.object_pose_timer = self.create_timer(0.04, self.query_object_poses)
        
        self.get_logger().info("✅ Gazebo bridge ready")
    
    def execute_trajectory(self, msg: JointTrajectory):
        """إرسال المسار الحركي إلى Gazebo عبر ROS 2 control."""
        self.get_logger().info(
            f"Executing trajectory with {len(msg.points)} waypoints"
        )
        # يتم التنفيذ تلقائياً عبر ros2_control في Gazebo
    
    def reset_simulation(self):
        """إعادة تهيئة بيئة المحاكاة."""
        subprocess.run(["ros2", "service", "call",
                       "/reset_simulation", "std_srvs/srv/Empty"])
        self.get_logger().info("Simulation reset ✅")
    
    def query_object_poses(self):
        """استعلام عن وضعيات الأجسام في المحاكي."""
        pass  # يتم عبر gz topic أو joint_state_publisher
```

---

## أوامر التشغيل السريعة
```bash
# 1. بناء مساحة العمل
cd ~/pose2skill_ws && colcon build --symlink-install
source install/setup.bash

# 2. تشغيل النظام الكامل مع Franka
ros2 launch pose2skill_sim full_pipeline.launch.py robot:=franka_panda

# 3. تشغيل مع UR5e
ros2 launch pose2skill_sim full_pipeline.launch.py robot:=ur5e

# 4. مراقبة Topics
ros2 topic list | grep pose2skill
ros2 topic echo /pose2skill/skill_graph --once

# 5. بدء تجربة
ros2 service call /pose2skill/start_recording std_srvs/srv/Trigger

# 6. تنفيذ المهمة
ros2 service call /pose2skill/execute_task std_srvs/srv/SetBool '{data: true}'

# 7. قراءة المقاييس
ros2 topic echo /pose2skill/metrics
```

## استكشاف الأخطاء
| المشكلة | الحل |
|---------|------|
| Gazebo لا يفتح | `export GZ_SIM_RESOURCE_PATH=$GZ_SIM_RESOURCE_PATH:~/pose2skill_ws/install` |
| Robot لا يظهر | تحقق من `robot_description` topic |
| MoveIt لا يتصل | `ros2 doctor --report` لفحص حالة ROS 2 |
| ROSbridge error | `ros2 run rosbridge_server rosbridge_websocket` يدوياً |
