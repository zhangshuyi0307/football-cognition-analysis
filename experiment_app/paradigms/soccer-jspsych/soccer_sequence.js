(function () {
  'use strict';

  const SOCCER_ASSET_BASE = 'https://zd-oldman.oss-cn-hangzhou.aliyuncs.com/assets/football-cognition/paradigms/soccer-jspsych/';

  function assetUrl(p) {
    const clean = String(p || '').replace(/^\.\//, '').replace(/^\/+/, '');
    if (/^https?:\/\//i.test(clean)) return clean;
    const ossPath = legacySoccerPath(clean);
    return SOCCER_ASSET_BASE + ossPath.split('/').map(encodeURIComponent).join('/');
  }

  function legacySoccerPath(p) {
    const delay4Map = {
      'assets_safe/delay4/delay4.mp4': 'tactic up selected 1/defensive_/题目5/Delay+4 [Delay+4].mp4',
      'assets_safe/delay4/delay4_A.png': 'tactic up selected 1/defensive_/题目5/Delay+4+-+A [Delay+4+-+A].png',
      'assets_safe/delay4/delay4_B.png': 'tactic up selected 1/defensive_/题目5/Delay+4+-+B [Delay+4+-+B].png',
      'assets_safe/delay4/delay4_C.png': 'tactic up selected 1/defensive_/题目5/Delay+4+-+C [Delay+4+-+C].png',
      'assets_safe/delay4/delay4_D.png': 'tactic up selected 1/defensive_/题目5/Delay+4+-+D [Delay+4+-+D].png'
    };
    if (delay4Map[p]) return delay4Map[p];

    return String(p || '')
      .replace('tactic_set_1', 'tactic up selected 1')
      .replace('tactic_set_2', 'tactic up selected 2')
      .replace('/defensive_/trial_1/', '/defensive_/题目 1/')
      .replace(/\/trial_(\d+)(?=\/|$)/g, '/题目$1')
      .replace(/\/trial_(\d+)\.jpg$/g, '/题目$1.jpg');
  }

  /**
   * Soccer tactical decision item bank.
   * ------------------------------------------------------------
   * 重要说明：
   * 1. 本文件只使用服务器本地相对路径，不走 OSS CDN。
   * 2. 路径相对于 index s.html 所在目录：
   *    /paradigms/soccer-jspsych/
   * 3. 正式素材文件名中原本就是 +，不要把 + 改成空格。
   * 4. 例如：
   *    tactic_set_1/defensive_/trial_5/Delay+4 [Delay+4].mp4
   *    tactic_set_1/defensive_/trial_5/Delay+4+-+A [Delay+4+-+A].png
   */

  function assetRoot(r) {
    return String(r || '')
      .replace('tactic_set_1', 'tactic_set_1')
      .replace('tactic_set_2', 'tactic_set_2');
  }

  function assetFolder(f) {
    return String(f || '').replace(/(?:\u9898\u76ee|\u68f0\u6a3c\u6d30)\s*(\d+)/g, 'trial_$1');
  }

  function bd(r, f, p, a, b, t, texts) {
    const rr = assetRoot(r);
    const ff = assetFolder(f);
    return {
      v: assetUrl(`${rr}/${ff}/${p} [${p}].mp4`),
      tp: p,
      o: {
        a: assetUrl(`${rr}/${ff}/${p}+-+A [${p}+-+A].png`),
        b: assetUrl(`${rr}/${ff}/${p}+-+B [${p}+-+B].png`),
        c: assetUrl(`${rr}/${ff}/${p}+-+C [${p}+-+C].png`),
        d: assetUrl(`${rr}/${ff}/${p}+-+D [${p}+-+D].png`)
      },
      texts: texts,
      a_c: a,
      blk: b,
      typ: t
    };
  }

  const pb = 'tactic_set_1/practice';

  const practiceData = [
    {
      v: assetUrl(`${pb}/Recovery Balance 1.mp4`),
      tp: 'Practice1',
      o: {
        a: assetUrl(`${pb}/Recovery Balance 1/Recovery Balance 1 - A.png`),
        b: assetUrl(`${pb}/Recovery Balance 1/Recovery Balance 1 - B.png`),
        c: assetUrl(`${pb}/Recovery Balance 1/Recovery Balance 1 - C.png`),
        d: assetUrl(`${pb}/Recovery Balance 1/Recovery Balance 1 - D.png`)
      },
      texts: ['向右下对角线方向移动', '向右移动', '向下移动', '保持不动'],
      a_c: 'b'
    },
    {
      v: assetUrl(`${pb}/Width and Length without the Ball 6.mp4`),
      tp: 'Practice2',
      o: {
        a: assetUrl(`${pb}/Width and Length without the Ball 6/Width and Length without the Ball 6 - A.png`),
        b: assetUrl(`${pb}/Width and Length without the Ball 6/Width and Length without the Ball 6 - B.png`),
        c: assetUrl(`${pb}/Width and Length without the Ball 6/Width and Length without the Ball 6 - C.png`),
        d: assetUrl(`${pb}/Width and Length without the Ball 6/Width and Length without the Ball 6 - D.png`)
      },
      texts: ['向下移动', '向右移动', '向上移动', '向左移动'],
      a_c: 'b'
    },
    {
      v: assetUrl(`${pb}/Width and Length without the Ball 8.mp4`),
      tp: 'Practice3',
      o: {
        a: assetUrl(`${pb}/Width and Length without the Ball 8/Width and Length without the Ball 8 - A.png`),
        b: assetUrl(`${pb}/Width and Length without the Ball 8/Width and Length without the Ball 8 - B.png`),
        c: assetUrl(`${pb}/Width and Length without the Ball 8/Width and Length without the Ball 8 - C.png`),
        d: assetUrl(`${pb}/Width and Length without the Ball 8/Width and Length without the Ball 8 - D.png`)
      },
      texts: ['向右上对角线方向移动', '向右移动', '向左移动', '向左上对角线方向移动'],
      a_c: 'b'
    }
  ];

  const b1Data = [
    bd('tactic_set_1', 'offensive/trial_10', 'Width+and+Length+with+the+Ball+5', 'd', 1, 'offensive', ['向右移动', '向上移动', '向左下对角线方向移动', '向下移动']),
    bd('tactic_set_1', 'offensive/trial_15', 'Penetration+9', 'd', 1, 'offensive', ['向左上对角线方向移动', '向上移动', '向左上移动', '向右上移动']),
    bd('tactic_set_1', 'offensive/trial_17', 'Offensive+Unity+15', 'b', 1, 'offensive', ['向下移动', '向上移动', '向右移动', '向左移动']),
    bd('tactic_set_1', 'offensive/trial_19', 'Offensive+Coverage+5', 'c', 1, 'offensive', ['向右移动', '向下移动', '向右下对角线方向移动', '向上移动']),
    bd('tactic_set_1', 'offensive/trial_20', 'Depth+Mobility+1', 'd', 1, 'offensive', ['保持不动', '向右移动', '向左移动', '向下移动']),
    bd('tactic_set_1', 'defensive_/trial_1', 'Recovery+Balance+2', 'd', 1, 'defensive', ['保持不动', '向左移动', '向左上移动', '向下移动']),
    bd('tactic_set_1', 'defensive_/trial_3', 'Concentration+5', 'd', 1, 'defensive', ['向左上对角线方向移动', '保持不动', '向左移动', '向左下对角线方向移动']),
    {
  v: assetUrl("assets_safe/delay4/delay4.mp4"),
  tp: "Delay+4",
  o: {
    a: assetUrl("assets_safe/delay4/delay4_A.png"),
    b: assetUrl("assets_safe/delay4/delay4_B.png"),
    c: assetUrl("assets_safe/delay4/delay4_C.png"),
    d: assetUrl("assets_safe/delay4/delay4_D.png")
  },
  texts: ['向右上移动', '保持不动', '向左上对角线方向移动', '向右移动'],
  a_c: "a",
  blk: 1,
  typ: "defensive"
},
    bd('tactic_set_1', 'defensive_/trial_7', 'Defensive+Balance+1', 'c', 1, 'defensive', ['向右下移动', '向左移动', '向左下对角线方向移动', '保持不动']),
    bd('tactic_set_1', 'defensive_/trial_24', 'Defensive+Unity+3', 'c', 1, 'defensive', ['向右下对角线方向移动', '保持不动', '向左下对角线方向移动', '向右移动']),
    bd('tactic_set_1', 'defensive_/trial_27', 'Defensive+Coverage+1', 'c', 1, 'defensive', ['向右上对角线方向移动', '向右下移动', '向下移动', '保持不动'])
  ];

  const b2Data = [
    bd('tactic_set_2', 'defensive/trial_4', 'Concentration+6', 'd', 2, 'defensive', ['向右下对角线方向移动', '保持不动', '向右上对角线方向移动', '向右移动']),
    bd('tactic_set_2', 'defensive/trial_8', 'Defensive+Balance+2', 'd', 2, 'defensive', ['向左移动', '保持不动', '向右下移动', '向左下移动']),
    bd('tactic_set_2', 'defensive/trial_13', 'Recovery+Balance+3', 'd', 2, 'defensive', ['向下移动', '保持不动', '向左移动', '向左下对角线方向移动']),
    bd('tactic_set_2', 'defensive/trial_21', 'Delay+5', 'b', 2, 'defensive', ['向左移动', '向左下移动', '向下移动', '保持不动']),
    bd('tactic_set_2', 'defensive/trial_23', 'Defensive+Unity+4', 'd', 2, 'defensive', ['向右上对角线方向移动', '向右移动', '保持不动', '向右下移动']),
    bd('tactic_set_2', 'defensive/trial_26', 'Defensive+Coverage+4', 'd', 2, 'defensive', ['向右移动', '向左移动', '向左上移动', '向右上移动']),
    bd('tactic_set_2', 'offensive/trial_2', 'Depth+Mobility+10', 'c', 2, 'offensive', ['向下移动', '向左下移动', '向右下移动', '向右移动']),
    bd('tactic_set_2', 'offensive/trial_9', 'Width+and+Length+with+the+Ball+2', 'd', 2, 'offensive', ['向上移动', '向左移动', '向下移动', '向右下移动']),
    bd('tactic_set_2', 'offensive/trial_11', 'Width+and+Length+with+the+Ball+7', 'b', 2, 'offensive', ['向右移动', '向上移动', '向右下对角线方向移动', '向右下移动']),
    bd('tactic_set_2', 'offensive/trial_16', 'Penetration+2', 'a', 2, 'offensive', ['向左移动', '向左下移动', '向右移动', '向上移动']),
    bd('tactic_set_2', 'offensive/trial_18', 'Offensive+Coverage+11', 'd', 2, 'offensive', ['向下移动', '保持不动', '向右移动', '向上移动'])
  ];

  function collectSoccerAssets() {
    const out = [];
    const seen = new Set();
    function add(v) {
      if (!v || seen.has(v)) return;
      seen.add(v);
      out.push(v);
    }

    [practiceData, b1Data, b2Data].forEach(list => {
      list.forEach(item => {
        add(item.v);
        if (item.o) Object.values(item.o).forEach(add);
      });
    });

    add(assetUrl('guide.png'));
    add(assetUrl('option_1.png'));
    add(assetUrl('option_2.png'));
    add(assetUrl('option_3.png'));
    add(assetUrl('option_4.png'));
    add(assetUrl('tactic_set_1/defensive_/trial_1/trial_1.jpg'));
    return out;
  }

  const soccerAssets = collectSoccerAssets();
  window.SOCCER_ASSET_LIST = soccerAssets;
  window.SOCCER_SEQUENCE = {
    version: 'v2026.06.11-clean-local-relative-plus-paths',
    assetBase: SOCCER_ASSET_BASE,
    assetUrl,
    practiceData,
    b1Data,
    b2Data,
    soccerAssets
  };
})();
