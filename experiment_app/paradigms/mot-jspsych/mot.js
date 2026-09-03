// ==========================================
// 1. 本地记录基础设施（不再单题上传旧服务器）
// ==========================================
let lastClickTime = 0;
const URL_PARAMS = new URLSearchParams(window.location.search);
const URL_SUBJECT_ID = URL_PARAMS.get('sid') || localStorage.getItem('exp_id') || 'TEST_ID';
const URL_ATTEMPT_ID = URL_PARAMS.get('attempt_id') || '';
const URL_RESUME_TRIAL_INDEX = Math.max(1, parseInt(URL_PARAMS.get('resume_trial_index') || '1', 10) || 1);

function isDebounced() {
    let now = Date.now();
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


// ==========================================
// 2. MOT 固定伪随机序列读取
// ==========================================
const {
    CONFIG,
    PRACTICE_SEQ,
    BLOCK1_SEQ,
    BLOCK2_SEQ,
    BLOCK3_SEQ
} = window.MOT_SEQUENCE;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// ==========================================
// [修改部分]：解除比例限制让框更宽更大，小球更大更快
// ==========================================
// 1. 动态改写 HTML 中的按钮位置，把它移动到距离底部 25px 的地方
const confirmBtn = document.getElementById('confirm-btn');
if (confirmBtn) {
    confirmBtn.style.bottom = '28px';
}

// 2. 逻辑中心点保持在屏幕绝对正中央
const CENTER_X = canvas.width / 2;
const CENTER_Y = canvas.height / 2 - 50;

// 3. 解除原有的 3:2 比例限制，框体完全适应屏幕真实比例（更宽更大）
// 宽度撑满到屏幕的 96%，高度减去 180px（给底部按钮和提示文字留足空间）
const areaW_px = window.innerWidth * 0.88;
const areaH_px = window.innerHeight - 180; 

// 4. 计算综合缩放系数（使用对角线比例计算，保证球在任何宽屏上视觉都协调）
const baseDiagonal = Math.hypot(480, 320); // 原设计基准的对角线 ~576
const currentDiagonal = Math.hypot(areaW_px, areaH_px);
const scaleFactor = currentDiagonal / baseDiagonal;

// 5. 小球大小：在之前的基础上稍微再放大一点（原 1.25 -> 现 1.4）
const radius_px = 16 * scaleFactor * 1.2;

// 6. 小球速度：在之前的基础上稍微再放快一点（原 1.2 -> 现 1.4）
CONFIG.PPU = 40 * scaleFactor * 0.8;
// ==========================================


// ==========================================
// 3. 全局状态
// ==========================================
let rngSeed = 12345;

function seededRandom() {
    rngSeed = (rngSeed * 9301 + 49297) % 233280;
    return rngSeed / 233280;
}

let state = 'INIT';
let balls = [];
let targetIndices = [];
let selectedIndices = [];
let trialPhaseTimer = 0;
let lastTime = 0;
let animationFrameId = null;

let drtActive = false;
let practiceDRTResponseActive = false;
let drtTimer = 0;
let drtEvents = [];
let allData = [];
let currentTrialResolver = null;
let currentPhaseId = "";
let globalTrialIndex = 1;

// ==========================================
// 轨迹记录：每 100ms 采样一次所有小球坐标，单独导出 MOT_trajectory_*.csv
// ==========================================
let trajectoryData = [];
let currentTrajectoryRows = [];
let lastTrajectorySampleTime = 0;
const TRAJECTORY_SAMPLE_INTERVAL_MS = 100;
const MOT_RESUME_KEY = `mot_resume_${URL_SUBJECT_ID}_${URL_ATTEMPT_ID}_${URL_PARAMS.get('block') || 'all'}`;
const PRACTICE_DRT_PASS_HITS = 5;

let drtStats = {
    hits: 0,
    misses: 0,
    invalid_clicks: 0,
    false_alarms: 0,
    rt_sum: 0
};

let currentTrialStartTimestampMs = 0;
let currentTrialEndTimestampMs = 0;
let currentTrialStartPerfMs = 0;
let drtButtonClickTimestamps = [];
let drtButtonHitTimestamps = [];
let drtButtonFalseAlarmTimestamps = [];
let drtButtonRTs = [];
let confirmButtonClickTimestampMs = "";
let confirmButtonClickPerfMs = "";

function saveLocalResumeData() {
    try {
        localStorage.setItem(MOT_RESUME_KEY, JSON.stringify({ allData, trajectoryData }));
    } catch (e) {}
}

function loadLocalResumeData() {
    if (URL_RESUME_TRIAL_INDEX <= 1) return;
    try {
        const raw = localStorage.getItem(MOT_RESUME_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.allData)) allData = parsed.allData;
        if (Array.isArray(parsed.trajectoryData)) trajectoryData = parsed.trajectoryData;
    } catch (e) {}
}

function sendCheckpoint(trialIndex, extra) {
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage(Object.assign({
                type: 'PARADIGM_CHECKPOINT',
                paradigm: 'MOT',
                block: new URLSearchParams(window.location.search).get('block') || '',
                attempt_id: URL_ATTEMPT_ID,
                trial_index: Math.max(1, trialIndex || 1),
                resume_trial_index: Math.max(1, trialIndex || 1)
            }, extra || {}), '*');
        }
    } catch (e) {}
}

