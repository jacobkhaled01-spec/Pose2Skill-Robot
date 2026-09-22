---
name: skill-graph-builder
description: >
  مهارة بناء الرسم البياني الزماني-المكاني للمهارة (Spatio-Temporal Skill Graph)
  من عروض الفيديو البشرية. تشمل تدريب ST-GCN للتجزئة الزمنية للأفعال، كشف
  نقاط الاتصال، واستخلاص قيود الإتاحة. تُفعَّل عند العمل على حزمة
  pose2skill_core في مشروع Pose2Skill-Robot.
---

# مهارة بناء الرسم البياني للمهارة
# Skill: Spatio-Temporal Affordance Skill Graph

## نظرة عامة
الرسم البياني للمهارة هو **قلب المشروع** — التمثيل الوسيط المستقل عن التجسيد الذي يصف:
- **ماذا** يجب أن يفعل الروبوت (الأفعال الأولية)
- **أين** (المواقع النسبية بالنسبة للأجسام)
- **متى** (شروط الانتقال بين الأفعال)

```
G_S = ⟨V_S, E_S, C_S⟩
V_S = {Approach, Reach, Grasp, Lift, Transport, Place, Release}
E_S = شروط الانتقال الزمنية
C_S = قيود الإتاحة والوضعية النسبية
```

---

## المرحلة 1: النمذجة الزمنية بـ ST-GCN

### ما هو ST-GCN؟
شبكة التفاف بيانية زمانية-مكانية — تمثل مفاصل الإنسان كعقد في رسم بياني مرتبطة بـ:
- **حواف مكانية**: العظام (كوع-معصم، كتف-كوع)
- **حواف زمانية**: نفس المفصل بين الإطار t والإطار t+1

### هيكل ST-GCN
```python
# src/pose2skill_core/pose2skill_core/models/st_gcn.py
import torch
import torch.nn as nn
from torch_geometric.nn import GCNConv

class STGCN(nn.Module):
    """
    شبكة التفاف بيانية زمانية-مكانية لتصنيف الأفعال.
    Spatio-Temporal Graph Convolutional Network for action segmentation.
    
    Reference:
        Yan et al. (2018). Spatial Temporal Graph Convolutional Networks
        for Skeleton-Based Action Recognition. AAAI.
    """
    
    def __init__(self, num_joints: int = 17, num_classes: int = 7,
                 hidden_dim: int = 64, num_layers: int = 4):
        super().__init__()
        self.num_joints = num_joints
        
        # الطبقات الالتفافية المكانية-الزمانية
        self.spatial_layers = nn.ModuleList([
            GCNConv(3 if i == 0 else hidden_dim, hidden_dim)
            for i in range(num_layers)
        ])
        
        # الطبقة الزمانية (1D Convolution على محور الوقت)
        self.temporal_conv = nn.Conv1d(hidden_dim, hidden_dim, kernel_size=9, padding=4)
        
        # طبقة الانتباه الزمني
        self.temporal_attention = nn.MultiheadAttention(
            embed_dim=hidden_dim, num_heads=4, batch_first=True
        )
        
        # مصنف الأفعال
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim * num_joints, 256),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(256, num_classes)
        )
    
    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: [T, J, 3] — T إطارات، J مفصل، 3 إحداثيات
            edge_index: [2, E] — حواف الرسم البياني الهيكلي
        Returns:
            logits: [T, num_classes] — تصنيف لكل إطار
        """
        T, J, C = x.shape
        
        # المعالجة المكانية لكل إطار
        spatial_features = []
        for t in range(T):
            feat = x[t]  # [J, 3]
            for layer in self.spatial_layers:
                feat = layer(feat, edge_index).relu()
            spatial_features.append(feat)  # [J, hidden_dim]
        
        # دمج الإطارات [T, J*hidden_dim]
        spatial_out = torch.stack(spatial_features, dim=0).reshape(T, -1)
        
        # المعالجة الزمنية
        temporal_out = self.temporal_conv(spatial_out.unsqueeze(0)).squeeze(0).T
        
        # تصنيف لكل إطار
        return self.classifier(spatial_out)
```

### تدريب النموذج
```python
# scripts/train_stgcn.py
import torch
from torch.utils.data import DataLoader
from pose2skill_core.models.st_gcn import STGCN
from pose2skill_core.datasets.demonstration_dataset import DemonstrationDataset

# الأفعال الأولية السبعة
ACTION_CLASSES = ["Approach", "Reach", "Grasp", "Lift", "Transport", "Place", "Release"]
NUM_CLASSES = len(ACTION_CLASSES)

def train():
    model = STGCN(num_joints=17, num_classes=NUM_CLASSES, hidden_dim=64)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.CrossEntropyLoss()
    
    dataset = DemonstrationDataset("data/demonstrations/")
    loader = DataLoader(dataset, batch_size=8, shuffle=True)
    
    for epoch in range(100):
        for batch in loader:
            keypoints, labels = batch["keypoints"], batch["labels"]
            logits = model(keypoints)
            loss = criterion(logits.reshape(-1, NUM_CLASSES), labels.reshape(-1))
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        
        print(f"Epoch {epoch+1}: Loss={loss.item():.4f}")
    
    torch.save(model.state_dict(), "models/st_gcn/checkpoint_best.pth")
```

