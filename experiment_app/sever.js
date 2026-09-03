const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = __dirname;
const ALLOC_FILE = path.resolve(process.env.ALLOC_FILE || path.join(ROOT_DIR, 'allocations.json'));
const SAVE_DIR = path.resolve(process.env.SAVE_DIR || path.join(ROOT_DIR, 'data_server_backup'));
const PROGRESS_DIR = path.join(SAVE_DIR, '_progress');
const EVENT_DIR = path.join(SAVE_DIR, '_events');
const CERT_DIR = path.join(ROOT_DIR, 'certs');
const HTTPS_KEY = path.join(CERT_DIR, 'dev-key.pem');
const HTTPS_CERT = path.join(CERT_DIR, 'dev-cert.pem');
const NODE_ENV = String(process.env.NODE_ENV || 'development');
const HOST = String(process.env.HOST || (NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0'));
const HTTP_PORT = Number(process.env.PORT || 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);
const VALID_PATTERNS = ['AABB', 'ABAB', 'ABBA', 'BAAB', 'BABA', 'BBAA'];
const ADMIN_UNLOCK_CODE = String(process.env.ADMIN_UNLOCK_CODE || '');
const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 20 * 1024 * 1024);
const MAX_BINARY_BYTES = Number(process.env.MAX_BINARY_BYTES || 100 * 1024 * 1024);

function orderDescription(order) {
    return order === 'A'
        ? 'A卷: 静息态六模块手动完成; post Soccer→SART'
        : 'B卷: 静息态六模块手动完成; post SART→Soccer';
}

function getLocalIPv4List() {
    const nets = os.networkInterfaces();
    const ips = [];
    Object.values(nets).forEach(list => {
        (list || []).forEach(info => {
            if (info.family === 'IPv4' && !info.internal) ips.push(info.address);
        });
    });
    return ips;
}

function createAllocationTable() {
    let table = [];
    let indexCount = 1;
    for (let b = 1; b <= 50; b++) {
        const pattern = VALID_PATTERNS[Math.floor(Math.random() * VALID_PATTERNS.length)];
        for (let p = 0; p < 4; p++) {
            const assigned = pattern[p];
            table.push({
                allocation_index: indexCount++,
                block_id: 'block_' + String(b).padStart(2, '0'),
                block_pattern: pattern,
                block_position: p + 1,
                assigned_order: assigned,
                order_description: orderDescription(assigned),
                used: false
            });
        }
    }
    safeJsonWrite(ALLOC_FILE, table);
    return table;
}

function normalizeAllocationTable(table) {
    let changed = false;
    table.forEach(slot => {
        const expected = orderDescription(slot.assigned_order);
        if (slot.order_description !== expected) {
            slot.order_description = expected;
            changed = true;
        }
    });
    return changed;
}

function getAllocationTable() {
    if (!fs.existsSync(ALLOC_FILE)) return createAllocationTable();
    let table;
    try {
        table = JSON.parse(fs.readFileSync(ALLOC_FILE, 'utf8'));
    } catch (error) {
        throw new Error(`allocation file is invalid; refusing to overwrite it: ${error.message}`);
    }
    if (!Array.isArray(table) || table.length === 0) {
        throw new Error('allocation file must contain a non-empty array; refusing to overwrite it');
    }
    if (normalizeAllocationTable(table)) safeJsonWrite(ALLOC_FILE, table);
    return table;
}

function sendJson(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json;charset=utf-8' });
    res.end(JSON.stringify(obj));
}

function bodyErrorResponse(res, err, fallbackMessage) {
    const status = err && err.statusCode ? err.statusCode : 400;
    return sendJson(res, status, { error: status === 413 ? 'request_body_too_large' : fallbackMessage });
}

function safeJsonWrite(filePath, obj) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now();
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
}

