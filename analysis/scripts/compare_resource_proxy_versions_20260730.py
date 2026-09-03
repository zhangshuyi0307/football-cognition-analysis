#!/usr/bin/env python3
"""Compare old stage*load three-group Kruskal tests with current HR3 data."""
from pathlib import Path
import numpy as np
import pandas as pd
from scipy import stats

BASE = Path(r"F:\足球实验数据\分析输出")
CURRENT = BASE / "MOT_DRT_resource_lite_HR3_20260730" / "resource_lite_subject_stage_load.csv"
OLD = BASE / "MOT_DRT_心率三组整合报告_v3_MOT贝叶斯_完整1到5球_20260714" / "表格" / "资源池代理_阶段1到5球_Kruskal总体检验.csv"
OUT = BASE / "MOT_DRT资源代理旧新口径对照_20260730"

def read(path):
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError:
            pass
    return pd.read_csv(path)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    current = read(CURRENT)
    rows = []
    metrics = [("mot_dprime", "MOT d′"), ("drt_hit_rate", "DRT hit rate"),
               ("drt_logrt", "DRT logRT"), ("G_lite", "G_lite"),
               ("pi_MOT_lite", "pi_MOT_lite")]
    for stage in ["rest", "exercise1", "exercise2"]:
        for load in range(1, 6):
            sub = current[(current.stage == stage) & (current.target_count == load)]
            for metric, label in metrics:
                vals = [sub.loc[sub.group == group, metric].dropna() for group in ["athlete", "nonathlete_high_hr", "nonathlete_low_hr"]]
                usable = [v for v in vals if len(v) >= 2]
                p = float(stats.kruskal(*usable).pvalue) if len(usable) >= 2 else np.nan
                rows.append({"version": "current", "stage": stage, "target_count": load,
                             "metric": metric, "metric_label": label, "test": "Kruskal-Wallis three groups",
                             "raw_p": p, "n_athlete": len(vals[0]), "n_high_hr": len(vals[1]), "n_low_hr": len(vals[2])})
    current_out = pd.DataFrame(rows)
    current_out.to_csv(OUT / "current_HR3_stage_load_Kruskal_all_metrics.csv", index=False, encoding="utf-8-sig")
    old = read(OLD)
    old = old.rename(columns={"stage": "old_stage", "阶段": "old_stage_label", "球数": "target_count",
                              "metric": "old_metric", "指标": "old_metric_label", "Kruskal_p": "old_raw_p"})
    old.to_csv(OUT / "old_resource_proxy_stage_load_Kruskal.csv", index=False, encoding="utf-8-sig")
    # A compact list makes the previously significant rows explicit.
    old_sig = old[pd.to_numeric(old["old_raw_p"], errors="coerce") < .05].copy()
    old_sig[[c for c in ["old_stage", "old_stage_label", "target_count", "old_metric", "old_metric_label", "old_raw_p", "判断"] if c in old_sig]].to_csv(OUT / "old_significant_rows_raw_p_lt_05.csv", index=False, encoding="utf-8-sig")
    current_sig = current_out[current_out.raw_p < .05].sort_values("raw_p")
    current_sig.to_csv(OUT / "current_significant_rows_raw_p_lt_05.csv", index=False, encoding="utf-8-sig")
    (OUT / "README.md").write_text(
        "# 资源代理旧新口径对照\n\n"
        "旧版与当前版均按阶段×球数进行三组 Kruskal-Wallis，和逐球 group×stage 联合 Wald 是不同检验。\n"
        "旧版只使用 G_proxy full/miss-only；当前版同时列出 MOT d′、DRT hit rate、DRT logRT、G_lite、pi_MOT_lite。\n",
        encoding="utf-8")
    print(f"DONE: {OUT}")

if __name__ == "__main__":
    main()