async function confirmResumeIfNeeded() {
    if (URL_RESUME_TRIAL_INDEX <= 1) return;
    await showSimpleOverlay(
        `【进度恢复】<br><br><span style="color:#ccc;font-size:1.5rem;">将从第 ${URL_RESUME_TRIAL_INDEX} 题开始。请确认准备好后正式继续。</span>`,
        "确认，正式开始"
    );
}

function isMotionState() {
    return state === 'NORMAL_MOVE' || state === 'NORMAL_MOVE_0';
}

function isDRTButtonStage() {
    return (
        state === 'STATIC' ||
        state === 'STATIC_0' ||
        state === 'HIGHLIGHT_MOVE' ||
        state === 'NORMAL_MOVE' ||
        state === 'NORMAL_MOVE_0'
    );
}

function isPracticeDRTTrial() {
    return currentPhaseId === "Practice";
}

function startDRTSignal() {
    if (practiceDRTResponseActive && isPracticeDRTTrial()) {
        practiceDRTResponseActive = false;
        drtActive = false;
        drtStats.misses++;
    }

    drtActive = true;
    practiceDRTResponseActive = isPracticeDRTTrial();
    drtTimer = 0;
    drtEvents.shift();
    setActionButton('click');
}

function updateDRTWindow(dt) {
    if (!drtActive && !practiceDRTResponseActive) return;

    drtTimer += dt * 1000;

    if (isPracticeDRTTrial()) {
        if (drtActive && drtTimer >= CONFIG.drtMaxDur) {
            drtActive = false;
            setActionButton('click');
        }
        return;
    }

    if (drtTimer >= CONFIG.drtMaxDur) {
        drtActive = false;
        drtStats.misses++;
        setActionButton('click');
    }
}

function closePracticeDRTWindowAtMotionEnd() {
    if (!practiceDRTResponseActive || !isPracticeDRTTrial()) return;

    practiceDRTResponseActive = false;
    drtActive = false;
    drtStats.misses++;
}

function setActionButton(mode) {
    const btn = document.getElementById('confirm-btn');
    if (!btn) return;

    if (mode === 'click') {
        btn.style.display = 'block';
        btn.disabled = false;
        btn.innerText = '点击';
        btn.style.background = '#4DA3FF';
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        return;
    }

    if (mode === 'disabled_click') {
        btn.style.display = 'block';
        btn.disabled = true;
        btn.innerText = '点击';
        btn.style.background = '#4DA3FF';
        btn.style.opacity = '0.45';
        btn.style.cursor = 'not-allowed';
        return;
    }

    if (mode === 'confirm_disabled') {
        btn.style.display = 'block';
        btn.disabled = true;
        btn.innerText = '确认提交';
        btn.style.background = '#4DA3FF';
        btn.style.opacity = '0.45';
        btn.style.cursor = 'not-allowed';
        return;
    }

    if (mode === 'confirm') {
        btn.style.display = 'block';
        btn.disabled = false;
        btn.innerText = '确认提交';
        btn.style.background = '#4DA3FF';
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        return;
    }

    btn.style.display = 'none';
    btn.disabled = true;
    btn.innerText = '点击';
    btn.style.background = '#4DA3FF';
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
}

function handleDRTButtonClick() {
    // 新版 DRT：按钮从小球出现后一直显示。红框出现时点击算 DRT 命中；红框未出现时点击算误按。
    if (!isDRTButtonStage()) return false;

    const nowTs = Date.now();
    drtButtonClickTimestamps.push(nowTs);

    if (drtActive || (isPracticeDRTTrial() && practiceDRTResponseActive)) {
        drtActive = false;
        practiceDRTResponseActive = false;
        drtStats.hits++;
        drtStats.rt_sum += drtTimer;
        drtButtonHitTimestamps.push(nowTs);
        drtButtonRTs.push(Math.round(drtTimer));
        setActionButton('click');
        return true;
    }

    drtStats.false_alarms++;
    drtButtonFalseAlarmTimestamps.push(nowTs);
    setActionButton('click');
    return true;
}


// ==========================================
// 4. 小球类
// ==========================================
class Ball {
    constructor(index, isTarget) {
        this.index = index;
        this.isTarget = isTarget;

        this.x = (seededRandom() - 0.5) * (areaW_px - radius_px * 2);
        this.y = (seededRandom() - 0.5) * (areaH_px - radius_px * 2);

        let angle = seededRandom() * Math.PI * 2;
        let speed_px = CONFIG.baseSpeed * CONFIG.PPU;

        this.vx = Math.cos(angle) * speed_px;
        this.vy = Math.sin(angle) * speed_px;
    }

