// ==========================================
// 1. 本地记录基础设施（不再单题上传旧服务器）
// ==========================================
let lastClickTime = 0;
const URL_PARAMS = new URLSearchParams(window.location.search);
const URL_SUBJECT_ID = URL_PARAMS.get('sid') || localStorage.getItem('exp_id') || 'TEST_ID';
const URL_ATTEMPT_ID = URL_PARAMS.get('attempt_id') || '';
const URL_RESUME_TRIAL_INDEX = Math.max(1, parseInt(URL_PARAMS.get('resume_trial_index') || '1', 10) || 1);

function isDebounced() {
    const now = Date.now();
    if (now - lastClickTime < 100) return true;
    lastClickTime = now;
    return false;
}

function uploadTrialData(paradigm, dataObj) {
    // 为兼容旧代码保留函数名；本版不再发送单 trial 数据到远程服务器。
    dataObj.absolute_time = Date.now();
    dataObj.subject_id = URL_SUBJECT_ID;
    dataObj.paradigm = paradigm;
}
// ==========================================


const targetBlock = parseInt(new URLSearchParams(window.location.search).get('block'), 10) || 1;
let currentResults = [];
let currentIndex = 0;
let startTime = 0;
let currentPhase = 'formal';
let activeData = [];
let currentCountdownTimer = null;
let currentTrialStarted = false;
const SOCCER_RESUME_KEY = `soccer_resume_${URL_SUBJECT_ID}_${URL_ATTEMPT_ID}_${targetBlock}`;

const { practiceData, b1Data, b2Data } = window.SOCCER_SEQUENCE;

function sendCheckpoint(trialIndex) {
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'PARADIGM_CHECKPOINT',
                paradigm: 'Soccer',
                block: targetBlock,
                attempt_id: URL_ATTEMPT_ID,
                trial_index: Math.max(1, trialIndex || 1),
                resume_trial_index: Math.max(1, trialIndex || 1)
            }, '*');
        }
    } catch (e) {}
}

function showResumeConfirm(cb) {
    const o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#020617;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Microsoft YaHei,sans-serif;';
    o.innerHTML = `<div style="font-size:40px;font-weight:900;margin-bottom:24px;">进度恢复</div><div style="font-size:26px;color:#ddd;margin-bottom:42px;">将从第 ${URL_RESUME_TRIAL_INDEX} 题开始。请确认准备好后正式继续。</div><button id="resume-ok" style="font-size:26px;font-weight:900;padding:18px 56px;border:none;border-radius:14px;background:#0f3689;color:#fff;">确认，正式开始</button>`;
    document.body.appendChild(o);
    o.querySelector('#resume-ok').onclick = () => { o.remove(); cb(); };
}

const SOCCER_GUIDE_STEPS_BLOCK1 = ['inst-1', 'inst-2', 'inst-3', 'inst-4', 'inst-5', 'inst-6'];
const SOCCER_NAV_ACTIONS = {
    'inst-6': () => startPractice(),
    'inst-after-p1': () => resumePracticeAfterP1(),
    'inst-practice-end': () => startFormal(1),
    'b2-start': () => startFormal(2)
};

window.onload = () => {
    setupSoccerInstructionNav();
    if (URL_RESUME_TRIAL_INDEX > 1) {
        showResumeConfirm(() => startFormal(targetBlock, URL_RESUME_TRIAL_INDEX));
        return;
    }
    if (targetBlock === 1) {
        showScreen('inst-1');
    } else {
        showScreen('b2-start');
    }
};

function setupSoccerInstructionNav() {
    const prevBtn = document.getElementById('soccer-prev-btn');
    const nextBtn = document.getElementById('soccer-next-btn');
    if (!prevBtn || !nextBtn) return;

    prevBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        soccerGuidePrev();
    });

    nextBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        soccerGuideNext();
    });
}

