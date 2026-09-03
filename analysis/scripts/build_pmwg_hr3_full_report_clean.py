"""Build a readable UTF-8 Word report from the completed grouped PMwG run."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from docx import Document
from docx.shared import Inches, Pt

GROUPS = {
    "athlete": "运动员",
    "nonathlete_high_hr": "非运动员高心率",
    "nonathlete_low_hr": "非运动员低心率",
}
STAGES = {"rest": "静息", "exercise1": "第一次运动后", "exercise2": "第二次运动后"}
METRICS = {
    "G": "总资源 G",
    "pi": "资源分配比例 pi",
    "mot_dprime_proxy": "MOT 区分能力代理",
    "drt_drift_proxy": "DRT 漂移代理",
}


def fmt(v):
    if pd.isna(v):
        return ""
    if isinstance(v, float):
        return f"{v:.4f}"
    return str(v)


def add_table(doc: Document, frame: pd.DataFrame, max_rows: int = 500) -> None:
    frame = frame.head(max_rows).copy()
    table = doc.add_table(rows=1, cols=len(frame.columns))
    table.style = "Table Grid"
    for cell, col in zip(table.rows[0].cells, frame.columns):
        cell.text = str(col)
    for _, row in frame.iterrows():
        cells = table.add_row().cells
        for cell, value in zip(cells, row):
            cell.text = fmt(value)


def plot_metric(df: pd.DataFrame, metric: str, path: Path) -> None:
    sub = df[df["parameter"] == metric].copy()
    fig, axes = plt.subplots(1, 3, figsize=(15, 5), sharey=False)
    colors = {"athlete": "#2f6db0", "nonathlete_high_hr": "#e58b2a", "nonathlete_low_hr": "#3b8f63"}
    for ax, (stage, stage_label) in zip(axes, STAGES.items()):
        for group, label in GROUPS.items():
            q = sub[(sub["stage"] == stage) & (sub["group"] == group)].sort_values("target_count")
            if q.empty:
                continue
            y = q["mean"].to_numpy()
            lo = q["q025"].to_numpy()
            hi = q["q975"].to_numpy()
            err = [y - lo, hi - y]
            ax.errorbar(q["target_count"], y, yerr=err, marker="o", capsize=4,
                        label=label, color=colors[group], linewidth=1.8)
        ax.set_title(stage_label)
        ax.set_xlabel("小球数量")
        ax.set_xticks([1, 2, 3, 4, 5])
        ax.grid(alpha=.25)
    axes[0].set_ylabel(METRICS[metric])
    axes[-1].legend(fontsize=8, loc="best")
    fig.suptitle(f"{METRICS[metric]}：三组 × 阶段 × 小球数量\n误差线为95%后验区间")
    fig.tight_layout()
    fig.savefig(path, dpi=220, bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    out = Path(args.out)
    table_dir = out / "表格"
    fig_dir = out / "图表"
    table_dir.mkdir(parents=True, exist_ok=True)
    fig_dir.mkdir(parents=True, exist_ok=True)

    audit = pd.read_csv(out / "PMwG_run_audit.csv", encoding="utf-8-sig")
    summary = pd.read_csv(out / "PMwG_three_group_stage_ball_parameter_summary.csv", encoding="utf-8-sig")
    pair = pd.read_csv(out / "PMwG_three_group_stage_ball_pairwise_posterior_contrasts.csv", encoding="utf-8-sig")
    pop_path = out / "population_posterior_parameters.csv"
    pop = pd.read_csv(pop_path, encoding="utf-8-sig") if pop_path.exists() else pd.DataFrame()

    summary["组别"] = summary["group"].map(GROUPS).fillna(summary["group"])
    summary["阶段"] = summary["stage"].map(STAGES).fillna(summary["stage"])
    pair["组别A"] = pair["group_a"].map(GROUPS).fillna(pair["group_a"])
    pair["组别B"] = pair["group_b"].map(GROUPS).fillna(pair["group_b"])
    pair["阶段"] = pair["stage"].map(STAGES).fillna(pair["stage"])

    summary.to_csv(table_dir / "三组_阶段_1到5球_资源池后验完整表.csv", index=False, encoding="utf-8-sig")
    pair.to_csv(table_dir / "三组_阶段_1到5球_两两后验对比完整表.csv", index=False, encoding="utf-8-sig")
    audit.to_csv(table_dir / "PMwG运行审计.csv", index=False, encoding="utf-8-sig")
    if not pop.empty:
        pop.to_csv(table_dir / "群体参数后验完整表.csv", index=False, encoding="utf-8-sig")

    figures = []
    for metric, label in METRICS.items():
        p = fig_dir / f"{label}_三组阶段小球趋势.png"
        plot_metric(summary, metric, p)
        figures.append(p)

    doc = Document()
    doc.styles["Normal"].font.name = "Microsoft YaHei"
    doc.styles["Normal"].font.size = Pt(10)
    doc.add_heading("足球实验 MOT/DRT 三组联合资源池 PMwG 完整建模报告", 0)
    doc.add_paragraph("本报告基于完整三阶段、五种小球负荷和三组联合似然模型生成。三组为：运动员、非运动员高心率、非运动员低心率。模型结果保留原始后验均值、95%后验区间和组间后验概率，不按显著性筛选球数。")
    doc.add_heading("一、样本与运行审计", level=1)
    add_table(doc, audit)
    doc.add_paragraph("本次正式模型输入审计必须以此表为准。当前正确输入为65人：运动员20人、非运动员高心率23人、非运动员低心率22人；三阶段均包含MOT与DRT，MOT共975行，DRT共7800行。")
    doc.add_heading("二、联合模型与计算方式", level=1)
    formulas = [
        "MOT命中：目标选中数 ~ Binomial(目标总数, Φ((1-c)×d′))。",
        "MOT误选：误选数 ~ Binomial(非目标总数, Φ(-c×d′))。",
        "资源池：MOT区分能力代理 d′ = k_ball × (1-π_stage,ball,group) × G_stage,group。",
        "资源分配比例 π_stage,ball,group 表示该阶段和负荷下分配给MOT主任务的资源比例。",
        "DRT漂移代理 = π_stage,ball,group × G_stage,group；有效RT使用单边界Wald密度。",
        "DRT未命中、超时和go-failure通过Wald生存概率与go-failure概率的联合删失似然处理。",
        "模型包含三阶段效应、五种小球负荷、三组效应、被试随机效应、先验协方差和PMwG粒子采样。",
    ]
    for item in formulas:
        doc.add_paragraph(item, style="List Bullet")
    doc.add_paragraph("说明：PMwG后验概率P(组别A参数>组别B参数)不是传统p值；95%后验区间跨越0表示组间方向证据不稳定。")

    doc.add_heading("三、三组 × 三阶段 × 1到5球资源池结果", level=1)
    for metric, label in METRICS.items():
        doc.add_heading(label, level=2)
        sub = summary[summary["parameter"] == metric].copy()
        cols = ["阶段", "target_count", "组别", "n", "mean", "q025", "q975", "sd"]
        cols = [c for c in cols if c in sub.columns]
        add_table(doc, sub[cols].sort_values(["阶段", "target_count", "组别"]))
        doc.add_picture(str(fig_dir / f"{label}_三组阶段小球趋势.png"), width=Inches(6.7))
        doc.add_paragraph(f"图：{label}在静息、第一次运动后和第二次运动后的1到5球完整趋势；每条线对应一个群体，误差线为95%后验区间。")

    doc.add_heading("四、三组两两后验比较", level=1)
    cols = ["阶段", "target_count", "组别A", "组别B", "parameter", "mean", "q025", "q975", "posterior_probability_a_gt_b"]
    cols = [c for c in cols if c in pair.columns]
    add_table(doc, pair[cols].sort_values(["阶段", "target_count", "parameter", "组别A", "组别B"]))
    doc.add_paragraph("表中mean为组别A减组别B的后验差；q025/q975为95%后验区间；posterior_probability_a_gt_b为A>B的后验概率。所有1到5球均保留。")

    doc.add_heading("五、解释边界", level=1)
    for item in [
        "模型中的G、π、MOT区分能力代理和DRT漂移代理是联合似然中的参数化资源指标，应结合MOT与DRT观测指标解释。",
        "若后验区间不跨0且后验概率接近1或0，说明组间方向证据较稳定；若区间跨0，则只能报告为不确定或探索性方向。",
        "本报告不把旧的未分组PMwG结果混入当前三组结论。",
    ]:
        doc.add_paragraph(item, style="List Bullet")

    manifest = {
        "groups": list(GROUPS.values()),
        "stages": list(STAGES.values()),
        "balls": [1, 2, 3, 4, 5],
        "tables": [str(p.relative_to(out)) for p in table_dir.glob("*.csv")],
        "figures": [str(p.relative_to(out)) for p in fig_dir.glob("*.png")],
    }
    (out / "报告清单.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    report = out / "足球实验_MOT_DRT_三组联合资源池PMwG完整建模报告.docx"
    doc.save(report)
    print(report)


if __name__ == "__main__":
    main()
