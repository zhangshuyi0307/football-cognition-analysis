"""Rebuild the PMwG DRT input using the actual MOT motion-stop deadline.

The historical PMwG table used ``trial_end_timestamp_ms`` for the final DRT
signal.  That timestamp includes the later MOT selection/confirmation phase.
This builder retains the approved 66-person MOT and HR-three-group tables, but
rebuilds every first-two-red-frame DRT row from the raw formal MOT blocks.
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

import pandas as pd

import analyze_mot_drt_two_cleaning_versions as mot
import behavior_paradigm_descriptive_stats as base


ANALYSIS = Path(r"F:\足球实验数据\分析输出")
SOURCE_DIR = next(ANALYSIS.glob("PMwG_*1825*"))
OUT = Path(os.environ.get(
    "PMWG_TRUE_DEADLINE_OUT",
    str(ANALYSIS / "PMwG_66人真实第二红框截止点输入_20260730"),
))
NORMAL_MOTION_MS = 7500.0
RT_MIN_MS = 200.0

# This valid athlete was historically matched by the behavioural telephone
# number rather than the questionnaire-mask form used by the roster helper.
# Public portfolio copy: replace private participant bridge values with local,
# non-versioned mappings before reproducing the full internal analysis.
EXTRA_BEHAVIOR_PHONE = {"182****5104": "PRIVATE_PHONE_PLACEHOLDER"}


def num(value: object) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return math.nan


def source_path(fragment: str) -> Path:
    hits = list(SOURCE_DIR.glob(f"*{fragment}*.csv"))
    if len(hits) != 1:
        raise RuntimeError(f"Expected one source file for {fragment!r}, found {hits}")
    return hits[0]


def build_file_index() -> list[Path]:
    """Index candidate backups once instead of recursively searching per task."""
    roots = [Path(mot.BEHAVIOR_DIR), *[p for p in base.RAW_BEHAVIOR_ROOTS if p.exists()]]
    found: dict[str, Path] = {}
    for root in roots:
        if not root.exists():
            continue
        for suffix in ("*.zip", "*.csv"):
            for path in root.rglob(suffix):
                found.setdefault(str(path.resolve()).lower(), path)
    return list(found.values())


def find_indexed_task(index: list[Path], behavior_phone: str, task: str) -> Path | None:
    aliases = base.TASK_PATTERN_ALIASES.get(base.TASK_PATTERNS[task], [base.TASK_PATTERNS[task]])
    hits = [
        path for path in index
        if behavior_phone in path.name and any(alias in path.name for alias in aliases)
    ]
    if not hits:
        return None
    hits.sort(key=lambda path: (
        "trajectory" in path.name.lower(), path.suffix.lower() != ".zip",
        -path.stat().st_mtime, -path.stat().st_size,
    ))
    return hits[0]


def raw_rows(subject_id: str, behavior_phone: str, task: str, file_index: list[Path]) -> list[dict]:
    zip_path = find_indexed_task(file_index, behavior_phone, task)
    if not zip_path:
        raise FileNotFoundError(f"No raw MOT zip: subject={subject_id}, task={task}")
    frame = base.read_trial_csv(zip_path)
    if frame is None or frame.empty:
        raise RuntimeError(f"Empty raw MOT table: {zip_path}")
    if "block_type" in frame:
        formal = frame[frame["block_type"].astype(str).str.contains("formal", case=False, na=False)].copy()
        if not formal.empty:
            frame = formal
    if len(frame) != 20:
        raise RuntimeError(f"{subject_id} {task}: expected 20 formal trials, got {len(frame)}")

    rows: list[dict] = []
    for trial_index, (_, trial) in enumerate(frame.reset_index(drop=True).iterrows(), start=1):
        offsets = base.parse_rt_list(trial.get("fixed_drt_events"))[:2]
        start = num(trial.get("trial_start_timestamp_ms"))
        if len(offsets) != 2 or not math.isfinite(start):
            raise RuntimeError(f"{subject_id} {task} trial {trial_index}: cannot locate both DRT signals")
        adjustment = base.infer_drt_red_onset_adjustment_ms(trial, offsets)
        onsets = [start + adjustment + offset for offset in offsets]
        motion_stop = start + adjustment + NORMAL_MOTION_MS
        clicks = sorted(base.parse_rt_list(trial.get("drt_button_click_timestamps_ms")))
        target = int(num(trial.get("target_count")))
        for signal_index, onset in enumerate(onsets, start=1):
            deadline = onsets[1] if signal_index == 1 else motion_stop
            in_window = [click for click in clicks if onset <= click < deadline]
            first_rt = in_window[0] - onset if in_window else math.nan
            if not in_window:
                status = "no_click_or_after_true_deadline"
            elif first_rt < RT_MIN_MS:
                status = "rt_under_200"
            else:
                status = "valid_200_before_true_deadline"
            rows.append(
                {
                    "subject_id": subject_id,
                    "state_label": mot.TASK_LABELS[task],
                    "target_count": target,
                    "trial_index_in_stage": trial_index,
                    "signal_index": signal_index,
                    "drt_validity_status": status,
                    "first_rt_ms": first_rt,
                    "red_onset_timestamp_ms": onset,
                    "deadline_timestamp_ms": deadline,
                    "window_ms": deadline - onset,
                    "clicked_before_true_deadline": bool(in_window),
                    "valid_rt_ge_200_before_true_deadline": status.startswith("valid"),
                    "source_zip": zip_path.name,
                }
            )
    return rows


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    old_drt = pd.read_csv(source_path("DRT输入"), encoding="utf-8-sig")
    mot_input = pd.read_csv(source_path("MOT输入"), encoding="utf-8-sig")
    group_input = pd.read_csv(source_path("心率三组输入"), encoding="utf-8-sig")
    drt_subjects = set(old_drt.loc[old_drt["subject_id"].notna(), "subject_id"].astype(str))
    mot_subjects = set(mot_input.loc[mot_input["subject_id"].notna(), "subject_id"].astype(str))
    group_subjects = set(group_input.loc[group_input["subject_id"].notna(), "subject_id"].astype(str))
    required_subjects = sorted(drt_subjects & mot_subjects & group_subjects)
    old_drt = old_drt[old_drt["subject_id"].astype(str).isin(required_subjects)].copy()

    roster = mot.prepare_survey()
    phone_by_subject = dict(zip(roster["masked_phone"].astype(str), roster["behavior_phone"].astype(str)))
    phone_by_subject.update(EXTRA_BEHAVIOR_PHONE)
    file_index = build_file_index()

    rebuilt: list[dict] = []
    audit: list[dict] = []
    for subject_id in required_subjects:
        behavior_phone = phone_by_subject.get(subject_id)
        if not behavior_phone:
            audit.append({"subject_id": subject_id, "status": "missing_behavior_phone", "rows": 0})
            continue
        try:
            person_rows = []
            for task in mot.TASKS:
                person_rows.extend(raw_rows(subject_id, behavior_phone, task, file_index))
            rebuilt.extend(person_rows)
            audit.append({"subject_id": subject_id, "status": "rebuilt", "rows": len(person_rows)})
        except Exception as exc:
            audit.append({"subject_id": subject_id, "status": f"error: {exc}", "rows": 0})

    audit_df = pd.DataFrame(audit)
    signal = pd.DataFrame(rebuilt)
    if len(signal) != len(old_drt):
        raise RuntimeError(
            f"Rebuilt DRT row count {len(signal)} differs from approved input {len(old_drt)}. "
            "See rebuild audit; refusing to write a partial PMwG input."
        )
    expected = set(required_subjects)
    actual = set(signal["subject_id"].astype(str))
    if actual != expected:
        raise RuntimeError(f"Subject mismatch: missing={sorted(expected - actual)}, extra={sorted(actual - expected)}")

    keep = [
        "subject_id", "state_label", "target_count", "drt_validity_status",
        "first_rt_ms", "red_onset_timestamp_ms", "deadline_timestamp_ms",
    ]
    pmwg_drt = signal[keep].copy()
    summary = {
        "n_subjects": len(required_subjects),
        "old_drt_rows": len(old_drt),
        "rebuilt_drt_rows": len(pmwg_drt),
        "valid_rt_min_ms": RT_MIN_MS,
        "normal_motion_ms_after_highlight": NORMAL_MOTION_MS,
        "signal_1_deadline": "second red-frame onset",
        "signal_2_deadline": "actual motion-stop timestamp",
        "rows_changed_from_legacy_status": None,
    }
    old_cmp = old_drt.copy()
    old_cmp["_row"] = range(len(old_cmp))
    new_cmp = pmwg_drt.copy()
    new_cmp["_row"] = range(len(new_cmp))
    # Output order is raw trial order, matching the legacy input. This is only
    # an audit count, not the join key used by the model.
    changed = (old_cmp["drt_validity_status"].astype(str).str.startswith("valid").to_numpy()
               != new_cmp["drt_validity_status"].astype(str).str.startswith("valid").to_numpy()).sum()
    summary["rows_changed_from_legacy_status"] = int(changed)

    audit_df.to_csv(OUT / "DRT真实截止点_重建审计.csv", index=False, encoding="utf-8-sig")
    signal.to_csv(OUT / "DRT真实截止点_逐信号完整审计.csv", index=False, encoding="utf-8-sig")
    pmwg_drt.to_csv(OUT / "PMwG_66人_DRT输入_真实截止点.csv", index=False, encoding="utf-8-sig")
    mot_input.to_csv(OUT / "PMwG_66人_MOT输入_沿用已质控.csv", index=False, encoding="utf-8-sig")
    group_input.to_csv(OUT / "PMwG_66人_心率三组输入_沿用已质控.csv", index=False, encoding="utf-8-sig")
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
