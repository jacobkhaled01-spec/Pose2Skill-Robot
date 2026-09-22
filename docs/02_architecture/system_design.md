# System Architecture Design Document

## Pose2Skill-Robot — تصميم معمارية النظام

**الإصدار**: 1.0 | **المعيار**: UML 2.5 + C4 Model

---

## 1. نظرة المعمارية العامة (C4 Context Level)

```
┌───────────────────────────────────────────────────────────────┐
│                     System Context                            │
│                                                               │
│   👤 Researcher ──────────────────────────────────────────▶  │
│                                                               │
│   👤 Robot Engineer ────────────────────────────────────────▶ │
│                                                               │
│                    ┌──────────────────────┐                  │
│                    │  Pose2Skill-Robot     │                  │
│                    │  System v1.0          │                  │
│                    └──────────┬───────────┘                  │
│                               │                              │
│                    ┌──────────▼───────────┐                  │
│                    │  Gazebo Harmonic      │                  │
│                    │  Simulation Engine    │                  │
│                    └──────────────────────┘                  │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. معمارية المكونات (C4 Component Level)

```
┌────────────────────────────────────────────────────────────────────┐
│                     Pose2Skill-Robot System                        │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Layer 1: Visual Capture Layer                  │   │
│  │  [RGB Video] ──── [RGB-D Video] ──── [Camera Stream]       │   │
│  └──────────────────────────┬──────────────────────────────────┘   │
│                             │                                      │
│  ┌──────────────────────────▼──────────────────────────────────┐   │
│  │              Layer 2: 3D Perception Layer                   │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐    │   │
│  │  │ BodyPoseNode │ │ HandPoseNode │ │ObjectTrackerNode │    │   │
│  │  │ (RTMPose)    │ │ (MediaPipe/  │ │(YOLO-World +     │    │   │
│  │  │              │ │  HaMeR)      │ │ FoundationPose)   │    │   │
│  │  └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘    │   │
│  └─────────┼────────────────┼──────────────────┼──────────────┘   │
│            │ /body_keypoints │ /hand_keypoints  │ /object_poses    │
│  ┌─────────▼────────────────▼──────────────────▼──────────────┐   │
│  │              Layer 3: Temporal Modeling Layer               │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │         Spatio-Temporal Feature Fusion               │   │   │
│  │  └────────────────────────┬────────────────────────────┘   │   │
│  │  ┌─────────────────────────▼───────────────────────────┐   │   │
│  │  │    ST-GCN Temporal Segmentation (7 Action Classes)  │   │   │
│  │  └──────────────────────┬──────────────────────────────┘   │   │
│  │  ┌───────────────────────▼─────────────────────────────┐   │   │
│  │  │         Contact & Transition Point Detector          │   │   │
│  │  └──────────────────────┬──────────────────────────────┘   │   │
│  └────────────────────────┼──────────────────────────────────┘   │
│                           │ /action_segment                       │
│  ┌────────────────────────▼──────────────────────────────────┐   │
│  │       Layer 4: Embodiment-Agnostic Skill Graph Layer       │   │
│  │  ┌───────────────────────────────────────────────────┐    │   │
│  │  │  G_S = ⟨V_S, E_S, C_S⟩                           │    │   │
│  │  │  Nodes: {Approach, Reach, Grasp, Lift,            │    │   │
│  │  │           Transport, Place, Release}               │    │   │
│  │  │  Edges: Temporal conditions + Pre/Post conditions  │    │   │
│  │  │  Constraints: Affordances + Relative Poses         │    │   │
│  │  └───────────────────────────────────────────────────┘    │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                           │ /skill_graph                          │
│  ┌────────────────────────▼──────────────────────────────────┐   │
│  │       Layer 5: Robot Retargeting & Motion Planning         │   │
│  │  ┌───────────┐  ┌──────────────┐  ┌──────────────────┐    │   │
│  │  │Kinematic  │  │  MoveIt 2    │  │ Trajectory        │    │   │
│  │  │ Mapper    │─▶│  Planner     │─▶│ Optimizer         │    │   │
│  │  │(EE Retarg)│  │(OMPL/TrajOpt)│  │(B-Spline/TOTG)   │    │   │
│  │  └───────────┘  └──────────────┘  └──────────────────┘    │   │
│  │                 [URDF: Franka] [URDF: UR5e]                 │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                           │ /joint_trajectory                     │
│  ┌────────────────────────▼──────────────────────────────────┐   │
│  │              Layer 6: Execution & Evaluation               │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │          Gazebo Harmonic Simulation                  │   │   │
│  │  │  [Franka Panda 7-DoF] ←→ [UR5e 6-DoF]              │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────────┐   │   │
│  │  │  EvaluationNode: SR, TCT, Jerk, CETI logging        │   │   │
│  │  └─────────────────────────────────────────────────────┘   │   │
│  └────────────────────────┬──────────────────────────────────┘   │
│                           │ /metrics                              │
│  ┌────────────────────────▼──────────────────────────────────┐   │
│  │              Layer 7: Web Dashboard (React)                │   │
│  │  [Skill Graph 3D] [Robot State] [Metrics] [Control Panel] │   │
│  └────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. مخطط تسلسل العمليات (Sequence Diagram)

