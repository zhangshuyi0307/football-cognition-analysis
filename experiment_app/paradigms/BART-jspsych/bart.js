
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


    let subjectId = URL_SUBJECT_ID;
    let groupFlag = parseInt(localStorage.getItem('exp_group') || '0'); 

    const STIM_DIR = "./stimuli";
    const IMG_MAP = { gray_small: "gray_small.png", gray_big: "gray_big.png", gray_boom: "gray_boom.png", green_small: "green_small.png", green_big: "green_big.png", green_boom: "green_boom.png", red_small: "red_small.png", red_big: "red_big.png", red_boom: "red_boom.png", yellow_small: "yellow_small.png", yellow_big: "yellow_big.png", yellow_boom: "yellow_boom.png" };
    const loadedImages = {}; let bgImg = new Image(); bgImg.src = "./background.png"; let rewardImg = new Image(); rewardImg.src = "./reward_pic.jpg";
    const FEEDBACK_MS = 1500, ITI_MS = 500, BALLOON_BASE_W = 350, BALLOON_BASE_H = 470, MAX_SCALE = 2.5;

    let totalScore = 0, allRows = [], trialInProgress = false, pumpCount = 0, explodedFlag = false, cashPressedFlag = false;
    let trialStartTime = 0, pumpTimestamps = [], cashPressTime = -1;
    let canvasEl, ctx, pumpBtn, cashBtn, currentTrialColor = "gray";
    const BART_RESUME_KEY = `bart_resume_${URL_SUBJECT_ID}_${URL_ATTEMPT_ID}`;

    function sendCheckpoint(trialIndex) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'PARADIGM_CHECKPOINT',
                    paradigm: 'BELT',
                    block: 1,
                    attempt_id: URL_ATTEMPT_ID,
                    trial_index: Math.max(1, trialIndex || 1),
                    resume_trial_index: Math.max(1, trialIndex || 1)
                }, '*');
            }
        } catch (e) {}
    }

    function preloadAllImages() {
        return new Promise(resolve => {
            let paths = []; for (let k in IMG_MAP) paths.push({ key: k, src: `${STIM_DIR}/${IMG_MAP[k]}` });
            let loaded = 0; if(paths.length === 0) resolve();
            paths.forEach(item => { let img = new Image(); img.onload = img.onerror = () => { loadedImages[item.key] = img; loaded++; if(loaded === paths.length) resolve(); }; img.src = item.src; });
        });
    }

    const { practicePrompts, generatePracticeTrials, generateFormalTrials } = window.BART_SEQUENCE;

    function drawScene(s = 1.0, isBoom = false, jX = 0, jY = 0) {
        if (!ctx) return; const w = canvasEl.width, h = canvasEl.height; 
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, w, h);
        const topBgH = h * 0.10;
        if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) { const sc = topBgH / bgImg.naturalHeight; ctx.drawImage(bgImg, (w - bgImg.naturalWidth * sc) / 2, 80, bgImg.naturalWidth * sc, topBgH); }
        const bX = w/2 - (BALLOON_BASE_W*s)/2 + jX, bY = h/2 - (BALLOON_BASE_H*s)/2 + jY;
        const imgKey = isBoom ? `${currentTrialColor}_boom` : (pumpCount > 0 ? `${currentTrialColor}_big` : `${currentTrialColor}_small`), img = loadedImages[imgKey];
        if (img && img.complete && img.naturalWidth > 0) { ctx.drawImage(img, bX, bY, BALLOON_BASE_W*s, BALLOON_BASE_H*s); } 
        else { let cH = {'green':'#4CAF50','red':'#F44336','yellow':'#FFC107','gray':'#888'}; ctx.save(); ctx.translate(bX + (BALLOON_BASE_W*s)/2, bY + (BALLOON_BASE_H*s)/2); ctx.fillStyle = isBoom ? '#FF5722' : (cH[currentTrialColor] || '#888'); ctx.beginPath(); ctx.ellipse(0, 0, (BALLOON_BASE_W*s)/2, (BALLOON_BASE_H*s)/2, 0, 0, Math.PI*2); ctx.fill(); ctx.restore(); }
        ctx.font = `bold 28px "PingFang SC", "Microsoft YaHei"`; ctx.fillStyle = "black"; ctx.textAlign = "center"; ctx.fillText(`总分：${totalScore}`, w/2, 80 + topBgH/2 + 8);
    }

    async function runTrial(tParams) {
        return new Promise(async resolve => {
            currentTrialColor = tParams.color; pumpCount=0; explodedFlag=false; cashPressedFlag=false; pumpTimestamps=[]; cashPressTime=-1; trialStartTime=performance.now(); 
            drawScene(1.0); pumpBtn.disabled = false; cashBtn.disabled = tParams.disable_cash||false;
            
            const hdP = (e) => { 
                if (isDebounced()) return; // 防抖拦截
                if(e)e.preventDefault(); if(!trialInProgress)return; 
                pumpCount++; pumpTimestamps.push(Math.floor(performance.now()-trialStartTime)); 
                drawScene(1.0 + Math.min(pumpCount*0.05, MAX_SCALE-1.0)); 
                if(pumpCount>tParams.limit){ explodedFlag=true; end(); } 
            };
            const hdC = (e) => { 
                if (isDebounced()) return; // 防抖拦截
                if(e)e.preventDefault(); if(!trialInProgress||tParams.disable_cash)return; 
                cashPressedFlag=true; cashPressTime=performance.now()-trialStartTime; end(); 
            };
            pumpBtn.onmousedown = pumpBtn.ontouchstart = hdP; cashBtn.onmousedown = cashBtn.ontouchstart = hdC; trialInProgress=true;
            
            const end = async () => { 
                if(!trialInProgress)return; trialInProgress=false; pumpBtn.disabled=cashBtn.disabled=true; 
                const gain = (!explodedFlag&&cashPressedFlag)?pumpCount:0; totalScore += gain;
                const textX = canvasEl.width/5, textY = canvasEl.height/2.2;

                if(explodedFlag){
                    const s=performance.now(), d=FEEDBACK_MS;
                    await new Promise(res => { const an = () => { const el = performance.now()-s; if(el>=d){ drawScene(1.0); res(); return; } let grow = el < 120 ? 1.0 + 1.5 * (el / 120) : 2.5, jit = el > 50 ? 20 : 0; drawScene(grow, true, (Math.random()-0.5)*jit, (Math.random()-0.5)*jit); ctx.font=`22px "PingFang SC", "Microsoft YaHei"`; ctx.fillStyle="black"; ctx.textAlign="center"; ctx.fillText("💥 爆炸！得分 0", textX, textY); requestAnimationFrame(an); }; an(); });
                } else if(cashPressedFlag && gain > 0){
                    const s=performance.now(), d=FEEDBACK_MS;
                    await new Promise(res => { const an = () => { const el = performance.now()-s; if(el>=d){ drawScene(1.0); res(); return; } drawScene(1.0); const dW = 70, dH = 70; if(rewardImg && rewardImg.complete && rewardImg.naturalWidth > 0) { ctx.drawImage(rewardImg, textX - dW/2, textY - dH/2 - 20, dW, dH); } ctx.font=`bold 24px "PingFang SC", "Microsoft YaHei"`; ctx.fillStyle="black"; ctx.textAlign="center"; ctx.fillText(`+${gain} 分`, textX, textY + 35); requestAnimationFrame(an); }; an(); });
                } else { 
                    drawScene(1.0); ctx.font=`22px "PingFang SC", "Microsoft YaHei"`; ctx.fillStyle="black"; ctx.textAlign="center"; ctx.fillText("未存分", textX, textY); await new Promise(res=>setTimeout(res,FEEDBACK_MS)); 
                }
                
                ctx.fillStyle = "white"; ctx.fillRect(0,0,canvasEl.width,canvasEl.height); await new Promise(res=>setTimeout(res,ITI_MS)); drawScene(1.0);
                
                let record = { balloon_color: tParams.color, balloon_threshold: tParams.limit, task_phase: tParams.phase, pump_count: pumpCount, pump_key_ts: JSON.stringify(pumpTimestamps), cash_pressed: cashPressedFlag?1:0, cash_key_ts: cashPressTime>=0?Math.floor(cashPressTime):-1, exploded: explodedFlag?1:0, points_this_trial: gain, total_score_after: totalScore, trial_dur_ms: Math.floor(performance.now()-trialStartTime) };
                uploadTrialData("BELT", record); // 单题发往服务器
                resolve(record);
            };
        });
    }

    function runRedBoxGuide() {
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
            const steps = [ { target: 'img-target-1', text: "屏幕上会出现气球，点击“打气”按钮为气球充气；气球体积越大，单轮可获得的积分越高。" }, { target: 'img-target-2', text: "您可随时点击“存分”按钮，将当前气球的积分计入总分，该部分积分将永久保留。" }, { target: 'img-target-3', text: "若气球因充气过多而爆炸，则当前气球的所有积分将清零，无法计入总分。" }, { target: 'img-target-4', text: "每次存分或气球爆炸后，会刷新出一个新的气球。<br><span style='color:#FF9800; font-weight:bold;'>提示：不同颜色气球的“结实程度”存在差异，请找出规律，在风险与收益间做出判断。</span>" } ];
            let current = 0; overlay.style.display = 'flex';
            function step() {
                if(current >= steps.length) { overlay.style.display = 'none'; resolve(); return; }
                const data = steps[current]; document.querySelectorAll('.guide-img-wrapper').forEach(el => el.classList.toggle('active', el.id === data.target)); subText.style.opacity = 0; setTimeout(()=> { subText.innerHTML = data.text; subText.style.opacity = 1; }, 200);
                setTimeout(() => { const el = document.getElementById(data.target), r = el.getBoundingClientRect(), c = document.querySelector('.images-grid').getBoundingClientRect(); redBox.style.display = 'block'; redBox.style.top = (r.top - c.top) + 'px'; redBox.style.left = (r.left - c.left) + 'px'; redBox.style.width = r.width + 'px'; redBox.style.height = r.height + 'px'; nextBtn.innerText = current === steps.length - 1 ? "完成说明" : "下一步"; prevBtn.disabled = current === 0; prevBtn.style.opacity = current === 0 ? '0.45' : '1'; prevBtn.style.cursor = current === 0 ? 'not-allowed' : 'pointer'; }, 100);
            }
            nextBtn.onclick = () => { current++; step(); };
            prevBtn.onclick = () => { if (current <= 0) return; current--; step(); };
            step();
        });
    }

    function showInstructionImage(imgSrc) { return new Promise(resolve => { const div = document.createElement('div'); div.style.cssText = "position:fixed; inset:0; background:#fff; z-index:3000; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;"; div.innerHTML = `<img src="./${imgSrc}" style="max-width:95%; max-height:80vh; object-fit:contain;" onerror="this.style.display='none'"><p style="color:#0f3689; font-size:1.5rem; font-weight:bold; margin-top:20px;">▼ 点击屏幕任意处开始挑战 ▼</p>`; document.body.appendChild(div); div.onclick = () => { div.remove(); resolve(); } }); }
    function showSimpleOverlay(textHTML, btnText) { return new Promise(resolve => { const div = document.createElement('div'); div.className = "simple-overlay"; div.innerHTML = `<div style="font-size:2.2rem; line-height:1.6; color:#000; margin-bottom:50px;">${textHTML}</div><button class="py-style-btn">${btnText}</button>`; document.body.appendChild(div); div.querySelector('button').onclick = () => { div.remove(); resolve(); } }); }

    function showAttentionRating() {
        return new Promise(resolve => {
            document.getElementById('exp-container').style.display = 'none';
            const o = document.createElement("div"); o.className = "rating-overlay"; o.innerHTML = `<div style="text-align:center;"><h2 style="font-size:32px; margin-bottom:10px; color:#333;">注意力评分</h2><p style="color:#666; margin-bottom:40px;">在刚才的游戏任务里，请你给自己的专注程度打分<br>(1=非常不专注, 9=非常专注)</p><div style="display:flex; gap:15px;" id="rating-panel"></div></div>`; document.body.appendChild(o);
            let clicked = false; for(let i=1; i<=9; i++) { const n = document.createElement('div'); n.className = 'rating-num'; n.innerText = i; const handler = (e) => { e.preventDefault(); if(clicked) return; clicked = true; n.style.background = '#0f3689'; n.style.color = '#fff'; n.style.borderColor = '#0f3689'; setTimeout(() => { o.remove(); document.getElementById('exp-container').style.display = 'block'; resolve(i); }, 100); }; n.addEventListener('touchstart', handler, {passive: false}); n.addEventListener('mousedown', handler); o.querySelector('#rating-panel').appendChild(n); }
        });
    }

    async function main() {
        await preloadAllImages(); 
        if (URL_RESUME_TRIAL_INDEX > 1) {
            try {
                const cached = JSON.parse(localStorage.getItem(BART_RESUME_KEY) || '{}');
                if (Array.isArray(cached.allRows)) allRows = cached.allRows;
                if (typeof cached.totalScore === 'number') totalScore = cached.totalScore;
            } catch (e) {}
        }
        canvasEl = document.getElementById("game-canvas"); ctx = canvasEl.getContext("2d"); pumpBtn = document.getElementById("pumpBtn"); cashBtn = document.getElementById("cashBtn");
        const rs = () => { canvasEl.width = window.innerWidth; canvasEl.height = window.innerHeight; }; window.addEventListener("resize", rs); rs();
        if (URL_RESUME_TRIAL_INDEX > 1) {
            await showSimpleOverlay(`【进度恢复】<br><br><span style='color:#555; font-size:1.8rem;'>将从第 ${URL_RESUME_TRIAL_INDEX} 个气球开始。请确认准备好后正式继续。</span>`, "确认，正式开始");
        } else {
        await runRedBoxGuide();
        document.getElementById('exp-container').style.display = 'block';
        const pTrials = generatePracticeTrials();
        for (let i = 0; i < pTrials.length; i++) {
            document.getElementById('exp-container').style.display = 'none';
            await showSimpleOverlay(`练习 ${i+1} / 4<br><br><span style='color:#555; font-size:1.8rem;'>${practicePrompts[i]}</span>`, "继续");
            document.getElementById('exp-container').style.display = 'block';
            const res = await runTrial(pTrials[i]); res.trial_id = `P${i+1}`; res.subject_id = subjectId; res.group = groupFlag; res.attention_rating = ""; allRows.push(res);
            if (pTrials[i].pType === "force_boom") { document.getElementById('exp-container').style.display = 'none'; await showSimpleOverlay("气球是有可能会充爆的哦～", "继续"); document.getElementById('exp-container').style.display = 'block'; }
        }
        document.getElementById('exp-container').style.display = 'none';
        await showInstructionImage("page5.png");
        }
        document.getElementById('exp-container').style.display = 'block';
        totalScore = 0; const formalTrials = generateFormalTrials(groupFlag === 0);
        for (let i = URL_RESUME_TRIAL_INDEX - 1; i < formalTrials.length; i++) {
            sendCheckpoint(i + 1);
            const res = await runTrial(formalTrials[i]); res.trial_id = i+1; res.subject_id = subjectId; res.group = groupFlag; res.attention_rating = ""; allRows.push(res);
            try { localStorage.setItem(BART_RESUME_KEY, JSON.stringify({ allRows, totalScore })); } catch (e) {}
            sendCheckpoint(i + 2);
        }
        document.getElementById('exp-container').style.display = 'none';
        await showSimpleOverlay(`结束！总分：${totalScore}`, "继续");
        let rating = await showAttentionRating();
        allRows.slice(-formalTrials.length).forEach(r => r.attention_rating = rating);
        const hdrs = Object.keys(allRows[0]);
        const csvStr = hdrs.join(",") + "\n" + allRows.map(r => hdrs.map(h => JSON.stringify(r[h] || "").replace(/,/g,';')).join(",")).join("\n");
        window.parent.postMessage({ type: 'BLOCK_COMPLETED', csv: csvStr }, '*');
        try { localStorage.removeItem(BART_RESUME_KEY); } catch (e) {}
    }
    window.onload = main;
