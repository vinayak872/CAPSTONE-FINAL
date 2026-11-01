#!/usr/bin/env python3
"""
Root runner for CLOUD-05 Automated End-to-End Tests.
Delegates directly to backend/test_e2e.py.
"""
import os
import subprocess
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEST_SCRIPT = os.path.join(BASE_DIR, "backend", "test_e2e.py")

if __name__ == "__main__":
    result = subprocess.run([sys.executable, TEST_SCRIPT] + sys.argv[1:])
    sys.exit(result.returncode)
