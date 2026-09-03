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


    let currentSubjectId = URL_SUBJECT_ID;
    let trialRecords = [], globalTrialCounter = 1, expStartTime = performance.now()/1000;
    let flankerFormalCounter = 1;
    const FLANKER_RESUME_KEY = `flanker_resume_${URL_SUBJECT_ID}_${URL_ATTEMPT_ID}`;
    const ARROWS_BASE = "./arrows", INSTRUCTION_BASE = "./instructions";

    function resolveTrialImagePath(spec) {
        const t = spec.trial_type, p = spec.is_popout, d = spec.target_dir, pos = spec.popout_position;
        if (t === "Congruent") return !p ? `${ARROWS_BASE}/congruent/${d==="left"?"z.png":"y.png"}` : `${ARROWS_BASE}/congruent-pop/${{left:{"1":"d4.png","2":"d3.png","3":"b6.png","4":"d5.png","5":"d6.png"},right:{"1":"5a.png","2":"4a.png","3":"3a.png","4":"6a.png","5":"7a.png"}}[d][pos]}`;
        if (t === "Incongruent") return !p ? `${ARROWS_BASE}/incongruent/${d==="left"?"a2.png":"a1.png"}` : `${ARROWS_BASE}/incongruent-pop/${{left:{"1":"Z1.png","2":"Z2.png","3":"Z3.png","4":"Z4.png","5":"Z5.png"},right:{"1":"Y1.png","2":"Y2.png","3":"Y3.png","4":"Y4.png","5":"Y5.png"}}[d][pos]}`;
        if (t === "Neutral") return !p ? `${ARROWS_BASE}/neutral/${d==="left"?"c2.png":"c1.png"}` : `${ARROWS_BASE}/neutral-pop/${d==="left"?"c4.png":"c3.png"}`;
        return `${ARROWS_BASE}/neutral/c1.png`;
    }
    const { buildFormalBlocks, buildPracticeTrials } = window.FLANKER_SEQUENCE;

    function sendCheckpoint(trialIndex) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'PARADIGM_CHECKPOINT',
                    paradigm: 'Flanker',
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
        await new Promise(resolve => {
            const o = document.createElement('div');
            o.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#000;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-family:Microsoft YaHei,sans-serif;';
            o.innerHTML = `<div style="font-size:40px;font-weight:900;margin-bottom:24px;">进度恢复</div><div style="font-size:26px;color:#ddd;margin-bottom:42px;">将从第 ${URL_RESUME_TRIAL_INDEX} 题开始。请确认准备好后正式继续。</div><button id="resume-ok" style="font-size:26px;font-weight:900;padding:18px 56px;border:none;border-radius:14px;background:#0f3689;color:#fff;">确认，正式开始</button>`;
            document.body.appendChild(o);
            o.querySelector('#resume-ok').onclick = () => { o.remove(); resolve(); };
        });
    }

    function runRedBoxGuide() {
        return new Promise(resolve => {
            const overlay = document.getElementById('unified-instruction-overlay'), redBox = document.getElementById('dynamic-red-box'), nextBtn = document.getElementById('guide-next-btn'), container = document.getElementById('instruction-content'), subText = document.getElementById('subtitle-text');
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
            const stepsData = [
                { targetId: 'img-target-1', text: "【游戏简介】<br>请您将注意力集中在屏幕中央，观察 <span style='color:#d32f2f;font-weight:900;'> <b>最中间箭头</b> </span> 的方向。" },
                { targetId: 'img-target-1', text: "屏幕上将出现一排5个箭头符号，<br> <span style='color:#d32f2f;font-weight:900;'> <b>仅以第3个（最中间）箭头</b> </span> 的方向为判断依据。" },
                { targetId: 'img-target-1', text: "中间箭头<b>朝左</b>，按屏幕<b>左侧按钮</b>；中间箭头<b>朝右</b>，按屏幕<b>右侧按钮</b>。<br><span style='color:#FF9800; font-size:1.2rem;'>（作答时无需关注两侧箭头的方向及颜色变化）</span>" },
                { targetId: 'img-target-2', text: "<span style='color: #4DA3FF; font-weight: bold; font-size: 2.2rem;'>【练习阶段】</span><br>请优先保证判断准确，熟悉规则后可逐步提速。" }
            ];
            let currentStep = 0; overlay.style.display = 'flex';
            function highlightStep(index) {
                if (index >= stepsData.length) { overlay.style.display = 'none'; resolve(); return; }
                const data = stepsData[index];
                document.querySelectorAll('.guide-img-wrapper').forEach(el => { el.classList.toggle('active', el.id === data.targetId); });
                subText.style.opacity = 0; setTimeout(() => { subText.innerHTML = data.text; subText.style.opacity = 1; }, 200);
                setTimeout(() => {
                    const targetEl = document.getElementById(data.targetId), targetRect = targetEl.getBoundingClientRect(), containerRect = container.getBoundingClientRect();
                    redBox.style.display = 'block'; redBox.style.top = (targetRect.top - containerRect.top) + 'px'; redBox.style.left = (targetRect.left - containerRect.left) + 'px'; redBox.style.width = targetRect.width + 'px'; redBox.style.height = targetRect.height + 'px';
                    if (index === stepsData.length - 1) { nextBtn.innerText = "开始练习"; nextBtn.style.background = "#FF9800"; } else { nextBtn.innerText = "下一步"; nextBtn.style.background = "#4DA3FF"; } prevBtn.disabled = index === 0; prevBtn.style.opacity = index === 0 ? '0.45' : '1'; prevBtn.style.cursor = index === 0 ? 'not-allowed' : 'pointer';
                }, 100); 
            }
            nextBtn.onclick = () => { currentStep++; highlightStep(currentStep); };
            prevBtn.onclick = () => { if (currentStep <= 0) return; currentStep--; highlightStep(currentStep); };
            highlightStep(0);
        });
    }

    function showInstructionImage(filename) {
        return new Promise(resolve => {
            const div = document.createElement('div');
            div.style.cssText = "position:fixed; inset:0; background:#000; z-index:3000; display:flex; align-items:center; justify-content:center; cursor:pointer;";
            div.innerHTML = `<img src="./instructions/${filename}" style="max-width:95%; max-height:85vh; object-fit:contain;" onerror="this.style.display='none'">`;
            document.body.appendChild(div); div.onclick = () => { div.remove(); resolve(); }
        });
    }

    function preloadOneFlankerImage(src, timeoutMs) {
        return new Promise(resolve => {
            const img = new Image();
            let done = false;
            const finish = ok => {
                if (done) return;
                done = true;
                resolve({ src, ok });
            };
            const timer = setTimeout(() => finish(false), timeoutMs || 4000);
            img.onload = () => { clearTimeout(timer); finish(true); };
            img.onerror = () => { clearTimeout(timer); finish(false); };
            img.src = src;
        });
    }

    async function preloadFlankerImages() {
        const paths = [];
        try {
            for (let r = 1; r <= 3; r++) {
                buildPracticeTrials(currentSubjectId, r).forEach(t => paths.push(resolveTrialImagePath(t)));
            }
            buildFormalBlocks(currentSubjectId).flat().forEach(t => paths.push(resolveTrialImagePath(t)));
            ["03_practice_end.png", "04_practice_retry_v2.png", "05_formal_start.png", "p.png", "q.png"].forEach(f => paths.push(`${INSTRUCTION_BASE}/${f}`));
        } catch (e) {
            console.warn('[Flanker] collect preload images failed:', e);
        }
        const uniquePaths = Array.from(new Set(paths));
        const results = await Promise.all(uniquePaths.map(p => preloadOneFlankerImage(p, 4000)));
        const failed = results.filter(r => !r.ok).map(r => r.src);
        if (failed.length) console.warn('[Flanker] image preload failed:', failed);
    }

    function showAttentionRating() {
        return new Promise(resolve => {
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
                        在刚才的箭头判断任务里，请你给自己的专注程度打分<br>
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

    function showNextExperimentConfirm() {
        return new Promise(resolve => {
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
                text-align: center;
                font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
                color: #fff;
            `;
            o.innerHTML = `
                <div style="font-size:42px;font-weight:900;margin-bottom:24px;">箭头判断已完成</div>
                <div style="font-size:26px;line-height:1.8;color:#d1d5db;margin-bottom:46px;">
                    请稍作准备。<br>
                    主试确认后再进入下一个实验。
                </div>
                <button id="flanker-next-confirm" style="padding:18px 64px;border:none;border-radius:14px;background:#0f3689;color:#fff;font-size:28px;font-weight:900;cursor:pointer;">
                    确认，进入下一步
                </button>
            `;
            document.body.appendChild(o);
            o.querySelector('#flanker-next-confirm').onclick = () => {
                o.remove();
                resolve();
            };
        });
    }

    async function runSingleTrial(spec, isPrac) {
        return new Promise(r => {
            const c = document.getElementById("app"); 
            c.innerHTML = `<div class="stimulus-area"><img src="${resolveTrialImagePath(spec)}" class="stimulus-img" onerror="this.style.display='none'"></div><div class="response-buttons"><div class="resp-btn" id="lBtn">←</div><div class="resp-btn" id="rBtn">→</div></div>`;
            
            const onS = performance.now(), lb = document.getElementById("lBtn"), rb = document.getElementById("rBtn");
            let resp = false, tOut = true, rKey = "none", kP = "none", rtMs = "", rtFloat = "", isA = 0, isO2 = 0, isO3 = 0;
            
            const tid = setTimeout(() => { if(!resp) { resp=true; end(); } }, 2000);
            
            const hd = (k) => { 
                if (isDebounced()) return; // 防抖
                if(resp)return; resp=true; clearTimeout(tid); tOut=false; 
                kP=k; rKey=k; 
                rtMs = Math.round(performance.now()-onS);
                rtFloat = rtMs; 
                if(rtMs < 200) isA=1; 
                if(rtMs >= 2000) isO2=1; 
                if(rtMs >= 3000) isO3=1;
                end(); 
            };
            
            lb.addEventListener('touchstart', (e)=>{e.preventDefault(); hd("left");}, {passive:false});
            rb.addEventListener('touchstart', (e)=>{e.preventDefault(); hd("right");}, {passive:false});
            lb.onmousedown = ()=>hd("left"); rb.onmousedown = ()=>hd("right");

            const end = async () => { 
                c.innerHTML=""; 
                const acc = kP===spec.target_dir?1:0; 
                if(isPrac){ 
                    if(tOut) c.innerHTML=`<div style="font-size:4rem; color:#FFC107; font-weight:bold;">太慢了！</div>`; 
                    else if(acc===0) c.innerHTML=`<img src="${INSTRUCTION_BASE}/${spec.target_dir==="left"?"q.png":"p.png"}" style="max-width:70%;max-height:50vh;" onerror="this.style.display='none'">`; 
                    if(tOut || acc===0) { await new Promise(res=>setTimeout(res,1000)); c.innerHTML=""; }
                } 
                await new Promise(res=>setTimeout(res,300)); 
                
                let record = {...spec, is_practice: spec.is_practice ? "True" : "False", is_popout: spec.is_popout ? "True" : "False", keyPressed: kP, response_key: rKey, accuracy: acc, reaction_time: rtFloat, rt_ms: rtMs, timeout: tOut ? "True" : "False", is_anticipatory: isA, rt_over_2s: isO2, rt_over_3s: isO3, iti_response: 0};
                uploadTrialData("Flanker", record); // 单题发往服务器
                r(record); 
            };
        });
    }

    async function runTrialList(trials, cd) { 
        if(cd) { const c = document.getElementById("app"); for(let i=3;i>=1;i--){ c.innerHTML = `<div style="text-align:center;color:#fff;"><div style="font-size:2.6rem;font-weight:900;margin-bottom:2rem;">\u51c6\u5907\u5f00\u59cb</div><div style="font-size:8rem;font-weight:bold;">${i}</div></div>`; await new Promise(res=>setTimeout(res,1000)); } c.innerHTML = ""; }
        let recs = [];
        for(const s of trials) {
            if (!s.is_practice) sendCheckpoint(flankerFormalCounter);
            await new Promise(r=>{document.getElementById("app").innerHTML=`<div style="font-size:6rem;color:#fff;">+</div>`; setTimeout(r,500);});
            const rec = await runSingleTrial(s, s.is_practice);
            rec.trial_index_global = globalTrialCounter++;
            trialRecords.push(rec);
            try { localStorage.setItem(FLANKER_RESUME_KEY, JSON.stringify({ trialRecords })); } catch (e) {}
            recs.push(rec);
            if (!s.is_practice) {
                flankerFormalCounter++;
                sendCheckpoint(flankerFormalCounter);
            }
        } 
        return recs; 
    }

    async function main() {
        await preloadFlankerImages();
        if (URL_RESUME_TRIAL_INDEX > 1) {
            try {
                const cached = JSON.parse(localStorage.getItem(FLANKER_RESUME_KEY) || '{}');
                if (Array.isArray(cached.trialRecords)) trialRecords = cached.trialRecords;
            } catch (e) {}
        }
        if (URL_RESUME_TRIAL_INDEX <= 1) {
            await runRedBoxGuide();
            let pRnd = 1, pass = false;
            while (!pass && pRnd <= 3) {
                const recs = await runTrialList(buildPracticeTrials(currentSubjectId, pRnd), true);
                if (recs.filter(r=>r.accuracy===1).length/recs.length >= 0.7 || pRnd === 3) { pass = true; await showInstructionImage("03_practice_end.png"); } else { await showInstructionImage("04_practice_retry_v2.png"); pRnd++; }
            }
            await showInstructionImage("05_formal_start.png");
        } else {
            await confirmResumeIfNeeded();
        }
        const fb = buildFormalBlocks(currentSubjectId);
        flankerFormalCounter = 1;
        globalTrialCounter = URL_RESUME_TRIAL_INDEX;
        for (let i = 0; i < fb.length; i++) {
            const remaining = fb[i].filter(() => flankerFormalCounter++ >= URL_RESUME_TRIAL_INDEX);
            flankerFormalCounter -= remaining.length;
            if (!remaining.length) continue;
            const recs = await runTrialList(remaining, true);
            const rating = await showAttentionRating();
            recs.forEach(r => {
                r.attention_rating = rating;
            });
        }
        await showNextExperimentConfirm();
        
        const hdrs = ["subject_id","trial_index","trial_index_global","is_practice","trial_type","is_popout","popout_type","popout_position","target_dir","flanker_dir","block_index","practice_round","phase_name","keyPressed","response_key","accuracy","reaction_time","rt_ms","timeout","is_anticipatory","rt_over_2s","rt_over_3s","iti_response","attention_rating"];
        const csvStr = hdrs.join(',') + '\n' + trialRecords.map(r=>hdrs.map(h=>r[h]).join(',')).join('\n');
        window.parent.postMessage({ type: 'BLOCK_COMPLETED', csv: csvStr }, '*');
        try { localStorage.removeItem(FLANKER_RESUME_KEY); } catch (e) {}
    }
    main();
