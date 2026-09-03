/**
 * SART (Sustained Attention to Response Task) - Web Battery
 * --------------------------------------------------
 * 改编版 60-trial SART (Robertson et al. 1997 + Bedi et al. 2023 mask)。
 *
 * Design:
 *   Digits 1-9, Go/No-Go  (No-Go digit = 3)
 *   Single grey "tap" button at bottom
 *   刺激三位置 left/center/right + 颜色 popout white/yellow, 全被试共用固定序列
 *   Practice: 12 trials (9 go + 3 nogo), 固定序列 (修正版)
 *     Pass: >= 7 go correct AND >= 2 nogo correct, max 2 attempts
 *   Formal: 每次 30 trials。
 *           block=pre  读取原 60 trial 第 1–30 题；
 *           block=post 读取原 60 trial 第 31–60 题；
 *           顺序完全沿用原 60 trial，不重新洗牌。
 *   Followed by 1 attention probe (1-9)
 *   Timing: fixation 500ms -> digit 1250ms。取消 mask。
 *   反应窗仅覆盖 digit 阶段; response_phase = digit/none
 *   SDT metrics: d', A', criterion c + 分位置/分颜色指标
 */

/* ================================================================
   Configuration
   ================================================================ */

const CONFIG = {
  nogoDigit: 3,
  timing: {
    fixationDuration: 500,    /* 每题前中央注视点 */
    stimulusDuration: 1250,   /* 数字呈现，反应窗仅覆盖数字阶段 */
    maskDuration: 0,          /* 已取消 mask */
    trialDuration: 1250,      /* 数字呈现时长 */
    feedbackDuration: 800,    /* 练习正确反馈时长 (错误用 2000ms, 见块7) */
  },
  /* RT 有效区间: 上界 = 数字反应窗 1250ms。已取消 mask 反应阶段。 */
  rtValidRange: [150, 1250],
  /* 水平三位置比例 (x), y 统一居中。供 record 的 x/y_ratio 与 CSS 注入, 不硬编码。 */
  positions: { left: 0.25, center: 0.50, right: 0.75 },
  yRatio: 0.50,
  practice: {
    totalTrials: 12,
    goTrials: 9,
    nogoTrials: 3,
    goMinCorrect: 7,
    nogoMinCorrect: 2,
    maxAttempts: 2,
  },
  formal: {
    totalTrials: 30,        /* 每次 SART 正式 30 trial */
    goTrialsN: 24,
    nogoTrialsN: 6,
    repetitions: 3,
    blocks: 1,              /* pre/post 各 30 trial */
  },
};

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const GO_DIGITS = DIGITS.filter(function (d) { return d !== CONFIG.nogoDigit; });

/* ================================================================
   Checkpoint (incremental save) — inline since not using ES modules
   ================================================================ */

var _ckpt = (function () {
  var saving = false, lastTime = 0, pending = false;
  var paradigm = '', sid = '', getData = null;
  var MIN = 5000;

  function doSave() {
    if (saving) { pending = true; return; }
    var csv = getData(); if (!csv) return;
    saving = true; lastTime = Date.now();
    var lsKey = 'checkpoint_' + paradigm + '_' + sid;
    var fname = paradigm + '_' + sid + '_checkpoint.csv';
    try { localStorage.setItem(lsKey, csv); } catch (e) { /* ignore */ }
    fetch(window.location.origin + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paradigm: paradigm, subject_id: sid, filename: fname, content: csv }),
    }).catch(function () {
      console.debug('[Checkpoint] ' + paradigm + ' server save failed, localStorage backup exists');
    }).then(function () {
      saving = false;
      if (pending) { pending = false; doSave(); }
    });
  }

  return {
    init: function (p, subjectId, getDataFn) { paradigm = p; sid = subjectId; getData = getDataFn; },
    save: function () {
      var elapsed = Date.now() - lastTime;
      if (elapsed < MIN) {
        if (!pending) {
          pending = true;
          setTimeout(function () { if (pending) { pending = false; doSave(); } }, MIN - elapsed);
        }
        return;
      }
      doSave();
    },
    forceSave: function () { doSave(); },
    clear: function () {
      try { localStorage.removeItem('checkpoint_' + paradigm + '_' + sid); } catch (e) { /* ignore */ }
    },
  };
})();

/* ================================================================
   URL Params & Utils
   ================================================================ */

function getUrlParams() {
  var p = new URLSearchParams(window.location.search);
  return {
    subjectId: p.get('sid') || '',
    session: p.get('session') || 'S001',
    block: (p.get('block') || p.get('phase') || p.get('block_mode') || 'pre').toLowerCase(),
    attemptId: p.get('attempt_id') || '',
    resumeTrialIndex: Math.max(1, parseInt(p.get('resume_trial_index') || '1', 10) || 1)
  };
}

