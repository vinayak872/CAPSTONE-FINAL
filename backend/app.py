import json
import os
import threading
import time
from datetime import datetime
from flask import Flask, jsonify, render_template, request, send_from_directory

# Resolve absolute paths to the separated frontend directory and config file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))
CONFIG_FILE = os.path.join(BASE_DIR, "release_config.json")

app = Flask(
    __name__,
    template_folder=FRONTEND_DIR,
    static_folder=FRONTEND_DIR,
    static_url_path=""
)

# State lock for thread safety during background deployment transitions
state_lock = threading.Lock()

# Initial application state as specified in requirements
state = {
    "project_name": "CL-05 Capstone",
    "active_version": "v1.0",
    "previous_stable_version": "v1.0",
    "candidate_version": "NONE",
    "deployment_status": "STABLE",  # STABLE, DEPLOYING, ROLLED_BACK
    "application_health": "HEALTHY",  # HEALTHY, UNHEALTHY, DEGRADED
    "health_check_mode": "PASS",  # PASS or FAIL (simulated criteria)
    "traffic_split": {"active": 100, "candidate": 0},
    "latest_rollback": None,
    "last_config_deployment": None,
    "events": []
}


def format_num(val):
    """Format numeric values as integer if whole number, otherwise float."""
    if isinstance(val, (int, float)):
        return int(val) if val == int(val) else float(val)
    return val


def load_and_validate_config():
    """
    Reads and strictly validates backend/release_config.json from disk against schema:
    {
      "version": str (non-empty),
      "message": str (non-empty),
      "error_rate": float/int (0 <= error_rate <= 100),
      "threshold": float/int (0 <= threshold <= 100)
    }
    """
    if not os.path.exists(CONFIG_FILE):
        return None, "Configuration file backend/release_config.json not found on disk."

    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            raw_text = f.read()
            config_data = json.loads(raw_text)
    except json.JSONDecodeError as err:
        return None, f"Malformed JSON syntax in release_config.json: {str(err)}"
    except Exception as err:
        return None, f"Failed to read release_config.json: {str(err)}"

    if not isinstance(config_data, dict):
        return None, "Configuration root must be a JSON object."

    # Validate required fields
    required_fields = ["version", "message", "error_rate", "threshold"]
    for field in required_fields:
        if field not in config_data:
            return None, f"Missing required field: '{field}'."

    version = config_data.get("version")
    if not isinstance(version, str) or not version.strip():
        return None, "Field 'version' must be a non-empty string."

    message = config_data.get("message")
    if not isinstance(message, str) or not message.strip():
        return None, "Field 'message' must be a non-empty string."

    error_rate = config_data.get("error_rate")
    if error_rate is None or not isinstance(error_rate, (int, float)) or isinstance(error_rate, bool):
        return None, "Field 'error_rate' must be a numeric value."
    if not (0 <= error_rate <= 100):
        return None, f"Field 'error_rate' ({error_rate}) must be between 0 and 100."

    threshold = config_data.get("threshold")
    if threshold is None or not isinstance(threshold, (int, float)) or isinstance(threshold, bool):
        return None, "Field 'threshold' must be a numeric value."
    if not (0 <= threshold <= 100):
        return None, f"Field 'threshold' ({threshold}) must be between 0 and 100."

    return {
        "version": version.strip(),
        "message": message.strip(),
        "error_rate": format_num(error_rate),
        "threshold": format_num(threshold)
    }, None


def add_event(message: str, event_type: str = "info", details: str = ""):
    timestamp = datetime.now().strftime("%H:%M:%S")
    event = {
        "id": len(state["events"]) + 1,
        "timestamp": timestamp,
        "type": event_type,  # info, success, warning, danger
        "message": message,
        "details": details
    }
    state["events"].insert(0, event)
    # Keep up to 50 events in memory
    if len(state["events"]) > 50:
        state["events"] = state["events"][:50]


# Initialize with startup log
add_event("CL-05 Capstone Progressive Delivery Controller started", "info", "Controller initialized with stable release v1.0")


