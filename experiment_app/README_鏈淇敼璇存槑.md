# 本次修改说明（2026-06-04）

## 1. SART
- 正式阶段改为每次 30 trial。
- 主控台仍然在融合流程中运行 SART pre 与 SART post，因此总计为 pre 30 + post 30。
- SART 固定序列在 `paradigms/sart-jspsych/sart_sequence.js`：
  - formal：Go 24 / No-Go 6；No-Go 数字 = 3。
  - left / center / right 各 10。
  - white / yellow 各 15。
  - No-Go 分布在第 5、10、15、20、25、30 trial。
- 指导语恢复原来的图片调用：
  - `./instructions/sart_rule1.png`
  - `./instructions/sart_rule2.png`
  - `./instructions/sart_rule3.png`
- 数据字段继续使用新版字段名，例如：
  - `trial_type`
  - `response_made`
  - `stimulus_position`
  - `stimulus_color`
  - `popout_type`
  - `response_phase`
  - `mask_onset_ts`
  - `mask_offset_ts`
  - `probe_score`

## 2. 主控台
- 主控台脚本从 `index.html` 拆出到 `main_controller.js`。
- 主控台继续通过 URL 参数传入：
  - `block`
  - `sid`
  - `session`
  - `parent_mode=1`
- 继续支持 SART 输出的额外 `summary.json` 文件。

## 3. 所有范式三文件结构
已把所有范式都整理为类似 SART 的三文件形式：

- `BART-jspsych/index b.html` + `bart_sequence.js` + `bart.js`
- `corsi-jspsych/index c.html` + `corsi_sequence.js` + `corsi.js`
- `flanker-jspsych/index f.html` + `flanker_sequence.js` + `flanker.js`
- `mot-jspsych/index m.html` + `mot_sequence.js` + `mot.js`
- `sart-jspsych/index sa.html` + `sart_sequence.js` + `sart.js`
- `soccer-jspsych/index s.html` + `soccer_sequence.js` + `soccer.js`

其中非 SART 范式的 trial 生成/随机化逻辑目前仍保留在各自的主逻辑 JS 中；`*_sequence.js` 作为统一结构入口和后续固定序列迁移位置，没有改动原图片、视频、素材路径。

## 4. allocations
- 已删除旧的 `allocations.json` 记录。
- `sever.js` 已增强：当 `allocations.json` 不存在、为空或损坏时，会自动重新生成新的 200 个分配名额。

## 5. 已做的基础检查
- 所有拆分出的 JS 文件均通过 `node --check` 语法检查。
- 本地服务已测试：`index.html`、SART 页面、SART sequence 文件可以正常返回。
- `/api/allocate` 已测试可以在没有 `allocations.json` 的情况下自动生成新发号表。

## 6. 仍建议人工实机检查
- 用 Chrome 从主控台完整走一遍：登录/设备检测 → 单任务 → 融合流程。
- 尤其检查足球视频素材路径、SART pre/post 输出、最终 zip 文件中的 CSV 与 summary JSON。


## 6. 2026-06-04 v4 继续修改
- 除“范式完成后自动服务器保存 CSV”和“姓名/电话隐私逻辑”外，其余问题已处理。
- 已移除所有旧的 旧远程单题上传地址 单题上传调用；旧函数名保留，但只给记录补 `subject_id / absolute_time / paradigm`，不再联网。
- 非 SART 范式的 `*_sequence.js` 已从占位文件改为真实配置/序列文件：Corsi、MOT、BELT/BART、Flanker、Soccer 均已抽出序列或题库/生成逻辑。
- 已清空 `paradigms/flanker-jspsych/data/` 下历史测试 CSV。
- 已加入 HTTPS 启动支持：如果 `certs/dev-key.pem` 和 `certs/dev-cert.pem` 存在，`node sever.js` 会同时启动 `https://localhost:3443` 与局域网 HTTPS 地址。
- 已修复 `#Uxxxx` 转义导致的中文文件/文件夹名问题，确保足球任务与 Flanker 箭头图片等中文路径能按代码调用。
