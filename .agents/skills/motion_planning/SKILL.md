---
name: motion-planning-ros2
description: >
  مهارة التخطيط الحركي الروبوتي باستخدام ROS 2 و MoveIt 2. تشمل إعداد نماذج
  الروبوتات (URDF/SRDF)، حل الحركية العكسية (IK)، توليد مسارات خالية من
  التصادم عبر OMPL وTrajOpt، وتنعيم المسارات. تُفعَّل عند العمل على حزمة
  pose2skill_planner في مشروع Pose2Skill-Robot.
---

# مهارة التخطيط الحركي — ROS 2 + MoveIt 2
# Skill: Robot Retargeting & Motion Planning

## نظرة عامة
هذه المهارة تحوّل الرسم البياني للمهارة إلى مسارات حركية روبوتية آمنة.

```
SkillGraph (G_S)
    ↓
Kinematic Retargeting (EE Pose Goals)
    ↓
Inverse Kinematics (Joint Angles)
    ↓
Collision-Free Path Planning (OMPL)
    ↓
Trajectory Optimization (TrajOpt/B-Spline)
    ↓
Joint Trajectory → Gazebo Simulation
```

---

## إعداد النماذج الروبوتية

### Franka Emika Panda (7-DoF)
```bash
# تثبيت
sudo apt install ros-humble-franka-description ros-humble-franka-bringup

# التحقق من النموذج
ros2 launch franka_description visualize_franka.launch.py
```

```yaml
# configs/franka_panda.yaml
robot:
  name: "franka_panda"
  dof: 7
  urdf_package: "franka_description"
  urdf_file: "robots/panda.urdf.xacro"
  srdf_file: "config/panda.srdf"
  
  joint_names:
    - panda_joint1
    - panda_joint2
    - panda_joint3
    - panda_joint4
    - panda_joint5
    - panda_joint6
    - panda_joint7
  
  end_effector_frame: "panda_hand"
  planning_group: "panda_arm"
  gripper_group: "panda_hand"
  
  workspace:
    x_range: [-0.85, 0.85]
    y_range: [-0.85, 0.85]
    z_range: [0.0, 1.20]
  
  joint_limits:
    max_velocity_rad_s: 2.175
    max_acceleration_rad_s2: 3.75
  
  planning:
    planner_id: "RRTConnectkConfigDefault"
    planning_time: 5.0
    num_planning_attempts: 10
    goal_position_tolerance: 0.001  # 1mm
    goal_orientation_tolerance: 0.01  # ~0.57 deg
```

### Universal Robots UR5e (6-DoF)
```yaml
# configs/ur5e.yaml
robot:
  name: "ur5e"
  dof: 6
  urdf_package: "ur_description"
  urdf_file: "urdf/ur5e.urdf.xacro"
  
  joint_names:
    - shoulder_pan_joint
    - shoulder_lift_joint
    - elbow_joint
    - wrist_1_joint
    - wrist_2_joint
    - wrist_3_joint
  
  end_effector_frame: "tool0"
  planning_group: "ur_manipulator"
  gripper: "robotiq_2f_85"
  
  workspace:
    x_range: [-0.90, 0.90]
    y_range: [-0.90, 0.90]
    z_range: [0.0, 1.30]
```

---

## التعيين الحركي (Kinematic Retargeting)

