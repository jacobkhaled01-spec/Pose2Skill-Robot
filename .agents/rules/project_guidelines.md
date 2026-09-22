# Project Guidelines — Pose2Skill-Robot
# إرشادات المشروع العامة

## 1. فلسفة المشروع (Project Philosophy)
- **الفهم قبل التقليد**: لا نقلد حركة المفاصل مباشرة، بل نستخلص الدلالة الوظيفية للمهارة.
- **الاستقلالية عن التجسيد**: كل وحدة يجب أن تعمل بمعزل عن هيكل الروبوت المستخدم.
- **المحاكاة أولاً**: التطوير والتحقق يتما داخل Gazebo قبل أي تجربة حقيقية.
- **قابلية إعادة الاستخدام**: كل مكون برمجي يُبنى كحزمة ROS 2 مستقلة قابلة للتعديل.

## 2. إدارة الكود (Code Management)
### Git Workflow
```bash
main          ← الكود المستقر المختبر
develop       ← فرع التطوير المشترك
feature/xxx   ← فروع المميزات (perception, skill-graph, planner, dashboard)
```

### صيغة رسائل الـ Commit
```
[MODULE] فعل + وصف مختصر

أمثلة:
[PERCEPTION] add RTMPose body keypoint extraction node
[SKILL-GRAPH] implement ST-GCN temporal segmentation
[PLANNER] integrate MoveIt 2 collision-aware planning
[DASHBOARD] add real-time skill graph Three.js renderer
[FIX] resolve IK singularity in UR5e joint limits
[TEST] add unit tests for affordance extractor
[DOCS] update SRS with new performance metrics
```

## 3. هيكل كل حزمة ROS 2 (ROS 2 Package Structure)
```
pose2skill_<module>/
├── package.xml                    ← ROS 2 package metadata
├── setup.py                       ← Python package setup
├── setup.cfg
├── resource/pose2skill_<module>   ← ament index marker
├── pose2skill_<module>/
│   ├── __init__.py
│   ├── <node_name>.py             ← ROS 2 nodes
│   └── utils/
│       ├── __init__.py
│       └── helpers.py
├── launch/
│   └── <module>.launch.py        ← Launch files
├── config/
│   └── params.yaml               ← Node parameters
├── msg/                          ← Custom message types (if any)
└── test/
    └── test_<module>.py          ← pytest unit tests
```

## 4. توثيق الكود (Code Documentation)
كل دالة يجب أن تحتوي على:
```python
def extract_skill_graph(
    demo_sequence: list[dict],
    config: dict
) -> SkillGraph:
    """
    استخلاص الرسم البياني للمهارة من متوالية العرض البشري.
    Extract the Skill Graph from a human demonstration sequence.

    Args:
        demo_sequence: قائمة الإطارات مع إحداثيات الجسم والأجسام
                       List of frames with body and object coordinates.
        config: قاموس إعدادات الخوارزمية / Algorithm config dictionary.

    Returns:
        SkillGraph: الرسم البياني المستخلص / Extracted skill graph object.

    Raises:
        ValueError: إذا كانت المتوالية فارغة / If sequence is empty.

    References:
        Carfì et al. (2021). Frontiers in Robotics and AI.
    """
```

## 5. معايير الأداء (Performance Standards)
| المقياس | الحد الأدنى المطلوب |
|---------|---------------------|
| معدل الإطارات (FPS) | ≥ 25 FPS |
| دقة تصنيف الأفعال | ≥ 90% |
| معدل نجاح المهمة (Franka) | ≥ 85% |
| مؤشر التعميم (CETI) | ≥ 85% |
| زمن تخطيط مسار IK | < 500ms |
| نعومة المسار (Jerk) | أدنى قيمة ممكنة |

## 6. بروتوكول التجارب (Experiment Protocol)
### قبل كل تجربة
1. ✅ التحقق من تشغيل Gazebo وظهور الروبوت صحيحاً
2. ✅ التحقق من عمل جميع topics الـ ROS 2
3. ✅ تسجيل مقاطع الفيديو البشرية بإضاءة جيدة
4. ✅ التحقق من صحة الـ Skill Graph قبل إرساله للتخطيط

### خلال التجربة
- تسجيل جميع logs تلقائياً في `experiments/logs/`
- حفظ الـ Skill Graph الناتج بصيغة YAML
- تسجيل المقاييس: SR, TCT, Jerk في ملف CSV

### بعد كل تجربة
- مقارنة النتائج مع Baseline 1 و Baseline 2
- تحديث الجداول الإحصائية في تقرير المشروع

## 7. إدارة الإصدارات (Version Control)
- `v0.1` — Perception pipeline working
- `v0.2` — Skill Graph generation working
- `v0.3` — MoveIt 2 planning working
- `v0.4` — Full pipeline integrated
- `v1.0` — Benchmark results complete

## 8. التواصل والتنسيق (Team Communication)
- اجتماع أسبوعي لمراجعة التقدم (كل الأحد)
- مراجعة الكود (Code Review) قبل دمج أي فرع في `develop`
- توثيق كل قرار تقني في `docs/decisions/`
- تحديث `CHANGELOG.md` عند إكمال كل مرحلة

## 9. الاستشهاد الأكاديمي (Academic Citation)
- استخدام APA 7 في جميع الوثائق
- توثيق كل مكتبة خارجية مستخدمة مع رابطها وإصدارها
- الإشارة إلى المرجع العلمي عند استخدام أي خوارزمية بحثية في الكود
