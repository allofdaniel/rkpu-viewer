"""
UBIKAIS Auto Crawler & Vercel deploy helper.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from inspect import signature, Parameter

PROJECT_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = PROJECT_DIR / "public"
FLIGHT_SCHEDULE_FILE = PUBLIC_DIR / "flight_schedule.json"

CRAWL_MAX_AGE_MINUTES = int(os.getenv("AUTO_CRAWL_MAX_FILE_AGE_MINUTES", "10"))
HEADLESS = os.getenv("UBIKAIS_CRAWLER_HEADLESS", "true").strip().lower() in {"1", "true", "yes", "on"}
ENABLE_DEPLOY = os.getenv("AUTO_DEPLOY_VERCEL", "false").strip().lower() in {"1", "true", "yes", "on"}


def log(msg: str) -> None:
    """Print a timestamped log message."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")


def run_command(cmd: list[str], timeout: int = 300) -> subprocess.CompletedProcess:
    """Run a command and return the result."""
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        check=False,
        timeout=timeout,
        shell=False,
    )


def format_age_minutes(minutes: float) -> str:
    if minutes == float("inf"):
        return "N/A"
    return f"{minutes:.1f}"


def _parse_iso_datetime(raw: str | None) -> datetime | None:
    """Parse ISO string to aware datetime in UTC."""
    if not raw or not raw.strip():
        return None

    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def check_file_age_minutes(path: Path) -> float:
    """Return file age in minutes."""
    if not path.exists():
        return float("inf")

    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        last_updated = data.get("last_updated") or data.get("crawl_timestamp")
        last_time = _parse_iso_datetime(last_updated)
        if last_time is None:
            return float("inf")

        return max(0.0, (datetime.now(timezone.utc) - last_time).total_seconds() / 60)
    except Exception as error:
        log(f"Failed to parse {path}: {error}")
        return float("inf")


def _safe_load_crawler_output(path: Path) -> dict:
    """Load crawler JSON output and normalize departures/arrivals if needed."""
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _to_record_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, dict):
        records = []
        for item in value.values():
            if isinstance(item, (list, tuple)):
                records.extend(item)
            elif item is not None:
                records.append(item)
        return records
    return []


def _normalize_schedule_payload(crawled_payload: dict) -> dict:
    """Normalize output from ubikais_crawler for flight_schedule.json consumers."""
    if not isinstance(crawled_payload, dict):
        return {}

    source = crawled_payload
    if (
        "departures" not in source
        and "arrivals" not in source
        and isinstance(source.get("data"), dict)
        and any(k in source["data"] for k in ("departures", "arrivals", "flight_plans"))
    ):
        source = source["data"]

    schedules = _to_record_list(source.get("schedules", source.get("flight_plans", [])))
    departures = _to_record_list(source.get("departures", source.get("departures_list", [])))
    arrivals = _to_record_list(source.get("arrivals", source.get("arrivals_list", [])))

    if not departures and isinstance(schedules, list):
        departures = [item for item in schedules if isinstance(item, dict) and item.get("schedule_type") == "departure"]

    if not arrivals and isinstance(schedules, list):
        arrivals = [item for item in schedules if isinstance(item, dict) and item.get("schedule_type") == "arrival"]

    if isinstance(crawled_payload.get("total_count"), int):
        total_count = crawled_payload["total_count"]
    else:
        total_count = len(schedules) if isinstance(schedules, list) else (len(departures) + len(arrivals))

    last_updated = crawled_payload.get("last_updated") or datetime.now().astimezone().isoformat()
    crawl_timestamp = crawled_payload.get("crawl_timestamp") or crawled_payload.get("created_at") or last_updated

    normalized = {
        "crawl_timestamp": crawl_timestamp,
        "last_updated": last_updated,
        "total_count": total_count,
        "departures": departures,
        "arrivals": arrivals,
        "schedules": schedules,
    }
    if not normalized["departures"] and not normalized["arrivals"] and normalized["schedules"]:
        normalized["departures"] = source.get("departures", [])
        normalized["arrivals"] = source.get("arrivals", [])
    return normalized


def _has_schedule_like_payload(payload: dict) -> bool:
    if not isinstance(payload, dict):
        return False
    if payload.get("status") == "FAILURE":
        return False
    if "status" in payload and payload.get("status") != "SUCCESS":
        return False
    if any(k in payload for k in ("departures", "arrivals", "flight_plans", "schedules")):
        return True
    nested = payload.get("data")
    return isinstance(nested, dict) and any(k in nested for k in ("departures", "arrivals", "flight_plans", "schedules"))