function timestamp() {
  var d = new Date();
  var pad = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function shuffleArray(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

/* ================================================================
   Sequence Generation
   ================================================================ */

/*
   固定共用序列读自 sart_sequence.js。
   现在不重新洗牌、不重新生成，而是简单拆分原 60 trial：
   - block=pre  / block=1 / block=first 读取原 60 trial 的第 1–30 题
   - block=post / block=2 / block=second 读取原 60 trial 的第 31–60 题

   post 阶段 trial_index 显示为 1–30；
   source_trial_index 保留原 60 trial 里的真实编号 31–60。
*/

function _cloneSeq(arr) {
  return arr.map(function (t) {
    return {
      trial_index: t.trial_index,
      source_trial_index: t.source_trial_index || t.trial_index,
      digit: t.digit,
      trial_type: t.trial_type,
      position: t.position,
      color: t.color,
      popout_type: t.popout_type,
    };
  });
}

function getSartFormalBlockMode() {
  var b = (urlParams.block || 'pre').toLowerCase();

  if (
    b === 'post' ||
    b === '2' ||
    b === 'second' ||
    b === 'formal_post' ||
    b === 'sart_post'
  ) {
    return 'post';
  }

  return 'pre';
}

function getFormalSequence() {
  if (typeof SART_SEQUENCE === 'undefined') {
    throw new Error('[SART] sart_sequence.js 未加载: window.SART_SEQUENCE 缺失');
  }

  var mode = getSartFormalBlockMode();

  if (mode === 'post') {
    if (!SART_SEQUENCE.formal_post) {
      throw new Error('[SART] sart_sequence.js 未加载: window.SART_SEQUENCE.formal_post 缺失');
    }
    return _cloneSeq(SART_SEQUENCE.formal_post);
  }

  if (!SART_SEQUENCE.formal_pre) {
    throw new Error('[SART] sart_sequence.js 未加载: window.SART_SEQUENCE.formal_pre 缺失');
  }

  return _cloneSeq(SART_SEQUENCE.formal_pre);
}

function getPracticeSequence() {
  if (typeof SART_SEQUENCE === 'undefined' || !SART_SEQUENCE.practice) {
    throw new Error('[SART] sart_sequence.js 未加载: window.SART_SEQUENCE.practice 缺失');
  }
  return _cloneSeq(SART_SEQUENCE.practice);
}

function validateSequences() {
  var problems = [];

  function count(arr, key) {
    return arr.reduce(function (m, t) {
      m[t[key]] = (m[t[key]] || 0) + 1;
      return m;
    }, {});
  }

  function audit(seq, label, expected) {
    var go = seq.filter(function (t) { return t.trial_type === 'go'; });
    var nogo = seq.filter(function (t) { return t.trial_type === 'nogo'; });

    if (seq.length !== expected.total) {
      problems.push(label + ': total=' + seq.length + ' 期望 ' + expected.total);
    }

    if (go.length !== expected.go || nogo.length !== expected.nogo) {
      problems.push(label + ': Go/NoGo=' + go.length + '/' + nogo.length + ' 期望 ' + expected.go + '/' + expected.nogo);
    }

    if (
      !nogo.every(function (t) { return t.digit === CONFIG.nogoDigit; }) ||
      !go.every(function (t) { return t.digit !== CONFIG.nogoDigit; })
    ) {
      problems.push(label + ': digit3<=>nogo 不成立');
    }

    var pos = count(seq, 'position');
    if (
      pos.left !== expected.position.left ||
      pos.center !== expected.position.center ||
      pos.right !== expected.position.right
    ) {
      problems.push(label + ': 位置不均 ' + JSON.stringify(pos) + ' 期望 ' + JSON.stringify(expected.position));
    }

    var col = count(seq, 'color');
    if (
      col.white !== expected.color.white ||
      col.yellow !== expected.color.yellow
    ) {
      problems.push(label + ': 颜色数量不符 ' + JSON.stringify(col) + ' 期望 ' + JSON.stringify(expected.color));
    }

    for (var i = 1; i < seq.length; i++) {
      if (seq[i].position === seq[i - 1].position) {
        problems.push(label + ': 相邻同位置 @' + (i + 1));
        break;
      }
    }

    for (var j = 1; j < seq.length; j++) {
      if (seq[j].trial_type === 'nogo' && seq[j - 1].trial_type === 'nogo') {
        problems.push(label + ': 相邻NoGo @' + (j + 1));
        break;
      }
    }

    seq.forEach(function (t) {
      var exp = t.color === 'white'
        ? 'none'
        : (t.trial_type === 'nogo' ? 'target_pop' : 'distractor_pop');

      if (t.popout_type !== exp) {
        problems.push(label + ': popout 不一致 @' + t.trial_index);
      }
    });
  }

  try {
    audit(SART_SEQUENCE.formal_pre, 'formal_pre', {
      total: 30,
      go: 24,
      nogo: 6,
      position: { left: 10, center: 10, right: 10 },
      color: { white: 17, yellow: 13 }
    });

    audit(SART_SEQUENCE.formal_post, 'formal_post', {
      total: 30,
      go: 24,
      nogo: 6,
      position: { left: 10, center: 10, right: 10 },
      color: { white: 13, yellow: 17 }
    });

    audit(getPracticeSequence(), 'practice', {
      total: 12,
      go: 9,
      nogo: 3,
      position: { left: 4, center: 4, right: 4 },
      color: { white: 6, yellow: 6 }
    });
  } catch (e) {
    problems.push(String(e));
  }

  if (problems.length) {
    console.error('[SART] 序列校验失败:\n' + problems.join('\n'));
  } else {
    console.debug('[SART] 序列校验通过：pre=原60第1–30，post=原60第31–60');
  }

  return problems;
}
validateSequences();

/* ================================================================
   Data Collection
   ================================================================ */

var trialRecords = [];
var probeRecords = [];
var urlParams = getUrlParams();
var subjectId = urlParams.subjectId || 'TEST_' + Date.now();
var globalTrialIndex = 0;
var SART_RESUME_KEY = 'sart_resume_' + subjectId + '_' + (urlParams.attemptId || '') + '_' + getSartFormalBlockMode();

if (urlParams.resumeTrialIndex > 1) {
  try {
    var _sartCached = JSON.parse(localStorage.getItem(SART_RESUME_KEY) || '{}');
    if (Array.isArray(_sartCached.trialRecords)) trialRecords = _sartCached.trialRecords;
    if (Array.isArray(_sartCached.probeRecords)) probeRecords = _sartCached.probeRecords;
    globalTrialIndex = trialRecords.length;
  } catch (e) {}
}

function sendParentCheckpoint(trialIndex) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'PARADIGM_CHECKPOINT',
        paradigm: 'SART',
        block: getSartFormalBlockMode(),
        attempt_id: urlParams.attemptId || '',
        trial_index: Math.max(1, trialIndex || 1),
        resume_trial_index: Math.max(1, trialIndex || 1)
      }, '*');
    }
  } catch (e) {}
}

/* Initialize checkpoint — uses generateCSV (defined below) via lazy reference */
_ckpt.init('sart', subjectId, function () { return generateCSV(); });

function recordSARTTrial(trialInfo, blockType, responseMade, rt) {
  globalTrialIndex++;
  var isNogo = trialInfo.trial_type === 'nogo';
  var accuracy = isNogo ? (responseMade ? 0 : 1) : (responseMade ? 1 : 0);

  var errorType = '';
  if (isNogo && responseMade) errorType = 'commission';
  else if (!isNogo && !responseMade) errorType = 'omission';

  var phase = blockType.indexOf('practice') === 0 ? 'practice' : 'formal';
  var blockNumber = 0;
  var match = blockType.match(/(\d+)/);
  if (match) blockNumber = parseInt(match[1]);

  /* 位置维度: 每个 block_type 起点把 previous_position 重置为 null
     (practice/formal 各自独立, 不产生跨阶段 transition)。 */
  if (blockType !== _sartPrevBlockType) {
    _sartPrevPosition = null;
    _sartPrevBlockType = blockType;
  }
  var curPos = trialInfo.position;
  var prevPos = _sartPrevPosition;
  var posTransition = prevPos === null ? '' : (prevPos + '_to_' + curPos);
  var switchType;
  if (prevPos === null) switchType = 'start';
  else if (prevPos === curPos) switchType = 'same';
  else if ((prevPos === 'left' && curPos === 'right') || (prevPos === 'right' && curPos === 'left')) switchType = 'far';
  else switchType = 'near';   /* 任意一端是 center 的相邻切换 */

  /* response_phase: 已取消 mask，反应窗仅覆盖数字阶段 */
  var responsePhase;
  if (!responseMade || rt === null) responsePhase = 'none';
  else responsePhase = 'digit';

  var record = {
    subject_id: subjectId,
    global_trial_index: globalTrialIndex,
    block_type: blockType,
    block_number: blockNumber,
    trial_index: trialInfo.trial_index,
    source_trial_index: trialInfo.source_trial_index || trialInfo.trial_index,
    sart_block_mode: getSartFormalBlockMode(),
    digit: trialInfo.digit,
    trial_type: trialInfo.trial_type,
    response_made: responseMade ? 1 : 0,
    reaction_time_ms: rt !== null ? Math.round(rt * 10) / 10 : '',
    rt_ms: rt !== null ? Math.round(rt) : '',
    accuracy: accuracy,
    error_type: errorType,
    phase: phase,
    timestamp: new Date().toISOString(),
    rt_hold: _sartHoldDuration !== null ? _sartHoldDuration : '',
    drift_max: _sartStartX !== null ? Math.round(Math.sqrt(_sartDriftMaxSq)) : '',
    drift_path: _sartStartX !== null ? Math.round(_sartDriftPath) : '',
    drift_end: _sartDriftEnd || '',
    tap_count: _sartTapCount,
    input_type: _sartInputType || '',
    /* --- 60-trial 改版新增 11 字段 (开发文档0603 §4.1) --- */
    stimulus_position: curPos,
    stimulus_x_ratio: CONFIG.positions[curPos],
    stimulus_y_ratio: CONFIG.yRatio,
    previous_position: prevPos === null ? '' : prevPos,
    position_transition: posTransition,
    position_switch_type: switchType,
    stimulus_color: trialInfo.color,
    popout_type: trialInfo.popout_type,
    mask_onset_ts: _sartMaskOnsetTs !== null ? _sartMaskOnsetTs : '',
    mask_offset_ts: _sartMaskOffsetTs !== null ? _sartMaskOffsetTs : '',
    response_phase: responsePhase,
    attention_rating: '',
    probe_score: '',
  };
  _sartPrevPosition = curPos;
  trialRecords.push(record);
  try { localStorage.setItem(SART_RESUME_KEY, JSON.stringify({ trialRecords: trialRecords, probeRecords: probeRecords })); } catch (e) {}
  if (phase === 'formal') sendParentCheckpoint((trialInfo.trial_index || 1) + 1);
  return record;
}