---

## المرحلة 2: كشف نقاط الاتصال

### منطق كشف الإمساك (Grasp Detection)
```python
# src/pose2skill_core/pose2skill_core/contact_detector.py
import numpy as np

class ContactDetector:
    """
    كشف لحظات الإمساك والإفلات بين اليد والجسم.
    Detect grasp and release events between hand and object.
    """
    
    GRASP_THRESHOLD_M = 0.03     # 3cm — مسافة الإمساك
    RELEASE_THRESHOLD_M = 0.08   # 8cm — مسافة الإفلات
    APERTURE_CLOSE_THRESHOLD = 0.6  # 60% — نسبة إغلاق القبضة
    
    def detect_contact_events(
        self,
        hand_positions: np.ndarray,    # [T, 21, 3]
        object_positions: np.ndarray,  # [T, 3]
        hand_apertures: np.ndarray,    # [T] — [0=open, 1=closed]
    ) -> list[dict]:
        """
        استخراج أحداث الاتصال من المتوالية الزمنية.
        
        Returns:
            List of events: [{"type": "grasp"|"release", "frame": int, ...}]
        """
        events = []
        T = len(hand_positions)
        
        # حساب المسافة بين طرف الإصبع والجسم
        fingertip_idx = [4, 8, 12, 16, 20]  # أطراف الأصابع الخمسة
        fingertips = hand_positions[:, fingertip_idx, :]  # [T, 5, 3]
        distances = np.min(
            np.linalg.norm(fingertips - object_positions[:, None, :], axis=-1),
            axis=-1
        )  # [T]
        
        in_contact = False
        for t in range(1, T):
            if not in_contact:
                # كشف بداية الإمساك
                if (distances[t] < self.GRASP_THRESHOLD_M and
                        hand_apertures[t] > self.APERTURE_CLOSE_THRESHOLD):
                    events.append({
                        "type": "grasp",
                        "frame": t,
                        "distance_m": float(distances[t]),
                        "aperture": float(hand_apertures[t]),
                    })
                    in_contact = True
            else:
                # كشف لحظة الإفلات
                if (distances[t] > self.RELEASE_THRESHOLD_M or
                        hand_apertures[t] < 0.3):
                    events.append({
                        "type": "release",
                        "frame": t,
                        "distance_m": float(distances[t]),
                    })
                    in_contact = False
        
        return events
```

---

## المرحلة 3: بناء الرسم البياني

