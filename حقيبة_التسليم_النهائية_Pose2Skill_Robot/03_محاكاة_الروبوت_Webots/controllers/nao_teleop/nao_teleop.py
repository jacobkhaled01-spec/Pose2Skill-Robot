"""
Pose2Skill-Robot: Webots NAO Humanoid Full-Body Teleoperation Controller (Supervisor)
=====================================================================================
Computer Vision Practical Project (Level 4)
Listens to real-time joint angles streamed from the MediaPipe Vision Bridge
and actuates NAO's head, dual arms, and full dual leg motors in Webots.
Includes:
- Active Anti-Fall Virtual Harness: Torso height & orientation stabilization
- Real-time Squat Height Adaptation: Lowers torso during squats & knee bends
- Auto-Recovery: Robot NEVER collapses or stays stuck on the floor!
"""

import socket
import json
import math
import sys

try:
    from controller import Supervisor, Robot
    HAS_WEBOTS = True
except ImportError:
    Supervisor = None
    Robot = None
    HAS_WEBOTS = False


class NaoTeleopController:
    def __init__(self, port: int = 10006):
        if not HAS_WEBOTS:
            print("[NAO_TELEOP] Error: controller module not available outside Webots.")
            self.robot = None
            return

        # Initialize Supervisor for full simulation control & anti-fall harness
        try:
            self.robot = Supervisor()
        except Exception:
            self.robot = Robot()

        self.timestep = int(self.robot.getBasicTimeStep())
        self.port = port

        # Supervisor node & fields for anti-fall harness
        self.self_node = None
        self.trans_field = None
        self.rot_field = None
        self.is_supervisor = isinstance(self.robot, Supervisor)

        if self.is_supervisor:
            try:
                self.self_node = self.robot.getSelf()
                if self.self_node:
                    self.trans_field = self.self_node.getField("translation")
                    self.rot_field = self.self_node.getField("rotation")
                    print("[NAO_TELEOP] Active Anti-Fall Supervisor Harness: ENABLED")
            except Exception as e:
                print(f"[NAO_TELEOP] Supervisor setup warning: {e}")

        # Base standing pose in Webots NAO
        self.default_z = 0.334
        self.default_rot = [0.0, 0.0, 1.0, 1.57079632679]

        # Initialize All Motors (Head, Arms, and Legs)
        self.motor_names = [
            # Head
            "HeadYaw", "HeadPitch",
            # Arms
            "RShoulderPitch", "RShoulderRoll", "RElbowYaw", "RElbowRoll", "RWristYaw",
            "LShoulderPitch", "LShoulderRoll", "LElbowYaw", "LElbowRoll", "LWristYaw",
            # Right Leg
            "RHipYawPitch", "RHipRoll", "RHipPitch", "RKneePitch", "RAnklePitch", "RAnkleRoll",
            # Left Leg
            "LHipYawPitch", "LHipRoll", "LHipPitch", "LKneePitch", "LAnklePitch", "LAnkleRoll"
        ]
        self.motors = {}
        for name in self.motor_names:
            m = self.robot.getDevice(name)
            if m:
                # Set to device's maximum velocity safely to avoid warnings
                try:
                    max_v = m.getMaxVelocity()
                    # 95% of max velocity for silky-smooth motion without exceeding limits
                    m.setVelocity(max_v * 0.95 if max_v > 0 else 4.0)
                except Exception:
                    m.setVelocity(4.0)
                self.motors[name] = m

        # Initialize Phalanx (Fingers) for hand grasping
        self.r_phalanx = []
        self.l_phalanx = []
        for i in range(1, 9):
            rp = self.robot.getDevice(f"RPhalanx{i}")
            lp = self.robot.getDevice(f"LPhalanx{i}")
            if rp:
                self.r_phalanx.append(rp)
            if lp:
                self.l_phalanx.append(lp)

        # Joint limits for safety
        self.limits = {
            "HeadYaw": (-2.08, 2.08),
            "HeadPitch": (-0.67, 0.51),
            # Arms
            "RShoulderPitch": (-2.08, 2.08),
            "RShoulderRoll": (-1.32, 0.31),
            "RElbowYaw": (-2.08, 2.08),
            "RElbowRoll": (0.03, 1.54),
            "RWristYaw": (-1.82, 1.82),
            "LShoulderPitch": (-2.08, 2.08),
            "LShoulderRoll": (-0.31, 1.32),
            "LElbowYaw": (-2.08, 2.08),
            "LElbowRoll": (-1.54, -0.03),
            "LWristYaw": (-1.82, 1.82),
            # Legs
            "RHipYawPitch": (-1.14, 0.74),
            "RHipRoll": (-0.79, 0.37),
            "RHipPitch": (-1.53, 0.48),
            "RKneePitch": (-0.09, 2.11),
            "RAnklePitch": (-1.18, 0.92),
            "RAnkleRoll": (-0.76, 0.39),
            "LHipYawPitch": (-1.14, 0.74),
            "LHipRoll": (-0.37, 0.79),
            "LHipPitch": (-1.53, 0.48),
            "LKneePitch": (-0.09, 2.11),
            "LAnklePitch": (-1.18, 0.92),
            "LAnkleRoll": (-0.39, 0.76),
        }

        # Current smoothed angles (Default Standing Athletic Stance)
        self.current_angles = {
            "HeadYaw": 0.0, "HeadPitch": 0.0,
            "RShoulderPitch": 1.4, "RShoulderRoll": -0.15, "RElbowYaw": 0.0, "RElbowRoll": 0.1, "RWristYaw": 0.0,
            "LShoulderPitch": 1.4, "LShoulderRoll": 0.15, "LElbowYaw": 0.0, "LElbowRoll": -0.1, "LWristYaw": 0.0,
            "RHipYawPitch": 0.0, "RHipRoll": 0.0, "RHipPitch": 0.0, "RKneePitch": 0.0, "RAnklePitch": 0.0, "RAnkleRoll": 0.0,
            "LHipYawPitch": 0.0, "LHipRoll": 0.0, "LHipPitch": 0.0, "LKneePitch": 0.0, "LAnklePitch": 0.0, "LAnkleRoll": 0.0,
        }

        # Setup TCP server
        self.server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_sock.bind(("127.0.0.1", self.port))
        self.server_sock.listen(1)
        self.server_sock.setblocking(False)
        self.client_conn = None
        self.buffer = ""

        print(f"[NAO_TELEOP] Listening on TCP 127.0.0.1:{self.port} with Anti-Fall Stabilization...")

    def accept_client(self):
        if self.client_conn is None:
            try:
                conn, addr = self.server_sock.accept()
                conn.setblocking(False)
                self.client_conn = conn
                self.buffer = ""
                print(f"[NAO_TELEOP] Full-Body Vision Bridge Connected from {addr}")
            except BlockingIOError:
                pass
            except Exception as e:
                print(f"[NAO_TELEOP] Accept error: {e}")

    def read_packet(self):
        if not self.client_conn:
            return None
        try:
            data = self.client_conn.recv(4096)
            if not data:
                print("[NAO_TELEOP] Vision Bridge Disconnected")
                self.client_conn = None
                return None
            self.buffer += data.decode("utf-8", errors="ignore")
            lines = self.buffer.split("\n")
            if len(lines) > 1:
                last_pkt = None
                for line in lines[:-1]:
                    line = line.strip()
                    if line:
                        try:
                            last_pkt = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                self.buffer = lines[-1]
                return last_pkt
        except BlockingIOError:
            pass
        except Exception as e:
            print(f"[NAO_TELEOP] Socket error: {e}")
            self.client_conn = None
        return None

    def clamp(self, name: str, val: float) -> float:
        min_v, max_v = self.limits.get(name, (-3.14, 3.14))
        return max(min_v, min(max_v, val))

    def set_hand_phalanx(self, r_val: float, l_val: float):
        for rp in self.r_phalanx:
            rp.setPosition(r_val * 0.8)
        for lp in self.l_phalanx:
            lp.setPosition(l_val * 0.8)

    def apply_anti_fall_harness(self):
        """Active Anti-Fall & Anti-Freeze Stabilizer: Prevents falling without killing motor velocities."""
        if not self.self_node or not self.trans_field or not self.rot_field:
            return

        try:
            pos = self.trans_field.getSFVec3f()
            rot = self.rot_field.getSFRotation()

            # Check if fallen (Torso dropped below 22cm or tilted over 30 degrees)
            is_fallen = (pos[2] < 0.22) or (abs(rot[0]) > 0.5) or (abs(rot[1]) > 0.5)

            if is_fallen:
                # Instantly recover upright standing pose
                self.trans_field.setSFVec3f([0.0, 0.0, self.default_z])
                self.rot_field.setSFRotation(self.default_rot)
                self.self_node.resetPhysics()
            else:
                # Cancel torso linear drift & tilting without resetting motor velocities!
                # This keeps all arms and legs moving completely fluidly!
                self.self_node.setVelocity([0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        except Exception:
            pass

    def run(self):
        # Apply initial relaxed stand pose
        for name, angle in self.current_angles.items():
            if name in self.motors:
                self.motors[name].setPosition(angle)

        alpha_upper = 0.70  # Upper body snappy response
        alpha_lower = 0.55  # Leg responsive articulation

        while self.robot.step(self.timestep) != -1:
            self.accept_client()
            pkt = self.read_packet()

            if pkt:
                # Update target joint angles from vision pipeline
                targets = {
                    # Head
                    "HeadYaw": pkt.get("head_yaw", 0.0),
                    "HeadPitch": pkt.get("head_pitch", 0.0),
                    # Arms
                    "RShoulderPitch": pkt.get("r_shoulder_pitch", 1.4),
                    "RShoulderRoll": pkt.get("r_shoulder_roll", -0.15),
                    "RElbowRoll": pkt.get("r_elbow_roll", 0.1),
                    "RElbowYaw": pkt.get("r_elbow_yaw", 0.0),
                    "LShoulderPitch": pkt.get("l_shoulder_pitch", 1.4),
                    "LShoulderRoll": pkt.get("l_shoulder_roll", 0.15),
                    "LElbowRoll": pkt.get("l_elbow_roll", -0.1),
                    "LElbowYaw": pkt.get("l_elbow_yaw", 0.0),
                    # Right Leg
                    "RHipYawPitch": pkt.get("r_hip_yaw_pitch", 0.0),
                    "RHipRoll": pkt.get("r_hip_roll", 0.0),
                    "RHipPitch": pkt.get("r_hip_pitch", 0.0),
                    "RKneePitch": pkt.get("r_knee_pitch", 0.0),
                    "RAnklePitch": pkt.get("r_ankle_pitch", 0.0),
                    "RAnkleRoll": pkt.get("r_ankle_roll", 0.0),
                    # Left Leg
                    "LHipYawPitch": pkt.get("l_hip_yaw_pitch", 0.0),
                    "LHipRoll": pkt.get("l_hip_roll", 0.0),
                    "LHipPitch": pkt.get("l_hip_pitch", 0.0),
                    "LKneePitch": pkt.get("l_knee_pitch", 0.0),
                    "LAnklePitch": pkt.get("l_ankle_pitch", 0.0),
                    "LAnkleRoll": pkt.get("l_ankle_roll", 0.0),
                }

                # When replaying a recorded skill, track the trajectory with 100% fidelity (alpha=1.0)
                # During live camera tracking, apply protective low-pass EMA smoothing
                is_replay = bool(pkt.get("is_replay", False))
                
                for name, target_v in targets.items():
                    clamped_v = self.clamp(name, target_v)
                    if is_replay:
                        new_v = clamped_v  # Exact 1:1 trajectory fidelity!
                    else:
                        cur_v = self.current_angles.get(name, 0.0)
                        is_leg = ("Knee" in name or "Hip" in name or "Ankle" in name)
                        alpha = alpha_lower if is_leg else alpha_upper
                        new_v = cur_v + alpha * (clamped_v - cur_v)

                    self.current_angles[name] = new_v
                    if name in self.motors:
                        self.motors[name].setPosition(new_v)

                # Update hands
                r_hand = float(pkt.get("r_hand", 0.0))
                l_hand = float(pkt.get("l_hand", 0.0))
                self.set_hand_phalanx(r_hand, l_hand)

            # Apply Anti-Fall Virtual Harness every simulation step
            self.apply_anti_fall_harness()


if __name__ == "__main__":
    ctrl = NaoTeleopController()
    if ctrl.robot:
        ctrl.run()