function recordProbe(blockIndex, rating) {
  var mode = getSartFormalBlockMode();

  probeRecords.push({
    block_index: blockIndex,
    sart_block_mode: mode,
    attention_rating: rating,
    probe_score: rating,
    probe_ts: new Date().toISOString(),
  });

  trialRecords
    .filter(function (r) {
      return r.phase === 'formal' && r.sart_block_mode === mode;
    })
    .forEach(function (r) {
      r.attention_rating = rating;
      r.probe_score = rating;
    });
}

/* ================================================================
   SDT Computation
   ================================================================ */

function probit(p) {
  if (p <= 0) return -5;
  if (p >= 1) return 5;
  if (p < 0.5) return -probit(1 - p);
  var t = Math.sqrt(-2 * Math.log(1 - p));
  return t - (2.515517 + 0.802853 * t + 0.010328 * t * t) / (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
}

function computeSDT() {
  var formalTrials = trialRecords.filter(function (t) { return t.phase === 'formal'; });
  if (formalTrials.length === 0) return {};

  var go = formalTrials.filter(function (t) { return t.trial_type === 'go'; });
  var nogo = formalTrials.filter(function (t) { return t.trial_type === 'nogo'; });
  var goCorrect = go.filter(function (t) { return t.accuracy === 1; }).length;
  var nogoCorrect = nogo.filter(function (t) { return t.accuracy === 1; }).length;
  var commissionN = nogo.filter(function (t) { return t.error_type === 'commission'; }).length;
  var omissionN = go.filter(function (t) { return t.error_type === 'omission'; }).length;

  var goAcc = go.length > 0 ? goCorrect / go.length : 0;
  var nogoAcc = nogo.length > 0 ? nogoCorrect / nogo.length : 0;
  var commissionRate = nogo.length > 0 ? commissionN / nogo.length : 0;

  var overallAcc = formalTrials.length > 0 ? (goCorrect + nogoCorrect) / formalTrials.length : 0;
  var omissionRate = go.length > 0 ? omissionN / go.length : 0;

  /* RT filtering: 绝对阈值 = CONFIG.rtValidRange (150-2150, 方案甲), 再做 ±3SD 剔除。
     上界 2150 = 反应窗, 与 mask_phase 指标口径一致; 不再硬编码 150/2000 (高优先级修复)。 */
  var rtLo = CONFIG.rtValidRange[0], rtHi = CONFIG.rtValidRange[1];
  var goRTs = go.filter(function (t) {
    return t.accuracy === 1 && t.reaction_time_ms !== '' && t.reaction_time_ms >= rtLo && t.reaction_time_ms <= rtHi;
  }).map(function (t) { return t.reaction_time_ms; });

  var goRTMean = goRTs.length > 0 ? goRTs.reduce(function (a, b) { return a + b; }, 0) / goRTs.length : 0;
  var goRTSD = 0;
  if (goRTs.length > 1) {
    goRTSD = Math.sqrt(goRTs.reduce(function (s, v) { return s + (v - goRTMean) * (v - goRTMean); }, 0) / (goRTs.length - 1));
  }

  /* 3-SD outlier removal (matching PsychoPy version) */
  var rtExcludedRel = 0;
  if (goRTs.length >= 3 && goRTSD > 0) {
    var cleanRTs = goRTs.filter(function (rt) {
      return Math.abs(rt - goRTMean) <= 3 * goRTSD;
    });
    rtExcludedRel = goRTs.length - cleanRTs.length;
    goRTs = cleanRTs;
    goRTMean = goRTs.length > 0 ? goRTs.reduce(function (a, b) { return a + b; }, 0) / goRTs.length : 0;
    if (goRTs.length > 1) {
      goRTSD = Math.sqrt(goRTs.reduce(function (s, v) { return s + (v - goRTMean) * (v - goRTMean); }, 0) / (goRTs.length - 1));
    }
  }

  var goRTCoV = goRTMean > 0 ? goRTSD / goRTMean : 0;

  var hitRate = goAcc;
  var faRate = commissionRate;
  if (go.length > 0) hitRate = Math.max(0.5 / go.length, Math.min(1 - 0.5 / go.length, hitRate));
  if (nogo.length > 0) faRate = Math.max(0.5 / nogo.length, Math.min(1 - 0.5 / nogo.length, faRate));

  var zHit = probit(hitRate);
  var zFA = probit(faRate);
  var dPrime = Math.round((zHit - zFA) * 10000) / 10000;
  var criterionC = Math.round(-0.5 * (zHit + zFA) * 10000) / 10000;

  var aPrime = 0.5;
  if (hitRate !== faRate) {
    if (hitRate >= faRate) {
      aPrime = 0.5 + ((hitRate - faRate) * (1 + hitRate - faRate)) / (4 * hitRate * (1 - faRate));
    } else {
      aPrime = 0.5 - ((faRate - hitRate) * (1 + faRate - hitRate)) / (4 * faRate * (1 - hitRate));
    }
  }
  aPrime = Math.round(aPrime * 10000) / 10000;

  /* Skill Index = (nogo_accuracy / go_rt_mean) * 1000 */
  var skillIndex = goRTMean > 0 ? nogoAcc / goRTMean * 1000 : 0;

  /* ---- 分组指标 (60-trial 改版, 仅 formal 子集; 每组 length=0 返回 0 防除零) ---- */
  function goRtMeanFor(pred) {
    var rts = go.filter(function (t) {
      return pred(t) && t.accuracy === 1 && t.reaction_time_ms !== '' && t.reaction_time_ms >= rtLo && t.reaction_time_ms <= rtHi;
    }).map(function (t) { return t.reaction_time_ms; });
    if (rts.length === 0) return 0;
    return Math.round((rts.reduce(function (a, b) { return a + b; }, 0) / rts.length) * 100) / 100;
  }
  function goAccFor(pred) {
    var sub = go.filter(pred);
    if (sub.length === 0) return 0;
    return Math.round((sub.filter(function (t) { return t.accuracy === 1; }).length / sub.length) * 10000) / 10000;
  }
  function commRateFor(pred) {
    var sub = nogo.filter(pred);
    if (sub.length === 0) return 0;
    return Math.round((sub.filter(function (t) { return t.error_type === 'commission'; }).length / sub.length) * 10000) / 10000;
  }
  function byPos(fn) {
    return {
      left: fn(function (t) { return t.stimulus_position === 'left'; }),
      center: fn(function (t) { return t.stimulus_position === 'center'; }),
      right: fn(function (t) { return t.stimulus_position === 'right'; }),
    };
  }
  var goRtMeanByPosition = byPos(goRtMeanFor);
  var goAccByPosition = byPos(goAccFor);
  var commissionRateByPosition = byPos(commRateFor);
  var goRtMeanByColor = {
    white: goRtMeanFor(function (t) { return t.stimulus_color === 'white'; }),
    yellow: goRtMeanFor(function (t) { return t.stimulus_color === 'yellow'; }),
  };
  var commissionRateByNogoColor = {
    white: commRateFor(function (t) { return t.stimulus_color === 'white'; }),
    yellow: commRateFor(function (t) { return t.stimulus_color === 'yellow'; }),
  };
  /* mask_phase_response_rate: 所有 formal trial 中, 反应落在 mask 阶段(1250-2150ms)的比例 */
  var maskPhaseN = formalTrials.filter(function (t) { return t.response_phase === 'mask'; }).length;
  var maskPhaseResponseRate = formalTrials.length > 0 ? Math.round((maskPhaseN / formalTrials.length) * 10000) / 10000 : 0;

  return {
    total_trials: formalTrials.length,
    go_trials_n: go.length,
    nogo_trials_n: nogo.length,
    go_accuracy: Math.round(goAcc * 10000) / 10000,
    nogo_accuracy: Math.round(nogoAcc * 10000) / 10000,
    overall_accuracy: Math.round(overallAcc * 10000) / 10000,
    commission_errors: commissionN,
    commission_error_rate: Math.round(commissionRate * 10000) / 10000,
    omission_errors: omissionN,
    omission_error_rate: Math.round(omissionRate * 10000) / 10000,
    go_rt_mean: Math.round(goRTMean * 100) / 100,
    go_rt_sd: Math.round(goRTSD * 100) / 100,
    go_rt_cov: Math.round(goRTCoV * 10000) / 10000,
    d_prime: dPrime,
    criterion_c: criterionC,
    a_prime: aPrime,
    skill_index: Math.round(skillIndex * 10000) / 10000,
    rt_excluded_3sd: rtExcludedRel,
    /* --- 60-trial 改版分组指标 (开发文档0603 §4.4) --- */
    go_rt_mean_by_position: goRtMeanByPosition,
    go_accuracy_by_position: goAccByPosition,
    commission_rate_by_position: commissionRateByPosition,
    go_rt_mean_by_color: goRtMeanByColor,
    commission_rate_by_nogo_color: commissionRateByNogoColor,
    mask_phase_response_rate: maskPhaseResponseRate,
  };
}

/* ================================================================
   README (vault per-paradigm 子目录字段说明)
   ================================================================ */

function _buildSartReadme(sid, ts) {
  return `SART 持续注意 (Sustained Attention to Response Task) 范式数据说明
================================================================

被试 ${sid} 的持续性注意 / 反应抑制 (response inhibition) 评估。
范式参考: Robertson et al. (1997) "Oops!" SART; 浙大老年范式综合 SART
           (PDF 4.1 节字段标准)。

被试任务
--------
屏幕呈现数字 1-9, 出现在左/中/右三个水平位置之一, 颜色为白或黄。
被试看到 **3 以外的数字按按钮** (Go), 看到 **3 时不要按** (NoGo)。
每题先呈现中央注视点 500ms，然后呈现数字 1250ms。已取消 mask。
看的是抑制 prepotent response 的能力。
练习 12 题 (Go9/NoGo3) + 每次正式 30 题 (Go 24 / NoGo 6)。pre 为原 60 题第 1–30，post 为原 60 题第 31–60。
全被试共用同一份固定伪随机序列 (非随机生成)。
NoGo 数字: 3。颜色/位置为实验操纵, 被试不被告知颜色含义。

文件清单
--------
1. SART_${sid}_${ts}.csv
   trial 行为数据 (每个 trial 一行)。

2. SART_${sid}_${ts}_summary.json
   SDT 指标 (d', β, criterion C, omission/commission rate) +
   probe 数据 (1-9 注意力自评)。分析时通常直接看这个。

3. sart_${ts}_video.mp4
   全程摄像头录像 1080p / 30fps。

4. ${sid}_sart_${ts}_events.csv
   事件流双时间戳 (stimulus_onset / response 等),给后期 ffmpeg
   视频对齐用,详见父目录 _README.txt。

5. README.txt (本文件)

6. _emergency_checkpoint_<时间戳>.csv (只在中途退出时出现)

字段说明 (SART_*.csv) — 31 字段
------------------------------

**核心字段**:

subject_id        被试编号
block_type        block 类型 (practice1 / practice2 / formal_block1)
trial_index       trial 序号 (per-block 重置)
digit             刺激数字 1-9 (3 是 NoGo)
trial_type        'go' / 'nogo'
response_made     0/1 — 被试是否按了按钮
reaction_time_ms  反应时毫秒 (从数字出现到 pointerdown; 反应窗 1250ms，仅数字阶段)
accuracy          0/1 — Go 按 + NoGo 不按 = 1
error_type        'omission' (Go 没按) / 'commission' (NoGo 按了) / '' (正确)
phase             'practice' / 'formal'
timestamp         trial 时刻 (本地时区 ISO)

**辅助字段 (web 系统 / 触屏特性)**:

global_trial_index  全局 trial 序号 (practice + formal 累计)
block_number        block 索引 (formal 默认 1 个 block)
rt_ms               = reaction_time_ms 取整 (列名兼容)

触屏行为:
rt_hold             按住时长 (ms)
drift_max           按压期间最大滑动距离 (px)
drift_path          按压轨迹累积长度 (px)
drift_end           释放距按下位置 (px)
tap_count           本 trial 用户点击次数
input_type          'touch' / 'mouse' / 'pen'

**60-trial 改版新增 11 字段 (位置 / 颜色 / mask)**:

stimulus_position    数字位置 'left' / 'center' / 'right'
stimulus_x_ratio     水平位置比例 (left 0.35 / center 0.50 / right 0.65)
stimulus_y_ratio     垂直位置比例 (0.50)
previous_position    上一 trial 位置 (每个 block 起点为空)
position_transition  位置切换, 如 'center_to_left' (block 首为空)
position_switch_type 'start' / 'same' / 'near' (含 center 相邻) / 'far' (左右互换)
stimulus_color       'white' / 'yellow' (黄色为 popout 操纵)
popout_type          'none' / 'target_pop' (NoGo 变黄) / 'distractor_pop' (Go 变黄)
mask_onset_ts        已取消 mask，保留空列兼容旧清洗脚本
mask_offset_ts       已取消 mask，保留空列兼容旧清洗脚本
response_phase       'digit' / 'none' (已取消 mask)

**事件时间戳在 events.csv**:
stimulus_onset / mask_onset / mask_offset / response → 后期 ffmpeg 视频对齐

字段说明 (SART_*_summary.json)
------------------------------
{
  participant: { subject_id },
  behavioral_metrics: {             // 仅基于当前正式 30 trial (phase==='formal')
    total_trials, go_trials_n, nogo_trials_n,
    go_accuracy, nogo_accuracy, overall_accuracy,
    commission_errors, commission_error_rate,
    omission_errors, omission_error_rate,
    go_rt_mean, go_rt_sd, go_rt_cov,
    d_prime, criterion_c, a_prime,  // 信号检测论 (核心 MCI 敏感指标)
    skill_index, rt_excluded_3sd,
    // 60-trial 改版分组指标:
    go_rt_mean_by_position: { left, center, right },
    go_accuracy_by_position: { left, center, right },
    commission_rate_by_position: { left, center, right },
    go_rt_mean_by_color: { white, yellow },
    commission_rate_by_nogo_color: { white, yellow },
    mask_phase_response_rate        // 已取消 mask，固定为 0
  },
  probes: [                         // 注意力自评 (1-9 Likert, 正式后 1 次)
    { block_index, attention_rating, probe_ts }
  ]
}

主要分析
--------
- **commission_error_rate (NoGo 误按率)**: SART 核心指标,持续注意 / 抑制控制
  老年正常 < 30%, MCI 经常 > 50% (Robertson 1997)
- **d' 信号检测**: 区分能力 (整体辨别 Go/NoGo 的灵敏度)
- **go_rt_sd / go_rt_cov**: 注意波动 (高变异 = 注意失控)
- **omission_error_rate**: Go 漏按率 (注意涣散指标)
- **commission_rate_by_nogo_color (white vs yellow)**: 黄色 popout 是否降低对 NoGo 的误按 (target_pop 效应)
- **mask_phase_response_rate**: 已取消 mask 后固定为 0，保留字段用于兼容旧表头。

时间戳格式
----------
本地时区,YYYYMMDD-HHMMSS,跟父目录前缀一致。

更详细疑问
----------
范式源代码:web-battery/paradigms/sart/sart.js
原 PsychoPy 版:老年范式综合2/SART/SART/范式程序/main.py + data_manager.py
配套音频:web-battery/audio/sart/(指导语)
`;
}

/* ================================================================
   CSV / JSON Export
   ================================================================ */

function generateCSV() {
  var BOM = '\uFEFF';
  var fields = [
    'subject_id', 'global_trial_index', 'block_type', 'block_number',
    'trial_index', 'source_trial_index', 'sart_block_mode', 'digit', 'trial_type',
    'response_made', 'reaction_time_ms', 'rt_ms', 'accuracy', 'error_type',
    'phase', 'timestamp',
    'rt_hold', 'drift_max', 'drift_path', 'drift_end', 'tap_count', 'input_type',
    /* 60-trial 改版新增 11 字段 */
    'stimulus_position', 'stimulus_x_ratio', 'stimulus_y_ratio',
    'previous_position', 'position_transition', 'position_switch_type',
    'stimulus_color', 'popout_type', 'mask_onset_ts', 'mask_offset_ts', 'response_phase',
    'attention_rating', 'probe_score',
  ];
  var csv = BOM + fields.join(',') + '\n';
  trialRecords.forEach(function (r) {
    csv += fields.map(function (f) {
      var v = r[f];
      if (v === undefined || v === null) return '';
      return String(v);
    }).join(',') + '\n';
  });
  return csv;
}

function generateSummaryJSON() {
  return JSON.stringify({
    participant: { subject_id: subjectId },
    behavioral_metrics: computeSDT(),
    probes: probeRecords,
  }, null, 2);
}

function downloadBlob(content, filename, mimeType) {
  var blob = new Blob([content], { type: mimeType || 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

var _dataSaved = false;
async function saveData() {
  if (_dataSaved) return;
  _dataSaved = true;
  var ts = timestamp();
  var csvFilename = 'SART_' + subjectId + '_' + ts + '.csv';
  var jsonFilename = 'SART_' + subjectId + '_' + ts + '_summary.json';
  var csvContent = generateCSV();
  var jsonContent = generateSummaryJSON();

  // Register files for local ZIP packing
  if (typeof LocalPack !== 'undefined') {
    LocalPack.add(csvFilename, csvContent);
    LocalPack.add(jsonFilename, jsonContent);
    LocalPack.add('README.txt', _buildSartReadme(subjectId, ts));
  }

  var serverOk = false;
  try {
    var resp = await safeFetch(window.location.origin + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paradigm: 'sart', subject_id: subjectId, filename: csvFilename, content: csvContent }),
    });
    if (!resp.ok) throw new Error('server error');
    var resp2 = await safeFetch(window.location.origin + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paradigm: 'sart', subject_id: subjectId, filename: jsonFilename, content: jsonContent }),
    });
    if (!resp2.ok) throw new Error('server error');
    serverOk = true;
  } catch (e) {
    console.warn('[SART] server save failed, LocalPack has backup:', e);
  }

  // localStorage 兜底:服务器成功就清(防跨被试累积),失败才留
  try {
    if (serverOk) localStorage.removeItem('sart_backup_' + subjectId);
    else localStorage.setItem('sart_backup_' + subjectId, csvContent);
  } catch (e) { /* ignore */ }

  /* Clear checkpoint — experiment completed normally, full data saved */
  _ckpt.clear();
}