function readJsonBody(req, callback) {
    const chunks = [];
    let received = 0;
    let tooLarge = false;
    let finished = false;
    function finish(error, value) {
        if (finished) return;
        finished = true;
        callback(error, value);
    }
    req.on('data', chunk => {
        received += chunk.length;
        if (received > MAX_JSON_BYTES) {
            tooLarge = true;
            chunks.length = 0;
            return;
        }
        if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
        if (tooLarge) {
            const error = new Error('request body too large');
            error.statusCode = 413;
            return finish(error);
        }
        try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
        catch (e) { finish(e); }
    });
    req.on('error', finish);
}

function safeName(value, fallback) {
    const cleaned = String(value || '')
        .trim()
        .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '_')
        .replace(/\.\.+/g, '.')
        .slice(0, 128);
    return cleaned && cleaned !== '.' ? cleaned : String(fallback || 'unknown').slice(0, 128);
}

function getProgressFile(subjectId) {
    return path.join(PROGRESS_DIR, safeName(subjectId, 'unknown_subject') + '.json');
}

function getEventFile(subjectId) {
    return path.join(EVENT_DIR, safeName(subjectId, 'unknown_subject') + '.jsonl');
}

function appendEvent(subjectId, event) {
    const row = Object.assign({
        subject_id: subjectId,
        timestamp_ms: Date.now(),
        timestamp_iso: new Date().toISOString()
    }, event || {});
    fs.mkdirSync(EVENT_DIR, { recursive: true });
    fs.appendFileSync(getEventFile(subjectId), JSON.stringify(row) + '\n', 'utf8');
    return row;
}

function readProgress(subjectId) {
    const file = getProgressFile(subjectId);
    if (!fs.existsSync(file)) return null;
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { return null; }
}

function handleGetProgress(req, res, reqUrl) {
    const subject = safeName(reqUrl.searchParams.get('subject_id'), '');
    if (!subject) return sendJson(res, 400, { error: 'missing subject_id' });
    sendJson(res, 200, { ok: true, progress: readProgress(subject) });
}

function handleProgress(req, res) {
    readJsonBody(req, (err, data) => {
        if (err) return bodyErrorResponse(res, err, 'invalid JSON');
        const subject = safeName(data.subject_id, '');
        if (!subject) return sendJson(res, 400, { error: 'missing subject_id' });

        const previous = readProgress(subject);
        const incomingOwner = String(data.owner_id || '');
        const previousOwner = previous && previous.owner_id ? String(previous.owner_id) : '';
        const previousActive = previous && previous.status === 'active' && previous.activeTask;
        const sameAttempt = previous && data.attempt_id && previous.attempt_id === data.attempt_id;
        const sameOwner = previousOwner && incomingOwner && previousOwner === incomingOwner;
        const staleMs = previous && previous.lastHeartbeatAt ? Date.now() - Number(previous.lastHeartbeatAt) : Infinity;

        if (previousActive && data.status === 'active' && !sameOwner && !sameAttempt && staleMs < 15000) {
            return sendJson(res, 409, { error: 'active_attempt_exists', progress: previous });
        }

        const next = Object.assign({}, previous || {}, data, {
            subject_id: subject,
            lastHeartbeatAt: Date.now(),
            updated_at: new Date().toISOString()
        });
        try {
            safeJsonWrite(getProgressFile(subject), next);
        } catch (error) {
            console.error('[progress write]', error.message);
            return sendJson(res, 500, { error: 'progress_save_failed' });
        }
        sendJson(res, 200, { ok: true, progress: next });
    });
}

function handleEvent(req, res) {
    readJsonBody(req, (err, data) => {
        if (err) return bodyErrorResponse(res, err, 'invalid JSON');
        const subject = safeName(data.subject_id, '');
        if (!subject) return sendJson(res, 400, { error: 'missing subject_id' });
        let event;
        try {
            event = appendEvent(subject, data.event || data);
        } catch (error) {
            console.error('[event write]', error.message);
            return sendJson(res, 500, { error: 'event_save_failed' });
        }
        sendJson(res, 200, { ok: true, event });
    });
}