```python
# src/pose2skill_planner/pose2skill_planner/kinematic_mapper.py
import numpy as np
from scipy.spatial.transform import Rotation
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import PoseStamped

class KinematicMapper(Node):
    """
    تحويل وضعيات الرسم البياني للمهارة إلى أهداف حركية للروبوت.
    Convert Skill Graph poses to robot end-effector goal poses.
    
    المشكلة المحلولة: Human EE ≠ Robot EE في الأبعاد والمرجع الإحداثي.
    Solution: Transform to robot base frame using object pose as reference.
    """
    
    def __init__(self):
        super().__init__("kinematic_mapper_node")
        self.declare_parameter("robot_config", "configs/franka_panda.yaml")
        self.declare_parameter("scale_factor", 1.0)
        
        self._load_robot_config()
        
        # إنشاء publisher لأهداف حركة أداة النهاية
        self.ee_goal_pub = self.create_publisher(
            PoseStamped, "/pose2skill/ee_goal_pose", 10
        )
        
        # الاشتراك في الرسم البياني للمهارة
        from pose2skill_msgs.msg import SkillGraph as SkillGraphMsg
        self.skill_graph_sub = self.create_subscription(
            SkillGraphMsg, "/pose2skill/skill_graph",
            self.on_skill_graph, 10
        )
    
    def retarget_node_to_robot(
        self,
        skill_node_relative_pose: np.ndarray,  # [4,4] EE نسبة للجسم
        object_pose_in_robot_frame: np.ndarray, # [4,4] الجسم في مرجع الروبوت
    ) -> np.ndarray:
        """
        تحويل وضعية EE من الإطار النسبي البشري إلى إطار الروبوت.
        
        المعادلة:
            T_ee_robot = T_object_robot × T_ee_object_human
        
        هذا هو جوهر حل فجوة التجسيد — نتجنب المقارنة المباشرة للمفاصل.
        """
        T_ee_robot = object_pose_in_robot_frame @ skill_node_relative_pose
        return T_ee_robot
    
    def matrix_to_pose_stamped(
        self, T: np.ndarray, frame_id: str = "world"
    ) -> PoseStamped:
        """تحويل مصفوفة التحويل إلى PoseStamped."""
        pose = PoseStamped()
        pose.header.frame_id = frame_id
        pose.header.stamp = self.get_clock().now().to_msg()
        pose.pose.position.x = float(T[0, 3])
        pose.pose.position.y = float(T[1, 3])
        pose.pose.position.z = float(T[2, 3])
        
        rot = Rotation.from_matrix(T[:3, :3])
        q = rot.as_quat()  # [x, y, z, w]
        pose.pose.orientation.x = float(q[0])
        pose.pose.orientation.y = float(q[1])
        pose.pose.orientation.z = float(q[2])
        pose.pose.orientation.w = float(q[3])
        
        return pose
    
    def on_skill_graph(self, msg):
        self.get_logger().info(f"Received skill graph: {msg.task_name}")
        # معالجة الرسم البياني وإرسال الأهداف
```

---

## التخطيط الحركي مع MoveIt 2

```python
# src/pose2skill_planner/pose2skill_planner/motion_planner.py
import rclpy
from rclpy.node import Node
from moveit.planning import MoveItPy
from geometry_msgs.msg import PoseStamped
import numpy as np


class MotionPlannerNode(Node):
    """
    عقدة التخطيط الحركي باستخدام MoveIt 2.
    Motion planning node using MoveIt 2 + OMPL.
    
    Reference:
        Coleman et al. (2014). Reducing the Barrier to Entry of Complex
        Robotic Software. JFR.
    """
    
    def __init__(self):
        super().__init__("motion_planner_node")
        
        # تهيئة MoveIt 2
        self.robot = MoveItPy(node_name="moveit_py")
        self.arm = self.robot.get_planning_component("panda_arm")
        self.gripper = self.robot.get_planning_component("panda_hand")
        
        self.get_logger().info("✅ MoveIt 2 initialized")
    
    def plan_to_pose(self, target_pose: PoseStamped) -> bool:
        """
        التخطيط لوضعية أداة النهاية المحددة.
        Plan trajectory to target end-effector pose.
        
        Returns:
            True إذا نجح التخطيط والتنفيذ، False خلافاً لذلك.
        """
        self.arm.set_start_state_to_current_state()
        self.arm.set_goal_state(
            pose_stamped_msg=target_pose,
            pose_link="panda_hand"
        )
        
        plan_result = self.arm.plan()
        
        if plan_result:
            robot_trajectory = plan_result.trajectory
            self.get_logger().info(
                f"✅ Plan found — {len(robot_trajectory.joint_trajectory.points)} waypoints"
            )
            self.robot.execute(robot_trajectory, controllers=[])
            return True
        else:
            self.get_logger().warn("⚠️ Planning failed — retrying...")
            return False
    
    def open_gripper(self):
        """فتح المقبض / Open gripper."""
        self.gripper.set_start_state_to_current_state()
        self.gripper.set_goal_state(configuration_name="open")
        plan = self.gripper.plan()
        if plan:
            self.robot.execute(plan.trajectory, controllers=[])
    
    def close_gripper(self):
        """إغلاق المقبض / Close gripper."""
        self.gripper.set_start_state_to_current_state()
        self.gripper.set_goal_state(configuration_name="close")
        plan = self.gripper.plan()
        if plan:
            self.robot.execute(plan.trajectory, controllers=[])
    
    def execute_skill_graph(self, skill_graph) -> dict:
        """
        تنفيذ الرسم البياني للمهارة بالكامل.
        Execute complete skill graph node by node.
        
        Returns:
            dict: نتائج التنفيذ (Success Rate, timing, etc.)
        """
        results = {"success": True, "executed_nodes": [], "failed_node": None}
        
        for node in skill_graph.nodes:
            self.get_logger().info(f"Executing: {node.label}")
            
            # تحديث حالة المقبض
            if node.gripper_state > 0.5:
                self.close_gripper()
            else:
                self.open_gripper()
            
            # التخطيط والتنفيذ
            success = self.plan_to_pose(node.target_pose)
            results["executed_nodes"].append({
                "label": node.label,
                "success": success
            })
            
            if not success:
                results["success"] = False
                results["failed_node"] = node.label
                break
        
        return results
```