/* ================================================================
   jsPsych Init
   ================================================================ */

var jsPsych = window.jsPsych = initJsPsych({
  display_element: 'jspsych-target',
  on_finish: function () {
    // 藏掉persistent按钮
    var wrap = document.getElementById('sart-persistent-btn-wrap');
    if (wrap) wrap.style.display = 'none';
    // saveData() is awaited in the timeline call-function trial — not here
    showEndScreen('sart', subjectId);
  },
});

/* ================================================================
   HTML Builders
   ================================================================ */

function makeInstructionHTML(title, body, hint) {
  if (hint === undefined || hint === null) hint = '(按下方按钮继续)';
  return '<div class="sart-instr-page">' +
    '<div class="sart-instr-title">' + title + '</div>' +
    '<div class="sart-instr-body">' + body + '</div>' +
    (hint ? '<div class="sart-instr-hint">' + hint + '</div>' : '') +
    '</div>';
}

function instructionTrial(title, body, hint, btnLabel) {
  btnLabel = btnLabel || '继续';
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: makeInstructionHTML(title, body, hint),
    choices: [btnLabel],
    button_html: function (choice) {
      return '<button class="sart-instr-btn">' + choice + '</button>';
    },
  };
}

/* --- Persistent button state (avoids DOM rebuild flash) --- */
var _sartBtn = null;
var _sartTrialStart = 0;
var _sartResponseMade = false;
var _sartResponseRT = null;
var _sartHoldStart = null;     // pointerdown 时间戳
var _sartStartX = null;        // pointerdown 位置
var _sartStartY = null;
var _sartDriftMaxSq = 0;
var _sartDriftPath = 0;
var _sartLastMoveX = 0;
var _sartLastMoveY = 0;
var _sartTapCount = 0;
var _sartInputType = null;
var _sartHoldDuration = null;
var _sartDriftEnd = 0;
/* --- mask / 位置追踪 (60-trial 改版) --- */
var _sartMaskTimer = null;        // setTimeout id, on_finish 必须清
var _sartMaskOnsetTs = null;      // mask 出现时间戳 (Date.now, 与 events.csv 同钟)
var _sartMaskOffsetTs = null;     // mask 消失时间戳 (Date.now)
var _sartPrevPosition = null;     // 上一 trial 位置 (每个 block_type 起点 reset)
var _sartPrevBlockType = '';      // 用于判断 block 边界

