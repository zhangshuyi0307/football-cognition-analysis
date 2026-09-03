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
        lastClickTime = now; return false;
    }
    function uploadTrialData(paradigm, dataObj) {
        // 为兼容旧代码保留函数名；本版不再发送单 trial 数据到远程服务器。
        dataObj.absolute_time = Date.now();
        dataObj.subject_id = URL_SUBJECT_ID;
        dataObj.paradigm = paradigm;
    }
    // ==========================================


    const canvas = document.getElementById('gameCanvas'), ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const { BLOCKS, PRAC_SEQ, FORMAL_SEQ } = window.CORSI_SEQUENCE;

    let allData = [], globalTrialIndex = 1, stoppedByFailure = 0, isPresenting = false, isResponding = false, isProcessingClick = false;
    let formalTrialCounter = 1;
    const CORSI_RESUME_KEY = `corsi_resume_${URL_SUBJECT_ID}_${URL_ATTEMPT_ID}`;
    let currentResponse = [], requiredResponse = [], resolveTrial = null, rtStart = 0, responseTimeout, currentSeq = [], currentIsPrac = false;
    let early_tap_count = 0, blank_click_count = 0, repeated_click_count = 0, first_click_rt = null;

    function getDims() { const w = Math.min(window.innerWidth * 0.9, 1000); const h = Math.min(window.innerHeight * 0.9, 750); const size = Math.min(w, h) * 0.14; const ox = (window.innerWidth - w) / 2; const oy = (window.innerHeight - h) / 2 + (window.innerHeight * 0.05); return { w, h, size, ox, oy }; }
    function drawBlocks(highlightId = -1, clickId = -1) { ctx.clearRect(0,0,canvas.width,canvas.height); const d = getDims(); for(let b of BLOCKS) { let px = d.ox + b.x * d.w - d.size/2, py = d.oy + b.y * d.h - d.size/2; ctx.fillStyle = (b.id === clickId) ? '#4DA3FF' : (b.id === highlightId) ? '#FFC107' : '#cbd5e1'; ctx.fillRect(px, py, d.size, d.size); ctx.strokeStyle = '#334155'; ctx.lineWidth = 4; ctx.strokeRect(px, py, d.size, d.size); } }
    function drawFixationCross() { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = 'white'; ctx.lineWidth = 4; const cx = canvas.width / 2, cy = canvas.height / 2; ctx.beginPath(); ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 20, cy); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 20); ctx.stroke(); }
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    function showCenterText(text, duration = null) { const ov = document.getElementById('center-text-overlay'); ov.innerHTML = text; ov.style.opacity = 1; if (duration) { setTimeout(() => { ov.style.opacity = 0; }, duration); } }
    async function showBlankClickFeedback() {
        isProcessingClick = true;
        showCenterText("<span style='font-size:2.2rem;color:#FFC107;font-weight:bold;'>&#35831;&#28857;&#20013;&#26041;&#22359;</span>", 450);
        await sleep(250);
        isProcessingClick = false;
    }

    function sendCheckpoint(trialIndex) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'PARADIGM_CHECKPOINT',
                    paradigm: 'Corsi',
                    block: 1,
                    attempt_id: URL_ATTEMPT_ID,
                    trial_index: Math.max(1, trialIndex || 1),
                    resume_trial_index: Math.max(1, trialIndex || 1)
                }, '*');
            }
        } catch (e) {}
    }

    async function confirmResumeIfNeeded() {
        if (URL_RESUME_TRIAL_INDEX <= 1) return;
        await showSimpleOverlay(`【进度恢复】<br><br><span style='color:#ccc; font-size:1.4rem;'>将从第 ${URL_RESUME_TRIAL_INDEX} 题开始。请确认准备好后正式继续。</span>`, "确认，正式开始");
    }

    function runGuide() {
        return new Promise(resolve => {
            const overlay = document.getElementById('unified-instruction-overlay'), redBox = document.getElementById('dynamic-red-box'), nextBtn = document.getElementById('guide-next-btn'), subText = document.getElementById('subtitle-text');
            let prevBtn = document.getElementById('guide-prev-btn');
            if (!prevBtn) {
                prevBtn = document.createElement('button');
                prevBtn.id = 'guide-prev-btn';
                prevBtn.className = 'next-step-btn';
                prevBtn.type = 'button';
                prevBtn.innerText = '上一步';
                prevBtn.style.background = '#64748b';
                prevBtn.style.marginRight = '12px';
                nextBtn.parentNode.insertBefore(prevBtn, nextBtn);
            }
            const steps = [ { t: 'img-target-1', txt: "屏幕上有9个固定的方块。<br>每一题中，会有几个方块按顺序<b>依次亮起黄色</b>。<br>请仔细观察并<b>记住它们亮起的顺序</b>。" }, { t: 'img-target-2', txt: "当方块停止亮起后，屏幕会提示您“请按<span style='color:#F44336; font-weight:bold;'>相反顺序</span>点击”。<br>请您把刚才亮起的顺序<span style='color:#F44336; font-weight:bold;'>倒过来</span>，依次点击这些方块。" } ];
            let cur = 0; overlay.style.display = 'flex'; document.getElementById('app').style.display = 'none';
            function step() {
                if (cur >= steps.length) { overlay.style.display = 'none'; document.getElementById('app').style.display = 'flex'; resolve(); return; }
                const d = steps[cur]; document.querySelectorAll('.guide-img-wrapper').forEach(el => { el.classList.toggle('active', el.id === d.t); });
                subText.style.opacity = 0; setTimeout(() => { subText.innerHTML = d.txt; subText.style.opacity = 1; }, 200);
                setTimeout(() => { const el = document.getElementById(d.t), r = el.getBoundingClientRect(), c = document.getElementById('instruction-content').getBoundingClientRect(); redBox.style.display = 'block'; redBox.style.top = (r.top - c.top) + 'px'; redBox.style.left = (r.left - c.left) + 'px'; redBox.style.width = r.width + 'px'; redBox.style.height = r.height + 'px'; nextBtn.innerText = cur === steps.length - 1 ? "进入练习" : "下一步"; if(cur === steps.length - 1) nextBtn.style.background = "#FF9800"; else nextBtn.style.background = "#4DA3FF"; prevBtn.disabled = cur === 0; prevBtn.style.opacity = cur === 0 ? '0.45' : '1'; prevBtn.style.cursor = cur === 0 ? 'not-allowed' : 'pointer'; }, 100); 
            }
            nextBtn.onclick = () => { cur++; step(); };
            prevBtn.onclick = () => { if (cur <= 0) return; cur--; step(); };
            step();
        });
    }

    function showSimpleOverlay(textHTML, btnText) {
        return new Promise(resolve => {
            document.getElementById('app').style.display = 'none';
            const div = document.createElement('div'); div.className = "simple-overlay";
            div.innerHTML = `<div style="font-size:2rem; line-height:1.6; font-weight:bold; max-width:800px; margin-bottom:50px;">${textHTML}</div><button style="padding:15px 50px; font-size:1.5rem; background:#4DA3FF; color:white; border:none; border-radius:10px; cursor:pointer;">${btnText}</button>`;
            document.body.appendChild(div); div.querySelector('button').onclick = () => { div.remove(); document.getElementById('app').style.display = 'flex'; resolve(); }
        });
    }

    function showAttentionRating() {
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
                        在刚才的方块记忆任务里，请你给自己的专注程度打分<br>
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

    async function runTrial(seq, isPrac) {
        currentSeq = seq; currentIsPrac = isPrac; early_tap_count = 0; blank_click_count = 0; repeated_click_count = 0; first_click_rt = null;
        return new Promise(async resolve => {
            resolveTrial = resolve;
            drawFixationCross(); await sleep(500); drawBlocks(); showCenterText("请记住方块亮起顺序", 1500); await sleep(2000);
            isPresenting = true;
            for(let id of seq) { drawBlocks(id, -1); await sleep(1000); drawBlocks(-1, -1); await sleep(250); }
            isPresenting = false;
            requiredResponse = [...seq].reverse(); currentResponse = []; isResponding = true;
            showCenterText("请按<span style='color:#F44336; font-weight:bold;'>相反顺序</span>点击", 1000);
            rtStart = performance.now();
            responseTimeout = setTimeout(() => { if (isResponding) submitResponse(true); }, 15000); 
        });
    }

    async function submitResponse(isTimeout) {
        isResponding = false; clearTimeout(responseTimeout); let rtEnd = performance.now();
        let isCorrect = !isTimeout && (JSON.stringify(currentResponse) === JSON.stringify(requiredResponse));
        let preAcc = 0; for(let i=0; i < Math.min(currentResponse.length, requiredResponse.length); i++) { if(currentResponse[i] === requiredResponse[i]) preAcc++; else break; }
        let errType = "none"; if (isTimeout) errType = "timeout"; else if (!isCorrect) errType = "wrong_sequence";

        if (currentIsPrac) { showCenterText(isCorrect ? "<span style='color:#4CAF50'>正确！</span>" : "<span style='color:#F44336'>顺序错了或超时！<br>请记住要按<span style='color:#FF9800; font-weight:bold;'>【倒序】</span>点击</span>", 1500); await sleep(1500); }
        await sleep(500); 
        
        let record = {
            trial_index: globalTrialIndex++, block_type: currentIsPrac ? 'practice' : 'formal_backward',
            sequence_length: currentSeq.length, seqString: currentSeq.join('-'), seqStringBackwards: requiredResponse.join('-'), respString: currentResponse.join('-'),
            correct: isCorrect ? 1 : 0, click_order_accuracy: preAcc, longest_correct_prefix: preAcc, error_type: errType,
            early_tap_count: early_tap_count, blank_click_count: blank_click_count, repeated_click_count: repeated_click_count,
            timeout: isTimeout ? 1 : 0, stopped_by_failure: stoppedByFailure,
            first_click_rt: first_click_rt || 0,
            response_duration_ms: Math.round(rtEnd - rtStart),
            attention_rating: ""
        };
        uploadTrialData("Corsi", record); // 单题发往服务器
        resolveTrial(record);
    }

    const handleTap = async (e) => {
        e.preventDefault(); 
        if (isDebounced()) return; // 防抖拦截
        if (isPresenting) { early_tap_count++; showCenterText("<span style='font-size: 2.5rem; color:#FFC107;'>请等待序列结束</span>", 800); return; }
        if (!isResponding || isProcessingClick) return;
        let clickX = e.clientX || (e.touches && e.touches.length > 0 ? e.touches[0].clientX : 0), clickY = e.clientY || (e.touches && e.touches.length > 0 ? e.touches[0].clientY : 0);
        let clickedId = -1; const d = getDims();
        const hitPad = Math.max(10, d.size * 0.18);
        for(let b of BLOCKS) { let px = d.ox + b.x * d.w - d.size/2, py = d.oy + b.y * d.h - d.size/2; if(clickX >= px-hitPad && clickX <= px+d.size+hitPad && clickY >= py-hitPad && clickY <= py+d.size+hitPad) { clickedId = b.id; break; } }
        
        if (clickedId !== -1) {
            if (first_click_rt === null) first_click_rt = Math.round(performance.now() - rtStart);
            if (currentResponse.includes(clickedId)) repeated_click_count++;
            isProcessingClick = true; currentResponse.push(clickedId);
            drawBlocks(-1, clickedId); await sleep(150); drawBlocks(-1, -1);
            if (currentResponse.length === requiredResponse.length) submitResponse(false);
            isProcessingClick = false;
        } else { blank_click_count++; await showBlankClickFeedback(); }
    };

    canvas.addEventListener('mousedown', handleTap); canvas.addEventListener('touchstart', handleTap, {passive: false});

    async function main() {
        if (URL_RESUME_TRIAL_INDEX > 1) {
            try {
                const cached = JSON.parse(localStorage.getItem(CORSI_RESUME_KEY) || '{}');
                if (Array.isArray(cached.allData)) allData = cached.allData;
            } catch (e) {}
        }
        if (URL_RESUME_TRIAL_INDEX > 1) {
            await confirmResumeIfNeeded();
            globalTrialIndex = URL_RESUME_TRIAL_INDEX;
        } else {
        await runGuide();
        await showSimpleOverlay("【练习阶段】<br><br><span style='color:#ccc; font-size:1.4rem;'>熟悉九方块布局及<span style='color:#F44336; font-weight:bold;'>“倒序点击”</span>规则</span>", "开始练习");
        for (let seq of PRAC_SEQ) { let res = await runTrial(seq, true); res.backward_span = 0; allData.push(res); }
        await showSimpleOverlay("【正式测试】<br><br><span style='color:#ccc; font-size:1.4rem;'>难度将逐渐提升，请尽量保持专注和准确。</span>", "开始测试");
        }
        let maxSpan = 0, stopTask = false;
        for (let len = 2; len <= 9; len++) {
            let fails = 0;
            for (let t = 0; t < 2; t++) {
                if (formalTrialCounter < URL_RESUME_TRIAL_INDEX) {
                    formalTrialCounter++;
                    continue;
                }
                sendCheckpoint(formalTrialCounter);
                let res = await runTrial(FORMAL_SEQ[len][t], false);
                formalTrialCounter++;
                sendCheckpoint(formalTrialCounter);
                if (res.correct === 1) maxSpan = Math.max(maxSpan, len); else fails++;
                res.backward_span = maxSpan; allData.push(res);
                try { localStorage.setItem(CORSI_RESUME_KEY, JSON.stringify({ allData })); } catch (e) {}
            }
            if (fails === 2) { stoppedByFailure = 1; allData[allData.length - 1].stopped_by_failure = 1; stopTask = true; break; }
        }
        document.getElementById('app').style.display = 'none';
        const rating = await showAttentionRating();
        allData
            .filter(r => r.block_type === 'formal_backward')
            .forEach(r => {
                r.attention_rating = rating;
            });
        const hdrs = Object.keys(allData[0]);
        const csvStr = hdrs.join(",") + "\n" + allData.map(r => hdrs.map(h => r[h]).join(",")).join("\n");
        window.parent.postMessage({ type: 'BLOCK_COMPLETED', csv: csvStr }, '*');
        try { localStorage.removeItem(CORSI_RESUME_KEY); } catch (e) {}
    }
    
    window.addEventListener("resize", () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; if(document.getElementById('app').style.display !== 'none' && !isResponding && !isPresenting) drawBlocks(); });
    main();
