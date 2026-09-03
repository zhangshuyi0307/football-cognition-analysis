from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DengXian", "Arial Unicode MS"]
plt.rcParams["axes.unicode_minus"] = False
import numpy as np
import pandas as pd
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt


F_ROOT = Path(r"F:\足球实验数据")
ANALYSIS = F_ROOT / "分析输出"
OUT = ANALYSIS / "H1_H58_六范式_生理_简易资源代理_完整总报告_20260730"
FIG_OUT = OUT / "figures"
TAB_OUT = OUT / "tables"


HYPOTHESES = [
    (1, "经典 Flanker 冲突存在"),
    (2, "经典 Flanker 冲突存在组别差异"),
    (3, "一致条件下存在黄色侧翼捕获效应"),
    (4, "黄色侧翼捕获效应存在组别差异"),
    (5, "Flanker 指标具有阶段或条件稳定性"),
    (6, "Flanker 表现与心率恢复值相关"),
    (7, "基线 SART d' 存在组别差异"),
    (8, "第二次运动后 SART d' 存在组别差异"),
    (9, "SART d' 存在组别乘阶段交互"),
    (10, "SART criterion 存在组别差异"),
    (11, "第二次运动后 SART criterion 发生变化"),
    (12, "SART 反应时存在组别差异"),
    (13, "第二次运动后 SART 反应时发生变化"),
    (14, "黄色捕获条件产生反应促进或干扰"),
    (15, "黄色刺激位置影响 SART 表现"),
    (16, "心率恢复值与 SART 变化相关"),
    (17, "Corsi 最大正确 span 存在组别差异"),
    (18, "Corsi 表现与心率恢复值相关"),
    (19, "运动员与非运动员足球选择向量不同"),
    (20, "运动员足球选择在前后测更稳定"),
    (21, "非运动员足球选择在前后测发生变化"),
    (22, "足球选择变化存在组别乘运动阶段交互"),
    (23, "心率恢复值与足球选择稳定性相关"),
    (24, "BELT 行为指标之间存在关联"),
    (25, "BELT 行为与兴趣或偏好一致性相关"),
    (26, "BELT 行为与坚毅或韧性相关"),
    (27, "BELT 主要行为不等同于运动员身份差异"),
    (28, "BELT 行为与心率分层存在关系"),
    (29, "MOT d' 存在组别差异"),
    (30, "DRT RT 存在组别差异"),
    (31, "DRT hit rate 存在组别差异"),
    (32, "MOT/DRT 表现随小球数量变化"),
    (33, "资源代理 G 存在组别差异"),
    (34, "第一次运动后资源代理 G 发生变化"),
    (35, "运动员三阶段资源变化不同"),
    (36, "非运动员三阶段资源变化不同"),
    (37, "两类非运动员的阶段变化不同"),
    (38, "资源代理存在组别乘阶段交互"),
    (39, "MOT/DRT 资源分配比例具有稳定性"),
    (40, "运动员与非运动员心率恢复不同"),
    (41, "第一次与第二次运动后的恢复不同"),
    (42, "HRV 恢复模式存在组别差异"),
    (43, "皮肤电恢复模式存在组别差异"),
    (44, "HRR 与认知变化相关"),
    (45, "运动员身份调节 HRR 与认知变化的关系"),
    (46, "控制运动量后生理指标仍解释认知变化"),
    (47, "HRR 预测资源代理 G"),
    (48, "HRR 与 MOT/DRT 分配比例相关"),
    (49, "运动员具有认知控制优势"),
    (50, "运动员具有持续注意优势"),
    (51, "运动员足球决策更稳定"),
    (52, "Corsi 组别差异较小或不存在"),
    (53, "BELT 行为可由问卷特质解释"),
    (54, "运动员具有动态资源利用优势"),
    (55, "重复运动后的组别差异存在"),
    (56, "运动员具有更好的生理恢复表现"),
    (57, "HRR 与运动后认知收益相关"),
    (58, "运动员具有更高的认知—生理效率"),
]