function _ensureSartBtn() {
  if (_sartBtn) return;
  _sartBtn = document.getElementById('sart-persistent-btn');

  // 响应记录在 pointerdown（按下即记录，不等松开）
  // RT = pointerdown 时刻（认知心理学标准，Bjorklund 1991）
  // 视觉反馈完全由 CSS :active 处理，不用 TouchHardening（避免两套系统打架）
  _sartBtn.addEventListener('pointerdown', function (e) {
    _sartTapCount++;
    if (!_sartResponseMade) {
      _sartResponseMade = true;
      _sartResponseRT = performance.now() - _sartTrialStart;
      _sartHoldStart = performance.now();
      _sartStartX = e.clientX;
      _sartStartY = e.clientY;
      _sartLastMoveX = e.clientX;
      _sartLastMoveY = e.clientY;
      _sartDriftMaxSq = 0;
      _sartDriftPath = 0;
      _sartInputType = e.pointerType || null;
      // 已答题：按钮变浅绿，表示"这题按过了"
      _sartBtn.style.background = '#C8E6C9';
    }
  });

  _sartBtn.addEventListener('pointermove', function (e) {
    if (_sartStartX === null) return;
    var dx = e.clientX - _sartStartX;
    var dy = e.clientY - _sartStartY;
    var distSq = dx * dx + dy * dy;
    if (distSq > _sartDriftMaxSq) _sartDriftMaxSq = distSq;
    _sartDriftPath += Math.sqrt(
      Math.pow(e.clientX - _sartLastMoveX, 2) + Math.pow(e.clientY - _sartLastMoveY, 2)
    );
    _sartLastMoveX = e.clientX;
    _sartLastMoveY = e.clientY;
  });

  _sartBtn.addEventListener('pointerup', function (e) {
    if (_sartHoldStart !== null) {
      _sartHoldDuration = Math.round(performance.now() - _sartHoldStart);
      _sartDriftEnd = Math.round(Math.sqrt(
        Math.pow(e.clientX - _sartStartX, 2) + Math.pow(e.clientY - _sartStartY, 2)
      ));
    }
  });
}

/* encircled-x mask (Bedi et al. 2023): 纯白圆环 + 对角叉, 不用 Unicode ✗ (禁符号约束)。
   固定屏幕正中 (解读1: 文档 §2 "中央 mask 作为轻度视觉重置")。 */
function _sartMaskSVG() {
  return '<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">' +
    '<circle cx="50" cy="50" r="44" fill="none" stroke="#FFFFFF" stroke-width="6"/>' +
    '<line x1="29" y1="29" x2="71" y2="71" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>' +
    '<line x1="71" y1="29" x2="29" y2="71" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>' +
    '</svg>';
}

