import os
# Fix OpenCV MSMF grabFrame error (-1072875772) on Windows
os.environ["OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS"] = "0"
os.environ["OPENCV_LOG_LEVEL"] = "ERROR"

"""
Pose2Skill-Robot: Full-Body Teleoperation & Skill Teaching Engine (With Clickable GUI Buttons)
=============================================================================================
Computer Vision Practical Project (Level 4)
Interactive GUI Buttons on screen:
  [ ● بدء التعليم / حفظ المهارة ] (Record / Save Skill)
  [ ▶ تشغيل المهارة المحفوظة ]    (Replay Skill)
  [ 🦿 وضع القرفصاء ]             (Toggle Squat)
  [ ✖ خروج ]                     (Exit Cleanly)
"""

import cv2
import mediapipe as mp
import numpy as np
import socket
import json
import time
import math
import sys
import atexit
import signal
from pathlib import Path
from datetime import datetime


def calculate_angle_3d(a, b, c):
    """Calculates angle ABC (at vertex b) in degrees."""
    ba = np.array([a.x - b.x, a.y - b.y, a.z - b.z])
    bc = np.array([c.x - b.x, c.y - b.y, c.z - b.z])
    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)
    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 0.0
    cosine = np.dot(ba, bc) / (norm_ba * norm_bc)
    cosine = np.clip(cosine, -1.0, 1.0)
    return math.degrees(math.acos(cosine))


class EMAFilter:
    """Exponential Moving Average filter for smooth, jitter-free joint actuation."""
    def __init__(self, alpha: float = 0.35):
        self.alpha = alpha
        self.values = {}

    def filter(self, key: str, val: float) -> float:
        if key not in self.values:
            self.values[key] = val
        else:
            self.values[key] = self.alpha * val + (1.0 - self.alpha) * self.values[key]
        return self.values[key]


