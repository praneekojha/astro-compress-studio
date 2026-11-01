const $ = id => document.getElementById(id);
const els = {file:$('file'),prev:$('prev'),go:$('go'),msg:$('msg'),bar:$('bar'),pw:$('pw'),done:$('done'),stats:$('stats')};
let file = null, res = 'orig', quality = 'balanced', outBlob = null, outName = '';
$('yr').textContent = new Date().getFullYear();

function pick(groupId, cb) {
  $(groupId).addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    $(groupId).querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
    b.classList.add('on'); cb(b.dataset.v);
  });
}
pick('resChips', v => {
  res = v;
  $('resNote').textContent = v === 'orig'
    ? 'Original keeps your resolution and frame rate and only reduces file size.'
    : 'Sets the shorter side to ' + v + 'p. Never upscales. Frame rate stays the same.';
});
pick('qChips', v => quality = v);

const fmtMB = b => (b / 1048576).toFixed(1) + ' MB';
function say(t, type = '') { els.msg.hidden = false; els.msg.className = 'msg ' + type; els.msg.textContent = t; }

els.file.addEventListener('change', () => {
  file = els.file.files[0]; if (!file) return;
  els.done.hidden = true; els.msg.hidden = true; els.pw.hidden = true;
  els.prev.src = URL.createObjectURL(file); els.prev.hidden = false;
  els.prev.onloadedmetadata = () => {
    $('finfo').textContent = `${els.prev.videoWidth}×${els.prev.videoHeight} · ${Math.round(els.prev.duration)}s · ${fmtMB(file.size)}`;
  };
  $('fname').textContent = file.name;
  els.go.disabled = false; els.go.textContent = 'Compress video';
});

function pickMime() {
  const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return list.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
}

els.go.addEventListener('click', async () => {
  if (!file) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    return say('This browser cannot compress video. Please update Chrome or Safari.', 'error');
  }
  const mime = pickMime();
  els.go.disabled = true; els.done.hidden = true; els.pw.hidden = false; els.bar.style.width = '0';
  say('Preparing…');

  // Created inside the click so iOS Safari allows playback
  const v = document.createElement('video');
  v.playsInline = true; v.setAttribute('playsinline', ''); v.muted = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  v.src = URL.createObjectURL(file);
  v.play().catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(canvas);
  let ac;
  const cleanup = () => { v.remove(); canvas.remove(); try { ac && ac.close(); } catch (e) {} els.go.disabled = false; };

  try {
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('This video format cannot be read by your browser.')); });
    v.pause(); v.currentTime = 0; v.muted = false;

    let w = v.videoWidth, h = v.videoHeight;
    if (res !== 'orig') {
      const short = Math.min(w, h), t = +res;
      if (short > t) { const s = t / short; w = Math.round(w * s); h = Math.round(h * s); }
    }
    w -= w % 2; h -= h % 2;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');

    const AC = window.AudioContext || window.webkitAudioContext;
    ac = new AC(); await ac.resume();
    const dest = ac.createMediaStreamDestination();
    ac.createMediaElementSource(v).connect(dest);

    const stream = canvas.captureStream();
    dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));

    const bpp = {high: 0.16, balanced: 0.09, small: 0.05}[quality];
    const rec = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: Math.round(Math.max(1.5e6, Math.min(60e6, w * h * Math.min(info.fps || 30, 60) * bpp, {high: .9, balanced: .6, small: .35}[quality] * (file.size * 8 / (v.duration || 1)) * (w * h) / (v.videoWidth * v.videoHeight)))), audioBitsPerSecond: 160000});
    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);

    const finished = new Promise(r => rec.onstop = r);
    const draw = () => ctx.drawImage(v, 0, 0, w, h);
    const loop = () => { draw(); if (!v.ended) ('requestVideoFrameCallback' in v ? v.requestVideoFrameCallback(loop) : requestAnimationFrame(loop)); };

    v.ontimeupdate = () => {
      const p = v.duration ? v.currentTime / v.duration * 100 : 0;
      els.bar.style.width = p.toFixed(1) + '%'; say(`Compressing… ${Math.round(p)}%`);
    };
    v.onended = () => setTimeout(() => rec.state !== 'inactive' && rec.stop(), 300);

    draw(); rec.start(1000);
    await v.play(); loop();
    await finished;

    outBlob = new Blob(chunks, {type: mime.split(';')[0]});
    const ext = outBlob.type.includes('mp4') ? 'mp4' : 'webm';
    outName = file.name.replace(/\.[^.]+$/, '') + '_astropress.' + ext;
    els.bar.style.width = '100%';
    const saved = Math.round((1 - outBlob.size / file.size) * 100);
    els.stats.textContent = `Done! ${w}×${h} · ${fmtMB(file.size)} → ${fmtMB(outBlob.size)}` + (saved > 0 ? ` (${saved}% smaller)` : ' (not smaller – try Smallest or a lower resolution)');
    els.done.hidden = false; refreshSave(true); say('Compression complete.', 'ok');
  } catch (err) {
    console.error(err); say(err.message || 'Compression failed. Try a smaller video or lower resolution.', 'error');
  } finally { cleanup(); }
});

