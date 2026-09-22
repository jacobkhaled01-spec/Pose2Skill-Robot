"""
Integration Test: Socket Bridge Communication
=============================================
Tests TCP streaming and JSON packet parsing between vision bridge and Webots controller.
"""

import socket
import json
import time
import unittest
import threading
import os
import sys

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from sim.webots.controllers.panda_teleop.panda_teleop import PandaTeleopController


class TestBridgeIntegration(unittest.TestCase):
    def test_packet_transmission(self):
        # Create controller listening on test port
        test_port = 10008
        controller = PandaTeleopController(port=test_port)

        # Client socket simulation
        client_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client_sock.connect(("127.0.0.1", test_port))

        # Accept connection on controller with retry for TCP handshake
        for _ in range(10):
            controller.accept_client()
            if controller.client_conn is not None:
                break
            time.sleep(0.05)

        self.assertIsNotNone(controller.client_conn, "Client connection should be established")

        # Send test packet
        test_data = {"x": 0.55, "y": -0.15, "z": 0.32, "gripper": 0.0}
        client_sock.sendall((json.dumps(test_data) + "\n").encode("utf-8"))

        packet = None
        for _ in range(10):
            packet = controller.read_teleop_packet()
            if packet is not None:
                break
            time.sleep(0.05)

        self.assertIsNotNone(packet, "Controller should receive and parse incoming packet")
        self.assertEqual(packet["x"], 0.55)
        self.assertEqual(packet["y"], -0.15)
        self.assertEqual(packet["z"], 0.32)
        self.assertEqual(packet["gripper"], 0.0)

        # Clean up
        client_sock.close()
        controller.server_socket.close()


if __name__ == "__main__":
    unittest.main()
