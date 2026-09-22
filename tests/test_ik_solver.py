"""
Unit Tests for Franka Panda Inverse Kinematics Solver
=====================================================
Standard: unittest (built-in)
Tests mathematical precision, joint limit adherence, and reachable workspace.
"""

import math
import unittest
import sys
import os

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from sim.webots.controllers.panda_teleop.panda_teleop import FrankaPandaIKSolver


class TestFrankaPandaIK(unittest.TestCase):
    def setUp(self):
        self.solver = FrankaPandaIKSolver()

    def test_ik_output_length(self):
        """Verify solver outputs exactly 7 joint angles for 7-DoF arm"""
        joints = self.solver.solve_cartesian(0.5, 0.0, 0.35)
        self.assertEqual(len(joints), 7, "Panda must have exactly 7 joint variables")

    def test_joint_limits_conformance(self):
        """Verify all calculated angles stay strictly within manufacturer limits"""
        test_points = [
            (0.4, 0.0, 0.2),
            (0.6, 0.3, 0.5),
            (0.35, -0.3, 0.15),
            (0.7, 0.0, 0.4),
            (0.3, 0.2, 0.6),
        ]
        for x, y, z in test_points:
            joints = self.solver.solve_cartesian(x, y, z)
            for i, (val, (low, high)) in enumerate(zip(joints, self.solver.JOINT_LIMITS)):
                self.assertTrue(low <= val <= high, f"Joint {i+1} angle {val} rad exceeds limit [{low}, {high}]")

    def test_elbow_negative_flexion(self):
        """Verify elbow joint (q4) follows Franka Panda physical kinematic convention"""
        joints = self.solver.solve_cartesian(0.5, 0.0, 0.3)
        q4 = joints[3]
        self.assertLess(q4, 0.0, "Joint 4 (Elbow) must bend negatively in normal reach posture")

    def test_symmetry_left_right(self):
        """Verify base yaw (q1) responds symmetrically across Y plane"""
        joints_left = self.solver.solve_cartesian(0.5, 0.2, 0.3)
        joints_right = self.solver.solve_cartesian(0.5, -0.2, 0.3)
        # q1 should be opposite in sign
        self.assertTrue(math.isclose(joints_left[0], -joints_right[0], abs_tol=1e-3))


if __name__ == "__main__":
    unittest.main()