def run_deployment_worker(target_version: str, should_fail: bool, failure_reason: str = None, config_metadata: dict = None):
    """
    Background worker simulating realistic progressive delivery lifecycle:
    1. Canary/Candidate initialization (90/10 split)
    2. Traffic ramping & simulated health probes (50/50 split)
    3. Promotion OR Simulated Probe Failure + Automated Rollback
    """
    # Capture current stable release before candidate rollout begins
    with state_lock:
        current_stable = state["active_version"]
        state["deployment_status"] = "DEPLOYING"
        state["candidate_version"] = target_version
        state["traffic_split"] = {"active": 90, "candidate": 10}
        source_label = " (via release_config.json)" if config_metadata else ""
        add_event(
            f"Pipeline Trigger: New deployment initiated for candidate {target_version}{source_label}",
            "warning",
            f"Routing 10% canary traffic to {target_version}, 90% to {current_stable} (configured split)"
        )

    # Allow dashboard polling to display initial 90/10 DEPLOYING state
    time.sleep(2.0)

    with state_lock:
        state["traffic_split"] = {"active": 50, "candidate": 50}
        probe_desc = (
            f"Evaluating error rate {config_metadata['error_rate']}% against threshold {config_metadata['threshold']}% (simulated)"
            if config_metadata
            else "Evaluating HTTP /health synthetic probes and error rate thresholds (simulated)"
        )
        add_event(
            f"Canary Analysis: Executing simulated health probes on {target_version}",
            "info",
            probe_desc
        )

    time.sleep(2.0)

    if not should_fail:
        # HEALTHY PROMOTION PATH
        with state_lock:
            state["previous_stable_version"] = current_stable
            state["active_version"] = target_version
            state["candidate_version"] = "NONE"
            state["deployment_status"] = "STABLE"
            state["application_health"] = "HEALTHY"
            state["traffic_split"] = {"active": 100, "candidate": 0}
            if config_metadata:
                state["last_config_deployment"] = {
                    "version": target_version,
                    "error_rate": config_metadata["error_rate"],
                    "threshold": config_metadata["threshold"],
                    "result": "PROMOTED",
                    "timestamp": datetime.now().strftime("%H:%M:%S")
                }
            add_event(
                f"Release Promoted: Candidate {target_version} passed all simulated health probes",
                "success",
                f"100% traffic routed to {target_version}. Previous stable retained as {current_stable}."
            )
    else:
        # FAULTY PATH: Step 1 - Simulated Probe Failure
        with state_lock:
            state["application_health"] = "UNHEALTHY"
            err_msg = (
                failure_reason
                if failure_reason
                else f"Simulated probe failure: Error rate 18% exceeded 5% threshold on {target_version}."
            )
            add_event(
                f"Simulated Probe Failed: Candidate {target_version} returned HTTP 503",
                "danger",
                err_msg
            )
            add_event(
                f"Circuit Breaker Tripped: Health check failed for {target_version}",
                "danger",
                "Automated rollback initiated immediately."
            )

        # Allow dashboard polling (2s) to observe the UNHEALTHY state on dashboard
        time.sleep(2.2)

        # FAULTY PATH: Step 2 - Automatic Rollback restores previous stable version
        with state_lock:
            failed_candidate = target_version
            rollback_timestamp = datetime.now().strftime("%H:%M:%S")
            rollback_reason = (
                failure_reason
                if failure_reason
                else f"Simulated health probe failed on {failed_candidate}: HTTP 503 synthetic error threshold exceeded (18% > 5%)."
            )

            state["candidate_version"] = "NONE"
            state["active_version"] = current_stable
            state["deployment_status"] = "ROLLED BACK"
            state["application_health"] = "HEALTHY"  # Restored to healthy stable version
            state["traffic_split"] = {"active": 100, "candidate": 0}
            state["latest_rollback"] = {
                "failed_version": failed_candidate,
                "restored_version": current_stable,
                "timestamp": rollback_timestamp,
                "reason": rollback_reason
            }
            if config_metadata:
                state["last_config_deployment"] = {
                    "version": target_version,
                    "error_rate": config_metadata["error_rate"],
                    "threshold": config_metadata["threshold"],
                    "result": "ROLLED BACK",
                    "timestamp": rollback_timestamp
                }

            add_event(
                f"AUTOMATIC ROLLBACK EXECUTED: Restored stable release {current_stable}",
                "danger",
                f"Candidate {failed_candidate} removed. Traffic safely restored to {current_stable}."
            )


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    """Application health endpoint"""
    with state_lock:
        is_healthy = state["application_health"] == "HEALTHY"
        status_code = 200 if is_healthy else 503
        return jsonify({
            "status": state["application_health"],
            "active_version": state["active_version"],
            "timestamp": datetime.now().isoformat()
        }), status_code


@app.route("/api/status")
def api_status():
    """Poll endpoint returning current system and deployment state"""
    with state_lock:
        return jsonify({
            "project_name": state["project_name"],
            "active_version": state["active_version"],
            "previous_stable_version": state["previous_stable_version"],
            "candidate_version": state["candidate_version"],
            "deployment_status": state["deployment_status"],
            "application_health": state["application_health"],
            "traffic_split": state["traffic_split"],
            "latest_rollback": state["latest_rollback"],
            "last_config_deployment": state.get("last_config_deployment"),
            "events_count": len(state["events"])
        })