function buildSARTTrialNodes(trialInfo, blockType, showFeedback) {
  var nodes = [];

  /* 每题前 500ms 中央注视点：不显示响应按钮，不记录 RT。 */
  nodes.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: function () {
      var isPractice = blockType.indexOf('practice') !== -1;
      var total = isPractice ? CONFIG.practice.totalTrials : CONFIG.formal.totalTrials;
      var label = isPractice ? '练习 ' : '';
      return '<div style="position:fixed;top:12px;right:24px;color:rgba(255,255,255,0.4);font-size:36px;font-family:var(--font);pointer-events:none;z-index:20;">' + label + trialInfo.trial_index + ' / ' + total + '</div>' +
        '<div class="sart-fixation">+</div>';
    },
    choices: 'NO_KEYS',
    trial_duration: CONFIG.timing.fixationDuration,
    response_ends_trial: false,
    on_load: function () {
      var _wrap = document.getElementById('sart-persistent-btn-wrap');
      if (_wrap) _wrap.style.display = 'none';
      if (typeof ParadigmCamera !== 'undefined' && ParadigmCamera.isRecording()) {
        var phase = blockType.indexOf('practice') === 0 ? 'practice' : 'formal';
        ParadigmCamera.addEvent('fixation_onset', {
          trial_index: trialInfo.trial_index,
          source_trial_index: trialInfo.source_trial_index || trialInfo.trial_index,
          phase: phase,
          duration_ms: CONFIG.timing.fixationDuration
        });
      }
    },
    on_finish: function () {
      if (typeof ParadigmCamera !== 'undefined' && ParadigmCamera.isRecording()) {
        ParadigmCamera.addEvent('fixation_offset', {
          trial_index: trialInfo.trial_index,
          source_trial_index: trialInfo.source_trial_index || trialInfo.trial_index
        });
      }
    }
  });

  /* 数字呈现 1250ms。取消 mask，反应窗只覆盖数字阶段。 */
  nodes.push({
    type: jsPsychHtmlKeyboardResponse,
    stimulus: (function() {
      var isPractice = blockType.indexOf('practice') !== -1;
      var total = isPractice ? CONFIG.practice.totalTrials : CONFIG.formal.totalTrials;
      var label = isPractice ? '练习 ' : '';
      var xPct = (CONFIG.positions[trialInfo.position] * 100) + '%';
      var yPct = (CONFIG.yRatio * 100) + '%';
      var digitColor = trialInfo.color === 'yellow' ? 'var(--sart-yellow)' : '#FFFFFF';
      return '<div style="position:fixed;top:12px;right:24px;color:rgba(255,255,255,0.4);font-size:36px;font-family:var(--font);pointer-events:none;z-index:20;">' + label + trialInfo.trial_index + ' / ' + total + '</div>' +
        '<div class="sart-digit" style="--sart-x:' + xPct + ';--sart-y:' + yPct + ';--sart-digit-color:' + digitColor + ';">' + trialInfo.digit + '</div>';
    })(),
    choices: 'NO_KEYS',
    trial_duration: CONFIG.timing.trialDuration,
    response_ends_trial: false,
    on_start: function () {
      if (typeof ParadigmCamera !== 'undefined' && ParadigmCamera.isRecording()) {
        var phase = blockType.indexOf('practice') === 0 ? 'practice' : 'formal';
        ParadigmCamera.addEvent('stimulus_onset', {
          trial_index: trialInfo.trial_index,
          source_trial_index: trialInfo.source_trial_index || trialInfo.trial_index,
          digit: trialInfo.digit,
          is_nogo: trialInfo.trial_type === 'nogo',
          position: trialInfo.position,
          color: trialInfo.color,
          popout_type: trialInfo.popout_type,
          phase: phase
        });
      }
    },
    on_load: function () {
      _ensureSartBtn();
      _sartResponseMade = false;
      _sartResponseRT = null;
      _sartHoldStart = null;
      _sartStartX = null;
      _sartStartY = null;
      _sartDriftMaxSq = 0;
      _sartDriftPath = 0;
      _sartLastMoveX = 0;
      _sartLastMoveY = 0;
      _sartTapCount = 0;
      _sartInputType = null;
      _sartHoldDuration = null;
      _sartDriftEnd = 0;
      _sartMaskOnsetTs = null;
      _sartMaskOffsetTs = null;
      if (_sartMaskTimer) { clearTimeout(_sartMaskTimer); _sartMaskTimer = null; }
      _sartBtn.classList.remove('elderly-pressing');
      _sartBtn.classList.remove('elderly-confirmed');
      _sartBtn.style.background = '';
      _sartTrialStart = performance.now();
      var _wrap = document.getElementById('sart-persistent-btn-wrap');
      if (_wrap) _wrap.style.display = 'flex';
    },
    on_finish: function (data) {
      if (_sartMaskTimer) { clearTimeout(_sartMaskTimer); _sartMaskTimer = null; }
      var _wrap = document.getElementById('sart-persistent-btn-wrap');
      if (_wrap) _wrap.style.display = 'none';
      if (_sartResponseMade) {
        data.response = 0;
        data.rt = _sartResponseRT;
      } else {
        data.response = null;
        data.rt = null;
      }
      if (typeof TouchHardening !== 'undefined') TouchHardening.correctRT(data);
      var responseMade = data.response !== null;
      var rt = data.rt;
      var record = recordSARTTrial(trialInfo, blockType, responseMade, rt);
      data.sart_accuracy = record.accuracy;
      data.sart_error_type = record.error_type;
      data.sart_trial_type = trialInfo.trial_type;
      data.sart_digit = trialInfo.digit;
      if (typeof ParadigmCamera !== 'undefined' && ParadigmCamera.isRecording()) {
        ParadigmCamera.addEvent('response', {
          trial_index: trialInfo.trial_index,
          source_trial_index: trialInfo.source_trial_index || trialInfo.trial_index,
          rt: rt,
          correct: record.accuracy,
          phase: record.phase
        });
      }
      if (record.phase === 'formal') { _ckpt.save(); }
    },
  });

  if (showFeedback) {
    nodes.push({
      type: jsPsychHtmlKeyboardResponse,
      stimulus: function () {
        var prev = jsPsych.data.get().last(1).values()[0];
        if (prev.sart_accuracy === 1) {
          return '<div class="practice-feedback correct">正确</div>';
        }
        if (prev.sart_error_type === 'commission') {
          return '<div class="practice-feedback incorrect no-press">看到 3 不要按哦</div>';
        }
        return '<div class="practice-feedback incorrect">记得要按哦</div>';
      },
      choices: 'NO_KEYS',
      trial_duration: function () {
        var prev = jsPsych.data.get().last(1).values()[0];
        return prev.sart_accuracy === 1 ? 800 : 2000;
      },
    });
  }

  return nodes;
}

/* ================================================================
   Build Probe (attention rating 1-9)
   ================================================================ */

function buildProbe(blockIndex) {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: '<div class="sart-instr-page">' +
      '<div class="sart-instr-title">请评价刚才对任务的专注程度</div>' +
      '<div style="margin-top:16px;font-size:26px;color:#888">1 = 完全不专注 &nbsp;&nbsp;&nbsp; 9 = 非常专注</div>' +
      '<div class="rating-buttons" style="margin-top:28px">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) {
        return '<button class="rating-btn" data-rating="' + n + '" ' +
          'onclick="document.querySelectorAll(\'.rating-btn\').forEach(function(b){b.classList.remove(\'selected\')});' +
          'this.classList.add(\'selected\');window._sartRating=' + n + ';' +
          'var cb=document.getElementById(\'sart-probe-confirm\');if(cb){cb.disabled=false;cb.style.opacity=1;}">' + n + '</button>';
      }).join('') +
      '</div></div>',
    choices: ['确认'],
    button_html: function (choice) {
      return '<button class="sart-instr-btn" id="sart-probe-confirm" disabled style="opacity:0.4">' + choice + '</button>';
    },
    on_load: function () {
      window._sartRating = null;
      /* Checkpoint: force save before rating probe */
      _ckpt.forceSave();
    },
    on_finish: function () {
      recordProbe(blockIndex, window._sartRating || 5);
    },
  };
}

/* ================================================================
   Timeline Assembly
   ================================================================ */

var timeline = [];

