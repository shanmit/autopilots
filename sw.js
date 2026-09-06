'use strict';

// Bump this version whenever any app-shell file changes, and deploy them together.
const CACHE = 'autopilots-v1';
const APP_SHELL = ['.', 'index.html', 'styles.css', 'app.js', 'manifest.json']
  .map(file => new URL(file, self.location.href).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Bypass HTTP caches on each version; activation requires the complete shell.
    await cache.addAll(APP_SHELL.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // GitHub Pages projects share an origin: leave unrelated apps' caches alone.
    await Promise.all(keys.filter(key => key.startsWith('autopilots-') && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !APP_SHELL.includes(event.request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(event.request) || fetch(event.request);
  })());
});