H_DETAILS = {
    1: "经典冲突对应的 IS-CS 结果单独核对；当前有效表中未见该对比达到原始 p<.05。",
    2: "经典冲突的三组差异没有形成稳定的总体组间证据，不能据此确认组别调节。",
    3: "一致条件下的黄色侧翼捕获需看 CF-CS；当前有效结果未达到原始显著标准。",
    4: "黄色捕获相关结果中，CF-CT 的 Correct RT CoV 三组总体比较显著，Kruskal p=.044。",
    5: "Flanker 的稳定性假设未被单独的重复测量稳定性检验充分支持，保留为未确认结果。",
    6: "当前 Flanker 表格未提供 HRR 的独立回归项，因此该假设标记为需要补充生理模型。",
    7: "基线 SART d' 的三组总体检验未显示稳定显著差异。",
    8: "第二次运动后 SART d' 的三组比较保留在完整表中，但当前未达到稳定显著标准。",
    9: "SART d' 的组别乘阶段效应未被当前阶段表确证。",
    10: "SART criterion 的组间差异没有形成稳定总体显著证据。",
    11: "第二次运动后 criterion 的变化已列入阶段结果表，当前不能确认组间变化差异。",
    12: "SART 反应时均值的组间差异不稳定；Correct Go RT CoV 需要单独解释。",
    13: "后测普通条件 Correct Go RT CoV 三组总体差异显著，Kruskal p=.0419。",
    14: "黄色捕获条件的促进或干扰效应保留了捕获代价表，未达到稳定总体显著。",
    15: "SART 黄色刺激位置变量已纳入表格，当前未形成明确的组间显著结果。",
    16: "当前 HRR 与 SART 变化的独立回归未达到稳定显著，方向和缺失情况保留在生理表中。",
    17: "Corsi 最大正确 span 的三组总体差异显著，原始 Kruskal p=.00515。",
    18: "Corsi 与 HRR 的关联未形成稳定显著证据，相关结果已保留。",
    19: "足球决策按每题 A/B/C/D 选择向量比较，部分题目的置换检验达到显著。",
    20: "运动员前后测选择向量稳定性已按题目列出，不能用单一总体 p 替代。",
    21: "非运动员前后测选择变化按题目列出，部分题目变化显著，完整结果见逐题表。",
    22: "组别乘运动阶段的足球选择变化需要结合逐题向量结果解释，当前没有一个统一总 p。",
    23: "足球选择稳定性与 HRR 的直接关系未在当前独立表中确认。",
    24: "BELT 行为指标之间及其分布保留，但本版 BELT 图仅保留问卷相关热点图。",
    25: "BELT 与问卷的兴趣/偏好相关关系在热点图中按原始 p 展示。",
    26: "BELT 与坚毅或韧性相关关系保留在 Spearman 相关表及热点图中。",
    27: "BELT 不再把运动员身份当作唯一解释，报告按行为—问卷关系定位。",
    28: "BELT 与 HR 分层的关系已保留在三组结果表中，但不把分层本身当作因果效应。",
    29: "MOT d' 按静息、第一次运动后、第二次运动后及 1–5 球分别比较；4/5 球显著结果完整保留。",
    30: "DRT logRT 按每个阶段和球数比较，所有 1–5 球结果均列出，显著项另列补充假设。",
    31: "DRT hit rate 同样按每个阶段和球数比较，4/5 球的有效差异及不显著结果均保留。",
    32: "小球数量效应按阶段拆开检验，不使用跨阶段总体差异替代。",
    33: "简易资源代理 G_lite 在阶段×球数层面检验，显著和不显著单元格均保留。",
    34: "第一次运动后 G_lite 的变化按球数报告，不能只看 pooled load。",
    35: "运动员的三阶段资源变化以每球数趋势图展示，当前结论以阶段×球数检验为准。",
    36: "非运动员的三阶段资源变化同样按 1–5 球逐格报告。",
    37: "两类非运动员的阶段差异保留高心率与低心率两两比较表。",
    38: "组别乘阶段资源交互保留在代理模型表中，不能直接称作 PMwG 后验交互。",
    39: "pi_MOT_lite 作为 MOT 相对优先代理，按阶段×球数输出，解释保持探索性。",
    40: "运动员与非运动员 HRR 的比较来自运动结束到运动后 1 分钟的心跳计数恢复。",
    41: "第一次与第二次运动后的 HRR 分别列出，第二次运动不能用第一次均值替代。",
    42: "HRV 使用 beat-to-beat 指标解释，RMSSD/SDNN 与心率均值严格区分。",
    43: "皮肤电恢复作为生理补充结果，当前不把缺失或打点问题反向删除行为被试。",
    44: "HRR 与认知变化的连续关系保留回归表，结果不以三组分层差异替代。",
    45: "运动员身份调节 HRR—认知关系的模型结果需结合交互项 p 值解释，当前不夸大机制。",
    46: "控制运动量后的生理—认知模型作为补充分析，ACC/GYRO 只作运动量控制和验证。",
    47: "HRR 对资源代理 G 的关系使用简易二阶段代理结果，尚非完整联合 PMwG。",
    48: "HRR 与 pi_MOT_lite 的关系列入资源分配补充分析，保持代理指标措辞。",
    49: "跨范式整合不再留空：使用 MOT/DRT、SART、Flanker 和生理模块的原始表作为证据来源。",
    50: "持续注意优势以 SART d'、commission、omission 和 RT CoV 的模块结果共同判断。",
    51: "足球决策稳定性以逐题选择向量和置换 p 作为证据，不预设正确答案。",
    52: "Corsi 的最大 span、准确率、反应时和相关分析均保留，不能只报告一个指标。",
    53: "BELT 的特质解释仅保留问卷热点图及相关表，不把显著相关写成因果。",
    54: "动态资源优势结合 MOT/DRT 的 G_lite 与 pi_MOT_lite 结果解释。",
    55: "重复运动后的组别差异使用 exercise1 与 exercise2 的阶段×球数结果。",
    56: "生理恢复优势同时查看 HRR、HR 峰谷差、HRV 和皮肤电，不能只看一个均值。",
    57: "HRR 与运动后认知收益的关系按连续变化量报告，保留不显著结果。",
    58: "认知—生理效率作为综合解释层，不能替代 MOT/DRT 和生理的独立结果。",
}


MODULES = {
    "Flanker": (1, 6),
    "SART": (7, 16),
    "Corsi": (17, 18),
    "足球决策": (19, 23),
    "BELT+问卷": (24, 28),
    "MOT/DRT简易资源代理": (29, 39),
    "生理 HR/HRR/HRV/GSR": (40, 48),
    "跨范式整合": (49, 58),
}


def module_for(n: int) -> str:
    for name, (lo, hi) in MODULES.items():
        if lo <= n <= hi:
            return name
    return "跨范式整合"


def read_csv(path: Path):
    try:
        return pd.read_csv(path, encoding="utf-8-sig", low_memory=False)
    except Exception:
        try:
            return pd.read_csv(path, encoding="gb18030", low_memory=False)
        except Exception:
            return None


def find_dirs(*terms):
    result = []
    for p in ANALYSIS.iterdir():
        if p.is_dir() and all(t.lower() in p.name.lower() for t in terms):
            result.append(p)
    return result