@app.route("/api/config", methods=["GET"])
def api_config():
    """Returns currently read release_config.json on disk"""
    cfg, err = load_and_validate_config()
    with state_lock:
        last_dep = state.get("last_config_deployment")
    return jsonify({
        "file_path": "backend/release_config.json",
        "config": cfg,
        "is_valid": err is None,
        "validation_error": err,
        "last_deployment": last_dep
    })


@app.route("/api/events")
def api_events():
    """Returns activity event log"""
    with state_lock:
        return jsonify({"events": state["events"]})


@app.route("/api/deploy/healthy", methods=["POST"])
def deploy_healthy():
    """Deploy candidate v2.0 (Healthy Release)"""
    with state_lock:
        if state["deployment_status"] == "DEPLOYING":
            return jsonify({"error": "A deployment is already in progress"}), 409
        target = "v2.0"
        # If already v2.0, cycle or allow re-deployment to demonstrate flow
        if state["active_version"] == "v2.0":
            target = "v2.1"

    worker = threading.Thread(target=run_deployment_worker, args=(target, False), daemon=True)
    worker.start()
    return jsonify({
        "status": "initiated",
        "candidate": target,
        "message": f"Deployment pipeline initiated for healthy release {target}"
    })


@app.route("/api/deploy/faulty", methods=["POST"])
def deploy_faulty():
    """Deploy candidate v3.0 (Faulty Release with Automatic Rollback)"""
    with state_lock:
        if state["deployment_status"] == "DEPLOYING":
            return jsonify({"error": "A deployment is already in progress"}), 409
        target = "v3.0"

    worker = threading.Thread(target=run_deployment_worker, args=(target, True), daemon=True)
    worker.start()
    return jsonify({
        "status": "initiated",
        "candidate": target,
        "message": f"Deployment pipeline initiated for faulty candidate {target}"
    })


@app.route("/api/deploy/current-config", methods=["POST"])
def deploy_current_config():
    """
    Deploys configuration currently on disk in backend/release_config.json:
    1. Read and validate JSON from disk
    2. Check fields (version, message, error_rate, threshold)
    3. Evaluate health check decision: error_rate <= threshold -> PASS, else -> FAIL
    4. Triggers progressive rollout with promotion or rollback
    """
    with state_lock:
        if state["deployment_status"] == "DEPLOYING":
            return jsonify({
                "status": "rejected",
                "error": "A deployment is already in progress",
                "active_version": state["active_version"]
            }), 409
        add_event(
            "Configuration File Read: backend/release_config.json loaded",
            "info",
            "Evaluating live release configuration from disk"
        )

    cfg, err = load_and_validate_config()
    if err:
        with state_lock:
            add_event(
                f"Configuration Validation Failed: {err}",
                "danger",
                "Deployment rejected safely. Active version preserved."
            )
            current_active = state["active_version"]
        return jsonify({
            "status": "rejected",
            "error": err,
            "active_version": current_active
        }), 400

    target = cfg["version"]
    error_rate = cfg["error_rate"]
    threshold = cfg["threshold"]
    should_fail = error_rate > threshold

    with state_lock:
        add_event(
            f"Configuration Validated: {target} (Error Rate: {error_rate}%, Threshold: {threshold}%)",
            "info",
            f"Release message: \"{cfg['message']}\". Evaluating health check criteria."
        )

    failure_reason = None
    if should_fail:
        failure_reason = (
            f"Simulated health probe failed: Configured error rate ({error_rate}%) "
            f"exceeded allowed threshold ({threshold}%)."
        )

    worker = threading.Thread(
        target=run_deployment_worker,
        args=(target, should_fail, failure_reason, cfg),
        daemon=True
    )
    worker.start()

    return jsonify({
        "status": "initiated",
        "candidate": target,
        "error_rate": error_rate,
        "threshold": threshold,
        "evaluation": "FAIL (Will Roll Back)" if should_fail else "PASS (Will Promote)",
        "message": f"Deployment initiated for candidate {target} from backend/release_config.json"
    }), 200


@app.route("/api/reset", methods=["POST"])
def reset_state():
    """Reset to initial v1.0 state for easy re-testing"""
    global state
    with state_lock:
        if state["deployment_status"] == "DEPLOYING":
            return jsonify({"error": "Cannot reset while deployment is in progress"}), 409
        state["active_version"] = "v1.0"
        state["previous_stable_version"] = "v1.0"
        state["candidate_version"] = "NONE"
        state["deployment_status"] = "STABLE"
        state["application_health"] = "HEALTHY"
        state["traffic_split"] = {"active": 100, "candidate": 0}
        state["latest_rollback"] = None
        state["last_config_deployment"] = None
        state["events"] = []
        add_event(
            "Environment Reset: Restored baseline state (v1.0)",
            "info",
            "State machine reset to baseline v1.0. All prior audit events cleared."
        )
    return jsonify({"status": "reset", "active_version": "v1.0"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5005, debug=False)