function handleUnlock(req, res) {
    readJsonBody(req, (err, data) => {
        if (err) return bodyErrorResponse(res, err, 'invalid JSON');
        if (!ADMIN_UNLOCK_CODE) return sendJson(res, 503, { error: 'admin_unlock_not_configured' });
        const subject = safeName(data.subject_id, '');
        if (!subject) return sendJson(res, 400, { error: 'missing subject_id' });
        if (String(data.code || '') !== ADMIN_UNLOCK_CODE) return sendJson(res, 403, { error: 'unlock_code_incorrect' });

        const previous = readProgress(subject) || { subject_id: subject };
        const nextAttempt = Number(previous.attempt || previous.attempt_id || 0) + 1;
        const reason = data.reason || previous.lockReason || 'supervisor_unlock_restart_current_card';
        const recoverTask = previous.activeTask || previous.recoverTask || null;
        const next = Object.assign({}, previous, {
            status: 'unlocked',
            locked: false,
            attempt: nextAttempt,
            attempt_id: subject + '-attempt-' + nextAttempt,
            abnormal_restart: 1,
            abnormal_reason: reason,
            recoverTask,
            activeTask: null,
            unlocked_at: new Date().toISOString(),
            lastHeartbeatAt: Date.now()
        });
        try {
            safeJsonWrite(getProgressFile(subject), next);
            appendEvent(subject, { type: 'supervisor_unlock', reason, attempt: nextAttempt });
        } catch (error) {
            console.error('[unlock write]', error.message);
            return sendJson(res, 500, { error: 'unlock_save_failed' });
        }
        sendJson(res, 200, { ok: true, progress: next });
    });
}

function handleAbandon(req, res) {
    readJsonBody(req, (err, data) => {
        if (err) return bodyErrorResponse(res, err, 'invalid JSON');
        if (!ADMIN_UNLOCK_CODE) return sendJson(res, 503, { error: 'admin_unlock_not_configured' });
        const subject = safeName(data.subject_id, '');
        if (!subject) return sendJson(res, 400, { error: 'missing subject_id' });
        if (String(data.code || '') !== ADMIN_UNLOCK_CODE) return sendJson(res, 403, { error: 'unlock_code_incorrect' });

        const previous = readProgress(subject) || { subject_id: subject };
        const oldAttempt = previous.attempt_id || '';
        const nextAttempt = Number(previous.attempt || 0) + 1;
        const next = Object.assign({}, previous, {
            status: 'abandoned',
            locked: false,
            activeTask: null,
            recoverTask: null,
            old_attempt_id: oldAttempt,
            attempt: nextAttempt,
            attempt_id: subject + '-attempt-' + nextAttempt,
            abandoned_at: new Date().toISOString(),
            abandon_reason: data.reason || 'supervisor_abandon_old_data',
            lastHeartbeatAt: Date.now()
        });
        try {
            safeJsonWrite(getProgressFile(subject), next);
            appendEvent(subject, { type: 'supervisor_abandon', old_attempt_id: oldAttempt, new_attempt_id: next.attempt_id, reason: next.abandon_reason });
        } catch (error) {
            console.error('[abandon write]', error.message);
            return sendJson(res, 500, { error: 'abandon_save_failed' });
        }
        sendJson(res, 200, { ok: true, progress: next });
    });
}