/* ---- Preload existing SART instruction images only ----
   experiment_v4 里没有 /audio/sart/s01.mp3... 也没有 img/rules.webp。
   所以这里不再预加载缺失音频/缺失 rules.webp；改为使用工程里真实存在的：
   instructions/sart_rule1.png / sart_rule2.png / sart_rule3.png。
   仍然保留 jsPsychPreload 核心包调用。 */
var SART_INSTRUCTION_IMAGES = [
  './instructions/sart_rule1.png',
  './instructions/sart_rule2.png',
  './instructions/sart_rule3.png'
];

timeline.push({
  type: jsPsychPreload,
  images: SART_INSTRUCTION_IMAGES,
  show_progress_bar: true,
  message: '<p style="font-size:32px;color:#fff;">正在加载，请稍候...</p>',
  continue_after_error: true,
});

// 预加载后检查失败资源；如果没有 TouchHardening.checkLoadFailures，就直接继续。
timeline.push({
  type: jsPsychCallFunction,
  async: true,
  func: function(done) {
    if (typeof TouchHardening !== 'undefined' && TouchHardening.checkLoadFailures) {
      TouchHardening.checkLoadFailures({ paradigmName: 'SART' }).then(function() { done(); });
    } else {
      done();
    }
  },
});

/* ---- SART unified instruction guide: 三张图同屏 + 红框 + 明暗标注 ----
   和其它范式一致：三个指导图放在同一屏，用红框强调当前图，非当前图变暗。
   不调用缺失音频。 */
function buildUnifiedSartInstructionGuide() {
  return {
    type: jsPsychCallFunction,
    async: true,
    func: function (done) {
      var overlay = document.createElement('div');
      overlay.className = 'sart-guide-overlay';
      overlay.innerHTML =
        '<div class="sart-guide-header">' +
          '<button class="sart-guide-prev" type="button">上一步</button>' +
          '<div class="sart-guide-title">【数字反应任务】</div>' +
          '<button class="sart-guide-next" type="button">下一步</button>' +
        '</div>' +
        '<div class="sart-guide-images" id="sart-guide-images">' +
          '<div id="sart-guide-img1" class="sart-guide-card"><img src="./instructions/sart_rule1.png" alt="指导语1"></div>' +
          '<div id="sart-guide-img2" class="sart-guide-card"><img src="./instructions/sart_rule2.png" alt="指导语2"></div>' +
          '<div id="sart-guide-img3" class="sart-guide-card"><img src="./instructions/sart_rule3.png" alt="指导语3"></div>' +
          '<div id="sart-guide-redbox" class="sart-guide-redbox"></div>' +
        '</div>' +
        '<div class="sart-guide-subtitle"><div id="sart-guide-text"></div></div>';

      document.body.appendChild(overlay);

      var steps = [
        {
          targetId: 'sart-guide-img1',
          button: '下一步',
          text: '屏幕会逐个出现数字。看到 <b>3 以外</b> 的数字，请尽快点击下方按钮。'
        },
        {
          targetId: 'sart-guide-img2',
          button: '下一步',
          text: '看到数字 <b style="color:#ff6666;font-size:1.2em;">3</b> 时，请忍住，<b>不要点击</b>。'
        },
        {
          targetId: 'sart-guide-img3',
          button: '开始练习',
          text: '所有数字都按同样规则判断：<b>只有 3 不按，其他数字都按</b>。请保持专注，尽量又快又准。'
        }
      ];

      var step = 0;
      var nextBtn = overlay.querySelector('.sart-guide-next');
      var prevBtn = overlay.querySelector('.sart-guide-prev');
      var textEl = overlay.querySelector('#sart-guide-text');
      var redBox = overlay.querySelector('#sart-guide-redbox');
      var imgArea = overlay.querySelector('#sart-guide-images');
      var cards = Array.prototype.slice.call(overlay.querySelectorAll('.sart-guide-card'));

      function updateRedBox(target) {
        if (!target) {
          redBox.style.display = 'none';
          return;
        }
        var tr = target.getBoundingClientRect();
        var ar = imgArea.getBoundingClientRect();
        redBox.style.display = 'block';
        redBox.style.left = (tr.left - ar.left) + 'px';
        redBox.style.top = (tr.top - ar.top) + 'px';
        redBox.style.width = tr.width + 'px';
        redBox.style.height = tr.height + 'px';
      }

      function render() {
        var s = steps[step];
        cards.forEach(function (card) {
          card.classList.toggle('active', card.id === s.targetId);
          card.classList.toggle('dim', card.id !== s.targetId);
        });
        textEl.style.opacity = 0;
        setTimeout(function () {
          textEl.innerHTML = s.text;
          textEl.style.opacity = 1;
        }, 120);
        nextBtn.textContent = s.button;
        nextBtn.classList.toggle('final', step === steps.length - 1);
        prevBtn.disabled = step === 0;
        prevBtn.style.opacity = step === 0 ? '0.45' : '1';
        prevBtn.style.cursor = step === 0 ? 'not-allowed' : 'pointer';
        setTimeout(function () {
          updateRedBox(document.getElementById(s.targetId));
        }, 80);
      }

      nextBtn.addEventListener('click', function () {
        if (step >= steps.length - 1) {
          overlay.remove();
          done();
          return;
        }
        step += 1;
        render();
      });

      prevBtn.addEventListener('click', function () {
        if (step <= 0) return;
        step -= 1;
        render();
      });

      window.addEventListener('resize', function onResize() {
        if (!document.body.contains(overlay)) {
          window.removeEventListener('resize', onResize);
          return;
        }
        var s = steps[step];
        updateRedBox(document.getElementById(s.targetId));
      });

      render();
    }
  };
}

if (getSartFormalBlockMode() !== 'post') {
timeline.push(buildUnifiedSartInstructionGuide());

/* ---- 白→黑过渡：3-2-1倒计时 (作为 practice 段开头, 一并被 Esc 跳过) ---- */
var _countdownStyle = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;display:flex;align-items:center;justify-content:center;';
var _countdownFont = 'color:#fff;font-size:120px;font-weight:bold;';
function _makeCountdownNodes() {
  return ['3', '2', '1'].map(function (n) {
    return {
      type: jsPsychHtmlKeyboardResponse,
      stimulus: '<div style="' + _countdownStyle + '"><span style="' + _countdownFont + '">' + n + '</span></div>',
      choices: 'NO_KEYS',
      trial_duration: 1000,
    };
  });
}

/* ---- Practice Phase ---- */

var practicePassed = false;

function buildPracticeNodes(attemptNum) {
  var blockType = 'practice' + attemptNum;
  var sequence = getPracticeSequence();
  var nodes = [];
  sequence.forEach(function (info) {
    buildSARTTrialNodes(info, blockType, true).forEach(function (n) { nodes.push(n); });
  });
  nodes.push({
    type: jsPsychCallFunction,
    func: function () {
      var recs = trialRecords.filter(function (r) { return r.block_type === blockType; });
      var goOK = recs.filter(function (r) { return r.trial_type === 'go' && r.accuracy === 1; }).length;
      var nogoOK = recs.filter(function (r) { return r.trial_type === 'nogo' && r.accuracy === 1; }).length;
      practicePassed = goOK >= CONFIG.practice.goMinCorrect && nogoOK >= CONFIG.practice.nogoMinCorrect;
      if (typeof ParadigmCamera !== 'undefined' && ParadigmCamera.isRecording()) {
        ParadigmCamera.addEvent('practice_end', { attempt: attemptNum, passed: practicePassed });
      }
      /* Checkpoint: force save after practice ends */
      _ckpt.forceSave();
    },
  });
  return nodes;
}

/* ===== Practice section (wrapped in sub-timeline so 主试 Esc 能整段跳过)
       含开头 3-2-1 倒计时 ===== */
timeline.push({
  timeline: [
    ..._makeCountdownNodes(),
    /* Attempt 1 */
    {
      type: jsPsychCallFunction,
      func: function () {
        if (typeof ParadigmCamera !== 'undefined' && ParadigmCamera.isRecording()) {
          ParadigmCamera.addEvent('practice_start', { attempt: 1 });
        }
      },
    },
    ...buildPracticeNodes(1),
    /* Conditional attempt 2 */
    {
      timeline: [
        instructionTrial(
          '刚刚出现了一些小错误哦',
          '<div style="line-height:2">' +
            '<p style="font-size:34px;color:#555;margin-bottom:16px">没关系，让我们再练习一次！</p>' +
            '<div class="sart-rule-box nogo-rule" style="font-size:32px">看到 <span style="font-size:40px">3</span> &rarr; 别按！</div>' +
            '<div class="sart-rule-box go-rule" style="font-size:32px">看到其他数字 &rarr; 快按！</div>' +
          '</div>',
          '按下方按钮再试一次',
          '继续'
        ),
        {
          type: jsPsychCallFunction,
          func: function () {
            if (typeof ParadigmCamera !== 'undefined' && ParadigmCamera.isRecording()) {
              ParadigmCamera.addEvent('practice_start', { attempt: 2 });
            }
          },
        },
      ].concat(buildPracticeNodes(2)),
      conditional_function: function () { return !practicePassed; },
    },
  ],
});
}

