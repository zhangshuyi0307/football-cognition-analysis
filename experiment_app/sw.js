// 所有范式素材被动缓存版
// 目标：不显示缓存界面，不阻塞任务；第一次正常加载过的范式图片/视频/音频会进入 Cache Storage。
// 更新素材或程序时，改 CACHE_NAME，并同步改 index.html 中 /sw.js?v= 后面的版本号。

const CACHE_NAME = 'football-cognition-paradigm-assets-v20260606-all-assets-passive';
const RUNTIME_CACHE = 'football-cognition-runtime-v20260606-all-assets-passive';

// 缓存范围：所有 paradigms 下的图片、视频、音频。
// 不缓存 html/js/css/json，避免程序更新被旧代码卡住。
const PARADIGM_ASSET_PATTERN = /\/paradigms\/.*\.(mp4|webm|png|jpg|jpeg|webp|gif|svg|mp3|wav)$/i;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key =>
          (key.startsWith('football-cognition-paradigm-assets-') ||
           key.startsWith('football-cognition-soccer-assets-') ||
           key.startsWith('football-cognition-runtime-')) &&
          key !== CACHE_NAME &&
          key !== RUNTIME_CACHE
        )
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

function isParadigmAsset(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin && PARADIGM_ASSET_PATTERN.test(url.pathname);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!isParadigmAsset(req)) return;

  event.respondWith(handleParadigmAsset(req));
});

async function handleParadigmAsset(req) {
  const cache = await caches.open(CACHE_NAME);

  // 视频常有 Range 请求。若缓存里已有完整视频，则从完整视频切片返回 206。
  // 若没有完整视频，则直接走网络请求，浏览器 HTTP 缓存会根据 sever.js 的 Cache-Control 保留片段。
  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const fullCached = await cache.match(req.url);
    if (fullCached) {
      return buildRangeResponse(fullCached, rangeHeader);
    }
    return fetch(req);
  }

  const cached = await cache.match(req, { ignoreVary: true });
  if (cached) return cached;

  const fresh = await fetch(req);

  // 只缓存完整 200 响应；206 分片交给浏览器 HTTP 缓存处理。
  if (fresh && fresh.ok && fresh.status === 200) {
    cache.put(req, fresh.clone()).catch(err => {
      console.warn('[SW] cache put failed:', req.url, err);
    });
  }

  return fresh;
}

async function buildRangeResponse(fullResponse, rangeHeader) {
  const blob = await fullResponse.blob();
  const size = blob.size;
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader || '');

  if (!match) return fullResponse;

  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : size - 1;

  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= size) end = size - 1;

  if (start > end || start < 0 || start >= size) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: {
        'Content-Range': `bytes */${size}`
      }
    });
  }

  const sliced = blob.slice(start, end + 1);
  const headers = new Headers(fullResponse.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(sliced.size));

  return new Response(sliced, {
    status: 206,
    statusText: 'Partial Content',
    headers
  });
}