    update(dt) {
        let angleChange = (seededRandom() - 0.5) * 0.1;
        let currentAngle = Math.atan2(this.vy, this.vx);

        let speed = Math.hypot(this.vx, this.vy) + (seededRandom() - 0.5) * 0.3 * CONFIG.PPU;

        if (speed < CONFIG.minSpeed * CONFIG.PPU) {
            speed = CONFIG.minSpeed * CONFIG.PPU;
        }

        if (speed > CONFIG.maxSpeed * CONFIG.PPU) {
            speed = CONFIG.maxSpeed * CONFIG.PPU;
        }

        currentAngle += angleChange;

        this.vx = Math.cos(currentAngle) * speed;
        this.vy = Math.sin(currentAngle) * speed;

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        const limitX = areaW_px / 2 - radius_px;
        const limitY = areaH_px / 2 - radius_px;

        if (this.x > limitX) {
            this.x = limitX;
            this.vx *= -1;
        }

        if (this.x < -limitX) {
            this.x = -limitX;
            this.vx *= -1;
        }

        if (this.y > limitY) {
            this.y = limitY;
            this.vy *= -1;
        }

        if (this.y < -limitY) {
            this.y = -limitY;
            this.vy *= -1;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(
            CENTER_X + this.x,
            CENTER_Y + this.y,
            radius_px,
            0,
            Math.PI * 2
        );

        if (state === 'SELECTION') {
            ctx.fillStyle = selectedIndices.includes(this.index) ? '#4DA3FF' : '#D9D9D9';
        } else if (state === 'STATIC_0' || state === 'NORMAL_MOVE_0') {
            ctx.fillStyle = '#D9D9D9';
        } else if (state === 'STATIC' || state === 'HIGHLIGHT_MOVE') {
            ctx.fillStyle = this.isTarget ? '#FFFF00' : '#D9D9D9';
        } else {
            ctx.fillStyle = '#D9D9D9';
        }

        ctx.fill();
    }
}



// ==========================================
// 4.5 小球接触/轻微重叠处理
// ==========================================
function clampBallToArea(ball) {
    const limitX = areaW_px / 2 - radius_px;
    const limitY = areaH_px / 2 - radius_px;

    if (ball.x > limitX) ball.x = limitX;
    if (ball.x < -limitX) ball.x = -limitX;
    if (ball.y > limitY) ball.y = limitY;
    if (ball.y < -limitY) ball.y = -limitY;
}

function resolveBallCollisions(iterations = 2) {
    if (!CONFIG.collisionEnabled) return;

    const minDist = radius_px * 2 * (CONFIG.minBallDistanceRatio || 0.95);
    const bounce = CONFIG.collisionBounce === undefined ? 1.0 : CONFIG.collisionBounce;

    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                const a = balls[i];
                const b = balls[j];
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let dist = Math.hypot(dx, dy);

                if (dist === 0) {
                    // 极端完全重合时使用固定方向分开，避免引入新随机数。
                    const angle = ((i + 1) * 17 + (j + 1) * 31) * Math.PI / 180;
                    dx = Math.cos(angle);
                    dy = Math.sin(angle);
                    dist = 1;
                }

                if (dist < minDist) {
                    const nx = dx / dist;
                    const ny = dy / dist;
                    const overlap = minDist - dist;

                    a.x -= nx * overlap / 2;
                    a.y -= ny * overlap / 2;
                    b.x += nx * overlap / 2;
                    b.y += ny * overlap / 2;

                    clampBallToArea(a);
                    clampBallToArea(b);

                    // 法向速度分量互换，形成“接触后弹开/滑开”的效果。
                    const va = a.vx * nx + a.vy * ny;
                    const vb = b.vx * nx + b.vy * ny;
                    const impulse = (vb - va) * bounce;
                    a.vx += impulse * nx;
                    a.vy += impulse * ny;
                    b.vx -= impulse * nx;
                    b.vy -= impulse * ny;
                }
            }
        }
    }
}

function updateBalls(dt) {
    balls.forEach(b => b.update(dt));
    resolveBallCollisions(2);
}

// ==========================================
// 5. 单 trial 启动
// ==========================================
function startTrial(trialSpecOrCount) {
    return new Promise(resolve => {
        currentTrialResolver = resolve;

        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        const trialSpec = (typeof trialSpecOrCount === 'object')
            ? trialSpecOrCount
            : {
                sequence_id: `legacy_${globalTrialIndex}`,
                target_count: trialSpecOrCount,
                target_indices: null,
                drt_events: null,
                seed: 2026000 + globalTrialIndex * 137
            };

        const targetCount = trialSpec.target_count;

        balls = [];
        targetIndices = [];
        selectedIndices = [];
        drtEvents = [];
        practiceDRTResponseActive = false;
        currentTrajectoryRows = [];
        lastTrajectorySampleTime = -TRAJECTORY_SAMPLE_INTERVAL_MS;

        drtStats = {
            hits: 0,
            misses: 0,
            invalid_clicks: 0,
            false_alarms: 0,
            rt_sum: 0
        };
        currentTrialStartTimestampMs = Date.now();
        currentTrialEndTimestampMs = 0;
        currentTrialStartPerfMs = performance.now();
        drtButtonClickTimestamps = [];
        drtButtonHitTimestamps = [];
        drtButtonFalseAlarmTimestamps = [];
        drtButtonRTs = [];
        confirmButtonClickTimestampMs = "";
        confirmButtonClickPerfMs = "";

        setActionButton('click');

        // 固定 seed：同一个 trial 每次运行轨迹一致
        rngSeed = trialSpec.seed;

        // 固定目标球编号
        if (Array.isArray(trialSpec.target_indices)) {
            targetIndices = [...trialSpec.target_indices];
        } else {
            let available = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

            for (let i = 0; i < targetCount; i++) {
                targetIndices.push(
                    available.splice(
                        Math.floor(seededRandom() * available.length),
                        1
                    )[0]
                );
            }
        }

        for (let i = 0; i < CONFIG.totalDots; i++) {
            balls.push(new Ball(i, targetIndices.includes(i)));
        }
        resolveBallCollisions(6);

        // 固定 DRT 出现时间
        if (Array.isArray(trialSpec.drt_events)) {
            drtEvents = [...trialSpec.drt_events];
        } else if (targetCount === 0) {
            drtEvents = [1500, 4000, 7000];
        } else {
            drtEvents = [3200, 5200, 7400];
        }

        drtEvents.sort((a, b) => a - b);

        window.__CURRENT_MOT_TRIAL_SPEC__ = {
            sequence_id: trialSpec.sequence_id || `trial_${globalTrialIndex}`,
            seed: trialSpec.seed,
            target_count: targetCount,
            target_indices: [...targetIndices],
            drt_events: [...drtEvents]
        };

        state = targetCount === 0 ? 'STATIC_0' : 'STATIC';
        trialPhaseTimer = 0;
        lastTime = performance.now();

        document.getElementById('app').style.display = 'flex';
        animationFrameId = requestAnimationFrame(gameLoop);
    });
}


