---
name: evaluation-benchmarking
description: >
  مهارة التقييم والمقارنة المعيارية لنظام Pose2Skill-Robot. تشمل بروتوكول
  التجارب، حساب مقاييس SR/TCT/Jerk/CETI، مقارنة النتائج مع خطوط الأساس،
  والتحليل الإحصائي. تُفعَّل عند إجراء التجارب وتوثيق النتائج.
---

# مهارة التقييم والمقارنة المعيارية
# Skill: Evaluation & Benchmarking Protocol

## المقاييس المعيارية السبعة (7 Quantitative Metrics)

### 1. معدل نجاح المهمة (Task Success Rate - SR)
```python
def compute_success_rate(results: list[bool]) -> float:
    """SR = (N_successful / N_total) × 100%"""
    return (sum(results) / len(results)) * 100.0
```

### 2. زمن إنجاز المهمة (Task Completion Time - TCT)
```python
import time

def measure_tct(execution_fn) -> float:
    """قياس الوقت من لحظة بدء التنفيذ حتى اكتمال المهمة."""
    start = time.perf_counter()
    success = execution_fn()
    end = time.perf_counter()
    return (end - start) if success else float("inf")
```

### 3. مسافة Fréchet للمسار (Trajectory Fréchet Distance)
```python
import numpy as np

def frechet_distance(P: np.ndarray, Q: np.ndarray) -> float:
    """
    حساب مسافة Fréchet الكلاسيكية بين مسارين.
    
    Args:
        P: المسار المطلوب [N, 3]
        Q: المسار الفعلي [M, 3]
    Returns:
        float: مسافة Fréchet (أصغر = أفضل)
    """
    n, m = len(P), len(Q)
    ca = np.full((n, m), -1.0)
    
    def c(i: int, j: int) -> float:
        if ca[i, j] > -1:
            return ca[i, j]
        d = np.linalg.norm(P[i] - Q[j])
        if i == 0 and j == 0:
            ca[i, j] = d
        elif i > 0 and j == 0:
            ca[i, j] = max(c(i-1, 0), d)
        elif i == 0 and j > 0:
            ca[i, j] = max(c(0, j-1), d)
        else:
            ca[i, j] = max(min(c(i-1, j), c(i-1, j-1), c(i, j-1)), d)
        return ca[i, j]
    
    return c(n-1, m-1)
```

### 4. معامل الاهتزاز (Kinematic Jerk Metric)
```python
def compute_jerk(trajectory: np.ndarray, dt: float = 0.05) -> float:
    """
    Jerk = ∫ Σ (d³qⱼ/dt³)² dt
    
    Args:
        trajectory: [T, DoF] — زوايا المفاصل عبر الزمن
        dt: خطوة الوقت بالثانية
    Returns:
        float: قيمة Jerk الإجمالية (أقل = أسلس)
    """
    vel = np.gradient(trajectory, dt, axis=0)
    acc = np.gradient(vel, dt, axis=0)
    jerk = np.gradient(acc, dt, axis=0)
    return float(np.sum(jerk ** 2) * dt)
```

### 5. مؤشر تعميم التجسيد (CETI)
```python
def compute_ceti(sr_target: float, sr_source: float) -> float:
    """
    CETI = (SR_UR5e / SR_Franka) × 100%
    
    يقيس مدى ثبات أداء المهارة عند نقلها بين الروبوتين.
    """
    if sr_source == 0:
        return 0.0
    return (sr_target / sr_source) * 100.0
```

### 6. كفاءة العينات (Demonstration Sample Efficiency)
```python
def run_few_shot_experiment(
    pipeline, task_name: str, k_values: list[int] = [1, 3, 5, 10]
) -> dict:
    """اختبار الأداء مع عدد متفاوت من العروض البشرية."""
    results = {}
    for k in k_values:
        demos = load_demonstrations(task_name, num=k)
        sr = run_task_evaluation(pipeline, demos, num_trials=20)
        results[k] = sr
        print(f"K={k} demos → SR={sr:.1f}%")
    return results
```

### 7. الكفاءة الحوسبية (Computational Efficiency)
```python
import time
import psutil
import GPUtil

class PerformanceMonitor:
    def measure_fps(self, pipeline_fn, num_frames: int = 100) -> float:
        start = time.perf_counter()
        for _ in range(num_frames):
            pipeline_fn()
        elapsed = time.perf_counter() - start
        return num_frames / elapsed
    
    def measure_gpu_usage(self) -> dict:
        gpus = GPUtil.getGPUs()
        if gpus:
            gpu = gpus[0]
            return {"vram_used_mb": gpu.memoryUsed, "utilization_pct": gpu.load * 100}
        return {}
    
    def measure_planning_time(self, planner, num_trials: int = 50) -> float:
        times = []
        for _ in range(num_trials):
            start = time.perf_counter()
            planner.plan()
            times.append(time.perf_counter() - start)
        return float(np.mean(times))
```

---