async function saveBlob(blob, name) {
  try {
    if (window.claude && claude.use) {
      const d = await claude.use('downloads');
      if (d) { await d.save({filename: name, data: blob}); return true; }
    }
  } catch (e) { if (e && e.code === 'declined') return false; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); return true;
}
$('save').addEventListener('click', async () => { if (outBlob && await saveBlob(outBlob, outName)) say('Saved.', 'ok'); });
$('gallery').addEventListener('click', async () => {
  if (!outBlob) return;
  const f = new File([outBlob], outName, {type: outBlob.type});
  if (navigator.canShare && navigator.canShare({files: [f]})) {
    try { await navigator.share({files: [f]}); say('Choose "Save Video" to add it to your gallery.', 'ok'); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  if (await saveBlob(outBlob, outName)) say('Saved.', 'ok');
});

// ---------- Tabs ----------
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  $('tabs').querySelectorAll('.chip').forEach(c => c.classList.remove('on')); b.classList.add('on');
  document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== b.dataset.p);
});
const note = (id, t, type = '') => { const m = $(id); m.hidden = false; m.className = 'msg ' + type; m.textContent = t; };
const toBlob = (c, t, q) => new Promise(r => c.toBlob(r, t, q));
const baseName = f => f.name.replace(/\.[^.]+$/, '');

// ---------- Photo compressor ----------
$('pq').oninput = e => $('pqv').textContent = e.target.value;
$('pfile').onchange = () => {
  const n = $('pfile').files.length;
  $('pname').textContent = n ? n + ' photo' + (n > 1 ? 's' : '') + ' selected' : 'Choose photos';
  $('pgo').disabled = !n; $('pgo').textContent = n ? 'Compress photos' : 'Choose photos first';
};
$('pgo').onclick = async () => {
  const fs = [...$('pfile').files], max = +$('pmax').value, q = $('pq').value / 100, list = $('plist');
  list.innerHTML = ''; $('pgo').disabled = true;
  for (let i = 0; i < fs.length; i++) {
    note('pmsg', `Processing ${i + 1} of ${fs.length}…`);
    try {
      const b = await createImageBitmap(fs[i]);
      const s = max ? Math.min(1, max / Math.max(b.width, b.height)) : 1;
      const c = document.createElement('canvas'); c.width = Math.round(b.width * s); c.height = Math.round(b.height * s);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0, c.width, c.height);
      const o = await toBlob(c, 'image/jpeg', q);
      const r = document.createElement('div'); r.className = 'row';
      const t = document.createElement('span'); t.textContent = `${fs[i].name}: ${fmtMB(fs[i].size)} → ${fmtMB(o.size)}`;
      const nm = baseName(fs[i]) + '_astropress.jpg'; const a = document.createElement('button'); a.className = 'mini'; a.textContent = 'Save'; a.onclick = () => saveBlob(o, nm);
      r.append(t, a); list.appendChild(r);
    } catch (e) { note('pmsg', 'Could not read ' + fs[i].name, 'error'); }
  }
  note('pmsg', 'Done.', 'ok'); $('pgo').disabled = false;
};