def source_roots():
    roots = {}
    combined = find_dirs("Flanker_SART", "完整指标")
    combined = combined[0] if combined else None
    def nested(root, *terms):
        if root is None:
            return None
        candidates = [p for p in root.rglob("*") if p.is_dir() and all(t.lower() in p.name.lower() for t in terms)]
        return sorted(candidates, key=lambda p: len(str(p)))[0] if candidates else root
    roots["Flanker"] = nested(combined, "Flanker完整指标")
    roots["SART"] = nested(combined, "SART完整指标")
    roots["足球决策"] = nested(combined, "足球决策")
    belt = find_dirs("各范式重建报告", "BELT")
    roots["BELT+问卷"] = belt[0] if belt else (find_dirs("BELT问卷运动员关联") or [None])[0]
    corsi = find_dirs("Corsi反向空间工作记忆")
    roots["Corsi"] = corsi[0] if corsi else None
    mot = find_dirs("MOT_DRT_simple_proxy_HR3_66_stage_load")
    roots["MOT/DRT简易资源代理"] = mot[0] if mot else None
    phys = find_dirs("HRR_心跳计数")
    roots["生理 HR/HRR/HRV/GSR"] = phys[0] if phys else None
    # The latest HRR folder may be absent in older runs; use all matching physiology folders as fallback.
    if roots["生理 HR/HRR/HRV/GSR"] is None:
        phys2 = find_dirs("生理机制加强分析")
        roots["生理 HR/HRR/HRV/GSR"] = phys2[0] if phys2 else None
    return roots


def csv_files(root):
    return sorted(root.rglob("*.csv")) if root and root.exists() else []


def png_files(root):
    return sorted(root.rglob("*.png")) if root and root.exists() else []


def p_summary(root):
    frames = []
    for path in csv_files(root):
        df = read_csv(path)
        if df is None or df.empty:
            continue
        pcols = [c for c in df.columns if str(c).lower().strip() in {"p", "p_value", "pvalue", "raw_p", "mw_p", "kw_p", "welch_p", "perm_p"} or str(c).lower().endswith("_p") or str(c).lower().endswith("p")]
        for col in pcols:
            vals = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(vals):
                frames.append(vals)
    if not frames:
        return {"n_tests": 0, "n_p_lt_05": 0, "min_raw_p": "NA", "p_summary": "未找到结构化 p 值表；需查看模块原始表格。"}
    vals = pd.concat(frames, ignore_index=True)
    return {
        "n_tests": int(len(vals)),
        "n_p_lt_05": int((vals < .05).sum()),
        "min_raw_p": f"{vals.min():.6g}",
        "p_summary": f"模块扫描到 {len(vals)} 个原始 p 值；p<.05 有 {(vals < .05).sum()} 个；最小原始 p={vals.min():.6g}。该值是模块摘要，不冒充每条假设的独立检验。",
    }


def figure_caption(module, name):
    return f"{module} 配图：{name}。图中保留原始 p 值或 p 值缺失标记；完整数据表见 tables 文件夹。"


def copy_figures(roots):
    FIG_OUT.mkdir(parents=True, exist_ok=True)
    records = []
    for module, root in roots.items():
        scan_roots = [root]
        if module == "生理 HR/HRR/HRV/GSR":
            scan_roots.extend(find_dirs("生理机制加强分析"))
            scan_roots.extend(find_dirs("生理_运动中"))
            scan_roots.extend(find_dirs("生理_运动后"))
        sources = []
        seen = set()
        for scan_root in scan_roots:
            for src in png_files(scan_root):
                if str(src) not in seen:
                    sources.append(src); seen.add(str(src))
        for i, src in enumerate(sorted(sources), start=1):
            if module == "BELT+问卷" and "热图" not in src.name:
                continue
            safe = re.sub(r"[^0-9A-Za-z._-]+", "_", f"{module}_{i:03d}_{src.name}")
            dst = FIG_OUT / safe
            shutil.copy2(src, dst)
            records.append({"module": module, "source": str(src), "copied": str(dst), "caption": figure_caption(module, src.name)})
    return records


def copy_tables(roots):
    TAB_OUT.mkdir(parents=True, exist_ok=True)
    records = []
    for module, root in roots.items():
        for i, src in enumerate(csv_files(root), start=1):
            safe = re.sub(r"[^0-9A-Za-z._-]+", "_", f"{module}_{i:03d}_{src.name}")
            dst = TAB_OUT / safe
            if not dst.exists():
                shutil.copy2(src, dst)
            records.append({"module": module, "source": str(src), "copied": str(dst)})
    pd.DataFrame(records).to_csv(TAB_OUT / "全量表格索引.csv", index=False, encoding="utf-8-sig")
    return records


def collect_significant_results(roots):
    rows = []
    for module, root in roots.items():
        for src in csv_files(root):
            df = read_csv(src)
            if df is None or df.empty:
                continue
            pcols = [c for c in df.columns if str(c).lower().strip() in {"p", "p_value", "pvalue", "raw_p", "mw_p", "kw_p", "welch_p", "perm_p"} or str(c).lower().endswith("_p")]
            for pcol in pcols:
                vals = pd.to_numeric(df[pcol], errors="coerce")
                for idx, val in vals.items():
                    if pd.isna(val) or val >= .05:
                        continue
                    row = df.loc[idx]
                    text = " | ".join(f"{c}={row[c]}" for c in df.columns if c != pcol and pd.notna(row[c]) and str(row[c]).strip() not in {""})
                    if re.search(r"缺失|missing|NA|NaN", text, flags=re.I):
                        continue
                    rows.append({"模块": module, "来源表": src.name, "指标或效应": text[:1200], "p列": pcol, "原始p": float(val)})
    out = pd.DataFrame(rows).drop_duplicates()
    if not out.empty:
        out = out.sort_values(["模块", "原始p", "来源表"], kind="stable")
    out.to_csv(TAB_OUT / "补充显著结果_作为新增假设_原始p.csv", index=False, encoding="utf-8-sig")
    return out


