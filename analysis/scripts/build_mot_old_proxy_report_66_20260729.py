#!/usr/bin/env python3
"""Create the transparent pre-PMwG MOT/DRT proxy report for the formal HR3 N=66 sample.

The group source is intentionally the formal PMwG subject_group_audit.csv.
This prevents experience-group labels from leaking into the HR3 report.
"""
from __future__ import annotations

import itertools
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt


F_ROOT = Path("F:/")
STAGES = ["rest", "exercise1", "exercise2"]


def u(text: str) -> str:
    """Decode ASCII unicode escapes so this source remains robust in Windows PowerShell."""
    return text.encode("ascii").decode("unicode_escape")


G_ATHLETE = u("\\u8fd0\\u52a8\\u5458")
G_HIGH = u("\\u975e\\u8fd0\\u52a8\\u5458\\u9ad8\\u5fc3\\u7387")
G_LOW = u("\\u975e\\u8fd0\\u52a8\\u5458\\u4f4e\\u5fc3\\u7387")
GROUPS = [G_ATHLETE, G_HIGH, G_LOW]
COLORS = {G_ATHLETE: "#4472C4", G_HIGH: "#ED7D31", G_LOW: "#70AD47"}
STAGE_CN = {"rest": u("\\u9759\\u606f"), "exercise1": u("\\u7b2c\\u4e00\\u6b21\\u8fd0\\u52a8\\u540e"), "exercise2": u("\\u7b2c\\u4e8c\\u6b21\\u8fd0\\u52a8\\u540e")}
GROUP_MAP = {"athlete": G_ATHLETE, "nonathlete_high_hr": G_HIGH, "nonathlete_low_hr": G_LOW}
ANALYSIS_ROOT = F_ROOT / u("\\u8db3\\u7403\\u5b9e\\u9a8c\\u6570\\u636e/\\u5206\\u6790\\u8f93\\u51fa")
PREPARED_INPUT = ANALYSIS_ROOT / u("PMwG_\\u9057\\u6f0f\\u8fd0\\u52a8\\u54581825\\u8865\\u5165\\u5ba1\\u8ba1_20260729")
FORMAL_OUTPUT = ANALYSIS_ROOT / u("MOT_DRT_PMWG_HR3_full_20260729_grouped_66\\u4eba\\u6700\\u7ec8\\u7248")
OUT = ANALYSIS_ROOT / "MOT_DRT_proxy_HR3_66_20260730"
TABLES = OUT / "tables"
FIGS = OUT / "figures"


def find_inputs() -> tuple[Path, Path, Path]:
    group = FORMAL_OUTPUT / "subject_group_audit.csv"
    mot = PREPARED_INPUT / u("PMwG_66\\u4eba_MOT\\u8f93\\u5165_\\u542b\\u8865\\u5165\\u8fd0\\u52a8\\u5458.csv")
    drt = PREPARED_INPUT / u("PMwG_66\\u4eba_DRT\\u8f93\\u5165_\\u542b\\u8865\\u5165\\u8fd0\\u52a8\\u5458.csv")
    for path in [mot, drt, group]:
        if not path.exists():
            raise FileNotFoundError(f"Expected PMwG input/audit was not found: {path}")
    return mot, drt, group


def init() -> None:
    for font in [Path("C:/Windows/Fonts/msyh.ttc"), Path("C:/Windows/Fonts/simhei.ttf")]:
        if font.exists():
            from matplotlib import font_manager
            font_manager.fontManager.addfont(str(font))
            plt.rcParams["font.family"] = font_manager.FontProperties(fname=str(font)).get_name()
            break
    plt.rcParams["axes.unicode_minus"] = False
    TABLES.mkdir(parents=True, exist_ok=True)
    FIGS.mkdir(parents=True, exist_ok=True)


def ptext(value: float) -> str:
    return "NA" if not np.isfinite(value) else ("<.001" if value < .001 else f"{value:.3f}")


def mark(value: float) -> str:
    if not np.isfinite(value):
        return u("\\u65e0\\u6cd5\\u4f30\\u8ba1")
    if value < .05:
        return u("\\u663e\\u8457")
    if value < .10:
        return u("\\u8d8b\\u52bf")
    return u("\\u4e0d\\u663e\\u8457")