function isInstructionScreen(id) {
    return SOCCER_GUIDE_STEPS_BLOCK1.includes(id) ||
        id === 'inst-after-p1' ||
        id === 'inst-practice-end' ||
        id === 'b2-start';
}

function updateSoccerInstructionNav(id) {
    const nav = document.getElementById('soccer-guide-nav');
    const prevBtn = document.getElementById('soccer-prev-btn');
    const nextBtn = document.getElementById('soccer-next-btn');
    if (!nav || !prevBtn || !nextBtn) return;

    if (!isInstructionScreen(id)) {
        nav.style.display = 'none';
        return;
    }

    nav.style.display = 'flex';

    const idx = SOCCER_GUIDE_STEPS_BLOCK1.indexOf(id);
    if (idx >= 0) {
        prevBtn.disabled = idx === 0;
        nextBtn.innerText = id === 'inst-6' ? '开始练习' : '下一步';
        nextBtn.style.background = id === 'inst-6' ? '#FF9800' : '#0f3689';
        return;
    }

    prevBtn.disabled = true;
    if (id === 'inst-after-p1') {
        nextBtn.innerText = '继续练习';
        nextBtn.style.background = '#0f3689';
    } else if (id === 'inst-practice-end') {
        nextBtn.innerText = '正式开始';
        nextBtn.style.background = '#FF9800';
    } else if (id === 'b2-start') {
        nextBtn.innerText = '正式开始';
        nextBtn.style.background = '#FF9800';
    }
}

function soccerGuidePrev() {
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const idx = SOCCER_GUIDE_STEPS_BLOCK1.indexOf(active.id);
    if (idx > 0) showScreen(SOCCER_GUIDE_STEPS_BLOCK1[idx - 1]);
}

function soccerGuideNext() {
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const id = active.id;
    const idx = SOCCER_GUIDE_STEPS_BLOCK1.indexOf(id);

    if (idx >= 0) {
        if (idx < SOCCER_GUIDE_STEPS_BLOCK1.length - 1) {
            showScreen(SOCCER_GUIDE_STEPS_BLOCK1[idx + 1]);
        } else {
            startPractice();
        }
        return;
    }

    if (SOCCER_NAV_ACTIONS[id]) SOCCER_NAV_ACTIONS[id]();
}

function hideSoccerInstructionNav() {
    const nav = document.getElementById('soccer-guide-nav');
    if (nav) nav.style.display = 'none';
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (!target) {
        console.error('[Soccer] 找不到 screen:', id);
        return;
    }
    target.classList.add('active');
    updateSoccerInstructionNav(id);
}

function startPractice() {
    hideSoccerInstructionNav();
    currentPhase = 'practice';
    activeData = practiceData;
    currentIndex = 0;
    currentTrialStarted = false;
    startTrial();
}

function startFormal(blockNum, startTrialIndex) {
    hideSoccerInstructionNav();
    currentPhase = 'formal';
    activeData = blockNum === 1 ? b1Data : b2Data;
    currentIndex = Math.max(0, (parseInt(startTrialIndex || '1', 10) || 1) - 1);
    currentResults = [];
    if (currentIndex > 0) {
        try {
            const cached = JSON.parse(localStorage.getItem(SOCCER_RESUME_KEY) || '{}');
            if (Array.isArray(cached.currentResults)) currentResults = cached.currentResults;
        } catch (e) {}
    }
    currentTrialStarted = false;
    sendCheckpoint(currentIndex + 1);
    startTrial();
}

function startTrial() {
    hideSoccerInstructionNav();
    removeManualPlayButton();
    removeVideoErrorBox();

    if (currentCountdownTimer) {
        clearInterval(currentCountdownTimer);
        currentCountdownTimer = null;
    }

    const d = activeData[currentIndex];
    if (!d) {
        console.error('[Soccer] 当前 trial 不存在:', currentPhase, currentIndex, activeData);
        showVideoError('足球任务数据缺失', '当前 trial 不存在，请检查 soccer_sequence.js。');
        return;
    }

    showScreen('screen-countdown');
    let count = 3;
    document.getElementById('countdown-text').innerText = count;

    currentCountdownTimer = setInterval(() => {
        count -= 1;
        if (count > 0) {
            document.getElementById('countdown-text').innerText = count;
        } else {
            clearInterval(currentCountdownTimer);
            currentCountdownTimer = null;
            playVideo();
        }
    }, 1000);
}

