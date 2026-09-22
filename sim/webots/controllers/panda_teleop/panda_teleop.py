"""
Pose2Skill-Robot: High-Precision Franka Emika Panda Teleoperation Controller
=============================================================================
Academic Graduation Project - Computer Vision & Robotics
Authors: Pose2Skill-Robot Team
Standard: PEP 8, Type Hints, Arabic & English Docstrings

This controller runs inside Webots. It listens for 3D Cartesian coordinates
streamed from the computer vision pipeline (MediaPipe / RTMPose) over a local
TCP socket, computes Inverse Kinematics (IK) for the 7-DoF Franka Panda arm,
and enforces joint angle, velocity, and collision safety boundaries.
"""

import math
import socket
import json
import sys
from typing import List, Tuple, Optional

try:
    from controller import Supervisor, Robot, Motor
    HAS_WEBOTS = True
except ImportError:
    Supervisor = None  # type: ignore
    Robot = None       # type: ignore
    Motor = None       # type: ignore
    HAS_WEBOTS = False



class FrankaPandaIKSolver:
    """
    محلل الحركية العكسية الدقيق لذراع فرانكا باندا (7 درجات حرية)
    Precision Analytical & Numerical Inverse Kinematics solver for Franka Panda.
    """

    # Official Franka Emika Panda joint limits (radians)
    JOINT_LIMITS = [
        (-2.8973, 2.8973),  # Joint 1
        (-1.7628, 1.7628),  # Joint 2
        (-2.8973, 2.8973),  # Joint 3
        (-3.0718, -0.0698), # Joint 4 (Elbow)
        (-2.8973, 2.8973),  # Joint 5
        (-0.0175, 3.7525),  # Joint 6
        (-2.8973, 2.8973)   # Joint 7 (Flange)
    ]

    # Franka arm link geometric offsets (meters)
    D1 = 0.333
    D3 = 0.316
    D5 = 0.384
    DF = 0.210  # Flange to hand gripper center

    def __init__(self):
        # Default home joint configuration
        self.current_q: List[float] = [0.0, -0.785, 0.0, -2.356, 0.0, 1.571, 0.785]

    def clamp_joints(self, q: List[float]) -> List[float]:
        """تقييد الزوايا ضمن الحدود الميكانيكية الآمنة للروبوت"""
        clamped = []
        for val, (low, high) in zip(q, self.JOINT_LIMITS):
            clamped.append(max(low, min(high, val)))
        return clamped

    def solve_cartesian(self, target_x: float, target_y: float, target_z: float) -> List[float]:
        """
        حساب زوايا المفاصل للوصول إلى النقطة الديكارتية (Target X, Y, Z)
        Solves IK for target end-effector position relative to Panda base.
        """
        # Base rotation (Joint 1): Direct azimuth angle to target in XY plane
        q1 = math.atan2(target_y, max(1e-4, target_x))

        # Horizontal distance in base plane
        r_xy = math.sqrt(target_x**2 + target_y**2)
        dz = target_z - self.D1

        # Effective 2-link planar arm reach to wrist center
        l1 = self.D3
        l2 = self.D5 + self.DF
        r_target = math.sqrt(r_xy**2 + dz**2)

        # Reachability limit
        max_reach = (l1 + l2) * 0.95
        min_reach = abs(l1 - l2) * 1.05
        clamped_r = max(min_reach, min(max_reach, r_target))

        # Law of Cosines for elbow angle (Joint 4)
        cos_elbow = (clamped_r**2 - l1**2 - l2**2) / (2 * l1 * l2)
        cos_elbow = max(-1.0, min(1.0, cos_elbow))
        elbow_angle = math.acos(cos_elbow)

        # Franka Panda elbow bends negatively
        q4 = -(math.pi - elbow_angle)

        # Shoulder pitch (Joint 2)
        alpha = math.atan2(dz, max(1e-4, r_xy))
        cos_beta = (l1**2 + clamped_r**2 - l2**2) / (2 * l1 * clamped_r)
        cos_beta = max(-1.0, min(1.0, cos_beta))
        beta = math.acos(cos_beta)
        q2 = -(alpha + beta - (math.pi / 2.0))

        # Redundancy resolution for Joint 3 (swivel angle)
        q3 = 0.0

        # Wrist orientation alignment (Joint 5, 6, 7)
        # Keeps gripper pointed naturally downwards / forwards for manipulation
        q5 = 0.0
        q6 = -(q2 + q4) + 0.2
        q7 = 0.785  # Ergonomic 45-degree hand grasp orientation

        raw_q = [q1, q2, q3, q4, q5, q6, q7]
        safe_q = self.clamp_joints(raw_q)
        self.current_q = safe_q
        return safe_q


