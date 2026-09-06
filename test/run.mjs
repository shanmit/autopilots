// Dependency-free integration tests. All pictures below are SYNTHETIC TEST IMAGES.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe')
].filter(Boolean).find(existsSync);
if (!executable) {
  console.error('FAIL: Chrome/Chromium not found. Set CHROME_PATH to its executable. No dependencies are downloaded.');
  process.exit(1);
}
const profile = mkdtempSync(path.join(tmpdir(), 'autopilots-test-'));
const browser = spawn(executable, [
  '--headless', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--remote-debugging-pipe',
  `--user-data-dir=${profile}`
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let nextId = 0;
let buffer = '';
let stderr = '';
let exited = false;
let closing = false;
const pending = new Map();
const externalRequests = [];
const localResources = [];
const browserErrors = [];
let passed = 0;
const reports = [];
browser.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
browser.on('error', err => { stderr += err.message; });
browser.on('exit', () => {
  exited = true;
  for (const request of pending.values()) request.reject(new Error('Chrome exited: ' + stderr));
  pending.clear();
});
browser.stdio[3].on('error', () => {});
browser.stdio[4].on('data', data => {
  buffer += data;
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (request) message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    }
    if (message.method === 'Network.requestWillBeSent') {
      const url = message.params.request.url;
      // Blob video URLs and Chrome's built-in data: media-control icons do not use the network.
      if (url.startsWith('file://') || url.startsWith('blob:') || url.startsWith('data:')) localResources.push(url);
      else externalRequests.push(url);
    }
    if (!closing && (message.method === 'Runtime.exceptionThrown' ||
      message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error' ||
      message.method === 'Log.entryAdded' && message.params.entry.level === 'error')) browserErrors.push(message.params);
  }
});
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    if (exited) return reject(new Error('Chrome is not running: ' + stderr));
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}. ${stderr}`)); }, 25000);
    pending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: err => { clearTimeout(timer); reject(err); }
    });
    browser.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let call;
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function until(expression, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await delay(50);
  }
  throw new Error('Condition timed out: ' + expression);
}
async function click(id) {
  const point = await evaluate(`(() => {
    const node = document.getElementById(${JSON.stringify(id)});
    if (!node || node.disabled || node.closest('[hidden]')) throw Error('Control unavailable: ' + ${JSON.stringify(id)});
    node.scrollIntoView({block:'center'});
    const r = node.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};
  })()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
}
async function fill(id, value) {
  await evaluate(`(() => {const n=document.getElementById(${JSON.stringify(id)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
async function objective(value) {
  await evaluate(`(() => {const n=document.getElementById('objective');n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function goStep(step) {
  await evaluate(`document.querySelector('[data-step="${step}"]').click()`);
}
async function upload(index, expression) {
  await evaluate(`(() => {const input=document.querySelectorAll('#photo-slots input')[${index}];const transfer=new DataTransfer();transfer.items.add(${expression});input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function test(name, action) {
  await action();
  passed++;
  console.log(`PASS ${name}`);
}

try {
  const version = await send('Browser.getVersion');
  console.log(`Browser: ${version.product}; ${version.jsVersion}`);
  console.log('Assets: five programmatically generated SYNTHETIC TEST IMAGES (not restaurant photos).');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  call = (method, params) => send(method, params, sessionId);
  for (const domain of ['Page', 'Runtime', 'Network', 'Log']) await call(domain + '.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__test = {urls: [], revoked: [], recordings: [], tracks: []};
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {const url=create(blob);__test.urls.push({url,size:blob.size,type:blob.type,blob});return url;};
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = url => {__test.revoked.push(url);revoke(url);};
    const capture = HTMLCanvasElement.prototype.captureStream;
    if (capture) HTMLCanvasElement.prototype.captureStream = function(fps) {
      const stream=capture.call(this,fps);__test.tracks.push(...stream.getTracks());__test.fps=fps;return stream;
    };
    if (window.MediaRecorder) {
      const start=MediaRecorder.prototype.start,stop=MediaRecorder.prototype.stop;
      MediaRecorder.prototype.start=function(...args){this.__timing={start:performance.now(),audioTracks:this.stream.getAudioTracks().length,mimeType:this.mimeType};__test.recordings.push(this.__timing);return start.apply(this,args);};
      MediaRecorder.prototype.stop=function(...args){this.__timing.stop=performance.now();return stop.apply(this,args);};
    }
    if (window.AudioContext) {
      __test.audio={oscillators:0,resumes:0};
      const osc=AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator=function(...a){__test.audio.oscillators++;return osc.apply(this,a);};
      const resume=AudioContext.prototype.resume;
      AudioContext.prototype.resume=function(...a){__test.audio.resumes++;return resume.apply(this,a);};
    }
  ` });
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: pathToFileURL(path.join(root, 'index.html')).href });
  await until("document.readyState==='complete' && document.querySelectorAll('#photo-slots input').length===5");
  await test('file:// app loads with a supported recorder and local stylesheet', async () => {
    assert.equal(await evaluate("document.styleSheets.length===1 && !document.getElementById('generate').disabled"), true);
  });
  await test('missing required brief fields and objective are blocked', async () => {
    for (const [id, label, valid] of [
      ['restaurantName', 'Restaurant Name', 'Synthetic Bistro'],
      ['offer', 'Offer / Details', 'test tasting menu'],
      ['cta', 'Call to Action', 'Book a test table']
    ]) {
      await fill(id, '   ');
      await click('to-photos');
      assert.equal(await evaluate("document.getElementById('error').textContent"), `Missing required field: ${label}.`);
      assert.equal(await evaluate("document.getElementById('step-1').hidden"), false);
      await fill(id, valid);
    }
    await objective('');
    await click('to-photos');
    assert.equal(await evaluate("document.getElementById('error').textContent"), 'Missing required field: Objective.');
    await objective('obj-offer');
    await click('to-photos');
  });
  await test('fewer than three photos is blocked with the exact error', async () => {
    await click('to-review');
    assert.equal(await evaluate("document.getElementById('error').textContent"), 'Upload at least 3 photos to generate video.');
  });
  await test('invalid type and files at or above 5MB are rejected', async () => {
    await upload(0, "new File(['not an image'],'synthetic-invalid.txt',{type:'text/plain'})");
    assert.equal(await evaluate("document.getElementById('error').textContent"), 'Please upload a JPEG, PNG, or WebP file.');
    for (const bytes of [5 * 1024 * 1024, 5 * 1024 * 1024 + 1]) {
      await upload(0, `new File([new Uint8Array(${bytes})],'synthetic-oversize.png',{type:'image/png'})`);
      assert.equal(await evaluate("document.getElementById('error').textContent"), 'File size must be under 5MB.');
    }
    assert.equal(await evaluate("document.querySelectorAll('.photo-thumb').length"), 0);
  });
  await test('unreadable image fails safely', async () => {
    await upload(0, "new File(['invalid image bytes'],'synthetic-corrupt.png',{type:'image/png'})");
    await until("document.getElementById('error').textContent.includes('could not be opened')");
  });
  await evaluate(`(async () => {
    window.__syntheticPhotos=[];
    const colors=['#d33128','#19a356','#265fd6','#dfac18','#8f38b6'];
    for(let i=0;i<5;i++){
      const c=document.createElement('canvas');c.width=900;c.height=1400;
      const x=c.getContext('2d');x.fillStyle=colors[i];x.fillRect(0,0,c.width,c.height);
      for(let row=0;row<14;row++)for(let col=0;col<9;col++){
        x.fillStyle=(row+col)%2?'rgba(255,255,255,.22)':'rgba(0,0,0,.15)';
        x.fillRect(col*100,row*100,55,60);
      }
      x.fillStyle='white';x.font='bold 44px sans-serif';x.textAlign='center';
      x.fillText('SYNTHETIC TEST IMAGE',450,550);x.fillText(String(i+1)+' — NOT A RESTAURANT PHOTO',450,630);
      x.fillStyle='#181818';x.fillRect(110+i*60,760,190,110);
      const type=['image/png','image/jpeg','image/webp','image/png','image/png'][i];
      const blob=await new Promise(resolve=>c.toBlob(resolve,type,.9));
      __syntheticPhotos.push(new File([blob],'synthetic-test-'+(i+1)+'.'+type.split('/')[1],{type:blob.type}));
    }
  })()`);
  await test('phone photo slots keep the same height from empty to filled', async () => {
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    const sizes = () => evaluate("[...document.querySelectorAll('.photo-slot')].map(n=>({height:n.getBoundingClientRect().height,preview:n.querySelector('.photo-placeholder,.photo-thumb').getBoundingClientRect().height}))");
    const empty = await sizes();
    await upload(0, '__syntheticPhotos[0]');
    await until("document.querySelectorAll('.photo-thumb').length===1");
    const filled = await sizes();
    for (let i=0;i<empty.length;i++) {
      assert.ok(Math.abs(empty[i].height-filled[i].height)<0.5, `slot ${i+1} height changed: ${JSON.stringify({empty:empty[i],filled:filled[i]})}`);
      assert.ok(Math.abs(empty[i].preview-filled[i].preview)<0.5, `slot ${i+1} preview height changed`);
    }
    console.log('  Phone slot height: ' + JSON.stringify({empty:empty[0],filled:filled[0]}));
    await evaluate("document.querySelector('.photo-slot .secondary').click()");
    assert.deepEqual(await sizes(),empty);
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  });
  await test('JPEG, PNG, and WebP decode into real photo previews', async () => {
    for (let i = 0; i < 3; i++) {
      await upload(i, `__syntheticPhotos[${i}]`);
      await until(`document.querySelectorAll('.photo-thumb').length===${i + 1}`);
    }
    await click('to-review');
    assert.equal(await evaluate("document.querySelectorAll('#captions input').length"), 3);
    assert.equal(await evaluate("document.getElementById('caption-1').value"), 'test tasting menu at Synthetic Bistro');
  });
  await test('all objectives update exact slots and caption defaults', async () => {
    for (const [id, slot, first, second] of [
      ['obj-new', 'The Reveal', 'test tasting menu — new on the menu', 'Fresh from Synthetic Bistro'],
      ['obj-quiet', 'Cozy Corner', 'test tasting menu during quiet hours', 'Relax at Synthetic Bistro'],
      ['obj-new-guest', 'Signature Dish', 'test tasting menu for your first visit', 'Welcome to Synthetic Bistro'],
      ['obj-offer', 'Hero Dish', 'test tasting menu at Synthetic Bistro', 'Limited time only!']
    ]) {
      await goStep(1); await objective(id); await goStep(2);
      assert.equal(await evaluate("document.querySelector('.photo-slot h3').textContent"), slot);
      await click('to-review');
      assert.equal(await evaluate("document.getElementById('caption-1').value"), first);
      assert.equal(await evaluate("document.getElementById('caption-2').value"), second);
    }
  });
  await test('every objective opens with the offer, including a 40-character offer', async () => {
    const offers = ['VALUE TOKEN', 'X'.repeat(40)];
    for (const offer of offers) {
      for (const id of ['obj-offer', 'obj-new', 'obj-quiet', 'obj-new-guest']) {
        await goStep(1); await fill('offer', offer); await objective(id); await goStep(3);
        const caption = await evaluate("document.getElementById('caption-1').value");
        assert.ok(caption.startsWith(offer), `${id}: offer missing or buried in ${caption}`);
        assert.ok(caption.length <= 40);
      }
    }
  });
  await test('long default captions preserve whole words without dangling endings', async () => {
    await goStep(1);
    await fill('restaurantName', 'The Corner Table');
    await fill('offer', 'two-for-one wood-fired pizza');
    await objective('obj-offer');
    await goStep(3);
    const example = await evaluate("document.getElementById('caption-1').value");
    assert.equal(example, 'two-for-one wood-fired pizza');
    console.log('  Caption example: ' + example);
    for (const id of ['obj-offer', 'obj-new', 'obj-quiet', 'obj-new-guest']) {
      await goStep(1);
      await fill('restaurantName', 'The Extraordinary Corner Table');
      await fill('offer', 'two-for-one wood-fired margherita pizza');
      await objective(id); await goStep(3);
      const values = await evaluate("[...document.querySelectorAll('#captions input')].map(n=>n.value)");
      for (const caption of values) {
        assert.ok(caption.length <= 40);
        assert.doesNotMatch(caption, /\b(?:at|from|of|the|a|an|to|for|with|and)[.!?]*$/i);
        assert.ok(/(?:pizza|Table|only!|now|it|today|deal)$/.test(caption), caption);
      }
    }
  });
  await test('short default captions match the offer-led templates', async () => {
    await goStep(1); await fill('restaurantName', 'Cafe'); await fill('offer', 'soup');
    for (const [id, expected] of [
      ['obj-offer', ['soup at Cafe', 'Limited time only!', 'Claim this deal now']],
      ['obj-new', ['soup — new on the menu', 'Fresh from Cafe', 'Be first to try it']],
      ['obj-quiet', ['soup during quiet hours', 'Relax at Cafe', 'Grab your quiet table today']],
      ['obj-new-guest', ['soup for your first visit', 'Welcome to Cafe', 'Claim your first-visit deal']]
    ]) {
      await goStep(1); await objective(id); await goStep(3);
      assert.deepEqual(await evaluate("[...document.querySelectorAll('#captions input')].map(n=>n.value)"), expected);
      assert.equal(await evaluate("document.getElementById('end-caption').value"), 'Book a test table');
    }
  });
  await test('user-typed captions are never rewritten', async () => {
    for (const [id, text] of [['caption-1', 'A deliberately unfinished caption at The'], ['end-caption', 'Reserve a table for']]) {
      await evaluate(`document.getElementById('${id}').focus();document.getElementById('${id}').select()`);
      await call('Input.insertText', { text });
      assert.equal(await evaluate(`document.getElementById('${id}').value`), text);
      await goStep(1); await fill('offer', 'new soup'); await goStep(3);
      assert.equal(await evaluate(`document.getElementById('${id}').value`), text);
    }
    await goStep(1);
    await fill('restaurantName', 'Synthetic Bistro'); await fill('offer', 'test tasting menu');
    await fill('cta', 'Book a test table'); await objective('obj-offer'); await goStep(3);
  });
  await test('scene/CTA limits, literal user text, and required review CTA', async () => {
    await evaluate("document.getElementById('caption-1').focus();document.getElementById('caption-1').select()");
    await call('Input.insertText', { text: 'W'.repeat(65) });
    assert.equal(await evaluate("document.getElementById('caption-1').value.length"), 40);
    await evaluate("document.getElementById('end-caption').focus();document.getElementById('end-caption').select()");
    await call('Input.insertText', { text: 'Q'.repeat(50) });
    assert.equal(await evaluate("document.getElementById('end-caption').value.length"), 25);
    await fill('caption-2', '<img src=https://invalid.test>');
    assert.equal(await evaluate("document.querySelectorAll('img').length"), 0);
    await fill('end-caption', ''); await click('generate');
    assert.equal(await evaluate("document.getElementById('error').textContent"), 'Missing required field: Call to Action.');
    await fill('end-caption', 'Book a test table');
    await fill('caption-1', 'SYNTHETIC TEST IMAGE 1');
    await fill('caption-2', 'SYNTHETIC TEST IMAGE 2');
  });
  await test('first-frame caption pixels are present at full opacity at t=0', async () => {
    const original = await evaluate("document.getElementById('caption-1').value");
    const metrics = await evaluate(`(() => {
      const input=document.getElementById('caption-1'), slider=document.getElementById('preview-time');
      const context=document.getElementById('preview').getContext('2d');
      const sample=(text,time)=>{
        input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));
        slider.value=String(time);slider.dispatchEvent(new Event('input',{bubbles:true}));
        return context.getImageData(56,980,608,140).data;
      };
      const blank=sample('',0), first=sample('OFFER NOW',0), settled=sample('OFFER NOW',0.5);
      let bright=0, matching=0, added=0;
      for(let i=0;i<first.length;i+=4){
        if(first[i]>245 && first[i+1]>245 && first[i+2]>245){
          bright++;
          if(settled[i]>245 && settled[i+1]>245 && settled[i+2]>245) matching++;
          if(blank[i]<220 || blank[i+1]<220 || blank[i+2]<220) added++;
        }
      }
      return {bright,matching,added};
    })()`);
    assert.ok(metrics.added > 1000, `no opaque opening caption pixels: ${JSON.stringify(metrics)}`);
    assert.ok(metrics.matching / metrics.bright > 0.98, `opening caption differs from settled text: ${JSON.stringify(metrics)}`);
    console.log('  First-frame caption pixels: ' + JSON.stringify(metrics));
    await fill('caption-1', original); await fill('preview-time', '0');
  });
  await test('responsive layout and associated control labels at 320–1280px', async () => {
    for (const width of [320, 480, 768, 1280]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      for (const step of [1, 2, 3]) {
        await goStep(step);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `overflow at ${width}px step ${step}`);
      }
    }
    assert.equal(await evaluate("[...document.querySelectorAll('input,select,progress')].every(n=>n.labels.length>0)"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].every(n=>n.textContent.trim()||n.getAttribute('aria-label'))"), true);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle !== 'none'"), true);
    await evaluate('window.scrollTo(0,0)');
    const desktop = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(path.join(tmpdir(), 'autopilots-desktop.png'), Buffer.from(desktop.data, 'base64'));
    await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 1000, deviceScaleFactor: 1, mobile: false });
    const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(path.join(tmpdir(), 'autopilots-mobile.png'), Buffer.from(mobile.data, 'base64'));
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  });
  async function assertPhoneTargets() {
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    const small = await evaluate(`(() => {
      const controls=[...document.querySelectorAll('button,input:not([type="hidden"]),select,textarea,a[href],[role="button"],[role="slider"],[tabindex]:not([tabindex="-1"]),video[controls]')];
      return controls.flatMap(n=>{
        const r=n.getBoundingClientRect();
        if(!r.width||!r.height||getComputedStyle(n).visibility==='hidden')return [];
        const failures=[];
        if(r.width<44||r.height<44)failures.push({control:n.id||n.outerHTML.slice(0,120),width:r.width,height:r.height});
        // File selector buttons live in the browser's shadow tree; verify their computed minimum too.
        if(n.matches('input[type="file"]')) {
          const style=getComputedStyle(n,'::file-selector-button');
          if(parseFloat(style.minHeight)<44||parseFloat(style.minWidth)<44)failures.push({control:n.id,pseudo:'file-selector-button',minWidth:style.minWidth,minHeight:style.minHeight});
        }
        return failures;
      });
    })()`);
    assert.deepEqual(small, [], 'phone targets smaller than 44×44 CSS px');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'phone overflow');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  }
  await test('phone preview is visually above captions; desktop remains side by side', async () => {
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate("document.getElementById('preview').getBoundingClientRect().bottom <= document.getElementById('captions').getBoundingClientRect().top"), true);
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate("document.getElementById('preview').getBoundingClientRect().left > document.getElementById('captions').getBoundingClientRect().right"), true);
  });
  await test('all rendered phone controls have 44×44 targets across the flow', async () => {
    for(const step of [1,2,3]) { await goStep(step); await assertPhoneTargets(); }
    await selectMusic('music-upload'); await assertPhoneTargets(); await selectMusic('none');
  });
  await test('preview animates and supports pause and scrubbing', async () => {
    await click('play-preview'); await delay(350);
    assert.ok(await evaluate("Number(document.getElementById('preview-time').value)") > .1);
    await click('play-preview');
    const time = await evaluate("document.getElementById('preview-time').value");
    await delay(150);
    assert.equal(await evaluate("document.getElementById('preview-time').value"), time);
    await fill('preview-time', '13');
    assert.equal(await evaluate("document.getElementById('preview-clock').textContent"), '13.0 / 15 seconds');
  });
  await test('cancel stops recording, releases tracks, and restores controls', async () => {
    await click('generate'); await delay(500);
    assert.equal(await evaluate("document.getElementById('editor').disabled && [...document.querySelectorAll('[data-step]')].every(b=>b.disabled)"), true);
    await assertPhoneTargets();
    await click('cancel');
    await until("document.getElementById('status').textContent.startsWith('Recording cancelled')");
    assert.equal(await evaluate("__test.tracks.every(t=>t.readyState==='ended') && !document.getElementById('editor').disabled && document.getElementById('result').hidden"), true);
  });
  async function selectMusic(value) {
    await evaluate(`(() => {const n=document.querySelector('input[name="music"][value="${value}"]');n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function uploadAudio(expression) {
    await evaluate(`(() => {const input=document.getElementById('music-file');const transfer=new DataTransfer();transfer.items.add(${expression});input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  // Decodes an exported blob's audio in-page via blob.arrayBuffer(); the page CSP
  // (connect-src 'none') blocks fetch(blobUrl), so the hook-retained Blob is used.
  async function decodeExportAudio(url) {
    return evaluate(`(async () => {
      const entry=__test.urls.find(x=>x.url===${JSON.stringify(url)});
      const ctx=new AudioContext();
      try {
        const buf=await ctx.decodeAudioData(await entry.blob.arrayBuffer());
        const data=buf.getChannelData(0);
        const sr=buf.sampleRate;
        const rms=(a,b)=>{const s=Math.max(0,Math.floor(a*sr)),e=Math.min(data.length,Math.floor(b*sr));let sum=0;for(let i=s;i<e;i++)sum+=data[i]*data[i];return Math.sqrt(sum/Math.max(1,e-s));};
        return {ok:true,duration:buf.duration,mid:rms(1,13),tail:rms(buf.duration-0.25,buf.duration),at6:rms(6,6.5),at13:rms(13,13.5)};
      } catch (err) { return {ok:false,message:String(err)}; }
      finally { ctx.close(); }
    })()`);
  }
  async function verifyExport(count, { audioTracks = 0 } = {}) {
    const expectedMotions = {
      3: ['zoom-in', 'pan-right', 'zoom-out'],
      4: ['zoom-in', 'pan-left', 'zoom-out', 'pan-right'],
      5: ['zoom-in', 'pan-up', 'zoom-out', 'pan-down', 'pan-right']
    };
    const labels = await evaluate("[...document.querySelectorAll('#captions label span')].map(n=>n.textContent)");
    assert.deepEqual(labels, expectedMotions[count].map(motion => `${12 / count}s · ${motion}`));
    const mp4Supported = await evaluate("MediaRecorder.isTypeSupported(" + JSON.stringify(audioTracks ? 'video/mp4;codecs=avc1.42E01E,mp4a.40.2' : 'video/mp4;codecs=avc1.42E01E') + ")");
    await click('generate');
    await until("!document.getElementById('recording').hidden");
    await delay(1100);
    assert.ok(await evaluate("document.getElementById('recording-progress').value") > .5);
    await until("!document.getElementById('result').hidden", 21000);
    const metrics = await evaluate(`(async () => {
      const url=document.getElementById('download').href;
      const blob=__test.urls.find(x=>x.url===url);
      const v=document.getElementById('exported-video');
      if(v.readyState<2)await new Promise((resolve,reject)=>{v.addEventListener('loadeddata',resolve,{once:true});v.addEventListener('error',()=>reject(Error('Video decode error')),{once:true});});
      const originalDuration=Number.isFinite(v.duration)?v.duration:String(v.duration);
      async function seek(time){
        if(Math.abs(v.currentTime-time)<.001)return;
        await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('seek timed out at '+time)),5000);v.addEventListener('seeked',()=>{clearTimeout(timeout);resolve();},{once:true});v.currentTime=time;});
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      }
      if(!Number.isFinite(v.duration)) await seek(1e10);
      const decodedDuration=v.duration;
      const c=document.createElement('canvas');c.width=72;c.height=128;
      const context=c.getContext('2d',{willReadFrequently:true});
      const frames=[];
      for(const time of [.6,1.8,4.6,6.6,8.6,10.6,12.8,14.2]){
        await seek(time);context.drawImage(v,0,0,72,128);
        const pixels=Array.from(context.getImageData(0,0,72,128).data);
        frames.push({time,pixels});
      }
      v.currentTime=0;
      const recording=__test.recordings.at(-1);
      return {size:blob.size,type:blob.type,filename:document.getElementById('download').download,width:v.videoWidth,height:v.videoHeight,originalDuration,decodedDuration,seconds:(recording.stop-recording.start)/1000,fps:__test.fps,frames,tracksStopped:__test.tracks.every(t=>t.readyState==='ended'),audioTracks:recording.audioTracks,recorderMime:recording.mimeType,url};
    })()`);
    assert.equal(metrics.audioTracks, audioTracks, `expected ${audioTracks} audio track(s), recorder saw ${metrics.audioTracks}`);
    assert.ok(metrics.size > 50_000, `blob too small: ${metrics.size}`);
    assert.equal(metrics.width, 720);
    assert.equal(metrics.height, 1280);
    assert.equal(metrics.fps, 30);
    assert.ok(metrics.seconds >= 14.5 && metrics.seconds <= 16.5, `wall-clock: ${metrics.seconds}s`);
    assert.ok(metrics.decodedDuration >= 14.5 && metrics.decodedDuration <= 16.5, `decoded duration after seeking: ${metrics.decodedDuration}`);
    assert.equal(metrics.tracksStopped, true);
    assert.equal(metrics.filename.endsWith(metrics.type.startsWith('video/mp4') ? '.mp4' : '.webm'), true);
    if (mp4Supported) {
      assert.ok(metrics.type.startsWith('video/mp4'), `MP4 supported but exported ${metrics.type}`);
      assert.ok(metrics.filename.endsWith('.mp4'));
      assert.ok(/avc1/i.test(metrics.recorderMime), `H.264 missing: ${metrics.recorderMime}`);
      assert.equal(await evaluate("document.getElementById('format-note').textContent.includes('may not report duration')"), false);
    }
    const distance = (a, b) => a.reduce((sum, x, i) => sum + (i % 4 === 3 ? 0 : Math.abs(x - b[i])), 0) / (a.length * .75);
    const distinct = [];
    for (const frame of metrics.frames) {
      if (distinct.every(other => distance(frame.pixels, other.pixels) > 12)) distinct.push(frame);
    }
    assert.ok(distinct.length >= count + 1, `only ${distinct.length} visibly distinct frames for ${count} photos`);
    const motionDifference = distance(metrics.frames[0].pixels, metrics.frames[1].pixels);
    assert.ok(motionDifference > 1, `first photo did not move: ${motionDifference}`);
    reports.push({ photos: count, bytes: metrics.size, mime: metrics.type, recorderMime: metrics.recorderMime, audioTracks: metrics.audioTracks, extension: metrics.filename.split('.').at(-1), wallSeconds: Number(metrics.seconds.toFixed(3)), initialDuration: metrics.originalDuration, decodedSeconds: Number(metrics.decodedDuration.toFixed(3)), distinctFrames: distinct.length, motionPixelDifference: Number(motionDifference.toFixed(2)) });
    const downloadPath = path.join(profile, 'export-' + reports.length + '-' + count);
    mkdirSync(downloadPath);
    await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });
    await click('download');
    const downloaded = path.join(downloadPath, metrics.filename);
    for (let i = 0; i < 100 && !existsSync(downloaded); i++) await delay(50);
    assert.ok(existsSync(downloaded), 'Download link did not produce a real file');
    const bytes = readFileSync(downloaded);
    assert.equal(bytes.length, metrics.size);
    if (metrics.type.startsWith('video/webm')) assert.deepEqual([...bytes.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3]);
    else assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
    const report = reports.at(-1);
    report.signature = bytes.toString('ascii', 4, 8);
    report.aacMarkers = ['mp4a', 'esds'].filter(marker => bytes.includes(Buffer.from(marker)));
    if (audioTracks && mp4Supported) {
      assert.ok(/mp4a/i.test(metrics.recorderMime), `AAC missing: ${metrics.recorderMime}`);
      assert.ok(!/opus/i.test(metrics.recorderMime), `Unexpected Opus: ${metrics.recorderMime}`);
      assert.deepEqual(report.aacMarkers, ['mp4a', 'esds']);
    }
    console.log('  ' + JSON.stringify(report));
    return metrics.url;
  }
  let oldUrl;
  let silentUrl;
  // Deterministic Web Share behavior: never open the OS share sheet in tests.
  await evaluate(`(() => {
    window.__shareTest = {supported:false, mode:'success', calls:[], checked:[]};
    window.__originalUA = navigator.userAgent;
    Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
    Object.defineProperty(navigator,'canShare',{configurable:true,value: data => {
      __shareTest.checked.push(data.files[0]); return __shareTest.supported;
    }});
    Object.defineProperty(navigator,'share',{configurable:true,value: async data => {
      __shareTest.calls.push(data);
      if (__shareTest.mode==='cancel') throw new DOMException('Test cancellation','AbortError');
      if (__shareTest.mode==='reject') throw new DOMException('Test rejection','NotAllowedError');
    }});
  })()`);
  await test('3-photo real export: nonempty, 720×1280 decode, distinct moving frames, ~15s wall-clock', async () => {
    oldUrl = await verifyExport(3);
  });
  await test('unsupported file sharing hides Share and shows iPhone Files guidance', async () => {
    assert.equal(await evaluate("document.getElementById('share-video').hidden"), true);
    assert.equal(await evaluate("!document.getElementById('share-guidance').hidden && /Files.*Photos.*TikTok/.test(document.getElementById('share-guidance').textContent)"), true);
    assert.equal(await evaluate("__shareTest.calls.length"), 0);
    await evaluate("__shareTest.supported=true");
  });
  await test('4-photo re-generation updates timing, defaults, and revokes the first export', async () => {
    await goStep(2); await upload(3, '__syntheticPhotos[3]');
    await until("document.querySelectorAll('.photo-thumb').length===4");
    await click('to-review');
    assert.equal(await evaluate("document.getElementById('caption-4').value"), 'Synthetic Bistro');
    assert.equal(await evaluate(`__test.revoked.includes(${JSON.stringify(oldUrl)})`), true);
    assert.ok((await evaluate("document.getElementById('timeline-note').textContent")).includes('4 photos × 3 seconds'));
    oldUrl = await verifyExport(4);
  });
  await test('supported file sharing shows Share and sends the real export File', async () => {
    assert.equal(await evaluate("document.getElementById('share-video').hidden"), false);
    await assertPhoneTargets();
    assert.equal(await evaluate("document.getElementById('share-guidance').hidden"), true);
    await click('share-video');
    await until("!document.getElementById('share-video').disabled");
    assert.equal(await evaluate(`(async () => {
      const data=__shareTest.calls.at(-1), file=data.files[0];
      const exported=__test.urls.find(x=>x.url===document.getElementById('download').href);
      const a=new Uint8Array(await file.arrayBuffer()),b=new Uint8Array(await exported.blob.arrayBuffer());
      return file instanceof File && data.files.length===1 && file===__shareTest.checked.at(-1) &&
        file.name===document.getElementById('download').download && file.type===exported.type &&
        a.length===b.length && a.every((value,i)=>value===b[i]) && !!data.title && !!data.text;
    })()`), true);
  });
  await test('cancelled share is silent and leaves editor and download usable', async () => {
    const href=await evaluate("document.getElementById('download').href");
    await evaluate("__shareTest.mode='cancel'");
    await click('share-video');
    await until("!document.getElementById('share-video').disabled");
    assert.equal(await evaluate("document.getElementById('error').textContent"), '');
    assert.equal(await evaluate("!document.getElementById('editor').disabled && !document.getElementById('result').hidden"), true);
    assert.equal(await evaluate("document.getElementById('download').href"), href);
  });
  await test('share rejection points to Download and allows retry', async () => {
    const href=await evaluate("document.getElementById('download').href");
    await evaluate("__shareTest.mode='reject'");
    await click('share-video');
    await until("!document.getElementById('share-video').disabled");
    assert.equal(await evaluate("document.getElementById('error').textContent"), 'Could not share this video. Use Download video to save it instead.');
    assert.equal(await evaluate("document.getElementById('download').href"), href);
    await evaluate("__shareTest.mode='success'");
    await click('share-video');
    await until("!document.getElementById('share-video').disabled");
    assert.equal(await evaluate("document.getElementById('error').textContent"), '');
    await evaluate("__shareTest.supported=false;Object.defineProperty(navigator,'userAgent',{configurable:true,value:__originalUA})");
  });
  await test('5-photo real export supports the fifth editable caption and exact 15s timeline', async () => {
    await goStep(2); await upload(4, '__syntheticPhotos[4]');
    await until("document.querySelectorAll('.photo-thumb').length===5");
    await click('to-review');
    assert.equal(await evaluate("document.getElementById('caption-5').value"), 'test tasting menu');
    await fill('caption-5', 'SYNTHETIC TEST IMAGE 5');
    assert.equal(await evaluate("document.getElementById('caption-5').value"), 'SYNTHETIC TEST IMAGE 5');
    assert.equal(await evaluate(`__test.revoked.includes(${JSON.stringify(oldUrl)})`), true);
    assert.ok((await evaluate("document.getElementById('timeline-note').textContent")).includes('5 photos × 2.4 seconds'));
    silentUrl = await verifyExport(5);
    assert.equal(await evaluate("document.getElementById('share-video').hidden && document.getElementById('share-guidance').hidden"), true);
  });
  await test('a missing required slot is blocked even with enough optional photos', async () => {
    await goStep(2);
    await evaluate("document.querySelector('.photo-slot .secondary').click()");
    await click('to-review');
    assert.equal(await evaluate("document.getElementById('error').textContent"), 'Missing required field: Hero Dish.');
    await upload(0, '__syntheticPhotos[0]');
    await until("document.querySelectorAll('.photo-thumb').length===5");
    await click('to-review');
  });
  await test('audition is audible only while previewing', async () => {
    await selectMusic('music-sunny');
    const before = await evaluate('__test.audio.oscillators');
    await click('play-preview');
    await delay(400);
    const during = await evaluate('__test.audio.oscillators');
    assert.ok(during > before, `no oscillators created for the audition: ${during}`);
    await click('play-preview');
    const paused = await evaluate('__test.audio.oscillators');
    await delay(300);
    assert.equal(await evaluate('__test.audio.oscillators'), paused, 'oscillators kept spawning after pause');
    await selectMusic('none');
    await click('play-preview');
    await delay(300);
    assert.equal(await evaluate('__test.audio.oscillators'), paused, 'oscillators created with No music selected');
    await click('play-preview');
  });
  await test('soundtrack export contains real, nonsilent, fading audio', async () => {
    await selectMusic('music-sunny');
    const url = await verifyExport(5, { audioTracks: 1 });
    assert.ok(/opus|mp4a/i.test(reports.at(-1).recorderMime), `recorder MIME lacks an audio codec: ${reports.at(-1).recorderMime}`);
    const audio = await decodeExportAudio(url);
    assert.equal(audio.ok, true, `exported audio did not decode: ${audio.message}`);
    assert.ok(audio.duration >= 14.5 && audio.duration <= 16.5, `audio duration: ${audio.duration}`);
    assert.ok(audio.mid > 0.01, `music RMS over 1–13s too low: ${audio.mid}`);
    assert.ok(audio.tail < audio.mid * 0.2, `no fade-out: tail RMS ${audio.tail} vs mid ${audio.mid}`);
    console.log(`  audio: duration ${audio.duration.toFixed(3)}s, mid RMS ${audio.mid.toFixed(4)}, tail RMS ${audio.tail.toFixed(5)}`);
  });
  await test('no-music export truly has no audio track', async () => {
    const audio = await decodeExportAudio(silentUrl);
    assert.equal(audio.ok, false, 'the silent export unexpectedly contained decodable audio');
  });
  await test('audio upload validation matches photo validation', async () => {
    await selectMusic('music-upload');
    assert.equal(await evaluate("document.getElementById('music-upload-field').hidden"), false);
    await uploadAudio("new File(['x'],'synthetic.txt',{type:'text/plain'})");
    assert.equal(await evaluate("document.getElementById('error').textContent"), 'Please upload an MP3, M4A, or WAV audio file.');
    await uploadAudio('new File([new Uint8Array(15*1024*1024)],"synthetic-big.mp3",{type:"audio/mpeg"})');
    assert.equal(await evaluate("document.getElementById('error').textContent"), 'Audio file size must be under 15MB.');
    await uploadAudio("new File(['not real audio bytes'],'synthetic-corrupt.mp3',{type:'audio/mpeg'})");
    await until("document.getElementById('error').textContent.includes('could not be opened')");
    await click('generate');
    assert.equal(await evaluate("document.getElementById('error').textContent"), 'Choose an audio file or another soundtrack option.');
  });
  await test('user WAV is mixed, trimmed/looped to 15s', async () => {
    // SYNTHETIC TEST AUDIO: a deterministic 4-second 440Hz mono sine WAV built
    // in memory (44-byte RIFF header + Int16 samples); no real music is used.
    await evaluate(`(() => {
      const sr=44100,seconds=4,n=sr*seconds;
      const bytes=new ArrayBuffer(44+n*2);
      const view=new DataView(bytes);
      const str=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
      str(0,'RIFF');view.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');
      view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
      view.setUint32(24,sr,true);view.setUint32(28,sr*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
      str(36,'data');view.setUint32(40,n*2,true);
      for(let i=0;i<n;i++)view.setInt16(44+i*2,Math.round(Math.sin(2*Math.PI*440*i/sr)*12000),true);
      window.__syntheticWav=new File([bytes],'synthetic-test-tone.wav',{type:'audio/wav'});
    })()`);
    await uploadAudio('window.__syntheticWav');
    await until("document.getElementById('status').textContent.includes('synthetic-test-tone.wav ready')");
    const url = await verifyExport(5, { audioTracks: 1 });
    const audio = await decodeExportAudio(url);
    assert.equal(audio.ok, true, `exported audio did not decode: ${audio.message}`);
    assert.ok(audio.duration >= 14.5 && audio.duration <= 16.5, `audio duration: ${audio.duration}`);
    assert.ok(audio.at6 > 0.01 && audio.at13 > 0.01, `looped tone missing past the 4s source: t=6s ${audio.at6}, t=13s ${audio.at13}`);
    console.log(`  audio: duration ${audio.duration.toFixed(3)}s, RMS at 6s ${audio.at6.toFixed(4)}, at 13s ${audio.at13.toFixed(4)}`);
    await selectMusic('none');
  });
  await test('MP4 soundtrack exports contain AAC MIME and mp4a/esds bytes, never Opus', async () => {
    if (await evaluate("MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')")) {
      const soundtracks = reports.filter(report => report.audioTracks === 1);
      assert.equal(soundtracks.length, 2);
      for (const report of soundtracks) {
        assert.ok(report.recorderMime.startsWith('video/mp4;'));
        assert.ok(/mp4a/i.test(report.recorderMime));
        assert.ok(!/opus/i.test(report.recorderMime));
        assert.equal(report.signature, 'ftyp');
        assert.deepEqual(report.aacMarkers, ['mp4a', 'esds']);
      }
    } else {
      console.log('  MP4/AAC unavailable; WebM fallback exercised by soundtrack exports.');
    }
  });
  await test('recording startup failure restores the usable editor', async () => {
    await evaluate("window.__nativeRecorder=MediaRecorder;window.MediaRecorder=class extends MediaRecorder {constructor(){throw Error('Synthetic test failure');}}");
    await click('generate');
    await until("document.getElementById('error').textContent.includes('Could not start')");
    assert.equal(await evaluate("!document.getElementById('editor').disabled && document.getElementById('recording').hidden && __test.tracks.every(t=>t.readyState==='ended')"), true);
    await evaluate('window.MediaRecorder=window.__nativeRecorder');
  });
  await test('unsupported MIME choices show a clear message and no broken download', async () => {
    await call('Page.addScriptToEvaluateOnNewDocument', { source: 'if(window.MediaRecorder)MediaRecorder.isTypeSupported=()=>false;' });
    await call('Page.reload');
    await until("document.readyState==='complete' && document.getElementById('support-note').textContent.includes('not supported')");
    assert.equal(await evaluate("document.getElementById('generate').disabled && !document.getElementById('download').hasAttribute('href')"), true);
  });
  await test('zero external/non-file network requests and zero browser console/runtime errors', async () => {
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(browserErrors, []);
    assert.ok(localResources.some(url => url.endsWith('/app.js')));
  });
  console.log(`\nPASS: ${passed}/${passed} tests; ${reports.length} complete real-time video exports (${reports.filter(r => r.audioTracks).length} with soundtrack audio); zero external network requests; zero browser errors.`);
  console.log('Local resources only: file:// app files, blob: in-memory videos, and data: built-in media-control icons.');
  console.log('Screenshots: ' + path.join(tmpdir(), 'autopilots-{desktop,mobile}.png'));
  console.log('Video results: ' + JSON.stringify(reports));
} catch (err) {
  console.error(`\nFAIL after ${passed} passing tests: ${err.stack || err}`);
  if (externalRequests.length) console.error('Unexpected requests:', externalRequests);
  if (browserErrors.length) console.error('Browser errors:', JSON.stringify(browserErrors));
  process.exitCode = 1;
} finally {
  closing = true;
  if (!exited) {
    try { await send('Browser.close'); } catch { /* Process may close before the response. */ }
    for (let i = 0; i < 30 && !exited; i++) await delay(100);
    if (!exited) browser.kill();
  }
  // Only the disposable profile created by this test is removed.
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* OS may still hold a profile file. */ }
}