H_FIG_RULES = {
    1: ("Flanker", ["01_IS-CS"]),
    2: ("Flanker", ["01_IS-CS"]),
    3: ("Flanker", ["07_CF-CS"]),
    4: ("Flanker", ["07_CF-CS"]),
    7: ("SART", ["condition_dprime"]),
    8: ("SART", ["condition_dprime"]),
    10: ("SART", ["condition_criterion"]),
    11: ("SART", ["condition_criterion"]),
    12: ("SART", ["condition_go_rt_mean_ms"]),
    13: ("SART", ["condition_go_rt_cv"]),
    14: ("SART", ["capture_cost_dprime"]),
    17: ("Corsi", ["Corsi_足球经验三组比较"]),
    19: ("足球决策", ["Q01_"]),
    24: ("BELT+问卷", ["热图"]),
    25: ("BELT+问卷", ["热图"]),
    26: ("BELT+问卷", ["热图"]),
    27: ("BELT+问卷", ["热图"]),
    28: ("BELT+问卷", ["热图"]),
    29: ("MOT/DRT简易资源代理", ["exercise2_load4_mot_dprime"]),
    30: ("MOT/DRT简易资源代理", ["exercise2_load4_drt_logrt"]),
    31: ("MOT/DRT简易资源代理", ["exercise2_load4_drt_hit_rate"]),
    32: ("MOT/DRT简易资源代理", ["exercise2_load4_mot_dprime"]),
    33: ("MOT/DRT简易资源代理", ["exercise2_load4_G_lite"]),
    34: ("MOT/DRT简易资源代理", ["exercise1_load4_G_lite"]),
    35: ("MOT/DRT简易资源代理", ["exercise2_load4_G_lite"]),
    36: ("MOT/DRT简易资源代理", ["exercise1_load4_G_lite"]),
    37: ("MOT/DRT简易资源代理", ["exercise2_load4_pi_MOT_lite"]),
    38: ("MOT/DRT简易资源代理", ["exercise2_load4_G_lite"]),
    39: ("MOT/DRT简易资源代理", ["exercise2_load4_pi_MOT_lite"]),
    40: ("生理 HR/HRR/HRV/GSR", ["HRR_三组"]),
    41: ("生理 HR/HRR/HRV/GSR", ["恢复曲线"]),
    42: ("生理 HR/HRR/HRV/GSR", ["RMSSD"]),
    44: ("生理 HR/HRR/HRV/GSR", ["生理成本_DRT命中变化"]),
    45: ("生理 HR/HRR/HRV/GSR", ["interaction_physio_cost"]),
    46: ("生理 HR/HRR/HRV/GSR", ["剂量反应_GYRO_DRT"]),
    47: ("生理 HR/HRR/HRV/GSR", ["生理成本_DRT命中变化"]),
    49: ("MOT/DRT简易资源代理", ["exercise2_load4_mot_dprime"]),
    50: ("SART", ["condition_dprime"]),
    51: ("足球决策", ["Q01_"]),
    52: ("Corsi", ["Corsi_足球经验三组比较"]),
    53: ("BELT+问卷", ["热图"]),
    54: ("MOT/DRT简易资源代理", ["exercise2_load4_G_lite"]),
    55: ("MOT/DRT简易资源代理", ["exercise2_load4_G_lite"]),
    56: ("生理 HR/HRR/HRV/GSR", ["HRR_三组"]),
    57: ("生理 HR/HRR/HRV/GSR", ["interaction_physio_cost"]),
    58: ("生理 HR/HRR/HRV/GSR", ["生理成本_DRT命中变化"]),
}


H_FIG_RULES[17] = ("Corsi", ["Corsi"])
H_FIG_RULES[52] = ("Corsi", ["Corsi"])
H_FIG_RULES[17] = ("Corsi", ["图2_Corsi足球经验三组比较"])
H_FIG_RULES[52] = ("Corsi", ["图2_Corsi足球经验三组比较"])
H_FIG_RULES[5] = ("Flanker", ["H05_hypothesis_evidence"])
H_FIG_RULES[6] = ("Flanker", ["H06_hypothesis_evidence"])
H_FIG_RULES[9] = ("SART", ["H09_hypothesis_evidence"])
H_FIG_RULES[15] = ("SART", ["H15_hypothesis_evidence"])
H_FIG_RULES[16] = ("SART", ["H16_hypothesis_evidence"])
H_FIG_RULES[18] = ("Corsi", ["H18_hypothesis_evidence"])
H_FIG_RULES[20] = ("足球决策", ["H20_hypothesis_evidence"])
H_FIG_RULES[21] = ("足球决策", ["H21_hypothesis_evidence"])
H_FIG_RULES[22] = ("足球决策", ["H22_hypothesis_evidence"])
H_FIG_RULES[23] = ("足球决策", ["H23_hypothesis_evidence"])
H_FIG_RULES[43] = ("生理 HR/HRR/HRV/GSR", ["H43_hypothesis_evidence"])
H_FIG_RULES[48] = ("生理 HR/HRR/HRV/GSR", ["H48_hypothesis_evidence"])
H_FIG_RULES[49] = ("跨范式整合", ["H49_hypothesis_evidence"])


def _find_csv(root, *terms):
    if root is None or not root.exists():
        return None
    matches = [p for p in root.rglob("*.csv") if all(t.lower() in p.name.lower() for t in terms)]
    return sorted(matches, key=lambda p: (len(p.name), str(p)))[0] if matches else None


def _read_any_csv(path):
    if path is None:
        return None
    return read_csv(path)


def _save_hypothesis_figure(path, title, subtitle, p_text, draw=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(9.0, 4.8), dpi=180)
    ax.set_facecolor("#fbfcfe")
    fig.patch.set_facecolor("white")
    if draw is None:
        ax.axis("off")
        ax.text(0.5, 0.58, "当前没有该假设的独立统计模型输出", ha="center", va="center", fontsize=18, color="#183b63")
        ax.text(0.5, 0.40, "图中保留数据审计结论，不把其他指标的 p 值冒充本假设检验", ha="center", va="center", fontsize=11, color="#555555")
    else:
        draw(ax)
    ax.set_title(title, fontsize=15, pad=16, color="#183b63", weight="bold")
    fig.text(0.02, 0.03, f"{subtitle}    |    本假设原始 p：{p_text}", fontsize=9.5, color="#444444")
    fig.tight_layout(rect=[0.02, 0.08, 0.98, 0.94])
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return path


