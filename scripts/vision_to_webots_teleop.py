"""
Pose2Skill-Robot: Vision-to-Webots Teleoperation Bridge
======================================================
Academic Graduation Project - Computer Vision & Robotics
Authors: Pose2Skill-Robot Team
Standards: PEP 8, Type Hints, One-Euro Filter Smoothing

Captures live webcam video, extracts 3D hand/arm landmarks via MediaPipe Hands,
computes Pinch-to-Grasp detection, maps Cartesian coordinates to Franka Panda's
reachable workspace, and streams telemetry over TCP to the Webots simulation controller.
"""

import sys
import time
import math
import socket
import json
from typing import Tuple, Optional
import cv2
import mediapipe as mp


class OneEuroFilter:
    """
    مرشح ون إيورو الرياضي لتنعيم الإحداثيات وإزالة الارتجاف مع الحفاظ على سرعة الاستجابة
    One-Euro Filter for jitter reduction with adaptive cutoff frequency.
    Reference: Casiez, Roussel, & Vogel (2012), CHI 2012.
    """

    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.05, d_cutoff: float = 1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self.x_prev: Optional[float] = None
        self.dx_prev: float = 0.0
        self.t_prev: Optional[float] = None

    def filter(self, x: float, t: float) -> float:
        if self.t_prev is None:
            self.x_prev = x
            self.dx_prev = 0.0
            self.t_prev = t
            return x

        dt = max(1e-3, t - self.t_prev)
        # Derivative estimation
        dx = (x - self.x_prev) / dt if self.x_prev is not None else 0.0
        a_d = self._smoothing_factor(dt, self.d_cutoff)
        dx_hat = a_d * dx + (1.0 - a_d) * self.dx_prev

        # Adaptive cutoff
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)
        a = self._smoothing_factor(dt, cutoff)
        x_hat = a * x + (1.0 - a) * (self.x_prev if self.x_prev is not None else x)

        self.x_prev = x_hat
        self.dx_prev = dx_hat
        self.t_prev = t
        return x_hat

    @staticmethod
    def _smoothing_factor(dt: float, cutoff: float) -> float:
        r = 2.0 * math.pi * cutoff * dt
        return r / (r + 1.0)