function handleSaveBinary(req, res, reqUrl) {
    const paradigm = safeName(reqUrl.searchParams.get('paradigm'), 'unknown');
    const subject = safeName(reqUrl.searchParams.get('subject_id'), 'unknown_subject');
    const attempt = safeName(reqUrl.searchParams.get('attempt_id'), '');
    const filename = safeName(path.basename(reqUrl.searchParams.get('filename') || 'video.webm'), 'video.webm');
    const dir = attempt ? path.join(SAVE_DIR, paradigm, subject, attempt) : path.join(SAVE_DIR, paradigm, subject);
    try {
        fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
        console.error('[binary mkdir]', error.message);
        req.resume();
        return sendJson(res, 500, { error: 'binary_save_directory_failed' });
    }
    const target = path.join(dir, filename);
    const tmp = target + '.tmp-' + process.pid + '-' + Date.now();
    let written = 0;
    let settled = false;

    const declaredLength = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BINARY_BYTES) {
        settled = true;
        req.resume();
        return sendJson(res, 413, { error: 'binary_upload_too_large', max_bytes: MAX_BINARY_BYTES });
    }
    const out = fs.createWriteStream(tmp);

    function cleanupTmp() {
        try { fs.unlinkSync(tmp); } catch (e) {}
    }

    function failUpload(status, error) {
        if (settled) return;
        settled = true;
        req.unpipe(out);
        out.destroy();
        cleanupTmp();
        if (!res.headersSent) sendJson(res, status, { error });
    }

    req.on('data', chunk => {
        written += chunk.length;
        if (written > MAX_BINARY_BYTES) {
            failUpload(413, 'binary_upload_too_large');
            req.resume();
        }
    });
    req.pipe(out);
    out.on('finish', () => {
        if (settled) return;
        try {
            fs.renameSync(tmp, target);
        } catch (error) {
            console.error('[binary rename]', error.message);
            return failUpload(500, 'binary_save_failed');
        }
        settled = true;
        sendJson(res, 200, { ok: true, bytes: written, saved_to: attempt ? path.join('data_server_backup', paradigm, subject, attempt, filename) : path.join('data_server_backup', paradigm, subject, filename) });
    });
    out.on('error', err => {
        failUpload(500, err.message || 'binary save failed');
    });
    req.on('error', () => {
        failUpload(400, 'binary_upload_failed');
    });
    req.on('aborted', () => {
        failUpload(400, 'binary_upload_aborted');
    });
}

// 某些压缩包/服务器环境会把中文文件名保存成 #Uxxxx 形式。
// 浏览器仍然会按中文路径请求，所以这里加一个只读兜底：原路径不存在时，尝试把非 ASCII 字符转换为 #Uxxxx。
function toHashUnicodePath(requestPath) {
    return String(requestPath).replace(/[^\x00-\x7F]/g, ch => '#U' + ch.charCodeAt(0).toString(16));
}

function handleAllocate(req, res) {
    readJsonBody(req, (err, data) => {
        if (err) return bodyErrorResponse(res, err, '请求 JSON 格式错误');
        let table;
        try {
            table = getAllocationTable();
        } catch (error) {
            console.error('[allocate]', error.message);
            return sendJson(res, 500, { error: '分配表读取失败，请联系管理员，原文件未被覆盖。' });
        }
        let slot = table.find(t => !t.used);
        if (!slot) return sendJson(res, 409, { error: `${table.length}个分配名额已满！` });
        slot.used = true;
        slot.subject_id = String(data.subject_id || '').trim().slice(0, 128);
        slot.name = String(data.name || '').trim().slice(0, 100);
        slot.phone = String(data.phone || '').trim().slice(0, 40);
        slot.allocation_time = new Date().toLocaleString('zh-CN');
        slot.order_description = orderDescription(slot.assigned_order);
        try {
            safeJsonWrite(ALLOC_FILE, table);
        } catch (error) {
            console.error('[allocate write]', error.message);
            return sendJson(res, 500, { error: '分配表写入失败，请联系管理员。' });
        }
        sendJson(res, 200, slot);
    });
}