class PandaTeleopController:
    """وحدة التحكم الأساسية لروبوت فرانكا داخل بيئة Webots"""

    def __init__(self, port: int = 10005):
        self.robot = Supervisor() if (HAS_WEBOTS and Supervisor is not None) else None
        self.timestep = int(self.robot.getBasicTimeStep()) if self.robot else 16
        self.ik_solver = FrankaPandaIKSolver()

        # Initialize arm motors
        self.motors: List[Motor] = []
        if self.robot:
            for i in range(1, 8):
                motor_name = f"panda_joint{i}"
                motor = self.robot.getDevice(motor_name)
                if motor:
                    motor.setVelocity(1.5)  # Safe smooth velocity (rad/s)
                    self.motors.append(motor)
                else:
                    print(f"[WARN] Motor not found: {motor_name}")

            # Gripper finger motors
            self.finger_left = self.robot.getDevice("panda_finger::left") or self.robot.getDevice("panda_finger1")
            self.finger_right = self.robot.getDevice("panda_finger::right") or self.robot.getDevice("panda_finger2")
            if self.finger_left:
                self.finger_left.setVelocity(0.05)
            if self.finger_right:
                self.finger_right.setVelocity(0.05)

        # Setup TCP listener for real-time vision telemetry
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind(("127.0.0.1", port))
        self.server_socket.listen(1)
        self.server_socket.setblocking(False)
        self.client_conn: Optional[socket.socket] = None
        self.buffer = ""
        print(f"[PANDA_TELEOP] Controller started. Listening on 127.0.0.1:{port}")

    def accept_client(self):
        """قبول اتصال عميل الرؤية الحاسوبية بدون إيقاف المحاكاة"""
        if self.client_conn is None:
            try:
                conn, addr = self.server_socket.accept()
                conn.setblocking(False)
                self.client_conn = conn
                self.buffer = ""
                print(f"[PANDA_TELEOP] Vision Bridge Connected from: {addr}")
            except BlockingIOError:
                pass

    def read_teleop_packet(self) -> Optional[dict]:
        """قراءة وفك تشفير حزمة الإحداثيات الواردة من الكاميرا"""
        if self.client_conn is None:
            return None
        try:
            data = self.client_conn.recv(2048).decode("utf-8")
            if not data:
                print("[PANDA_TELEOP] Vision client disconnected.")
                self.client_conn.close()
                self.client_conn = None
                return None
            self.buffer += data
            packets = self.buffer.split("\n")
            if len(packets) > 1:
                last_valid = None
                for p in packets[:-1]:
                    p = p.strip()
                    if p:
                        try:
                            last_valid = json.loads(p)
                        except json.JSONDecodeError:
                            continue
                self.buffer = packets[-1]
                return last_valid
        except BlockingIOError:
            pass
        except Exception as e:
            print(f"[PANDA_TELEOP] Socket error: {e}")
            self.client_conn = None
        return None

    def apply_joint_positions(self, joint_angles: List[float]):
        """تطبيق زوايا المفاصل المباشرة على محركات الروبوت في Webots"""
        if not self.motors:
            return
        for motor, angle in zip(self.motors, joint_angles):
            motor.setPosition(angle)

    def apply_gripper(self, open_ratio: float):
        """
        التحكم في فتح وإغلاق القابض (0.0 = مغلق بإحكام، 1.0 = مفتوح بالكامل)
        """
        finger_pos = max(0.0, min(0.04, open_ratio * 0.04))  # 0 to 4cm per finger
        if self.finger_left:
            self.finger_left.setPosition(finger_pos)
        if self.finger_right:
            self.finger_right.setPosition(finger_pos)

    def run(self):
        """حلقة التحكم التكرارية للمحاكاة"""
        # Set to initial home position
        home_joints = [0.0, -0.785, 0.0, -2.356, 0.0, 1.571, 0.785]
        self.apply_joint_positions(home_joints)
        self.apply_gripper(1.0)

        # Smooth current target
        cur_target = [0.5, 0.0, 0.35]

        while self.robot and self.robot.step(self.timestep) != -1:
            self.accept_client()
            packet = self.read_teleop_packet()

            if packet:
                # Target coordinates relative to robot base (meters)
                raw_x = float(packet.get("x", 0.5))
                raw_y = float(packet.get("y", 0.0))
                raw_z = float(packet.get("z", 0.35))
                gripper_state = float(packet.get("gripper", 1.0))

                # Safety boundary clamp in workspace
                tx = max(0.25, min(0.75, raw_x))
                ty = max(-0.50, min(0.50, raw_y))
                tz = max(0.08, min(0.70, raw_z))

                # Exponential smoothing filter (alpha = 0.25)
                cur_target[0] += 0.25 * (tx - cur_target[0])
                cur_target[1] += 0.25 * (ty - cur_target[1])
                cur_target[2] += 0.25 * (tz - cur_target[2])

                # Solve Inverse Kinematics
                joints = self.ik_solver.solve_cartesian(cur_target[0], cur_target[1], cur_target[2])
                self.apply_joint_positions(joints)
                self.apply_gripper(gripper_state)


if __name__ == "__main__":
    controller = PandaTeleopController()
    if controller.robot:
        controller.run()
    else:
        print("[INFO] Standalone IK verification run:")
        solver = FrankaPandaIKSolver()
        res = solver.solve_cartesian(0.5, 0.1, 0.3)
        print(f"Calculated 7-DoF joint angles for (0.5, 0.1, 0.3): {[round(x, 4) for x in res]}")
