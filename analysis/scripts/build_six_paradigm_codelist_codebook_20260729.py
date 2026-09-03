"""Build reusable codelists and codebooks for the six football-experiment paradigms.

The workbook documents only variable definitions and code values.  It does not
export names, phones, raw IDs, audio, video, or trial-level participant data.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pandas as pd


ROOT = Path(r"C:\Users\loria\Documents\Codex\2026-07-01\new-chat")
FROOT = Path(r"F:\足球实验数据")
OUT = FROOT / "分析输出" / "六个范式_CodeList_Codebook_20260729"

SOURCES = {
    "MOT_DRT": ROOT / "work" / "mot_inventory_intermediate" / "MOT_raw_block_all_masked.csv",
    "SART_trial": FROOT / "分析输出" / "SART黄色注意捕获_心率三组报告与PPT素材_20260715" / "表格" / "SART_心率三组_trial级_脱敏.csv",
    "SART_condition": FROOT / "分析输出" / "SART黄色注意捕获_心率三组报告与PPT素材_20260715" / "表格" / "SART_心率三组_被试条件级指标.csv",
    "BELT_trial": FROOT / "分析输出" / "Corsi_BELT_心率三组重分析_20260715" / "表格" / "BELT_trial学习曲线数据_心率三组.csv",
    "BELT_subject": FROOT / "分析输出" / "Corsi_BELT_心率三组重分析_20260715" / "表格" / "BELT_被试基础指标_心率三组.csv",
    "Corsi": FROOT / "分析输出" / "Corsi_BELT_心率三组重分析_20260715" / "表格" / "Corsi_被试指标_心率三组.csv",
    "Flanker": FROOT / "分析输出" / "Flanker_心率三组_17个计划对比_20260722" / "表格" / "Flanker_心率三组_trial级_脱敏.csv",
    "Soccer": FROOT / "分析输出" / "更新分析_平衡25非运动员_1到5球_心率窗口_足球选择分布_20260710" / "足球决策_选择分布_trial级平衡样本.csv",
}

CB_COLUMNS = ["范式", "层级", "变量名", "中文名称", "类型或单位", "字段来源或计算", "有效值/编码", "缺失值与质控规则", "分析用途"]
CL_COLUMNS = ["范式", "变量名", "代码", "中文标签", "定义/备注"]


def cb(task: str, level: str, var: str, label: str, kind: str, formula: str, valid: str, missing: str, use: str) -> dict:
    return dict(zip(CB_COLUMNS, [task, level, var, label, kind, formula, valid, missing, use]))


def cl(task: str, var: str, code: str, label: str, note: str = "") -> dict:
    return dict(zip(CL_COLUMNS, [task, var, code, label, note]))


def common_group_codes(task: str) -> list[dict]:
    return [
        cl(task, "hr_group3", "运动员", "运动员", "默认心率三组主比较"),
        cl(task, "hr_group3", "非运动员高心率", "非运动员高心率", "按第二次运动后短时心率分层"),
        cl(task, "hr_group3", "非运动员低心率", "非运动员低心率", "按第二次运动后短时心率分层"),
        cl(task, "masked_phone", "130****0000", "脱敏被试键示例", "仅用于同一内部表连接；不得还原或外发原号"),
    ]


def mot_drt() -> tuple[list[dict], list[dict]]:
    task = "MOT/DRT"
    book = [
        cb(task, "trial", "subject_id", "被试匿名ID", "字符串", "原始行为文件中的匿名键", "匿名字符", "不在公开输出中还原为姓名/手机号", "内部连接键"),
        cb(task, "trial", "block_type", "区段类型", "分类", "原始任务字段", "practice/formal", "practice 不进正式分析", "正式与练习区分"),
        cb(task, "trial", "trial_index", "试次序号", "整数", "原始任务字段", "正整数", "缺失则记录为原始记录问题", "轮次/位置控制"),
        cb(task, "trial", "target_count", "目标球数/负荷", "整数（球）", "原始任务字段", "1/2/3/4/5", "缺失不进入对应负荷分析", "任务负荷"),
        cb(task, "trial", "fixed_target_indices", "目标球编号集合", "数组字符串", "原始任务字段", "0-9 的不重复索引", "缺失则不能重建项目级选择", "目标项目定义"),
        cb(task, "trial", "mot_selected_indices", "被试最终选择球编号集合", "数组字符串", "重建后的选择集合", "0-9 的不重复索引", "多次点击同球按任务规则取消；未匹配点击保留审计", "项目级选择、命中与虚报"),
        cb(task, "trial", "mot_selected_count", "选择球数", "整数（球）", "最终选择集合长度", "0-10", "无选择=0；不插补", "选择策略与质控"),
        cb(task, "trial", "mot_correct_count", "选中目标数", "整数（球）", "选择集合与目标集合交集长度", "0-target_count", "不插补", "MOT命中、正确率、d′"),
        cb(task, "trial", "mot_false_selection_count", "误选非目标数", "整数（球）", "选择集合减目标集合的长度", "0-(10-target_count)", "不插补", "虚报率、d′"),
        cb(task, "trial", "mot_miss_target_count", "漏选目标数", "整数（球）", "target_count − mot_correct_count", "0-target_count", "不插补", "MOT漏选与d′"),
        cb(task, "trial", "mot_accuracy", "MOT正确率", "比例", "mot_correct_count / target_count", "0-1", "target_count=0 时缺失", "主任务表现"),
        cb(task, "signal", "drt_signal_count", "前两次DRT红框数", "整数", "每trial仅保留第1、2次红框", "0/1/2", "第三次及以后不分析", "DRT分母"),
        cb(task, "signal", "drt_hit_count", "DRT有效命中数", "整数", "红框后点击；有效窗口：RT≥200ms且在下一红框或小球停止前", "0-2", "窗口外/过快为无效；审计保留", "DRT命中率"),
        cb(task, "signal", "drt_miss_count", "DRT漏反应数", "整数", "drt_signal_count − drt_hit_count", "0-2", "不插补", "DRT漏反应率"),
        cb(task, "signal", "drt_mean_rt", "DRT平均有效RT", "ms", "mean(有效点击RT)，每红框首次合格点击", "≥200ms且在截止前", "无有效点击时缺失，不以0填补", "DRT速度/logRT"),
        cb(task, "condition", "hit_rate", "MOT目标命中率", "比例", "Σmot_correct_count / Σtarget_count", "0-1", "计数分母为0则缺失", "selection-based SDT"),
        cb(task, "condition", "fa_rate", "MOT非目标虚报率", "比例", "Σmot_false_selection_count / Σ(10-target_count)", "0-1", "计数分母为0则缺失", "selection-based SDT"),
        cb(task, "condition", "mot_dprime", "MOT d′", "z分数差", "Φ⁻¹[(Σhits+0.5)/(Σtargets+1)] − Φ⁻¹[(Σfalse alarms+0.5)/(Σnon-targets+1)]", "连续值", "计数校正避免±∞；4+5球先合并计数后重算", "主任务辨别能力"),
        cb(task, "condition", "drt_hit_rate", "DRT有效点击率", "比例", "Σdrt_hit_count / Σdrt_signal_count", "0-1", "阶段<50%按既定规则标为阶段DRT无效；被试间版本可整人排除", "副任务维持"),
        cb(task, "condition", "drt_miss_rate", "DRT漏反应率", "比例", "1 − drt_hit_rate", "0-1", "同上", "副任务代价"),
        cb(task, "condition", "drt_logrt", "DRT对数RT", "log(ms)", "log(drt_mean_rt)", "连续值", "drt_mean_rt缺失则缺失", "RT分布稳健化"),
        cb(task, "condition", "zMOT", "标准化MOT效率", "z分数", "在球数内标准化 MOT 指标", "连续值", "标准化样本不足则缺失", "资源池/效率指数输入"),
        cb(task, "condition", "zDRT", "标准化DRT效率", "z分数", "z(drt_hit_rate) − z(drt_logrt)", "连续值", "任一成分缺失则缺失", "资源池/效率指数输入"),
        cb(task, "condition", "overall_efficiency", "整体双任务效率", "指数", "zMOT + zDRT", "连续值", "任一成分缺失则缺失", "双任务总体表现"),
        cb(task, "condition", "mot_priority_index", "MOT优先指数", "指数", "zMOT − zDRT", "连续值", "任一成分缺失则缺失", "资源分配倾向；正值更偏MOT"),
        cb(task, "condition", "stage", "阶段", "分类", "由任务顺序映射", "rest/exercise1/exercise2", "不插补阶段", "重复测量阶段因素"),
        cb(task, "condition", "delta_exercise1_minus_rest", "第一次运动后变化", "与原指标相同", "exercise1 − rest", "连续值", "任一阶段缺失则缺失", "阶段变化"),
        cb(task, "condition", "delta_exercise2_minus_rest", "第二次运动后变化", "与原指标相同", "exercise2 − rest", "连续值", "任一阶段缺失则缺失", "阶段变化"),
        cb(task, "condition", "delta_exercise2_minus_exercise1", "第二次相对第一次运动后变化", "与原指标相同", "exercise2 − exercise1", "连续值", "任一阶段缺失则缺失", "阶段变化"),
    ]
    codes = common_group_codes(task) + [
        cl(task, "stage", "rest", "静息/运动前", "MOT/DRT第1阶段"), cl(task, "stage", "exercise1", "第一次运动后", "跳绳1后MOT/DRT"), cl(task, "stage", "exercise2", "第二次运动后", "跳绳2后MOT/DRT"),
        *[cl(task, "target_count", str(i), f"{i}球", "每trial 10个总球中有i个目标球") for i in range(1, 6)],
        cl(task, "block_type", "practice", "练习", "不入正式主分析"), cl(task, "block_type", "formal", "正式", "进入正式分析"),
        cl(task, "drt_valid", "1", "有效点击", "RT≥200ms且在对应截止点前"), cl(task, "drt_valid", "0", "无效/漏反应", "过快、窗口外或无点击；审计保留"),
    ]
    return book, codes


def sart() -> tuple[list[dict], list[dict]]:
    task = "SART"
    book = [
        cb(task, "trial", "phase_code", "原始阶段代码", "分类", "原始任务字段", "SART_pre/SART_post", "缺失则不进入配对变化", "阶段标识"),
        cb(task, "trial", "phase", "报告阶段", "分类", "phase_code映射", "前测/后测", "没有独立第一次运动后SART阶段", "前测与第二次运动后比较"),
        cb(task, "trial", "trial_index", "试次序号", "整数", "原始任务字段", "正整数", "缺失为原始记录问题", "位置/练习控制"),
        cb(task, "trial", "digit", "呈现数字", "整数", "原始任务字段", "0-9（以实际程序为准）", "缺失不分类", "Go/NoGo分类"),
        cb(task, "trial", "trial_type", "试次类型", "分类", "digit映射", "Go/NoGo", "练习不进分析", "错误与RT定义"),
        cb(task, "trial", "capture", "注意捕获条件", "分类", "颜色/突出刺激映射", "普通/黄色", "缺失不进对应条件", "黄色捕获代价"),
        cb(task, "trial", "response_made", "是否按键", "二元", "原始任务字段", "0/1", "无反应保留为错误或正确NoGo", "正确性分类"),
        cb(task, "trial", "rt_ms", "反应时", "ms", "原始任务字段", "非负数", "正确Go RT只用150-1250ms", "Go RT分析"),
        cb(task, "trial", "go_omission", "Go漏按", "二元", "Go且未按", "0/1", "保留为结果", "持续注意错误"),
        cb(task, "trial", "nogo_commission", "NoGo误按", "二元", "NoGo且按键", "0/1", "保留为结果", "抑制错误"),
        cb(task, "trial", "correct_go_rt_valid", "正确Go RT有效标记", "二元", "Go、正确且150≤RT≤1250", "0/1", "<150为提前反应；>1250/无反应为漏按", "Go RT计算"),
        cb(task, "condition", "go_rt_mean_ms", "正确Go平均RT", "ms", "mean(RT | correct_go_rt_valid=1)", "连续值", "无有效Go RT时缺失", "速度"),
        cb(task, "condition", "go_rt_cv", "正确Go RT CoV", "无单位", "SD(correct Go RT)/mean(correct Go RT)", "≥0", "有效Go RT不足2个时缺失", "稳定性"),
        cb(task, "condition", "commission_rate", "NoGo误按率", "比例", "Σnogo_commission/nogo_n", "0-1", "不删除错误trial", "抑制控制"),
        cb(task, "condition", "go_omission_rate", "Go漏按率", "比例", "Σgo_omission/go_n", "0-1", "不删除错误trial", "持续注意"),
        cb(task, "condition", "dprime", "SART d′", "z分数差", "Φ⁻¹[(NoGo正确不按+0.5)/(NoGo n+1)] − Φ⁻¹[(Go漏按+0.5)/(Go n+1)]", "连续值", "0.5校正；不插补", "辨别/抑制能力"),
        cb(task, "condition", "criterion", "SART criterion", "z分数", "−0.5×[Φ⁻¹(Hit_adj)+Φ⁻¹(FA_adj)]", "连续值", "策略指标，不单独表示能力", "反应策略"),
        cb(task, "condition", "capture_cost", "黄色捕获代价", "与原指标相同", "黄色−普通；d′使用普通−黄色", "连续值", "需同被试两条件均有值", "注意捕获成本"),
        cb(task, "condition", "delta_post_minus_pre", "阶段差值", "与原指标相同", "后测−前测（后测=第二次运动后）", "连续值", "当前无第一次运动后SART数据", "组内变化/组间变化差比较"),
    ]
    codes = common_group_codes(task) + [
        cl(task, "phase_code", "SART_pre", "前测", "静息/运动前"), cl(task, "phase_code", "SART_post", "后测", "第二次运动后"),
        cl(task, "trial_type", "Go", "Go试次", "应按键；漏按为omission"), cl(task, "trial_type", "NoGo", "NoGo试次（数字3）", "应不按；误按为commission"),
        cl(task, "capture", "普通", "普通条件", "无黄色捕获"), cl(task, "capture", "黄色", "黄色捕获条件", "黄色突出刺激"),
        cl(task, "is_practice", "TRUE", "练习", "不入正式分析"), cl(task, "is_practice", "FALSE", "正式", "进入正式分析"),
    ]
    return book, codes


def belt() -> tuple[list[dict], list[dict]]:
    task = "BELT"
    book = [
        cb(task, "trial", "balloon_color", "气球颜色", "分类", "原始任务字段", "依实际程序颜色代码", "缺失不进条件分析", "条件/学习规律"),
        cb(task, "trial", "balloon_threshold", "爆炸阈值", "整数（泵数）", "原始任务字段", "正整数", "不向被试明示；缺失保留审计", "条件学习/误差"),
        cb(task, "trial", "task_phase", "任务进程阶段", "分类", "trial_number分段", "early/middle/late或1/2/3", "缺失不分段", "学习曲线"),
        cb(task, "trial", "pump_count", "泵气次数", "整数", "原始任务字段", "≥0", "爆炸trial不删除", "风险承担/探索"),
        cb(task, "trial", "cash_pressed", "是否兑现", "二元", "原始任务字段", "0/1", "不插补", "风险回收策略"),
        cb(task, "trial", "exploded", "是否爆炸", "二元", "原始任务字段", "0/1", "爆炸是结果，不删trial", "负反馈/未调节风险"),
        cb(task, "trial", "points_this_trial", "本trial得分", "分", "原始任务字段", "数值", "不以低分删trial", "任务表现"),
        cb(task, "trial", "trial_dur_ms", "trial时长", "ms", "原始任务字段", "非负数", "记录缺失而不插补", "过程描述"),
        cb(task, "subject", "mean_pump_count", "平均泵气数", "次/trial", "mean(pump_count)", "≥0", "所有正式trial", "总体探索/风险承担"),
        cb(task, "subject", "explosion_rate", "爆炸率", "比例", "mean(exploded)", "0-1", "所有正式trial", "风险调节"),
        cb(task, "subject", "cash_rate", "兑现率", "比例", "mean(cash_pressed)", "0-1", "所有正式trial", "保守回收"),
        cb(task, "subject", "total_score_final", "最终得分", "分", "最后trial累计得分", "数值", "缺失需审计", "任务结果"),
        cb(task, "learning", "reward_late_minus_early", "后期−前期得分", "分/trial", "late_reward_mean−early_reward_mean", "连续值", "至少有早晚期数据", "学习改善"),
        cb(task, "learning", "explosion_early_minus_late", "前期−后期爆炸率", "比例差", "early_explosion_rate−late_explosion_rate", "连续值", "至少有早晚期数据", "风险调节学习"),
        cb(task, "learning", "reward_slope", "得分学习斜率", "分/试次", "points 对trial_number回归斜率", "连续值", "trial数不足时缺失", "学习速度"),
    ]
    codes = common_group_codes(task) + [
        cl(task, "exploded", "0", "未爆炸", "可兑现或主动结束"), cl(task, "exploded", "1", "爆炸", "保留为行为结果"),
        cl(task, "cash_pressed", "0", "未兑现", "可能爆炸或结束前未兑现"), cl(task, "cash_pressed", "1", "已兑现", "主动收回当前得分"),
        cl(task, "epoch", "early", "前期", "按正式trial序列前段"), cl(task, "epoch", "late", "后期", "按正式trial序列后段"),
    ]
    return book, codes


def corsi() -> tuple[list[dict], list[dict]]:
    task = "反向Corsi"
    book = [
        cb(task, "trial", "span", "序列长度", "整数（方块数）", "原始程序呈现长度", "2-9", "练习不进入正式；无正式trial/最大span缺失/最大span<2考虑规则失败", "难度与广度"),
        cb(task, "trial", "sequence_presented", "呈现方块序列", "数组/字符串", "程序随机生成并记录", "1-9方块编号序列", "缺失不计分", "反向作答正确性"),
        cb(task, "trial", "response_sequence", "被试点击序列", "数组/字符串", "被试反向点击的记录", "1-9方块编号序列", "不完整/多余点击保留为错误类型", "错误类型"),
        cb(task, "trial", "correct", "反向序列正确", "二元", "response_sequence=reverse(sequence_presented)", "0/1", "错误trial保留", "正确率/总分"),
        cb(task, "trial", "first_click_rt_ms", "首次点击反应时", "ms", "序列呈现结束至首次点击", "≥0", "缺失不插补", "反应启动"),
        cb(task, "trial", "response_duration_ms", "完整作答时长", "ms", "首次到最后一次点击或提交", "≥0", "缺失不插补", "作答过程"),
        cb(task, "subject", "accuracy_rate", "正式正确率", "比例", "Σcorrect/formal_trial_n", "0-1", "formal_trial_n=0缺失", "总体空间工作记忆"),
        cb(task, "subject", "max_correct_sequence_length", "最大正确长度", "方块数", "max(span | correct=1)", "2-9", "<2为规则理解失败候选", "反向Corsi广度"),
        cb(task, "subject", "total_score", "总正确数", "整数", "Σcorrect（现有汇总中由accuracy×formal_trial_n重建时需标注）", "≥0", "不插补", "总体表现"),
        cb(task, "subject", "mean_first_click_rt_ms", "平均首点RT", "ms", "mean(first_click_rt_ms)", "≥0", "无可用trial则缺失", "反应启动"),
        cb(task, "subject", "mean_response_duration_ms", "平均作答时长", "ms", "mean(response_duration_ms)", "≥0", "无可用trial则缺失", "完成效率"),
    ]
    codes = common_group_codes(task) + [
        *[cl(task, "span", str(i), f"Span {i}", "反向复现i个方块") for i in range(2, 10)],
        cl(task, "correct", "0", "错误", "包括顺序错、位置错、不完整、多余点击、提前点击"), cl(task, "correct", "1", "正确", "完整反向顺序一致"),
    ]
    return book, codes


def flanker() -> tuple[list[dict], list[dict]]:
    task = "Flanker"
    book = [
        cb(task, "trial", "condition", "八条件编码", "分类", "一致性×黄色位置映射", "CS/IS/NS/CT/IT/NT/CF/IF", "练习不进入正式；错误保留", "计划对比"),
        cb(task, "trial", "target_dir", "目标方向", "分类", "原始任务字段", "left/right或程序实际代码", "缺失需审计", "正确反应定义"),
        cb(task, "trial", "flanker_dir", "侧翼方向", "分类", "原始任务字段", "left/right/neutral", "缺失需审计", "一致性"),
        cb(task, "trial", "popout_type", "黄色突出类型", "分类", "原始任务字段", "none/target/flanker", "缺失映射为普通或审计", "捕获条件"),
        cb(task, "trial", "response_key", "反应键", "分类", "原始任务字段", "键位代码", "无反应为缺失/timeout", "正确性"),
        cb(task, "trial", "accuracy_num", "正确性", "二元", "按目标方向与反应键判定", "0/1", "错误trial保留为准确率结果", "准确率"),
        cb(task, "trial", "rt_ms_num", "反应时", "ms", "原始任务字段", "≥0", "RT只用正式正确trial；条件内被试内±3SD标记", "速度"),
        cb(task, "trial", "rt_outlier_3sd", "RT三SD异常标记", "二元", "同被试×条件正确RT偏离均值±3SD", "0/1", "标记=1不进入RT敏感性版本；准确率仍保留", "RT敏感性清洗"),
        cb(task, "contrast", "planned_contrast", "计划对比", "差值", "条件均值或正确RT差", "17个预设对比", "两条件任一缺失则该对比缺失", "冲突/捕获效应"),
    ]
    condition_codes = [
        ("CS", "一致-普通"), ("IS", "不一致-普通"), ("NS", "中性-普通"), ("CT", "一致-目标黄"),
        ("IT", "不一致-目标黄"), ("NT", "中性-目标黄"), ("CF", "一致-侧翼黄"), ("IF", "不一致-侧翼黄"),
    ]
    contrasts = [
        ("IS-CS", "经典Flanker冲突"), ("IS-NS", "不一致相对中性成本"), ("NS-CS", "中性相对一致成本"),
        ("CT-CS", "一致目标黄效应"), ("IT-IS", "不一致目标黄效应"), ("NT-NS", "中性目标黄效应"),
        ("CF-CS", "一致侧翼捕获"), ("IF-IS", "不一致侧翼捕获"), ("IF-CF", "侧翼黄条件下冲突效应"),
        ("IT-CT", "目标黄条件下经典冲突"), ("IT-NT", "目标黄条件下不一致相对中性成本"), ("NT-CT", "目标黄条件下中性相对一致成本"),
        ("CF-CT", "一致条件：侧翼黄−目标黄"), ("IF-IT", "不一致条件：侧翼黄−目标黄"),
        ("(IF-IS)-(CF-CS)", "侧翼捕获受一致性调节"), ("(IT-IS)-(CT-CS)", "目标黄效应受一致性调节"),
        ("(IF-IT)-(CF-CT)", "侧翼相对目标黄特异性受一致性调节"),
    ]
    codes = common_group_codes(task) + [cl(task, "condition", c, lab) for c, lab in condition_codes] + [cl(task, "planned_contrast", c, lab) for c, lab in contrasts] + [
        cl(task, "accuracy_num", "0", "错误", "错误保留在准确率分析"), cl(task, "accuracy_num", "1", "正确", "正确trial可进入RT分析"),
        cl(task, "rt_outlier_3sd", "0", "未标记", "进入RT分析"), cl(task, "rt_outlier_3sd", "1", "标记异常", "仅RT敏感性版本剔除"),
    ]
    return book, codes


def soccer() -> tuple[list[dict], list[dict]]:
    task = "足球决策"
    book = [
        cb(task, "trial", "phase", "任务阶段", "分类", "原始任务字段", "formal/practice等", "练习不作为主选择向量分析", "正式题筛选"),
        cb(task, "trial", "block", "任务区块", "整数", "原始任务字段", "按程序实际block编码", "缺失不进对应block汇总", "block比较"),
        cb(task, "trial", "tactical_point", "战术题目标签", "字符串", "题库字段", "攻防战术主题", "缺失需审计", "逐题选择分布"),
        cb(task, "trial", "answer", "被试选项", "分类", "原始任务字段ans/answer", "A/B/C/D", "无答为缺失；不以固定正确答案删除", "核心选择向量"),
        cb(task, "trial", "rt_ms", "决策反应时", "ms", "原始任务字段rt", "≥0", "当前主分析不因RT定义正确/错误", "补充过程指标"),
        cb(task, "item_group", "answer_proportion", "每题选项比例", "比例", "每组每题各选项人数/该组作答人数", "0-1且A+B+C+D=1", "分母0则缺失", "选择分布"),
        cb(task, "item_group", "cramers_v", "Cramér's V", "效应量", "组别×A/B/C/D列联表", "0-1", "小期望频数时优先置换检验", "逐题分布差异大小"),
        cb(task, "item_group", "jensen_shannon_distance", "Jensen-Shannon距离", "距离", "两组或多组选择比例向量的JS距离", "0-1附近，取决于定义", "不设唯一正确答案", "选择向量差异"),
        cb(task, "overall", "permutation_p", "置换检验p", "概率", "随机置换组标签后比较整体选择向量距离", "0-1", "默认10000次；原始p", "总体向量差异"),
    ]
    codes = common_group_codes(task) + [
        *[cl(task, "answer", x, f"选项{x}", "不定义为统一正确/错误；分析选择分布") for x in "ABCD"],
        cl(task, "phase", "formal", "正式", "进入主选择分布分析"), cl(task, "phase", "practice", "练习", "不入正式主分析"),
    ]
    return book, codes


TASKS = {"MOT_DRT": mot_drt, "SART": sart, "BELT": belt, "Corsi": corsi, "Flanker": flanker, "Soccer": soccer}


def read_header(path: Path) -> tuple[str, str]:
    if not path.exists():
        return "未找到", ""
    try:
        header = list(pd.read_csv(path, nrows=0, encoding="utf-8-sig").columns)
        return "已找到", " | ".join(header)
    except Exception as exc:
        return f"读取失败：{type(exc).__name__}", ""


def write_excel(book: pd.DataFrame, codes: pd.DataFrame, sources: pd.DataFrame, readme: pd.DataFrame) -> Path:
    path = OUT / "六个范式_CodeList_Codebook_20260729.xlsx"
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        readme.to_excel(writer, sheet_name="说明", index=False)
        sources.to_excel(writer, sheet_name="源表字段审计", index=False)
        for task in TASKS:
            book.loc[book["范式"] == ({"MOT_DRT": "MOT/DRT", "Corsi": "反向Corsi", "Soccer": "足球决策"}.get(task, task))].to_excel(writer, sheet_name=f"{task}_codebook"[:31], index=False)
            codes.loc[codes["范式"] == ({"MOT_DRT": "MOT/DRT", "Corsi": "反向Corsi", "Soccer": "足球决策"}.get(task, task))].to_excel(writer, sheet_name=f"{task}_codelist"[:31], index=False)
        for ws in writer.book.worksheets:
            ws.freeze_panes = "A2"
            for col in ws.columns:
                width = min(max(len(str(c.value or "")) for c in col) + 2, 45)
                ws.column_dimensions[col[0].column_letter].width = width
            ws.auto_filter.ref = ws.dimensions
    return path


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    all_book, all_codes = [], []
    for key, builder in TASKS.items():
        book, codes = builder()
        bdf, cdf = pd.DataFrame(book, columns=CB_COLUMNS), pd.DataFrame(codes, columns=CL_COLUMNS)
        all_book.append(bdf)
        all_codes.append(cdf)
        safe = {"MOT_DRT": "MOT_DRT", "Corsi": "Corsi", "Soccer": "足球决策"}.get(key, key)
        bdf.to_csv(OUT / f"{safe}_Codebook.csv", index=False, encoding="utf-8-sig")
        cdf.to_csv(OUT / f"{safe}_CodeList.csv", index=False, encoding="utf-8-sig")
    book_df, code_df = pd.concat(all_book, ignore_index=True), pd.concat(all_codes, ignore_index=True)
    book_df.to_csv(OUT / "六个范式_Codebook_汇总.csv", index=False, encoding="utf-8-sig")
    code_df.to_csv(OUT / "六个范式_CodeList_汇总.csv", index=False, encoding="utf-8-sig")

    source_rows = []
    for name, path in SOURCES.items():
        status, header = read_header(path)
        source_rows.append({"来源标签": name, "路径": str(path), "状态": status, "字段名（仅元数据）": header})
    sources_df = pd.DataFrame(source_rows)
    sources_df.to_csv(OUT / "源表字段审计.csv", index=False, encoding="utf-8-sig")
    readme = pd.DataFrame([
        ["用途", "本包为六个范式的变量字典与取值代码，不包含被试原始数据。"],
        ["范式", "MOT/DRT、SART、BELT、反向Corsi、Flanker、足球决策。"],
        ["隐私", "仅记录字段定义与编码；不导出姓名、完整手机号、原始ID、音视频。"],
        ["缺失", "默认用NA表示未记录/不可计算；不对原始trial进行数值插补。聚合指标在分母为0或必要原始量缺失时为NA。"],
        ["分组", "默认比较字段为hr_group3：运动员、非运动员高心率、非运动员低心率。生理缺失不反向删除行为数据。"],
        ["p值", "统计输出默认保留原始p值及全部结果；图中应标注对应p值。"],
    ], columns=["主题", "说明"])
    readme.to_csv(OUT / "README.csv", index=False, encoding="utf-8-sig")
    xlsx = write_excel(book_df, code_df, sources_df, readme)
    manifest = {
        "created": "2026-07-29",
        "paradigms": ["MOT/DRT", "SART", "BELT", "反向Corsi", "Flanker", "足球决策"],
        "codebook_rows": int(len(book_df)),
        "codelist_rows": int(len(code_df)),
        "privacy": "metadata only; no participant values exported",
        "workbook": str(xlsx),
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
