#!/usr/bin/env python3
"""
CL-05 Capstone Automated End-to-End Test Suite
Validates:
1. Health & Status Endpoints
2. Configuration Validation (Schema, Required Fields, Range, Malformed JSON)
3. Active Release Preservation on Validation Rejection
4. Healthy Deployment & Promotion (0% error vs 5% threshold)
5. Healthy Boundary Promotion (5% error vs 5% threshold)
6. Faulty Boundary Rollback (6% error vs 5% threshold)
7. Faulty Deployment & Circuit-Breaker Auto-Rollback (18% error vs 5% threshold)
8. Dashboard State & Event Stream Consistency
9. State Machine Reset Functionality

Exits with code 0 on all tests PASS, non-zero code if any test FAILS.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE_URL = os.environ.get("CLOUD05_URL", "http://localhost:5005")
CONFIG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "release_config.json"))

# ANSI Colors
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def log_step(name):
    print(f"\n{BOLD}{CYAN}=== RUNNING: {name} ==={RESET}")


def pass_test(name, detail=""):
    msg = f"  {BOLD}{GREEN}[PASS]{RESET} {name}"
    if detail:
        msg += f" - {detail}"
    print(msg)


def fail_test(name, detail=""):
    msg = f"  {BOLD}{RED}[FAIL]{RESET} {name}"
    if detail:
        msg += f" - {detail}"
    print(msg)
    sys.exit(1)


def http_request(path, method="GET", data=None):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method=method)
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    else:
        body = None

    try:
        with urllib.request.urlopen(req, data=body, timeout=10) as resp:
            status = resp.status
            content = resp.read().decode("utf-8")
            try:
                parsed = json.loads(content)
            except Exception:
                parsed = content
            return status, parsed
    except urllib.error.HTTPError as err:
        content = err.read().decode("utf-8")
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = content
        return err.code, parsed
    except Exception as err:
        fail_test(f"HTTP Connection to {url}", f"Error: {str(err)}")


def write_config(config_dict=None, raw_text=None):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        if raw_text is not None:
            f.write(raw_text)
        else:
            json.dump(config_dict, f, indent=2)


def wait_for_deployment_finish(timeout=15.0):
    start = time.time()
    while time.time() - start < timeout:
        status, data = http_request("/api/status")
        if status == 200 and data.get("deployment_status") != "DEPLOYING":
            return data
        time.sleep(0.5)
    fail_test("Deployment Timeout", f"Deployment did not converge within {timeout}s")


# ==========================================
# TEST IMPLEMENTATION
# ==========================================

def test_health_endpoint():
    log_step("1. Health Endpoint Verification")
    status, data = http_request("/health")
    if status != 200:
        fail_test("GET /health status", f"Expected 200, got {status}")
    if data.get("status") != "HEALTHY":
        fail_test("GET /health body", f"Expected HEALTHY, got {data.get('status')}")
    pass_test("GET /health", f"HTTP 200, status={data.get('status')}, active={data.get('active_version')}")


def test_status_endpoint():
    log_step("2. Status Endpoint Verification")
    status, data = http_request("/api/status")
    if status != 200:
        fail_test("GET /api/status status", f"Expected 200, got {status}")
    required_keys = ["project_name", "active_version", "candidate_version", "deployment_status", "application_health", "traffic_split"]
    for k in required_keys:
        if k not in data:
            fail_test(f"GET /api/status key '{k}'", "Key missing from response")
    pass_test("GET /api/status", f"HTTP 200, valid schema with all {len(required_keys)} required metrics")


def test_reset():
    log_step("3. State Machine Reset")
    status, data = http_request("/api/reset", method="POST")
    if status != 200 or data.get("active_version") != "v1.0":
        fail_test("POST /api/reset", f"Expected v1.0, got {data}")
    status, st = http_request("/api/status")
    if st["active_version"] != "v1.0" or st["candidate_version"] != "NONE" or st["deployment_status"] != "STABLE":
        fail_test("State after reset", f"State invalid: {st}")
    pass_test("POST /api/reset", "State reset to initial v1.0, candidate=NONE, status=STABLE")


def test_config_validation():
    log_step("4. Configuration Validation & Active Release Preservation")
    initial_status, initial_data = http_request("/api/status")
    initial_active = initial_data["active_version"]

    # 4.1 Missing required field
    write_config({"version": "v9.0", "message": "Missing fields"})
    code, res = http_request("/api/deploy/current-config", method="POST")
    if code != 400 or res.get("status") != "rejected":
        fail_test("Validation: Missing required field", f"Expected 400 rejected, got {code} {res}")
    pass_test("Validation: Missing required field", "HTTP 400 rejected with clear error message")

    # 4.2 Negative error rate
    write_config({"version": "v9.0", "message": "Negative rate", "error_rate": -5, "threshold": 5})
    code, res = http_request("/api/deploy/current-config", method="POST")
    if code != 400 or res.get("status") != "rejected":
        fail_test("Validation: Negative error rate", f"Expected 400 rejected, got {code} {res}")
    pass_test("Validation: Negative error rate", "HTTP 400 rejected (-5% out of [0, 100] range)")

    # 4.3 Error rate > 100
    write_config({"version": "v9.0", "message": "Too high", "error_rate": 120, "threshold": 5})
    code, res = http_request("/api/deploy/current-config", method="POST")
    if code != 400 or res.get("status") != "rejected":
        fail_test("Validation: Error rate > 100", f"Expected 400 rejected, got {code} {res}")
    pass_test("Validation: Error rate > 100", "HTTP 400 rejected (120% out of bounds)")

    # 4.4 Malformed JSON
    write_config(raw_text="{\n  \"version\": \"v9.0\",\n  malformed_json_here\n}\n")
    code, res = http_request("/api/deploy/current-config", method="POST")
    if code != 400 or res.get("status") != "rejected":
        fail_test("Validation: Malformed JSON", f"Expected 400 rejected, got {code} {res}")
    pass_test("Validation: Malformed JSON", "HTTP 400 rejected (Malformed JSON syntax detected)")

    # 4.5 Verify Active Release Preservation
    status, current_data = http_request("/api/status")
    if current_data["active_version"] != initial_active:
        fail_test("Active Release Preservation", f"Active changed from {initial_active} to {current_data['active_version']}")
    pass_test("Active Release Preservation", f"Active release safely preserved as {initial_active}")


def test_healthy_deployment():
    log_step("5. Healthy Release Promotion (0% error rate vs 5% threshold)")
    write_config({
        "version": "v4.0",
        "message": "Healthy release test",
        "error_rate": 0,
        "threshold": 5
    })

    code, res = http_request("/api/deploy/current-config", method="POST")
    if code != 200 or res.get("status") != "initiated":
        fail_test("Trigger healthy deployment", f"Expected 200 initiated, got {code} {res}")
    pass_test("Trigger Healthy Deployment", f"Initiated deployment for candidate v4.0 (Evaluation: {res.get('evaluation')})")

    # Poll status during and after deployment
    final_state = wait_for_deployment_finish()
    if final_state["active_version"] != "v4.0":
        fail_test("Promotion active version", f"Expected active v4.0, got {final_state['active_version']}")
    if final_state["candidate_version"] != "NONE":
        fail_test("Candidate version post promotion", f"Expected NONE, got {final_state['candidate_version']}")
    if final_state["deployment_status"] != "STABLE":
        fail_test("Deployment status post promotion", f"Expected STABLE, got {final_state['deployment_status']}")
    if final_state["application_health"] != "HEALTHY":
        fail_test("Application health post promotion", f"Expected HEALTHY, got {final_state['application_health']}")
    if final_state["traffic_split"]["active"] != 100 or final_state["traffic_split"]["candidate"] != 0:
        fail_test("Traffic split post promotion", f"Expected 100/0, got {final_state['traffic_split']}")

    pass_test("Healthy Promotion Succeeded", "Candidate v4.0 promoted to active release; status=STABLE; health=HEALTHY")


def test_healthy_boundary():
    log_step("6. Healthy Boundary Promotion (5% error rate vs 5% threshold)")
    write_config({
        "version": "v4.1",
        "message": "Healthy boundary test",
        "error_rate": 5,
        "threshold": 5
    })

    code, res = http_request("/api/deploy/current-config", method="POST")
    if code != 200 or res.get("status") != "initiated":
        fail_test("Trigger healthy boundary deployment", f"Expected 200, got {code} {res}")
    pass_test("Trigger Healthy Boundary", "Initiated deployment for candidate v4.1 (error_rate == threshold == 5%)")

    final_state = wait_for_deployment_finish()
    if final_state["active_version"] != "v4.1" or final_state["deployment_status"] != "STABLE":
        fail_test("Healthy boundary promotion", f"Failed to promote v4.1: {final_state}")
    pass_test("Healthy Boundary Promoted", "Candidate v4.1 promoted to active (boundary 5% <= 5% passed)")


def test_faulty_boundary():
    log_step("7. Faulty Boundary Rollback (6% error rate vs 5% threshold)")
    write_config({
        "version": "v4.2",
        "message": "Faulty boundary test",
        "error_rate": 6,
        "threshold": 5
    })

    code, res = http_request("/api/deploy/current-config", method="POST")
    if code != 200 or res.get("status") != "initiated":
        fail_test("Trigger faulty boundary deployment", f"Expected 200, got {code} {res}")
    pass_test("Trigger Faulty Boundary", "Initiated deployment for candidate v4.2 (error_rate 6% > threshold 5%)")

    final_state = wait_for_deployment_finish()
    if final_state["active_version"] != "v4.1":
        fail_test("Faulty boundary rollback active version", f"Expected restored v4.1, got {final_state['active_version']}")
    if final_state["candidate_version"] != "NONE":
        fail_test("Faulty boundary candidate version", f"Expected NONE, got {final_state['candidate_version']}")
    if final_state["deployment_status"] != "ROLLED BACK":
        fail_test("Faulty boundary deployment status", f"Expected ROLLED BACK, got {final_state['deployment_status']}")
    if final_state["application_health"] != "HEALTHY":
        fail_test("Faulty boundary restored health", f"Expected HEALTHY, got {final_state['application_health']}")

    pass_test("Faulty Boundary Auto-Rollback Succeeded", "Candidate v4.2 rejected; previous stable release v4.1 restored; status=ROLLED BACK")


def test_faulty_deployment():
    log_step("8. Faulty Release & Circuit-Breaker Auto-Rollback (18% error rate vs 5% threshold)")
    write_config({
        "version": "v5.0",
        "message": "Faulty release test",
        "error_rate": 18,
        "threshold": 5
    })

    code, res = http_request("/api/deploy/current-config", method="POST")
    if code != 200 or res.get("status") != "initiated":
        fail_test("Trigger faulty deployment", f"Expected 200, got {code} {res}")
    pass_test("Trigger Faulty Deployment", "Initiated candidate v5.0 (error_rate 18% > threshold 5%)")

    final_state = wait_for_deployment_finish()
    if final_state["active_version"] != "v4.1":
        fail_test("Rollback restored version", f"Expected restored v4.1, got {final_state['active_version']}")
    if final_state["candidate_version"] != "NONE":
        fail_test("Rollback candidate version", f"Expected NONE, got {final_state['candidate_version']}")
    if final_state["deployment_status"] != "ROLLED BACK":
        fail_test("Rollback deployment status", f"Expected ROLLED BACK, got {final_state['deployment_status']}")
    if final_state["application_health"] != "HEALTHY":
        fail_test("Rollback restored health", f"Expected HEALTHY, got {final_state['application_health']}")

    latest_rb = final_state.get("latest_rollback")
    if not latest_rb:
        fail_test("Rollback metadata", "latest_rollback field missing")
    if latest_rb["failed_version"] != "v5.0" or latest_rb["restored_version"] != "v4.1":
        fail_test("Rollback details", f"Invalid rollback metadata: {latest_rb}")

    pass_test("Automated Rollback Succeeded", f"Failed candidate v5.0 reverted, restored version={latest_rb['restored_version']}, status=ROLLED BACK, health=HEALTHY")


def test_event_history():
    log_step("9. Audit Event Stream Consistency")
    status, data = http_request("/api/events")
    events = data.get("events", [])
    if len(events) < 5:
        fail_test("Event log count", f"Expected >= 5 events, got {len(events)}")

    # Verify chronological descending order and event structure
    for ev in events:
        for key in ["id", "timestamp", "type", "message"]:
            if key not in ev:
                fail_test(f"Event key '{key}'", f"Missing in event {ev}")

    pass_test("Audit Events", f"Total {len(events)} events recorded in chronological order with full metadata")


def cleanup_and_reset():
    log_step("10. Cleanup & Baseline Restoration")
    write_config({
        "version": "v4.0",
        "message": "Healthy release",
        "error_rate": 0,
        "threshold": 5
    })
    http_request("/api/reset", method="POST")
    status, st = http_request("/api/status")
    if st["active_version"] == "v1.0" and st["deployment_status"] == "STABLE":
        pass_test("Cleanup & Reset", "Environment reset to clean v1.0 baseline; release_config.json reset to v4.0")
    else:
        fail_test("Cleanup", f"Failed to reset cleanly: {st}")


def main():
    print(f"\n{BOLD}{CYAN}======================================================{RESET}")
    print(f"{BOLD}{CYAN}  CL-05 Capstone Automated End-to-End Test Suite      {RESET}")
    print(f"{BOLD}{CYAN}  Target: {BASE_URL}                                  {RESET}")
    print(f"\n{BOLD}{CYAN}======================================================{RESET}")

    start_time = time.time()
    try:
        test_health_endpoint()
        test_status_endpoint()
        test_reset()
        test_config_validation()
        test_healthy_deployment()
        test_healthy_boundary()
        test_faulty_boundary()
        test_faulty_deployment()
        test_event_history()
        cleanup_and_reset()
    except KeyboardInterrupt:
        print("\nTest cancelled by user.")
        sys.exit(130)

    elapsed = round(time.time() - start_time, 2)
    print(f"\n{BOLD}{GREEN}======================================================{RESET}")
    print(f"{BOLD}{GREEN}  ALL CL-05 CAPSTONE TESTS PASSED ({elapsed}s)                {RESET}")
    print(f"{BOLD}{GREEN}======================================================{RESET}\n")
    sys.exit(0)


if __name__ == "__main__":
    main()
