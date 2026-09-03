(function () {
  'use strict';

  /*
   * MOT + DRT fixed sequence, stratified pseudorandom version.
   * - Each formal block has 20 trials.
   * - target_count 1/2/3/4/5 appears once in each 5-trial round.
   * - Four rounds per formal block: each target_count appears 4 times total.
   * - Order is fixed and reproducible; only the five conditions inside each round
   *   are pseudorandomly ordered.
   * - Each trial now has 2 DRT events. The previous 3rd DRT event was removed.
   */

  const CONFIG = {
    PPU: 40,
    trackAreaW: 12,
    trackAreaH: 8,
    dotRadius: 0.4,
    totalDots: 10,
    drtMaxDur: 1100,
    baseSpeed: 5,
    minSpeed: 4,
    maxSpeed: 6,
    collisionEnabled: true,
    minBallDistanceRatio: 0.95,
    collisionBounce: 1.0
  };

  const PRACTICE_TRIALS = [
    { sequence_id: 'P01', target_count: 1, target_indices: [2], drt_events: [1700, 6400], seed: 2026101 },
    { sequence_id: 'P02', target_count: 3, target_indices: [1, 4, 8], drt_events: [1900, 6600], seed: 2026102 },
    { sequence_id: 'P03', target_count: 5, target_indices: [0, 2, 5, 7, 9], drt_events: [2100, 6800], seed: 2026103 }
  ];

  const BLOCK1_TRIALS = [
    { sequence_id: 'B1T01', target_count: 2, target_indices: [2, 4], drt_events: [1778, 6702], seed: 2610124 },
    { sequence_id: 'B1T02', target_count: 1, target_indices: [3], drt_events: [1910, 6857], seed: 2610254 },
    { sequence_id: 'B1T03', target_count: 4, target_indices: [0, 1, 7, 8], drt_events: [1684, 6677], seed: 2610446 },
    { sequence_id: 'B1T04', target_count: 3, target_indices: [0, 5, 8], drt_events: [2259, 6497], seed: 2610622 },
    { sequence_id: 'B1T05', target_count: 5, target_indices: [1, 2, 4, 7, 8], drt_events: [1590, 6652], seed: 2610749 },
    { sequence_id: 'B1T06', target_count: 1, target_indices: [9], drt_events: [1552, 6522], seed: 2610311 },
    { sequence_id: 'B1T07', target_count: 3, target_indices: [3, 5, 6], drt_events: [1939, 6782], seed: 2611190 },
    { sequence_id: 'B1T08', target_count: 5, target_indices: [0, 2, 5, 7, 9], drt_events: [2165, 6472], seed: 2610946 },
    { sequence_id: 'B1T09', target_count: 2, target_indices: [3, 5], drt_events: [1816, 6832], seed: 2610527 },
    { sequence_id: 'B1T10', target_count: 4, target_indices: [0, 5, 6, 8], drt_events: [1807, 6627], seed: 2611094 },
    { sequence_id: 'B1T11', target_count: 2, target_indices: [2, 5], drt_events: [2033, 6807], seed: 2610828 },
    { sequence_id: 'B1T12', target_count: 4, target_indices: [0, 3, 4, 5], drt_events: [2062, 6732], seed: 2611788 },
    { sequence_id: 'B1T13', target_count: 3, target_indices: [0, 3, 9], drt_events: [1713, 6602], seed: 2611356 },
    { sequence_id: 'B1T14', target_count: 5, target_indices: [0, 1, 2, 7, 8], drt_events: [1845, 6757], seed: 2611454 },
    { sequence_id: 'B1T15', target_count: 1, target_indices: [2], drt_events: [1525, 6552], seed: 2611951 },
    { sequence_id: 'B1T16', target_count: 3, target_indices: [5, 6, 8], drt_events: [2288, 6111], seed: 2611534 },
    { sequence_id: 'B1T17', target_count: 5, target_indices: [0, 2, 4, 8, 9], drt_events: [1619, 6577], seed: 2611696 },
    { sequence_id: 'B1T18', target_count: 1, target_indices: [4], drt_events: [1968, 6707], seed: 2612046 },
    { sequence_id: 'B1T19', target_count: 4, target_indices: [0, 3, 5, 6], drt_events: [2194, 6887], seed: 2611878 },
    { sequence_id: 'B1T20', target_count: 2, target_indices: [0, 1], drt_events: [2071, 6136], seed: 2611270 }
  ];

  const BLOCK2_TRIALS = [
    { sequence_id: 'B2T01', target_count: 3, target_indices: [0, 5, 7], drt_events: [2228, 6388], seed: 2620198 },
    { sequence_id: 'B2T02', target_count: 5, target_indices: [1, 4, 6, 7, 9], drt_events: [2002, 6208], seed: 2620372 },
    { sequence_id: 'B2T03', target_count: 1, target_indices: [1], drt_events: [1908, 6183], seed: 2620656 },
    { sequence_id: 'B2T04', target_count: 4, target_indices: [1, 4, 6, 9], drt_events: [1644, 6363], seed: 2620474 },
    { sequence_id: 'B2T05', target_count: 2, target_indices: [1, 5], drt_events: [1682, 6493], seed: 2620828 },
    { sequence_id: 'B2T06', target_count: 1, target_indices: [7], drt_events: [1550, 6338], seed: 2620762 },
    { sequence_id: 'B2T07', target_count: 2, target_indices: [6, 7], drt_events: [2257, 6313], seed: 2621023 },
    { sequence_id: 'B2T08', target_count: 4, target_indices: [1, 2, 3, 7], drt_events: [1899, 6468], seed: 2621191 },
    { sequence_id: 'B2T09', target_count: 3, target_indices: [1, 3, 6], drt_events: [1870, 6543], seed: 2620225 },
    { sequence_id: 'B2T10', target_count: 5, target_indices: [2, 3, 5, 8, 9], drt_events: [1776, 6518], seed: 2620583 },
    { sequence_id: 'B2T11', target_count: 3, target_indices: [4, 5, 8], drt_events: [2031, 6133], seed: 2621297 },
    { sequence_id: 'B2T12', target_count: 5, target_indices: [0, 3, 4, 6, 7], drt_events: [1805, 6443], seed: 2621453 },
    { sequence_id: 'B2T13', target_count: 2, target_indices: [2, 4], drt_events: [1579, 6263], seed: 2621690 },
    { sequence_id: 'B2T14', target_count: 1, target_indices: [3], drt_events: [2125, 6158], seed: 2620977 },
    { sequence_id: 'B2T15', target_count: 4, target_indices: [1, 4, 5, 7], drt_events: [1711, 6418], seed: 2621763 },
    { sequence_id: 'B2T16', target_count: 2, target_indices: [5, 9], drt_events: [1617, 6393], seed: 2622086 },
    { sequence_id: 'B2T17', target_count: 4, target_indices: [1, 5, 8, 9], drt_events: [2286, 6238], seed: 2621973 },
    { sequence_id: 'B2T18', target_count: 5, target_indices: [0, 2, 4, 5, 7], drt_events: [1937, 6108], seed: 2621548 },
    { sequence_id: 'B2T19', target_count: 1, target_indices: [0], drt_events: [1843, 6884], seed: 2621851 },
    { sequence_id: 'B2T20', target_count: 3, target_indices: [2, 5, 6], drt_events: [2163, 6288], seed: 2621348 }
  ];

  const BLOCK3_TRIALS = [
    { sequence_id: 'B3T01', target_count: 3, target_indices: [2, 5, 7], drt_events: [2188, 6875], seed: 2630155 },
    { sequence_id: 'B3T02', target_count: 1, target_indices: [8], drt_events: [1962, 6695], seed: 2630387 },
    { sequence_id: 'B3T03', target_count: 5, target_indices: [1, 2, 6, 7, 8], drt_events: [1519, 6540], seed: 2630240 },
    { sequence_id: 'B3T04', target_count: 2, target_indices: [2, 6], drt_events: [2217, 6800], seed: 2631086 },
    { sequence_id: 'B3T05', target_count: 4, target_indices: [1, 7, 8, 9], drt_events: [2000, 6825], seed: 2630779 },
    { sequence_id: 'B3T06', target_count: 5, target_indices: [0, 2, 3, 8, 9], drt_events: [1642, 6490], seed: 2630843 },
    { sequence_id: 'B3T07', target_count: 4, target_indices: [0, 2, 6, 9], drt_events: [1774, 6645], seed: 2630964 },
    { sequence_id: 'B3T08', target_count: 1, target_indices: [8], drt_events: [2226, 6515], seed: 2630560 },
    { sequence_id: 'B3T09', target_count: 3, target_indices: [0, 3, 7], drt_events: [2094, 6850], seed: 2630423 },
    { sequence_id: 'B3T10', target_count: 2, target_indices: [6, 8], drt_events: [2255, 6440], seed: 2631436 },
    { sequence_id: 'B3T11', target_count: 3, target_indices: [0, 6, 8], drt_events: [1868, 6670], seed: 2630624 },
    { sequence_id: 'B3T12', target_count: 2, target_indices: [0, 9], drt_events: [1897, 6595], seed: 2631535 },
    { sequence_id: 'B3T13', target_count: 4, target_indices: [1, 4, 8, 9], drt_events: [1680, 6620], seed: 2631212 },
    { sequence_id: 'B3T14', target_count: 5, target_indices: [0, 4, 6, 7, 9], drt_events: [2029, 6750], seed: 2631623 },
    { sequence_id: 'B3T15', target_count: 1, target_indices: [3], drt_events: [1548, 6465], seed: 2631146 },
    { sequence_id: 'B3T16', target_count: 4, target_indices: [0, 1, 2, 6], drt_events: [1577, 6390], seed: 2632069 },
    { sequence_id: 'B3T17', target_count: 2, target_indices: [3, 4], drt_events: [1935, 6725], seed: 2631959 },
    { sequence_id: 'B3T18', target_count: 3, target_indices: [0, 1, 8], drt_events: [1803, 6570], seed: 2631894 },
    { sequence_id: 'B3T19', target_count: 1, target_indices: [9], drt_events: [2123, 6775], seed: 2631364 },
    { sequence_id: 'B3T20', target_count: 5, target_indices: [0, 1, 3, 6, 7], drt_events: [1671, 6415], seed: 2631745 }
  ];

  const PRACTICE_SEQ = PRACTICE_TRIALS;
  const BLOCK1_SEQ = BLOCK1_TRIALS;
  const BLOCK2_SEQ = BLOCK2_TRIALS;
  const BLOCK3_SEQ = BLOCK3_TRIALS;

  window.MOT_SEQUENCE = {
    version: 'mot-stratified-noadj-1to5-20trials-drt2-v2026-06-24',
    CONFIG,
    PRACTICE_SEQ,
    BLOCK1_SEQ,
    BLOCK2_SEQ,
    BLOCK3_SEQ,
    PRACTICE_TRIALS,
    BLOCK1_TRIALS,
    BLOCK2_TRIALS,
    BLOCK3_TRIALS
  };
})();
