'use strict';
const $ = s => document.querySelector(s);
const fmt = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(2) + ' MB';
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Navigation, theme ---------- */
const views = [...document.querySelectorAll('.view')];
function route() {
  let id = location.hash.slice(1) || 'home';
  if (id === 'faq') id = 'about';
  if (!views.some(v => v.id === id)) id = 'home';
  views.forEach(v => v.hidden = v.id !== id);
  document.querySelectorAll('.links a[href^="#"]').forEach(a => a.classList.toggle('on', a.hash === '#' + id));
  $('#links').classList.remove('open');
  $('#burger').setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();
$('#burger').onclick = () => {
  const open = $('#links').classList.toggle('open');
  $('#burger').setAttribute('aria-expanded', open);
};
const root = document.documentElement;
try { const t = localStorage.getItem('ap-theme'); if (t) root.dataset.theme = t; } catch (e) {}
$('#theme').onclick = () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('ap-theme', root.dataset.theme); } catch (e) {}
};

/* ---------- Drop zones ---------- */
function dropzone(zone, input, onFiles, kind) {
  const take = list => {
    const files = [...list].filter(f => f.type.startsWith(kind));
    if (files.length) onFiles(files);
  };
  input.onchange = () => { take(input.files); input.value = ''; };
  zone.onclick = e => { if (e.target !== input) input.click(); };
  zone.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', e => take(e.dataTransfer.files));
}

/* ---------- Photo Compressor ---------- */
let photos = [], pUrls = [];
const ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
dropzone($('#pDrop'), $('#pFile'), f => { photos = f; runPhotos(); }, 'image/');
async function compress(file) {
  const type = $('#pFmt').value, q = $('#pQ').value / 100, maxW = +$('#pW').value;
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = maxW && bmp.width > maxW ? maxW / bmp.width : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise(r => c.toBlob(r, type, q));
  if (!blob || blob.type !== type) throw new Error('This browser cannot encode ' + type.split('/')[1].toUpperCase());
  return blob;
}
async function runPhotos() {
  pUrls.forEach(URL.revokeObjectURL); pUrls = [];
  const rows = $('#pRows'); rows.innerHTML = '';
  $('#pEmpty').hidden = photos.length > 0;
  const done = [];
  for (const f of photos) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n">${esc(f.name)}</span><span>Working…</span>`;
    rows.append(li);
    try {
      const out = await compress(f);
      const url = URL.createObjectURL(out), orig = URL.createObjectURL(f);
      pUrls.push(url, orig);
      const pct = Math.round((1 - out.size / f.size) * 100);
      const name = f.name.replace(/\.[^.]+$/, '') + '-astropress.' + ext[out.type];
      li.innerHTML = `<span class="n">${esc(f.name)}</span><span>${fmt(f.size)} → ${fmt(out.size)} <b class="${pct >= 0 ? 'good' : 'bad'}">${pct >= 0 ? '−' + pct : '+' + -pct}%</b></span><span><button type="button">Compare</button> <a href="${url}" download="${esc(name)}">Download</a></span>`;
      li.querySelector('button').onclick = () => showCmp(orig, url);
      done.push({ url, name });
      if (done.length === 1) showCmp(orig, url);
    } catch (e) {
      li.innerHTML = `<span class="n">${esc(f.name)}</span><span class="bad">Failed: ${esc(e.message || 'unreadable image')}</span>`;
    }
  }
  $('#pAll').hidden = done.length < 2;
  $('#pAll').onclick = () => done.forEach((d, i) => setTimeout(() => {
    const a = document.createElement('a'); a.href = d.url; a.download = d.name; a.click();
  }, i * 300));
}
function showCmp(a, b) {
  $('#cmp').hidden = false; $('#cmpA').src = a; $('#cmpB').src = b; $('#cmpR').value = 50; $('#cmpB').style.clipPath = 'inset(0 0 0 50%)';
}
$('#cmpR').oninput = e => $('#cmpB').style.clipPath = `inset(0 0 0 ${e.target.value}%)`;
const rerun = debounce(() => photos.length && runPhotos(), 350);
$('#pQ').oninput = e => { $('#pQv').value = e.target.value; rerun(); };
$('#pFmt').onchange = rerun; $('#pW').onchange = rerun;