// ==========================================
// 6. 轨迹采样
// ==========================================
function sampleTrajectory() {
    const spec = window.__CURRENT_MOT_TRIAL_SPEC__ || {};
    const tMs = Math.round(trialPhaseTimer);

    // 按固定间隔采样，避免每帧都写导致文件过大
    if (tMs - lastTrajectorySampleTime < TRAJECTORY_SAMPLE_INTERVAL_MS) return;
    lastTrajectorySampleTime = tMs;

    balls.forEach(b => {
        currentTrajectoryRows.push({
            block_type: currentPhaseId,
            trial_index: globalTrialIndex,
            sequence_id: spec.sequence_id || "",
            motion_seed: spec.seed || "",
            time_ms: tMs,
            ball_index: b.index,
            x_px: Math.round(b.x),
            y_px: Math.round(b.y),
            x_center_px: Math.round(CENTER_X + b.x),
            y_center_px: Math.round(CENTER_Y + b.y),
            is_target: targetIndices.includes(b.index) ? 1 : 0,
            state: state
        });
    });
}


// ==========================================
// 6. 主循环
// ==========================================
function gameLoop(timestamp) {
    if (state === 'INIT' || state === 'END') return;

    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (dt > 0.1) dt = 0.016;

    trialPhaseTimer += dt * 1000;

    if (state === 'STATIC_0') {
        if (trialPhaseTimer >= 500) {
            state = 'NORMAL_MOVE_0';
            trialPhaseTimer = 0;
        }
    }

    else if (state === 'NORMAL_MOVE_0') {
        updateBalls(dt);

        if (drtEvents.length > 0 && trialPhaseTimer >= drtEvents[0]) {
            startDRTSignal();
        }

        updateDRTWindow(dt);

        if (trialPhaseTimer >= 10000) {
            state = 'INIT';
            closePracticeDRTWindowAtMotionEnd();

            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;

            setTimeout(() => {
                finishTrial(0);
            }, 300);

            return;
        }
    }

    else if (state === 'STATIC') {
        if (trialPhaseTimer >= 500) {
            state = 'HIGHLIGHT_MOVE';
            trialPhaseTimer = 0;
        }
    }

    else if (state === 'HIGHLIGHT_MOVE') {
        updateBalls(dt);

        if (trialPhaseTimer >= 2500) {
            state = 'NORMAL_MOVE';
            trialPhaseTimer = 0;
        }
    }

    else if (state === 'NORMAL_MOVE') {
        updateBalls(dt);

        if (drtEvents.length > 0 && trialPhaseTimer >= drtEvents[0]) {
            startDRTSignal();
        }

        updateDRTWindow(dt);

        if (trialPhaseTimer >= 7500) {
            state = 'SELECTION';
            closePracticeDRTWindowAtMotionEnd();
            drtActive = false;
            setActionButton('hidden');
        }
    }

    if (
        state === 'STATIC' ||
        state === 'STATIC_0' ||
        state === 'HIGHLIGHT_MOVE' ||
        state === 'NORMAL_MOVE' ||
        state === 'NORMAL_MOVE_0' ||
        state === 'SELECTION'
    ) {
        sampleTrajectory();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.strokeRect(
        CENTER_X - areaW_px / 2,
        CENTER_Y - areaH_px / 2,
        areaW_px,
        areaH_px
    );

    if (drtActive) {
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 6;
        ctx.strokeRect(
            CENTER_X - areaW_px / 2 - 5,
            CENTER_Y - areaH_px / 2 - 5,
            areaW_px + 10,
            areaH_px + 10
        );
    }

    balls.forEach(b => b.draw());

    if (state === 'SELECTION') {
        ctx.fillStyle = 'white';
        ctx.font = '24px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';

        if (selectedIndices.length < targetIndices.length) {
            // 文字稍微往上提一点，避免干扰框体
            ctx.fillText(
                `请点击选出 ${targetIndices.length} 个目标小球 (已选 ${selectedIndices.length})`,
                CENTER_X,
                CENTER_Y - areaH_px / 2 - 18
            );

            // 小球停止运动进入选择阶段后，按钮立即变成“确认提交”；未选满时保持不可用。
            setActionButton('confirm_disabled');
        } else {
            ctx.fillStyle = '#4DA3FF';
            ctx.fillText(
                `已选满 ${targetIndices.length} 个小球，请点击下方【确认提交】进入下一题`,
                CENTER_X,
                CENTER_Y - areaH_px / 2 - 18
            );

            setActionButton('confirm');
        }
    }

    animationFrameId = requestAnimationFrame(gameLoop);
}


// ==========================================
// 7. 点击反应
// ==========================================
window.addEventListener('mousedown', (e) => {
    if (state === 'INIT' || state === 'END') return;
    if (e.target.id === 'confirm-btn') return;
    if (isDebounced()) return;

    const clickX = e.clientX - CENTER_X;
    const clickY = e.clientY - CENTER_Y;

    // 找出点击范围内的所有小球，而不是只取第一个
    const hitCandidates = balls
        .map(b => {
            return {
                index: b.index,
                dist: Math.hypot(clickX - b.x, clickY - b.y)
            };
        })
        .filter(h => h.dist <= radius_px + 10)
        .sort((a, b) => a.dist - b.dist);

    let clickedBallIndex = -1;

    if (hitCandidates.length > 0) {
        if (state === 'SELECTION') {
            // 选择阶段：
            // 如果重叠区域里有多个小球，优先选择还没被选中的小球。
            // 这样同一个重叠位置点第二次，可以选中另一个重叠小球。
            const unselected = hitCandidates.find(h => !selectedIndices.includes(h.index));

            if (unselected && selectedIndices.length < targetIndices.length) {
                clickedBallIndex = unselected.index;
            } else {
                // 如果点击范围内的小球都已经被选中了，则取消最近的那个
                clickedBallIndex = hitCandidates[0].index;
            }
        } else {
            // 运动阶段：
            // DRT 要求点空白处，所以只要点到任意小球，就算点到小球。
            clickedBallIndex = hitCandidates[0].index;
        }
    }

    if (state === 'NORMAL_MOVE' || state === 'NORMAL_MOVE_0') {
        // 新版 DRT：红框出现时必须点击下方按钮，不再点击屏幕空白处。
        // 运动阶段的屏幕点击只记录为误触/无效点击，不作为 DRT 命中。
        if (drtActive) {
            drtStats.invalid_clicks++;
        } else {
            drtStats.false_alarms++;
        }
    }

    else if (state === 'SELECTION' && clickedBallIndex !== -1) {
        let idx = selectedIndices.indexOf(clickedBallIndex);

        if (idx > -1) {
            selectedIndices.splice(idx, 1);
        } else if (selectedIndices.length < targetIndices.length) {
            selectedIndices.push(clickedBallIndex);
        }
    }
});

const cBtn = document.getElementById('confirm-btn');
if (cBtn) {
    cBtn.onclick = (e) => {
        if (isDebounced()) return;

        e.stopPropagation();

        if (isDRTButtonStage()) {
            handleDRTButtonClick();
            return;
        }

        if (state !== 'SELECTION') return;
        if (selectedIndices.length !== targetIndices.length) return;

        confirmButtonClickTimestampMs = Date.now();
        confirmButtonClickPerfMs = Math.round(performance.now() - currentTrialStartPerfMs);
        setActionButton('hidden');

        state = 'INIT';

        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;

        setTimeout(() => {
            finishTrial(targetIndices.length);
        }, 300);
    };
}


// ==========================================
// 8. 结束单 trial，写记录
// ==========================================
function finishTrial(tCount) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setActionButton('hidden');
    currentTrialEndTimestampMs = Date.now();

    let meanDRT = drtStats.hits > 0
        ? Math.round(drtStats.rt_sum / drtStats.hits)
        : 0;

    let correctCount = 0;
    let falseSelection = 0;
    let missTarget = 0;
    let motAcc = "NA";

    if (tCount > 0) {
        correctCount = selectedIndices.filter(x => targetIndices.includes(x)).length;
        falseSelection = selectedIndices.length - correctCount;
        missTarget = tCount - correctCount;
        motAcc = (correctCount / tCount).toFixed(2);
    }

    let specForRecord = window.__CURRENT_MOT_TRIAL_SPEC__ || {};

    let record = {
        block_type: currentPhaseId,
        trial_index: globalTrialIndex++,

        sequence_id: specForRecord.sequence_id || "",
        motion_seed: specForRecord.seed || "",
        target_count: tCount,
        fixed_target_indices: JSON.stringify(specForRecord.target_indices || []),
        fixed_drt_events: JSON.stringify(specForRecord.drt_events || []),

        trial_start_timestamp_ms: currentTrialStartTimestampMs,
        trial_end_timestamp_ms: currentTrialEndTimestampMs,
        trial_duration_ms: currentTrialEndTimestampMs && currentTrialStartTimestampMs ? currentTrialEndTimestampMs - currentTrialStartTimestampMs : "",
        mot_motion_duration_setting_ms: tCount > 0 ? 10000 : 10000,
        mot_highlight_motion_duration_setting_ms: tCount > 0 ? 2500 : 0,
        mot_normal_motion_duration_setting_ms: tCount > 0 ? 7500 : 10000,
        drt_response_mode: "button_always_visible",
        drt_button_click_count: drtButtonClickTimestamps.length,
        drt_button_click_timestamps_ms: JSON.stringify(drtButtonClickTimestamps),
        drt_button_hit_click_count: drtButtonHitTimestamps.length,
        drt_button_hit_timestamps_ms: JSON.stringify(drtButtonHitTimestamps),
        drt_button_false_alarm_timestamps_ms: JSON.stringify(drtButtonFalseAlarmTimestamps),
        drt_button_rt_list_ms: JSON.stringify(drtButtonRTs),
        confirm_button_click_timestamp_ms: confirmButtonClickTimestampMs,
        confirm_button_click_elapsed_ms: confirmButtonClickPerfMs,

        drt_signal_count: Array.isArray(specForRecord.drt_events) ? specForRecord.drt_events.length : drtButtonHitTimestamps.length + drtStats.misses,
        drt_hit_count: drtStats.hits,
        drt_miss_count: drtStats.misses,
        drt_invalid_click_count: drtStats.invalid_clicks,
        drt_false_alarm_count: drtStats.false_alarms,
        drt_mean_rt: meanDRT,

        mot_selected_count: selectedIndices.length,
        mot_correct_count: correctCount,
        mot_false_selection_count: falseSelection,
        mot_miss_target_count: missTarget,
        mot_accuracy: motAcc,

        attention_rating: ""
    };

    uploadTrialData("MOT", record);
    allData.push(record);
    trajectoryData.push(...currentTrajectoryRows);
    saveLocalResumeData();

    document.getElementById('app').style.display = 'none';

    if (currentTrialResolver) {
        let res = currentTrialResolver;
        currentTrialResolver = null;
        res();
    }
}