class SkillManager:
    """Manages recording, saving, and autonomous, time-synchronized replaying of robot skills."""
    def __init__(self, skills_dir: Path):
        self.skills_dir = skills_dir
        self.skills_dir.mkdir(parents=True, exist_ok=True)
        
        self.is_recording = False
        self.record_start_time = 0.0
        self.current_trajectory = []
        self.skill_counter = 1
        
        self.is_replaying = False
        self.replay_trajectory = []
        self.replay_total_duration = 0.0
        self.replay_start_time = 0.0
        self.replay_name = ""
        self.last_saved_info = ""
        self.status_timer = 0.0
        self.selected_skill_idx = 0

    def start_recording(self):
        self.is_recording = True
        self.is_replaying = False
        self.record_start_time = time.time()
        self.current_trajectory = []
        print("[SKILL] Started Teaching / Recording Skill...")

    def record_frame(self, joints_dict: dict):
        if not self.is_recording:
            return
        t = time.time() - self.record_start_time
        # Record joint angles with exact timestamp
        self.current_trajectory.append({
            "time": round(t, 3),
            "joints": dict(joints_dict)
        })

    def stop_recording(self) -> str:
        if not self.is_recording or len(self.current_trajectory) < 5:
            self.is_recording = False
            return ""

        self.is_recording = False
        duration = time.time() - self.record_start_time
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        skill_filename = f"skill_{timestamp_str}_learned_{self.skill_counter}.json"
        skill_path = self.skills_dir / skill_filename

        skill_data = {
            "id": f"skill_{timestamp_str}",
            "name": f"Learned_Skill_{self.skill_counter}",
            "created_at": datetime.now().isoformat(),
            "duration_seconds": round(duration, 2),
            "num_frames": len(self.current_trajectory),
            "fps": round(len(self.current_trajectory) / max(0.1, duration), 1),
            "trajectory": self.current_trajectory
        }

        with open(skill_path, "w", encoding="utf-8") as f:
            json.dump(skill_data, f, indent=2)

        self.skill_counter += 1
        self.last_saved_info = f"Saved: {skill_filename} ({duration:.1f}s)"
        self.status_timer = time.time() + 4.0
        print(f"[SKILL] Successfully Saved: {skill_path}")
        return skill_filename

    def get_available_skills(self) -> list:
        skills = []
        for file in sorted(self.skills_dir.glob("*.json"), key=os.path.getmtime, reverse=True):
            try:
                with open(file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    skills.append((file.name, data))
            except Exception:
                pass
        return skills

    def get_selected_skill_info(self) -> tuple:
        skills = self.get_available_skills()
        if not skills:
            return 0, 0, "No skills in /skills folder", 0.0
        self.selected_skill_idx = self.selected_skill_idx % len(skills)
        fname, data = skills[self.selected_skill_idx]
        name = data.get("name", fname)
        dur = float(data.get("duration_seconds", 0.0))
        return self.selected_skill_idx + 1, len(skills), name, dur

    def select_next_skill(self):
        skills = self.get_available_skills()
        if skills:
            self.selected_skill_idx = (self.selected_skill_idx + 1) % len(skills)
            idx, total, name, dur = self.get_selected_skill_info()
            self.last_saved_info = f"Selected [{idx}/{total}]: {name} ({dur:.1f}s)"
            self.status_timer = time.time() + 3.0

    def select_prev_skill(self):
        skills = self.get_available_skills()
        if skills:
            self.selected_skill_idx = (self.selected_skill_idx - 1) % len(skills)
            idx, total, name, dur = self.get_selected_skill_info()
            self.last_saved_info = f"Selected [{idx}/{total}]: {name} ({dur:.1f}s)"
            self.status_timer = time.time() + 3.0

    def start_replay_selected(self) -> bool:
        skills = self.get_available_skills()
        if not skills:
            self.last_saved_info = "No skills found to replay!"
            self.status_timer = time.time() + 3.0
            return False

        self.selected_skill_idx = self.selected_skill_idx % len(skills)
        filename, data = skills[self.selected_skill_idx]
        self.replay_trajectory = data.get("trajectory", [])
        if len(self.replay_trajectory) < 2:
            return False

        self.replay_total_duration = float(data.get("duration_seconds", self.replay_trajectory[-1]["time"]))
        self.replay_name = data.get("name", filename)
        self.replay_start_time = time.time()
        self.is_replaying = True
        self.is_recording = False
        print(f"[SKILL] Replaying [{self.selected_skill_idx+1}/{len(skills)}]: {self.replay_name} ({self.replay_total_duration:.1f}s)...")
        return True

    def start_replay_latest(self) -> bool:
        self.selected_skill_idx = 0
        return self.start_replay_selected()

    def get_replay_frame(self) -> dict:
        """Computes time-synchronized, linearly-interpolated joint angles for 100% exact reproduction."""
        if not self.is_replaying or not self.replay_trajectory:
            return None

        elapsed = time.time() - self.replay_start_time

        if elapsed >= self.replay_total_duration:
            # Replay reached end of duration cleanly
            self.is_replaying = False
            self.last_saved_info = f"Replay Finished: {self.replay_name}"
            self.status_timer = time.time() + 3.0
            print("[SKILL] Replay Finished Successfully!")
            return None

        traj = self.replay_trajectory
        # Find segment [idx, idx+1] containing elapsed time
        idx = 0
        while idx < len(traj) - 2 and traj[idx + 1]["time"] < elapsed:
            idx += 1

        f0 = traj[idx]
        f1 = traj[idx + 1]

        t0 = float(f0.get("time", 0.0))
        t1 = float(f1.get("time", t0 + 0.033))
        dt = max(1e-4, t1 - t0)
        alpha = np.clip((elapsed - t0) / dt, 0.0, 1.0)

        j0 = f0.get("joints", {})
        j1 = f1.get("joints", {})

        interpolated_joints = {}
        for k in j0.keys():
            v0 = float(j0[k])
            v1 = float(j1.get(k, v0))
            # Linear interpolation (LERP) between recorded frames
            interpolated_joints[k] = float(v0 + alpha * (v1 - v0))

        # Flag packet as autonomous replay so Webots controller disables laggy smoothing
        interpolated_joints["is_replay"] = True
        return interpolated_joints

    def get_replay_progress(self) -> float:
        if not self.is_replaying or self.replay_total_duration <= 0.0:
            return 0.0
        elapsed = time.time() - self.replay_start_time
        return min(100.0, (elapsed / self.replay_total_duration) * 100.0)


class GUIButton:
    """Clickable screen button for OpenCV interface."""
    def __init__(self, x, y, w, h, text, color, text_color=(255, 255, 255)):
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.text = text
        self.color = color
        self.text_color = text_color
        self.is_hovered = False

    def is_clicked(self, mouse_x, mouse_y) -> bool:
        return (self.x <= mouse_x <= self.x + self.w) and (self.y <= mouse_y <= self.y + self.h)

    def draw(self, img):
        # Draw background with border
        bg_col = tuple(min(255, int(c * 1.2)) for c in self.color) if self.is_hovered else self.color
        cv2.rectangle(img, (self.x, self.y), (self.x + self.w, self.y + self.h), bg_col, -1)
        cv2.rectangle(img, (self.x, self.y), (self.x + self.w, self.y + self.h), (255, 255, 255), 1)

        # Centered text
        font = cv2.FONT_HERSHEY_SIMPLEX
        scale = 0.55
        thickness = 2
        text_size = cv2.getTextSize(self.text, font, scale, thickness)[0]
        tx = self.x + (self.w - text_size[0]) // 2
        ty = self.y + (self.h + text_size[1]) // 2
        cv2.putText(img, self.text, (tx, ty), font, scale, self.text_color, thickness, cv2.LINE_AA)


class VisionNaoBridge:
    def __init__(self, host: str = "127.0.0.1", port: int = 10006, cam_id: int = 0):
        self.host = host
        self.port = port
        self.cam_id = cam_id
        self.window_name = "Pose2Skill-Robot: Full-Body Teleoperation & Skill Teaching"

        scripts_dir = Path(__file__).resolve().parent
        project_root = scripts_dir.parent
        self.skill_manager = SkillManager(project_root / "skills")

        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        self.mp_draw = mp.solutions.drawing_utils
        self.filter = EMAFilter(alpha=0.35)

        self.sock = None
        self.connected = False
        self.cap = None

        self.manual_squat = False
        self.reference_torso_y = None
        self.should_quit = False

        # Clickable Buttons (Positioned at bottom toolbar panel: y from 488 to 530)
        self.btn_teach = GUIButton(10, 488, 155, 42, "[ ● TEACH ]", (0, 160, 50))
        self.btn_prev = GUIButton(172, 488, 48, 42, "<", (90, 90, 90))
        self.btn_replay = GUIButton(226, 488, 140, 42, "[ > REPLAY ]", (180, 110, 0))
        self.btn_next = GUIButton(372, 488, 48, 42, ">", (90, 90, 90))
        self.btn_squat = GUIButton(428, 488, 100, 42, "[ Squat ]", (0, 130, 200))
        self.btn_quit = GUIButton(534, 488, 96, 42, "[ X Exit ]", (40, 40, 180))

        self.buttons = [self.btn_teach, self.btn_prev, self.btn_replay, self.btn_next, self.btn_squat, self.btn_quit]

        atexit.register(self.cleanup)
        try:
            signal.signal(signal.SIGINT, self._sig_handler)
        except Exception:
            pass

    def _sig_handler(self, sig, frame):
        self.cleanup()
        sys.exit(0)

    def on_mouse_event(self, event, x, y, flags, param):
        if event == cv2.EVENT_MOUSEMOVE:
            for b in self.buttons:
                b.is_hovered = b.is_clicked(x, y)

        elif event == cv2.EVENT_LBUTTONDOWN:
            if self.btn_teach.is_clicked(x, y):
                if not self.skill_manager.is_recording:
                    self.skill_manager.start_recording()
                else:
                    self.skill_manager.stop_recording()

            elif self.btn_prev.is_clicked(x, y):
                self.skill_manager.select_prev_skill()

            elif self.btn_replay.is_clicked(x, y):
                self.skill_manager.start_replay_selected()

            elif self.btn_next.is_clicked(x, y):
                self.skill_manager.select_next_skill()

            elif self.btn_squat.is_clicked(x, y):
                self.manual_squat = not self.manual_squat
                print(f"[VISION_NAO] Squat test toggled: {self.manual_squat}")

            elif self.btn_quit.is_clicked(x, y):
                self.should_quit = True

    def cleanup(self):
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None
        cv2.destroyAllWindows()
        if self.sock is not None:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None
        print("[VISION_NAO] Camera and network sockets cleanly released.")

    def connect_webots(self) -> bool:
        if self.connected and self.sock:
            return True
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(0.5)
            self.sock.connect((self.host, self.port))
            self.connected = True
            print(f"[VISION_NAO] Connected to NAO in Webots at {self.host}:{self.port}")
            return True
        except Exception:
            self.connected = False
            if self.sock:
                try:
                    self.sock.close()
                except Exception:
                    pass
            self.sock = None
            return False

    def send_packet(self, data: dict):
        if not self.connected or not self.sock:
            return
        try:
            msg = (json.dumps(data) + "\n").encode("utf-8")
            self.sock.sendall(msg)
        except Exception:
            self.connected = False
            if self.sock:
                try:
                    self.sock.close()
                except Exception:
                    pass
            self.sock = None

    def open_camera(self):
        cap = cv2.VideoCapture(self.cam_id, cv2.CAP_DSHOW)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            ret, test_f = cap.read()
            if ret and test_f is not None:
                return cap
            cap.release()

        cap = cv2.VideoCapture(self.cam_id, cv2.CAP_MSMF)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            ret, test_f = cap.read()
            if ret and test_f is not None:
                return cap
            cap.release()

        cap = cv2.VideoCapture(self.cam_id)
        if cap.isOpened():
            return cap
        return None

    def start(self):
        self.cap = self.open_camera()
        if self.cap is None:
            print("[ERROR] Could not open webcam!")
            return

        cv2.namedWindow(self.window_name)
        cv2.setMouseCallback(self.window_name, self.on_mouse_event)

        print("\n" + "="*70)
        print(" Pose2Skill-Robot: Full-Body Teleoperation & Skill Teaching Engine")
        print(" Clickable GUI Buttons enabled directly on window!")
        print("="*70 + "\n")

        fps_prev_time = time.time()
        fps = 30.0
        last_reconnect = 0.0

        try:
            while not self.should_quit:
                ret, cam_frame = self.cap.read()
                if not ret or cam_frame is None:
                    time.sleep(0.02)
                    continue

                cam_frame = cv2.flip(cam_frame, 1)
                now = time.time()

                fps = 0.9 * fps + 0.1 * (1.0 / max(1e-4, now - fps_prev_time))
                fps_prev_time = now

                if not self.connected and (now - last_reconnect > 2.0):
                    self.connect_webots()
                    last_reconnect = now

                # Canvas with bottom toolbar panel (640 x 585)
                canvas = np.zeros((585, 640, 3), dtype=np.uint8)
                canvas[0:480, 0:640] = cam_frame

                # Toolbar background
                cv2.rectangle(canvas, (0, 480), (640, 585), (22, 22, 22), -1)
                cv2.line(canvas, (0, 480), (640, 480), (70, 70, 70), 2)

                # Update Teach Button Label & Color dynamically
                if self.skill_manager.is_recording:
                    self.btn_teach.text = "[ STOP & SAVE ]"
                    self.btn_teach.color = (0, 0, 200)  # Bright Red
                else:
                    self.btn_teach.text = "[ ● TEACH ]"
                    self.btn_teach.color = (0, 160, 50)  # Green

                # Draw GUI Buttons
                for b in self.buttons:
                    b.draw(canvas)

                # Display Selected Skill Info Bar (Row 2 in toolbar)
                s_idx, s_total, s_name, s_dur = self.skill_manager.get_selected_skill_info()
                if s_total > 0:
                    info_text = f"Skill [{s_idx}/{s_total}]: {s_name} ({s_dur:.1f}s) | Use < > to switch"
                else:
                    info_text = "No skills in library. Click [ ● TEACH ] to create one!"
                cv2.putText(canvas, info_text, (15, 562), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 230, 255), 1, cv2.LINE_AA)

                if self.skill_manager.is_replaying:
                    replay_joints = self.skill_manager.get_replay_frame()
                    if replay_joints:
                        self.send_packet(replay_joints)

                pkt = {
                    "head_yaw": 0.0, "head_pitch": 0.0,
                    "r_shoulder_pitch": 1.4, "r_shoulder_roll": -0.15,
                    "r_elbow_roll": 0.1, "r_elbow_yaw": 0.0,
                    "l_shoulder_pitch": 1.4, "l_shoulder_roll": 0.15,
                    "l_elbow_roll": -0.1, "l_elbow_yaw": 0.0,
                    "r_hand": 0.0, "l_hand": 0.0,
                    "r_hip_yaw_pitch": 0.0, "r_hip_roll": 0.0, "r_hip_pitch": 0.0,
                    "r_knee_pitch": 0.0, "r_ankle_pitch": 0.0, "r_ankle_roll": 0.0,
                    "l_hip_yaw_pitch": 0.0, "l_hip_roll": 0.0, "l_hip_pitch": 0.0,
                    "l_knee_pitch": 0.0, "l_ankle_pitch": 0.0, "l_ankle_roll": 0.0,
                }
                body_detected = False
                legs_mode = "SEATED / UPPER BODY"

                rgb = cv2.cvtColor(cam_frame, cv2.COLOR_BGR2RGB)
                results = self.pose.process(rgb)

                if results.pose_landmarks:
                    body_detected = True
                    lms = results.pose_landmarks.landmark

                    self.mp_draw.draw_landmarks(
                        canvas[0:480, 0:640], results.pose_landmarks, self.mp_pose.POSE_CONNECTIONS,
                        self.mp_draw.DrawingSpec(color=(0, 255, 255), thickness=2, circle_radius=3),
                        self.mp_draw.DrawingSpec(color=(0, 200, 0), thickness=2)
                    )

                    nose = lms[0]
                    l_sh, r_sh = lms[11], lms[12]
                    l_el, r_el = lms[13], lms[14]
                    l_wr, r_wr = lms[15], lms[16]
                    l_pinky, r_pinky = lms[17], lms[18]
                    l_index, r_index = lms[19], lms[20]
                    l_thumb, r_thumb = lms[21], lms[22]
                    l_hip, r_hip = lms[23], lms[24]
                    l_knee, r_knee = lms[25], lms[26]
                    l_ank, r_ank = lms[27], lms[28]

                    if l_sh.x > r_sh.x:
                        u_r_sh, u_r_el, u_r_wr = l_sh, l_el, l_wr
                        u_r_index = r_index
                        u_l_sh, u_l_el, u_l_wr = r_sh, r_el, r_wr
                        u_l_index = l_index
                        u_r_hip, u_r_knee, u_r_ank = l_hip, l_knee, l_ank
                        u_l_hip, u_l_knee, u_l_ank = r_hip, r_knee, r_ank
                    else:
                        u_r_sh, u_r_el, u_r_wr = r_sh, r_el, r_wr
                        u_r_index = l_index
                        u_l_sh, u_l_el, u_l_wr = l_sh, l_el, l_wr
                        u_l_index = r_index
                        u_r_hip, u_r_knee, u_r_ank = r_hip, r_knee, r_ank
                        u_l_hip, u_l_knee, u_l_ank = l_hip, l_knee, l_ank

                    sh_mid_x = (u_l_sh.x + u_r_sh.x) / 2.0
                    sh_mid_y = (u_l_sh.y + u_r_sh.y) / 2.0
                    raw_head_yaw = np.clip((nose.x - sh_mid_x) * 2.8, -1.8, 1.8)
                    raw_head_pitch = np.clip((nose.y - (sh_mid_y - 0.16)) * 2.5, -0.6, 0.5)
                    pkt["head_yaw"] = self.filter.filter("head_yaw", float(raw_head_yaw))
                    pkt["head_pitch"] = self.filter.filter("head_pitch", float(raw_head_pitch))

                    r_ux = u_r_el.x - u_r_sh.x
                    r_uy = u_r_el.y - u_r_sh.y
                    r_len = math.sqrt(r_ux**2 + r_uy**2) + 1e-5
                    r_pitch = math.asin(np.clip(r_uy / r_len, -1.0, 1.0))
                    r_abduction = max(0.0, r_ux / r_len)
                    r_roll = -r_abduction * 1.30 - 0.05
                    r_ang = calculate_angle_3d(u_r_sh, u_r_el, u_r_wr)
                    r_bend = math.radians(max(0.0, 180.0 - r_ang))

                    pkt["r_shoulder_pitch"] = self.filter.filter("r_sp", float(np.clip(r_pitch, -2.0, 2.0)))
                    pkt["r_shoulder_roll"] = self.filter.filter("r_sr", float(np.clip(r_roll, -1.32, 0.1)))
                    pkt["r_elbow_roll"] = self.filter.filter("r_er", float(np.clip(r_bend, 0.04, 1.50)))
                    pkt["r_elbow_yaw"] = self.filter.filter("r_ey", float(np.clip(-0.5 * r_bend, -1.5, 0.0)))

                    l_ux = u_l_el.x - u_l_sh.x
                    l_uy = u_l_el.y - u_l_sh.y
                    l_len = math.sqrt(l_ux**2 + l_uy**2) + 1e-5
                    l_pitch = math.asin(np.clip(l_uy / l_len, -1.0, 1.0))
                    l_abduction = max(0.0, -l_ux / l_len)
                    l_roll = l_abduction * 1.30 + 0.05
                    l_ang = calculate_angle_3d(u_l_sh, u_l_el, u_l_wr)
                    l_bend = math.radians(max(0.0, 180.0 - l_ang))

                    pkt["l_shoulder_pitch"] = self.filter.filter("l_sp", float(np.clip(l_pitch, -2.0, 2.0)))
                    pkt["l_shoulder_roll"] = self.filter.filter("l_sr", float(np.clip(l_roll, -0.1, 1.32)))
                    pkt["l_elbow_roll"] = self.filter.filter("l_er", float(np.clip(-l_bend, -1.50, -0.04)))
                    pkt["l_elbow_yaw"] = self.filter.filter("l_ey", float(np.clip(0.5 * l_bend, 0.0, 1.5)))

                    pkt["r_hand"] = 0.0
                    pkt["l_hand"] = 0.0

                    knees_visible = (u_r_knee.visibility > 0.20 and u_l_knee.visibility > 0.20)
                    r_hip_p = 0.0
                    l_hip_p = 0.0
                    r_knee_p = 0.0
                    l_knee_p = 0.0
                    r_ank_p = 0.0
                    l_ank_p = 0.0

                    if knees_visible:
                        ank_diff = u_l_ank.y - u_r_ank.y
                        r_knee_ang = calculate_angle_3d(u_r_hip, u_r_knee, u_r_ank)
                        r_bend_k = math.radians(max(0.0, 180.0 - r_knee_ang))
                        l_knee_ang = calculate_angle_3d(u_l_hip, u_l_knee, u_l_ank)
                        l_bend_k = math.radians(max(0.0, 180.0 - l_knee_ang))

                        if ank_diff > 0.06:
                            legs_mode = "RIGHT LEG LIFT / KICK"
                            r_knee_p = float(np.clip(r_bend_k * 1.1, 0.4, 1.6))
                            r_hip_p = -r_knee_p * 0.75
                            r_ank_p = -0.15
                            l_knee_p = 0.05
                            l_hip_p = 0.0
                        elif ank_diff < -0.06:
                            legs_mode = "LEFT LEG LIFT / KICK"
                            l_knee_p = float(np.clip(l_bend_k * 1.1, 0.4, 1.6))
                            l_hip_p = -l_knee_p * 0.75
                            l_ank_p = -0.15
                            r_knee_p = 0.05
                            r_hip_p = 0.0
                        else:
                            legs_mode = "FULL BODY (Both Legs Balanced)"
                            r_knee_p = float(np.clip(r_bend_k * 0.95, 0.0, 1.30))
                            l_knee_p = float(np.clip(l_bend_k * 0.95, 0.0, 1.30))
                            r_hip_p = -r_knee_p * 0.52
                            l_hip_p = -l_knee_p * 0.52
                            r_ank_p = -r_knee_p * 0.48
                            l_ank_p = -l_knee_p * 0.48

                    elif self.manual_squat:
                        legs_mode = "SQUAT DEMO (Press Squat btn to release)"
                        r_knee_p = 0.95
                        l_knee_p = 0.95
                        r_hip_p = -0.50
                        l_hip_p = -0.50
                    else:
                        torso_y = sh_mid_y
                        if self.reference_torso_y is None:
                            self.reference_torso_y = torso_y
                        else:
                            self.reference_torso_y = 0.98 * self.reference_torso_y + 0.02 * torso_y

                        torso_drop = torso_y - self.reference_torso_y
                        if torso_drop > 0.04:
                            legs_mode = "SEATED SQUAT DETECTED"
                            squat_factor = np.clip((torso_drop - 0.04) * 8.0, 0.0, 1.2)
                            r_knee_p = float(squat_factor)
                            l_knee_p = float(squat_factor)
                            r_hip_p = -r_knee_p * 0.52
                            l_hip_p = -l_knee_p * 0.52
                            r_ank_p = -r_knee_p * 0.48
                            l_ank_p = -l_knee_p * 0.48
                        else:
                            legs_mode = "SEATED (Click Squat btn to test)"

                    pkt["r_knee_pitch"] = self.filter.filter("r_knee", r_knee_p)
                    pkt["r_hip_pitch"] = self.filter.filter("r_hip", r_hip_p)
                    pkt["r_ankle_pitch"] = self.filter.filter("r_ank", r_ank_p)

                    pkt["l_knee_pitch"] = self.filter.filter("l_knee", l_knee_p)
                    pkt["l_hip_pitch"] = self.filter.filter("l_hip", l_hip_p)
                    pkt["l_ankle_pitch"] = self.filter.filter("l_ank", l_ank_p)

                    if not self.skill_manager.is_replaying:
                        self.send_packet(pkt)

                    if self.skill_manager.is_recording:
                        self.skill_manager.record_frame(pkt)

                # Draw Visual Status Card on Top
                cv2.rectangle(canvas, (10, 10), (620, 105), (15, 15, 15), -1)
                border_col = (0, 0, 255) if self.skill_manager.is_recording else ((255, 180, 0) if self.skill_manager.is_replaying else (0, 255, 0))
                cv2.rectangle(canvas, (10, 10), (620, 105), border_col, 2)

                cv2.putText(canvas, f"Pose2Skill-Robot: LfD Skill Engine | FPS: {int(fps)}", (20, 32),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)

                if self.skill_manager.is_recording:
                    rec_dur = now - self.skill_manager.record_start_time
                    frames_cnt = len(self.skill_manager.current_trajectory)
                    status_str = f"[REC] TEACHING... {rec_dur:.1f}s | {frames_cnt} pts (Click Stop to Save)"
                    status_col = (0, 50, 255)
                elif self.skill_manager.is_replaying:
                    prog = self.skill_manager.get_replay_progress()
                    status_str = f"[PLAY] AUTONOMOUS REPLAY: {self.skill_manager.replay_name} ({int(prog)}%)"
                    status_col = (255, 200, 0)
                else:
                    status_str = "NAO WEBOTS: CONNECTED" if self.connected else "NAO WEBOTS: DISCONNECTED"
                    status_col = (0, 255, 0) if self.connected else (0, 140, 255)

                cv2.putText(canvas, status_str, (20, 58),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, status_col, 2, cv2.LINE_AA)

                if now < self.skill_manager.status_timer and self.skill_manager.last_saved_info:
                    cv2.putText(canvas, self.skill_manager.last_saved_info, (20, 84),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.50, (0, 255, 255), 1, cv2.LINE_AA)
                else:
                    track_str = "FULL BODY (33 pts)" if body_detected else "Searching for user..."
                    cv2.putText(canvas, f"Tracking: {track_str} | Legs: {legs_mode}", (20, 84),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 255, 200), 1, cv2.LINE_AA)

                cv2.imshow(self.window_name, canvas)

                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break

        finally:
            self.cleanup()


if __name__ == "__main__":
    bridge = VisionNaoBridge()
    bridge.start()