```
Researcher  Camera   BodyPose  HandPose  ObjTracker  SkillBuilder  Planner   Gazebo
    │          │         │         │          │             │           │        │
    │──record──▶         │         │          │             │           │        │
    │          ├──frame──▶         │          │             │           │        │
    │          ├──frame────────────▶          │             │           │        │
    │          └──frame─────────────────────── ▶            │           │        │
    │                    │         │          │             │           │        │
    │          body_kp───▶─────────────────────────────────▶           │        │
    │          hand_kp────────────▶────────────────────────▶           │        │
    │          obj_poses──────────────────────▶────────────▶           │        │
    │                    │         │          │             │           │        │
    │                    │         │          │    build()──▶           │        │
    │                    │         │          │             ├──G_S──────▶        │
    │                    │         │          │             │           │        │
    │                    │         │          │             │   plan()──▶        │
    │                    │         │          │             │           ├execute─▶
    │                    │         │          │             │           │        │
    │◀─────────────────────────────────────────────────── metrics ─────┘        │
```

---

## 4. مخطط الفئات (Class Diagram) — الوحدات الرئيسية

```
┌──────────────────────────────────────────────────────────────┐
│ «ROS2 Node»                                                  │
│ BodyPoseNode                                                 │
├──────────────────────────────────────────────────────────────┤
│ - inferencer: MMPoseInferencer                               │
│ - bridge: CvBridge                                           │
│ - keypoints_pub: Publisher[PoseArray]                        │
├──────────────────────────────────────────────────────────────┤
│ + _image_callback(msg: Image): void                          │
│ + _run_inference(frame): tuple[ndarray, ndarray]             │
│ + _build_pose_array(kp, scores, header): PoseArray           │
└────────────────────────┬─────────────────────────────────────┘
                         │ subscribes/publishes
┌────────────────────────▼─────────────────────────────────────┐
│ «ROS2 Node»                                                  │
│ TemporalSegmentationNode                                     │
├──────────────────────────────────────────────────────────────┤
│ - model: STGCN                                               │
│ - buffer: deque[FrameData]                                   │
│ - contact_detector: ContactDetector                          │
├──────────────────────────────────────────────────────────────┤
│ + _fuse_inputs(body, hand, obj): FrameData                   │
│ + _classify_action(buffer): ActionSegment                    │
│ + _detect_contacts(buffer): list[ContactEvent]               │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│ SkillGraphBuilder                                            │
├──────────────────────────────────────────────────────────────┤
│ - config: dict                                               │
├──────────────────────────────────────────────────────────────┤
│ + build_from_demonstrations(demos): SkillGraph               │
│ + _find_canonical_sequence(segs): list[str]                  │
│ + _aggregate_ee_positions(demos, label): ndarray             │
│ + _extract_constraints(demos): dict                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ SkillGraph                                                   │
├──────────────────────────────────────────────────────────────┤
│ + task_name: str                                             │
│ + nodes: list[SkillNode]                                     │
│ + edges: list[SkillEdge]                                     │
│ + task_constraints: dict                                     │
├──────────────────────────────────────────────────────────────┤
│ + to_yaml(): str                                             │
│ + from_yaml(s: str): SkillGraph                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ «ROS2 Node»                                                  │
│ MotionPlannerNode                                            │
├──────────────────────────────────────────────────────────────┤
│ - robot: MoveItPy                                            │
│ - arm: PlanningComponent                                     │
│ - optimizer: TrajectoryOptimizer                             │
├──────────────────────────────────────────────────────────────┤
│ + plan_to_pose(target: PoseStamped): bool                    │
│ + execute_skill_graph(graph: SkillGraph): dict               │
│ + open_gripper(): void                                       │
│ + close_gripper(): void                                      │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. مخطط تدفق البيانات (Data Flow Diagram)

```
┌──────────────────────────────────────────────────────────────────┐
│                     Data Formats & Flows                         │
│                                                                  │
│  VIDEO FRAME (np.ndarray [H,W,3])                                │
│       │                                                          │
│       ├──RTMPose──▶ body_keypoints: [17, 3] float32             │
│       ├──MediaPipe─▶ hand_keypoints: [21, 3] float32            │
│       │              hand_aperture: float32 [0,1]               │
│       └──YOLO+FP──▶ object_poses: list[TrackedObject]           │
│                                                                  │
│              ▼ Fusion ▼                                          │
│  FRAME_DATA = {                                                  │
│    "body": ndarray[17,3],                                        │
│    "hand": ndarray[21,3],                                        │
│    "aperture": float,                                            │
│    "objects": list[{id, class, pose6d}]                          │
│  }                                                               │
│                                                                  │
│              ▼ ST-GCN ▼                                          │
│  ACTION_SEGMENT = {                                              │
│    "label": str,   # "Grasp"                                     │
│    "start": int,   # frame index                                 │
│    "end": int,                                                   │
│    "confidence": float                                           │
│  }                                                               │
│                                                                  │
│              ▼ SkillGraphBuilder ▼                               │
│  SKILL_GRAPH (YAML):                                             │
│    task_name: "pick_and_place"                                   │
│    nodes: [{id, label, rel_ee_pos, gripper_state, duration}]    │
│    edges: [{from, to, precondition}]                             │
│    constraints: {keep_upright, max_tilt_deg}                     │
│                                                                  │
│              ▼ KinematicMapper ▼                                 │
│  EE_GOAL_POSE (PoseStamped):                                     │
│    position: [x, y, z]  # in robot base frame                   │
│    orientation: [qx, qy, qz, qw]                                │
│                                                                  │
│              ▼ MoveIt 2 ▼                                        │
│  JOINT_TRAJECTORY (JointTrajectory):                             │
│    joint_names: [j1, j2, ..., j7]                               │
│    points: [{positions, velocities, accelerations, time}]       │
│                                                                  │
│              ▼ Gazebo ▼                                          │
│  EXECUTION_METRICS:                                              │
│    SR, TCT, Jerk, CETI → CSV log file                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. مخطط النشر (Deployment Diagram)

