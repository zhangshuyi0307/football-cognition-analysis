#!/usr/bin/env python3
"""Fast HR3 MOT/DRT resource-pool proxy analysis.

This is intentionally a fast, transparent behavioural proxy model.  It does
not replace the full PMwG joint likelihood or claim that G_lite/pi_MOT_lite
are PMwG latent parameters.

Inputs are the same cleaned 66-person MOT and true-deadline DRT tables used
by the current formal PMwG run.  Runtime is normally below 10 minutes.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import chi2, norm, t as student_t

plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False


DEFAULT_BASE = Path(r"F:\足球实验数据\分析输出\PMwG_66人真实第二红框截止点输入_20260730")
DEFAULT_OUT = Path(r"F:\足球实验数据\分析输出\MOT_DRT_resource_lite_HR3_20260730")

GROUP_ORDER = ["athlete", "nonathlete_high_hr", "nonathlete_low_hr"]
GROUP_LABEL = {
    "athlete": "运动员",
    "nonathlete_high_hr": "非运动员高心率",
    "nonathlete_low_hr": "非运动员低心率",
}
STAGE_ORDER = ["rest", "exercise1", "exercise2"]
STAGE_LABEL = {"rest": "静息", "exercise1": "第一次运动后", "exercise2": "第二次运动后"}
COLORS = {"athlete": "#2F6DB0", "nonathlete_high_hr": "#E58B2A", "nonathlete_low_hr": "#2E8B57"}


def read_csv(path: Path) -> pd.DataFrame:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return pd.read_csv(path, encoding=encoding)
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"Cannot read {path}")


def existing_file(base: Path, pattern: str) -> Path:
    files = list(base.glob(pattern))
    if len(files) != 1:
        raise FileNotFoundError(f"Expected one {pattern} under {base}; found {len(files)}")
    return files[0]


def stage_std(values: pd.Series) -> pd.Series:
    x = values.fillna("").astype(str).str.lower().str.strip()
    out = pd.Series(np.nan, index=x.index, dtype=object)
    out[x.str.contains("rest|pre|\u9759\u606f", regex=True)] = "rest"
    out[x.str.contains("exercise.?1|post.?1|\u8fd0\u52a8\u4e2d", regex=True)] = "exercise1"
    out[x.str.contains("exercise.?2|post.?2|\u8fd0\u52a8\u540e", regex=True)] = "exercise2"
    return out


def group_std(values: pd.Series) -> pd.Series:
    x = values.fillna("").astype(str).str.lower().str.strip()
    out = pd.Series(np.nan, index=x.index, dtype=object)
    is_non = x.str.contains("non.?athlete|\u975e\u8fd0\u52a8\u5458", regex=True)
    out[(~is_non) & x.str.contains("athlete|\u8fd0\u52a8\u5458", regex=True)] = "athlete"
    out[is_non & x.str.contains("high.?hr|\u9ad8\u5fc3\u7387", regex=True)] = "nonathlete_high_hr"
    out[is_non & x.str.contains("low.?hr|\u4f4e\u5fc3\u7387", regex=True)] = "nonathlete_low_hr"
    return out


def z_within_load(data: pd.DataFrame, column: str) -> pd.Series:
    def standardize(s: pd.Series) -> pd.Series:
        sd = s.std(ddof=0)
        return (s - s.mean()) / sd if np.isfinite(sd) and sd > 0 else s * np.nan
    return data.groupby("target_count", observed=True)[column].transform(standardize)


def build_design(data: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    """Treatment-coded group * stage * load design without statsmodels."""
    vectors: dict[str, np.ndarray] = {"Intercept": np.ones(len(data), dtype=float)}
    families: list[list[str]] = []
    for column, baseline, levels, label in (
        ("group", "athlete", GROUP_ORDER, "group"),
        ("stage", "rest", STAGE_ORDER, "stage"),
        ("target_count", 1, [1, 2, 3, 4, 5], "load"),
    ):
        names = []
        for level in levels:
            if level == baseline:
                continue
            name = f"{label}[{level}]"
            vectors[name] = (data[column].to_numpy() == level).astype(float)
            names.append(name)
        families.append(names)
    group_terms, stage_terms, load_terms = families
    for left, right in ((group_terms, stage_terms), (group_terms, load_terms), (stage_terms, load_terms)):
        for a in left:
            for b in right:
                vectors[f"{a}:{b}"] = vectors[a] * vectors[b]
    for a in group_terms:
        for b in stage_terms:
            for c in load_terms:
                vectors[f"{a}:{b}:{c}"] = vectors[a] * vectors[b] * vectors[c]
    return np.column_stack(list(vectors.values())), list(vectors)


def fit_cluster_ols(data: pd.DataFrame, outcome: str) -> tuple[pd.DataFrame, float, np.ndarray]:
    """OLS with subject-cluster robust covariance; no external stats package."""
    X, names = build_design(data)
    y = data[outcome].to_numpy(dtype=float)
    xtx_inv = np.linalg.pinv(X.T @ X)
    beta = xtx_inv @ X.T @ y
    resid = y - X @ beta
    meat = np.zeros((X.shape[1], X.shape[1]))
    for subject in data.subject_id.unique():
        take = data.subject_id.to_numpy() == subject
        score = X[take].T @ resid[take]
        meat += np.outer(score, score)
    n, p = X.shape
    clusters = data.subject_id.nunique()
    correction = (clusters / max(clusters - 1, 1)) * ((n - 1) / max(n - p, 1))
    cov = correction * xtx_inv @ meat @ xtx_inv
    se = np.sqrt(np.maximum(np.diag(cov), 0))
    stat = beta / np.where(se > 0, se, np.nan)
    pvals = 2 * student_t.sf(np.abs(stat), df=max(clusters - 1, 1))
    conf_half = student_t.ppf(0.975, df=max(clusters - 1, 1)) * se
    result = pd.DataFrame({
        "term": names,
        "estimate": beta,
        "se_cluster": se,
        "z_or_t": stat,
        "raw_p": pvals,
        "ci_low": beta - conf_half,
        "ci_high": beta + conf_half,
        "n_rows": n,
        "n_subjects": clusters,
    })
    ss_total = float(np.sum((y - np.mean(y)) ** 2))
    r2 = 1 - float(np.sum(resid ** 2)) / ss_total if ss_total > 0 else np.nan
    return result, r2, cov


def build_design_group_stage(data: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    """Treatment-coded group * stage design for one fixed ball-count."""
    vectors: dict[str, np.ndarray] = {"Intercept": np.ones(len(data), dtype=float)}
    group_terms: list[str] = []
    stage_terms: list[str] = []
    for level in GROUP_ORDER[1:]:
        name = f"group[{level}]"
        vectors[name] = (data["group"].to_numpy() == level).astype(float)
        group_terms.append(name)
    for level in STAGE_ORDER[1:]:
        name = f"stage[{level}]"
        vectors[name] = (data["stage"].to_numpy() == level).astype(float)
        stage_terms.append(name)
    for group_term in group_terms:
        for stage_term in stage_terms:
            vectors[f"{group_term}:{stage_term}"] = vectors[group_term] * vectors[stage_term]
    return np.column_stack(list(vectors.values())), list(vectors)


def fit_cluster_ols_group_stage(data: pd.DataFrame, outcome: str) -> tuple[pd.DataFrame, float, np.ndarray]:
    """Subject-cluster robust OLS for one ball-count, no zero load columns."""
    X, names = build_design_group_stage(data)
    y = data[outcome].to_numpy(dtype=float)
    xtx_inv = np.linalg.pinv(X.T @ X)
    beta = xtx_inv @ X.T @ y
    resid = y - X @ beta
    meat = np.zeros((X.shape[1], X.shape[1]))
    for subject in data.subject_id.unique():
        take = data.subject_id.to_numpy() == subject
        score = X[take].T @ resid[take]
        meat += np.outer(score, score)
    n, p = X.shape
    clusters = data.subject_id.nunique()
    correction = (clusters / max(clusters - 1, 1)) * ((n - 1) / max(n - p, 1))
    cov = correction * xtx_inv @ meat @ xtx_inv
    se = np.sqrt(np.maximum(np.diag(cov), 0))
    stat = beta / np.where(se > 0, se, np.nan)
    pvals = 2 * student_t.sf(np.abs(stat), df=max(clusters - 1, 1))
    conf_half = student_t.ppf(0.975, df=max(clusters - 1, 1)) * se
    result = pd.DataFrame({
        "term": names,
        "estimate": beta,
        "se_cluster": se,
        "z_or_t": stat,
        "raw_p": pvals,
        "ci_low": beta - conf_half,
        "ci_high": beta + conf_half,
        "n_rows": n,
        "n_subjects": clusters,
    })
    ss_total = float(np.sum((y - np.mean(y)) ** 2))
    r2 = 1 - float(np.sum(resid ** 2)) / ss_total if ss_total > 0 else np.nan
    return result, r2, cov


def joint_wald_pvalue(result: pd.DataFrame, covariance: np.ndarray, selector) -> float:
    idx = [i for i, name in enumerate(result.term) if selector(name)]
    if not idx:
        return np.nan
    beta = result.estimate.to_numpy(dtype=float)[idx]
    subcov = covariance[np.ix_(idx, idx)]
    statistic = float(beta.T @ np.linalg.pinv(subcov) @ beta)
    return float(chi2.sf(statistic, df=len(idx)))


def plot_metric(data: pd.DataFrame, metric: str, title: str, y_label: str, p_value: float, output: Path) -> None:
    fig, axes = plt.subplots(1, 5, figsize=(18, 4), sharey=True)
    rng = np.random.default_rng(20260730)
    for ax, load in zip(axes, range(1, 6)):
        part = data[data.target_count == load]
        for group in GROUP_ORDER:
            g = part[part.group == group]
            means = g.groupby("stage", observed=True)[metric].mean().reindex(STAGE_ORDER)
            sems = g.groupby("stage", observed=True)[metric].sem().reindex(STAGE_ORDER)
            x = np.arange(3)
            ax.errorbar(x, means, yerr=sems, marker="o", linewidth=2,
                        capsize=3, color=COLORS[group], label=GROUP_LABEL[group])
            for idx, stage in enumerate(STAGE_ORDER):
                vals = g.loc[g.stage == stage, metric].dropna().to_numpy()
                if len(vals):
                    jitter = rng.uniform(-0.07, 0.07, size=len(vals))
                    ax.scatter(np.full(len(vals), idx) + jitter, vals, s=15,
                               alpha=0.35, color=COLORS[group], zorder=1)
        ax.set_title(f"{load}球")
        ax.set_xticks(range(3), [STAGE_LABEL[s] for s in STAGE_ORDER], rotation=20, ha="right")
        ax.grid(axis="y", alpha=0.22)
    axes[0].set_ylabel(y_label)
    handles, labels = axes[-1].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", bbox_to_anchor=(0.5, 0.88),
               ncol=3, frameon=False)
    p_text = "NA" if not np.isfinite(p_value) else f"{p_value:.4f}"
    fig.suptitle(f"{title} | 组别×阶段联合 Wald 原始 p = {p_text}", y=0.99, fontsize=14)
    fig.subplots_adjust(left=0.06, right=0.995, top=0.72, bottom=0.24, wspace=0.08)
    fig.savefig(output, dpi=220, bbox_inches="tight")
    plt.close(fig)


def plot_metric_single_load(data: pd.DataFrame, metric: str, title: str, y_label: str,
                            load: int, p_value: float, output: Path) -> None:
    """One-ball-count figure: all individual points, mean +/- SEM, raw group*stage p."""
    fig, ax = plt.subplots(figsize=(8.8, 5.4))
    rng = np.random.default_rng(20260730 + load)
    x = np.arange(len(STAGE_ORDER), dtype=float)
    for group_index, group in enumerate(GROUP_ORDER):
        part = data[data.group.eq(group)]
        means = part.groupby("stage", observed=True)[metric].mean().reindex(STAGE_ORDER)
        sems = part.groupby("stage", observed=True)[metric].sem().reindex(STAGE_ORDER)
        offset = (group_index - 1) * 0.05
        ax.errorbar(x + offset, means, yerr=sems, marker="o", linewidth=2.1,
                    capsize=4, color=COLORS[group], label=GROUP_LABEL[group], zorder=3)
        for idx, stage in enumerate(STAGE_ORDER):
            vals = part.loc[part.stage.eq(stage), metric].dropna().to_numpy()
            if len(vals):
                jitter = rng.uniform(-0.045, 0.045, size=len(vals))
                ax.scatter(np.full(len(vals), idx + offset) + jitter, vals, s=22,
                           alpha=0.32, color=COLORS[group], zorder=2)
    p_text = "NA" if not np.isfinite(p_value) else f"{p_value:.4f}"
    ax.set_title(f"{title}: {load}球 | 组别×阶段原始 p = {p_text}", fontsize=13, pad=13)
    ax.set_ylabel(y_label)
    ax.set_xticks(x, [STAGE_LABEL[s] for s in STAGE_ORDER])
    ax.grid(axis="y", alpha=0.23)
    ax.legend(frameon=False, ncol=3, loc="upper center", bbox_to_anchor=(0.5, -0.16))
    fig.tight_layout(rect=(0, 0.06, 1, 1))
    fig.savefig(output, dpi=220, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_BASE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    mot_path = existing_file(args.input_dir, "PMwG_*_MOT*.csv")
    drt_path = existing_file(args.input_dir, "PMwG_*_DRT*.csv")
    group_path = existing_file(args.input_dir, "PMwG_*_心率三组*.csv")
    out = args.output_dir
    figures = out / "figures"
    out.mkdir(parents=True, exist_ok=True)
    figures.mkdir(exist_ok=True)

    mot = read_csv(mot_path)
    drt = read_csv(drt_path)
    groups = read_csv(group_path)
    groups["subject_id"] = groups["subject_id"].astype(str)
    group_source = "hr_group3" if "hr_group3" in groups.columns else "group3"
    group_key = groups[["subject_id", group_source]].copy()
    group_key["group"] = group_std(group_key[group_source])
    group_key = group_key.dropna(subset=["group"]).drop_duplicates("subject_id")[["subject_id", "group"]]

    mot["subject_id"] = mot["subject_id"].astype(str)
    mot["stage"] = stage_std(mot["stage"])
    mot["target_count"] = pd.to_numeric(mot["target_count"], errors="coerce")
    mot = mot.merge(group_key, on="subject_id", how="inner")
    mot = mot[mot.stage.isin(STAGE_ORDER) & mot.target_count.between(1, 5)].copy()
    mot_counts = (mot.groupby(["subject_id", "group", "stage", "target_count"], as_index=False)
                  .agg(selected=("mot_selected_targets", "sum"),
                       missed=("mot_missed_targets", "sum"),
                       false_alarm=("mot_false_selection_count_int", "sum"),
                       source_rows=("target_count", "size")))
    # The PMwG MOT rows are already counts across repeated trials.  The
    # selected+missed total therefore defines the actual number of targets.
    mot_counts["target_total"] = mot_counts.selected + mot_counts.missed
    mot_counts["n_trials"] = mot_counts.target_total / mot_counts.target_count
    mot_counts["nontarget_total"] = 10 * mot_counts.n_trials - mot_counts.target_total
    hit_adj = (mot_counts.selected + 0.5) / (mot_counts.target_total + 1)
    fa_adj = (mot_counts.false_alarm + 0.5) / (mot_counts.nontarget_total + 1)
    mot_counts["mot_dprime"] = norm.ppf(hit_adj) - norm.ppf(fa_adj)

    drt["subject_id"] = drt["subject_id"].astype(str)
    drt["stage"] = stage_std(drt["state_label"])
    drt["target_count"] = pd.to_numeric(drt["target_count"], errors="coerce")
    drt["valid_hit"] = drt["drt_validity_status"].fillna("").astype(str).str.lower().str.startswith("valid")
    drt["first_rt_ms"] = pd.to_numeric(drt["first_rt_ms"], errors="coerce")
    drt = drt.merge(group_key, on="subject_id", how="inner")
    drt = drt[drt.stage.isin(STAGE_ORDER) & drt.target_count.between(1, 5)].copy()
    drt_counts = (drt.groupby(["subject_id", "group", "stage", "target_count"], as_index=False)
                  .agg(drt_signal_n=("valid_hit", "size"), drt_hit_n=("valid_hit", "sum")))
    valid_rt = drt[drt.valid_hit & drt.first_rt_ms.gt(0)].copy()
    rt_table = (valid_rt.groupby(["subject_id", "group", "stage", "target_count"], as_index=False)
                .agg(drt_logrt=("first_rt_ms", lambda x: np.log(x).mean())))
    drt_counts["drt_hit_rate"] = drt_counts.drt_hit_n / drt_counts.drt_signal_n
    drt_counts = drt_counts.merge(rt_table, on=["subject_id", "group", "stage", "target_count"], how="left")

    data = mot_counts.merge(drt_counts, on=["subject_id", "group", "stage", "target_count"], how="inner")
    data["z_mot"] = z_within_load(data, "mot_dprime")
    data["z_drt_hit"] = z_within_load(data, "drt_hit_rate")
    data["z_drt_speed"] = -z_within_load(data, "drt_logrt")
    data["z_drt"] = (data.z_drt_hit + data.z_drt_speed) / 2
    data["G_lite"] = (data.z_mot + data.z_drt) / 2
    data["pi_MOT_lite"] = data.z_mot - data.z_drt
    data.to_csv(out / "resource_lite_subject_stage_load.csv", index=False, encoding="utf-8-sig")

    terms = []
    load_terms = []
    for metric in ("G_lite", "pi_MOT_lite"):
        frame = data.dropna(subset=[metric]).copy()
        model_terms, r2, covariance = fit_cluster_ols(frame, metric)
        model_terms.insert(0, "metric", metric)
        model_terms["r2"] = r2
        terms.extend(model_terms.to_dict("records"))
        p_interaction = joint_wald_pvalue(
            model_terms, covariance,
            lambda name: "group[" in name and ":stage[" in name and ":load[" not in name,
        )
        plot_metric(frame, metric,
                    "简版资源总量代理 G_lite" if metric == "G_lite" else "简版 MOT 分配偏向 pi_MOT_lite",
                    "标准化双任务效率" if metric == "G_lite" else "MOT 相对 DRT 偏向",
                    p_interaction, figures / f"{metric}_phase_load_hr3_raw_p.png")

        # The complete five-ball analysis: each ball-count is fit separately,
        # rather than treated only as a panel in the pooled group*stage*load model.
        for load in range(1, 6):
            load_frame = frame[frame.target_count.eq(load)].copy()
            one_terms, one_r2, one_covariance = fit_cluster_ols_group_stage(load_frame, metric)
            one_terms.insert(0, "metric", metric)
            one_terms.insert(1, "target_count", load)
            one_terms["r2"] = one_r2
            p_group_stage = joint_wald_pvalue(
                one_terms, one_covariance,
                lambda name: "group[" in name and ":stage[" in name,
            )
            one_terms["group_stage_joint_raw_p"] = p_group_stage
            load_terms.extend(one_terms.to_dict("records"))
            plot_metric_single_load(
                load_frame, metric,
                "简版资源总量代理 G_lite" if metric == "G_lite" else "简版 MOT 分配偏向 pi_MOT_lite",
                "标准化双任务效率" if metric == "G_lite" else "MOT 相对 DRT 偏向",
                load, p_group_stage, figures / f"{metric}_load{load}_group_stage_raw_p.png",
            )

    pd.DataFrame(terms).to_csv(out / "resource_lite_cluster_robust_models.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(load_terms).to_csv(out / "resource_lite_by_load_group_stage_models.csv", index=False, encoding="utf-8-sig")
    summary = (data.groupby(["group", "stage", "target_count"], as_index=False)
               .agg(n=("subject_id", "nunique"),
                    mot_dprime_mean=("mot_dprime", "mean"),
                    drt_hit_rate_mean=("drt_hit_rate", "mean"),
                    drt_logrt_mean=("drt_logrt", "mean"),
                    G_lite_mean=("G_lite", "mean"),
                    pi_MOT_lite_mean=("pi_MOT_lite", "mean")))
    summary.to_csv(out / "resource_lite_descriptive.csv", index=False, encoding="utf-8-sig")
    manifest = {
        "model": "Fast behavioural resource-pool proxy; not PMwG latent posterior",
        "inputs": {"mot": str(mot_path), "drt": str(drt_path), "groups": str(group_path)},
        "n_subjects": int(data.subject_id.nunique()),
        "group_counts": data[["subject_id", "group"]].drop_duplicates().groupby("group").size().to_dict(),
        "definitions": {
            "z_mot": "MOT d-prime standardized within ball-count",
            "z_drt": "mean of standardized DRT hit rate and negative standardized log RT within ball-count",
            "G_lite": "(z_mot + z_drt) / 2",
            "pi_MOT_lite": "z_mot - z_drt",
        },
        "separate_load_models": "Each of 1-5 balls has a separate group * stage, subject-cluster-robust model.",
    }
    (out / "README.md").write_text(
        "# Fast resource proxy model\n\n"
        "`G_lite` and `pi_MOT_lite` are transparent behavioural composites, not PMwG latent variables. "
        "The model uses cluster-robust standard errors by subject and raw p values.\n",
        encoding="utf-8",
    )
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"DONE: {out}")


if __name__ == "__main__":
    main()