```python
# src/pose2skill_core/pose2skill_core/skill_graph_builder.py
from dataclasses import dataclass, field
import numpy as np
import yaml

@dataclass
class SkillNode:
    """عقدة في الرسم البياني تمثل فعلاً أولياً."""
    id: int
    label: str                          # "Approach", "Grasp", etc.
    relative_ee_position: np.ndarray    # [3] — موقع EE نسبة للجسم
    relative_ee_orientation: np.ndarray # [4] — quaternion
    gripper_state: float                # 0.0=open, 1.0=closed
    duration_s: float                   # مدة الفعل المتوسطة
    confidence: float                   # درجة الثقة [0,1]

@dataclass
class SkillEdge:
    """حافة تربط فعلين متتاليين."""
    from_node: int
    to_node: int
    precondition: str   # شرط بدء الفعل التالي
    postcondition: str  # شرط اكتمال الفعل الحالي

@dataclass
class SkillGraph:
    """الرسم البياني الكامل للمهارة."""
    task_name: str
    nodes: list[SkillNode] = field(default_factory=list)
    edges: list[SkillEdge] = field(default_factory=list)
    task_constraints: dict = field(default_factory=dict)
    
    def to_yaml(self) -> str:
        """تحويل الرسم البياني إلى YAML للحفظ والنقل."""
        data = {
            "task_name": self.task_name,
            "nodes": [
                {
                    "id": n.id,
                    "label": n.label,
                    "relative_ee_position": n.relative_ee_position.tolist(),
                    "gripper_state": n.gripper_state,
                    "duration_s": n.duration_s,
                }
                for n in self.nodes
            ],
            "edges": [
                {
                    "from": e.from_node,
                    "to": e.to_node,
                    "precondition": e.precondition,
                }
                for e in self.edges
            ],
            "constraints": self.task_constraints,
        }
        return yaml.dump(data, allow_unicode=True, default_flow_style=False)
    
    @classmethod
    def from_yaml(cls, yaml_str: str) -> "SkillGraph":
        """تحميل رسم بياني من YAML."""
        data = yaml.safe_load(yaml_str)
        graph = cls(task_name=data["task_name"])
        for n in data["nodes"]:
            graph.nodes.append(SkillNode(
                id=n["id"],
                label=n["label"],
                relative_ee_position=np.array(n["relative_ee_position"]),
                relative_ee_orientation=np.array([0,0,0,1]),
                gripper_state=n["gripper_state"],
                duration_s=n["duration_s"],
                confidence=1.0,
            ))
        for e in data["edges"]:
            graph.edges.append(SkillEdge(
                from_node=e["from"], to_node=e["to"],
                precondition=e["precondition"], postcondition=""
            ))
        return graph


class SkillGraphBuilder:
    """
    بناء الرسم البياني للمهارة من عروض بشرية متعددة.
    Build the Skill Graph from multiple human demonstrations.
    
    Reference:
        Carfì et al. (2021). Hand-object interaction: From human demonstrations
        to robot manipulation. Frontiers in Robotics and AI.
    """
    
    def build_from_demonstrations(
        self,
        demonstrations: list[dict],
        task_name: str = "manipulation_task"
    ) -> SkillGraph:
        """
        بناء الرسم البياني من عدة عروض بشرية.
        
        Args:
            demonstrations: قائمة العروض، كل عرض يحتوي على:
                - "action_segments": قائمة الأفعال المقطعة
                - "contact_events": أحداث الإمساك والإفلات
                - "object_trajectory": مسار الجسم
                - "hand_trajectory": مسار اليد
            task_name: اسم المهمة
        
        Returns:
            SkillGraph: الرسم البياني المجمّع من جميع العروض
        """
        graph = SkillGraph(task_name=task_name)
        all_segments = [d["action_segments"] for d in demonstrations]
        
        # تجميع الأفعال عبر العروض المتعددة
        canonical_sequence = self._find_canonical_sequence(all_segments)
        
        for i, action_label in enumerate(canonical_sequence):
            # حساب المتوسط عبر العروض
            rel_positions = self._aggregate_ee_positions(demonstrations, action_label)
            gripper_state = self._infer_gripper_state(action_label)
            
            node = SkillNode(
                id=i,
                label=action_label,
                relative_ee_position=rel_positions.mean(axis=0),
                relative_ee_orientation=np.array([0, 0, 0, 1]),
                gripper_state=gripper_state,
                duration_s=self._compute_avg_duration(demonstrations, action_label),
                confidence=self._compute_confidence(demonstrations, action_label),
            )
            graph.nodes.append(node)
            
            # إضافة الحافة للفعل السابق
            if i > 0:
                graph.edges.append(SkillEdge(
                    from_node=i-1, to_node=i,
                    precondition=self._build_precondition(action_label),
                    postcondition=""
                ))
        
        # استخلاص قيود المهمة
        graph.task_constraints = self._extract_constraints(demonstrations)
        
        return graph
    
    def _find_canonical_sequence(self, all_segments: list) -> list[str]:
        """إيجاد التسلسل الأكثر شيوعاً عبر العروض المتعددة."""
        # البحث عن التسلسل المشترك
        from collections import Counter
        sequences = [tuple(seg["label"] for seg in segs) for segs in all_segments]
        most_common = Counter(sequences).most_common(1)[0][0]
        return list(most_common)
    
    def _infer_gripper_state(self, action_label: str) -> float:
        """استنتاج حالة المقبض من تصنيف الفعل."""
        closed_actions = {"Grasp", "Lift", "Transport"}
        return 1.0 if action_label in closed_actions else 0.0
    
    def _build_precondition(self, action_label: str) -> str:
        preconditions = {
            "Reach":    "distance(EE, object) < 0.30",
            "Grasp":    "distance(EE, object) < 0.02",
            "Lift":     "gripper_state == CLOSED",
            "Transport": "object_height > 0.05",
            "Place":    "distance(EE, target) < 0.10",
            "Release":  "object_at_target == True",
        }
        return preconditions.get(action_label, "True")
    
    def _extract_constraints(self, demonstrations: list[dict]) -> dict:
        """استخلاص قيود المهمة (مثل: عدم قلب الكأس)."""
        return {
            "keep_upright": True,
            "max_tilt_deg": 15.0,
            "avoid_obstacles": True,
        }
    
    def _aggregate_ee_positions(self, demonstrations, action_label):
        positions = []
        for demo in demonstrations:
            for seg in demo["action_segments"]:
                if seg["label"] == action_label:
                    positions.append(seg["relative_ee_position"])
        return np.array(positions) if positions else np.zeros((1, 3))
    
    def _compute_avg_duration(self, demonstrations, action_label):
        durations = []
        for demo in demonstrations:
            for seg in demo["action_segments"]:
                if seg["label"] == action_label:
                    durations.append(seg["duration_s"])
        return np.mean(durations) if durations else 1.0
    
    def _compute_confidence(self, demonstrations, action_label):
        count = sum(
            1 for demo in demonstrations
            for seg in demo["action_segments"]
            if seg["label"] == action_label
        )
        return min(count / len(demonstrations), 1.0)
```

---

## مقاييس الأداء المستهدفة
| المقياس | الهدف |
|---------|-------|
| دقة تصنيف الأفعال (Accuracy) | ≥ 90% |
| F1-Score لكل فعل | ≥ 0.85 |
| دقة كشف الإمساك | ≥ 95% |
| Temporal Precision (±frames) | < ±3 frames |

## المراجع
- Carfì et al. (2021). Hand-object interaction. Frontiers in Robotics and AI.
- Yan et al. (2018). ST-GCN. AAAI.
- Mandlekar et al. (2022). CoRL 2022.
