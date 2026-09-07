'use strict';

const PREFIX = 'autopilots-';
const META = PREFIX + 'state';
const STATE_URL = new URL('__shell_state__', self.location.href).href;
// This order is also the byte-concatenation order for SHA-256.
const APP_SHELL = ['.', 'index.html', 'styles.css', 'app.js', 'manifest.json']
  .map(file => new URL(file, self.location.href).href);
let statePromise;
let writes = Promise.resolve();
let refreshing;

function persist(state) {
  const body = JSON.stringify(state);
  const write = writes.catch(() => {}).then(async () => {
    const cache = await caches.open(META);
    await cache.put(STATE_URL, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  });
  writes = write;
  return write;
}
function state() {
  return statePromise ||= (async () => {
    const stored = await (await caches.open(META)).match(STATE_URL);
    if (stored) return stored.json();
    // Migrate the deployed manual-version cache without changing open clients' assets.
    const keys = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== META);
    const value = { latest: keys.at(-1) || null, pins: {} };
    if (value.latest) {
      for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
        value.pins[client.id] = { cache: value.latest, seen: Date.now() };
      }
    }
    await persist(value);
    return value;
  })();
}
async function notify(value) {
  for (const client of await self.clients.matchAll()) {
    if (value.pins[client.id]?.cache && value.pins[client.id].cache !== value.latest) {
      client.postMessage({ type: 'UPDATE_READY' });
    }
  }
}
async function clean(value) {
  const live = new Set((await self.clients.matchAll({ includeUncontrolled: true })).map(client => client.id));
  for (const [id, pin] of Object.entries(value.pins)) {
    // A navigation's resulting client may not yet appear in matchAll.
    if (!live.has(id) && Date.now() - pin.seen > 60000) delete value.pins[id];
  }
  const retained = new Set([META, value.latest, ...Object.values(value.pins).map(pin => pin.cache)]);
  await persist(value);
  await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && !retained.has(key))
    .map(key => caches.delete(key)));
}
function revalidate() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const value = await state();
    const responses = await Promise.all(APP_SHELL.map(async url => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok) throw new Error('Incomplete app shell');
      return response;
    }));
    const bodies = await Promise.all(responses.map(response => response.clone().arrayBuffer()));
    const bytes = new Uint8Array(bodies.reduce((size, body) => size + body.byteLength, 0));
    let offset = 0;
    for (const body of bodies) { bytes.set(new Uint8Array(body), offset); offset += body.byteLength; }
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const name = PREFIX + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const cache = await caches.open(name);
    // Publish the pointer only after every response has been stored successfully.
    if (name !== value.latest || !(await Promise.all(APP_SHELL.map(url => cache.match(url)))).every(Boolean)) {
      await Promise.all(APP_SHELL.map((url, index) => cache.put(url, responses[index])));
      value.latest = name;
      await persist(value);
    }
    await notify(value);
    await clean(value);
  })().finally(() => { refreshing = null; });
  return refreshing;
}

self.addEventListener('install', event => {
  event.waitUntil(revalidate().then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => { await self.clients.claim(); await notify(await state()); })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !APP_SHELL.includes(event.request.url)) return;
  const selected = (async () => {
    const value = await state();
    const navigation = event.request.mode === 'navigate';
    const id = navigation ? event.resultingClientId : event.clientId;
    const name = navigation ? value.latest : value.pins[id]?.cache || value.latest;
    if (id && name) {
      value.pins[id] = { cache: name, seen: Date.now() };
      // A failed metadata write must not prevent serving an already cached page.
      await persist(value).catch(() => {});
    }
    return name;
  })();
  event.respondWith((async () => {
    try {
      const name = await selected;
      const cached = name && await (await caches.open(name)).match(event.request);
      if (cached) return cached;
    } catch { /* Fall back to the network if cache access has been revoked. */ }
    return fetch(event.request);
  })());
  // Each request revalidates the complete generation, but overlapping requests share one fetch.
  event.waitUntil(selected.then(() => revalidate()).catch(() => {}));
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'CHECK_UPDATE') return;
  event.waitUntil((async () => {
    const value = await state();
    if (event.source?.id && !value.pins[event.source.id] && value.latest) {
      value.pins[event.source.id] = { cache: value.latest, seen: Date.now() };
      await persist(value);
    }
    await revalidate();
  })().catch(() => {}));
});
