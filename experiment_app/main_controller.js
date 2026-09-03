    let globalUserID = "", globalStream = null, mediaRecorder = null, recordedChunks = [];
    let currentRecordingTarget = '', currentRecordingBlock = '', currentRecordingStartedAt = 0;
    let currentSequence = [], currentIndex = 0, currentBtnId = "";
    let transitionQueue = []; 
    let audioContext = null, volumeCheckReq = null;
    let blockCompletionInProgress = false;
    let recoveredStateObj = null;
    let ropeTimerInterval = null;
    let ropeTimerActive = false;
    let ropeTimerDone = false;
    let ropeRemainingSec = 0;
    let dataDownloaded = false;
    let globalAllocationData = null; 
    let currentFusionStageId = "";
    let globalSessionStartTimestampMs = Date.now();
    let globalSessionStartISO = new Date(globalSessionStartTimestampMs).toISOString();
    let currentRopeStartTimestampMs = 0;
    let globalClickLog = ["subject_id,timestamp_ms,timestamp_iso,timestamp_beijing,elapsed_from_session_start_ms,context,x_pos,y_pos,element_tag"];
    const browserOwnerId = 'owner_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    let currentAttemptId = '';
    let abnormalRestart = 0;
    let abnormalReason = '';
    let heartbeatTimer = null;
    let resumeTrialByCard = {};
    let pendingRopeRecovery = null;
    let fullscreenExitAllowedUntil = 0;
    let lastSegmentAutoDownloadAt = {};
    let completedCardSet = new Set();
    
    // 初始化数据结构时包含 SART

    function isLocalhostHost() {
        return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
    }

    function showSecureContextWarningIfNeeded() {
        if (!window.isSecureContext && !isLocalhostHost()) {
            const msg = '当前不是安全上下文，浏览器可能拒绝摄像头/麦克风。请优先使用 HTTPS 地址：例如 https://' + window.location.hostname + ':3443';
            const el = document.getElementById('secure-context-warning');
            if (el) {
                el.innerText = msg;
                el.style.display = 'block';
            } else {
                console.warn(msg);
            }
        }
    }

    function createSafeMediaRecorder(stream) {
        const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
        for (const type of candidates) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
                return new MediaRecorder(stream, { mimeType: type });
            }
        }
        return new MediaRecorder(stream);
    }

    function startRecordingSegment(targetName, blockLabel) {
        // 每个范式、每个 block、每轮跳绳都单独开一段录像。
        // start(1000) 会每秒吐出一个 chunk，比只在 stop 时吐数据更稳定，避免下载出来的视频不完整。
        recordedChunks = [];
        mediaRecorder = null;
        currentRecordingTarget = targetName || 'Unknown';
        currentRecordingBlock = blockLabel === undefined || blockLabel === null ? '' : String(blockLabel);
        currentRecordingStartedAt = Date.now();

        try {
            if (!globalStream || !window.MediaRecorder) {
                console.warn('[MainController] globalStream 或 MediaRecorder 不可用，本段不录视频：', currentRecordingTarget, currentRecordingBlock);
                return false;
            }

            mediaRecorder = createSafeMediaRecorder(globalStream);

            mediaRecorder.ondataavailable = e => {
                if (e.data && e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onerror = err => {
                console.warn('[MainController] MediaRecorder error:', currentRecordingTarget, currentRecordingBlock, err);
            };

            // 关键：用 timeslice，每 1000ms 产生一个 chunk。
            // 这样即使 stop/onstop 在某些浏览器里不稳定，前面的录像也不会全丢。
            mediaRecorder.start(1000);
            console.log('[MainController] MediaRecorder started:', currentRecordingTarget, currentRecordingBlock);
            return true;
        } catch (err) {
            console.error('[MainController] 启动 MediaRecorder 失败，本段不录视频，但流程继续：', err);
            mediaRecorder = null;
            recordedChunks = [];
            return false;
        }
    }

    function stopRecordingWithFallback() {
        // 返回 Promise<Blob|null>。
        // 不再把“进入下一任务”完全绑死在 onstop 上；但会尽量等数据吐完再保存，减少视频不完整。
        return new Promise(resolve => {
            let resolved = false;

            const finish = () => {
                if (resolved) return;
                resolved = true;

                const mimeType = (mediaRecorder && mediaRecorder.mimeType) ? mediaRecorder.mimeType : 'video/webm';
                const blob = (recordedChunks && recordedChunks.length > 0)
                    ? new Blob(recordedChunks.slice(), { type: mimeType })
                    : null;

                console.log('[MainController] MediaRecorder stopped:', currentRecordingTarget, currentRecordingBlock, 'chunks=', recordedChunks.length, 'size=', blob ? blob.size : 0);

                mediaRecorder = null;
                recordedChunks = [];
                currentRecordingTarget = '';
                currentRecordingBlock = '';
                currentRecordingStartedAt = 0;

                resolve(blob);
            };

            try {
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.ondataavailable = e => {
                        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
                    };

                    mediaRecorder.onstop = () => {
                        // 给最后一个 dataavailable 留一点时间。
                        setTimeout(finish, 120);
                    };

                    mediaRecorder.onerror = err => {
                        console.warn('[MainController] MediaRecorder stop error:', err);
                        setTimeout(finish, 120);
                    };

                    try {
                        if (mediaRecorder.state === 'recording' && typeof mediaRecorder.requestData === 'function') {
                            mediaRecorder.requestData();
                        }
                    } catch (err) {
                        console.warn('[MainController] requestData 失败，继续 stop：', err);
                    }

                    mediaRecorder.stop();

                    // 兜底时间拉长到 5 秒，避免 1.5 秒太短导致最后视频片段没写完。
                    setTimeout(() => {
                        if (!resolved) {
                            console.warn('[MainController] MediaRecorder onstop 超时未触发，使用已收集 chunk 继续流程。');
                            finish();
                        }
                    }, 5000);
                } else {
                    console.warn('[MainController] MediaRecorder 不存在或已 inactive，直接使用已收集 chunk。');
                    finish();
                }
            } catch (err) {
                console.error('[MainController] mediaRecorder.stop() 抛错，直接使用已收集 chunk：', err);
                finish();
            }
        });
    }

    let taskState = { 
        Flanker: {data:[], vids:[], files:[]}, 
        Corsi: {data:[], vids:[], files:[]}, 
        SART: {data:[], vids:[], files:[]}, 
        BELT: {data:[], vids:[], files:[]}, 
        MOT: {data:[], vids:[], files:[]}, 
        Soccer: {data:[], vids:[], files:[]},
        JumpRope: {data:[], vids:[], files:[]}
    };


    // 四段运动模块的独立打包缓存。视频和表格仍然先保存在浏览器内存中，点击下载时再打成 zip。
    const segmentLabels = {
        exe1: 'EXE1_运动阶段一',
        cog1: 'COG1_认知任务一',
        exe2: 'EXE2_运动阶段二',
        cog2: 'COG2_认知任务二'
    };

    let segmentState = {
        exe1: { files: [], vids: [] },
        cog1: { files: [], vids: [] },
        exe2: { files: [], vids: [] },
        cog2: { files: [], vids: [] }
    };

    Object.assign(segmentLabels, {
        exe1: '运动一_跳绳一',
        cog1: '运动二_MOT_DRT_2',
        exe2: '运动三_跳绳二',
        cog2: '运动四_MOT_DRT_3',
        sart_post: '运动五_数字炸弹',
        soccer_post: '运动六_足球决策'
    });
    segmentLabels.mot1 = '静息六_MOT_DRT_1';
    segmentState.mot1 = { files: [], vids: [] };
    segmentState.sart_post = { files: [], vids: [] };
    segmentState.soccer_post = { files: [], vids: [] };

    function ensureSegment(segmentId) {
        if (!segmentId) return null;
        if (!segmentState[segmentId]) segmentState[segmentId] = { files: [], vids: [] };
        return segmentState[segmentId];
    }

    function safeFilename(name) {
        return String(name || 'file').replace(/[\\/:*?"<>|]/g, '_');
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);
    }

    const IdbMini = {
        dbName: 'zju_fc_vault',
        storeName: 'kv',
        open() {
            return new Promise((resolve, reject) => {
                if (!window.indexedDB) return reject(new Error('indexedDB unavailable'));
                const req = indexedDB.open(this.dbName, 1);
                req.onupgradeneeded = () => {
                    req.result.createObjectStore(this.storeName);
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
            });
        },
        async get(key) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const req = tx.objectStore(this.storeName).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('indexedDB get failed'));
            });
        },
        async set(key, value) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                const req = tx.objectStore(this.storeName).put(value, key);
                req.onsuccess = () => resolve(true);
                req.onerror = () => reject(req.error || new Error('indexedDB set failed'));
            });
        }
    };

    function vaultTs(ts) {
        const d = new Date(ts || Date.now());
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    }

    const LocalVault = {
        key: 'fc_dir_handle',
        handle: null,
        status: 'idle',
        supported() {
            return !!(window.showDirectoryPicker && window.indexedDB && window.isSecureContext);
        },
        async restore() {
            if (!this.supported()) {
                this.status = 'unsupported';
                updateVaultBar();
                return false;
            }
            try {
                this.handle = await IdbMini.get(this.key);
                if (!this.handle) {
                    this.status = 'not_selected';
                    updateVaultBar();
                    return false;
                }
                return this.ensure();
            } catch (err) {
                console.warn('[LocalVault] restore failed:', err);
                this.status = 'not_selected';
                updateVaultBar();
                return false;
            }
        },
        async pick() {
            if (!this.supported()) {
                alert('\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u76f4\u63a5\u9009\u62e9\u672c\u5730\u4fdd\u5b58\u6587\u4ef6\u5939\uff0c\u8bf7\u4f7f\u7528 Edge \u6216 Chrome\uff0c\u5e76\u786e\u4fdd\u9875\u9762\u662f HTTPS \u6216 localhost\u3002');
                return false;
            }
            try {
                this.handle = await window.showDirectoryPicker({ id: 'fc-cog-vault', mode: 'readwrite', startIn: 'documents' });
                await IdbMini.set(this.key, this.handle);
                this.status = 'ready';
                updateVaultBar();
                return true;
            } catch (err) {
                console.warn('[LocalVault] pick cancelled/failed:', err);
                updateVaultBar();
                return false;
            }
        },
        async ensure() {
            if (!this.handle || !this.supported()) return false;
            try {
                let perm = await this.handle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') perm = await this.handle.requestPermission({ mode: 'readwrite' });
                this.status = perm === 'granted' ? 'ready' : 'no_permission';
                updateVaultBar();
                return perm === 'granted';
            } catch (err) {
                console.warn('[LocalVault] permission failed:', err);
                this.status = 'no_permission';
                updateVaultBar();
                return false;
            }
        },
        async write(subject, filename, data) {
            try {
                if (!subject || !filename || !data) return false;
                if (!this.handle) await this.restore();
                if (!(await this.ensure())) return false;
                const subjectDir = await this.handle.getDirectoryHandle(safeFilename(subject), { create: true });
                const fileHandle = await subjectDir.getFileHandle(safeFilename(filename), { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(data);
                await writable.close();
                this.status = 'ready';
                updateVaultBar();
                return true;
            } catch (err) {
                console.warn('[LocalVault] write failed:', filename, err);
                this.status = 'write_failed';
                updateVaultBar();
                return false;
            }
        }
    };

    function ensureVaultBarDom() {
        if (document.getElementById('vault-bar')) return document.getElementById('vault-bar');
        const header = document.querySelector('.header');
        if (!header || !header.parentNode) return null;
        const bar = document.createElement('div');
        bar.id = 'vault-bar';
        bar.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:1vw;padding:0.9vh 2vw;background:#fff7cc;border-bottom:0.16vh solid #f2cf5b;color:#5f4300;font-size:1.65vh;font-weight:800;z-index:9;';
        bar.innerHTML = '<button id="vault-pick-btn" type="button" style="padding:0.8vh 1.4vw;border:none;border-radius:0.8vh;background:#0f3689;color:#fff;font-size:1.55vh;font-weight:900;cursor:pointer;">\u9009\u62e9\u6570\u636e\u4fdd\u5b58\u6587\u4ef6\u5939</button><span id="vault-status"></span>';
        header.parentNode.insertBefore(bar, header.nextSibling);
        return bar;
    }

    function updateVaultBar() {
        const statusEl = document.getElementById('vault-status');
        if (!statusEl) return;
        const map = {
            ready: '\u5df2\u8fde\u63a5\u672c\u5730\u4fdd\u5b58\u6587\u4ef6\u5939\uff1b\u6bcf\u4e2a\u8303\u5f0f\u7ed3\u675f\u540e\u4f1a\u81ea\u52a8\u5199\u5165 CSV \u548c\u89c6\u9891\u3002',
            unsupported: '\u672c\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u76f4\u63a5\u5199\u5165\u672c\u5730\u6587\u4ef6\u5939\uff1b\u8bf7\u4f7f\u7528 Edge/Chrome\u3002',
            no_permission: '\u672c\u5730\u4fdd\u5b58\u6587\u4ef6\u5939\u672a\u6388\u6743\uff1b\u8bf7\u91cd\u65b0\u9009\u62e9\u3002',
            write_failed: '\u672c\u5730\u5199\u5165\u5931\u8d25\uff1b\u8bf7\u68c0\u67e5\u6587\u4ef6\u5939\u6743\u9650\u6216\u91cd\u65b0\u9009\u62e9\u3002',
            not_selected: '\u8bf7\u5148\u70b9\u51fb\u201c\u9009\u62e9\u6570\u636e\u4fdd\u5b58\u6587\u4ef6\u5939\u201d\uff0c\u4e4b\u540e\u6bcf\u4e2a\u8303\u5f0f\u7ed3\u675f\u4f1a\u81ea\u52a8\u4fdd\u5b58\u3002'
        };
        statusEl.textContent = map[LocalVault.status] || map.not_selected;
    }

    function setupVaultBar() {
        ensureVaultBarDom();
        const btn = document.getElementById('vault-pick-btn');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.onclick = () => LocalVault.pick();
        }
        LocalVault.restore();
        updateVaultBar();
    }

    function clearFinishOverlays() {
        ['single-finish-overlay', 'fusion-stage-finish-overlay'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
    }

    function updateCardStatus(card, statusText, done) {
        if (!card) return;
        const statusEl = card.querySelector('.task-status, .stage-status');
        if (statusEl) {
            statusEl.textContent = statusText || '未开始';
            statusEl.classList.toggle('done', !!done);
        }
        const actionEl = card.querySelector('.task-action');
        if (actionEl) actionEl.textContent = done ? '已完成' : '开始任务';
    }

    function markTaskCardFinished(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        card.classList.add('finished');
        updateCardStatus(card, '已完成', true);
    }

    const GLOBAL_TIME_HEADERS = [
        'global_session_start_timestamp_ms',
        'global_session_start_iso',
        'global_session_start_beijing',
        'global_row_saved_timestamp_ms',
        'global_row_saved_iso',
        'global_row_saved_beijing',
        'global_task_start_timestamp_ms',
        'global_task_start_iso',
        'global_task_start_beijing',
        'global_task_end_timestamp_ms',
        'global_task_end_iso',
        'global_task_end_beijing',
        'global_task_duration_ms',
        'global_task_name',
        'global_task_block',
        'global_sequence_index',
        'global_current_button_id',
        'global_entrance_mode',
        'global_segment_id',
        'global_attempt_id',
        'global_abnormal_restart',
        'global_abnormal_reason'
    ];

    function csvCell(value) {
        if (value === undefined || value === null) return '';
        const s = String(value).replace(/"/g, '""');
        return /[",\n\r]/.test(s) ? `"${s}"` : s;
    }

    function formatBeijingTime(ms) {
        if (!ms) return '';
        return new Date(ms).toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    function buildGlobalTimeValues(task, startMs, endMs, savedMs) {
        const realEndMs = endMs || Date.now();
        const realSavedMs = savedMs || Date.now();
        const realStartMs = startMs || '';
        const duration = realStartMs ? Math.max(0, realEndMs - realStartMs) : '';
        return {
            global_session_start_timestamp_ms: globalSessionStartTimestampMs,
            global_session_start_iso: globalSessionStartISO,
            global_session_start_beijing: formatBeijingTime(globalSessionStartTimestampMs),
            global_row_saved_timestamp_ms: realSavedMs,
            global_row_saved_iso: new Date(realSavedMs).toISOString(),
            global_row_saved_beijing: formatBeijingTime(realSavedMs),
            global_task_start_timestamp_ms: realStartMs,
            global_task_start_iso: realStartMs ? new Date(realStartMs).toISOString() : '',
            global_task_start_beijing: realStartMs ? formatBeijingTime(realStartMs) : '',
            global_task_end_timestamp_ms: realEndMs,
            global_task_end_iso: new Date(realEndMs).toISOString(),
            global_task_end_beijing: formatBeijingTime(realEndMs),
            global_task_duration_ms: duration,
            global_task_name: task && task.name ? task.name : '',
            global_task_block: task && task.block !== undefined ? task.block : '',
            global_sequence_index: currentIndex,
            global_current_button_id: currentBtnId || '',
            global_entrance_mode: localStorage.getItem('assessment_entrance_mode') || 'rest',
            global_segment_id: task && task.segmentId ? task.segmentId : (task && task.ropeSegmentId ? task.ropeSegmentId : ''),
            global_attempt_id: currentAttemptId || '',
            global_abnormal_restart: abnormalRestart ? 1 : 0,
            global_abnormal_reason: abnormalReason || ''
        };
    }

    function appendGlobalTimeColumnsToLines(lines, task, startMs, endMs, savedMs) {
        if (!Array.isArray(lines) || lines.length === 0) return lines;
        const valuesObj = buildGlobalTimeValues(task, startMs, endMs, savedMs);
        const headerSuffix = ',' + GLOBAL_TIME_HEADERS.join(',');
        const valueSuffix = ',' + GLOBAL_TIME_HEADERS.map(h => csvCell(valuesObj[h])).join(',');

        lines[0] += headerSuffix;
        for (let i = 1; i < lines.length; i++) {
            if (String(lines[i] || '').trim() !== '') lines[i] += valueSuffix;
        }
        return lines;
    }

    function appendGlobalTimeColumnsToCsvString(csvContent, task, startMs, endMs, savedMs) {
        let clean = String(csvContent || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
        if (!clean) return '';
        let lines = clean.split('\n');
        appendGlobalTimeColumnsToLines(lines, task, startMs, endMs, savedMs);
        return lines.join('\n');
    }

    function buildRopeCsvHeader() {
        return 'subject_id,round,duration_sec,count,timestamp_ms,' + GLOBAL_TIME_HEADERS.join(',') + ',abnormal_rope_interrupted,recovery_timestamp_ms,recovery_beijing';
    }

    function buildRopeCsvLine(taskObj, durationSec, count, endMs) {
        const ropeTask = { name: 'JumpRope', block: taskObj.ropeRound, segmentId: taskObj.ropeSegmentId };
        const valuesObj = buildGlobalTimeValues(ropeTask, currentRopeStartTimestampMs, endMs, endMs);
        return [globalUserID, taskObj.ropeRound, durationSec, count, endMs]
            .map(csvCell)
            .concat(GLOBAL_TIME_HEADERS.map(h => csvCell(valuesObj[h])))
            .concat(['', '', ''])
            .join(',');
    }

    function buildRopeRecoveryCsvLine(recoverTask, count) {
        const now = Date.now();
        currentRopeStartTimestampMs = recoverTask.startedAt || now;
        const round = recoverTask.block || recoverTask.ropeRound || recoverTask.cardId || '';
        const taskObj = { ropeRound: round, ropeSegmentId: recoverTask.cardId || recoverTask.segmentId || '' };
        const valuesObj = buildGlobalTimeValues({ name: 'JumpRope', block: round, segmentId: taskObj.ropeSegmentId }, currentRopeStartTimestampMs, now, now);
        return [globalUserID, round, '', count, now]
            .map(csvCell)
            .concat(GLOBAL_TIME_HEADERS.map(h => csvCell(valuesObj[h])))
            .concat(['1', now, formatBeijingTime(now)])
            .join(',');
    }

    function segmentAddText(segmentId, filename, content) {
        const seg = ensureSegment(segmentId);
        if (!seg) return;
        seg.files.push({ filename: safeFilename(filename), content: content || '' });
    }

    function segmentAddVideo(segmentId, filename, blob) {
        const seg = ensureSegment(segmentId);
        if (!seg || !blob || !blob.size) return;
        seg.vids.push({ filename: safeFilename(filename), blob });
    }

    function triggerBlobDownload(blob, filename) {
        if (!blob) return;
        fullscreenExitAllowedUntil = Date.now() + 5000;
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = safeFilename(filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    function hasAnyBufferedData() {
        for (let t in taskState) {
            const st = taskState[t] || {};
            if ((st.data && st.data.length) || (st.vids && st.vids.length) || (st.files && st.files.length)) return true;
        }
        if (globalClickLog.length > 1) return true;
        return false;
    }

    function isParadigmRunning() {
        const container = document.getElementById('experiment-container');
        const iframe = document.getElementById('exp-iframe');
        return !!(container && iframe && container.style.display !== 'none' && iframe.src && iframe.src !== 'about:blank');
    }

    function isRopeOrTransitionRunning() {
        const overlay = document.getElementById('transition-overlay');
        const overlayVisible = overlay && overlay.style.display !== 'none' && overlay.style.display !== '';
        return !!(ropeTimerActive || ropeTimerDone || (overlayVisible && window.currentTransitionTask));
    }

    function clearStaleFusionActive(stageId) {
        if (isParadigmRunning() || isRopeOrTransitionRunning()) return false;
        document.querySelectorAll('.fusion-stage-card.active').forEach(card => {
            if (!card.classList.contains('finished')) {
                const id = (card.id || '').replace(/^stage-/, '');
                updateFusionStageUI(id, '');
            }
        });
        currentFusionStageId = "";
        currentSequence = [];
        currentIndex = 0;
        transitionQueue = [];
        window.currentTransitionTask = null;
        postProgressStatus('idle', { activeTask: null, card_id: stageId || '' });
        return true;
    }

    function requestParadigmFullscreen() {
        const el = document.documentElement;
        const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (!request || document.fullscreenElement || document.webkitFullscreenElement) return;
        try {
            const result = request.call(el);
            if (result && result.catch) {
                result.catch(err => logServerEvent('fullscreen_request_failed', { message: err && err.message ? err.message : String(err || '') }));
            }
        } catch (err) {
            logServerEvent('fullscreen_request_failed', { message: err && err.message ? err.message : String(err || '') });
        }
    }

    document.addEventListener('fullscreenchange', () => {
        if (!isParadigmRunning() || blockCompletionInProgress) return;
        if (Date.now() < fullscreenExitAllowedUntil) return;
        if (!document.fullscreenElement) {
            const active = getActiveTaskForProgress();
            logServerEvent('fullscreen_exit_during_task', { activeTask: active });
            showLockPage({ subject_id: globalUserID, activeTask: active, lastHeartbeatAt: Date.now() }, 'fullscreen_exit_during_task');
        }
    });

    function showAutoSavedToast(message) {
        const old = document.getElementById('auto-saved-toast');
        if (old) old.remove();
        const div = document.createElement('div');
        div.id = 'auto-saved-toast';
        div.style.cssText = 'position:fixed; left:50%; top:4vh; transform:translateX(-50%); z-index:7000; background:#0f3689; color:#fff; padding:1.4vh 2vw; border-radius:1.2vh; font-size:2vh; font-weight:900; box-shadow:0 0.8vh 2vh rgba(0,0,0,0.18);';
        div.textContent = message || '数据已自动保存下载';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 2800);
    }

    function saveTextToServer(paradigm, filename, content) {
        if (!globalUserID || !content) return;
        fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paradigm,
                subject_id: globalUserID,
                attempt_id: currentAttemptId || '',
                filename: safeFilename(filename),
                content
            })
        }).catch(err => console.warn('[MainController] server text save failed:', paradigm, filename, err));
    }

    function getCompletedCardIds() {
        const ids = Array.from(document.querySelectorAll('.start-btn.finished, .fusion-stage-card.finished, .fusion-main-btn.finished')).map(btn => btn.id);
        completedCardSet.forEach(id => { if (id && !ids.includes(id)) ids.push(id); });
        return ids;
    }

    function normalizeCompletedCards(source) {
        const out = [];
        function add(id) {
            if (!id || out.includes(id)) return;
            out.push(id);
        }
        if (Array.isArray(source)) source.forEach(add);
        else if (source && typeof source === 'object') {
            if (Array.isArray(source.completedCards)) source.completedCards.forEach(add);
            if (Array.isArray(source.completedTasks)) source.completedTasks.forEach(add);
        }
        return out;
    }

    function applyCompletedCards(source) {
        normalizeCompletedCards(source).forEach(id => {
            if (id && id.indexOf('stage-') === 0) {
                updateFusionStageUI(id.replace('stage-', ''), 'finished');
            } else {
                markTaskCardFinished(id);
            }
        });
    }

    function getActiveTaskForProgress() {
        const task = currentSequence && currentIndex >= 0 ? currentSequence[currentIndex] : null;
        if (!task) return null;
        const iframe = document.getElementById('exp-iframe');
        const isIframeActive = iframe && iframe.src && iframe.src !== 'about:blank' && document.getElementById('experiment-container').style.display !== 'none';
        const isRopeActive = !!(window.currentTransitionTask && window.currentTransitionTask.requiresRopeInput && (ropeTimerActive || ropeTimerDone));
        if (!isIframeActive && !isRopeActive) return null;
        const cardId = task.segmentId || task.ropeSegmentId || currentFusionStageId || currentBtnId || '';
        return {
            taskName: task.name || 'JumpRope',
            block: task.block || task.ropeRound || '',
            cardId,
            card_id: cardId,
            sequenceIndex: currentIndex,
            startedAt: task.__global_task_start_timestamp_ms || currentRopeStartTimestampMs || Date.now(),
            trial_index: task.__current_trial_index || resumeTrialByCard[cardId] || 1,
            resume_trial_index: task.__current_trial_index || resumeTrialByCard[cardId] || 1
        };
    }

    function postProgressStatus(status, extra) {
        if (!globalUserID) return Promise.resolve(null);
        const body = Object.assign({
            subject_id: globalUserID,
            owner_id: browserOwnerId,
            attempt_id: currentAttemptId || (globalUserID + '-attempt-1'),
            attempt: Number(String(currentAttemptId || '').split('-attempt-')[1] || 1),
            status: status || 'idle',
            entranceMode: localStorage.getItem('assessment_entrance_mode') || 'rest',
            currentBtnId: currentBtnId || '',
            currentIndex: currentIndex || 0,
            card_id: extra && extra.card_id ? extra.card_id : '',
            trial_index: extra && extra.trial_index ? extra.trial_index : '',
            resume_trial_index: extra && extra.resume_trial_index ? extra.resume_trial_index : '',
            activeTask: getActiveTaskForProgress(),
            completedCards: getCompletedCardIds(),
            completedTasks: getCompletedCardIds(),
            abnormal_restart: abnormalRestart ? 1 : 0,
            abnormal_reason: abnormalReason || '',
            savedAt: Date.now()
        }, extra || {});
        return fetch('/api/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(r => {
            if (r.status === 409) {
                r.json().then(data => showLockPage(data.progress || body, 'same_subject_active_elsewhere'));
                return null;
            }
            return r.json().catch(() => null);
        }).catch(err => {
            console.warn('[MainController] progress save failed, kept in localStorage:', err);
            return null;
        });
    }

    function logServerEvent(type, detail) {
        if (!globalUserID) return;
        fetch('/api/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject_id: globalUserID, event: Object.assign({ type }, detail || {}) })
        }).catch(err => console.warn('[MainController] event save failed:', err));
    }

    function uploadBlobToServer(paradigm, filename, blob) {
        if (!globalUserID || !blob || !blob.size) return;
        const url = `/api/save-binary?paradigm=${encodeURIComponent(paradigm || 'unknown')}&subject_id=${encodeURIComponent(globalUserID)}&attempt_id=${encodeURIComponent(currentAttemptId || '')}&filename=${encodeURIComponent(safeFilename(filename))}`;
        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'application/octet-stream' },
            body: blob
        }).catch(err => console.warn('[MainController] server binary save failed:', paradigm, filename, err));
    }

    function showLockPage(state, reason) {
        const lock = document.getElementById('step-lock');
        const entry = document.getElementById('entry-select-overlay');
        const login = document.getElementById('login-overlay');
        const recovery = document.getElementById('step-recovery');
        const step1 = document.getElementById('step-1');
        const step2 = document.getElementById('step-2');
        const detail = document.getElementById('lock-detail');
        const active = (state && state.activeTask) || {};
        const activeCardId = active.cardId || active.card_id || '';
        const finalReason = reason || (state && state.lockReason) || 'refresh_or_abnormal_close';
        if (entry) entry.style.display = 'none';
        if (login) login.style.display = 'flex';
        if (recovery) recovery.style.display = 'none';
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'none';
        if (lock) lock.style.display = 'block';
        if (detail) {
            detail.innerHTML =
                `被试：<b>${escapeHtml((state && state.subject_id) || globalUserID || '')}</b><br>` +
                `当前卡片：<b>${escapeHtml(segmentLabels[activeCardId] || activeCardId || active.taskName || '未知')}</b><br>` +
                `异常原因：<b>${escapeHtml(finalReason)}</b><br>` +
                `最近保存：${state && state.lastHeartbeatAt ? formatBeijingTime(state.lastHeartbeatAt) : '未知'}<br>` +
                `<span style="color:#b91c1c;font-weight:900;">当前未完成卡片会作废，主试解锁后从该卡片开头重做。</span>`;
        }
        const local = localStorage.getItem('zju_exp_state');
        if (local) {
            try {
                const obj = JSON.parse(local);
                obj.status = 'locked';
                obj.lockReason = finalReason;
                obj.activeTask = obj.activeTask || active;
                safeStoreExpState(obj);
            } catch (e) {}
        }
        if (globalUserID) postProgressStatus('locked', { locked: true, lockReason: finalReason, activeTask: active });
    }

    async function supervisorUnlockAndResume() {
        const code = (document.getElementById('unlock-code') || {}).value || '';
        const stateStr = localStorage.getItem('zju_exp_state');
        let state = stateStr ? JSON.parse(stateStr) : {};
        const sid = globalUserID || state.userID || state.subject_id;
        if (!sid) return alert('找不到被试编号，请重新输入姓名和电话。');
        const reason = state.lockReason || 'supervisor_unlock_restart_current_card';
        const res = await fetch('/api/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subject_id: sid, code, reason })
        }).catch(() => null);
        if (!res || !res.ok) return alert('解锁失败：口令不正确，或服务器未响应。');
        const data = await res.json().catch(() => ({}));
        abnormalRestart = 1;
        abnormalReason = reason;
        currentAttemptId = data.progress && data.progress.attempt_id ? data.progress.attempt_id : (sid + '-attempt-' + Date.now());
        state.status = 'unlocked';
        state.lockReason = reason;
        state.abnormalRestart = 1;
        state.abnormalReason = reason;
        state.currentAttemptId = currentAttemptId;
        state.recoverTask = data.progress && data.progress.recoverTask ? data.progress.recoverTask : (state.activeTask || null);
        state.activeTask = null;
        safeStoreExpState(state);
        resumeCameraContext();
    }
    window.supervisorUnlockAndResume = supervisorUnlockAndResume;

    function startHeartbeat() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
            const active = getActiveTaskForProgress();
            postProgressStatus(active ? 'active' : 'idle');
        }, 5000);
    }

    function safeStoreExpState(state) {
        if (!state) return false;
        const compact = JSON.parse(JSON.stringify(state, (key, value) => {
            if (['csvData', 'auxFiles', 'clicks', 'data', 'files', 'vids', 'blob', 'content'].includes(key)) return undefined;
            return value;
        }));
        try {
            localStorage.setItem('zju_exp_state', JSON.stringify(compact));
            return true;
        } catch (err) {
            try {
                localStorage.removeItem('zju_exp_state');
                localStorage.setItem('zju_exp_state', JSON.stringify(compact));
                console.warn('[MainController] compact progress replaced oversized local progress:', err);
                return true;
            } catch (err2) {
                console.warn('[MainController] progress localStorage save skipped:', err2);
                return false;
            }
        }
    }

    function updateFusionStageUI(segmentId, status) {
        if (!segmentId) return;
        const card = document.getElementById('stage-' + segmentId);
        if (!card) return;
        card.classList.remove('active', 'finished');
        if (status === 'active') {
            card.classList.add('active');
            updateCardStatus(card, '进行中', false);
        } else if (status === 'finished') {
            card.classList.add('finished');
            completedCardSet.add('stage-' + segmentId);
            updateCardStatus(card, '已完成', true);
        } else {
            updateCardStatus(card, '未开始', false);
        }

        const dl = document.getElementById('download-' + segmentId);
        if (dl) dl.style.display = status === 'finished' ? 'inline-block' : 'none';
    }

    function finishFusionStage(segmentId, options) {
        if (!segmentId) return;
        updateFusionStageUI(segmentId, 'finished');
        if (currentFusionStageId === segmentId) currentFusionStageId = "";
        saveProgress();
        postProgressStatus('idle', {
            card_id: segmentId,
            activeTask: null,
            completedCards: getCompletedCardIds()
        });
        if (!options || options.showOverlay !== false) showFusionStageFinishedOverlay(segmentId);
    }

    function makeTaskZipFolder(zip, folderName, taskName) {
        const root = zip.folder(safeFilename(folderName));
        const st = taskState[taskName];
        if (!root || !st) return;
        if (st.data && st.data.length) root.file(`${globalUserID}_${taskName}.csv`, "\uFEFF" + st.data.join('\n'));
        if (st.vids && st.vids.length) st.vids.forEach((v, i) => root.file(`${globalUserID}_${taskName}_B${i + 1}.webm`, v));
        if (st.files && st.files.length) st.files.forEach((f, i) => root.file(`${globalUserID}_${f.filename || (taskName + '_extra_' + (i + 1) + '.txt')}`, f.content || ''));
        if (globalClickLog.length > 1) root.file(`${globalUserID}_Global_Clicks_Log.csv`, "\uFEFF" + globalClickLog.join('\n'));
    }

    async function buildTaskPackageBlob(taskName, label) {
        if (!taskName || !taskState[taskName]) return null;
        const zip = new JSZip();
        makeTaskZipFolder(zip, `${globalUserID}_${label || taskName}`, taskName);
        return zip.generateAsync({ type: 'blob' });
    }

    async function downloadTaskPackage(taskName, label) {
        const blob = await buildTaskPackageBlob(taskName, label);
        if (!blob) return alert('没有找到该范式的数据。');
        triggerBlobDownload(blob, `${globalUserID}_${safeFilename(label || taskName)}_Backup.zip`);
    }

    async function buildSegmentPackageBlob(segmentId) {
        const seg = ensureSegment(segmentId);
        if (!seg || (!seg.files.length && !seg.vids.length)) return null;
        const zip = new JSZip();
        const root = zip.folder(`${globalUserID}_${segmentLabels[segmentId] || segmentId}`);
        seg.files.forEach(f => root.file(f.filename, f.content || ''));
        seg.vids.forEach((v, i) => root.file(v.filename || `${segmentId}_video_${i + 1}.webm`, v.blob));
        if (globalClickLog.length > 1) root.file(`${globalUserID}_Global_Clicks_Log.csv`, "\uFEFF" + globalClickLog.join('\n'));
        return zip.generateAsync({ type: 'blob' });
    }

    function getSegmentDownloadFallback(segmentId) {
        if (segmentId === 'mot1') return { taskName: 'MOT', label: segmentLabels.mot1 || '静息六_MOT_DRT_1' };
        return null;
    }

    async function buildSegmentPackageBlobWithFallback(segmentId) {
        const blob = await buildSegmentPackageBlob(segmentId);
        if (blob) return blob;
        const fallback = getSegmentDownloadFallback(segmentId);
        if (!fallback) return null;
        return buildTaskPackageBlob(fallback.taskName, fallback.label);
    }

    async function downloadSegmentPackage(segmentId) {
        const blob = await buildSegmentPackageBlobWithFallback(segmentId);
        if (!blob) return alert('这一阶段还没有可下载的数据。');
        triggerBlobDownload(blob, `${globalUserID}_${segmentLabels[segmentId] || segmentId}_Backup.zip`);
        const card = document.getElementById('stage-' + segmentId);
        if (card && card.classList.contains('finished')) {
            finishFusionStage(segmentId, { showOverlay: false });
        }
    }

    function autoDownloadTaskPackage(task) {
        if (!task || !task.name) return;
        const label = `${task.name}_block_${task.block}`;
        buildTaskPackageBlob(task.name, label)
            .then(blob => {
                if (blob) {
                    triggerBlobDownload(blob, `${globalUserID}_${safeFilename(label)}_AutoBackup.zip`);
                    showAutoSavedToast(`${label} 数据已自动保存下载`);
                } else {
                    showAutoSavedToast(`${label} 已完成；未生成自动包，可点击右上角打包下载数据`);
                }
            })
            .catch(err => {
                console.warn('[MainController] auto task download failed:', err);
                showAutoSavedToast(`${label} 已完成；自动下载未触发，可点击右上角打包下载数据`);
            });
    }

    function autoDownloadSegmentPackage(segmentId, options) {
        if (!segmentId) return;
        const now = Date.now();
        if ((!options || !options.force) && lastSegmentAutoDownloadAt[segmentId] && now - lastSegmentAutoDownloadAt[segmentId] < 3000) return;
        lastSegmentAutoDownloadAt[segmentId] = now;
        buildSegmentPackageBlobWithFallback(segmentId)
            .then(blob => {
                if (blob) {
                    triggerBlobDownload(blob, `${globalUserID}_${segmentLabels[segmentId] || segmentId}_AutoBackup.zip`);
                    showAutoSavedToast(`${segmentLabels[segmentId] || segmentId} 数据已自动保存下载`);
                }
            })
            .catch(err => console.warn('[MainController] auto segment download failed:', err));
    }

    function showSingleTaskFinishedOverlay(task) {
        clearFinishOverlays();
        const div = document.createElement('div');
        div.id = 'single-finish-overlay';
        div.style.cssText = 'position:fixed; inset:0; z-index:5000; background:rgba(255,255,255,0.98); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-family:Microsoft YaHei, sans-serif; padding:5vh;';
        const title = task && task.name ? task.name : '当前范式';
        div.innerHTML = `
            <div style="font-size:4.2vh; font-weight:900; color:#0f3689; margin-bottom:2vh;">${escapeHtml(title)} 已结束</div>
            <div style="font-size:2.4vh; color:#333; line-height:1.7; margin-bottom:4vh; max-width:900px;">
                数据已暂存在浏览器中。你可以现在单独保存该范式数据，也可以最后统一打包下载。
            </div>
            <div style="display:flex; gap:2vw; flex-wrap:wrap; justify-content:center;">
                <button id="single-download-btn" style="padding:2vh 3vw; border:none; border-radius:1.5vh; background:#2e7d32; color:white; font-size:2.2vh; font-weight:bold; cursor:pointer;">保存该范式数据</button>
                <button id="single-close-btn" style="padding:2vh 3vw; border:none; border-radius:1.5vh; background:#0f3689; color:white; font-size:2.2vh; font-weight:bold; cursor:pointer;">返回主界面</button>
            </div>
        `;
        document.body.appendChild(div);
        div.onclick = (e) => { if (e.target === div) div.remove(); };
        div.querySelector('#single-download-btn').onclick = () => downloadTaskPackage(task.name, title);
        div.querySelector('#single-close-btn').onclick = () => div.remove();
    }

    function showFusionStageFinishedOverlay(segmentId) {
        clearFinishOverlays();
        const label = segmentLabels[segmentId] || segmentId || '当前阶段';
        const div = document.createElement('div');
        div.id = 'fusion-stage-finish-overlay';
        div.style.cssText = 'position:fixed; inset:0; z-index:5000; background:rgba(255,255,255,0.98); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-family:Microsoft YaHei, sans-serif; padding:5vh;';
        div.innerHTML = `
            <div style="font-size:4.2vh; font-weight:900; color:#0f3689; margin-bottom:2vh;">${escapeHtml(label)} 已结束</div>
            <div style="font-size:2.4vh; color:#333; line-height:1.7; margin-bottom:4vh; max-width:900px;">
                该阶段数据已暂存在浏览器中。你可以现在单独保存该阶段数据，也可以回到主界面继续点击下一个阶段。
            </div>
            <div style="display:flex; gap:2vw; flex-wrap:wrap; justify-content:center;">
                <button id="stage-download-now-btn" style="padding:2vh 3vw; border:none; border-radius:1.5vh; background:#2e7d32; color:white; font-size:2.2vh; font-weight:bold; cursor:pointer;">保存本阶段数据</button>
                <button id="stage-close-btn" style="padding:2vh 3vw; border:none; border-radius:1.5vh; background:#0f3689; color:white; font-size:2.2vh; font-weight:bold; cursor:pointer;">返回主界面</button>
            </div>
        `;
        document.body.appendChild(div);
        div.onclick = (e) => { if (e.target === div) div.remove(); };
        div.querySelector('#stage-download-now-btn').onclick = () => downloadSegmentPackage(segmentId);
        div.querySelector('#stage-close-btn').onclick = () => div.remove();
    }

    const basicTasks = {
        Flanker: { url: 'paradigms/flanker-jspsych/index f.html', name: 'Flanker', block: 1 },
        Corsi: { url: 'paradigms/corsi-jspsych/index c.html', name: 'Corsi', block: 1 },
        BELT: { url: 'paradigms/BART-jspsych/index b.html', name: 'BELT', block: 1 },

        // 静息态六模块中的三个独立任务：必须留在静息态入口，不进入心体融合流程
        SART_Pre: { url: 'paradigms/sart-jspsych/index sa.html?sart_asset_v=20260615_v3', name: 'SART', block: 'pre' },
        Soccer_Pre: { url: 'paradigms/soccer-jspsych/index s.html', name: 'Soccer', block: 1 },
        MOT1: { url: 'paradigms/mot-jspsych/index m.html', name: 'MOT', block: 1, segmentId: 'mot1', segmentFinal: true }
    };

    function recordClick(context, x, y, target) {
        if (!globalUserID) return; 
        const ts = Date.now();
        globalClickLog.push([
            globalUserID,
            ts,
            new Date(ts).toISOString(),
            formatBeijingTime(ts),
            ts - globalSessionStartTimestampMs,
            context,
            Math.round(x),
            Math.round(y),
            target
        ].map(csvCell).join(','));
    }

    window.addEventListener('mousedown', (e) => {
        if (e.target.tagName !== 'IFRAME') recordClick('MainUI', e.clientX, e.clientY, e.target.tagName);
    }, true);
    
    window.addEventListener('touchstart', (e) => {
        if (e.target.tagName !== 'IFRAME' && e.touches.length > 0) recordClick('MainUI', e.touches[0].clientX, e.touches[0].clientY, e.target.tagName);
    }, {passive: true, capture: true});

    document.getElementById('exp-iframe').addEventListener('load', function() {
        try {
            const iframeDoc = this.contentWindow.document;
            const paradigmName = currentSequence[currentIndex] ? currentSequence[currentIndex].name : 'UnknownParadigm';
            iframeDoc.addEventListener('mousedown', (e) => { recordClick(`Inside_${paradigmName}`, e.clientX, e.clientY, e.target ? e.target.tagName : 'UNKNOWN'); }, true);
            iframeDoc.addEventListener('touchstart', (e) => { if (e.touches.length > 0) recordClick(`Inside_${paradigmName}`, e.touches[0].clientX, e.touches[0].clientY, e.target ? e.target.tagName : 'UNKNOWN'); }, {passive: true, capture: true});
        } catch(e) { }
    });

    async function fetchBlockRandomization(name, phone, subjectId) {
        try {
            const response = await fetch('/api/allocate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, phone: phone, subject_id: subjectId }) });
            const data = await response.json();
            if (!response.ok) { alert(data.error || "获取分配名额失败"); return null; }
            return data;
        } catch (e) { alert("网络错误，无法连接发号服务器！请确保 server.js 已在运行。"); return null; }
    }

    function initUserDisplay(allocData) {
        const display = document.getElementById('user-display');
        if (!display) return;

        const entranceMode = localStorage.getItem('assessment_entrance_mode') || 'rest';

        // 运动态 / 心体融合入口：不显示组别
        if (
            entranceMode === 'fusion' ||
            (allocData && allocData.assigned_order === 'Fixed') ||
            (allocData && allocData.allocation_index === 'fusion_no_allocate')
        ) {
            display.textContent = `被试: ${globalUserID}`;
            return;
        }

        // 静息态入口：保留 A/B 组别显示，因为 BELT 还需要 A/B
        if (allocData && allocData.assigned_order) {
            const orderName = `组别卷: ${allocData.assigned_order}卷`;
            display.textContent = `被试: ${globalUserID}  [${orderName}]`;
        } else {
            display.textContent = `被试: ${globalUserID}`;
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        showSecureContextWarningIfNeeded();
        const savedState = localStorage.getItem('zju_exp_state');
        if(savedState) {
            let parsed = null;
            try { parsed = JSON.parse(savedState); } catch (e) {}
            if (parsed && parsed.status === 'locked' && parsed.activeTask) {
                globalUserID = parsed.userID || parsed.subject_id || '';
                showLockPage(parsed, parsed.lockReason || 'refresh_or_power_loss');
            } else {
                document.getElementById('step-1').style.display = 'none';
                document.getElementById('step-recovery').style.display = 'block';
            }
        }
    });

    function clearProgressAndRestart() {
        localStorage.removeItem('zju_exp_state');
        document.getElementById('step-recovery').style.display = 'none'; document.getElementById('step-1').style.display = 'block';
    }

    async function abandonOldDataAndRestart() {
        const stateStr = localStorage.getItem('zju_exp_state');
        let state = {};
        try { state = stateStr ? JSON.parse(stateStr) : {}; } catch (e) {}
        const sid = globalUserID || state.userID || state.subject_id || '';
        const code = prompt('请输入主试口令，确认放弃旧数据并使用新数据：');
        if (!code) return;
        if (sid) {
            const res = await fetch('/api/abandon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject_id: sid, code, reason: 'supervisor_abandon_old_data' })
            }).catch(() => null);
            if (!res || !res.ok) return alert('放弃失败：口令不正确，或服务器未响应。');
            const data = await res.json().catch(() => ({}));
            if (data.progress && data.progress.attempt_id) currentAttemptId = data.progress.attempt_id;
        } else if (code !== 'Zjuaipsy01') {
            return alert('放弃失败：口令不正确。');
        }
        localStorage.removeItem('zju_exp_state');
        resumeTrialByCard = {};
        pendingRopeRecovery = null;
        abnormalRestart = 0;
        abnormalReason = '';
        const lock = document.getElementById('step-lock');
        const recovery = document.getElementById('step-recovery');
        const step1 = document.getElementById('step-1');
        if (lock) lock.style.display = 'none';
        if (recovery) recovery.style.display = 'none';
        if (step1) step1.style.display = 'block';
    }
    window.abandonOldDataAndRestart = abandonOldDataAndRestart;

    function saveProgress() {
        if(!globalUserID) return;

        const activeFusion = currentBtnId === 'btn-fusion' && currentSequence && currentSequence.length > 0;
        const safeFusionIndex = activeFusion ? Math.max(0, Math.min(currentIndex, currentSequence.length)) : -1;

        const state = {
            userID: globalUserID,
            name: document.getElementById('userName').value.trim(),
            phone: document.getElementById('userPhone').value.trim(),
            allocationData: globalAllocationData,
            currentBtnId: currentBtnId || '',
            completedTasks: getCompletedCardIds(),
            completedCards: getCompletedCardIds(),
            fusionIndex: safeFusionIndex,
            fusionSequence: activeFusion ? currentSequence : [],
            currentTransitionTask: window.currentTransitionTask || null,
            status: getActiveTaskForProgress() ? 'active' : 'idle',
            activeTask: getActiveTaskForProgress(),
            currentAttemptId: currentAttemptId,
            abnormalRestart: abnormalRestart ? 1 : 0,
            abnormalReason: abnormalReason || '',
            resumeTrialByCard: resumeTrialByCard,
            pendingRopeRecovery: pendingRopeRecovery,
            clickCount: Array.isArray(globalClickLog) ? Math.max(0, globalClickLog.length - 1) : 0,
            globalSessionStartTimestampMs: globalSessionStartTimestampMs,
            globalSessionStartISO: globalSessionStartISO,
            savedAt: Date.now()
        };

        safeStoreExpState(state);
        postProgressStatus(state.status, { activeTask: state.activeTask });
    }

    async function resumeCameraContext() {
        const stateStr = localStorage.getItem('zju_exp_state'); const state = JSON.parse(stateStr);
        document.getElementById('userName').value = state.name; document.getElementById('userPhone').value = state.phone;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        try {
            globalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            globalUserID = state.userID; globalAllocationData = state.allocationData; 
            if (state.globalSessionStartTimestampMs) {
                globalSessionStartTimestampMs = state.globalSessionStartTimestampMs;
                globalSessionStartISO = state.globalSessionStartISO || new Date(globalSessionStartTimestampMs).toISOString();
            }
            currentAttemptId = state.currentAttemptId || currentAttemptId || (globalUserID + '-attempt-1');
            abnormalRestart = state.abnormalRestart ? 1 : 0;
            abnormalReason = state.abnormalReason || state.lockReason || '';
            resumeTrialByCard = state.resumeTrialByCard || {};
            pendingRopeRecovery = state.pendingRopeRecovery || null;
            if (state.recoverTask && (state.recoverTask.cardId || state.recoverTask.card_id)) {
                state.recoverTask.cardId = state.recoverTask.cardId || state.recoverTask.card_id;
                const rt = Number(state.recoverTask.resume_trial_index || state.recoverTask.trial_index || 1) || 1;
                resumeTrialByCard[state.recoverTask.cardId] = rt;
                if (state.recoverTask.taskName === 'JumpRope') pendingRopeRecovery = state.recoverTask;
            }
            initUserDisplay(globalAllocationData);
            const autoGroup = (globalAllocationData.assigned_order === 'A') ? 0 : 1; localStorage.setItem('exp_group', autoGroup.toString());
            
            if(state.csvData) { for(let t in state.csvData) { if(taskState[t]) taskState[t].data = state.csvData[t]; } }
            if(state.auxFiles) { for(let t in state.auxFiles) { if(taskState[t]) taskState[t].files = state.auxFiles[t]; } }
            applyCompletedCards(state);
            window.recoveredFusionIndex = -1;
            recoveredStateObj = state;
            window.recoveredCurrentBtnId = state.currentBtnId || '';
            window.recoveredFusionSequence = Array.isArray(state.fusionSequence) ? state.fusionSequence : [];
            document.getElementById('step-recovery').style.display = 'none'; document.getElementById('step-2').style.display = 'block';
            document.getElementById('preview-video').srcObject = globalStream;
            if (audioContext.state === 'suspended') await audioContext.resume(); startAudioCheck(globalStream);
        } catch(e) { alert("设备调用失败！请检查系统权限配置。"); }
    }

    async function requestCamera() {
        const n = document.getElementById('userName').value.trim(), p = document.getElementById('userPhone').value.trim();
        if(!n || !p) return alert("请完整输入姓名和电话");

        const entranceMode = localStorage.getItem('assessment_entrance_mode') || 'rest';
        const btn = document.getElementById('submit-btn');
        btn.innerText = entranceMode === 'fusion' ? "正在开启设备，请稍候..." : "正在获取中心发号，请稍候...";
        btn.disabled = true;
        localStorage.removeItem('zju_exp_state'); 

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        try {
            globalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            globalUserID = window.pinyinPro.pinyin(n, { pattern:'first', toneType:'none', type:'array'}).join('').toUpperCase() + p;
            const serverProgressResp = await fetch('/api/progress?subject_id=' + encodeURIComponent(globalUserID)).catch(() => null);
            const serverProgressData = serverProgressResp && serverProgressResp.ok ? await serverProgressResp.json().catch(() => null) : null;
            const serverProgress = serverProgressData && serverProgressData.progress;
            const serverProgressAgeMs = serverProgress && serverProgress.lastHeartbeatAt ? Date.now() - Number(serverProgress.lastHeartbeatAt) : Infinity;
            if (serverProgress && serverProgress.status === 'locked' && serverProgress.activeTask) {
                const recovered = {
                    userID: globalUserID,
                    subject_id: globalUserID,
                    name: n,
                    phone: p,
                    allocationData: serverProgress.allocationData || globalAllocationData,
                    currentBtnId: serverProgress.currentBtnId || 'btn-fusion',
                    fusionIndex: serverProgress.currentIndex || 0,
                    completedTasks: normalizeCompletedCards(serverProgress),
                    completedCards: normalizeCompletedCards(serverProgress),
                    activeTask: serverProgress.activeTask,
                    status: 'locked',
                    lockReason: serverProgress.lockReason || 'refresh_or_power_loss',
                    currentAttemptId: serverProgress.attempt_id || '',
                    savedAt: Date.now()
                };
                safeStoreExpState(recovered);
                showLockPage(recovered, recovered.lockReason);
                return;
            }
            if (serverProgress && serverProgress.status === 'active' && serverProgress.activeTask && serverProgressAgeMs < 15000) {
                const recovered = {
                    userID: globalUserID,
                    subject_id: globalUserID,
                    name: n,
                    phone: p,
                    allocationData: serverProgress.allocationData || globalAllocationData,
                    currentBtnId: serverProgress.currentBtnId || 'btn-fusion',
                    fusionIndex: serverProgress.currentIndex || 0,
                    completedTasks: normalizeCompletedCards(serverProgress),
                    completedCards: normalizeCompletedCards(serverProgress),
                    activeTask: serverProgress.activeTask,
                    status: 'locked',
                    lockReason: 'same_subject_active_elsewhere',
                    currentAttemptId: serverProgress.attempt_id || '',
                    savedAt: Date.now()
                };
                safeStoreExpState(recovered);
                showLockPage(recovered, recovered.lockReason);
                return;
            }
            if (serverProgress && serverProgress.status === 'active' && serverProgress.activeTask) {
                const recovered = {
                    userID: globalUserID,
                    subject_id: globalUserID,
                    name: n,
                    phone: p,
                    allocationData: serverProgress.allocationData || globalAllocationData,
                    currentBtnId: serverProgress.currentBtnId || 'btn-fusion',
                    fusionIndex: serverProgress.currentIndex || 0,
                    completedTasks: normalizeCompletedCards(serverProgress),
                    completedCards: normalizeCompletedCards(serverProgress),
                    recoverTask: serverProgress.activeTask,
                    status: 'idle',
                    currentAttemptId: serverProgress.attempt_id || '',
                    savedAt: Date.now()
                };
                safeStoreExpState(recovered);
                document.getElementById('step-1').style.display = 'none';
                document.getElementById('step-recovery').style.display = 'block';
                btn.disabled = false;
                return;
            }
            if (serverProgress && serverProgress.status === 'abandoned') {
                if (serverProgress.attempt_id) currentAttemptId = serverProgress.attempt_id;
                window.serverCompletedCards = [];
            } else if (serverProgress) {
                window.serverCompletedCards = normalizeCompletedCards(serverProgress);
                if (serverProgress.attempt_id) currentAttemptId = serverProgress.attempt_id;
                abnormalRestart = serverProgress.abnormal_restart ? 1 : 0;
                abnormalReason = serverProgress.abnormal_reason || '';
            }
            globalSessionStartTimestampMs = Date.now();
            globalSessionStartISO = new Date(globalSessionStartTimestampMs).toISOString();
                globalClickLog = ["subject_id,timestamp_ms,timestamp_iso,timestamp_beijing,elapsed_from_session_start_ms,context,x_pos,y_pos,element_tag"];

            if (entranceMode === 'fusion') {
                // 心体融合/运动态入口：不重新中央发号。
                // 气球 BELT 仍在静息态入口中完成，因此 A/B 发号只保留给静息态入口。
                globalAllocationData = {
                    assigned_order: 'Fixed',
                    order_description: '运动态固定顺序：运动阶段一 → 认知任务一 → 运动阶段二 → 认知任务二；未重新中央发号',
                    block_id: 'fusion_fixed',
                    block_pattern: 'fixed',
                    block_position: '',
                    allocation_index: 'fusion_no_allocate',
                    allocation_time: new Date().toLocaleString('zh-CN'),
                    subject_id: globalUserID,
                    name: n,
                    phone: p
                };
            } else {
                // 静息态入口：保留中央发号，用于 BELT A/B 组等静息态任务。
                globalAllocationData = await fetchBlockRandomization(n, p, globalUserID);
                if (!globalAllocationData) { btn.innerText = "进入系统与设备自检"; btn.disabled = false; return; }
            }

            initUserDisplay(globalAllocationData);

            const autoGroup = (globalAllocationData.assigned_order === 'A') ? 0 : 1; localStorage.setItem('exp_group', autoGroup.toString());
            document.getElementById('step-1').style.display='none'; document.getElementById('step-2').style.display='block';
            document.getElementById('preview-video').srcObject = globalStream;
            if (audioContext.state === 'suspended') await audioContext.resume(); startAudioCheck(globalStream);
        } catch(e) { alert("摄像头或麦克风权限获取失败，请检查浏览器设置！"); btn.innerText = "进入系统与设备自检"; btn.disabled = false; }
    }

    function startAudioCheck(stream) {
        const analyser = audioContext.createAnalyser(); const microphone = audioContext.createMediaStreamSource(stream); microphone.connect(analyser); analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const volBar = document.getElementById('volume-bar'), startBtn = document.getElementById('start-btn'), statusText = document.getElementById('mic-status-text');
        let volumePassed = false;
        function checkVolume() {
            analyser.getByteFrequencyData(dataArray); let percentage = Math.min(100, (Math.max(...dataArray) / 140) * 100); volBar.style.width = percentage + '%';
            if (percentage > 85 && !volumePassed) {
                volumePassed = true; volBar.style.background = '#2e7d32'; statusText.innerText = "✅ 麦克风收音正常！"; statusText.style.color = '#2e7d32';
                startBtn.disabled = false; startBtn.style.background = '#2e7d32'; startBtn.style.cursor = 'pointer'; startBtn.innerText = "设备正常，点击进入系统";
            }
            volumeCheckReq = requestAnimationFrame(checkVolume);
        }
        checkVolume();
    }

    function enterApp() {
        if(volumeCheckReq) cancelAnimationFrame(volumeCheckReq);
        document.getElementById('login-overlay').style.display='none';
        document.getElementById('main-ui').style.display='flex';
        setupVaultBar();
        if (!currentAttemptId && globalUserID) currentAttemptId = globalUserID + '-attempt-1';
        startHeartbeat();
        if (Array.isArray(window.serverCompletedCards)) {
            applyCompletedCards(window.serverCompletedCards);
        }
        if (pendingRopeRecovery) {
            completeInterruptedRopeFromRecovery(pendingRopeRecovery);
            pendingRopeRecovery = null;
        }

        if(false && window.recoveredFusionIndex !== undefined && window.recoveredFusionIndex >= 0) {
            currentBtnId = 'btn-fusion';
            currentSequence = buildFusionSequence();
            currentIndex = Math.max(0, Math.min(window.recoveredFusionIndex, currentSequence.length));

            if (currentIndex >= currentSequence.length) {
                const btn = document.getElementById('btn-fusion');
                if (btn) {
                    btn.classList.add('finished');
                    btn.innerHTML = `<span class="fusion-emoji" style="font-size: 10vh; margin-bottom: 2vh;">✅</span><span class="fusion-text" style="color: #999;">融合挑战已完成</span>`;
                }
                saveProgress();
                window.recoveredFusionIndex = -1;
                return;
            }

            const nextTask = currentSequence[currentIndex];
            transitionQueue = [
                {
                    inst: `【进度恢复】<br>已恢复到心体融合第 ${currentIndex + 1} / ${currentSequence.length} 项。<br><br>接下来将重新开始：<br><b>${nextTask.inst || nextTask.name}</b><br><br><span style="color:#777;font-size:2.2vh;">说明：如果上次是在某个任务中断，本系统会从该任务开头重新来，避免半段数据混入正式数据。</span>`,
                    requiresRopeInput: false
                },
                nextTask
            ];
            saveProgress();
            showNextTransition();
            window.recoveredFusionIndex = -1;
            return;
        }

        saveProgress();
    }

    function completeInterruptedRopeFromRecovery(recoverTask) {
        const cardId = recoverTask.cardId || recoverTask.card_id || recoverTask.segmentId || '';
        const count = prompt(`检测到${segmentLabels[cardId] || '跳绳卡片'}中断。请主试补录本轮跳绳次数：`);
        if (count === null || String(count).trim() === '') {
            pendingRopeRecovery = recoverTask;
            return alert('需要补录跳绳次数后才能把该卡片标记完成。');
        }
        if (taskState.JumpRope.data.length === 0) taskState.JumpRope.data.push(buildRopeCsvHeader());
        const line = buildRopeRecoveryCsvLine(recoverTask, String(count).trim());
        taskState.JumpRope.data.push(line);
        const content = "\uFEFF" + buildRopeCsvHeader() + "\n" + line;
        segmentAddText(cardId, `${globalUserID}_JumpRope_recovered_${cardId || 'rope'}.csv`, content);
        saveTextToServer('JumpRope', `${globalUserID}_JumpRope_recovered_${cardId || 'rope'}.csv`, content);
        LocalVault.write(globalUserID, `${globalUserID}_JumpRope_recovered_${cardId || 'rope'}_${vaultTs()}.csv`, content);
        if (cardId) updateFusionStageUI(cardId, 'finished');
        abnormalRestart = 1;
        abnormalReason = 'rope_interrupted_recovered_as_finished';
        logServerEvent('rope_interrupted_recovered', { card_id: cardId, count: String(count).trim() });
        saveProgress();
        postProgressStatus('idle', { activeTask: null, card_id: cardId, status: 'idle' });
    }

    function getSingleTaskIntro(taskKey, task) {
        const titles = {
            Flanker: '箭头判断',
            Corsi: '方块记忆',
            BELT: '气球挑战',
            SART_Pre: '数字炸弹',
            Soccer_Pre: '足球战术决策',
            MOT1: 'MOT+DRT 第一阶段'
        };

        if (taskKey === 'SART_Pre') {
            return '即将开始【数字炸弹】。<br><br>' +
                   '<span style="color:#555;font-size:2.4vh;line-height:1.8;display:inline-block;">' +
                   '请根据屏幕中出现的数字快速反应。<br>' +
                   '看到 <b>3</b> 时请不要按；看到其他数字时请尽快按键。<br>' +
                   '本阶段会先呈现完整指导语，并包含练习以帮助熟悉规则。' +
                   '</span>';
        }

        if (taskKey === 'Soccer_Pre') {
            return '即将开始【足球战术决策】。<br><br>' +
                   '<span style="color:#555;font-size:2.4vh;line-height:1.8;display:inline-block;">' +
                   '请认真观看每段足球视频，关注被标记的球员和球的位置。<br>' +
                   '视频结束后，请从四个选项中选择该球员接下来最合适的行动。<br>' +
                   '本阶段会先呈现完整指导语，并包含练习以帮助熟悉规则。' +
                   '</span>';
        }

        if (taskKey === 'MOT1') {
            return '即将开始【MOT+DRT 第一阶段】。<br><br>' +
                   '<span style="color:#555;font-size:2.4vh;line-height:1.8;display:inline-block;">' +
                   '请追踪最开始变黄的目标小球。<br>' +
                   '小球运动过程中，下方会一直显示“点击”按钮；红框出现时请点击该按钮。<br>' +
                   '运动停止后，请选出目标小球，并点击“确认提交”。<br>' +
                   '本阶段会先呈现完整指导语，并包含练习以帮助熟悉规则。' +
                   '</span>';
        }

        return `即将开始【${titles[taskKey] || task.instTitle || task.name}】。<br><br><span style="color:#555;font-size:2.4vh;">请被试保持安静，按主试与屏幕提示操作。</span>`;
    }

    function startSingle(taskKey) { 
        clearFinishOverlays();
        const task = basicTasks[taskKey];
        if (!task) return alert('找不到任务：' + taskKey);
        currentBtnId = `btn-${taskKey.toLowerCase()}`; 
        const existingBtn = document.getElementById(currentBtnId);
        if (existingBtn && existingBtn.classList.contains('finished')) return alert('该卡片已经完成并保存，不能由被试重复启动。');
        currentSequence = [task];
        currentIndex = 0;
        if (task.segmentId) segmentState[task.segmentId] = { files: [], vids: [] };
        transitionQueue = [
            {
                inst: getSingleTaskIntro(taskKey, task),
                requiresRopeInput: false,
                startBtnText: "开始该范式"
            }
        ];
        saveProgress();
        postProgressStatus('active');
        showNextTransition(); 
    }

    function makeFusionTaskSet() {
        const sartPost = {
            url: 'paradigms/sart-jspsych/index sa.html?sart_asset_v=20260615_v3',
            name: 'SART',
            block: 'post',
            segmentId: 'cog2',
            inst: "认知任务二仍在进行，接下来开始【数字炸弹】。<br><br>" +
                  "<span style='color:#555;font-size:2.4vh;line-height:1.8;display:inline-block;'>" +
                  "本阶段为正式测试，<span style='color:#d32f2f;font-weight:900;'>不再包含练习阶段</span>。<br>" +
                  "请根据屏幕中出现的数字快速反应：看到 <b>3</b> 时不要按，看到其他数字时尽快按键。<br>" +
                  "请尽量保持准确和稳定。" +
                  "</span>"
        };

        const soccerPost = {
            url: 'paradigms/soccer-jspsych/index s.html',
            name: 'Soccer',
            block: 2,
            segmentId: 'cog2',
            segmentFinal: true,
            inst: "数字炸弹已结束，接下来开始【足球战术决策】。<br><br>" +
                  "<span style='color:#555;font-size:2.4vh;line-height:1.8;display:inline-block;'>" +
                  "本阶段为正式测试，<span style='color:#d32f2f;font-weight:900;'>不再包含练习阶段</span>。<br>" +
                  "请认真观看每段足球视频，关注被标记的球员和球的位置。<br>" +
                  "视频结束后，请从四个选项中选择该球员接下来最合适的行动，并尽快作答。" +
                  "</span>"
        };

        const exe1 = {
            name: 'JumpRope',
            block: 'exe1',
            ropeSegmentId: 'exe1',
            segmentId: 'exe1',
            segmentFinal: true,
            requiresRopeInput: true,
            ropeOnly: true,
            ropeRound: 1,
            inst: "<span style='color:#d32f2f;font-weight:900;'>【EXE1：运动阶段一】</span><br>" +
                  "请按照主试要求快速跳绳 3 分钟。<br>" +
                  "计时结束后由主试输入跳绳个数。"
        };

        const cog1 = {
            url: 'paradigms/mot-jspsych/index m.html',
            name: 'MOT',
            block: 2,
            segmentId: 'cog1',
            segmentFinal: true,
            inst: "运动阶段一已结束，接下来开始【COG1：认知任务一】。<br><br>" +
                  "<span style='color:#555;font-size:2.4vh;line-height:1.8;display:inline-block;'>" +
                  "本阶段为正式 MOT+DRT 测试，<span style='color:#d32f2f;font-weight:900;'>没有练习阶段</span>。<br>" +
                  "请追踪最开始变黄的目标小球。<br>" +
                  "小球运动过程中，下方会一直显示<span style='color:#d32f2f;font-weight:900;'>“点击”</span>按钮；红框出现时请点击该按钮。<br>" +
                  "运动停止后，请选出目标小球，并点击“确认提交”。" +
                  "</span>"
        };

        const exe2 = {
            name: 'JumpRope',
            block: 'exe2',
            ropeSegmentId: 'exe2',
            segmentId: 'exe2',
            segmentFinal: true,
            requiresRopeInput: true,
            ropeOnly: true,
            ropeRound: 2,
            inst: "认知任务一已结束，接下来开始【EXE2：运动阶段二】。<br><br>" +
                  "请按照主试要求快速跳绳 3 分钟。<br>" +
                  "计时结束后由主试输入跳绳个数。"
        };

        const cog2Mot = {
            url: 'paradigms/mot-jspsych/index m.html',
            name: 'MOT',
            block: 3,
            segmentId: 'cog2',
            inst: "运动阶段二已结束，接下来开始【COG2：认知任务二】。<br><br>" +
                  "<span style='color:#555;font-size:2.4vh;line-height:1.8;display:inline-block;'>" +
                  "本阶段为正式 MOT+DRT 测试，<span style='color:#d32f2f;font-weight:900;'>没有练习阶段</span>。<br>" +
                  "请追踪最开始变黄的目标小球。<br>" +
                  "小球运动过程中，下方会一直显示<span style='color:#d32f2f;font-weight:900;'>“点击”</span>按钮；红框出现时请点击该按钮。<br>" +
                  "运动停止后，请选出目标小球，并点击“确认提交”。" +
                  "</span>"
        };

        const fullMot2 = {
            url: 'paradigms/mot-jspsych/index m.html',
            name: 'MOT',
            block: 2,
            ropeSegmentId: 'exe1',
            segmentId: 'cog1',
            segmentFinal: true,
            requiresRopeInput: true,
            ropeRound: 1,
            inst: exe1.inst,
            afterRopeInst: cog1.inst
        };

        const fullMot3 = {
            url: 'paradigms/mot-jspsych/index m.html',
            name: 'MOT',
            block: 3,
            ropeSegmentId: 'exe2',
            segmentId: 'cog2',
            requiresRopeInput: true,
            ropeRound: 2,
            inst: exe2.inst,
            afterRopeInst: cog2Mot.inst
        };

        return { sartPost, soccerPost, exe1, cog1, exe2, cog2Mot, fullMot2, fullMot3 };
    }

    function buildFusionStageSequence(stageId) {
        const t = makeFusionTaskSet();
        if (stageId === 'exe1') return { intro: "接下来开始【EXE1：运动阶段一】。", sequence: [], firstTask: t.exe1 };
        if (stageId === 'cog1') return { intro: t.cog1.inst, sequence: [t.cog1], firstTask: t.cog1 };
        if (stageId === 'exe2') return { intro: "接下来开始【EXE2：运动阶段二】。", sequence: [], firstTask: t.exe2 };
        if (stageId === 'cog2') {
            const cog2Only = Object.assign({}, t.cog2Mot, { segmentFinal: true });
            return { intro: cog2Only.inst, sequence: [cog2Only], firstTask: cog2Only };
        }
        if (stageId === 'sart_post') {
            const sartOnly = Object.assign({}, t.sartPost, { segmentId: 'sart_post', segmentFinal: true });
            return { intro: sartOnly.inst, sequence: [sartOnly], firstTask: sartOnly };
        }
        if (stageId === 'soccer_post') {
            const soccerOnly = Object.assign({}, t.soccerPost, { segmentId: 'soccer_post', segmentFinal: true });
            return { intro: soccerOnly.inst, sequence: [soccerOnly], firstTask: soccerOnly };
        }
        return null;
    }

    function startFusionStage(stageId) {
        const evt = window.event;
        if (evt && evt.target && evt.target.closest && evt.target.closest('.stage-download')) {
            evt.stopPropagation();
            return;
        }
        clearFinishOverlays();
        const cfg = buildFusionStageSequence(stageId);
        if (!cfg) return alert('找不到阶段：' + stageId);

        const stageCard = document.getElementById('stage-' + stageId);
        if (completedCardSet.has('stage-' + stageId)) return alert('该卡片已经完成并保存，不能重复启动。');
        if (stageCard && stageCard.classList.contains('finished')) return alert('该卡片已经完成并保存，不能由被试重复启动。');

        currentBtnId = "btn-fusion";
        currentFusionStageId = stageId;
        currentSequence = cfg.sequence || [];
        currentIndex = 0;

        // 重新点击某一阶段时，清空该阶段临时打包缓存，避免本阶段 zip 混入上一次同阶段测试。
        segmentState[stageId] = { files: [], vids: [] };
        segmentState[stageId] = { files: [], vids: [] };
        // Do not mark the card active until the timer or paradigm iframe really starts.
        // This prevents a stale "in progress" state when the transition overlay fails to open.

        transitionQueue = [cfg.firstTask];
        const transitionShown = showNextTransition();
        if (!transitionShown) {
            updateFusionStageUI(stageId, '');
            currentFusionStageId = "";
            currentSequence = [];
            currentIndex = 0;
            window.currentTransitionTask = null;
            saveProgress();
            postProgressStatus('idle', { activeTask: null, card_id: stageId });
            return;
        }
        saveProgress();
        postProgressStatus('idle', {
            activeTask: null,
            card_id: stageId,
            completedCards: getCompletedCardIds(),
            completedTasks: getCompletedCardIds()
        });
        setTimeout(() => {
            const overlay = document.getElementById('transition-overlay');
            if (overlay && overlay.style.display === 'none' && window.currentTransitionTask) {
                overlay.style.setProperty('display', 'flex', 'important');
            }
        }, 0);
    }

    function buildFusionSequence() {
        const t = makeFusionTaskSet();
        t.cog2Mot.segmentFinal = true;
        t.sartPost.segmentId = 'sart_post';
        t.sartPost.segmentFinal = true;
        t.soccerPost.segmentId = 'soccer_post';
        t.soccerPost.segmentFinal = true;
        return [t.exe1, t.cog1, t.exe2, t.cog2Mot, t.sartPost, t.soccerPost];
    }

    function startSequence() {
        clearFinishOverlays();
        completedCardSet.clear();
        currentBtnId = "btn-fusion";
        currentFusionStageId = "";
        currentSequence = buildFusionSequence();
        currentIndex = 0;
        segmentState = {
            exe1: { files: [], vids: [] },
            cog1: { files: [], vids: [] },
            exe2: { files: [], vids: [] },
            cog2: { files: [], vids: [] },
            sart_post: { files: [], vids: [] },
            soccer_post: { files: [], vids: [] }
        };
        ['exe1','cog1','exe2','cog2','sart_post','soccer_post'].forEach(id => updateFusionStageUI(id, ''));
        transitionQueue = [
            { inst: "进入【心体融合环节】。<br><br>流程为：<b>EXE1 运动阶段一 → COG1 认知任务一 → EXE2 运动阶段二 → COG2 认知任务二</b>。<br><br><span style='color:#555;font-size:2.4vh;'>每个阶段结束后会自动保存下载本阶段数据，最后也可以统一打包下载。</span>", requiresRopeInput: false },
            currentSequence[0]
        ];
        saveProgress();
        postProgressStatus('active');
        showNextTransition();
    }

    function processNextInSequence() {
        if(currentIndex >= currentSequence.length) {
            document.getElementById('experiment-container').style.display = 'none';

            if (currentFusionStageId) {
                const finishedStage = currentFusionStageId;
                finishFusionStage(finishedStage, { showOverlay: true });
                autoDownloadSegmentPackage(finishedStage);
                showAutoSavedToast(`${segmentLabels[finishedStage] || finishedStage} 已完成，已返回主界面`);
                return;
            }

            const btn = document.getElementById(currentBtnId);
            if (btn) {
                btn.classList.add('finished');
                btn.innerHTML = `<span class="fusion-emoji" style="font-size: 10vh; margin-bottom: 2vh;">✅</span><span class="fusion-text" style="color: #999;">融合挑战已完成</span>`;
            }
            saveProgress();
            return;
        }
        transitionQueue.push(currentSequence[currentIndex]); saveProgress(); showNextTransition(); 
    }

    function ensureRopeTimerElements() {
        const area = document.getElementById('rope-input-area');
        if (!area) return;

        if (!document.getElementById('rope-timer-display')) {
            const timerBox = document.createElement('div');
            timerBox.id = 'rope-timer-display';
            timerBox.style.cssText = 'display:none; text-align:center; margin-bottom:3vh; padding:2vh; background:#fff; border-radius:1.5vh; border:0.25vh solid #d32f2f; color:#d32f2f; font-size:5vh; font-weight:bold;';
            timerBox.innerText = '03:00';
            area.insertBefore(timerBox, area.firstChild);
        }

        if (!document.getElementById('rope-timer-note')) {
            const note = document.createElement('div');
            note.id = 'rope-timer-note';
            note.style.cssText = 'display:none; margin-bottom:2vh; color:#555; font-size:2.1vh; line-height:1.6; text-align:center;';
            note.innerHTML = '点击下方按钮开始 3 分钟快速跳绳计时。计时结束后，主试输入跳绳次数。';
            area.insertBefore(note, document.getElementById('rope-timer-display').nextSibling);
        }
    }

    function formatRopeTime(sec) {
        sec = Math.max(0, Math.floor(sec));
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        return `${m}:${s}`;
    }

    function resetRopeTimerUI(taskObj) {
        ensureRopeTimerElements();
        if (ropeTimerInterval) {
            clearInterval(ropeTimerInterval);
            ropeTimerInterval = null;
        }
        ropeTimerActive = false;
        ropeTimerDone = false;

        const timerEl = document.getElementById('rope-timer-display');
        const noteEl = document.getElementById('rope-timer-note');
        const timeInput = document.getElementById('rope-time');
        const countInput = document.getElementById('rope-count');
        const nextBtn = document.getElementById('transition-next-btn');

        const duration = parseInt(timeInput && timeInput.value ? timeInput.value : '180', 10) || 180;
        ropeRemainingSec = duration;

        if (timerEl) {
            timerEl.style.display = 'block';
            timerEl.innerText = formatRopeTime(ropeRemainingSec);
        }
        if (noteEl) {
            noteEl.style.display = 'block';
            noteEl.innerHTML = `第 ${taskObj.ropeRound || ''} 轮跳绳：请被试保持最快速度，点击按钮开始 ${duration} 秒计时。计时结束后输入跳绳次数。`;
        }
        if (countInput) {
            countInput.value = '';
            countInput.disabled = true;
            countInput.placeholder = '计时结束后输入';
        }
        if (timeInput) {
            timeInput.value = duration;
            timeInput.disabled = false;
        }
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.innerText = `开始 ${formatRopeTime(duration)} 跳绳计时`;
        }
    }

    function startRopeTimer() {
        if (ropeTimerActive) return;
        const timeInput = document.getElementById('rope-time');
        const countInput = document.getElementById('rope-count');
        const timerEl = document.getElementById('rope-timer-display');
        const noteEl = document.getElementById('rope-timer-note');
        const nextBtn = document.getElementById('transition-next-btn');

        const duration = parseInt(timeInput && timeInput.value ? timeInput.value : '180', 10) || 180;
        ropeRemainingSec = duration;
        ropeTimerActive = true;
        ropeTimerDone = false;

        if (timeInput) timeInput.disabled = true;
        if (countInput) countInput.disabled = true;
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.innerText = '跳绳计时中...';
        }
        if (noteEl) noteEl.innerHTML = '跳绳计时进行中，请提醒被试保持最快速度，并记录被试表现。';
        if (timerEl) timerEl.innerText = formatRopeTime(ropeRemainingSec);

        const taskObj = window.currentTransitionTask || {};
        currentRopeStartTimestampMs = Date.now();
        if (taskObj.ropeSegmentId) updateFusionStageUI(taskObj.ropeSegmentId, 'active');
        saveProgress();
        postProgressStatus('active', {
            card_id: taskObj.ropeSegmentId || currentFusionStageId || '',
            activeTask: getActiveTaskForProgress(),
            completedCards: getCompletedCardIds(),
            completedTasks: getCompletedCardIds()
        });
        startRecordingSegment('JumpRope', taskObj.ropeRound || 'unknown');

        ropeTimerInterval = setInterval(() => {
            ropeRemainingSec -= 1;
            if (timerEl) timerEl.innerText = formatRopeTime(ropeRemainingSec);
            if (ropeRemainingSec <= 0) finishRopeTimer();
        }, 1000);
    }

    function finishRopeTimer() {
        if (ropeTimerInterval) {
            clearInterval(ropeTimerInterval);
            ropeTimerInterval = null;
        }
        ropeTimerActive = false;
        ropeTimerDone = true;

        const countInput = document.getElementById('rope-count');
        const nextBtn = document.getElementById('transition-next-btn');
        const noteEl = document.getElementById('rope-timer-note');
        const timerEl = document.getElementById('rope-timer-display');

        if (timerEl) timerEl.innerText = '00:00';
        if (noteEl) noteEl.innerHTML = '<span style="color:#2e7d32;font-weight:bold;">计时结束。</span>请主试输入跳绳次数，然后开始下一项任务。';
        if (countInput) {
            countInput.disabled = false;
            countInput.placeholder = '输入次数';
            countInput.focus();
        }
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.innerText = '保存跳绳数据并开始任务';
        }
    }

    function showNextTransition() {
        try {
            if (transitionQueue.length <= 0) {
                const transitionOverlay = document.getElementById('transition-overlay');
                if (transitionOverlay) transitionOverlay.style.display = 'none';
                executeLaunch();
                return true;
            }

            const taskObj = transitionQueue.shift();
            const transitionOverlay = document.getElementById('transition-overlay');
            const instText = document.getElementById('inst-text');
            const ropeArea = document.getElementById('rope-input-area');
            const transitionNextBtn = document.getElementById('transition-next-btn');
            if (!transitionOverlay || !instText || !ropeArea || !transitionNextBtn) {
                throw new Error('transition elements missing');
            }

            window.currentTransitionTask = taskObj;
            instText.innerHTML = taskObj.inst || '';
            transitionOverlay.style.setProperty('display', 'flex', 'important');
            transitionOverlay.style.visibility = 'visible';
            transitionOverlay.style.opacity = '1';
            transitionOverlay.style.zIndex = '9000';

            if (taskObj.requiresRopeInput) {
                ropeArea.style.display = 'inline-block';
                resetRopeTimerUI(taskObj);
            } else {
                if (ropeTimerInterval) {
                    clearInterval(ropeTimerInterval);
                    ropeTimerInterval = null;
                }
                ropeTimerActive = false;
                ropeTimerDone = false;
                ropeArea.style.display = 'none';
                transitionNextBtn.disabled = false;
                transitionNextBtn.innerText = taskObj.startBtnText || '开始任务';
            }

            saveProgress();
            return true;
        } catch (err) {
            console.error('[MainController] showNextTransition failed:', err);
            alert('任务启动界面打开失败，请刷新页面后重试。错误：' + (err && err.message ? err.message : String(err)));
            return false;
        }
    }

    async function nextStep() { 
        const taskObj = window.currentTransitionTask;

        if (taskObj && taskObj.requiresRopeInput) {
            if (!ropeTimerDone) {
                startRopeTimer();
                return;
            }

            const rTime = document.getElementById('rope-time').value;
            const rCount = document.getElementById('rope-count').value;
            if (!rTime || !rCount) {
                alert("主试请注意：请输入完整的跳绳时间和次数后再继续！");
                return;
            }
            const ropeVideoBlob = await stopRecordingWithFallback();
            const ropeTs = Date.now();
            if (ropeVideoBlob && ropeVideoBlob.size > 0) {
                if (!taskState.JumpRope.vids) taskState.JumpRope.vids = [];
                taskState.JumpRope.vids.push(ropeVideoBlob);
                segmentAddVideo(taskObj.ropeSegmentId, `${globalUserID}_JumpRope_round${taskObj.ropeRound}.webm`, ropeVideoBlob);
                LocalVault.write(globalUserID, `${globalUserID}_JumpRope_round${taskObj.ropeRound}_${vaultTs()}.webm`, ropeVideoBlob);
            }

            if (taskState.JumpRope.data.length === 0) taskState.JumpRope.data.push(buildRopeCsvHeader());
            const ropeLine = buildRopeCsvLine(taskObj, rTime, rCount, ropeTs);
            taskState.JumpRope.data.push(ropeLine);
            segmentAddText(taskObj.ropeSegmentId, `${globalUserID}_JumpRope_round${taskObj.ropeRound}.csv`, "\uFEFF" + buildRopeCsvHeader() + "\n" + ropeLine);
            saveTextToServer('JumpRope', `${globalUserID}_JumpRope_round${taskObj.ropeRound}.csv`, "\uFEFF" + buildRopeCsvHeader() + "\n" + ropeLine);
            LocalVault.write(globalUserID, `${globalUserID}_JumpRope_round${taskObj.ropeRound}_${vaultTs()}.csv`, "\uFEFF" + buildRopeCsvHeader() + "\n" + ropeLine);
            updateFusionStageUI(taskObj.ropeSegmentId, 'finished');
            saveProgress();

            if (taskObj.ropeOnly) {
                document.getElementById('transition-overlay').style.display = 'none';
                window.currentTransitionTask = null;
                const finishedStage = taskObj.ropeSegmentId || currentFusionStageId;
                const isFullFusionSequence = !currentFusionStageId && currentBtnId === "btn-fusion" && currentSequence.length > 1;
                if (isFullFusionSequence) {
                    autoDownloadSegmentPackage(finishedStage);
                    currentIndex++;
                    saveProgress();
                    processNextInSequence();
                    return;
                }
                finishFusionStage(finishedStage, { showOverlay: true });
                autoDownloadSegmentPackage(finishedStage);
                showAutoSavedToast(`${segmentLabels[finishedStage] || finishedStage} 已完成，已返回主界面`);
                return;
            }

            if (taskObj.afterRopeInst) {
                taskObj.requiresRopeInput = false;
                taskObj.inst = taskObj.afterRopeInst;
                taskObj.afterRopeInst = "";
                taskObj.startBtnText = "开始正式实验";
                document.getElementById('rope-input-area').style.display = 'none';
                document.getElementById('inst-text').innerHTML = taskObj.inst;
                document.getElementById('transition-next-btn').disabled = false;
                document.getElementById('transition-next-btn').innerText = taskObj.startBtnText;
                updateFusionStageUI(taskObj.segmentId, 'active');
                window.currentTransitionTask = taskObj;
                saveProgress();
                return;
            }
        }

        if (transitionQueue.length > 0) {
            showNextTransition();
        } else {
            document.getElementById('transition-overlay').style.display = 'none';
            executeLaunch();
        }
    }

    function buildTaskUrl(task) {
        const url = new URL(task.url, window.location.href);
        url.searchParams.set('block', task.block);
        url.searchParams.set('sid', globalUserID || 'TEST');
        url.searchParams.set('session', globalAllocationData ? String(globalAllocationData.allocation_index) : 'local');
        url.searchParams.set('parent_mode', '1');
        url.searchParams.set('attempt_id', currentAttemptId || '');
        const cardId = task.segmentId || task.ropeSegmentId || currentFusionStageId || currentBtnId || '';
        const resumeTrial = task.resumeTrialIndex || resumeTrialByCard[cardId] || '';
        if (resumeTrial) url.searchParams.set('resume_trial_index', String(resumeTrial));
        return url.toString();
    }

    function executeLaunch() {
        const task = currentSequence[currentIndex];
        if (!task) {
            console.warn('[MainController] executeLaunch called but no task at currentIndex=', currentIndex);
            return;
        }

        blockCompletionInProgress = false;
        task.__global_task_start_timestamp_ms = Date.now();
        task.__global_task_start_iso = new Date(task.__global_task_start_timestamp_ms).toISOString();
        const cardId = task.segmentId || task.ropeSegmentId || currentFusionStageId || currentBtnId || '';
        if (resumeTrialByCard[cardId]) task.resumeTrialIndex = resumeTrialByCard[cardId];
        if (task.segmentId) updateFusionStageUI(task.segmentId, 'active');
        saveProgress();
        startRecordingSegment(task.name, task.block);

        requestParadigmFullscreen();
        document.getElementById('experiment-container').style.display = 'block';
        document.getElementById('exp-iframe').src = buildTaskUrl(task);
    }

    function finalizeCompletedBlock(payload, videoBlob) {
        const task = currentSequence[currentIndex];
        if (!task) {
            console.warn('[MainController] finalizeCompletedBlock: 当前没有 task。currentIndex=', currentIndex);
            blockCompletionInProgress = false;
            return;
        }

        try {
            let modifiedCsv = (payload.csv || '').replace(/^\uFEFF/, '');
            let cleanCsv = modifiedCsv.replace(/\r\n/g, '\n').trim();
            let lines = cleanCsv ? cleanCsv.split('\n') : [];
            let segmentCsvContent = '';
            const blockEndTimestampMs = Date.now();
            const blockStartTimestampMs = task.__global_task_start_timestamp_ms || currentRecordingStartedAt || '';

            if (lines.length > 0) {
                appendGlobalTimeColumnsToLines(lines, task, blockStartTimestampMs, blockEndTimestampMs, blockEndTimestampMs);

                if (globalAllocationData) {
                    const injectHeaders = `,assigned_order,order_description,block_id,block_pattern,block_position,allocation_index,allocation_time`;
                    const injectValues = `,${globalAllocationData.assigned_order},${globalAllocationData.order_description},${globalAllocationData.block_id},${globalAllocationData.block_pattern},${globalAllocationData.block_position},${globalAllocationData.allocation_index},${globalAllocationData.allocation_time}`;
                    lines[0] += injectHeaders;
                    for (let i = 1; i < lines.length; i++) {
                        if (lines[i].trim() !== "") lines[i] += injectValues;
                    }
                }

                segmentCsvContent = lines.join('\n');

                if (taskState[task.name] && taskState[task.name].data.length === 0) {
                    const expName = document.getElementById('experimenterName').value.trim() || '张书溢';
                    const devId = document.getElementById('deviceId').value.trim() || '02';
                    const cohId = document.getElementById('cohortId').value.trim() || '余杭0515';
                    const sName = document.getElementById('userName').value.trim();
                    const sPhone = document.getElementById('userPhone').value.trim();
                    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
                    const localISOTime = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 19) + '+08:00';
                    const pad = ",".repeat(Math.max(0, lines[0].split(',').length - 1));
                    let metadata =
                        `# subject_id: ${globalUserID}${pad}\n` +
                        `# subject_name: ${sName}${pad}\n` +
                        `# subject_phone: ${sPhone}${pad}\n` +
                        `# experimenter: ${expName}${pad}\n` +
                        `# device_id: ${devId}${pad}\n` +
                        `# cohort_id: ${cohId}${pad}\n` +
                        `# paradigm: ${task.name.toLowerCase()}${pad}\n` +
                        `# started_at: ${localISOTime}${pad}\n` +
                        `# battery_version: v2026.06.05-flow-fix${pad}\n`;
                    taskState[task.name].data.push(metadata + lines.join('\n'));
                } else if (taskState[task.name]) {
                    lines.shift();
                    if (lines.length > 0) taskState[task.name].data.push(lines.join('\n'));
                }
            } else {
                console.warn('[MainController] 当前 block 没有返回 CSV：', task.name, task.block);
            }

            if (task.segmentId && segmentCsvContent) {
                segmentAddText(task.segmentId, `${globalUserID}_${task.name}_block_${task.block}.csv`, "\uFEFF" + segmentCsvContent);
            }
            if (taskState[task.name] && taskState[task.name].files && segmentCsvContent) {
                const blockFileName = `${task.name}_block_${task.block}.csv`;
                taskState[task.name].files.push({ filename: blockFileName, content: "\uFEFF" + segmentCsvContent });
                saveTextToServer(task.name, `${globalUserID}_${blockFileName}`, "\uFEFF" + segmentCsvContent);
                LocalVault.write(globalUserID, `${globalUserID}_${task.name}_block_${task.block}_${vaultTs()}.csv`, "\uFEFF" + segmentCsvContent);
            }

            if (Array.isArray(payload.files) && taskState[task.name] && taskState[task.name].files) {
                payload.files.forEach((f, idx) => {
                    if (!f || !f.content) return;
                    const safeName = (f.filename || `${task.name}_${task.block}_extra_${idx + 1}.txt`).replace(/[\/:*?"<>|]/g, '_');
                    const finalName = `${task.name}_${task.block}_${safeName}`;
                    const finalContent = safeName.toLowerCase().endsWith('.csv')
                        ? appendGlobalTimeColumnsToCsvString(f.content, task, blockStartTimestampMs, blockEndTimestampMs, blockEndTimestampMs)
                        : (f.content || '');
                    taskState[task.name].files.push({ filename: finalName, content: finalContent });
                    segmentAddText(task.segmentId, `${globalUserID}_${finalName}`, finalContent || '');
                    LocalVault.write(globalUserID, `${globalUserID}_${finalName}`, finalContent || '');
                });
            }

            if (taskState[task.name] && taskState[task.name].vids && videoBlob && videoBlob.size > 0) {
                taskState[task.name].vids.push(videoBlob);
                segmentAddVideo(task.segmentId, `${globalUserID}_${task.name}_block_${task.block}.webm`, videoBlob);
                LocalVault.write(globalUserID, `${globalUserID}_${task.name}_block_${task.block}_${vaultTs()}.webm`, videoBlob);
            }

            if (task.segmentId && task.segmentFinal) {
                updateFusionStageUI(task.segmentId, 'finished');
                saveProgress();
                postProgressStatus('idle', {
                    card_id: task.segmentId,
                    activeTask: null,
                    completedCards: getCompletedCardIds(),
                    completedTasks: getCompletedCardIds()
                });
                if (currentFusionStageId === task.segmentId) {
                    autoDownloadSegmentPackage(task.segmentId);
                }
            }
        } catch (err) {
            console.error('[MainController] 保存 block 数据时出错，但流程继续：', err);
        }

        if (task) {
            const finishedCardId = task.segmentId || task.ropeSegmentId || currentFusionStageId || currentBtnId || '';
            if (finishedCardId && resumeTrialByCard[finishedCardId]) delete resumeTrialByCard[finishedCardId];
            delete task.__global_task_start_timestamp_ms;
            delete task.__global_task_start_iso;
            delete task.__current_trial_index;
            delete task.resumeTrialIndex;
        }

        currentIndex++;

        const iframe = document.getElementById('exp-iframe');
        if (iframe) iframe.src = 'about:blank';
        document.getElementById('experiment-container').style.display = 'none';

        blockCompletionInProgress = false;

        if (currentBtnId === "btn-fusion") {
            saveProgress();
            if (!currentFusionStageId) autoDownloadTaskPackage(task);
            if (!currentFusionStageId && task.segmentId && task.segmentFinal) autoDownloadSegmentPackage(task.segmentId);
            processNextInSequence();
        } else {
            const btn = document.getElementById(currentBtnId);
            if (btn) {
                if (btn.classList.contains('start-btn')) markTaskCardFinished(currentBtnId);
                else btn.classList.add('finished');
            }
            saveProgress();
            if (task.segmentId && task.segmentFinal) {
                autoDownloadSegmentPackage(task.segmentId, { force: task.segmentId === 'mot1' });
                showFusionStageFinishedOverlay(task.segmentId);
            } else {
                autoDownloadTaskPackage(task);
                showSingleTaskFinishedOverlay(task);
            }
            showAutoSavedToast(`${task.name} 已完成，已返回主界面`);
        }
    }

    window.addEventListener('message', e => {
        if (e.data && e.data.type === 'PARADIGM_CHECKPOINT') {
            const task = currentSequence[currentIndex] || {};
            const cardId = e.data.card_id || task.segmentId || task.ropeSegmentId || currentFusionStageId || currentBtnId || '';
            const trialIndex = Number(e.data.trial_index || e.data.resume_trial_index || 1) || 1;
            if (task) task.__current_trial_index = trialIndex;
            if (cardId) resumeTrialByCard[cardId] = trialIndex;
            postProgressStatus('active', {
                card_id: cardId,
                trial_index: trialIndex,
                resume_trial_index: trialIndex,
                activeTask: Object.assign({}, getActiveTaskForProgress() || {}, {
                    cardId,
                    card_id: cardId,
                    taskName: e.data.paradigm || task.name || '',
                    block: e.data.block || task.block || '',
                    trial_index: trialIndex,
                    resume_trial_index: trialIndex
                })
            });
            return;
        }

        if (e.data && e.data.type === 'PARADIGM_ERROR') {
            logServerEvent('paradigm_error', { paradigm: e.data.paradigm || '', message: e.data.message || '' });
            alert(`范式 ${e.data.paradigm || ''} 运行出错：${e.data.message || '未知错误'}`);
            return;
        }

        if (e.data && e.data.type === 'BLOCK_COMPLETED') {
            console.log('[MainController] BLOCK_COMPLETED received:', e.data);

            if (blockCompletionInProgress) {
                console.warn('[MainController] 重复收到 BLOCK_COMPLETED，已忽略。');
                return;
            }
            blockCompletionInProgress = true;

            const payload = e.data;
            stopRecordingWithFallback().then(videoBlob => finalizeCompletedBlock(payload, videoBlob));
        }
    });

    window.addEventListener("beforeunload", function (e) {
        const active = getActiveTaskForProgress();
        if (globalUserID && active && navigator.sendBeacon) {
            const lockPayload = {
                subject_id: globalUserID,
                owner_id: browserOwnerId,
                attempt_id: currentAttemptId || (globalUserID + '-attempt-1'),
                status: 'locked',
                locked: true,
                lockReason: 'refresh_or_power_loss',
                activeTask: active,
                completedCards: getCompletedCardIds(),
                lastHeartbeatAt: Date.now()
            };
            navigator.sendBeacon('/api/progress', new Blob([JSON.stringify(lockPayload)], { type: 'application/json' }));
        }
        if(globalUserID && !dataDownloaded) { var msg = "数据尚未完成服务器确认，离开会锁定当前任务。"; (e || window.event).returnValue = msg; return msg; }
    });

    async function finalExport() {
        if (typeof JSZip === 'undefined') {
            alert('打包组件没有加载成功，请刷新页面后重试。');
            return;
        }
        if (!globalUserID) {
            alert('还没有被试编号，暂时不能打包下载。');
            return;
        }
        if (!hasAnyBufferedData()) {
            alert('当前浏览器里还没有可打包的数据。请先完成至少一个任务，或检查任务是否已正常结束。');
            return;
        }
        dataDownloaded = true;
        const zip = new JSZip();
        const root = zip.folder(globalUserID);
        for (let t in taskState) {
            const st = taskState[t] || {};
            if (st.data && st.data.length) root.file(`${globalUserID}_${t}.csv`, "\uFEFF" + st.data.join('\n'));
            if (st.vids && st.vids.length) st.vids.forEach((v, i) => root.file(`${globalUserID}_${t}_B${i + 1}.webm`, v));
            if (st.files && st.files.length) st.files.forEach((f, i) => root.file(`${globalUserID}_${f.filename || (t + '_extra_' + (i + 1) + '.txt')}`, f.content || ''));
        }
        if (globalClickLog.length > 1) root.file(`${globalUserID}_Global_Clicks_Log.csv`, "\uFEFF" + globalClickLog.join('\n'));
        try {
            const blob = await zip.generateAsync({ type: "blob" });
            triggerBlobDownload(blob, `${globalUserID}_Data_Backup.zip`);
        } catch (err) {
            console.error('[MainController] final export failed:', err);
            alert('打包下载失败，请刷新页面后重试，或检查浏览器是否禁止下载多个文件。');
            dataDownloaded = false;
        }
    }
    window.finalExport = finalExport;
