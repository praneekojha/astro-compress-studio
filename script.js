const $ = (s) => document.querySelector(s);
const fmt = (b) => (b > 1048576 ? (b / 1048576).toFixed(2) + " MB" : (b / 1024).toFixed(1) + " KB");
const say = (el, t, err) => { el.textContent = t; el.className = "status" + (err ? " err" : ""); };
const tick = () => new Promise((r) => setTimeout(r));
const toBlob = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
const extOf = (type) => ({ "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }[type]);

/* Tabs and slider labels */
document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => {
  document.querySelectorAll(".tab,.panel").forEach((e) => e.classList.remove("on"));
  t.classList.add("on");
  $("#" + t.dataset.t).classList.add("on");
}));
[["pQ", "pQv"], ["vQ", "vQv"], ["sB", "sBv"]].forEach(([a, b]) => ($("#" + a).oninput = (e) => ($("#" + b).textContent = e.target.value)));

/* Photo compressor */
$("#pRun").onclick = async () => {
  const files = [...$("#pFiles").files], st = $("#pStatus"), out = $("#pOut");
  if (!files.length) return say(st, "Please choose at least one photo.", 1);
  out.innerHTML = "";
  const type = $("#pFmt").value, q = $("#pQ").value / 100, maxW = +$("#pW").value;
  let n = 0;
  for (const f of files) {
    say(st, `Compressing ${++n} of ${files.length}…`);
    try {
      const bmp = await createImageBitmap(f);
      let w = bmp.width, h = bmp.height;
      if (maxW && w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const blob = await toBlob(c, type, q);
      const saved = Math.round((1 - blob.size / f.size) * 100);
      const row = document.createElement("div");
      row.className = "row";
      const name = f.name.replace(/\.[^.]+$/, "") + "-compressed." + extOf(type);
      row.innerHTML = `<span>${f.name}<br>${fmt(f.size)} → ${fmt(blob.size)} (${saved >= 0 ? saved + "% smaller" : "larger; original was already optimized"})</span>`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name; a.textContent = "Download";
      row.appendChild(a); out.appendChild(row);
    } catch (e) { say(st, "Could not read " + f.name, 1); }
    await tick();
  }
  say(st, "Done.");
};

/* Video compressor (ffmpeg.wasm loaded only when needed) */
let ff;
const loadScript = (u) => new Promise((ok, no) => { const s = document.createElement("script"); s.src = u; s.onload = ok; s.onerror = () => no(new Error("load " + u)); document.head.appendChild(s); });
async function getFF(st) {
  if (ff) return ff;
  const cdn = "https://cdn.jsdelivr.net/npm/";
  const lib = cdn + "@ffmpeg/ffmpeg@0.12.10/dist/umd/", core = cdn + "@ffmpeg/core@0.12.6/dist/umd/";
  await loadScript(lib + "ffmpeg.js");
  await loadScript(cdn + "@ffmpeg/util@0.12.1/dist/umd/index.js");
  const { toBlobURL } = FFmpegUtil;
  ff = new FFmpegWASM.FFmpeg();
  ff.on("progress", ({ progress }) => say(st, "Compressing… " + Math.min(100, Math.round(progress * 100)) + "%"));
  await ff.load({
    coreURL: await toBlobURL(core + "ffmpeg-core.js", "text/javascript"),
    wasmURL: await toBlobURL(core + "ffmpeg-core.wasm", "application/wasm"),
    classWorkerURL: await toBlobURL(lib + "814.ffmpeg.js", "text/javascript"),
  });
  return ff;
}
$("#vRun").onclick = async () => {
  const f = $("#vFile").files[0], st = $("#vStatus"), out = $("#vOut"), btn = $("#vRun");
  if (!f) return say(st, "Please choose a video.", 1);
  btn.disabled = true; out.innerHTML = "";
  try {
    say(st, "Loading the video engine (first time only)…");
    const ffm = await getFF(st);
    const inName = "input" + (f.name.match(/\.\w+$/) || [".mp4"])[0];
    await ffm.writeFile(inName, await FFmpegUtil.fetchFile(f));
    await ffm.exec(["-i", inName, "-c:v", "libx264", "-crf", $("#vQ").value, "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "out.mp4"]);
    const data = await ffm.readFile("out.mp4");
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${f.name}<br>${fmt(f.size)} → ${fmt(blob.size)}</span><video src="${url}" controls playsinline width="100%"></video><a href="${url}" download="${f.name.replace(/\.[^.]+$/, "")}-compressed.mp4">Download</a>`;
    out.appendChild(row);
    say(st, "Done.");
    await ffm.deleteFile(inName); await ffm.deleteFile("out.mp4");
  } catch (e) { say(st, "Video compression failed. Try a shorter clip or a desktop browser.", 1); }
  btn.disabled = false;
};

/* Sky stacker */
$("#sRun").onclick = async () => {
  const files = [...$("#sFiles").files], st = $("#sStatus"), cv = $("#sCanvas"), out = $("#sOut"), btn = $("#sRun");
  if (files.length < 2) return say(st, "Please choose at least 2 photos.", 1);
  btn.disabled = true; out.innerHTML = ""; cv.hidden = true;
  const mode = $("#sMode").value, maxW = +$("#sW").value, gamma = 100 / $("#sB").value;
  let w, h, acc, n = 0;
  try {
    for (const f of files) {
      say(st, `Stacking ${++n} of ${files.length}…`);
      const bmp = await createImageBitmap(f);
      if (!acc) { w = Math.min(bmp.width, maxW); h = Math.round((bmp.height * w) / bmp.width); acc = new Float32Array(w * h * 3); }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const d = ctx.getImageData(0, 0, w, h).data;
      for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
        if (mode === "max") { for (let k = 0; k < 3; k++) if (d[i + k] > acc[j + k]) acc[j + k] = d[i + k]; }
        else { acc[j] += d[i]; acc[j + 1] += d[i + 1]; acc[j + 2] += d[i + 2]; }
      }
      await tick();
    }
    say(st, "Building final image…");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h), div = mode === "max" ? 1 : files.length;
    for (let i = 0, j = 0; i < img.data.length; i += 4, j += 3) {
      for (let k = 0; k < 3; k++) img.data[i + k] = 255 * Math.pow(acc[j + k] / div / 255, gamma);
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    cv.hidden = false;
    const blob = await toBlob(cv, "image/png");
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${files.length} photos stacked · ${w}×${h} · ${fmt(blob.size)}</span>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "astro-stack.png"; a.textContent = "Download PNG";
    row.appendChild(a); out.appendChild(row);
    say(st, "Done.");
  } catch (e) { say(st, "Stacking failed. Try a smaller max width or fewer photos.", 1); }
  btn.disabled = false;
};