## بروتوكول التجارب (Experiment Protocol)

### المهام الأربع المعيارية

| المهمة | الوصف | شرط النجاح |
|--------|-------|------------|
| **T1**: Pick-and-Place | التقاط مكعب ووضعه في منطقة هدف | `dist(object, target) < 2cm` |
| **T2**: Obstacle Relocation | نقل كأس متجاوزاً عائقاً غير موجود في الفيديو | لا تصادم + وصول للهدف |
| **T3**: Orientation Transfer | التقاط مفك وإبقاؤه بزاوية محددة | `orientation_error < 10°` |
| **T4**: Sequential Stacking | رص 3 مكعبات فوق بعضها | 3 مكعبات مرصوصة بنجاح |

### خطوط الأساس المقارنة

```python
# Baseline 1: Direct Joint Mapping
class BaselineDirectJointMapping:
    """محاكاة مباشرة لزوايا مفاصل الإنسان في الروبوت."""
    
    def retarget(self, human_joints: np.ndarray) -> np.ndarray:
        # تحويل هندسي بسيط بدون فهم الهدف
        scale = self.robot_arm_length / self.human_arm_length
        return human_joints * scale  # ❌ يفشل مع اختلاف DoF

# Baseline 2: Cartesian Trajectory Cloning
class BaselineCartesianCloning:
    """تكرار مسار يد الإنسان حرفياً دون استخلاص الأجسام."""
    
    def clone_trajectory(self, hand_path: np.ndarray) -> np.ndarray:
        # ترجمة إحداثيات اليد مباشرة
        return hand_path + self.offset  # ❌ يفشل مع العوائق الجديدة

# Proposed Method
class Pose2SkillPipeline:
    """النهج المقترح: Skill Graph + MoveIt 2"""
    pass  # ✅ الحل الكامل
```

### سكريبت التجربة الكاملة
```python
# scripts/run_benchmark.py
#!/usr/bin/env python3
"""
سكريبت تشغيل التجارب المعيارية لمشروع Pose2Skill-Robot.
Run complete benchmark experiments for Pose2Skill-Robot.
"""
import csv
import json
from datetime import datetime
import numpy as np

TASKS = ["pick_place", "obstacle_relocation", "orientation_transfer", "sequential_stacking"]
ROBOTS = ["franka_panda", "ur5e"]
BASELINES = ["direct_joint", "cartesian_clone", "pose2skill"]
NUM_TRIALS = 20  # عدد التكرارات لكل حالة

def run_all_experiments():
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    results_file = f"experiments/logs/benchmark_{timestamp}.csv"
    
    with open(results_file, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "task", "robot", "method", "trial",
            "success", "tct_s", "jerk", "sr_pct"
        ])
        writer.writeheader()
        
        for task in TASKS:
            for robot in ROBOTS:
                for method in BASELINES:
                    successes = []
                    
                    for trial in range(NUM_TRIALS):
                        print(f"[{task}][{robot}][{method}] Trial {trial+1}/{NUM_TRIALS}")
                        
                        result = run_single_trial(task, robot, method)
                        successes.append(result["success"])
                        
                        writer.writerow({
                            "task": task, "robot": robot,
                            "method": method, "trial": trial,
                            "success": result["success"],
                            "tct_s": result["tct_s"],
                            "jerk": result["jerk"],
                            "sr_pct": compute_success_rate(successes),
                        })
                        f.flush()
    
    print(f"\n✅ Benchmark complete! Results saved to: {results_file}")
    generate_summary_table(results_file)

def generate_summary_table(results_file: str):
    """توليد جدول ملخص النتائج."""
    import pandas as pd
    df = pd.read_csv(results_file)
    
    summary = df.groupby(["task", "robot", "method"]).agg({
        "success": "mean",
        "tct_s": "mean",
        "jerk": "mean",
    }).round(3)
    
    print("\n" + "="*80)
    print("BENCHMARK SUMMARY TABLE")
    print("="*80)
    print(summary.to_string())
    
    # حفظ الجدول
    summary.to_csv(results_file.replace(".csv", "_summary.csv"))
    print(f"\nSummary saved!")
```

---

## جدول النتائج المستهدفة (Expected Results)

| المهمة | Baseline 1 (SR%) | Baseline 2 (SR%) | Pose2Skill (SR%) |
|--------|:---:|:---:|:---:|
| Pick-and-Place | ~45% | ~60% | **≥85%** |
| Obstacle Relocation | ~10% | ~20% | **≥75%** |
| Orientation Transfer | ~30% | ~50% | **≥80%** |
| Sequential Stacking | ~5% | ~15% | **≥70%** |

| مؤشر CETI | Franka→UR5e |
|----------|:---:|
| Baseline 1 | ~40% |
| Baseline 2 | ~55% |
| Pose2Skill | **≥85%** |

---

## المراجع
- Mandlekar et al. (2022). CoRL 2022.
- Lum et al. (2025). CoRL 2025.
