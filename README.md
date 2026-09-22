# 🤖 Pose2Skill-Robot
### نظام ذكي لتعلّم ونقل المهارات البشرية إلى الروبوت
### An Intelligent System for Learning and Transferring Human Skills to Robots

[![ROS 2 Humble](https://img.shields.io/badge/ROS2-Humble-blue)](https://docs.ros.org/en/humble/)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-green)](https://python.org)
[![PyTorch 2.2](https://img.shields.io/badge/PyTorch-2.2-red)](https://pytorch.org)
[![Gazebo](https://img.shields.io/badge/Gazebo-Harmonic-orange)](https://gazebosim.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 📌 الملخص (Abstract)

**Pose2Skill-Robot** يحل معضلة **فجوة التجسيد بين الإنسان والروبوت** — بدلاً من تقليد حركة المفاصل مباشرة، يبني **رسماً بيانياً دلالياً للمهارة** مستقلاً عن بنية أي منفذ، ثم يُخطِّط مساراً روبوتياً آمناً باستخدام ROS 2 + MoveIt 2.

```
🎥 فيديو بشري
    ↓
👁️ تقدير الوضعية 3D (RTMPose + HaMeR + YOLO-World)
    ↓  
🧠 تجزئة الأفعال (ST-GCN) → [Approach→Reach→Grasp→Lift→Transport→Place→Release]
    ↓
🕸️ Spatio-Temporal Skill Graph (مستقل عن التجسيد)
    ↓
🦾 تخطيط حركي (ROS 2 + MoveIt 2 + OMPL)
    ↓
🤖 تنفيذ في Gazebo (Franka Panda أو UR5e)
```

---

## 🗂️ هيكل المشروع

```
Pose2Skill-Robot/
├── GEMINI.md                        ← سياق المشروع لـ AI agents
├── .agents/
│   ├── agents.md                    ← تعريف الوكلاء الأربعة
│   ├── rules/
│   │   ├── project_guidelines.md    ← إرشادات المشروع العامة
│   │   ├── coding_standards.md      ← معايير الكود (PEP 8 + ROS 2)
│   │   └── ros2_conventions.md      ← اتفاقيات ROS 2
│   └── skills/
│       ├── pose_estimation/SKILL.md ← RTMPose + HaMeR + YOLO-World
│       ├── skill_graph/SKILL.md     ← ST-GCN + Graph Builder
│       ├── motion_planning/SKILL.md ← MoveIt 2 + IK + Gazebo
│       ├── ros2_integration/SKILL.md← Launch files + ROSbridge
│       └── evaluation/SKILL.md      ← SR, TCT, Jerk, CETI metrics
├── docs/
│   ├── 01_requirements/
│   │   ├── SRS.md                   ← IEEE 830 متطلبات النظام
│   │   └── use_cases.md             ← 8 حالات استخدام تفصيلية
│   ├── 02_architecture/
│   │   └── system_design.md         ← C4 + UML + ADRs
│   └── ...
├── src/
│   ├── pose2skill_perception/       ← حزمة ROS 2: الإدراك
│   │   └── pose2skill_perception/
│   │       ├── body_pose_node.py    ← RTMPose (17 keypoints)
│   │       ├── hand_pose_node.py    ← MediaPipe (21 keypoints + aperture)
│   │       └── object_tracker_node.py ← YOLO-World + 6D Pose
│   ├── pose2skill_core/             ← حزمة ROS 2: Skill Graph
│   ├── pose2skill_planner/          ← حزمة ROS 2: MoveIt 2
│   └── pose2skill_sim/              ← حزمة ROS 2: Gazebo
├── web_dashboard/                   ← React + Three.js Dashboard
│   └── src/
│       ├── App.jsx                  ← 3D Skill Graph + Metrics + Control
│       └── App.css                  ← Premium dark theme
├── scripts/
│   └── setup_environment.sh        ← إعداد Ubuntu 22.04 تلقائياً
└── configs/
    └── pipeline_config.yaml        ← إعدادات النظام الكامل
```

---

## 🚀 البدء السريع (Quick Start)

### المتطلبات
- Ubuntu 22.04 LTS
- GPU: NVIDIA RTX 3060+ (أو CPU للاختبار فقط)
- RAM: 16GB+ (32GB مُوصى)

### التثبيت
```bash
# 1. استنساخ المشروع
git clone https://github.com/team/pose2skill-robot.git
cd pose2skill-robot

# 2. تشغيل سكريبت الإعداد الكامل (يثبت كل شيء)
bash scripts/setup_environment.sh

# 3. تفعيل البيئة
source ~/.bashrc
```

### تشغيل النظام
```bash
# تشغيل النظام الكامل مع Franka Panda
ros2 launch pose2skill_sim full_pipeline.launch.py robot:=franka_panda

# تشغيل مع UR5e
ros2 launch pose2skill_sim full_pipeline.launch.py robot:=ur5e

# تشغيل لوحة التحكم
cd web_dashboard && npm run dev
# ثم افتح: http://localhost:3000
```

### تشغيل التجارب المعيارية
```bash
python scripts/run_benchmark.py \
  --tasks all \
  --robots franka_panda ur5e \
  --trials 20
```

---

## 📊 النتائج المستهدفة

| المقياس | Baseline 1 | Baseline 2 | **Pose2Skill** |
|---------|:---:|:---:|:---:|
| Task Success Rate (SR) | ~45% | ~60% | **≥85%** |
| CETI (Cross-Embodiment) | ~40% | ~55% | **≥85%** |
| FPS (Perception) | — | — | **≥25 FPS** |
| Planning Time | — | — | **<5s** |

---

## 🏗️ مراحل هندسة البرمجيات (SDLC) المنفَّذة

| المرحلة | الوثيقة | الحالة |
|---------|---------|--------|
| 1. تحليل المتطلبات | [SRS.md](docs/01_requirements/SRS.md) | ✅ |
| 1. حالات الاستخدام | [use_cases.md](docs/01_requirements/use_cases.md) | ✅ |
| 2. التصميم المعماري | [system_design.md](docs/02_architecture/system_design.md) | ✅ |
| 3. التنفيذ (Perception) | [body_pose_node.py](src/pose2skill_perception/pose2skill_perception/body_pose_node.py) | ✅ |
| 3. التنفيذ (Hand) | [hand_pose_node.py](src/pose2skill_perception/pose2skill_perception/hand_pose_node.py) | ✅ |
| 3. التنفيذ (Objects) | [object_tracker_node.py](src/pose2skill_perception/pose2skill_perception/object_tracker_node.py) | ✅ |
| 4. الواجهة | [App.jsx](web_dashboard/src/App.jsx) | ✅ |
| 5. الاختبار | test_plan.md | 🔄 |

---

## 👥 فريق العمل

| العضو | الدور | المسؤولية |
|-------|-------|-----------|
| **يعقوب خالد محمد علي المهاجري** | Vision & 3D Perception Lead | `pose2skill_perception` |
| العضو الثاني | Temporal Modeling & Skill Extraction | `pose2skill_core` |
| العضو الثالث | Robotics & Motion Planning | `pose2skill_planner` |
| العضو الرابع | Full-stack Integration & QA | `pose2skill_sim` + Dashboard |

---

## 📚 المراجع الأكاديمية (APA 7)

Argall, B. D., Chernova, S., Veloso, M., & Browning, B. (2009). A survey of robot learning from demonstration. *Robotics and Autonomous Systems*, *57*(5), 469–483.

Carfì, A., et al. (2021). Hand-object interaction: From human demonstrations to robot manipulation. *Frontiers in Robotics and AI*, *8*, 714023.

Lum, T. G. W., et al. (2025). Crossing the human-robot embodiment gap with sim-to-real RL using one human demonstration. *CoRL 2025*, PMLR Vol. 305.

Lepert, M., Fang, J., & Bohg, J. (2025). Phantom: Training robots without robots using only human videos. *CoRL 2025*, PMLR Vol. 305.

Mandlekar, A., et al. (2022). What matters in learning from offline human demonstrations for robot manipulation. *CoRL 2022*, PMLR Vol. 164.

---

## 📄 الترخيص
MIT License — للاستخدام الأكاديمي والبحثي