def sem(values: pd.Series) -> float:
    values = pd.to_numeric(values, errors="coerce").dropna()
    return values.std(ddof=1) / math.sqrt(len(values)) if len(values) > 1 else math.nan


def cliffs_delta(a: np.ndarray, b: np.ndarray) -> float:
    if not len(a) or not len(b):
        return math.nan
    return float((np.sum(a[:, None] > b) - np.sum(a[:, None] < b)) / (len(a) * len(b)))


def run_tests(frame: pd.DataFrame, metric: str, condition: str) -> tuple[dict, list[dict]]:
    values = {
        group: pd.to_numeric(frame.loc[frame.group_hr3.eq(group), metric], errors="coerce").dropna().to_numpy(float)
        for group in GROUPS
    }
    if all(len(values[group]) >= 2 for group in GROUPS):
        statistic, p_value = stats.kruskal(*(values[group] for group in GROUPS))
    else:
        statistic, p_value = math.nan, math.nan
    overall = {
        "condition": condition,
        "metric": metric,
        "n_athlete": len(values[G_ATHLETE]),
        "n_nonathlete_high_hr": len(values[G_HIGH]),
        "n_nonathlete_low_hr": len(values[G_LOW]),
        "kruskal_h": statistic,
        "raw_p": p_value,
        "flag": mark(p_value),
    }
    pairs: list[dict] = []
    for left, right in itertools.combinations(GROUPS, 2):
        a, b = values[left], values[right]
        if len(a) and len(b):
            statistic, p_value = stats.mannwhitneyu(a, b, alternative="two-sided")
        else:
            statistic, p_value = math.nan, math.nan
        pairs.append({
            "condition": condition, "metric": metric, "group_a": left, "group_b": right,
            "n_a": len(a), "n_b": len(b), "mean_a": a.mean() if len(a) else math.nan,
            "mean_b": b.mean() if len(b) else math.nan, "mw_u": statistic, "raw_p": p_value,
            "cliffs_delta": cliffs_delta(a, b), "flag": mark(p_value),
        })
    return overall, pairs