/* ---------- Video Compressor ---------- */
let vFile = null, ff = null, vUrls = [];
dropzone($('#vDrop'), $('#vFile'), f => {
  vFile = f[0]; vUrls.forEach(URL.revokeObjectURL);
  const u = URL.createObjectURL(vFile); vUrls = [u];
  const v = $('#vPrev'); v.src = u; v.hidden = false;
  $('#vGo').disabled = false; $('#vOut').hidden = true; $('#vProg').hidden = true;
  $('#vMsg').textContent = `${vFile.name} (${fmt(vFile.size)}) ready.`;
}, 'video/');
$('#vQ').oninput = e => $('#vQv').value = e.target.value;
const loadScript = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the video encoder. Check your connection.'));
  document.head.append(s);
});
async function loadFF() {
  if (ff) return ff;
  const cdn = 'https://cdn.jsdelivr.net/npm/';
  await loadScript(cdn + '@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js');
  await loadScript(cdn + '@ffmpeg/util@0.12.1/dist/umd/index.js');
  const { toBlobURL } = FFmpegUtil;
  const inst = new FFmpegWASM.FFmpeg();
  inst.on('progress', ({ progress }) => { $('#vProg').value = Math.min(100, Math.max(0, progress * 100)); });
  await inst.load({
    classWorkerURL: await toBlobURL(cdn + '@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js', 'text/javascript'),
    coreURL: await toBlobURL(cdn + '@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js', 'text/javascript'),
    wasmURL: await toBlobURL(cdn + '@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm', 'application/wasm')
  });
  return ff = inst;
}
$('#vGo').onclick = async () => {
  const go = $('#vGo'), msg = $('#vMsg'), prog = $('#vProg'), out = $('#vOut');
  go.disabled = true; out.hidden = true; prog.hidden = false; prog.removeAttribute('value');
  const inName = 'input' + (vFile.name.match(/\.[^.]+$/) || ['.mp4'])[0];
  try {
    msg.textContent = 'Loading encoder (first time only)…';
    const f = await loadFF();
    prog.value = 0; msg.textContent = 'Compressing… keep this tab open.';
    await f.writeFile(inName, new Uint8Array(await vFile.arrayBuffer()));
    const code = await f.exec(['-i', inName, '-vf', `scale=-2:'min(ih,${$('#vRes').value})'`, '-c:v', 'libx264', '-crf', $('#vQ').value,
      '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'out.mp4']);
    if (code !== 0) throw new Error('The encoder could not process this video (unsupported format or not enough memory).');
    const data = await f.readFile('out.mp4');
    if (!data || !data.length) throw new Error('Encoding produced an empty file.');
    const blob = new Blob([data], { type: 'video/mp4' }), url = URL.createObjectURL(blob);
    vUrls.push(url);
    const pct = Math.round((1 - blob.size / vFile.size) * 100);
    msg.textContent = 'Done.';
    out.hidden = false;
    out.innerHTML = `<p>${fmt(vFile.size)} → <b>${fmt(blob.size)}</b> <b class="${pct >= 0 ? 'good' : 'bad'}">${pct >= 0 ? '−' + pct : '+' + -pct}%</b></p>${pct < 0 ? '<p class="muted">The result is larger than the original. Try a higher CRF or lower resolution.</p>' : ''}<a class="btn" download="${esc(vFile.name.replace(/\.[^.]+$/, ''))}-astropress.mp4" href="${url}">Download MP4</a>`;
    prog.value = 100;
    try { await f.deleteFile(inName); await f.deleteFile('out.mp4'); } catch (e) {}
  } catch (e) {
    msg.innerHTML = '<span class="bad">Compression failed: ' + esc(e.message || 'unknown error') + '</span> No output was created.';
    prog.hidden = true;
    try { ff && ff.terminate(); } catch (x) {}
    ff = null;
  }
  go.disabled = false;
};

/* ---------- Sky Stacker ---------- */
let sky = [], raw = null, sw = 0, sh = 0, sUrls = [];
dropzone($('#sDrop'), $('#sFile'), f => { sky.push(...f); drawThumbs(); }, 'image/');
function drawThumbs() {
  sUrls.forEach(URL.revokeObjectURL); sUrls = [];
  const ul = $('#sThumbs'); ul.innerHTML = '';
  sky.forEach((f, i) => {
    const u = URL.createObjectURL(f); sUrls.push(u);
    const li = document.createElement('li');
    li.innerHTML = `<img src="${u}" alt="${esc(f.name)}"><button type="button" aria-label="Remove ${esc(f.name)}">×</button>`;
    li.querySelector('button').onclick = () => { sky.splice(i, 1); drawThumbs(); };
    ul.append(li);
  });
  $('#sGo').disabled = sky.length < 2;
  $('#sMsg').textContent = sky.length < 2 ? 'Add at least 2 photos.' : `${sky.length} photos ready.`;
}
$('#sGo').onclick = async () => {
  const go = $('#sGo'), msg = $('#sMsg'); go.disabled = true;
  try {
    const mode = $('#sMode').value, maxW = +$('#sW').value;
    const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
    let acc = null;
    for (let i = 0; i < sky.length; i++) {
      msg.textContent = `Stacking ${i + 1} of ${sky.length}…`;
      await new Promise(r => setTimeout(r));
      const bmp = await createImageBitmap(sky[i], { imageOrientation: 'from-image' });
      if (!acc) {
        const k = Math.min(1, maxW / bmp.width);
        sw = c.width = Math.round(bmp.width * k); sh = c.height = Math.round(bmp.height * k);
        acc = new Float32Array(sw * sh * 4);
      }
      ctx.drawImage(bmp, 0, 0, sw, sh); bmp.close();
      const d = ctx.getImageData(0, 0, sw, sh).data;
      if (mode === 'avg') for (let j = 0; j < d.length; j++) acc[j] += d[j];
      else for (let j = 0; j < d.length; j++) if (d[j] > acc[j]) acc[j] = d[j];
    }
    if (mode === 'avg') for (let j = 0; j < acc.length; j++) acc[j] /= sky.length;
    raw = acc;
    $('#sCanvas').hidden = false; $('#sAdj').hidden = false;
    render();
    msg.textContent = `Stacked ${sky.length} photos (${sw}×${sh}). Adjust brightness and contrast, then download.`;
  } catch (e) {
    msg.innerHTML = '<span class="bad">Stacking failed: ' + esc(e.message || 'an image could not be read') + '. Try a smaller max width.</span>';
  }
  go.disabled = sky.length < 2;
};
let raf = 0;
function render() {
  if (!raw) return;
  const cv = $('#sCanvas'); cv.width = sw; cv.height = sh;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(sw, sh), o = img.data;
  const b = $('#sB').value / 100, k = $('#sC').value / 100;
  for (let i = 0; i < raw.length; i++) o[i] = i % 4 === 3 ? 255 : ((raw[i] - 128) * k + 128) * b;
  ctx.putImageData(img, 0, 0);
}
const sched = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
$('#sB').oninput = e => { $('#sBv').value = e.target.value; sched(); };
$('#sC').oninput = e => { $('#sCv').value = e.target.value; sched(); };
$('#sDl').onclick = () => $('#sCanvas').toBlob(b => {
  if (!b) { $('#sMsg').textContent = 'Export failed. Try a smaller max width.'; return; }
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = 'astropress-stack.png'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
}, 'image/png');