---

## تنعيم المسارات (Trajectory Smoothing)

```python
# src/pose2skill_planner/pose2skill_planner/trajectory_optimizer.py
import numpy as np
from scipy.interpolate import splprep, splev


class TrajectoryOptimizer:
    """
    تحسين وتنعيم المسارات الحركية لتقليل الاهتزاز (Jerk).
    Trajectory optimization to minimize kinematic jerk.
    """
    
    def smooth_trajectory_bspline(
        self,
        waypoints: np.ndarray,  # [N, DoF]
        num_output_points: int = 200,
        smoothing_factor: float = 0.1
    ) -> np.ndarray:
        """
        تنعيم المسار باستخدام B-Spline.
        
        Args:
            waypoints: نقاط المسار الأصلية [N, DoF]
            num_output_points: عدد النقاط في المسار الناعم
            smoothing_factor: معامل التنعيم (0 = interpolation, 1 = max smoothing)
        
        Returns:
            np.ndarray: المسار الناعم [num_output_points, DoF]
        """
        dof = waypoints.shape[1]
        t = np.linspace(0, 1, len(waypoints))
        
        tck, _ = splprep(waypoints.T, u=t, s=smoothing_factor * len(waypoints))
        t_smooth = np.linspace(0, 1, num_output_points)
        smooth_points = np.array(splev(t_smooth, tck)).T  # [N_smooth, DoF]
        
        return smooth_points
    
    def compute_jerk(self, trajectory: np.ndarray, dt: float = 0.05) -> float:
        """
        حساب معامل الاهتزاز (Jerk) للمسار.
        Compute the kinematic jerk metric.
        
        Jerk = ∫ (d³q/dt³)² dt
        """
        vel = np.gradient(trajectory, dt, axis=0)
        acc = np.gradient(vel, dt, axis=0)
        jerk = np.gradient(acc, dt, axis=0)
        return float(np.sum(jerk ** 2) * dt)
```

---

## أوامر التشغيل
```bash
# تشغيل MoveIt 2 مع Franka في Gazebo
ros2 launch pose2skill_planner franka_moveit_sim.launch.py

# تشغيل MoveIt 2 مع UR5e في Gazebo
ros2 launch pose2skill_planner ur5e_moveit_sim.launch.py

# اختبار التخطيط مباشرة
ros2 run pose2skill_planner motion_planner_node

# استدعاء service التنفيذ
ros2 service call /pose2skill/execute_task std_srvs/srv/SetBool '{data: true}'
```

## المراجع
- Chitta et al. (2012). MoveIt! IEEE RAM.
- Lum et al. (2025). Human2Sim2Robot. CoRL 2025.