function handleSave(req, res) {
    readJsonBody(req, (err, data) => {
        if (err) return bodyErrorResponse(res, err, '请求 JSON 格式错误');
        const paradigm = safeName(data.paradigm, 'unknown');
        const subject = safeName(data.subject_id, 'unknown_subject');
        const attempt = safeName(data.attempt_id, '');
        const filename = safeName(path.basename(data.filename || 'data.txt'), 'data.txt');
        const content = data.content == null ? '' : String(data.content);
        const dir = attempt ? path.join(SAVE_DIR, paradigm, subject, attempt) : path.join(SAVE_DIR, paradigm, subject);
        try {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, filename), content, 'utf8');
        } catch (error) {
            console.error('[text save]', error.message);
            return sendJson(res, 500, { error: 'data_save_failed' });
        }
        sendJson(res, 200, { ok: true, saved_to: attempt ? path.join('data_server_backup', paradigm, subject, attempt, filename) : path.join('data_server_backup', paradigm, subject, filename) });
    });
}

const mimeTypes = {
    '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8', '.css': 'text/css;charset=utf-8',
    '.json': 'application/json;charset=utf-8', '.txt': 'text/plain;charset=utf-8', '.csv': 'text/csv;charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

function getCacheControl(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath).toLowerCase();

    // Service Worker、HTML 和代码文件不要长期缓存，方便更新程序。
    if (base === 'sw.js' || ['.html', '.js', '.css', '.json'].includes(ext)) {
        return 'no-cache';
    }

    // 所有刺激材料长期缓存。更新素材时改文件名，或改 sw.js 的 CACHE_NAME 和 index.html 注册版本号。
    if (['.mp4', '.webm', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.wav', '.mp3'].includes(ext)) {
        return 'public, max-age=31536000, immutable';
    }

    return 'no-cache';
}

function applySecurityHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), payment=(), usb=()');
}

function resolvePublicPath(requestPath) {
    const resolved = path.resolve(ROOT_DIR, '.' + requestPath);
    const relative = path.relative(ROOT_DIR, resolved);
    if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) return null;
    return resolved;
}

function parseByteRange(rangeHeader, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || '').trim());
    if (!match || (!match[1] && !match[2])) return null;

    let start;
    let end;
    if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
        start = Math.max(size - suffixLength, 0);
        end = size - 1;
    } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
    }

    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || start > end) {
        return null;
    }
    return { start, end: Math.min(end, size - 1) };
}