def trend_figure(frame: pd.DataFrame, metric: str, label: str, number: int) -> Path:
    fig, axes = plt.subplots(1, 5, figsize=(19, 4.6), sharey=True)
    for axis, load in zip(axes, range(1, 6)):
        subset = frame[frame.target_count.eq(load)]
        for group in GROUPS:
            group_frame = subset[subset.group_hr3.eq(group)]
            means = group_frame.groupby("stage")[metric].mean().reindex(STAGES)
            errors = group_frame.groupby("stage")[metric].apply(sem).reindex(STAGES)
            axis.errorbar(range(3), means, yerr=errors, marker="o", capsize=4, color=COLORS[group], label=group)
            for index, stage in enumerate(STAGES):
                points = pd.to_numeric(group_frame.loc[group_frame.stage.eq(stage), metric], errors="coerce").dropna()
                jitter = np.random.default_rng(number * 100 + load * 10 + index).normal(index, .028, len(points))
                axis.scatter(jitter, points, color=COLORS[group], alpha=.28, s=12)
        phase_p = []
        for stage in STAGES:
            overall, _ = run_tests(subset[subset.stage.eq(stage)], metric, f"{stage}_load{load}")
            phase_p.append(f"{stage.replace('exercise', 'e')}={ptext(overall['raw_p'])}")
        axis.set_title(f"{load}{u('\\u7403')}\npR/e1/e2: {' | '.join(phase_p)}", fontsize=8.2)
        axis.set_xticks(range(3), [STAGE_CN[stage] for stage in STAGES], rotation=18)
        axis.grid(axis="y", alpha=.22)
    axes[0].set_ylabel(label)
    axes[0].legend(frameon=False, fontsize=8, loc="best")
    fig.suptitle(f"{label}: 1-5 {u('\\u7403')} {u('\\u9636\\u6bb5')} {u('\\u8d8b\\u52bf')}", y=1.05, fontsize=16)
    fig.tight_layout()
    path = FIGS / f"figure_{number:02d}_{metric}_trend_load1to5.png"
    fig.savefig(path, dpi=190, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path


def stage_load_figure(frame: pd.DataFrame, metric: str, label: str, stage: str, number: int) -> tuple[Path, list[dict], list[dict]]:
    """Draw 4-ball, 5-ball, and pooled 4+5-ball distributions for one stage."""
    fig, axes = plt.subplots(1, 3, figsize=(14.3, 4.8), sharey=True)
    all_overalls: list[dict] = []
    all_pairs: list[dict] = []
    stage_frame = frame[frame.stage.eq(stage)]
    conditions = [("4", stage_frame[stage_frame.target_count.eq(4)]), ("5", stage_frame[stage_frame.target_count.eq(5)])]
    pooled = stage_frame[stage_frame.target_count.isin([4, 5])].groupby(["subject_id", "group_hr3"], as_index=False)[metric].mean()
    conditions.append(("4+5", pooled))
    for axis, (load_label, subset) in zip(axes, conditions):
        overall, pairs = run_tests(subset, metric, f"{stage}_load{load_label}")
        all_overalls.append(overall)
        all_pairs.extend(pairs)
        for index, group in enumerate(GROUPS):
            values = pd.to_numeric(subset.loc[subset.group_hr3.eq(group), metric], errors="coerce").dropna()
            axis.scatter(np.random.default_rng(number * 100 + index).normal(index, .045, len(values)), values, color=COLORS[group], alpha=.66, s=29)
            if len(values):
                axis.errorbar(index, values.mean(), yerr=sem(values), fmt="o", color=COLORS[group], capsize=5, markersize=8)
        axis.set_xticks(range(3), GROUPS, rotation=10, fontsize=8.2)
        axis.set_title(f"{load_label}{u('\\u7403')}\nKruskal p={ptext(overall['raw_p'])}")
        axis.grid(axis="y", alpha=.24)
    axes[0].set_ylabel(label)
    fig.suptitle(f"{label}: {STAGE_CN[stage]} | 4 {u('\\u7403')}, 5 {u('\\u7403')}, 4+5 {u('\\u7403')}", y=1.03, fontsize=15)
    fig.tight_layout()
    path = FIGS / f"figure_{number:02d}_{metric}_{stage}_load4_load5_load4plus5.png"
    fig.savefig(path, dpi=190, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return path, all_overalls, all_pairs


def add_table(document: Document, frame: pd.DataFrame, heading: str, maximum: int = 40) -> None:
    document.add_heading(heading, level=2)
    show = frame.head(maximum).fillna("")
    if len(frame) > maximum:
        document.add_paragraph(f"Full CSV contains {len(frame)} rows; this document shows the first {maximum} rows.")
    table = document.add_table(rows=1, cols=len(show.columns))
    table.style = "Table Grid"
    for column_index, column in enumerate(show.columns):
        table.rows[0].cells[column_index].text = str(column)
    for _, row in show.iterrows():
        cells = table.add_row().cells
        for column_index, value in enumerate(row):
            cells[column_index].text = f"{value:.3f}" if isinstance(value, float) else str(value)
    for row in table.rows:
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                for run in paragraph.runs:
                    run.font.name = "Microsoft YaHei"
                    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
                    run.font.size = Pt(7.2)


def main() -> None:
    init()
    mot_path, drt_path, group_path = find_inputs()
    mot = pd.read_csv(mot_path, encoding="utf-8-sig")
    drt = pd.read_csv(drt_path, encoding="utf-8-sig")
    group = pd.read_csv(group_path, encoding="utf-8-sig")[["subject_id", "group_label"]].drop_duplicates()
    group["group_hr3"] = group.group_label.map(GROUP_MAP)
    group = group[["subject_id", "group_hr3"]]
    expected = {G_ATHLETE: 21, G_HIGH: 23, G_LOW: 22}
    observed = group.groupby("group_hr3").size().to_dict()
    if observed != expected:
        raise ValueError(f"Formal HR3 audit mismatch: {observed}; expected {expected}")

    mot["stage"] = mot.stage.astype(str)
    mot["target_count"] = pd.to_numeric(mot.target_count, errors="coerce")
    mot["target_total"] = mot.mot_selected_targets + mot.mot_missed_targets
    mot["nontarget_total"] = 40 - mot.target_total
    mot["hit_adj"] = (mot.mot_selected_targets + .5) / (mot.target_total + 1)
    mot["fa_adj"] = (mot.mot_false_selection_count_int + .5) / (mot.nontarget_total + 1)
    mot["mot_dprime"] = stats.norm.ppf(mot.hit_adj) - stats.norm.ppf(mot.fa_adj)
    mot["mot_accuracy"] = mot.mot_selected_targets / mot.target_total
    mot = mot.merge(group, on="subject_id", how="inner")

    # DRT exports contain both direct phase labels and the task-state labels.
    # Treat the two labels for each phase as equivalent before aggregation.
    stage_map = {
        u("\\u9759\\u606f"): "rest",
        u("\\u8fd0\\u52a8\\u4e2d"): "exercise1",
        u("\\u8fd0\\u52a8\\u540e"): "exercise2",
        u("\\u7b2c\\u4e00\\u6b21\\u8fd0\\u52a8\\u540e"): "exercise1",
        u("\\u7b2c\\u4e8c\\u6b21\\u8fd0\\u52a8\\u540e"): "exercise2",
    }
    drt["stage"] = drt.state_label.map(stage_map).fillna(drt.state_label)
    drt["target_count"] = pd.to_numeric(drt.target_count, errors="coerce")
    drt["hit"] = drt.drt_validity_status.eq("valid_200_3000").astype(int)
    def valid_log_rt(series: pd.Series) -> float:
        eligible = drt.loc[series.index, "hit"].eq(1)
        values = pd.to_numeric(series[eligible], errors="coerce").dropna()
        return float(np.log(values).mean()) if len(values) else math.nan
    dsum = drt.groupby(["subject_id", "stage", "target_count"], as_index=False).agg(
        drt_signal_n=("hit", "size"), drt_hit_rate=("hit", "mean"), drt_logrt=("first_rt_ms", valid_log_rt)
    ).merge(group, on="subject_id", how="inner")

    data = mot.merge(dsum, on=["subject_id", "stage", "target_count", "group_hr3"], how="left")
    data["mot_units"] = data.groupby("target_count").mot_dprime.rank(pct=True)
    data["drt_units"] = data.groupby("target_count").drt_hit_rate.rank(pct=True) - data.groupby("target_count").drt_logrt.rank(pct=True)
    data["G_proxy_behavioral"] = data.mot_units + data.drt_units
    data["pi_proxy_drt_share"] = data.drt_units / (data.G_proxy_behavioral.abs() + 1e-6)
    data.to_csv(TABLES / "participant_stage_load_metrics_hr3.csv", index=False, encoding="utf-8-sig")

    metrics = [
        ("mot_accuracy", "MOT accuracy"), ("mot_dprime", "MOT d-prime"),
        ("drt_hit_rate", "DRT hit rate"), ("drt_logrt", "DRT logRT"),
        ("G_proxy_behavioral", "G proxy (behavioral resource proxy)"),
        ("pi_proxy_drt_share", "pi proxy (DRT allocation proxy)"),
    ]
    long = data.melt(id_vars=["subject_id", "group_hr3", "stage", "target_count"], value_vars=[item[0] for item in metrics], var_name="metric", value_name="value")
    descriptive = long.groupby(["group_hr3", "stage", "target_count", "metric"], as_index=False).agg(
        n=("value", "count"), mean=("value", "mean"), sd=("value", "std"), median=("value", "median"), min=("value", "min"), max=("value", "max")
    )
    descriptive.to_csv(TABLES / "descriptive_statistics_all_metrics.csv", index=False, encoding="utf-8-sig")

    trend_paths = []
    stage_load_paths = []
    overalls: list[dict] = []
    pairs: list[dict] = []
    for number, (metric, label) in enumerate(metrics, start=1):
        trend_paths.append((label, trend_figure(data, metric, label, number)))
        for stage_index, stage in enumerate(STAGES):
            figure_number = number + len(metrics) + stage_index * len(metrics)
            stage_path, overall_rows, pair_rows = stage_load_figure(data, metric, label, stage, figure_number)
            stage_load_paths.append((label, stage, stage_path))
            overalls.extend(overall_rows)
            pairs.extend(pair_rows)
    overall_frame = pd.DataFrame(overalls)
    pair_frame = pd.DataFrame(pairs)
    overall_frame.to_csv(TABLES / "all_stages_load4_load5_load4plus5_kruskal_all_metrics.csv", index=False, encoding="utf-8-sig")
    pair_frame.to_csv(TABLES / "all_stages_load4_load5_load4plus5_pairwise_mannwhitney_all_metrics.csv", index=False, encoding="utf-8-sig")

    document = Document()
    for style_name in ["Normal", "Heading 1", "Heading 2"]:
        style = document.styles[style_name]
        style.font.name = "Microsoft YaHei"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title = paragraph.add_run(u("\\u8db3\\u7403\\u5b9e\\u9a8c MOT/DRT \\u884c\\u4e3a\\u8d44\\u6e90\\u4ee3\\u7406\\u62a5\\u544a (66\\u4eba, \\u5fc3\\u7387\\u4e09\\u7ec4)"))
    title.bold = True
    title.font.size = Pt(20)
    document.add_paragraph(u("\\u5206\\u7ec4\\u5b8c\\u5168\\u4ee5\\u6b63\\u5f0f PMwG \\u6a21\\u578b\\u7684 subject_group_audit.csv \\u4e3a\\u51c6: \\u8fd0\\u52a8\\u545821\\u4eba, \\u975e\\u8fd0\\u52a8\\u5458\\u9ad8\\u5fc3\\u738723\\u4eba, \\u975e\\u8fd0\\u52a8\\u5458\\u4f4e\\u5fc3\\u738722\\u4eba. \\u672c\\u62a5\\u544a\\u4e0d\\u4f7f\\u7528\\u8fd0\\u52a8\\u7ecf\\u9a8c\\u5206\\u7ec4."))
    document.add_heading(u("\\u8ba1\\u7b97\\u53e3\\u5f84"), level=1)
    document.add_paragraph("MOT d-prime uses the direct-selection counts with half-count correction. DRT hit is valid_200_3000; logRT uses valid hits only. G proxy and pi proxy are transparent behavioral proxies, not the formal PMwG posterior latent parameters.")
    add_table(document, descriptive, u("\\u88681. \\u5168\\u90e8\\u6307\\u6807\\u63cf\\u8ff0\\u7edf\\u8ba1"), 60)
    document.add_heading(u("1-5\\u7403\\u9636\\u6bb5\\u8d8b\\u52bf"), level=1)
    for number, (label, path) in enumerate(trend_paths, start=1):
        document.add_picture(str(path), width=Cm(16.8))
        caption = document.add_paragraph(f"Figure {number}. {label}; individual points, mean +/- SEM, and raw exercise2 three-group p values are shown.")
        caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_heading(u("\\u5404\\u9636\\u6bb54\\u7403, 5\\u7403\\u53ca4+5\\u7403\\u4e09\\u7ec4\\u6bd4\\u8f83"), level=1)
    add_table(document, overall_frame, u("\\u88682. Kruskal-Wallis \\u603b\\u4f53\\u68c0\\u9a8c (\\u5b8c\\u6574)"), 60)
    for number, (label, stage, path) in enumerate(stage_load_paths, start=7):
        document.add_picture(str(path), width=Cm(15.5))
        caption = document.add_paragraph(f"Figure {number}. {label}; {STAGE_CN[stage]}; 4-ball, 5-ball, and pooled 4+5-ball individual points, mean +/- SEM, and raw Kruskal-Wallis p values are shown.")
        caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_table(document, pair_frame, u("\\u88683. \\u4e24\\u4e24 Mann-Whitney \\u6bd4\\u8f83 (\\u5b8c\\u6574)"), 30)
    document.add_paragraph("All p values are unadjusted raw p values. The formal resource-pool conclusion should rely on the PMwG postprocess outputs after sampling finishes.")
    document.save(OUT / "MOT_DRT_behavioral_proxy_report_HR3_66_20260730.docx")

    summary = {"n": int(len(group)), "groups": {key: int(value) for key, value in observed.items()}, "mot_input": str(mot_path), "drt_input": str(drt_path), "formal_group_audit": str(group_path)}
    (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), **summary}, ensure_ascii=False))


if __name__ == "__main__":
    main()