// ---------- Sky stacker ----------
$('sfile').onchange = () => {
  const n = $('sfile').files.length;
  $('sname').textContent = n ? n + ' photos selected' : 'Choose 2 or more photos';
  $('sgo').disabled = n < 2; $('sgo').textContent = n < 2 ? 'Choose 2 or more photos' : 'Stack photos';
};
$('sgo').onclick = async () => {
  const fs = [...$('sfile').files], mode = $('smode').value; $('sgo').disabled = true; $('sres').hidden = true;
  try {
    const first = await createImageBitmap(fs[0]);
    const s = Math.min(1, 3000 / Math.max(first.width, first.height));
    const w = Math.round(first.width * s), h = Math.round(first.height * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', {willReadFrequently: true});
    const acc = mode === 'avg' ? new Float32Array(w * h * 4) : new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < fs.length; i++) {
      note('smsg', `Stacking ${i + 1} of ${fs.length}…`);
      const b = await createImageBitmap(fs[i]); x.drawImage(b, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data;
      if (mode === 'avg') for (let j = 0; j < d.length; j++) acc[j] += d[j];
      else for (let j = 0; j < d.length; j++) if (d[j] > acc[j]) acc[j] = d[j];
      await new Promise(r => setTimeout(r));
    }
    const out = x.createImageData(w, h);
    for (let j = 0; j < out.data.length; j++) out.data[j] = mode === 'avg' ? acc[j] / fs.length : acc[j];
    x.putImageData(out, 0, 0);
    const blob = await toBlob(c, 'image/png');
    $('sout').src = URL.createObjectURL(blob); $('ssave').onclick = () => saveBlob(blob, 'astropress_stack.png');
    $('sres').hidden = false; note('smsg', `Done! Stacked ${fs.length} photos (${w}×${h}).`, 'ok');
  } catch (e) { note('smsg', 'Stacking failed. Try fewer or smaller photos.', 'error'); }
  $('sgo').disabled = false;
};

// ---------- Language (English / Nepali) + theme ----------
const D = {
"Compressor":"कम्प्रेसर","Features":"सुविधाहरू","FAQ":"प्रश्नोत्तर","Privacy":"गोपनीयता",
"100% FREE · NO UPLOAD":"१००% निःशुल्क · अपलोड छैन","Shrink video.":"भिडियो सानो बनाउनुहोस्।","Keep the magic.":"गुणस्तर जोगाउनुहोस्।",
"Compress right in your browser on iPhone, Android and desktop. Your files never leave your device.":"आइफोन, एन्ड्रोइड र कम्प्युटरमा ब्राउजरमै कम्प्रेस गर्नुहोस्। तपाईंका फाइलहरू कहिल्यै तपाईंको डिभाइसबाट बाहिर जाँदैनन्।",
"Start compressing":"कम्प्रेस सुरु गर्नुहोस्","🎬 Video":"🎬 भिडियो","🖼️ Photo":"🖼️ फोटो","🌌 Sky stacker":"🌌 आकाश स्ट्याकर",
"ENCODE VIDEO":"भिडियो इन्कोड","Compress video":"भिडियो कम्प्रेस गर्नुहोस्","Pick an output size, then choose a quality level.":"आउटपुट साइज छान्नुहोस्, त्यसपछि गुणस्तर छान्नुहोस्।",
"Original":"मूल","same quality + FPS":"उही गुणस्तर + FPS","Original keeps your resolution and frame rate and only reduces file size.":"मूल विकल्पले रिजोल्युसन र फ्रेम रेट जोगाउँछ, फाइल साइज मात्र घटाउँछ।",
"High":"उच्च","Balanced":"सन्तुलित","Smallest":"सबैभन्दा सानो","Choose video":"भिडियो छान्नुहोस्","Choose a video first":"पहिले भिडियो छान्नुहोस्",
"Tip: keep this tab open and on screen while processing. It runs at the video's normal playback speed.":"सुझाव: प्रोसेस हुँदा यो ट्याब खुला र स्क्रिनमा राख्नुहोस्। यो भिडियोको सामान्य गतिमा चल्छ।",
"Save Video to Gallery":"भिडियो ग्यालरीमा सेभ गर्नुहोस्","Save to Folder (Files)":"फोल्डरमा सेभ गर्नुहोस् (Files)","Allow saving?":"सेभ गर्न अनुमति दिने?","AstroPress needs your permission to save the compressed file to your device. We ask only once.":"कम्प्रेस गरिएको फाइल तपाईंको डिभाइसमा सेभ गर्न AstroPress लाई तपाईंको अनुमति चाहिन्छ। हामी एक पटक मात्र सोध्छौं।","Allow":"अनुमति दिनुहोस्","Not now":"अहिले होइन","Allow saving":"सेभ गर्न अनुमति दिनुहोस्","☀️ Day":"☀️ दिन","🌙 Night":"🌙 रात","Video info":"भिडियो जानकारी","QUALITY":"गुणस्तर","RESOLUTION":"रिजोल्युसन","FORMAT":"ढाँचा","DURATION":"अवधि","BITRATE":"बिटरेट","CODEC":"कोडेक","VIDEO SIZE":"भिडियो साइज","Save":"सेभ",
"COMPRESS PHOTO":"फोटो कम्प्रेस","Compress photos":"फोटो कम्प्रेस गर्नुहोस्","Shrink JPG, PNG or WebP files. Output is JPG. Never upscales.":"JPG, PNG वा WebP फाइल सानो बनाउनुहोस्। आउटपुट JPG हुन्छ। कहिल्यै ठूलो बनाइँदैन।",
"Longest side":"सबैभन्दा लामो किनारा","Original size":"मूल साइज","Quality:":"गुणस्तर:","Choose photos":"फोटोहरू छान्नुहोस्","Choose photos first":"पहिले फोटो छान्नुहोस्",
"ASTROPHOTOGRAPHY":"खगोल फोटोग्राफी","Sky stacker":"आकाश स्ट्याकर",
"Join several sky photos into one cleaner image. Best for tripod or tracker shots taken from the same spot.":"धेरै आकाशका फोटोलाई एउटै सफा तस्वीरमा जोड्नुहोस्। एउटै ठाउँबाट ट्राइपड वा ट्र्याकरमा लिइएका फोटोका लागि उत्तम।",
"Method":"विधि","Average – less noise, clearer sky":"औसत – कम नोइज, सफा आकाश","Lighten – star trails":"लाइटेन – तारा रेखा (स्टार ट्रेल)",
"Choose 2 or more photos":"२ वा बढी फोटो छान्नुहोस्","Stack photos":"फोटो स्ट्याक गर्नुहोस्","Save stacked image":"स्ट्याक गरिएको तस्वीर सेभ गर्नुहोस्",
"🔒 Private":"🔒 गोपनीय","Everything runs on your device. No uploads, no accounts, no tracking.":"सबै कुरा तपाईंकै डिभाइसमा चल्छ। अपलोड, खाता वा ट्र्याकिङ छैन।",
"🎞️ Original FPS":"🎞️ मूल FPS","Frame rate is preserved. Resolution is never upscaled.":"फ्रेम रेट जोगिन्छ। रिजोल्युसन कहिल्यै ठूलो बनाइँदैन।",
"📱 Works everywhere":"📱 सबै ठाउँमा चल्छ","Chrome, Safari, Edge, Firefox on phone and desktop.":"फोन र कम्प्युटरमा Chrome, Safari, Edge, Firefox।",
"How it works":"यो कसरी काम गर्छ","Choose Original or a target size (4K, 2K, 1080p, 720p).":"मूल वा लक्षित साइज (4K, 2K, 1080p, 720p) छान्नुहोस्।",
"Pick a quality and select your video.":"गुणस्तर छानेर आफ्नो भिडियो चयन गर्नुहोस्।","Tap compress, then save to Gallery or Files.":"कम्प्रेस थिच्नुहोस्, अनि ग्यालरी वा फाइलमा सेभ गर्नुहोस्।",
"Is it really free?":"के यो साँच्चै निःशुल्क छ?","Yes. No limits, watermarks or sign-up.":"हो। कुनै सीमा, वाटरमार्क वा साइन-अप छैन।",
"Why does it take as long as the video?":"किन भिडियोको जतिकै समय लाग्छ?","For compatibility with Safari and Chrome, the video is re-recorded at normal speed. A 2-minute clip takes about 2 minutes.":"Safari र Chrome सँग मिल्नका लागि भिडियो सामान्य गतिमा पुनः रेकर्ड गरिन्छ। २ मिनेटको क्लिपलाई करिब २ मिनेट लाग्छ।",
"Why is my result MP4 or WebM?":"मेरो नतिजा किन MP4 वा WebM हुन्छ?","Safari and recent Chrome save MP4. Older browsers may save WebM.":"Safari र नयाँ Chrome ले MP4 सेभ गर्छन्। पुराना ब्राउजरले WebM सेभ गर्न सक्छन्।",
"Can it make a video bigger?":"के यसले भिडियो ठूलो बनाउन सक्छ?","No. Choosing a size larger than your video keeps the original size.":"सक्दैन। भिडियोभन्दा ठूलो साइज छान्दा मूल साइज नै रहन्छ।",
"Privacy & Terms":"गोपनीयता र सर्तहरू",'AstroPress processes files locally in your browser. We do not upload, store or view your media. The service is provided "as is" without warranty. Always keep a backup of your original files.':'AstroPress ले फाइलहरू तपाईंकै ब्राउजरमा प्रोसेस गर्छ। हामी तपाईंको मिडिया अपलोड, भण्डारण वा हेर्दैनौं। सेवा "जस्तो छ त्यस्तै" कुनै ग्यारेन्टी बिना उपलब्ध गराइएको छ। सधैं आफ्ना मूल फाइलहरूको ब्याकअप राख्नुहोस्।',
"AstroPress. All rights reserved. Created by Pranik Ojha.":"AstroPress. सर्वाधिकार सुरक्षित। निर्माता: प्रनिक ओझा।","All trademarks and brand names belong to their respective owners.":"सबै ट्रेडमार्क र ब्रान्ड नामहरू तिनका सम्बन्धित मालिकका हुन्।",
"Preparing…":"तयारी हुँदैछ…","Compression complete.":"कम्प्रेस सम्पन्न भयो।","Saved.":"सेभ भयो।","Done.":"सम्पन्न।",
"This browser cannot compress video. Please update Chrome or Safari.":"यो ब्राउजरले भिडियो कम्प्रेस गर्न सक्दैन। कृपया Chrome वा Safari अपडेट गर्नुहोस्।",
"This video format cannot be read by your browser.":"तपाईंको ब्राउजरले यो भिडियो ढाँचा पढ्न सक्दैन।","Compression failed. Try a smaller video or lower resolution.":"कम्प्रेस असफल भयो। सानो भिडियो वा कम रिजोल्युसन प्रयोग गर्नुहोस्।",
"Stacking failed. Try fewer or smaller photos.":"स्ट्याक असफल भयो। कम वा सानो फोटो प्रयोग गर्नुहोस्।",'Choose "Save Video" to add it to your gallery.':'ग्यालरीमा थप्न "Save Video" छान्नुहोस्।'
};
const P = [
[/^Compressing… (\d+)%$/, m => `कम्प्रेस हुँदै… ${m[1]}%`],
[/^Done! (.*?)( \((\d+)% smaller\)| \(not smaller – try Smallest or a lower resolution\))$/, m => `सम्पन्न! ${m[1]}` + (m[3] ? ` (${m[3]}% सानो)` : ' (सानो भएन – सबैभन्दा सानो वा कम रिजोल्युसन प्रयोग गर्नुहोस्)')],
[/^Processing (\d+) of (\d+)…$/, m => `प्रोसेस हुँदै… ${m[1]} / ${m[2]}`],
[/^Stacking (\d+) of (\d+)…$/, m => `स्ट्याक हुँदै… ${m[1]} / ${m[2]}`],
[/^Done! Stacked (\d+) photos \((.+)\)\.$/, m => `सम्पन्न! ${m[1]} फोटो स्ट्याक भयो (${m[2]})।`],
[/^(\d+) photos? selected$/, m => `${m[1]} फोटो छानियो`],
[/^Could not read (.+)$/, m => `पढ्न सकिएन: ${m[1]}`],
[/^Sets the shorter side to (\d+)p\. Never upscales\. Frame rate stays the same\.$/, m => `छोटो किनारा ${m[1]}p मा सेट हुन्छ। कहिल्यै ठूलो बनाइँदैन। फ्रेम रेट उही रहन्छ।`]
];
const R = {}; for (const k in D) R[D[k]] = k;
const norm = s => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
const pat = k => { for (const [re, f] of P) { const m = k.match(re); if (m) return f(m); } };
const orig = new WeakMap(); let lang = 'en';
function setNode(n) {
  let o = orig.get(n);
  if (o === undefined) {
    const k = norm(n.data); if (!k) return;
    o = (D[k] !== undefined || pat(k)) ? k : R[k]; if (o === undefined) return;
    orig.set(n, o);
  }
  const out = lang === 'ne' ? (D[o] ?? pat(o) ?? o) : o;
  if (norm(n.data) !== norm(out)) { const m = n.data.match(/^(\s*)[\s\S]*?(\s*)$/); n.data = m[1] + out + m[2]; }
}
function apply() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), list = []; let n;
  while ((n = w.nextNode())) if (!/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) list.push(n);
  list.forEach(setNode);
  document.documentElement.lang = lang;
  document.querySelectorAll('#langSeg button').forEach(b => b.classList.toggle('on', b.dataset.l === lang));
}
const watch = () => mo.observe(document.body, {childList: true, characterData: true, subtree: true});
const mo = new MutationObserver(() => { mo.disconnect(); apply(); watch(); });
function setLang(l) { lang = l; try { localStorage.setItem('ap_lang', l); } catch (e) {} mo.disconnect(); apply(); watch(); }
$('langSeg').onclick = e => { const b = e.target.closest('button'); if (b) setLang(b.dataset.l); };
const root = document.documentElement;
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
const paintTheme = () => document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('on', (b.dataset.t === 'dark') === isDark()));
try { const t = localStorage.getItem('ap_theme'); if (t) root.dataset.theme = t; } catch (e) {}
$('themeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; root.dataset.theme = b.dataset.t; try { localStorage.setItem('ap_theme', b.dataset.t); } catch (e) {} paintTheme(); };
paintTheme();
let saved = 'en'; try { saved = localStorage.getItem('ap_lang') || 'en'; } catch (e) {}
setLang(saved);

// ---------- One-time save permission ----------
let granted = false; try { granted = localStorage.getItem('ap_perm') === '1'; } catch (e) {}
function refreshSave(ask) { $('saveOpts').hidden = !granted; $('askBtn').hidden = granted; $('perm').hidden = granted || !ask; }
$('permYes').onclick = () => { granted = true; try { localStorage.setItem('ap_perm', '1'); } catch (e) {} refreshSave(false); };
$('permNo').onclick = () => refreshSave(false);
$('askBtn').onclick = () => refreshSave(true);

// ---------- Video info ----------
let info = {};
const fmtDur = s => { const t = Math.round(s); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const snapFps = x => x ? [24, 25, 30, 48, 50, 60, 90, 120].reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a) : 0;
async function codecOf(f) {
  try {
    const dec = new TextDecoder('latin1');
    let t = dec.decode(await f.slice(0, 4e6).arrayBuffer());
    if (f.size > 4e6) t += dec.decode(await f.slice(-4e6).arrayBuffer());
    const L = [['hvc1', 'H.265'], ['hev1', 'H.265'], ['av01', 'AV1'], ['avc1', 'H.264'], ['vp09', 'VP9'], ['V_MPEGH/ISO/HEVC', 'H.265'], ['V_MPEG4/ISO/AVC', 'H.264'], ['V_VP9', 'VP9'], ['V_VP8', 'VP8'], ['V_AV1', 'AV1']];
    for (const [k, n] of L) if (t.includes(k)) return n;
  } catch (e) {}
  return '—';
}
function measureFps(url) {
  return new Promise(res => {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = url;
    if (!('requestVideoFrameCallback' in v)) return res(0);
    let n = 0, t0 = 0, t1 = 0, fin = false;
    const done = () => { if (fin) return; fin = true; v.pause(); res(n > 2 && t1 > t0 ? (n - 1) / (t1 - t0) : 0); };
    const cb = (now, m) => { if (!n) t0 = m.mediaTime; t1 = m.mediaTime; if (++n >= 20) return done(); v.requestVideoFrameCallback(cb); };
    v.requestVideoFrameCallback(cb);
    v.play().catch(() => done());
    setTimeout(done, 3500);
  });
}
els.file.addEventListener('change', async () => {
  const f = els.file.files[0]; if (!f) return; info = {};
  const url = URL.createObjectURL(f), v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.src = url;
  try { await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = no; }); } catch (e) { return; }
  const w = v.videoWidth, h = v.videoHeight, d = v.duration, sh = Math.min(w, h);
  info = {w, h, dur: d, fps: 0};
  const set = (id, t) => $(id).textContent = t;
  set('iq', sh >= 2160 ? '4K' : sh >= 1440 ? '2K' : sh >= 1080 ? '1080p' : sh >= 720 ? '720p' : sh + 'p');
  set('ir', `${w}×${h}`); set('ifps', '…'); set('ifm', (f.name.split('.').pop() || '').toUpperCase());
  set('idur', fmtDur(d)); set('ib', (f.size * 8 / d / 1e6).toFixed(2) + ' Mbps'); set('ic', '…'); set('is', fmtMB(f.size));
  $('vinfo').hidden = false;
  codecOf(f).then(c => set('ic', c));
  measureFps(url).then(x => { info.fps = snapFps(x); set('ifps', info.fps ? info.fps + ' fps' : '—'); });
});