function streamFile(req, res, filePath) {
    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch (error) {
        return sendJson(res, 500, { error: 'file_stat_failed' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const headers = {
        'Content-Type': contentType,
        'Cache-Control': getCacheControl(filePath),
        'Accept-Ranges': 'bytes'
    };

    let status = 200;
    let start = 0;
    let end = Math.max(stat.size - 1, 0);
    if (req.headers.range) {
        const range = parseByteRange(req.headers.range, stat.size);
        if (!range) {
            res.writeHead(416, Object.assign(headers, { 'Content-Range': `bytes */${stat.size}` }));
            return res.end();
        }
        status = 206;
        start = range.start;
        end = range.end;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = String(stat.size === 0 ? 0 : end - start + 1);

    res.writeHead(status, headers);
    if (req.method === 'HEAD' || stat.size === 0) return res.end();

    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', error => {
        console.error('[static]', error.message);
        if (!res.headersSent) sendJson(res, 500, { error: 'file_read_failed' });
        else res.destroy(error);
    });
    stream.pipe(res);
}

function route(req, res) {
    applySecurityHeaders(res);

    let reqUrl;
    try {
        reqUrl = new URL(req.url, 'http://localhost');
    } catch (error) {
        return sendJson(res, 400, { error: 'invalid_request_url' });
    }

    if (req.method === 'GET' && reqUrl.pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, uptime_seconds: Math.floor(process.uptime()) });
    }
    if (req.method === 'POST' && reqUrl.pathname === '/api/allocate') return handleAllocate(req, res);
    if (req.method === 'POST' && reqUrl.pathname === '/api/save') return handleSave(req, res);
    if (req.method === 'GET' && reqUrl.pathname === '/api/progress') return handleGetProgress(req, res, reqUrl);
    if (req.method === 'POST' && reqUrl.pathname === '/api/progress') return handleProgress(req, res);
    if (req.method === 'POST' && reqUrl.pathname === '/api/event') return handleEvent(req, res);
    if (req.method === 'POST' && reqUrl.pathname === '/api/unlock') return handleUnlock(req, res);
    if (req.method === 'POST' && reqUrl.pathname === '/api/abandon') return handleAbandon(req, res);
    if (req.method === 'POST' && reqUrl.pathname === '/api/save-binary') return handleSaveBinary(req, res, reqUrl);
    if (reqUrl.pathname.startsWith('/api/')) {
        res.setHeader('Allow', 'GET, POST');
        return sendJson(res, 405, { error: 'method_or_endpoint_not_allowed' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return sendJson(res, 405, { error: 'method_not_allowed' });
    }

    let decodedPath;
    try { decodedPath = decodeURIComponent(reqUrl.pathname); }
    catch (e) { res.writeHead(400); return res.end('Bad Request'); }

    const requestPath = decodedPath === '/' ? '/index.html' : decodedPath;
    let filePath = resolvePublicPath(requestPath);
    if (!filePath) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    // 中文路径不存在时，尝试 #Uxxxx 文件名兜底，兼容当前足球素材包。
    if (!(fs.existsSync(filePath) && fs.statSync(filePath).isFile())) {
        const altRequestPath = toHashUnicodePath(requestPath);
        const altFilePath = resolvePublicPath(altRequestPath);
        if (altFilePath && fs.existsSync(altFilePath) && fs.statSync(altFilePath).isFile()) {
            filePath = altFilePath;
        }
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return streamFile(req, res, filePath);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' });
        res.end('Not Found: ' + requestPath);
    }
}

function printAccessInfo() {
    const ips = getLocalIPv4List();
    console.log('多设备区组随机发号服务器已启动！');
    console.log(`本机测试请访问: http://localhost:${HTTP_PORT}`);
    console.log(`监听地址: ${HOST}:${HTTP_PORT}`);
    console.log('当前顺序说明: 静息态六模块单独完成；A卷 post Soccer→SART；B卷 post SART→Soccer');
    if (HOST !== '127.0.0.1' && HOST !== '::1' && ips.length) {
        ips.forEach(ip => console.log(`局域网 HTTP 访问: http://${ip}:${HTTP_PORT}`));
    }
    if (!ADMIN_UNLOCK_CODE) {
        console.warn('警告: 未配置 ADMIN_UNLOCK_CODE，管理员解锁和放弃接口已禁用。');
    }
}

function startServers() {
    const servers = [];
    const httpServer = http.createServer(route);
    httpServer.on('clientError', (error, socket) => {
        console.warn('[http client error]', error.message);
        if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    });
    httpServer.listen(HTTP_PORT, HOST, printAccessInfo);
    servers.push(httpServer);

    if (fs.existsSync(HTTPS_KEY) && fs.existsSync(HTTPS_CERT)) {
        const httpsServer = https.createServer({ key: fs.readFileSync(HTTPS_KEY), cert: fs.readFileSync(HTTPS_CERT) }, route);
        httpsServer.listen(HTTPS_PORT, HOST, () => {
            console.log(`HTTPS 已启用。摄像头/麦克风局域网测试优先访问: https://localhost:${HTTPS_PORT}`);
            if (HOST !== '127.0.0.1' && HOST !== '::1') {
                getLocalIPv4List().forEach(ip => console.log(`局域网 HTTPS 访问: https://${ip}:${HTTPS_PORT}`));
            }
            console.log('首次打开自签名证书地址时，浏览器会提示“不安全”，选择继续访问后再授权摄像头/麦克风。');
        });
        servers.push(httpsServer);
    } else {
        console.log('未发现 certs/dev-key.pem 和 certs/dev-cert.pem：HTTPS 未启用。局域网摄像头/麦克风可能被浏览器拦截。');
    }
    return servers;
}

if (require.main === module) startServers();

module.exports = {
    parseByteRange,
    resolvePublicPath,
    route,
    safeName,
    startServers
};