def make_hypothesis_specific_figures(roots):
    """Create one honest, hypothesis-specific figure for every previously-NA hypothesis."""
    out = FIG_OUT / "hypothesis_specific"
    out.mkdir(parents=True, exist_ok=True)
    records = []

    def add(n, module, title, subtitle, p_text="NA", draw=None):
        path = _save_hypothesis_figure(out / f"H{n:02d}_hypothesis_evidence.png", title, subtitle, p_text, draw)
        records.append({"module": module, "source": str(path), "copied": str(path)})

    # H5: use all 17 observed Flanker contrasts as a condition-stability audit.
    fpath = _find_csv(roots.get("Flanker"), "17个对比", "Kruskal")
    fdf = _read_any_csv(fpath)
    def draw_h5(ax):
        if fdf is None or fdf.empty:
            return
        pcol = next((c for c in fdf.columns if str(c).lower() == "p"), None)
        label = next((c for c in fdf.columns if "对比" in str(c) or "contrast" in str(c).lower()), fdf.columns[0])
        vals = pd.to_numeric(fdf[pcol], errors="coerce") if pcol else pd.Series(dtype=float)
        labels = fdf[label].astype(str).str.extract(r"([A-Z]{2}-[A-Z]{2})", expand=False).fillna(fdf[label].astype(str)).tolist() if label in fdf else [str(i + 1) for i in range(len(fdf))]
        temp = pd.DataFrame({"label": labels, "p": vals}).dropna()
        temp["contrast"] = temp["label"].str.replace(r".*?([A-Z]{2}-[A-Z]{2}).*", r"\1", regex=True)
        temp["neglogp"] = -np.log10(temp["p"].clip(lower=1e-12))
        agg = temp.groupby("contrast", sort=True)["neglogp"].mean().sort_values()
        ax.barh(np.arange(len(agg)), agg.values, color="#4f81bd")
        ax.set_yticks(np.arange(len(agg))); ax.set_yticklabels(agg.index, fontsize=8)
        ax.set_xlabel("-log10(原始 p)"); ax.axvline(-np.log10(.05), color="#c0392b", ls="--", lw=1, label="p=.05")
        ax.legend(loc="lower right", fontsize=8)
    add(5, "Flanker", "H5 Flanker 条件结果稳定性审计", "17 个条件/对比的原始 p 分布；当前没有独立重复测量稳定性检验", "NA", draw_h5 if fdf is not None else None)

    # H6/H16/H18/H23: explicit availability figures, not fabricated associations.
    def draw_availability(ax, labels, values):
        ax.bar(np.arange(len(labels)), values, color=["#4f81bd", "#e67e22", "#95a5a6"][:len(labels)])
        ax.set_xticks(np.arange(len(labels))); ax.set_xticklabels(labels, rotation=15, ha="right", fontsize=9)
        ax.set_ylabel("可用记录数"); ax.set_ylim(0, max(values + [1]) * 1.25)
        for i, v in enumerate(values): ax.text(i, v, str(v), ha="center", va="bottom", fontsize=10)
    add(6, "Flanker", "H6 Flanker—HRR 关联数据审计", "Flanker 与 HRR 的直接联合回归尚未在当前输出中形成", "NA", lambda ax: draw_availability(ax, ["Flanker", "HRR", "联合模型"], [int(p_summary(roots.get("Flanker"))["n_tests"]), 0, 0]))
    add(16, "SART", "H16 SART—HRR 关联数据审计", "SART 与 HRR 的直接联合回归尚未在当前输出中形成", "NA", lambda ax: draw_availability(ax, ["SART", "HRR", "联合模型"], [int(p_summary(roots.get("SART"))["n_tests"]), 0, 0]))
    add(18, "Corsi", "H18 Corsi—HRR 关联数据审计", "Corsi 与 HRR 的直接联合回归尚未在当前输出中形成", "NA", lambda ax: draw_availability(ax, ["Corsi", "HRR", "联合模型"], [int(p_summary(roots.get("Corsi"))["n_tests"]), 0, 0]))
    add(23, "足球决策", "H23 足球选择稳定性—HRR 关联数据审计", "足球选择稳定性与 HRR 的直接联合模型尚未形成", "NA", lambda ax: draw_availability(ax, ["足球选择", "HRR", "联合模型"], [int(p_summary(roots.get("足球决策"))["n_tests"]), 0, 0]))

    # H9: a dedicated SART stage-by-capture p-value heatmap for the interaction question.
    spath = _find_csv(roots.get("SART"), "阶段x捕获条件", "Kruskal")
    sdf = _read_any_csv(spath)
    def draw_h9(ax):
        if sdf is None or sdf.empty:
            return
        d = sdf[sdf.astype(str).apply(lambda row: row.str.contains("dprime", case=False).any(), axis=1)].copy()
        if d.empty: d = sdf.copy()
        phase_col = "phase" if "phase" in d else d.columns[0]
        cap_col = "capture" if "capture" in d else d.columns[1]
        pcol = "p" if "p" in d else d.columns[-2]
        piv = d.pivot_table(index=phase_col, columns=cap_col, values=pcol, aggfunc="first")
        im = ax.imshow(-np.log10(piv.astype(float).clip(lower=1e-12)), cmap="Blues", aspect="auto")
        ax.set_xticks(range(len(piv.columns))); ax.set_xticklabels(piv.columns, rotation=30, ha="right")
        ax.set_yticks(range(len(piv.index))); ax.set_yticklabels(piv.index)
        for i in range(len(piv.index)):
            for j in range(len(piv.columns)):
                v = piv.iloc[i, j]
                if pd.notna(v): ax.text(j, i, f"p={v:.3f}", ha="center", va="center", fontsize=7)
        fig = ax.get_figure(); fig.colorbar(im, ax=ax, label="-log10(p)")
    add(9, "SART", "H9 SART d′ 阶段×组别交互证据图", "按阶段×捕获条件展示 d′ 相关总体检验的原始 p；不把单元格 p 当作交互 p", "NA", draw_h9 if sdf is not None else None)
    add(15, "SART", "H15 SART 黄色刺激位置效应审计", "位置变量当前未形成独立总体检验；保留为待补充位置模型", "NA")

    # Soccer H20-H22: use all 22 question-level choice-distribution p values.
    qpath = _find_csv(roots.get("足球决策"), "三组整体选择分布")
    qdf = _read_any_csv(qpath)
    def draw_soccer(ax, mode):
        if qdf is None or qdf.empty:
            return
        pcol = next((c for c in qdf.columns if "p" in str(c).lower()), None)
        qcol = next((c for c in qdf.columns if "题" in str(c) or "question" in str(c).lower()), qdf.columns[0])
        vals = pd.to_numeric(qdf[pcol], errors="coerce") if pcol else pd.Series(dtype=float)
        vals = vals.fillna(np.nan)
        x = np.arange(len(vals))
        ax.bar(x, -np.log10(vals.clip(lower=1e-12)), color="#4f81bd")
        ax.axhline(-np.log10(.05), color="#c0392b", ls="--", lw=1, label="p=.05")
        ax.set_xlabel("题目编号"); ax.set_ylabel("-log10(原始 p)"); ax.set_xticks(x); ax.set_xticklabels([str(v) for v in qdf[qcol]], rotation=90, fontsize=7)
        ax.legend(fontsize=8)
    add(20, "足球决策", "H20 运动员前后测选择稳定性逐题审计", "22 题选择分布检验的原始 p；稳定性需按题目解释", "NA", lambda ax: draw_soccer(ax, "athlete") if qdf is not None else None)
    add(21, "足球决策", "H21 非运动员前后测选择变化逐题审计", "22 题选择分布检验的原始 p；变化需按题目解释", "NA", lambda ax: draw_soccer(ax, "nonathlete") if qdf is not None else None)
    add(22, "足球决策", "H22 足球选择组别×阶段交互审计", "展示逐题选择分布证据；当前没有统一的组别×阶段总 p", "NA", lambda ax: draw_soccer(ax, "interaction") if qdf is not None else None)

    # H43: search for any GSR/SCL table; otherwise show an explicit no-output audit.
    gpath = next((p for p in csv_files(roots.get("生理 HR/HRR/HRV/GSR")) if any(t in p.name.lower() for t in ["gsr", "scl", "scr"])), None)
    gdf = _read_any_csv(gpath)
    def draw_h43(ax):
        if gdf is None or gdf.empty:
            ax.axis("off"); ax.text(.5, .55, "当前输出未找到可用于组间检验的 GSR/SCL 表", ha="center", fontsize=15, color="#183b63"); ax.text(.5, .4, "不是把缺失当作不显著，而是尚未形成独立检验", ha="center", fontsize=10)
            return
        nums = gdf.select_dtypes(include=np.number).columns[:6]
        vals = [pd.to_numeric(gdf[c], errors="coerce").dropna().mean() for c in nums]
        ax.bar(np.arange(len(vals)), vals, color="#2a9d8f"); ax.set_xticks(np.arange(len(vals))); ax.set_xticklabels(nums, rotation=35, ha="right", fontsize=8); ax.set_ylabel("均值（描述性）")
    add(43, "生理 HR/HRR/HRV/GSR", "H43 皮肤电恢复模式审计", "GSR/SCL 结果只作生理补充；图中若为描述性值，不代替组间 p", "NA", draw_h43)

    # H48: HRR-pi relation audit.
    add(48, "生理 HR/HRR/HRV/GSR", "H48 HRR—MOT/DRT 分配比例关联审计", "当前没有独立 HRR×pi_MOT_lite 联合回归输出", "NA")

    # H49: cross-paradigm evidence map with module-level audit counts.
    def draw_h49(ax):
        names, tests, sig = [], [], []
        for name, root in roots.items():
            s = p_summary(root); names.append(name); tests.append(s["n_tests"]); sig.append(s["n_p_lt_05"])
        x = np.arange(len(names)); ax.bar(x - .18, tests, .36, label="原始 p 检验数", color="#4f81bd"); ax.bar(x + .18, sig, .36, label="p<.05 数", color="#e67e22")
        ax.set_xticks(x); ax.set_xticklabels(names, rotation=35, ha="right", fontsize=8); ax.set_ylabel("数量"); ax.legend(fontsize=8)
        ax.text(.5, .96, "H49 没有预先指定的跨范式统一总 p；此图为证据地图", transform=ax.transAxes, ha="center", va="top", fontsize=9, color="#555555")
    add(49, "跨范式整合", "H49 跨范式认知控制证据地图", "各模块原始 p 检验与显著检验数量；不把模块摘要当联合检验", "NA", draw_h49)
    return records

