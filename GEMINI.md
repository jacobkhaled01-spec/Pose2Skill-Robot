# Pose2Skill-Robot — Project Context & Rules
# قواعد وسياق مشروع Pose2Skill-Robot

## Project Identity
- **Name**: Pose2Skill-Robot
- **Type**: Academic Graduation Project — Computer Vision & Robotics
- **Language**: Python 3.10+ / ROS 2 / React
- **Simulation**: Gazebo Harmonic (primary) / Isaac Sim (optional)
- **Target Robots**: Franka Emika Panda (7-DoF), Universal Robots UR5e (6-DoF)

## Project Vision
An intelligent system that extracts transferable manipulation skills from human demonstration videos using 3D pose estimation and hand-object interaction analysis, then executes them on robotic manipulators via ROS 2 + MoveIt 2 — WITHOUT requiring a physical robot (simulation-first approach).

## Architecture Overview
```
Video Input → 3D Perception → Temporal Segmentation → Skill Graph → Motion Planning → Simulation
```
7 Layers:
1. Visual Capture (RGB/RGB-D Video)
2. 3D Perception (RTMPose + HaMeR + YOLO-World + FoundationPose)
3. Temporal Modeling (ST-GCN + Action Segmentation)
4. Embodiment-Agnostic Skill Graph
5. Robot Retargeting + MoveIt 2
6. Gazebo/Isaac Sim Execution
7. React + Three.js Web Dashboard

## Team Roles
- **يعقوب خالد**: Vision & 3D Perception Lead → `pose2skill_perception` package
- **العضو الثاني**: Temporal Modeling & Skill Extraction → `pose2skill_core` package
- **العضو الثالث**: Robotics & Motion Planning → `pose2skill_planner` package
- **العضو الرابع**: Full-stack Integration & QA → `pose2skill_sim` + Web Dashboard

## Key Packages (ROS 2)
- `pose2skill_perception` — Body/Hand pose + Object tracking
- `pose2skill_core`       — ST-GCN segmentation + Skill Graph builder
- `pose2skill_planner`    — IK solver + MoveIt 2 motion planning
- `pose2skill_sim`        — Gazebo/Isaac Sim bridge + Evaluation

## Tech Stack
| Layer | Technology |
|-------|-----------|
| OS | Ubuntu 22.04 LTS |
| Robot Middleware | ROS 2 Humble |
| Motion Planning | MoveIt 2 + OMPL |
| Simulation | Gazebo Harmonic |
| AI/ML | PyTorch 2.2+, PyTorch Geometric |
| Pose Estimation | RTMPose / ViTPose / HaMeR / MediaPipe |
| Object Detection | YOLO-World + ByteTrack + FoundationPose |
| Temporal Modeling | ST-GCN |
| Frontend | React + Vite + Three.js |
| API Communication | ROS Bridge + WebSockets |

## Coding Rules (MANDATORY)
1. All Python code must follow PEP 8 and include type hints
2. Every ROS 2 node must have a launch file
3. All classes and functions must have docstrings (Arabic + English)
4. Unit tests required for every module (pytest)
5. No hardcoded paths — use ROS 2 package paths or config files
6. All configs in YAML format under `configs/`
7. Git commit messages: `[MODULE] short description` (e.g., `[PERCEPTION] add hand pose node`)
8. Follow APA 7 for all academic documentation and citations

## Performance Targets
- Perception Pipeline: ≥ 25 FPS on RTX 3060
- Action Segmentation Accuracy: ≥ 90%
- Task Success Rate (Franka): ≥ 85%
- Cross-Embodiment Transfer (CETI): ≥ 85%
- IK Planning Time: < 500ms per action primitive

## Benchmark Tasks
1. Precise Pick-and-Place
2. Obstacle-Constrained Relocation
3. Spatial Orientation Transfer
4. Sequential Stacking

## Academic References (APA 7)
- Argall et al. (2009) — Survey of LfD
- Carfì et al. (2021) — Hand-Object Interaction
- Mandlekar et al. (2022) — CoRL 2022
- Lum et al. (2025) — Human2Sim2Robot, CoRL 2025
- Lepert et al. (2025) — Phantom, CoRL 2025

## Directory Structure
```
project-root/
├── GEMINI.md
├── .agents/          ← AI agent configs
├── docs/             ← All SDLC documentation
├── src/              ← ROS 2 packages
│   ├── pose2skill_perception/
│   ├── pose2skill_core/
│   ├── pose2skill_planner/
│   └── pose2skill_sim/
├── models/           ← Trained ML models
├── web_dashboard/    ← React frontend
├── tests/            ← Unit + Integration tests
├── scripts/          ← Setup and run scripts
└── configs/          ← YAML configuration files
```
