/* ============================================
   服装设计素材库 · Service Worker
   ============================================ */

const CACHE_NAME = 'fashion-material-v8';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/main.css',
  './css/variables.css',
  './js/db.js',
  './js/app.js',
  './js/canvas.js',
  './lib/fabric.min.js',
  './manifest.json',
  './assets/icons/icon.svg',
];

// 安装：缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter(name => name !== CACHE_NAME)
             .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：HTML 网络优先，其他缓存优先
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // index.html 走网络优先策略
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  
  // 其他静态资源走缓存优先
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      
      return fetch(event.request).then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});