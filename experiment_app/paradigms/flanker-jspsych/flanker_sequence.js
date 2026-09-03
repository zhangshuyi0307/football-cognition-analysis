(function () {
  'use strict';

  /*
   * Flanker 固定伪随机序列
   * - 不使用 Math.random / 运行时洗牌
   * - 每个被试、每次运行的练习和正式顺序完全一致
   * - 正式 2 block × 24 trial = 48 trial
   * - 每个 block 内：Congruent / Incongruent / Neutral 各 8
   * - Congruent/Incongruent：no-pop 4，target-pop 2，flanker-pop 2
   * - Neutral：no-pop 4，target-pop 4
   * - 2026-06-12 修改：正式顺序重新伪随机化，避免明显左右交替或左左左右右右模式；
   *   trial_type 与 target_dir 连续均不超过 2 个，满足“不超过 3 个连续”的要求。
   */

  function getFlankerDirection(trialType, targetDir) {
    if (trialType === 'Congruent') return targetDir;
    if (trialType === 'Incongruent') return targetDir === 'left' ? 'right' : 'left';
    return 'neutral';
  }

  function createTrial(subjectId, idx, isPractice, trialType, targetDir, isPopout, popoutType, popoutPosition, blockIndex, practiceRound, phaseName) {
    return {
      subject_id: subjectId,
      trial_index: idx,
      is_practice: isPractice,
      trial_type: trialType,
      is_popout: isPopout,
      popout_type: popoutType,
      popout_position: popoutPosition,
      target_dir: targetDir,
      flanker_dir: getFlankerDirection(trialType, targetDir),
      block_index: blockIndex,
      practice_round: practiceRound,
      phase_name: phaseName
    };
  }

  // 每一项：[trial_type, target_dir, is_popout, popout_type, popout_position]
  // 练习顺序保持原版不动。
  const PRACTICE_ROUNDS = {
    1: [
      ['Congruent', 'left',  false, 'na',      'NA'],
      ['Neutral',   'right', true,  'target',  '3'],
      ['Incongruent','right',false, 'na',      'NA'],
      ['Congruent', 'right', true,  'target',  '3'],
      ['Neutral',   'left',  false, 'na',      'NA'],
      ['Incongruent','left', true,  'flanker', '4']
    ],
    2: [
      ['Neutral',   'right', false, 'na',      'NA'],
      ['Congruent', 'left',  true,  'flanker', '1'],
      ['Incongruent','left', false, 'na',      'NA'],
      ['Neutral',   'left',  true,  'target',  '3'],
      ['Congruent', 'right', false, 'na',      'NA'],
      ['Incongruent','right',true,  'target',  '3']
    ],
    3: [
      ['Incongruent','right',false, 'na',      'NA'],
      ['Congruent', 'right', true,  'flanker', '5'],
      ['Neutral',   'left',  false, 'na',      'NA'],
      ['Incongruent','left', true,  'target',  '3'],
      ['Congruent', 'left',  false, 'na',      'NA'],
      ['Neutral',   'right',true,  'target',  '3']
    ]
  };

  // 正式顺序已重新打散：
  // Block 1 target_dir = RLLRLRRLLRLLRLRRLRRLLRRL
  // Block 2 target_dir = LLRLRLLRRLLRLRRLRRLRRLRL
  // 每个 block：target_dir 连续最多 2 个；trial_type 连续最多 2 个。
  const FORMAL_BLOCKS = [
    [
      ['Incongruent','right', true,  'target',  '3'],
      ['Neutral',    'left',  true,  'target',  '3'],
      ['Neutral',    'left',  true,  'target',  '3'],
      ['Congruent',  'right', false, 'na',      'NA'],
      ['Neutral',    'left',  false, 'na',      'NA'],
      ['Neutral',    'right', false, 'na',      'NA'],
      ['Incongruent','right', false, 'na',      'NA'],
      ['Congruent',  'left',  true,  'flanker', '2'],
      ['Incongruent','left',  true,  'flanker', '4'],
      ['Congruent',  'right', false, 'na',      'NA'],
      ['Incongruent','left',  true,  'target',  '3'],
      ['Incongruent','left',  false, 'na',      'NA'],
      ['Neutral',    'right', true,  'target',  '3'],
      ['Incongruent','left',  false, 'na',      'NA'],
      ['Congruent',  'right', true,  'target',  '3'],
      ['Incongruent','right', false, 'na',      'NA'],
      ['Congruent',  'left',  false, 'na',      'NA'],
      ['Congruent',  'right', true,  'flanker', '5'],
      ['Incongruent','right', true,  'flanker', '1'],
      ['Neutral',    'left',  false, 'na',      'NA'],
      ['Congruent',  'left',  true,  'target',  '3'],
      ['Neutral',    'right', true,  'target',  '3'],
      ['Neutral',    'right', false, 'na',      'NA'],
      ['Congruent',  'left',  false, 'na',      'NA']
    ],
    [
      ['Congruent',  'left',  true,  'target',  '3'],
      ['Neutral',    'left',  true,  'target',  '3'],
      ['Congruent',  'right', false, 'na',      'NA'],
      ['Congruent',  'left',  true,  'flanker', '1'],
      ['Incongruent','right', false, 'na',      'NA'],
      ['Neutral',    'left',  false, 'na',      'NA'],
      ['Neutral',    'left',  true,  'target',  '3'],
      ['Incongruent','right', true,  'target',  '3'],
      ['Congruent',  'right', false, 'na',      'NA'],
      ['Incongruent','left',  true,  'flanker', '5'],
      ['Incongruent','left',  false, 'na',      'NA'],
      ['Congruent',  'right', true,  'flanker', '4'],
      ['Congruent',  'left',  false, 'na',      'NA'],
      ['Neutral',    'right', false, 'na',      'NA'],
      ['Congruent',  'right', true,  'target',  '3'],
      ['Incongruent','left',  true,  'target',  '3'],
      ['Neutral',    'right', false, 'na',      'NA'],
      ['Incongruent','right', false, 'na',      'NA'],
      ['Congruent',  'left',  false, 'na',      'NA'],
      ['Neutral',    'right', true,  'target',  '3'],
      ['Incongruent','right', true,  'flanker', '2'],
      ['Incongruent','left',  false, 'na',      'NA'],
      ['Neutral',    'right', true,  'target',  '3'],
      ['Neutral',    'left',  false, 'na',      'NA']
    ]
  ];

  function materialize(list, subjectId, blockIndex, isPractice, practiceRound, phaseName) {
    return list.map((t, i) => createTrial(
      subjectId,
      i + 1,
      isPractice,
      t[0],
      t[1],
      t[2],
      t[3],
      t[4],
      blockIndex,
      practiceRound,
      phaseName
    ));
  }

  function buildPracticeTrials(subjectId, practiceRound) {
    const key = ((practiceRound - 1) % 3) + 1;
    return materialize(PRACTICE_ROUNDS[key], subjectId, 0, true, practiceRound, 'practice');
  }

  function buildFormalBlocks(subjectId) {
    return FORMAL_BLOCKS.map((block, i) => materialize(block, subjectId, i + 1, false, 0, 'formal'));
  }

  window.FLANKER_SEQUENCE = {
    version: 'flanker-fixed-pseudorandom-v2026-06-12-less-predictable',
    buildPracticeTrials,
    buildFormalBlocks,
    createTrial
  };
})();
