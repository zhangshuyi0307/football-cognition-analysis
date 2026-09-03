(function () {
  'use strict';

  /*
   * BELT/BART 固定伪随机序列
   * - 不再使用 Math.random / 洗牌生成正式 trial
   * - groupFlag === 0：green 为高阈值常见优势颜色，red 为低阈值风险颜色
   * - groupFlag !== 0：red 为高阈值常见优势颜色，green 为低阈值风险颜色
   * - yellow 阈值固定：每阶段 6 个 yellow，阈值为 6/12/18 均衡出现
   * - 正式 3 phase × 18 trial = 54 trial
   */

  const practicePrompts = [
    '持续打气会爆，体验爆炸',
    '多充几下后点击存分按钮',
    '试着在爆前点击存分按钮',
    '试着在爆前点击存分按钮'
  ];

  const PRACTICE_TRIALS = [
    { color: 'gray', limit: 8,  phase: 0, pType: 'force_boom', disable_cash: true  },
    { color: 'gray', limit: 50, phase: 0, pType: 'force_cash', disable_cash: false },
    { color: 'gray', limit: 12, phase: 0, pType: 'free',       disable_cash: false },
    { color: 'gray', limit: 12, phase: 0, pType: 'free',       disable_cash: false }
  ];

  // 每一项：[color, phase, yellowLimitOrNull]
  // green/red 的真实 limit 会根据组别映射；yellow 使用第三列阈值。
  const FORMAL_TEMPLATE = [
    // phase 1
    ['green',1,null], ['yellow',1,18], ['red',1,null], ['yellow',1,12], ['red',1,null], ['green',1,null],
    ['yellow',1,18], ['red',1,null], ['green',1,null], ['yellow',1,12], ['red',1,null], ['green',1,null],
    ['yellow',1,6],  ['green',1,null], ['red',1,null], ['yellow',1,6],  ['green',1,null], ['red',1,null],

    // phase 2
    ['red',2,null], ['yellow',2,6],  ['green',2,null], ['yellow',2,6],  ['red',2,null], ['green',2,null],
    ['yellow',2,12], ['green',2,null], ['red',2,null], ['yellow',2,12], ['green',2,null], ['red',2,null],
    ['yellow',2,18], ['red',2,null], ['green',2,null], ['yellow',2,18], ['red',2,null], ['green',2,null],

    // phase 3
    ['green',3,null], ['yellow',3,6],  ['red',3,null], ['yellow',3,6],  ['green',3,null], ['red',3,null],
    ['yellow',3,12], ['red',3,null], ['green',3,null], ['yellow',3,12], ['red',3,null], ['green',3,null],
    ['yellow',3,18], ['green',3,null], ['red',3,null], ['yellow',3,18], ['green',3,null], ['red',3,null]
  ];

  function cloneTrial(t) {
    return Object.assign({}, t);
  }

  function generatePracticeTrials() {
    return PRACTICE_TRIALS.map(cloneTrial);
  }

  function generateFormalTrials(isCommonGroup) {
    const limits = isCommonGroup
      ? { green: 18, red: 6, yellow: null }
      : { green: 6,  red: 18, yellow: null };

    return FORMAL_TEMPLATE.map((row, idx) => {
      const color = row[0];
      return {
        fixed_order_index: idx + 1,
        color,
        limit: color === 'yellow' ? row[2] : limits[color],
        phase: row[1]
      };
    });
  }

  window.BART_SEQUENCE = {
    version: 'bart-fixed-pseudorandom-v2026-06-05',
    practicePrompts,
    generatePracticeTrials,
    generateFormalTrials
  };
})();
