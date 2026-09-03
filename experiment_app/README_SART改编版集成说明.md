# experiment 工程修改说明：SART 改编版 60 trial 集成

修改日期：2026-06-04

## 1. 已修改文件

### 主控台
- `index.html`
  - 修正 iframe 启动路径：所有范式路径统一改为 `paradigms/...`，避免从根目录找不到范式文件。
  - `executeLaunch()` 新增 `buildTaskUrl()`：启动范式时自动传入：
    - `block`：pre/post 或阶段编号
    - `sid`：主控台生成的被试 ID
    - `session`：中心发号 allocation_index
    - `parent_mode=1`：告诉范式在 iframe 内运行，结束后回传主控台
  - 支持范式额外回传 `files`，用于保存 SART 的 summary JSON。
  - metadata 行的逗号数改成根据 CSV 列数自动计算，不再固定 22 列。
  - `#experiment-container` 背景改为黑色，避免 SART/MOT 等黑底范式加载时出现白闪；具体页面样式仍由每个范式自己控制。

### SART 范式
- `paradigms/sart-jspsych/index sa.html`
  - 改为范式自己的 HTML 壳与样式文件，主控台不负责 SART 内部样式。
  - 引入 `sart_sequence.js` 和 `sart.js`。
- `paradigms/sart-jspsych/sart_sequence.js`
  - 新增固定共用序列。
  - 练习 12 trial，正式 60 trial。
  - 正式：Go 48 / No-Go 12；位置 left/center/right 各 20；颜色 white/yellow 各 30。
- `paradigms/sart-jspsych/sart.js`
  - 改成 SART 改编版：三位置 + 黄色 popout + 1250ms 数字 + 900ms 中央 encircled-x mask。
  - 底部灰色点击按钮独立记录 pointerdown RT。
  - 反应窗覆盖数字阶段和 mask 阶段，记录 `response_phase`。
  - 练习通过标准：Go≥7 且 No-Go≥2；最多 2 次练习。
  - 正式结束后 1 个 1-9 专注度评分。
  - 回传主控台：trial-level CSV + summary JSON。

### 服务端
- `sever.js`
  - 新增 `/api/save`，用于范式需要时写本地备份。
  - 补充 MIME 类型：`.mp4`, `.webp`, `.jpg`, `.jpeg`, `.svg`, `.mp3`, `.wav`, `.docx` 等。
  - 增加路径安全检查，避免 `../` 路径逃逸。
  - 发号说明从旧的 `Stroop -> N-back` 改为当前融合流程：
    - A卷：pre SART→Soccer；post Soccer→SART
    - B卷：pre Soccer→SART；post SART→Soccer
- `allocations.json`
  - 已把已有记录的 `order_description` 文字同步成当前流程说明，不改变 used / subject_id / allocation_index。

### package
- `package.json`
  - 新增 `npm start`：等价于 `node sever.js`。

## 2. 当前 SART 输出字段

SART CSV 现在包含：

- 被试与阶段：`subject_id`, `session`, `block_mode`, `block_type`, `block_number`
- trial 信息：`global_trial_index`, `trial_index`, `digit`, `trial_type`
- 反应与准确性：`response_made`, `reaction_time_ms`, `rt_ms`, `accuracy`, `error_type`
- 触屏/点击行为：`rt_hold`, `drift_max`, `drift_path`, `drift_end`, `tap_count`, `input_type`
- 改编版新增刺激字段：`stimulus_position`, `stimulus_x_ratio`, `stimulus_y_ratio`, `previous_position`, `position_transition`, `position_switch_type`, `stimulus_color`, `popout_type`, `mask_onset_ts`, `mask_offset_ts`, `response_phase`
- 结束评分：`probe_score`
- 序列版本：`sequence_version`

SART 还会额外回传一个 summary JSON，最终打包时会进入主控台导出的 zip。

## 3. 运行方式

```bash
cd experiment
npm install
npm start
# 或 node sever.js
```

浏览器打开：

```text
http://localhost:3000
```

单独测试 SART 页面：

```text
http://localhost:3000/paradigms/sart-jspsych/index%20sa.html?sid=TEST001&block=pre&parent_mode=0
```

## 4. 还需要你/开发同学确认的部分

1. **SART 指导语图片是否继续使用**  
   我这版为了不依赖额外图片，改成了 HTML 卡片式指导语。如果你们一定要沿用 `instructions/sart_rule1.png` 等图片，可以再把图片嵌回 `index sa.html` 的指导语页面。

2. **正式实验是否要保留 SART 前测 + 后测各 60 trial**  
   当前主控台沿用原逻辑：融合流程里有 SART pre 和 SART post，所以一个被试完整融合流程会做两次 SART，每次正式 60 trial。

3. **是否要完全删除旧 SART 指导语图片**  
   现在没有删，保留在 `paradigms/sart-jspsych/instructions/`，防止你们后续还想用。

4. **已有 allocations 是否继续沿用**  
   我没有清空 `allocations.json`，只是把顺序说明文字改成当前 SART/Soccer 流程。如果你们正式开新一批，建议先备份旧 `allocations.json`，再删除它，让服务器重新生成全新的 200 个发号位。

5. **视频采集权限**  
   主控台仍然会录制每个 iframe 范式的视频。如果正式测试设备对摄像头/麦克风权限比较严格，需要先用 Chrome 打开 `http://localhost:3000`，不要直接双击 HTML。

6. **旧数据字段兼容**  
   新 SART 字段比旧版多很多。如果你后续有 R/Python 清洗脚本，需要把字段名从旧的 `is_nogo/responded/position/color` 口径，改成现在的 `trial_type/response_made/stimulus_position/stimulus_color/popout_type/response_phase` 口径。