def run_crawler() -> bool:
    """Run UBIKAIS crawler and write normalized public/flight_schedule.json."""
    log("UBIKAIS crawler started")

    try:
        from ubikais_crawler import UBIKAISCrawler
    except Exception as error:
        log(f"Failed to import UBIKAISCrawler: {error}")
        return False

    crawler_sig = signature(UBIKAISCrawler)
    params = crawler_sig.parameters
    ctor_kwargs = {}

    # Build supported kwargs only.
    if "headless" in params:
        ctor_kwargs["headless"] = HEADLESS

    if "output_dir" in params:
        # Keep outputs next to the project root script so the path below is stable.
        ctor_kwargs["output_dir"] = str(PROJECT_DIR)

    uses_username = "username" in params
    uses_password = "password" in params
    if uses_username or uses_password:
        username = os.getenv("UBIKAIS_USERNAME", "").strip()
        password = os.getenv("UBIKAIS_PASSWORD", "").strip()

        required_params = {
            p.name
            for p in params.values()
            if p.default == Parameter.empty and p.name != "self"
        }

        if uses_username and "username" in required_params and not username:
            log("UBIKAIS username is required (UBIKAIS_USERNAME)")
            return False
        if uses_password and "password" in required_params and not password:
            log("UBIKAIS password is required (UBIKAIS_PASSWORD)")
            return False
        if username:
            ctor_kwargs["username"] = username
        if password:
            ctor_kwargs["password"] = password

    if uses_username and uses_password and "username" in ctor_kwargs and "password" in ctor_kwargs:
        try:
            crawler = UBIKAISCrawler(**ctor_kwargs)
        except TypeError:
            # Fallback for minimal positional constructors.
            if "output_dir" in params:
                crawler = UBIKAISCrawler(username, password, str(PROJECT_DIR))
            else:
                crawler = UBIKAISCrawler(username, password)
    else:
        try:
            crawler = UBIKAISCrawler(**ctor_kwargs)
        except TypeError:
            # Fallback for minimal positional constructors.
            if "headless" in params:
                crawler = UBIKAISCrawler(HEADLESS)
            else:
                crawler = UBIKAISCrawler()

    if hasattr(crawler, "crawl"):
        payload = crawler.crawl()
        method_used = "crawl"
    elif hasattr(crawler, "crawl_realtime"):
        payload = crawler.crawl_realtime()
        method_used = "crawl_realtime"
    elif hasattr(crawler, "crawl_fpl_data"):
        payload = crawler.crawl_fpl_data()
        method_used = "crawl_fpl_data"
    else:
        log("UBIKAISCrawler has no known crawl entry point (crawl / crawl_realtime / crawl_fpl_data)")
        return False

    if not _has_schedule_like_payload(payload):
        error_msg = payload.get("error", "Unknown error") if isinstance(payload, dict) else "Unknown payload format"
        log(f"Crawler failed: {error_msg}")
        return False

    # ubikais_crawler writes `flight_schedule.json` in configured output_dir.
    output_file = "flight_schedule.json"
    if method_used == "crawl_realtime":
        output_file = "realtime_current.json"
    if hasattr(crawler, "json_output"):
        output_file = str(crawler.json_output)

    output_dir = PROJECT_DIR
    if hasattr(crawler, "output_dir"):
        output_dir = Path(getattr(crawler, "output_dir"))

    local_output = output_dir / output_file
    raw_payload = _safe_load_crawler_output(local_output)
    if not raw_payload:
        raw_payload = {
            "crawl_timestamp": datetime.now().astimezone().isoformat(),
            "last_updated": datetime.now().astimezone().isoformat(),
            "departures": payload.get("departures") if isinstance(payload, dict) else [],
            "arrivals": payload.get("arrivals") if isinstance(payload, dict) else [],
            "schedules": payload.get("schedules", []),
            "flight_plans": payload.get("flight_plans") if isinstance(payload, dict) else [],
            "total_count": int(payload.get("total_count", 0) or 0) if isinstance(payload, dict) else 0,
        }

    normalized = _normalize_schedule_payload(raw_payload)
    if not normalized.get("departures") and not normalized.get("arrivals"):
        log("Crawler payload did not contain flight schedules")
        return False

    FLIGHT_SCHEDULE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with FLIGHT_SCHEDULE_FILE.open("w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)

    total = normalized.get("total_count", 0)
    log(f"Crawler finished. Total: {total}, departures: {len(normalized.get('departures', []))}, arrivals: {len(normalized.get('arrivals', []))}")
    return True


def deploy_to_vercel() -> bool:
    """Commit and deploy public/flight_schedule.json with Vercel."""
    log("Vercel deployment started")

    if not FLIGHT_SCHEDULE_FILE.exists():
        log(f"Missing {FLIGHT_SCHEDULE_FILE}")
        return False

    add_result = run_command(["git", "add", "public/flight_schedule.json"])
    if add_result.returncode != 0:
        log(f"git add failed: {add_result.stderr.strip() or add_result.stdout.strip()}")

    status_result = run_command(["git", "diff", "--cached", "--name-only", "--quiet", "public/flight_schedule.json"])

    if status_result.returncode == 0:
        # Exit code 0 means no difference (for our usage with --quiet)
        log("No changes in flight_schedule.json. Skip deploy.")
        return True

    commit_message = f"Auto-update flight schedule {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    commit_result = run_command(["git", "commit", "-m", commit_message])
    if commit_result.returncode != 0:
        log(f"git commit failed: {commit_result.stderr.strip() or commit_result.stdout.strip()}")
        return False

    deploy_result = run_command(["vercel", "--prod", "--yes"], timeout=600)
    if deploy_result.returncode != 0:
        log(f"Vercel deploy failed: {deploy_result.stderr.strip() or deploy_result.stdout.strip()}")
        return False

    log("Vercel deploy completed")
    return True


def main() -> int:
    log("=" * 60)
    log("UBIKAIS Auto Crawler & Deploy")
    log("=" * 60)

    age_minutes = check_file_age_minutes(FLIGHT_SCHEDULE_FILE)
    log(f"Current file age: {format_age_minutes(age_minutes)} minutes")

    if age_minutes <= CRAWL_MAX_AGE_MINUTES:
        log(f"Schedule file is fresh ({format_age_minutes(age_minutes)} min). Skip crawl.")
        return 0

    if not run_crawler():
        log("Crawler run failed. Abort.")
        return 1

    if not ENABLE_DEPLOY:
        log("Auto deploy disabled (AUTO_DEPLOY_VERCEL != true)")
        log("Done")
        return 0

    if deploy_to_vercel():
        log("Done")
        return 0

    log("Deployment failed")
    return 1


if __name__ == "__main__":
    sys.exit(main())