function setOptionImage(id, src, label) {
    const img = document.getElementById(id);
    if (!img) return;
    img.onerror = function () {
        console.error('[Soccer] 选项图加载失败:', label, src);
        img.style.display = 'none';
    };
    img.onload = function () {
        img.style.display = 'block';
    };
    img.src = src;
}

function resetVideoElement(v) {
    try {
        v.pause();
        v.removeAttribute('src');
        v.load();
    } catch (e) {
        // ignore
    }
}

function playVideo() {
    hideSoccerInstructionNav();
    removeManualPlayButton();
    removeVideoErrorBox();

    const d = activeData[currentIndex];
    const v = document.getElementById('task-video');

    if (!d || !d.v) {
        console.error('[Soccer] 当前 trial 没有视频路径:', d);
        showVideoError('足球视频路径缺失', '当前 trial 没有视频路径，请检查 soccer_sequence.js。');
        return;
    }

    currentTrialStarted = false;

    console.log('[Soccer] 当前 trial:', {
        phase: currentPhase,
        index: currentIndex,
        block: d.blk,
        type: d.typ,
        tactical_point: d.tp,
        video: d.v,
        options: d.o
    });

    resetVideoElement(v);

    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';

    v.onerror = function () {
        console.error('[Soccer] 视频加载失败:', d.v, v.error);
        showVideoError(
            '足球视频加载失败',
            '程序正在调用下面这个文件：<br><br>' +
            '<code style="color:#93c5fd;word-break:break-all;">' + escapeHtml(d.v) + '</code><br><br>' +
            '请确认服务器中是否存在对应文件。'
        );
    };

    v.onended = function () {
        removeManualPlayButton();
        showScreen('screen-options');
        startTime = Date.now();
    };

    setOptionImage('opt-a', d.o.a, 'A');
    setOptionImage('opt-b', d.o.b, 'B');
    setOptionImage('opt-c', d.o.c, 'C');
    setOptionImage('opt-d', d.o.d, 'D');

    document.getElementById('text-a').innerText = d.texts[0];
    document.getElementById('text-b').innerText = d.texts[1];
    document.getElementById('text-c').innerText = d.texts[2];
    document.getElementById('text-d').innerText = d.texts[3];

    showScreen('screen-video');

    requestAnimationFrame(() => {
        console.log('[Soccer] 尝试视频路径:', d.v);
        v.src = d.v;
        v.load();

        const p = v.play();
        if (p && typeof p.catch === 'function') {
            p.catch(err => {
                console.warn('[Soccer] video.play() 被浏览器拦截或中断:', err, d.v);
                if (!v.error) showManualPlayButton(v);
            });
        }
    });
}

function showManualPlayButton(videoEl) {
    removeManualPlayButton();
    const btn = document.createElement('button');
    btn.className = 'manual-play-btn';
    btn.id = 'manual-play-btn';
    btn.innerText = '点击播放视频';
    btn.onclick = () => {
        btn.remove();
        videoEl.play().catch(err => {
            console.error('[Soccer] 手动播放仍失败:', err);
            showVideoError('视频仍无法播放', '请检查视频文件路径或浏览器视频编码支持。');
        });
    };
    document.body.appendChild(btn);
}

function removeManualPlayButton() {
    const old = document.getElementById('manual-play-btn');
    if (old) old.remove();
}

