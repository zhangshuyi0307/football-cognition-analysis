/**
 * SART 固定伪随机序列：原 60 trial 简单拆分版
 * --------------------------------------------------------------
 * 这一版严格沿用你原来的 60 trial 固定表，不重新洗牌、不重新生成。
 *
 * formal_pre  = 原 60 trial 的第 1–30 题
 * formal_post = 原 60 trial 的第 31–60 题
 *
 * 注意：
 * - pre/post 内部的 trial_index 都显示为 1–30，方便界面计数。
 * - source_trial_index 保留原 60 trial 里的真实编号。
 * - 用 <script> 同步引入，在 sart.js 之前加载，暴露 window.SART_SEQUENCE。
 */
(function () {
  window.SART_SEQUENCE = {
    version: '20260605_split_original_60_keep_order',
    meta: {
      mode: 'split-original-60-into-pre-post-without-reordering',
      nogo_digit: 3,

      pre_total: 30,
      pre_go_n: 24,
      pre_nogo_n: 6,

      post_total: 30,
      post_go_n: 24,
      post_nogo_n: 6,

      practice_go_n: 9,
      practice_nogo_n: 3,

      /* 水平位置比例与 sart.js 保持一致：拉远三位置 */
      positions: { left: 0.25, center: 0.50, right: 0.75 },
      y_ratio: 0.50,

      source: '原 sart_sequence.js 的 formal 60 trial：pre=1–30，post=31–60，顺序完全保留。',
    },

    /* ===== 练习 12 trial：沿用原表 ===== */
    practice: [
      { trial_index: 1 , source_trial_index: 1 , digit: 5, trial_type: 'go', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 2 , source_trial_index: 2 , digit: 7, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 3 , source_trial_index: 3 , digit: 2, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 4 , source_trial_index: 4 , digit: 3, trial_type: 'nogo', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 5 , source_trial_index: 5 , digit: 6, trial_type: 'go', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 6 , source_trial_index: 6 , digit: 3, trial_type: 'nogo', position: 'left', color: 'yellow', popout_type: 'target_pop' },
      { trial_index: 7 , source_trial_index: 7 , digit: 8, trial_type: 'go', position: 'center', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 8 , source_trial_index: 8 , digit: 1, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 9 , source_trial_index: 9 , digit: 4, trial_type: 'go', position: 'left', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 10, source_trial_index: 10, digit: 3, trial_type: 'nogo', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 11, source_trial_index: 11, digit: 9, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 12, source_trial_index: 12, digit: 5, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
    ],

    /* ===== formal_pre：原 60 trial 第 1–30 题，顺序完全不变 ===== */
    formal_pre: [
      { trial_index: 1 , source_trial_index: 1 , digit: 1, trial_type: 'go', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 2 , source_trial_index: 2 , digit: 5, trial_type: 'go', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 3 , source_trial_index: 3 , digit: 6, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 4 , source_trial_index: 4 , digit: 3, trial_type: 'nogo', position: 'center', color: 'yellow', popout_type: 'target_pop' },
      { trial_index: 5 , source_trial_index: 5 , digit: 6, trial_type: 'go', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 6 , source_trial_index: 6 , digit: 9, trial_type: 'go', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 7 , source_trial_index: 7 , digit: 5, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 8 , source_trial_index: 8 , digit: 9, trial_type: 'go', position: 'center', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 9 , source_trial_index: 9 , digit: 3, trial_type: 'nogo', position: 'left', color: 'yellow', popout_type: 'target_pop' },
      { trial_index: 10, source_trial_index: 10, digit: 6, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 11, source_trial_index: 11, digit: 1, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 12, source_trial_index: 12, digit: 8, trial_type: 'go', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 13, source_trial_index: 13, digit: 2, trial_type: 'go', position: 'left', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 14, source_trial_index: 14, digit: 1, trial_type: 'go', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 15, source_trial_index: 15, digit: 3, trial_type: 'nogo', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 16, source_trial_index: 16, digit: 4, trial_type: 'go', position: 'left', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 17, source_trial_index: 17, digit: 7, trial_type: 'go', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 18, source_trial_index: 18, digit: 5, trial_type: 'go', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 19, source_trial_index: 19, digit: 9, trial_type: 'go', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 20, source_trial_index: 20, digit: 3, trial_type: 'nogo', position: 'left', color: 'yellow', popout_type: 'target_pop' },
      { trial_index: 21, source_trial_index: 21, digit: 8, trial_type: 'go', position: 'center', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 22, source_trial_index: 22, digit: 2, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 23, source_trial_index: 23, digit: 6, trial_type: 'go', position: 'center', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 24, source_trial_index: 24, digit: 3, trial_type: 'nogo', position: 'right', color: 'yellow', popout_type: 'target_pop' },
      { trial_index: 25, source_trial_index: 25, digit: 9, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 26, source_trial_index: 26, digit: 7, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 27, source_trial_index: 27, digit: 6, trial_type: 'go', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 28, source_trial_index: 28, digit: 5, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 29, source_trial_index: 29, digit: 7, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 30, source_trial_index: 30, digit: 3, trial_type: 'nogo', position: 'right', color: 'yellow', popout_type: 'target_pop' },
    ],

    /* ===== formal_post：原 60 trial 第 31–60 题，顺序完全不变；trial_index 重置 1–30 ===== */
    formal_post: [
      { trial_index: 1 , source_trial_index: 31, digit: 5, trial_type: 'go', position: 'left', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 2 , source_trial_index: 32, digit: 2, trial_type: 'go', position: 'center', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 3 , source_trial_index: 33, digit: 4, trial_type: 'go', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 4 , source_trial_index: 34, digit: 2, trial_type: 'go', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 5 , source_trial_index: 35, digit: 3, trial_type: 'nogo', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 6 , source_trial_index: 36, digit: 7, trial_type: 'go', position: 'left', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 7 , source_trial_index: 37, digit: 1, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 8 , source_trial_index: 38, digit: 7, trial_type: 'go', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 9 , source_trial_index: 39, digit: 8, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 10, source_trial_index: 40, digit: 6, trial_type: 'go', position: 'left', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 11, source_trial_index: 41, digit: 3, trial_type: 'nogo', position: 'center', color: 'yellow', popout_type: 'target_pop' },
      { trial_index: 12, source_trial_index: 42, digit: 4, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 13, source_trial_index: 43, digit: 9, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 14, source_trial_index: 44, digit: 7, trial_type: 'go', position: 'center', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 15, source_trial_index: 45, digit: 3, trial_type: 'nogo', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 16, source_trial_index: 46, digit: 1, trial_type: 'go', position: 'center', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 17, source_trial_index: 47, digit: 8, trial_type: 'go', position: 'left', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 18, source_trial_index: 48, digit: 4, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 19, source_trial_index: 49, digit: 8, trial_type: 'go', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 20, source_trial_index: 50, digit: 3, trial_type: 'nogo', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 21, source_trial_index: 51, digit: 8, trial_type: 'go', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 22, source_trial_index: 52, digit: 4, trial_type: 'go', position: 'center', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 23, source_trial_index: 53, digit: 2, trial_type: 'go', position: 'right', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 24, source_trial_index: 54, digit: 3, trial_type: 'nogo', position: 'left', color: 'white', popout_type: 'none' },
      { trial_index: 25, source_trial_index: 55, digit: 5, trial_type: 'go', position: 'center', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 26, source_trial_index: 56, digit: 1, trial_type: 'go', position: 'left', color: 'yellow', popout_type: 'distractor_pop' },
      { trial_index: 27, source_trial_index: 57, digit: 2, trial_type: 'go', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 28, source_trial_index: 58, digit: 4, trial_type: 'go', position: 'center', color: 'white', popout_type: 'none' },
      { trial_index: 29, source_trial_index: 59, digit: 3, trial_type: 'nogo', position: 'right', color: 'white', popout_type: 'none' },
      { trial_index: 30, source_trial_index: 60, digit: 9, trial_type: 'go', position: 'left', color: 'yellow', popout_type: 'distractor_pop' },
    ],
  };

  /* 兼容旧代码：如果有地方仍读取 SART_SEQUENCE.formal，这里仍提供完整 60 trial。 */
  window.SART_SEQUENCE.formal = window.SART_SEQUENCE.formal_pre.concat(window.SART_SEQUENCE.formal_post);
})();