// ==========================================
// 9. 指导语
// ==========================================
function runRedBoxGuide(finalButtonText) {
    return new Promise(resolve => {
        const overlay = document.getElementById('unified-instruction-overlay');
        const redBox = document.getElementById('dynamic-red-box');
        const nextBtn = document.getElementById('guide-next-btn');
        const container = document.getElementById('instruction-content');
        const subText = document.getElementById('subtitle-text');
        let prevBtn = document.getElementById('guide-prev-btn');
        if (!prevBtn) {
            prevBtn = document.createElement('button');
            prevBtn.id = 'guide-prev-btn';
            prevBtn.className = 'next-step-btn';
            prevBtn.type = 'button';
            prevBtn.innerText = '\u4e0a\u4e00\u6b65';
            prevBtn.style.background = '#64748b';
            prevBtn.style.marginRight = '12px';
            nextBtn.parentNode.insertBefore(prevBtn, nextBtn);
        }

        finalButtonText = finalButtonText || '进入练习';

        const stepsData = [
            {
                targetId: 'img-target-1',
                text: "【追踪小球们】<br>开始时，会有几个小球亮起黄色，请<b>死死盯住它们</b>。"
            },
            {
                targetId: 'img-target-2',
                text: "随后它们会变回灰色并无规则运动。请<b>持续追踪</b>这些目标小球的位置。"
            },
            {
                targetId: 'img-target-3',
                text: "【注意红框！】<br>小球运动过程中，下方会一直显示<b>“点击”</b>按钮。<br>如果屏幕边缘出现<span style='color:#F44336; font-weight:bold;'>红色边框</span>，请<b>立即点击下方“点击”按钮</b>。"
            },
            {
                targetId: 'img-target-4',
                text: "运动停止后，下方按钮会变成<b>“确认提交”</b>。<br>请先<b>点击选出</b>刚才追踪的所有目标小球；选满后再点击“确认提交”进入下一题。"
            }
        ];

        let currentStep = 0;

        overlay.style.display = 'flex';

        function highlightStep(index) {
            if (index >= stepsData.length) {
                overlay.style.display = 'none';
                document.getElementById('app').style.display = 'flex';
                resolve();
                return;
            }

            const data = stepsData[index];

            document.querySelectorAll('.guide-img-wrapper').forEach(el => {
                el.classList.toggle('active', el.id === data.targetId);
            });

            subText.style.opacity = 0;

            setTimeout(() => {
                subText.innerHTML = data.text;
                subText.style.opacity = 1;
            }, 200);

            setTimeout(() => {
                if (data.targetId) {
                    const targetEl = document.getElementById(data.targetId);

                    if (targetEl) {
                        const targetRect = targetEl.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();

                        redBox.style.display = 'block';
                        redBox.style.top = (targetRect.top - containerRect.top) + 'px';
                        redBox.style.left = (targetRect.left - containerRect.left) + 'px';
                        redBox.style.width = targetRect.width + 'px';
                        redBox.style.height = targetRect.height + 'px';
                    } else {
                        redBox.style.display = 'none';
                    }
                } else {
                    redBox.style.display = 'none';
                }

                if (index === stepsData.length - 1) {
                    nextBtn.innerText = finalButtonText;
                    nextBtn.style.background = "#FF9800";
                } else {
                    nextBtn.innerText = "下一步";
                    nextBtn.style.background = "#4DA3FF";
                }
                prevBtn.disabled = index === 0;
                prevBtn.style.opacity = index === 0 ? '0.45' : '1';
                prevBtn.style.cursor = index === 0 ? 'not-allowed' : 'pointer';
            }, 100);
        }

        nextBtn.onclick = () => {
            currentStep++;
            highlightStep(currentStep);
        };
        prevBtn.onclick = () => {
            if (currentStep <= 0) return;
            currentStep--;
            highlightStep(currentStep);
        };

        highlightStep(0);
    });
}

