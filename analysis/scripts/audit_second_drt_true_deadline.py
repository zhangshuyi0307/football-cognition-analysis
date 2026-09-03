"""Audit DRT signals using the actual MOT motion deadline from the task code.

The former audit used trial_end_timestamp_ms for the final DRT deadline.  That
timestamp includes selection and confirmation, so it is not the motion-stop
deadline.  In this task, fixed_drt_events are measured from the start of normal
motion, and normal motion ends 7,500 ms later.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import pandas as pd

import behavior_paradigm_descriptive_stats as base
import analyze_mot_drt_two_cleaning_versions as mot


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs" / "DRT第二红框真实截止点审计"
NORMAL_MOTION_MS = 7500.0
MIN_RT_MS = 200.0


def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return math.nan


def main() -> None:
    rows = []
    survey = mot.prepare_survey()
    behavior_dir = Path(mot.BEHAVIOR_DIR)
    # All MOT AutoBackup zips are directly under the behavior root.  Build this
    # index once; repeatedly rglob-ing the whole F drive made the earlier audit
    # unnecessarily slow.
    zip_index = list(behavior_dir.glob("*.zip"))
    for _, participant in survey.iterrows():
        phone = participant["behavior_phone"]
        if not phone:
            continue
        for task in mot.TASKS:
            pattern = base.TASK_PATTERNS[task]
            candidates = [p for p in zip_index if str(phone) in p.name and pattern in p.name]
            source = max(candidates, key=lambda p: (p.stat().st_mtime, p.stat().st_size)) if candidates else None
            if not source:
                continue
            data = base.read_trial_csv(source)
            if data is None or data.empty:
                continue
            if "block_type" in data:
                formal = data[data["block_type"].astype(str).str.contains("formal", case=False, na=False)]
                if not formal.empty:
                    data = formal
            for trial_number, (_, trial) in enumerate(data.reset_index(drop=True).iterrows(), 1):
                offsets = base.parse_rt_list(trial.get("fixed_drt_events"))[:2]
                start = num(trial.get("trial_start_timestamp_ms"))
                if len(offsets) < 2 or math.isnan(start):
                    continue
                adjustment = base.infer_drt_red_onset_adjustment_ms(trial, offsets)
                signal_times = [start + adjustment + offset for offset in offsets]
                clicks = sorted(base.parse_rt_list(trial.get("drt_button_click_timestamps_ms")))
                true_motion_stop = start + adjustment + NORMAL_MOTION_MS
                old_trial_end = num(trial.get("trial_end_timestamp_ms"))
                for index, signal_time in enumerate(signal_times, 1):
                    deadline = signal_times[index] if index == 1 else true_motion_stop
                    in_window = [click for click in clicks if signal_time <= click < deadline]
                    first_rt = in_window[0] - signal_time if in_window else math.nan
                    valid = bool(in_window) and first_rt >= MIN_RT_MS
                    old_deadline = signal_times[index] if index == 1 else old_trial_end
                    old_window = [click for click in clicks if signal_time <= click < old_deadline] if not math.isnan(old_deadline) else []
                    old_first_rt = old_window[0] - signal_time if old_window else math.nan
                    old_valid = bool(old_window) and old_first_rt >= MIN_RT_MS
                    rows.append({
                        "masked_phone": participant["masked_phone"],
                        "group": participant["football_group_final"],
                        "stage": mot.TASK_LABELS[task],
                        "trial": trial_number,
                        "target_count": num(trial.get("target_count")),
                        "signal_index": index,
                        "signal_offset_ms_from_normal_motion": offsets[index - 1],
                        "true_window_ms": deadline - signal_time,
                        "clicked_before_true_deadline": bool(in_window),
                        "first_rt_ms": first_rt,
                        "valid_rt_ge_200_before_true_deadline": valid,
                        "old_trial_end_deadline_ms": old_deadline,
                        "old_click_before_trial_end": bool(old_window),
                        "old_valid_rt_ge_200_before_trial_end": old_valid,
                        "classification_changed_from_old_deadline": valid != old_valid,
                    })

    signal = pd.DataFrame(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    signal.to_csv(OUT / "DRT前两红框_真实截止点_逐信号明细_已脱敏.csv", index=False, encoding="utf-8-sig")
    grouped = signal.groupby("signal_index", dropna=False).agg(
        n=("signal_index", "size"),
        mean_window_ms=("true_window_ms", "mean"),
        median_window_ms=("true_window_ms", "median"),
        min_window_ms=("true_window_ms", "min"),
        max_window_ms=("true_window_ms", "max"),
        click_rate_before_deadline=("clicked_before_true_deadline", "mean"),
        valid_rate_rt_ge_200=("valid_rt_ge_200_before_true_deadline", "mean"),
        mean_valid_rt_ms=("first_rt_ms", lambda x: x[(x >= MIN_RT_MS)].mean()),
    ).reset_index()
    second_by_load = signal[signal["signal_index"].eq(2)].groupby("target_count").agg(
        n=("signal_index", "size"),
        mean_window_ms=("true_window_ms", "mean"),
        click_rate_before_deadline=("clicked_before_true_deadline", "mean"),
        valid_rate_rt_ge_200=("valid_rt_ge_200_before_true_deadline", "mean"),
    ).reset_index()
    deadline_comparison = signal.groupby("signal_index", dropna=False).agg(
        n=("signal_index", "size"),
        old_valid_rate=("old_valid_rt_ge_200_before_trial_end", "mean"),
        true_valid_rate=("valid_rt_ge_200_before_true_deadline", "mean"),
        changed_n=("classification_changed_from_old_deadline", "sum"),
        changed_rate=("classification_changed_from_old_deadline", "mean"),
    ).reset_index()
    grouped.to_csv(OUT / "DRT前两红框_真实截止点_汇总.csv", index=False, encoding="utf-8-sig")
    second_by_load.to_csv(OUT / "第二红框_按球数_真实截止点命中率.csv", index=False, encoding="utf-8-sig")
    deadline_comparison.to_csv(OUT / "旧trial_end与真实运动截止点_判定差异.csv", index=False, encoding="utf-8-sig")
    summary = {"normal_motion_ms": NORMAL_MOTION_MS, "min_rt_ms": MIN_RT_MS,
               "first_and_second_summary": grouped.to_dict(orient="records"),
               "second_by_load": second_by_load.to_dict(orient="records"),
               "old_vs_true_deadline": deadline_comparison.to_dict(orient="records")}
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(grouped.to_string(index=False))
    print("\nSecond signal by load")
    print(second_by_load.to_string(index=False))
    print("\nOld trial-end versus true motion-stop deadline")
    print(deadline_comparison.to_string(index=False))
    print(f"\nOutput: {OUT}")


if __name__ == "__main__":
    main()