```
┌─────────────────────────────────────────────────────────────┐
│                Development Machine                          │
│         Ubuntu 22.04 LTS | 32GB RAM | RTX 3060             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              ROS 2 Humble Ecosystem                  │   │
│  │                                                      │   │
│  │  ┌────────────────┐   ┌────────────────────────┐    │   │
│  │  │ pose2skill_    │   │ pose2skill_core         │    │   │
│  │  │ perception     │──▶│ (ST-GCN + SkillGraph)  │    │   │
│  │  │ (3x Nodes)     │   └────────────┬───────────┘    │   │
│  │  └────────────────┘                │                │   │
│  │                          ┌─────────▼──────────┐     │   │
│  │                          │ pose2skill_planner  │     │   │
│  │                          │ (MoveIt 2 + IK)     │     │   │
│  │                          └─────────┬──────────┘     │   │
│  │                                    │                │   │
│  │  ┌─────────────────────────────────▼──────────┐    │   │
│  │  │            Gazebo Harmonic                  │    │   │
│  │  │  [Franka Panda]  [UR5e]  [Objects/World]   │    │   │
│  │  └────────────────────────────────────────────┘    │   │
│  │                                                      │   │
│  │  ┌──────────────────────┐                            │   │
│  │  │ ROSbridge WebSocket  │◀──── port 9090             │   │
│  │  └──────────────────────┘                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Web Dashboard (Vite + React)              │   │
│  │            port 3000 ── http://localhost:3000        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. قرارات المعمارية (Architecture Decision Records)

### ADR-001: اختيار Gazebo بدلاً من Isaac Sim

- **القرار**: استخدام Gazebo Harmonic كالمحاكاة الأساسية
- **السبب**: مجاني، مدعوم رسمياً مع ROS 2، لا يتطلب GPU قوية
- **البديل المرفوض**: Isaac Sim (يتطلب RTX 4090+ + ترخيص NVIDIA)

### ADR-002: اختيار MediaPipe للبدء بدلاً من HaMeR

- **القرار**: MediaPipe Hands للنموذج الأساسي، HaMeR اختياري
- **السبب**: سهل التثبيت، يعمل على CPU، 21 نقطة كافية
- **البديل**: HaMeR يعطي نتائج أفضل لكن يتطلب CUDA

### ADR-003: ST-GCN بدلاً من Transformer فقط

- **القرار**: ST-GCN مع طبقة Attention زمنية
- **السبب**: الرسم البياني الهيكلي للجسم طبيعي لـ GCN، مُثبَت في الأدبيات
- **المرجع**: Yan et al. (2018). AAAI.

### ADR-004: Skill Graph بـ YAML بدلاً من قاعدة بيانات

- **القرار**: ملفات YAML لتمثيل Skill Graph
- **السبب**: قابل للقراءة البشرية، سهل التعديل والمراجعة، لا يتطلب DB
- **عيب**: لا يتسع لمكتبات مهارات ضخمة جداً

---

## المراجع

- Bass et al. (2021). Software Architecture in Practice. Addison-Wesley.
- ROS 2 Architecture: https://docs.ros.org/en/humble/
- MoveIt 2 Architecture: https://moveit.picknik.ai/