function showVideoError(title, html) {
    removeVideoErrorBox();
    const box = document.createElement('div');
    box.className = 'video-error-box';
    box.id = 'video-error-box';
    box.innerHTML = '<div class="video-error-inner">' +
        '<div style="font-size:30px;font-weight:bold;color:#ef4444;margin-bottom:16px;">' + title + '</div>' +
        '<div>' + html + '</div>' +
        '<button style="margin-top:24px;padding:12px 36px;font-size:20px;border:none;border-radius:10px;background:#0f3689;color:#fff;cursor:pointer;" onclick="document.getElementById(\'video-error-box\').remove()">关闭</button>' +
        '</div>';
    document.body.appendChild(box);
}

function removeVideoErrorBox() {
    const old = document.getElementById('video-error-box');
    if (old) old.remove();
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function submitAnswer(ans) {
    if (isDebounced()) return;
    const d = activeData[currentIndex];
    if (!d) return;

    const record = {
        phase: currentPhase,
        block: d.blk || '',
        type: d.typ || '',
        tactical_point: d.tp || '',
        ans: ans,
        correct: String(d.a_c || '').toUpperCase(),
        acc: ans === String(d.a_c || '').toUpperCase() ? 1 : 0,
        rt: Date.now() - startTime
    };

    uploadTrialData('Soccer', record);

    if (currentPhase === 'formal') currentResults.push(record);
    if (currentPhase === 'formal') {
        try { localStorage.setItem(SOCCER_RESUME_KEY, JSON.stringify({ currentResults })); } catch (e) {}
    }

    if (currentPhase === 'practice' && currentIndex === 0) {
        const specialImg = document.getElementById('special-d-img');
        if (specialImg) specialImg.src = d.o.d;
        const specialText = document.getElementById('special-d-text');
        if (specialText) specialText.innerText = d.texts[3];
        currentIndex += 1;
        showScreen('inst-after-p1');
        return;
    }

    currentIndex += 1;
    if (currentPhase === 'formal') sendCheckpoint(currentIndex + 1);

    if (currentIndex < activeData.length) {
        startTrial();
        return;
    }

    if (currentPhase === 'practice') {
        showScreen('inst-practice-end');
        return;
    }

    const rating = await showAttentionRating();
    currentResults.forEach(r => r.attention_rating = rating);

    const hdrs = ['phase', 'block', 'type', 'tactical_point', 'ans', 'correct', 'acc', 'rt', 'attention_rating'];
    const csv = hdrs.join(',') + '\n' +
        currentResults.map(r => hdrs.map(h => r[h]).join(',')).join('\n');

    window.parent.postMessage({ type: 'BLOCK_COMPLETED', csv: csv }, '*');
    try { localStorage.removeItem(SOCCER_RESUME_KEY); } catch (e) {}
}

function resumePracticeAfterP1() {
    if (currentIndex < activeData.length) startTrial();
}

function showAttentionRating() {
    hideSoccerInstructionNav();
    return new Promise(resolve => {
        const o = document.createElement('div');
        o.className = 'rating-overlay';
        o.innerHTML = '<div style="text-align:center;">' +
            '<h2 style="font-size:32px; margin-bottom:10px; color:#fff;">注意力评分</h2>' +
            '<p style="color:#ccc; margin-bottom:40px;">请给刚才阶段的专注程度打分 (1=极不专注, 9=极专注)</p>' +
            '<div style="display:flex; gap:15px;" id="rating-panel"></div>' +
            '</div>';
        document.body.appendChild(o);

        let clicked = false;
        const panel = o.querySelector('#rating-panel');
        for (let i = 1; i <= 9; i++) {
            const n = document.createElement('div');
            n.className = 'rating-num';
            n.innerText = i;
            const handler = (e) => {
                e.preventDefault();
                if (clicked) return;
                clicked = true;
                n.style.background = '#0f3689';
                n.style.color = '#fff';
                n.style.borderColor = '#0f3689';
                setTimeout(() => {
                    o.remove();
                    resolve(i);
                }, 100);
            };
            n.addEventListener('touchstart', handler, { passive: false });
            n.addEventListener('mousedown', handler);
            panel.appendChild(n);
        }
    });
}