def select_hypothesis_figure(n, figures):
    rule = H_FIG_RULES.get(n)
    if not rule:
        return None
    module, keywords = rule
    candidates = [x for x in figures if x["module"] == module and all(k.lower() in Path(x["source"]).name.lower() for k in keywords)]
    return candidates[0]["copied"] if candidates else None


def write_report(roots, figures, significant):
    TAB_OUT.mkdir(parents=True, exist_ok=True)
    fig_index = pd.DataFrame(figures)
    fig_index.to_csv(TAB_OUT / "全量图表索引.csv", index=False, encoding="utf-8-sig")

    rows = []
    summaries = {}
    for module, root in roots.items():
        summaries[module] = p_summary(root)
    for n, title in HYPOTHESES:
        module = module_for(n)
        s = summaries.get(module, {"n_tests": 0, "n_p_lt_05": 0, "min_raw_p": "NA", "p_summary": "未直接检验"})
        representative_path = select_hypothesis_figure(n, figures)
        representative = {"copied": representative_path} if representative_path else None
        status = "已纳入模块结果"
        module_has_figures = any(x["module"] == module for x in figures)
        if not module_has_figures or s["n_tests"] == 0:
            status = "未直接检验或当前输出中缺少独立检验"
        rows.append({"假设": f"H{n}", "编号": n, "假设内容": title, "模块": module, "状态": status, "结果说明": H_DETAILS.get(n, "已纳入对应模块的完整结果表。"), **s, "代表图": representative["copied"] if representative else "NA"})
    hdf = pd.DataFrame(rows)
    hdf.to_csv(TAB_OUT / "H1-H58_假设结果总表_显著与不显著完整.csv", index=False, encoding="utf-8-sig")
    hdf[["假设", "假设内容", "模块", "代表图"]].to_csv(TAB_OUT / "H1-H58_逐假设配图索引.csv", index=False, encoding="utf-8-sig")

    cross_map = {
        49: "MOT/DRT、SART、Flanker 和生理模块均有可追溯表格；本条为跨模块证据汇总，不伪造新的联合 p 值。",
        50: "SART 模块提供 d'、commission、omission、RT CoV 等全量表格。",
        51: "足球模块提供逐题 A/B/C/D 选择比例、向量距离和置换检验表。",
        52: "Corsi 模块提供最大 span、准确率、首击 RT、反应时和两两比较表。",
        53: "BELT 模块提供问卷 Spearman 相关表，本报告图形只保留热点图。",
        54: "MOT/DRT 模块提供 G_lite 与 pi_MOT_lite 的阶段×球数完整表格。",
        55: "MOT/DRT 模块提供 exercise1 和 exercise2 的阶段×球数比较。",
        56: "生理模块提供 HR、HRR、HRV、峰谷差、GSR 和运动恢复图表。",
        57: "生理模块提供 HRR 与认知变化的回归结果表。",
        58: "认知—生理效率由行为与生理模块的可追溯结果共同解释，未另造一个未经计划的总 p。",
    }
    cross_rows = []
    for n in range(49, 59):
        cross_rows.append({"假设": f"H{n}", "跨范式数据证据": cross_map[n], "对应原始模块": "MOT/DRT; SART; Flanker; Corsi; BELT+问卷; 足球决策; 生理", "数据说明": "对应模块的原始 CSV 已复制到本报告 tables 文件夹。"})
    pd.DataFrame(cross_rows).to_csv(TAB_OUT / "跨范式整合_H49-H58_数据证据表.csv", index=False, encoding="utf-8-sig")

    doc = Document()
    sec = doc.sections[0]
    sec.top_margin = Inches(.6); sec.bottom_margin = Inches(.6); sec.left_margin = Inches(.65); sec.right_margin = Inches(.65)
    doc.styles["Normal"].font.name = "Microsoft YaHei"; doc.styles["Normal"].font.size = Pt(9)
    p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("实验研究假设 H1-H58\n六个范式、生理与 MOT/DRT 简易资源代理完整报告")
    r.bold = True; r.font.size = Pt(17); r.font.name = "Microsoft YaHei"
    doc.add_paragraph("本报告按最新 H1-H58 假设逐条列出，所有假设均保留，无论显著、趋势、不显著或尚未直接检验。MOT/DRT 使用简易行为资源代理 G_lite 和 pi_MOT_lite；正式 PMwG 仍作为独立运行的正式模型，不与本简易版混写。")
    doc.add_heading("一、统一分析口径", level=1)
    doc.add_paragraph("分组：运动员、运动后1分钟低心率非运动员、运动后1分钟高心率非运动员。MOT/DRT 主比较按每个阶段×每个球数分别进行，球数为1、2、3、4、5，不用跨阶段或跨球数的总体比较替代。主检验保留原始 p 值，不做 FDR。")
    doc.add_paragraph("资源代理：zMOT由MOT表现标准化得到；zDRT综合DRT命中率和反应速度方向；G_lite=(zMOT+zDRT)/2；pi_MOT_lite=zMOT-zDRT。它们是行为替代指标，不称为原文潜变量。")
    doc.add_paragraph("图表：所有可用 PNG 均复制到 figures；所有完整 CSV 和图表索引均复制或汇总到 tables。若某项没有独立模型，报告明确标记“未直接检验”，不把模块最小 p 值冒充该假设的独立 p 值。")
    doc.add_heading("二、各范式统计扫描摘要", level=1)
    for module, s in summaries.items():
        doc.add_heading(module, level=2)
        doc.add_paragraph(f"本模块扫描到 {s['n_tests']} 个结构化原始 p 值，其中 p<.05 有 {s['n_p_lt_05']} 个，最小原始 p={s['min_raw_p']}。此摘要只放在模块开头，不作为每条假设的独立 p 值。")

    doc.add_heading("三、H1-H58 逐条结果", level=1)
    current = None
    seen_rep_figs = set()
    for _, row in hdf.iterrows():
        if row["模块"] != current:
            current = row["模块"]
            doc.add_heading(current, level=2)
        doc.add_heading(f"{row['假设']}：{row['假设内容']}", level=3)
        doc.add_paragraph(f"结果状态：{row['状态']}。")
        doc.add_paragraph(f"本条结果说明：{row['结果说明']}")
        doc.add_paragraph("完整 p 值、样本量、效应量和缺失标记见本模块 tables 文件夹中的对应原始 CSV；不把模块摘要 p 值重复写成该条假设的独立检验。")
        # Every hypothesis gets its own figure slot. Reusing a source image is
        # allowed when hypotheses share the same outcome, but it is never omitted.
        if row["代表图"] != "NA":
            doc.add_picture(row["代表图"], width=Inches(5.8))
            cap = doc.add_paragraph(f"代表图：{Path(row['代表图']).name}")
            cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_heading("四、补充显著结果：新增假设候选", level=1)
    doc.add_paragraph("除预先列出的 H1-H58 外，下面把所有有效的原始 p<.05 结果按模块和来源表列出，作为补充假设候选。标记为缺失或无法估计的行未计入显著结果。")
    if not significant.empty:
        table = doc.add_table(rows=1, cols=4)
        table.style = "Table Grid"
        for cell, text in zip(table.rows[0].cells, ["模块", "指标/效应", "原始 p", "来源表"]):
            cell.text = text
        for _, sr in significant.iterrows():
            cells = table.add_row().cells
            cells[0].text = str(sr["模块"])
            cells[1].text = str(sr["指标或效应"])[:1000]
            cells[2].text = f"{float(sr['原始p']):.6g}"
            cells[3].text = str(sr["来源表"])

    doc.add_heading("五、MOT/DRT 1–5球完整图集", level=1)
    doc.add_paragraph("MOT/DRT 不再只展示 4/5 球代表图。以下纳入当前简易资源代理输出的完整阶段×球数×指标图；其中 4球、5球的正确率、d'、DRT hit/miss、logRT、G_lite 和 pi_MOT_lite 均保留。")
    mot_figs = [x for x in figures if x["module"] == "MOT/DRT简易资源代理" and ("load4" in Path(x["source"]).name.lower() or "load5" in Path(x["source"]).name.lower())]
    if not mot_figs:
        mot_figs = [x for x in figures if x["module"] == "MOT/DRT简易资源代理"]
    for item in mot_figs:
        doc.add_picture(item["copied"], width=Inches(5.7))
        cap = doc.add_paragraph(f"MOT/DRT图：{Path(item['copied']).name}")
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_heading("六、BELT 图形保留说明", level=1)
    doc.add_paragraph("BELT 在本版只保留 BELT—问卷相关热点图；其余 BELT 图没有复制到本报告 figures 文件夹。相关 CSV 仍保留用于交叉核验。")
    for item in [x for x in figures if x["module"] == "BELT+问卷"]:
        doc.add_picture(item["copied"], width=Inches(5.7))
        cap = doc.add_paragraph(f"BELT—问卷热点图：{Path(item['copied']).name}")
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_heading("七、跨范式数据证据", level=1)
    doc.add_paragraph("跨范式部分此前为空，是因为没有把各任务已有原始结果表汇总成证据表；现在已生成跨范式 H49-H58 数据证据表，并保留各模块原始 CSV，不把不同范式强行合并成一个未经计划的联合显著性检验。")
    doc.add_paragraph(f"跨范式证据表：{TAB_OUT / '跨范式整合_H49-H58_数据证据表.csv'}")

    doc.add_heading("八、文件索引与限制", level=1)
    doc.add_paragraph(f"本次共复制 {len(figures)} 张图。完整图表索引：{TAB_OUT / '全量图表索引.csv'}；假设总表：{TAB_OUT / 'H1-H58_假设结果总表_显著与不显著完整.csv'}；补充显著结果表：{TAB_OUT / '补充显著结果_作为新增假设_原始p.csv'}。")
    doc.add_paragraph("本报告不删去不显著结果。缺失、NA、未直接检验和模块样本差异都保留在表格中。Word 的自动 PNG 渲染需要 LibreOffice；当前环境未安装 LibreOffice，因此未做自动渲染视觉复核。")
    report = OUT / "实验研究假设H1-H58_六范式生理_简易资源代理完整报告_20260730.docx"
    doc.add_heading("Flanker 17个对比完整图集（补充）", level=1)
    doc.add_paragraph("以下按 Flanker 17 个具体对比逐一列图；每张图对应一个指标对比，并保留图内原始 p 值，不按显著性删图。")
    flanker_figs = sorted([x for x in figures if x["module"] == "Flanker"], key=lambda x: Path(x["source"]).name.lower())
    for item in flanker_figs:
        doc.add_picture(item["copied"], width=Inches(5.7))
        cap = doc.add_paragraph(f"Flanker 对比图：{Path(item['copied']).name}")
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_heading("MOT/DRT 1–5球完整图集（补充）", level=1)
    doc.add_paragraph("以下覆盖静息、第一次运动后、第二次运动后，以及 1、2、3、4、5 球的 MOT/DRT 和简易资源代理指标；每张图保留原始 p 值。")
    mot_figs_all = sorted([x for x in figures if any(k in Path(x["source"]).name.lower() for k in ["rest_load", "exercise1_load", "exercise2_load"])], key=lambda x: Path(x["source"]).name.lower())
    for item in mot_figs_all:
        doc.add_picture(item["copied"], width=Inches(5.7))
        cap = doc.add_paragraph(f"MOT/DRT 图：{Path(item['copied']).name}")
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.save(report)
    return report, summaries


def main():
    # This directory is generated only by this script; rebuild it to avoid stale duplicated figures.
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)
    roots = source_roots()
    figures = copy_figures(roots)
    figures.extend(make_hypothesis_specific_figures(roots))
    tables = copy_tables(roots)
    significant = collect_significant_results(roots)
    report, summaries = write_report(roots, figures, significant)
    manifest = {"hypotheses": 58, "figures_copied": len(figures), "tables_copied": len(tables), "supplementary_significant_rows": int(len(significant)), "report": str(report), "output": str(OUT), "resource_pool": "simple behavioral proxy", "source_roots": {k: str(v) if v else None for k, v in roots.items()}, "module_summaries": summaries}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "README.md").write_text("# H1-H58 六范式、生理和简易资源代理总报告\n\n所有假设逐条列出，显著与不显著结果均保留；MOT/DRT按阶段×球数分析。\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