class VisionWebotsTeleopBridge:
    """جسر الاتصال بين كاميرا الرؤية الحاسوبية ومحاكي Webots"""

    # Franka Panda workspace limits (meters)
    X_MIN, X_MAX = 0.35, 0.70  # Forward reach
    Y_MIN, Y_MAX = -0.40, 0.40 # Left-Right span
    Z_MIN, Z_MAX = 0.12, 0.55  # Height above table

    def __init__(self, host: str = "127.0.0.1", port: int = 10005, cam_id: int = 0):
        self.host = host
        self.port = port
        self.cam_id = cam_id

        # One-Euro filters for X, Y, Z
        self.filter_x = OneEuroFilter(min_cutoff=0.8, beta=0.04)
        self.filter_y = OneEuroFilter(min_cutoff=0.8, beta=0.04)
        self.filter_z = OneEuroFilter(min_cutoff=0.8, beta=0.04)

        # MediaPipe initialization
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        self.mp_draw = mp.solutions.drawing_utils

        # TCP client socket
        self.sock: Optional[socket.socket] = None
        self.connected = False

    def connect_webots(self) -> bool:
        """محاولة الاتصال بمتحكم Webots"""
        if self.connected and self.sock:
            return True
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.sock.settimeout(0.5)
            self.sock.connect((self.host, self.port))
            self.sock.setblocking(False)
            self.connected = True
            print(f"[VISION_BRIDGE] Successfully connected to Webots at {self.host}:{self.port}")
            return True
        except Exception:
            self.connected = False
            self.sock = None
            return False

    def send_teleop_packet(self, x: float, y: float, z: float, gripper: float):
        """إرسال حزمة الإحداثيات وحالة القابض إلى Webots"""
        if not self.connected or not self.sock:
            return
        payload = json.dumps({
            "x": round(x, 4),
            "y": round(y, 4),
            "z": round(z, 4),
            "gripper": round(gripper, 2)
        }) + "\n"
        try:
            self.sock.sendall(payload.encode("utf-8"))
        except Exception as e:
            print(f"[VISION_BRIDGE] Connection lost: {e}")
            self.connected = False
            self.sock = None

    def start(self):
        """بدء التقاط الفيديو والبث التفاعلي المباشر"""
        cap = cv2.VideoCapture(self.cam_id)
        if not cap.isOpened():
            print(f"[ERROR] Could not open camera {self.cam_id}")
            return

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        print("\n" + "="*60)
        print(" Pose2Skill-Robot: Vision-to-Webots Teleoperation Bridge")
        print(" Press 'q' to Quit | Press 'r' to Reconnect to Webots")
        print(" Pinch Thumb & Index together to GRASP | Release to OPEN")
        print("="*60 + "\n")

        fps_prev_time = time.time()
        fps = 30.0
        reconnect_interval = 2.0
        last_reconnect_attempt = 0.0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    time.sleep(0.01)
                    continue

                # Mirror horizontally for intuitive user interaction
                frame = cv2.flip(frame, 1)
                h, w, _ = frame.shape
                now = time.time()

                # Calculate FPS
                fps = 0.9 * fps + 0.1 * (1.0 / max(1e-4, now - fps_prev_time))
                fps_prev_time = now

                # Auto-reconnect to Webots if not connected
                if not self.connected and (now - last_reconnect_attempt > reconnect_interval):
                    self.connect_webots()
                    last_reconnect_attempt = now

                # Convert to RGB for MediaPipe
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = self.hands.process(rgb)

                target_x, target_y, target_z = 0.50, 0.0, 0.35
                gripper_val = 1.0  # Open by default
                hand_detected = False

                if results.multi_hand_landmarks:
                    hand_detected = True
                    hand_lms = results.multi_hand_landmarks[0]
                    self.mp_draw.draw_landmarks(frame, hand_lms, self.mp_hands.HAND_CONNECTIONS)

                    # Landmark 0: Wrist, 4: Thumb Tip, 8: Index Tip
                    wrist = hand_lms.landmark[0]
                    thumb_tip = hand_lms.landmark[4]
                    index_tip = hand_lms.landmark[8]

                    # Pinch distance calculation (Euclidean)
                    pinch_dist = math.sqrt(
                        (thumb_tip.x - index_tip.x)**2 +
                        (thumb_tip.y - index_tip.y)**2 +
                        (thumb_tip.z - index_tip.z)**2
                    )

                    # Pinch threshold: < 0.065 implies closed fingers
                    if pinch_dist < 0.065:
                        gripper_val = 0.0  # Close Gripper
                    else:
                        gripper_val = 1.0  # Open Gripper

                    # Map normalized 2D camera coordinates to Franka workspace
                    # Wrist X (horizontal [0, 1]) -> Robot Y (left/right [-0.4, 0.4])
                    norm_y = (wrist.x - 0.5) * 2.0  # -1 to +1
                    raw_y = norm_y * 0.35

                    # Wrist Y (vertical [0, 1]) -> Robot Z (height [0.12, 0.55])
                    norm_z = (0.8 - wrist.y) / 0.6  # lower on screen = lower Z
                    raw_z = self.Z_MIN + max(0.0, min(1.0, norm_z)) * (self.Z_MAX - self.Z_MIN)

                    # Hand size depth proxy (wrist to middle knuckle distance) -> Robot X (forward)
                    knuckle = hand_lms.landmark[9]
                    hand_scale = math.sqrt((wrist.x - knuckle.x)**2 + (wrist.y - knuckle.y)**2)
                    norm_x = (hand_scale - 0.12) / 0.18
                    raw_x = self.X_MIN + max(0.0, min(1.0, norm_x)) * (self.X_MAX - self.X_MIN)

                    # Apply One-Euro smoothing filter
                    target_x = self.filter_x.filter(raw_x, now)
                    target_y = self.filter_y.filter(raw_y, now)
                    target_z = self.filter_z.filter(raw_z, now)

                    # Draw pinch feedback on screen
                    p1 = (int(thumb_tip.x * w), int(thumb_tip.y * h))
                    p2 = (int(index_tip.x * w), int(index_tip.y * h))
                    pinch_color = (0, 0, 255) if gripper_val == 0.0 else (0, 255, 0)
                    cv2.line(frame, p1, p2, pinch_color, 3)

                    # Send stream to Webots
                    self.send_teleop_packet(target_x, target_y, target_z, gripper_val)

                # Render HUD Information
                status_color = (0, 220, 0) if self.connected else (0, 100, 255)
                status_text = "WEBOTS: CONNECTED" if self.connected else "WEBOTS: WAITING (Start Webots)"
                cv2.rectangle(frame, (10, 10), (380, 135), (20, 20, 20), -1)
                cv2.rectangle(frame, (10, 10), (380, 135), status_color, 2)

                cv2.putText(frame, f"Pose2Skill-Robot Bridge | FPS: {int(fps)}", (20, 32),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
                cv2.putText(frame, status_text, (20, 57),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, status_color, 2)

                if hand_detected:
                    grip_str = "CLOSED (GRASP)" if gripper_val == 0.0 else "OPEN"
                    cv2.putText(frame, f"Target: X={target_x:.2f} Y={target_y:.2f} Z={target_z:.2f} m",
                                (20, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (0, 240, 255), 1)
                    cv2.putText(frame, f"Gripper: {grip_str}", (20, 115),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.58, (0, 255, 120) if gripper_val == 1.0 else (0, 0, 255), 2)
                else:
                    cv2.putText(frame, "Show Hand to Control Robot", (20, 95),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (160, 160, 160), 1)

                cv2.imshow("Pose2Skill-Robot: Webots Teleop Bridge", frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('r'):
                    self.connect_webots()

        finally:
            cap.release()
            cv2.destroyAllWindows()
            if self.sock:
                self.sock.close()
            print("[VISION_BRIDGE] Teleoperation stopped cleanly.")


if __name__ == "__main__":
    bridge = VisionWebotsTeleopBridge()
    bridge.start()