/* ---- Formal Phase: 1 block x 36 trials (9 digits x 4 reps) ---- */

/* Pre-generate all block sequences at page load */
var formalSequences = [];
for (var b = 0; b < CONFIG.formal.blocks; b++) {
  formalSequences.push(getFormalSequence());
}

for (var blockNum = 0; blockNum < CONFIG.formal.blocks; blockNum++) {
  (function (bn) {
    var blockLabel = 'formal_' + getSartFormalBlockMode() + '_block' + (bn + 1);
    var seq = formalSequences[bn];

    /* ===== Formal block (wrapped in sub-timeline so 主试 Esc 能整段跳过)
           含开头 formal-intro + 3-2-1 倒计时 ===== */
    var blockNodes = [];
    /* Formal intro (only before first block) */
    if (bn === 0) {
      if (getSartFormalBlockMode() === 'post') {
        blockNodes.push(instructionTrial(
          '点击下方按钮正式开始',
          '<div style="line-height:2">' +
            '<p style="font-size:30px;color:#666;margin-bottom:12px">大约需要 <b>2 分钟</b></p>' +
            '<p style="font-size:30px;color:#666;margin-bottom:16px">这次按错不会提示，请坚持做完</p>' +
            '<div class="sart-rule-box nogo-rule" style="font-size:32px;margin-bottom:12px">' +
              '记住：看到 <span style="font-size:40px">3</span> 忍住不按!' +
            '</div>' +
            '<p style="font-size:28px;color:#888;margin-top:16px">深呼吸，保持专注</p>' +
          '</div>',
          '',
          '我明白了，开始'
        ));
      } else {
        blockNodes.push(instructionTrial(
          '热身结束，您做得很好!',
          '<div style="line-height:2">' +
            '<p style="font-size:36px;font-weight:bold;color:#1A1A2E;margin-bottom:16px">接下来正式开始游戏</p>' +
            '<p style="font-size:30px;color:#666;margin-bottom:12px">大约需要 <b>2 分钟</b></p>' +
            '<p style="font-size:30px;color:#666;margin-bottom:16px">这次按错不会提示，请坚持做完</p>' +
            '<div class="sart-rule-box nogo-rule" style="font-size:32px;margin-bottom:12px">' +
              '记住：看到 <span style="font-size:40px">3</span> 忍住不按!' +
            '</div>' +
            '<p style="font-size:28px;color:#888;margin-top:16px">深呼吸，保持专注</p>' +
          '</div>',
          '准备好了就按下方按钮',
          '我明白了，开始'
        ));
      }
    }
    /* 3-2-1 倒计时 (黑底白字, 仅在第一个 block 之前 — 保留原代码全局只一次的语义) */
    if (bn === 0) {
      if (urlParams.resumeTrialIndex > 1) {
        blockNodes.push(instructionTrial(
          '进度恢复',
          '<div style="line-height:2"><p style="font-size:34px;color:#333">将从第 <b>' + urlParams.resumeTrialIndex + '</b> 题开始。</p><p style="font-size:28px;color:#777">请确认准备好后正式继续。</p></div>',
          '',
          '确认，正式开始'
        ));
        sendParentCheckpoint(urlParams.resumeTrialIndex);
      }
      for (var _c = 3; _c >= 1; _c--) {
        blockNodes.push({
          type: jsPsychHtmlKeyboardResponse,
          stimulus: '<div style="font-size:14vh;color:#FFFFFF;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">' + _c + '</div>',
          choices: 'NO_KEYS',
          trial_duration: 1000,
        });
      }
    }
    blockNodes.push({
      type: jsPsychCallFunction,
      func: function () {
        if (typeof ParadigmCamera !== 'undefined' && ParadigmCamera.isRecording()) {
          ParadigmCamera.addEvent('block_start', { block: bn + 1, total_trials: seq.length });
        }
      },
    });
    seq.forEach(function (trialInfo) {
      if (trialInfo.trial_index < urlParams.resumeTrialIndex) return;
      buildSARTTrialNodes(trialInfo, blockLabel, false).forEach(function (n) {
        blockNodes.push(n);
      });
    });
    blockNodes.push({
      type: jsPsychCallFunction,
      func: function () {
        if (typeof ParadigmCamera !== 'undefined' && ParadigmCamera.isRecording()) {
          ParadigmCamera.addEvent('block_end', { block: bn + 1 });
        }
      },
    });
    /* Attention probe after each block */
    blockNodes.push(buildProbe(bn + 1));
    timeline.push({ timeline: blockNodes });

    /* Break message between blocks (not after last) */
    if (bn < CONFIG.formal.blocks - 1) {
      timeline.push(instructionTrial(
        '休息一下',
        '<div style="line-height:2">' +
          '<p style="font-size:34px;color:#333">第 <b>' + (bn + 1) + '</b> / ' + CONFIG.formal.blocks + ' 组已完成</p>' +
          '<p style="font-size:30px;color:#888;margin-top:8px">准备好后按按钮继续</p>' +
        '</div>',
        '',
        '继续'
      ));
    }
  })(blockNum);
}

/* ---- Save data, camera stop, cleanup ---- */

timeline.push({
  type: jsPsychCallFunction,
  async: true,
  func: async function (done) {
    await saveData();
    try { localStorage.removeItem(SART_RESUME_KEY); } catch (e) {}
    try { await ParadigmCamera.stopAndSave(); } catch (e) { console.warn('[SART] camera stop error:', e); }

    // 关键修复：在主控台 iframe 中运行时，必须通知父页面“本范式已完成”。
    // 否则主控台不会 currentIndex++，也就不会自动跳到 MOT / 跳绳 / 后续任务。
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'BLOCK_COMPLETED',
          paradigm: 'SART',
          block: getSartFormalBlockMode(),
          csv: generateCSV(),
          files: [
            {
              filename: 'SART_' + subjectId + '_' + getSartFormalBlockMode() + '_summary.json',
              content: generateSummaryJSON()
            }
          ]
        }, '*');
      }
    } catch (e) {
      console.warn('[SART] parent postMessage failed:', e);
    }

    done();
  },
});

function initParadigmCameraWithTimeout(name, sid, timeoutMs) {
  if (typeof ParadigmCamera === 'undefined' || !ParadigmCamera.init) return Promise.resolve(false);
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      console.warn('[SART] camera init timeout, continue without blocking task');
      resolve(false);
    }, timeoutMs || 5000);
    Promise.resolve(ParadigmCamera.init(name, sid)).then(function () {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    }).catch(function (e) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.warn('[SART] camera init failed, continue without blocking task:', e);
      resolve(false);
    });
  });
}

/* Run (with camera init before jsPsych starts) */
(async function () {
  await initParadigmCameraWithTimeout('sart', subjectId, 5000);
  jsPsych.run(timeline);
})();
