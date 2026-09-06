'use strict';

(() => {
  const OBJECTIVES = {
    'obj-offer': {
      slots: [
        ['slot-hero', 'Hero Dish', 'background for the offer announcement', 'center dish with ample negative space'],
        ['slot-vibe', 'Restaurant Vibe', 'establishes dining atmosphere', 'wide-angle interior'],
        ['slot-detail', 'Close-up Detail', 'highlights ingredients', 'macro view of textures'],
        ['slot-bonus', 'Happy Guest', 'adds social proof', 'guest looking at the food']
      ],
      captions: ['Try {offer} at {restaurantName}', 'Limited time only!', "Don't miss out."]
    },
    'obj-new': {
      slots: [
        ['slot-reveal', 'The Reveal', 'first look at the new item', 'eye-level shot'],
        ['slot-prep', 'Preparation', 'shows freshness or craft', "bird's eye of plating"],
        ['slot-texture', 'Texture Shot', 'focuses on mouthfeel', 'fork lifting a bite'],
        ['slot-chef', 'Behind-the-Scenes', 'human element', "chef's hands in action"]
      ],
      captions: ['Meet our new {offer}', 'Fresh from {restaurantName}', 'Taste the difference.']
    },
    'obj-quiet': {
      slots: [
        ['slot-peace', 'Cozy Corner', 'highlights the peaceful setting', 'single table in soft light'],
        ['slot-comfort', 'Comfort Item', 'the dish for this deal', 'centered plate on clean wood'],
        ['slot-pair', 'Drink or Side', 'the accompaniment', 'high angle showing glass and plate'],
        ['slot-entry', 'Welcome View', 'invites you inside', 'straight-on storefront or patio']
      ],
      captions: ['The {offer} quiet hours', 'Relax at {restaurantName}', 'Your table is ready.']
    },
    'obj-new-guest': {
      slots: [
        ['slot-signature', 'Signature Dish', 'the #1 reason to visit', 'vibrant high-contrast lighting'],
        ['slot-service', 'Bar or Counter', 'shows the entry point', '45-degree angle of service area'],
        ['slot-full', 'Main Dining', 'overall scale and buzz', 'wide shot of multiple tables'],
        ['slot-finish', 'Dessert or Coffee', 'the perfect ending', 'top-down small dessert plate']
      ],
      captions: ['Welcome to {restaurantName}', 'Your first {offer} is here', 'Join us today!']
    }
  };
  const MOTIONS = {
    3: ['zoom-in', 'pan-right', 'zoom-out'],
    4: ['zoom-in', 'pan-left', 'zoom-out', 'pan-right'],
    5: ['zoom-in', 'pan-up', 'zoom-out', 'pan-down', 'pan-right']
  };
  const MIME_CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E', 'video/mp4',
    'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'
  ];
  const AUDIO_MIME_CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
  ];
  const TRACKS = {
    'music-sunny':   { label: 'Sunny — upbeat',      compose: composeSunny },
    'music-hearth':  { label: 'Hearth — warm',       compose: composeHearth },
    'music-velvet':  { label: 'Velvet — elegant',    compose: composeVelvet },
    'music-voltage': { label: 'Voltage — energetic', compose: composeVoltage }
  };
  const $ = id => document.getElementById(id);
  const canvas = $('preview');
  const ctx = canvas.getContext('2d', { alpha: false });
  const layer = document.createElement('canvas');
  layer.width = 720;
  layer.height = 1280;
  const layerCtx = layer.getContext('2d', { alpha: false });
  const photos = Array(5).fill(null);
  const uploadVersions = Array(5).fill(0);
  let captionEdits = Array(5).fill(null);
  let sceneCaptions = [];
  let currentStep = 1;
  let pendingUploads = 0;
  let previewFrame = 0;
  let recordingJob = null;
  let exportUrl = null;
  let mimeType = '';
  let previewSeconds = 0;
  let audioCtx = null;
  let musicNodes = null;
  let cachedNoise = null;
  let userAudio = null; // { buffer: AudioBuffer (≤15s), name }
  let musicVersion = 0;
  let audioMimeType = '';
  const unsupported = 'Video recording is not supported in this browser. Try a browser with canvas captureStream and a supported MediaRecorder video format.';
  try {
    if (canvas.captureStream && window.MediaRecorder) {
      mimeType = MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) || '';
      audioMimeType = AUDIO_MIME_CANDIDATES.find(type => MediaRecorder.isTypeSupported(type)) || '';
    }
  } catch { /* The unsupported message below covers unavailable recording APIs. */ }
  $('support-note').textContent = mimeType
    ? 'Vertical video recorded locally in real time. Format support depends on your browser and the app where you share it.'
    : unsupported;
  $('generate').disabled = !mimeType;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function error(message, control) {
    $('error').textContent = message;
    if (control) {
      control.setAttribute('aria-invalid', 'true');
      control.focus();
    }
    return false;
  }
  function clearError() {
    $('error').textContent = '';
    document.querySelectorAll('[aria-invalid]').forEach(node => node.removeAttribute('aria-invalid'));
  }
  function status(message) { $('status').textContent = message; }
  function activePhotos() { return photos.filter(Boolean); }
  function invalidateExport() {
    $('result').hidden = true;
    $('exported-video').pause();
    $('exported-video').removeAttribute('src');
    $('exported-video').load();
    $('download').removeAttribute('href');
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = null;
  }
  function validateBrief() {
    for (const [id, name] of [['restaurantName', 'Restaurant Name'], ['offer', 'Offer / Details'], ['cta', 'Call to Action'], ['objective', 'Objective']]) {
      const input = $(id);
      if (!input.value.trim() || (id === 'objective' && !OBJECTIVES[input.value])) {
        showStep(1);
        return error(`Missing required field: ${name}.`, input);
      }
    }
    return true;
  }
  function validatePhotos() {
    if (pendingUploads) return error('Please wait for your photos to finish loading.');
    if (activePhotos().length < 3) {
      showStep(2);
      return error('Upload at least 3 photos to generate video.');
    }
    for (let i = 0; i < 3; i++) {
      if (!photos[i]) {
        showStep(2);
        const slot = OBJECTIVES[$('objective').value].slots[i];
        return error(`Missing required field: ${slot[1]}.`, $(slot[0]));
      }
    }
    return true;
  }
  function showStep(step) {
    stopPreview();
    currentStep = step;
    for (let i = 1; i <= 3; i++) $('step-' + i).hidden = i !== step;
    document.querySelectorAll('[data-step]').forEach(button => {
      if (Number(button.dataset.step) === step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    if (step === 3) buildReview();
    $('step-' + step).querySelector('h2').focus();
  }
  function navigate(step) {
    if (recordingJob) return;
    clearError();
    if (step > 1 && !validateBrief()) return;
    if (step > 2 && !validatePhotos()) return;
    showStep(step);
  }
  function drawThumbnail(target, bitmap) {
    target.width = 480;
    target.height = 360;
    const context = target.getContext('2d');
    const scale = Math.max(480 / bitmap.width, 360 / bitmap.height);
    context.drawImage(bitmap, (480 - bitmap.width * scale) / 2, (360 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  }
  function renderPhotoSlots() {
    const slots = [...OBJECTIVES[$('objective').value].slots,
      ['slot-extra', 'Extra photo', 'one more moment for your promotion', 'keep the subject near the center']];
    const container = $('photo-slots');
    container.replaceChildren();
    slots.forEach(([id, title, use, tip], index) => {
      const article = element('article', undefined, 'photo-slot');
      article.append(element('p', `PHOTO ${index + 1} · ${index < 3 ? 'REQUIRED' : 'OPTIONAL'}`, 'slot-number'));
      const heading = element('h3', title);
      heading.id = id + '-title';
      article.setAttribute('aria-labelledby', heading.id);
      article.append(heading);
      if (photos[index]) {
        const thumbnail = element('canvas', undefined, 'photo-thumb');
        thumbnail.setAttribute('role', 'img');
        thumbnail.setAttribute('aria-label', `${title}: ${photos[index].name}`);
        drawThumbnail(thumbnail, photos[index].bitmap);
        article.append(thumbnail);
      } else article.append(element('div', 'Your photo goes here', 'photo-placeholder'));
      const guidance = element('p', `Use: ${use}. Framing tip: ${tip}.`);
      guidance.id = id + '-hint';
      const label = element('label', photos[index] ? `Replace ${title}` : `Upload ${title}`);
      label.htmlFor = id;
      const input = element('input');
      input.type = 'file';
      input.id = id;
      input.accept = 'image/jpeg,image/png,image/webp';
      input.required = index < 3;
      input.setAttribute('aria-describedby', guidance.id);
      input.addEventListener('change', () => uploadPhoto(index, input));
      article.append(guidance, label, input);
      if (photos[index]) {
        article.append(element('p', photos[index].name, 'file-name'));
        const remove = element('button', `Remove ${title}`, 'secondary');
        remove.type = 'button';
        remove.addEventListener('click', () => {
          uploadVersions[index]++;
          photos[index].bitmap.close();
          photos[index] = null;
          captionEdits[index] = null;
          invalidateExport();
          renderPhotoSlots();
          $(id).focus();
          status(`${title} removed.`);
        });
        article.append(remove);
      }
      container.append(article);
    });
  }
  async function uploadPhoto(index, input) {
    if (recordingJob) return;
    clearError();
    const file = input.files[0];
    if (!file) return;
    const version = ++uploadVersions[index];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      input.value = '';
      return error('Please upload a JPEG, PNG, or WebP file.', input);
    }
    if (file.size >= 5 * 1024 * 1024) {
      input.value = '';
      return error('File size must be under 5MB.', input);
    }
    pendingUploads++;
    status('Loading photo locally…');
    try {
      // Decode locally; dimensions are used only to crop and size the image.
      // A bounded bitmap prevents very large camera photos accumulating in memory.
      const source = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 1920 / Math.max(source.width, source.height));
      let bitmap = source;
      if (scale < 1) {
        try {
          bitmap = await createImageBitmap(source, {
            resizeWidth: Math.max(1, Math.round(source.width * scale)),
            resizeHeight: Math.max(1, Math.round(source.height * scale)),
            resizeQuality: 'high'
          });
        } finally { source.close(); }
      }
      if (version !== uploadVersions[index]) { bitmap.close(); return; }
      if (photos[index]) photos[index].bitmap.close();
      photos[index] = { bitmap, name: file.name };
      invalidateExport();
      renderPhotoSlots();
      $(input.id)?.focus();
      status(`${activePhotos().length} photo${activePhotos().length === 1 ? '' : 's'} ready. Photos remain in this browser.`);
    } catch {
      input.value = '';
      error('This image could not be opened. Please choose another JPEG, PNG, or WebP file.', input);
    } finally { pendingUploads--; }
  }
  function fillTemplate(template) {
    return template.replace(/\{(restaurantName|offer|cta)\}/g, (_, key) => $(key).value.trim());
  }
  function defaultCaption(template, limit = 40) {
    const full = fillTemplate(template);
    if (full.length <= limit) return full;
    // Prefer intact offer/name substitutions over partial names or phrases.
    const variants = {
      'Try {offer} at {restaurantName}': ['Try {offer}', 'Visit {restaurantName}', '{offer}'],
      'Meet our new {offer}': ['New: {offer}', '{offer}'],
      'Fresh from {restaurantName}': ['From {restaurantName}', '{restaurantName}'],
      'The {offer} quiet hours': ['Quiet hours: {offer}', 'Relax at {restaurantName}', '{offer}'],
      'Relax at {restaurantName}': ['Visit {restaurantName}', '{restaurantName}'],
      'Welcome to {restaurantName}': ['Visit {restaurantName}', '{restaurantName}'],
      'Your first {offer} is here': ['Try {offer}', '{offer}']
    };
    const dangling = /(?:^|\s)(?:at|from|of|the|a|an|to|for|with|and)[^\p{L}\p{N}]*$/iu;
    const candidates = [full, ...(variants[template] || []).map(fillTemplate)];
    const intact = candidates.find(text => text.length <= limit && !dangling.test(text));
    if (intact) return intact;
    for (const candidate of candidates) {
      const words = candidate.trim().split(/\s+/);
      while (words.length && (words.join(' ').length > limit || dangling.test(words.join(' ')))) words.pop();
      if (words.length > 1) return words.join(' ');
    }
    return 'Visit us today';
  }
  function buildReview() {
    const count = activePhotos().length;
    const templates = [...OBJECTIVES[$('objective').value].captions, '{restaurantName}', '{offer}'];
    const duration = 12 / count;
    const slotIndices = photos.flatMap((photo, index) => photo ? [index] : []);
    sceneCaptions = slotIndices.map((slotIndex, sceneIndex) => captionEdits[slotIndex] ?? defaultCaption(templates[sceneIndex]));
    $('timeline-note').textContent = `${count} photos × ${duration} seconds + 3-second CTA. Half-second crossfades are included within the 15 seconds.`;
    $('captions').replaceChildren();
    sceneCaptions.forEach((caption, index) => {
      const field = element('div', undefined, 'field');
      const id = `caption-${index + 1}`;
      const label = element('label', `Scene ${index + 1}`);
      label.htmlFor = id;
      label.append(element('span', `${duration}s · ${MOTIONS[count][index]}`));
      const input = element('input');
      input.id = id;
      input.maxLength = 40;
      input.value = caption;
      input.setAttribute('aria-describedby', id + '-count');
      const counter = element('small', `${caption.length} / 40 characters`);
      counter.id = id + '-count';
      input.addEventListener('input', () => {
        input.value = input.value.slice(0, 40);
        captionEdits[slotIndices[index]] = input.value;
        sceneCaptions[index] = input.value;
        counter.textContent = `${input.value.length} / 40 characters`;
        invalidateExport();
        render(previewSeconds);
      });
      field.append(label, input, counter);
      $('captions').append(field);
    });
    if (!$('end-caption').dataset.edited) $('end-caption').value = defaultCaption('{cta}', 25);
    updateEndCount();
    setPreviewTime(0);
  }
  function updateEndCount() { $('end-count').textContent = `${$('end-caption').value.length} / 25 characters`; }

  // ---- Soundtrack engine ----------------------------------------------------
  // Four deterministic procedural tracks plus an optional user file, rendered
  // through one Web Audio graph shared by preview audition and recording:
  // events → mixBus(0.9) → compressor → fadeGain → destination (+ mediaDest).
  function getAudioContext() {
    try {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    } catch { return null; }
  }
  function noiseBuffer(context) {
    if (cachedNoise && cachedNoise.sampleRate === context.sampleRate) return cachedNoise;
    // Fixed-seed LCG keeps every run byte-identical; no Math.random() anywhere.
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    let s = 0xA0703;
    for (let i = 0; i < data.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = s / 2147483648 - 1;
    }
    cachedNoise = buffer;
    return buffer;
  }
  function musicChoice() {
    return document.querySelector('input[name="music"]:checked')?.value || 'none';
  }
  function playEvent(ev, when, bus) {
    let source;
    if (ev.wave === 'noise') {
      source = audioCtx.createBufferSource();
      source.buffer = noiseBuffer(audioCtx);
      source.loop = true;
    } else {
      source = audioCtx.createOscillator();
      source.type = ev.wave;
      source.frequency.setValueAtTime(ev.freq, when);
      if (ev.glideTo) source.frequency.exponentialRampToValueAtTime(ev.glideTo, when + (ev.glideTime || 0.09));
      if (ev.detune) source.detune.setValueAtTime(ev.detune, when);
      if (ev.vibrato) {
        const lfo = audioCtx.createOscillator();
        lfo.frequency.value = ev.vibrato.freq;
        const depth = audioCtx.createGain();
        depth.gain.value = ev.vibrato.cents;
        lfo.connect(depth).connect(source.detune);
        lfo.start(when);
        lfo.stop(when + ev.dur + ev.release + 0.05);
        musicNodes.sources.push(lfo);
        musicNodes.nodes.push(depth);
      }
    }
    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(ev.gain, when + ev.attack);
    env.gain.setTargetAtTime(0, when + ev.dur, ev.release / 4);
    source.connect(env);
    let tail = env;
    if (ev.filter) {
      const filter = audioCtx.createBiquadFilter();
      filter.type = ev.filter.type;
      filter.frequency.setValueAtTime(ev.filter.freq, when);
      if (ev.filter.sweepTo) filter.frequency.setTargetAtTime(ev.filter.sweepTo, when, 0.06);
      env.connect(filter);
      tail = filter;
      musicNodes.nodes.push(filter);
    }
    tail.connect(bus);
    source.start(when);
    source.stop(when + ev.dur + ev.release + 0.05);
    musicNodes.sources.push(source);
    musicNodes.nodes.push(env);
  }
  function playEvents(events, t0, offset, bus) {
    for (const ev of events) {
      if (ev.t + ev.dur <= offset) continue;
      playEvent(ev, t0 + ev.t - offset, bus);
    }
  }
  function startMusic({ offset = 0, record = false } = {}) {
    const choice = musicChoice();
    if (choice === 'none' || (choice === 'music-upload' && !userAudio)) return null;
    stopMusic();
    const context = getAudioContext();
    if (!context) return null;
    musicNodes = { sources: [], nodes: [] };
    const now = context.currentTime;
    const t0 = now + 0.05; // scheduling pre-roll
    const virtual = t0 - offset; // all automation lands at t0-relative absolute times
    const mixBus = context.createGain();
    mixBus.gain.value = 0.9;
    const compressor = context.createDynamicsCompressor();
    const fadeGain = context.createGain();
    if (offset < 0.05) {
      fadeGain.gain.setValueAtTime(0, virtual);
      fadeGain.gain.linearRampToValueAtTime(1, virtual + 0.05);
    } else fadeGain.gain.setValueAtTime(1, now);
    // The fade lands at 14.85 rather than 15.0: the recorded audio track starts
    // ~50ms after t0 and the recorder stops on a 15s wall clock, so a ramp
    // ending exactly at t0+15 would be truncated before reaching silence.
    fadeGain.gain.setValueAtTime(1, Math.max(now, virtual + 13.85));
    fadeGain.gain.linearRampToValueAtTime(0.0001, Math.max(now + 0.01, virtual + 14.85));
    const previewGain = context.createGain();
    previewGain.gain.value = 1;
    mixBus.connect(compressor).connect(fadeGain).connect(previewGain).connect(context.destination);
    musicNodes.nodes.push(mixBus, compressor, fadeGain, previewGain);
    musicNodes.fadeGain = fadeGain;
    if (record) {
      musicNodes.mediaDest = context.createMediaStreamDestination();
      fadeGain.connect(musicNodes.mediaDest);
      musicNodes.nodes.push(musicNodes.mediaDest);
    }
    if (choice === 'music-upload') {
      const source = context.createBufferSource();
      source.buffer = userAudio.buffer;
      if (userAudio.buffer.duration < 15) source.loop = true;
      source.connect(mixBus);
      source.start(t0, offset % userAudio.buffer.duration);
      source.stop(virtual + 15);
      musicNodes.sources.push(source);
    } else playEvents(TRACKS[choice].compose(), t0, offset, mixBus);
    return musicNodes;
  }
  function stopMusic() {
    if (!musicNodes) return;
    for (const source of musicNodes.sources) {
      try { source.stop(); } catch { /* Sources that already ended throw harmlessly. */ }
      try { source.disconnect(); } catch { /* Already disconnected. */ }
    }
    for (const node of musicNodes.nodes) {
      try { node.disconnect(); } catch { /* Already disconnected. */ }
    }
    musicNodes = null;
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
  }
  // Note names in comments; all frequencies are equal temperament, A4 = 440.
  function composeSunny() {
    // 128 BPM, 4/4, 8 bars = 15.0s. C major: C–G–Am–F twice.
    const beat = 0.46875;
    const events = [];
    const roots = [65.41, 98.00, 110.00, 87.31]; // C2 G2 A2 F2
    const chords = [
      [261.63, 329.63, 392.00], // C4 E4 G4
      [246.94, 293.66, 392.00], // B3 D4 G4
      [220.00, 261.63, 329.63], // A3 C4 E4
      [220.00, 261.63, 349.23]  // A3 C4 F4
    ];
    for (let bar = 0; bar < 8; bar++) {
      const start = bar * 4 * beat;
      for (const b of [0, 2]) events.push({ t: start + b * beat, dur: 0.25, wave: 'sine', freq: 150, glideTo: 45, glideTime: 0.09, gain: 0.30, attack: 0.005, release: 0.1 });
      for (const b of [0.5, 1.5, 2.5, 3.5]) events.push({ t: start + b * beat, dur: 0.05, wave: 'noise', freq: 0, gain: 0.05, attack: 0.005, release: 0.03, filter: { type: 'highpass', freq: 6000 } });
      for (const b of [0, 1.5, 2, 3]) events.push({ t: start + b * beat, dur: beat * 0.45, wave: 'triangle', freq: roots[bar % 4], gain: 0.22, attack: 0.01, release: 0.08 });
      for (const b of [1.5, 3.5]) for (const freq of chords[bar % 4]) {
        events.push({ t: start + b * beat, dur: 0.18, wave: 'square', freq, gain: 0.06, attack: 0.02, release: 0.08, filter: { type: 'lowpass', freq: 1800 } });
      }
    }
    const melody = [ // C-pentatonic phrases on bars 1, 3, 5, 7; resolves to the tonic.
      [0, [659.25, 783.99, 880.00, 783.99]], // E5 G5 A5 G5
      [2, [659.25, 523.25, 587.33, 659.25]], // E5 C5 D5 E5
      [4, [880.00, 783.99, 659.25, 783.99]], // A5 G5 E5 G5
      [6, [783.99, 659.25, 587.33, 523.25]]  // G5 E5 D5 C5
    ];
    for (const [bar, notes] of melody) notes.forEach((freq, i) => {
      events.push({ t: (bar * 4 + i) * beat, dur: beat * 0.9, wave: 'sine', freq, gain: 0.14, attack: 0.015, release: 0.12 });
    });
    return events;
  }
  function composeHearth() {
    // 96 BPM, 4/4, 6 bars = 15.0s. G major: G | Em | C | D | G | G (ring out).
    const beat = 0.625;
    const events = [];
    const arps = [ // Low, mellow fingerpicked beds (8 eighths per bar).
      [196.00, 293.66, 392.00, 246.94, 293.66, 392.00, 246.94, 293.66], // G:  G3 D4 G4 B3 D4 G4 B3 D4
      [164.81, 246.94, 329.63, 196.00, 246.94, 329.63, 196.00, 246.94], // Em: E3 B3 E4 G3 B3 E4 G3 B3
      [130.81, 196.00, 261.63, 164.81, 196.00, 261.63, 164.81, 196.00], // C:  C3 G3 C4 E3 G3 C4 E3 G3
      [146.83, 220.00, 293.66, 185.00, 220.00, 293.66, 185.00, 220.00], // D:  D3 A3 D4 F#3 A3 D4 F#3 A3
      [196.00, 293.66, 392.00, 246.94, 293.66, 392.00, 246.94, 293.66]  // G
    ];
    const bass = [[98.00, 146.83], [82.41, 123.47], [65.41, 98.00], [73.42, 110.00], [98.00, 146.83]]; // root/fifth
    const pads = [[392.00, 493.88], [329.63, 392.00], [261.63, 329.63], [293.66, 369.99], [392.00, 493.88]]; // root+third, octave up
    for (let bar = 0; bar < 5; bar++) {
      const start = bar * 4 * beat;
      arps[bar].forEach((freq, i) => {
        events.push({ t: start + i * beat / 2, dur: beat / 2, wave: 'triangle', freq, gain: 0.18, attack: 0.002, release: 0.35, filter: { type: 'lowpass', freq: 2500 } });
      });
      events.push({ t: start, dur: 2 * beat, wave: 'sine', freq: bass[bar][0], gain: 0.25, attack: 0.015, release: 0.2 });
      events.push({ t: start + 2 * beat, dur: 2 * beat, wave: 'sine', freq: bass[bar][1], gain: 0.25, attack: 0.015, release: 0.2 });
      events.push({ t: start, dur: 4 * beat, wave: 'sine', freq: pads[bar][0], detune: 4, gain: 0.05, attack: 0.8, release: 0.4 });
      events.push({ t: start, dur: 4 * beat, wave: 'sine', freq: pads[bar][1], detune: -4, gain: 0.05, attack: 0.8, release: 0.4 });
      for (const b of [1, 3]) events.push({ t: start + b * beat, dur: 0.12, wave: 'noise', freq: 0, gain: 0.03, attack: 0.01, release: 0.08, filter: { type: 'lowpass', freq: 1200 } });
    }
    // Final bar: strum-like G cluster, staggered 30ms, ringing under the fade.
    [196.00, 246.94, 293.66].forEach((freq, i) => { // G3 B3 D4
      events.push({ t: 5 * 4 * beat + i * 0.03, dur: 2, wave: 'triangle', freq, gain: 0.16, attack: 0.002, release: 1.5, filter: { type: 'lowpass', freq: 2500 } });
    });
    events.push({ t: 5 * 4 * beat, dur: 2, wave: 'sine', freq: 98.00, gain: 0.25, attack: 0.015, release: 1 });
    return events;
  }
  function composeVelvet() {
    // 96 BPM, 3/4, 8 bars = 15.0s. F major: Fmaj7 ×2 | Dm7 ×2 | Gm7 ×2 | C7 | F.
    const beat = 0.625;
    const events = [];
    const roots = [87.31, 87.31, 73.42, 73.42, 98.00, 98.00, 65.41, 87.31]; // F2 F2 D2 D2 G2 G2 C2 F2
    const chords = [
      [349.23, 440.00, 523.25, 329.63], // Fmaj7: F4 A4 C5 E4
      [349.23, 440.00, 523.25, 329.63],
      [293.66, 349.23, 440.00, 261.63], // Dm7: D4 F4 A4 C4
      [293.66, 349.23, 440.00, 261.63],
      [392.00, 466.16, 293.66, 349.23], // Gm7: G4 Bb4 D4 F4
      [392.00, 466.16, 293.66, 349.23],
      [261.63, 329.63, 392.00, 466.16], // C7: C4 E4 G4 Bb4
      [349.23, 440.00, 523.25, 698.46]  // F:  F4 A4 C5 F5
    ];
    const melody = [440.00, 523.25, 440.00, 349.23, 466.16, 587.33, 659.25, 698.46]; // A4 C5 A4 F4 Bb4 D5 E5 F5
    for (let bar = 0; bar < 8; bar++) {
      const start = bar * 3 * beat;
      events.push({ t: start, dur: 0.5, wave: 'sine', freq: roots[bar], gain: 0.22, attack: 0.02, release: 0.2 });
      for (const b of [1, 2]) for (const freq of chords[bar]) {
        events.push({ t: start + b * beat, dur: 0.4, wave: 'sine', freq, gain: 0.05, attack: 0.03, release: 0.15 });
      }
      events.push({ t: start, dur: 3 * beat * 0.9, wave: 'sine', freq: melody[bar], gain: 0.12, attack: 0.06, release: 0.25, vibrato: { freq: 5, cents: 6 } });
    }
    return events;
  }
  function composeVoltage() {
    // 160 BPM, 4/4, 10 bars = 15.0s. A minor: Am–F–C–G ×2, then Am held outro.
    const beat = 0.375;
    const events = [];
    const bassOct = [[55.00, 110.00], [43.65, 87.31], [65.41, 130.81], [49.00, 98.00]]; // A1/A2 F1/F2 C2/C3 G1/G2
    const stabs = [
      [220.00, 329.63, 440.00], // Am: A3 E4 A4
      [174.61, 261.63, 349.23], // F:  F3 C4 F4
      [261.63, 392.00, 523.25], // C:  C4 G4 C5
      [196.00, 293.66, 392.00]  // G:  G3 D4 G4
    ];
    const leads = [
      [440.00, 659.25, 880.00], // Am: A4 E5 A5
      [349.23, 523.25, 698.46], // F:  F4 C5 F5
      [261.63, 392.00, 523.25], // C:  C4 G4 C5
      [392.00, 587.33, 783.99]  // G:  G4 D5 G5
    ];
    for (let bar = 0; bar < 10; bar++) {
      const start = bar * 4 * beat;
      const chord = bar < 8 ? bar % 4 : 0; // bars 9–10: Am held
      for (let b = 0; b < 4; b++) {
        events.push({ t: start + b * beat, dur: 0.2, wave: 'sine', freq: 160, glideTo: 48, glideTime: 0.08, gain: 0.32, attack: 0.005, release: 0.08 });
      }
      for (let e = 0; e < 8; e++) {
        events.push({ t: start + e * beat / 2, dur: 0.03, wave: 'noise', freq: 0, gain: e % 2 ? 0.07 : 0.045, attack: 0.003, release: 0.02, filter: { type: 'highpass', freq: 7000 } });
        events.push({ t: start + e * beat / 2, dur: beat / 2 * 0.9, wave: 'sawtooth', freq: bassOct[chord][e % 2], gain: 0.20, attack: 0.005, release: 0.06, filter: { type: 'lowpass', freq: 1400, sweepTo: 500 } });
      }
      if (bar < 8) for (const b of [1, 3]) for (const freq of stabs[chord]) {
        events.push({ t: start + b * beat, dur: 0.1, wave: 'square', freq, gain: 0.05, attack: 0.005, release: 0.06, filter: { type: 'lowpass', freq: 2200 } });
      }
      if (bar >= 4 && bar < 8) for (let e = 0; e < 8; e++) {
        const freq = leads[chord][[0, 1, 2, 1][e % 4]];
        events.push({ t: start + e * beat / 2, dur: beat / 2 * 0.85, wave: 'square', freq, gain: 0.08, attack: 0.005, release: 0.05, filter: { type: 'lowpass', freq: 3000 } });
      }
    }
    return events;
  }
  async function uploadMusic(input) {
    if (recordingJob) return;
    clearError();
    const file = input.files[0];
    if (!file) return;
    const version = ++musicVersion;
    if (!['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave'].includes(file.type)) {
      input.value = '';
      return error('Please upload an MP3, M4A, or WAV audio file.', input);
    }
    if (file.size >= 15 * 1024 * 1024) {
      input.value = '';
      return error('Audio file size must be under 15MB.', input);
    }
    pendingUploads++;
    status('Loading audio locally…');
    try {
      // Decode locally from in-memory bytes; no network request is made.
      const decoded = await getAudioContext().decodeAudioData(await file.arrayBuffer());
      if (version !== musicVersion) return;
      // Keep at most the first 15 seconds so a large file cannot pin decoded
      // PCM in memory (parallel to the 1920px photo bitmap cap).
      const length = Math.min(decoded.length, Math.ceil(15 * decoded.sampleRate));
      const buffer = getAudioContext().createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        buffer.copyToChannel(decoded.getChannelData(channel).subarray(0, length), channel);
      }
      userAudio = { buffer, name: file.name };
      invalidateExport();
      status(`${file.name} ready. Audio stays in this browser.`);
    } catch {
      input.value = '';
      error('This audio file could not be opened. Please choose another MP3, M4A, or WAV file.', input);
    } finally { pendingUploads--; }
  }

  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }
  // One 720×1280 vignette built once at startup; drawn per frame with a single drawImage.
  const vignette = document.createElement('canvas');
  vignette.width = 720;
  vignette.height = 1280;
  {
    const vctx = vignette.getContext('2d');
    const gradient = vctx.createRadialGradient(360, 640, 340, 360, 640, 900);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,.28)');
    vctx.fillStyle = gradient;
    vctx.fillRect(0, 0, 720, 1280);
  }
  // The CTA end card's blurred hero background is pre-rendered once per hero
  // bitmap (downscale then upscale for a cheap blur) — never per frame.
  let ctaBg = null;
  let ctaBgSource = null;
  function ctaBackground(bitmap) {
    if (ctaBg && ctaBgSource === bitmap) return ctaBg;
    const small = document.createElement('canvas');
    small.width = 90;
    small.height = 160;
    const smallCtx = small.getContext('2d');
    const fit = Math.max(90 / bitmap.width, 160 / bitmap.height);
    smallCtx.drawImage(bitmap, (90 - bitmap.width * fit) / 2, (160 - bitmap.height * fit) / 2, bitmap.width * fit, bitmap.height * fit);
    const background = document.createElement('canvas');
    background.width = 720;
    background.height = 1280;
    const bgCtx = background.getContext('2d');
    bgCtx.imageSmoothingEnabled = true;
    bgCtx.imageSmoothingQuality = 'high';
    bgCtx.drawImage(small, 0, 0, 720, 1280);
    bgCtx.fillStyle = 'rgba(24,22,18,.82)';
    bgCtx.fillRect(0, 0, 720, 1280);
    ctaBg = background;
    ctaBgSource = bitmap;
    return background;
  }

  // Break long unspaced words as well as ordinary lines; measure actual glyph width.
  function wrappedLines(context, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const joined = line ? line + ' ' + word : word;
      if (context.measureText(joined).width <= maxWidth) { line = joined; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const char of word) {
        if (line && context.measureText(line + char).width > maxWidth) { lines.push(line); line = ''; }
        line += char;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawText(context, text, centerY, size = 56, color = '#ffffff', options = {}) {
    context.save();
    context.font = `800 ${size}px system-ui, sans-serif`;
    // letterSpacing must be set BEFORE measuring so wrapping stays within 608px.
    if ('letterSpacing' in context) context.letterSpacing = options.letterSpacing ?? (size >= 48 ? '-1px' : '0px');
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = color;
    if (options.alpha !== undefined) context.globalAlpha *= options.alpha;
    context.shadowColor = 'rgba(0,0,0,.55)';
    context.shadowBlur = 12;
    context.shadowOffsetY = 2;
    const lines = wrappedLines(context, text, 608);
    const lineHeight = size * 1.25;
    lines.forEach((line, index) => context.fillText(line, 360, centerY + (index - (lines.length - 1) / 2) * lineHeight));
    context.restore();
  }
  // Fade + rise a caption over the first 0.45s a scene is on screen.
  function entrance(seconds, start, window = 0.45) {
    return easeInOutSine(Math.min(1, Math.max(0, (seconds - start) / window)));
  }
  function drawScene(context, sceneIndex, seconds, list) {
    context.fillStyle = '#292824';
    context.fillRect(0, 0, 720, 1280);
    if (sceneIndex >= list.length) {
      // CTA end card: darkened blurred hero photo with a very slow eased zoom.
      const drift = 1 + .04 * easeInOutSine(Math.min(1, Math.max(0, (seconds - 12) / 3)));
      const background = ctaBackground(list[0].bitmap);
      context.drawImage(background, (720 - 720 * drift) / 2, (1280 - 1280 * drift) / 2, 720 * drift, 1280 * drift);
      context.fillStyle = '#b83b28';
      context.fillRect(0, 0, 720, 18);
      const enter = entrance(seconds, 12, .5);
      context.save();
      context.globalAlpha *= enter;
      context.fillStyle = '#e8b39a';
      context.fillRect(310, 318, 100, 3);
      context.restore();
      drawText(context, $('restaurantName').value.trim().toUpperCase(), 385, 34, '#f3d4bf', { letterSpacing: '6px', alpha: enter });
      drawText(context, $('end-caption').value.trim(), 660 + (1 - enter) * 24, 68, '#ffffff', { alpha: enter });
      return;
    }
    const duration = 12 / list.length;
    const progress = easeInOutSine(Math.min(1, Math.max(0, (seconds - sceneIndex * duration + (sceneIndex ? .5 : 0)) / (duration + (sceneIndex ? .5 : 0)))));
    const image = list[sceneIndex].bitmap;
    const motion = MOTIONS[list.length][sceneIndex];
    let zoom = 1.13;
    let x = .5;
    let y = .5;
    if (motion === 'zoom-in') zoom = 1 + .15 * progress;
    if (motion === 'zoom-out') zoom = 1.15 - .15 * progress;
    if (motion === 'pan-right') x = 1 - progress;
    if (motion === 'pan-left') x = progress;
    if (motion === 'pan-up') y = progress;
    if (motion === 'pan-down') y = 1 - progress;
    const scale = Math.max(720 / image.width, 1280 / image.height) * zoom;
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, (720 - width) * x, (1280 - height) * y, width, height);
    context.drawImage(vignette, 0, 0);
    // Barely-there warm cast to unify mixed-quality photos.
    context.globalCompositeOperation = 'overlay';
    context.fillStyle = 'rgba(255,180,120,.04)';
    context.fillRect(0, 0, 720, 1280);
    context.globalCompositeOperation = 'source-over';
    const scrim = context.createLinearGradient(0, 880, 0, 1280);
    scrim.addColorStop(0, 'rgba(0,0,0,0)');
    scrim.addColorStop(.35, 'rgba(0,0,0,.3)');
    scrim.addColorStop(.7, 'rgba(0,0,0,.5)');
    scrim.addColorStop(1, 'rgba(0,0,0,.58)');
    context.fillStyle = scrim;
    context.fillRect(0, 880, 720, 400);
    const enter = entrance(seconds, sceneIndex * duration);
    drawText(context, sceneCaptions[sceneIndex] || '', 1050 + (1 - enter) * 24, 56, '#ffffff', { alpha: enter });
  }
  function render(seconds) {
    const list = activePhotos();
    if (list.length < 3) return;
    const duration = 12 / list.length;
    const scene = seconds >= 12 ? list.length : Math.floor(Math.max(0, seconds) / duration);
    drawScene(ctx, scene, seconds, list);
    const boundary = (scene + 1) * duration;
    if (scene < list.length && seconds >= boundary - .5) {
      drawScene(layerCtx, scene + 1, seconds, list);
      ctx.globalAlpha = Math.min(1, (seconds - boundary + .5) / .5);
      ctx.drawImage(layer, 0, 0);
      ctx.globalAlpha = 1;
    }
  }
  function setPreviewTime(seconds) {
    previewSeconds = Math.min(15, Math.max(0, seconds));
    $('preview-time').value = String(previewSeconds);
    $('preview-clock').textContent = `${previewSeconds.toFixed(1)} / 15 seconds`;
    render(previewSeconds);
  }
  function stopPreview() {
    if (!recordingJob) stopMusic();
    cancelAnimationFrame(previewFrame);
    previewFrame = 0;
    $('play-preview').textContent = 'Play preview';
  }
  function togglePreview() {
    if (previewFrame) { stopPreview(); return; }
    if (musicChoice() !== 'none') startMusic({ offset: previewSeconds >= 15 ? 0 : previewSeconds });
    const start = performance.now() - (previewSeconds >= 15 ? 0 : previewSeconds * 1000);
    $('play-preview').textContent = 'Pause preview';
    const tick = now => {
      setPreviewTime((now - start) / 1000);
      if (previewSeconds < 15) previewFrame = requestAnimationFrame(tick);
      else stopPreview();
    };
    previewFrame = requestAnimationFrame(tick);
  }
  function setBusy(busy) {
    $('editor').disabled = busy;
    document.querySelectorAll('[data-step]').forEach(button => { button.disabled = busy; });
    $('recording').hidden = !busy;
    document.querySelector('.brand').toggleAttribute('inert', busy);
    $('generate').disabled = busy || !mimeType;
  }
  function cleanupJob(job) {
    stopMusic();
    cancelAnimationFrame(job.frame);
    clearTimeout(job.timer);
    clearTimeout(job.watchdog);
    if (job.stream) job.stream.getTracks().forEach(track => track.stop());
  }
  function finishJob(job) {
    if (job.finished) return;
    job.finished = true;
    cleanupJob(job);
    recordingJob = null;
    setBusy(false);
    $('generate').focus();
    if (job.cancelled) { status('Recording cancelled. Your photos and captions are ready to try again.'); return; }
    if (job.failure) { error(job.failure); status('Recording failed. You can try again.'); return; }
    const actualType = job.recorder.mimeType || mimeType;
    const blob = new Blob(job.chunks, { type: actualType });
    if (!blob.size) { error('The recording was empty. Please try again in a supported browser.'); return; }
    const extension = actualType.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm';
    exportUrl = URL.createObjectURL(blob);
    $('exported-video').src = exportUrl;
    $('download').href = exportUrl;
    $('download').download = `autopilots-promotion.${extension}`;
    $('format-note').textContent = `${extension.toUpperCase()} video (${actualType}) · 720 × 1280 · ${job.withMusic ? 'with soundtrack' : 'silent'}. ${extension === 'webm' ? 'WebM fallback: sharing-platform support varies. WebM may not report duration until playback or seeking.' : 'MP4 file ready to download.'}`;
    $('result').hidden = false;
    status(`Video ready. Recorded ${((job.stoppedAt - job.startedAt) / 1000).toFixed(1)} seconds. Download your ${extension.toUpperCase()} file below.`);
  }
  function stopRecording(reason) {
    const job = recordingJob;
    if (!job || job.stopping) return;
    job.stopping = true;
    if (reason === 'cancel') job.cancelled = true;
    else if (reason) job.failure = reason;
    job.stoppedAt = performance.now();
    cancelAnimationFrame(job.frame);
    clearTimeout(job.timer);
    try {
      if (job.recorder?.state !== 'inactive') job.recorder.stop();
      else finishJob(job);
    } catch { job.failure = 'Could not finish this recording. Please try again.'; finishJob(job); }
    job.stream?.getTracks().forEach(track => track.stop());
    if (!job.finished) job.watchdog = setTimeout(() => {
      job.failure = 'The browser did not finish the recording. Please try again.';
      finishJob(job);
    }, 5000);
  }
  function generate(event) {
    event.preventDefault();
    if (recordingJob) return;
    clearError();
    if (!validateBrief() || !validatePhotos()) return;
    if (!$('end-caption').value.trim()) return error('Missing required field: Call to Action.', $('end-caption'));
    if (!mimeType) return error(unsupported);
    if (musicChoice() === 'music-upload' && !userAudio) return error('Choose an audio file or another soundtrack option.', $('music-file'));
    const withMusic = musicChoice() !== 'none';
    if (withMusic && !audioMimeType) return error('This browser cannot record audio into the video. Choose "No music" or another browser.');
    if (document.hidden) return error('Keep this tab visible while recording.');
    stopPreview();
    invalidateExport();
    setPreviewTime(0);
    const job = { chunks: [], frame: 0, timer: 0, watchdog: 0, startedAt: 0, stoppedAt: 0, cancelled: false, finished: false, withMusic };
    recordingJob = job;
    setBusy(true);
    $('recording-progress').value = 0;
    status('Recording 0 of 15 seconds. Keep this tab visible.');
    $('cancel').focus();
    try {
      job.stream = canvas.captureStream(30);
      if (withMusic) {
        job.music = startMusic({ offset: 0, record: true });
        if (job.music) job.stream.addTrack(job.music.mediaDest.stream.getAudioTracks()[0]);
      }
      job.recorder = new MediaRecorder(job.stream, withMusic
        ? { mimeType: audioMimeType, videoBitsPerSecond: 6500000, audioBitsPerSecond: 128000 }
        : { mimeType, videoBitsPerSecond: 6500000 });
      job.recorder.ondataavailable = event => { if (event.data.size && !job.finished) job.chunks.push(event.data); };
      job.recorder.onerror = () => stopRecording('The browser could not record this video. Please try again.');
      job.recorder.onstop = () => {
        if (!job.stopping) {
          job.failure = 'The recording stopped unexpectedly. Please try again.';
          job.stoppedAt = performance.now();
        }
        finishJob(job);
      };
      job.recorder.start(250);
      job.startedAt = performance.now();
      let announcedSecond = 0;
      const tick = now => {
        if (job.stopping || job.finished) return;
        const seconds = Math.min(15, (now - job.startedAt) / 1000);
        setPreviewTime(seconds);
        $('recording-progress').value = seconds;
        const second = Math.floor(seconds);
        if (second !== announcedSecond) {
          announcedSecond = second;
          status(`Recording ${second} of 15 seconds. Keep this tab visible.`);
        }
        job.frame = requestAnimationFrame(tick);
      };
      job.frame = requestAnimationFrame(tick);
      job.timer = setTimeout(() => {
        setPreviewTime(15);
        $('recording-progress').value = 15;
        status('Finishing your video…');
        stopRecording();
      }, 15000);
    } catch {
      job.failure = 'Could not start video recording in this browser. Please try another supported browser.';
      if (job.recorder && job.recorder.state !== 'inactive') stopRecording(job.failure);
      else finishJob(job);
    }
  }

  document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => navigate(Number(button.dataset.step))));
  document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => navigate(Number(button.dataset.back))));
  $('to-photos').addEventListener('click', () => navigate(2));
  $('to-review').addEventListener('click', () => navigate(3));
  $('objective').addEventListener('change', () => {
    if (!OBJECTIVES[$('objective').value]) return;
    captionEdits = Array(5).fill(null);
    invalidateExport();
    renderPhotoSlots();
    status('Objective updated. Photos stay in order; slot guidance and default captions now follow your objective.');
  });
  for (const id of ['restaurantName', 'offer', 'cta']) {
    $(id).addEventListener('input', () => {
      $(id).value = $(id).value.slice(0, $(id).maxLength);
      $(id).removeAttribute('aria-invalid');
      if (id === 'cta') delete $('end-caption').dataset.edited;
      invalidateExport();
    });
  }
  $('end-caption').addEventListener('input', () => {
    $('end-caption').value = $('end-caption').value.slice(0, 25);
    $('end-caption').dataset.edited = 'true';
    $('end-caption').removeAttribute('aria-invalid');
    updateEndCount();
    invalidateExport();
    render(previewSeconds);
  });
  document.querySelectorAll('input[name="music"]').forEach(radio => radio.addEventListener('change', () => {
    stopPreview();
    $('music-upload-field').hidden = musicChoice() !== 'music-upload';
    invalidateExport();
  }));
  $('music-file').addEventListener('change', () => uploadMusic($('music-file')));
  $('preview-time').addEventListener('input', () => { stopPreview(); setPreviewTime(Number($('preview-time').value)); });
  $('play-preview').addEventListener('click', togglePreview);
  $('builder').addEventListener('submit', event => {
    if (currentStep < 3) { event.preventDefault(); navigate(currentStep + 1); }
    else generate(event);
  });
  $('cancel').addEventListener('click', () => stopRecording('cancel'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPreview();
      if (recordingJob) stopRecording('Recording stopped because this tab was hidden. Keep it visible and try again.');
    }
  });
  window.addEventListener('pagehide', () => {
    stopPreview();
    if (recordingJob) stopRecording('cancel');
    invalidateExport();
    photos.forEach((photo, index) => {
      uploadVersions[index]++;
      photo?.bitmap.close();
      photos[index] = null;
    });
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      renderPhotoSlots();
      showStep(1);
      status('Photos were cleared when you left this page. Add them again to create a video.');
    }
  });
  renderPhotoSlots();
})();
