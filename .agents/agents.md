# Pose2Skill-Robot — AI Agents Definition
# تعريف الوكلاء الذكيين للمشروع

## Overview
This file defines the AI agents (sub-roles) used during development of the Pose2Skill-Robot system.
Each agent has a specialized domain, a set of tools it uses, and clear output expectations.

---

## Agent 1: PerceptionAgent 👁️
**Role**: 3D Perception & Computer Vision Lead  
**Owner**: يعقوب خالد محمد علي المهاجري  
**Skill File**: `.agents/skills/pose_estimation/SKILL.md`

### Responsibilities
- Develop and test 3D body pose estimation pipeline (RTMPose/ViTPose)
- Develop and test hand articulation estimation (HaMeR / MediaPipe Hands)
- Develop object detection and 6D pose tracking (YOLO-World + FoundationPose)
- Spatial coordinate alignment and noise filtering
- Output synchronized spatio-temporal streams at ≥ 25 FPS

### Input
- RGB or RGB-D video stream (MP4 / RealSense D435i / webcam)

### Output (ROS 2 Topics)
```
/pose2skill/body_keypoints   [geometry_msgs/PoseArray]   — 17+ body joints
/pose2skill/hand_keypoints   [geometry_msgs/PoseArray]   — 21 hand joints + aperture
/pose2skill/object_poses     [pose2skill_msgs/ObjectPoseArray] — 6D poses of M objects
```

### Key Files
- `src/pose2skill_perception/pose2skill_perception/body_pose_node.py`
- `src/pose2skill_perception/pose2skill_perception/hand_pose_node.py`
- `src/pose2skill_perception/pose2skill_perception/object_tracker_node.py`

### Tools & Models
| Tool | Purpose |
|------|---------|
| RTMPose (MMPose) | Real-time body skeleton extraction |
| HaMeR | 3D hand mesh recovery |
| YOLO-World | Open-vocabulary object detection |
| ByteTrack | Multi-object tracking |
| FoundationPose | 6D object pose estimation |

---

## Agent 2: SkillExtractionAgent 🧠
**Role**: Temporal Modeling & Skill Graph Builder  
**Owner**: العضو الثاني  
**Skill File**: `.agents/skills/skill_graph/SKILL.md`

### Responsibilities
- Train ST-GCN model for temporal action segmentation
- Detect contact events and transition points (Grasp/Release)
- Build the Spatio-Temporal Affordance Skill Graph G_S
- Extract affordance constraints and relative pose conditions

### Input (ROS 2 Subscriptions)
```
/pose2skill/body_keypoints
/pose2skill/hand_keypoints
/pose2skill/object_poses
```

### Output
```
/pose2skill/action_segment   [pose2skill_msgs/ActionSegment]  — current primitive label
/pose2skill/skill_graph      [pose2skill_msgs/SkillGraph]     — full G_S graph
```

### Skill Graph Structure (JSON/YAML)
```yaml
skill_graph:
  task_name: "pick_and_place"
  nodes:
    - id: 0
      label: "Approach"
      sub_goal:
        relative_position: [0.0, 0.0, 0.15]  # 15cm above object
        orientation_constraint: "any"
    - id: 1
      label: "Grasp"
      sub_goal:
        gripper_state: "closed"
        contact_object: "cup"
  edges:
    - from: 0
      to: 1
      condition: "distance(EE, object) < 0.02"
  constraints:
    keep_upright: true
    max_tilt_deg: 15
```

### Key Files
- `src/pose2skill_core/pose2skill_core/temporal_segmentation.py`
- `src/pose2skill_core/pose2skill_core/skill_graph_builder.py`
- `src/pose2skill_core/pose2skill_core/affordance_extractor.py`

---

## Agent 3: MotionPlanningAgent 🦾
**Role**: Robotics & Motion Planning Lead  
**Owner**: العضو الثالث  
**Skill File**: `.agents/skills/motion_planning/SKILL.md`

### Responsibilities
- Configure Franka Panda and UR5e URDF/SRDF models in ROS 2
- Implement kinematic retargeting from Skill Graph to robot EE poses
- Solve Inverse Kinematics (BioIK / KDL / PickIK)
- Generate collision-free trajectories via MoveIt 2 + OMPL/TrajOpt
- Apply trajectory smoothing (B-Spline, TOTG)
- Manage Gazebo simulation environments

### Input
```
/pose2skill/skill_graph  [pose2skill_msgs/SkillGraph]
```

### Output
```
/pose2skill/joint_trajectory  [trajectory_msgs/JointTrajectory]
/pose2skill/execution_status  [std_msgs/String]
```

### Supported Robots
| Robot | DoF | Gripper | Sim Model |
|-------|-----|---------|-----------|
| Franka Emika Panda | 7 | Panda Hand (2-finger) | `franka_description` |
| Universal Robots UR5e | 6 | Robotiq 2F-85 | `ur_description` |

### Key Files
- `src/pose2skill_planner/pose2skill_planner/kinematic_mapper.py`
- `src/pose2skill_planner/pose2skill_planner/motion_planner.py`
- `src/pose2skill_planner/pose2skill_planner/trajectory_optimizer.py`
- `configs/franka_panda.yaml`
- `configs/ur5e.yaml`

---

## Agent 4: IntegrationAgent 🔗
**Role**: Full-Stack Integration, Dashboard & QA  
**Owner**: العضو الرابع  
**Skill File**: `.agents/skills/evaluation/SKILL.md`

### Responsibilities
- Build React + Three.js interactive telemetry dashboard
- Connect all ROS 2 layers via ROSbridge WebSocket server
- Manage Gazebo/Isaac Sim scene setup and task scripting
- Lead benchmark experiments and statistical analysis
- Document all results and generate final academic report

### Dashboard Features
- Live video stream with skeleton overlay
- Interactive 3D Skill Graph visualizer (Three.js)
- Real-time robot state viewer (joint angles, EE pose)
- Performance metrics panel (SR, TCT, Jerk, CETI)
- Experiment control panel (start/stop/reset task)

### Key Files
- `web_dashboard/src/App.jsx`
- `web_dashboard/src/components/SkillGraphViewer.jsx`
- `web_dashboard/src/components/RobotViewer.jsx`
- `web_dashboard/src/components/MetricsPanel.jsx`
- `src/pose2skill_sim/pose2skill_sim/gazebo_bridge.py`

---

## Agent Interaction Flow
```
PerceptionAgent
    │ /body_keypoints, /hand_keypoints, /object_poses
    ▼
SkillExtractionAgent
    │ /skill_graph
    ▼
MotionPlanningAgent
    │ /joint_trajectory
    ▼
IntegrationAgent (Sim + Dashboard)
    │ logs + metrics
    ▼
Evaluation & Academic Report
```

---

## Shared Message Types (`pose2skill_msgs`)
```
ObjectPoseArray.msg  — array of 6D object poses with semantic labels
ActionSegment.msg    — action label + start/end timestamps + confidence
SkillGraph.msg       — full skill graph (nodes, edges, constraints)
TaskMetrics.msg      — SR, TCT, Jerk, CETI values per trial
```