function showSimpleOverlay(textHTML, btnText) {
    return new Promise(resolve => {
        const div = document.createElement('div');

        div.className = "simple-overlay";

        div.innerHTML = `
            <div style="font-size:2rem; line-height:1.6; font-weight:bold; max-width:800px; margin-bottom:50px;">
                ${textHTML}
            </div>
            <button style="padding:15px 50px; font-size:1.5rem; font-weight:bold; background:#4DA3FF; color:white; border:none; border-radius:10px; cursor:pointer;">
                ${btnText}
            </button>
        `;

        document.body.appendChild(div);

        div.querySelector('button').onclick = () => {
            div.remove();
            resolve();
        };
    });
}


// ==========================================
// 10. 注意力评分：每个正式阶段结束后调用
// ==========================================
function showAttentionRating(stageLabel) {
    return new Promise(resolve => {
        document.getElementById('app').style.display = 'none';

        const o = document.createElement("div");

        o.style.cssText = `
            position: fixed;
            inset: 0;
            background: #000;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
        `;

        o.innerHTML = `
            <div style="text-align:center;">
                <h2 style="font-size:32px; margin-bottom:10px; color:#fff;">注意力评分</h2>
                <p style="color:#ccc; margin-bottom:40px; line-height:1.8;">
                    ${stageLabel || "在刚才的追踪小球任务里"}，请你给自己的专注程度打分<br>
                    <span style="font-size:20px;">1 = 非常不专注，9 = 非常专注</span>
                </p>
                <div style="display:flex; gap:15px;" id="rating-panel"></div>
            </div>
        `;

        document.body.appendChild(o);

        let clicked = false;
        const panel = o.querySelector('#rating-panel');

        for (let i = 1; i <= 9; i++) {
            const n = document.createElement('div');

            n.innerText = i;

            n.style.cssText = `
                width: 75px;
                height: 75px;
                background: #1e293b;
                color: #f8fafc;
                font-size: 28px;
                font-weight: bold;
                border-radius: 15px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border: 2px solid #334155;
                box-sizing: border-box;
                user-select: none;
            `;

            const handler = (e) => {
                e.preventDefault();

                if (clicked) return;

                clicked = true;

                n.style.background = '#0f3689';
                n.style.color = '#fff';
                n.style.borderColor = '#4DA3FF';

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

async function rateFormalBlock(blockType, stageLabel) {
    const rating = await showAttentionRating(stageLabel);

    allData
        .filter(r => r.block_type === blockType)
        .forEach(r => {
            r.attention_rating = rating;
        });

    return rating;
}


// ==========================================
// 11. 运行 block 和提交 CSV
// ==========================================
async function runBlock(targetsCountList, phaseId, startTrialIndex) {
    currentPhaseId = phaseId;
    const startIdx = Math.max(0, (parseInt(startTrialIndex || '1', 10) || 1) - 1);

    for (let i = startIdx; i < targetsCountList.length; i++) {
        sendCheckpoint(i + 1, { block_type: phaseId });
        if (i > startIdx) {
            await showSimpleOverlay(
                "准备下一题<br><br><span style='color:#ccc; font-size:1.4rem; font-weight:normal;'>请被试重新集中注意力，准备好后开始。</span>",
                "开始下一题"
            );
        }
        await startTrial(targetsCountList[i]);
        sendCheckpoint(Math.min(i + 2, targetsCountList.length + 1), { block_type: phaseId });
    }
}

async function runPracticeUntilDRTPassed() {
    let practiceAttempt = 1;

    while (true) {
        const startDataLength = allData.length;
        await runBlock(PRACTICE_SEQ, "Practice");

        const practiceRows = allData
            .slice(startDataLength)
            .filter(row => row.block_type === "Practice");
        const practiceHitCount = practiceRows.reduce((sum, row) => {
            return sum + (Number(row.drt_hit_count) || 0);
        }, 0);
        const practiceSignalCount = practiceRows.reduce((sum, row) => {
            return sum + (Number(row.drt_signal_count) || 0);
        }, 0);
        const practicePassed = practiceHitCount >= PRACTICE_DRT_PASS_HITS;

        practiceRows.forEach(row => {
            row.practice_attempt = practiceAttempt;
            row.practice_drt_total_hits = practiceHitCount;
            row.practice_drt_total_signals = practiceSignalCount;
            row.practice_drt_passed = practicePassed ? 1 : 0;
        });

        if (practicePassed) return;

        practiceAttempt++;
        await showSimpleOverlay(
            "\u51fa\u73b0\u7ea2\u6846\u8981\u70b9\u51fb\u6309\u94ae",
            "\u91cd\u65b0\u7ec3\u4e60"
        );
    }
}

function generateTrajectoryCSV() {
    const headers = [
        "block_type",
        "trial_index",
        "sequence_id",
        "motion_seed",
        "time_ms",
        "ball_index",
        "x_px",
        "y_px",
        "x_center_px",
        "y_center_px",
        "is_target",
        "state"
    ];

    const rows = trajectoryData.map(r => {
        return headers.map(h => {
            const v = r[h];
            if (v === undefined || v === null) return "";
            return String(v).replace(/,/g, ";");
        }).join(",");
    });

    return headers.join(",") + "\n" + rows.join("\n");
}

function finishAndPost() {
    const hdrs = Object.keys(allData[0]);

    const csvStr =
        hdrs.join(",") +
        "\n" +
        allData
            .map(r => hdrs.map(h => {
                const v = r[h];
                return JSON.stringify(v === undefined || v === null ? "" : v).replace(/,/g, ';');
            }).join(","))
            .join("\n");

    const trajectoryCsv = generateTrajectoryCSV();

    window.parent.postMessage({
        type: 'BLOCK_COMPLETED',
        csv: csvStr,
        files: [
            {
                filename: `MOT_trajectory_${currentPhaseId || "block"}.csv`,
                content: trajectoryCsv
            }
        ]
    }, '*');
    try { localStorage.removeItem(MOT_RESUME_KEY); } catch (e) {}
}


// ==========================================
// 12. 主流程
// ==========================================
async function main() {
    const urlParams = new URLSearchParams(window.location.search);
    const blockMode = urlParams.get('block') || 'all';
    loadLocalResumeData();
    const guideOverlay = document.getElementById('unified-instruction-overlay');
    if (guideOverlay) guideOverlay.style.display = 'none';

    if (blockMode === 'all') {
        await runRedBoxGuide();

        document.getElementById('app').style.display = 'none';

        await showSimpleOverlay(
            "【练习阶段】<br><br><span style='color:#ccc; font-size:1.4rem; font-weight:normal;'>包含 0/3/5 目标情况，熟悉追踪、选球和应对红框！</span>",
            "点击屏幕开始练习"
        );

        await runPracticeUntilDRTPassed();

        await showSimpleOverlay(
            "【练习结束，进入正式测试】<br><br><span style='color:#ccc; font-size:1.4rem; font-weight:normal;'>一定要盯紧目标小球！</span>",
            "开始正式测试"
        );

        await confirmResumeIfNeeded();
        await runBlock(BLOCK1_SEQ, "formal_block_1", URL_RESUME_TRIAL_INDEX);
        await rateFormalBlock("formal_block_1", "在刚才的追踪小球第一阶段里");

        await showSimpleOverlay(
            "休息一下。<br><br>准备好后进入下一组追踪。",
            "点击继续"
        );

        await confirmResumeIfNeeded();
        await runBlock(BLOCK2_SEQ, "formal_block_2", URL_RESUME_TRIAL_INDEX);
        await rateFormalBlock("formal_block_2", "在刚才的追踪小球第二阶段里");

        await showSimpleOverlay(
            "最后冲刺！<br><br>准备好后进入最后一组。",
            "点击继续"
        );

        await confirmResumeIfNeeded();
        await runBlock(BLOCK3_SEQ, "formal_block_3", URL_RESUME_TRIAL_INDEX);
        await rateFormalBlock("formal_block_3", "在刚才的追踪小球第三阶段里");

        finishAndPost();
    }

    else if (blockMode === '1') {
        await runRedBoxGuide();

        document.getElementById('app').style.display = 'none';

        await showSimpleOverlay(
            "【练习阶段】<br><br><span style='color:#ccc; font-size:1.4rem; font-weight:normal;'>先进行练习，熟悉追踪和小球选择</span>",
            "点击屏幕开始练习"
        );

        await runPracticeUntilDRTPassed();

        await showSimpleOverlay(
            "【练习结束，进入正式测试】<br><br><span style='color:#ccc; font-size:1.4rem; font-weight:normal;'>一定要盯紧目标小球！</span>",
            "开始正式测试"
        );

        await confirmResumeIfNeeded();
        await runBlock(BLOCK1_SEQ, "formal_block_1", URL_RESUME_TRIAL_INDEX);
        await rateFormalBlock("formal_block_1", "在刚才的追踪小球第一阶段里");

        finishAndPost();
    }

    else if (blockMode === '2') {
        await runRedBoxGuide('开始正式测试');

        await confirmResumeIfNeeded();
        await runBlock(BLOCK2_SEQ, "formal_block_2", URL_RESUME_TRIAL_INDEX);
        await rateFormalBlock("formal_block_2", "在刚才的追踪小球第二阶段里");

        finishAndPost();
    }

    else if (blockMode === '3') {
        await runRedBoxGuide('开始正式测试');

        await confirmResumeIfNeeded();
        await runBlock(BLOCK3_SEQ, "formal_block_3", URL_RESUME_TRIAL_INDEX);
        await rateFormalBlock("formal_block_3", "在刚才的追踪小球第三阶段里");

        finishAndPost();
    }
}

main();
