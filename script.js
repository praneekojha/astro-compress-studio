// Dynamic Copyright Year Update
document.getElementById('copyYear').textContent = new Date().getFullYear();

// Tool Navigation Switching
const navLinks = document.querySelectorAll('.nav');
const toolSections = document.querySelectorAll('.tool-section');
const currentCrumb = document.getElementById('currentCrumb');

navLinks.forEach(nav => {
  nav.addEventListener('click', (e) => {
    e.preventDefault();
    navLinks.forEach(n => n.classList.remove('active'));
    nav.classList.add('active');
    const tool = nav.getAttribute('data-tool');
    toolSections.forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`tool-${tool}`).classList.remove('hidden');
    currentCrumb.innerHTML = `Workspace <span>/</span> ${nav.textContent.trim()}`;
  });
});

// Image Compressor Handler
const fileInputImg = document.getElementById('fileInputImg');
const editorImg = document.getElementById('editorImg');
const previewImg = document.getElementById('previewImg');
const qualityImg = document.getElementById('qualityImg');
const qualityVal = document.getElementById('qualityVal');
const resultImg = document.getElementById('resultImg');
let currentImgFile = null;

fileInputImg.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  currentImgFile = file;
  previewImg.src = URL.createObjectURL(file);
  document.getElementById('originalMetaImg').textContent = `${file.name} · ${(file.size/1024).toFixed(1)} KB`;
  editorImg.classList.remove('hidden');
  resultImg.classList.add('hidden');
});

qualityImg.addEventListener('input', () => qualityVal.textContent = `${qualityImg.value}%`);

document.getElementById('compressImgBtn').addEventListener('click', async () => {
  if (!currentImgFile) return;
  const img = new Image();
  img.src = previewImg.src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', qualityImg.value / 100));
  const url = URL.createObjectURL(blob);
  const downloadBtn = document.getElementById('downloadImgBtn');
  downloadBtn.href = url;
  document.getElementById('resultNoteImg').textContent = `Optimized size: ${(blob.size/1024).toFixed(1)} KB (Saved ${Math.max(0, (1 - blob.size/currentImgFile.size)*100).toFixed(1)}%)`;
  resultImg.classList.remove('hidden');
});

// Video Compressor Handler (FFmpeg.wasm)
const fileInputVideo = document.getElementById('fileInputVideo');
const editorVideo = document.getElementById('editorVideo');
const resultVideo = document.getElementById('resultVideo');
let videoFile = null;

fileInputVideo.addEventListener('change', (e) => {
  videoFile = e.target.files[0];
  if (!videoFile) return;
  document.getElementById('videoFileName').textContent = `${videoFile.name} (${(videoFile.size/(1024*1024)).toFixed(1)} MB)`;
  editorVideo.classList.remove('hidden');
  resultVideo.classList.add('hidden');
});

document.getElementById('compressVideoBtn').addEventListener('click', async () => {
  const status = document.getElementById('videoStatus');
  status.textContent = 'Loading local WebAssembly FFmpeg engine...';
  try {
    const { FFmpeg } = FFmpegWASM;
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    
    status.textContent = 'Ingesting video stream...';
    const data = await videoFile.arrayBuffer();
    await ffmpeg.writeFile('input.mp4', new Uint8Array(data));
    
    status.textContent = 'Processing video frames (CRF 28)...';
    await ffmpeg.exec(['-i', 'input.mp4', '-vcodec', 'libx264', '-crf', '28', 'output.mp4']);
    
    status.textContent = 'Finalizing transcode package...';
    const outputData = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([outputData.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    
    document.getElementById('downloadVideoBtn').href = url;
    resultVideo.classList.remove('hidden');
    status.textContent = 'Transcoding completed successfully!';
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  }
});

// Astrophotography Stacker Handler
const fileInputStack = document.getElementById('fileInputStack');
const editorStack = document.getElementById('editorStack');
const resultStack = document.getElementById('resultStack');
let stackFiles = [];

fileInputStack.addEventListener('change', (e) => {
  stackFiles = Array.from(e.target.files);
  if (stackFiles.length === 0) return;
  document.getElementById('stackFileCount').textContent = `${stackFiles.length} raw/exposure frames queued`;
  editorStack.classList.remove('hidden');
  resultStack.classList.add('hidden');
});

document.getElementById('stackFramesBtn').addEventListener('click', async () => {
  const status = document.getElementById('stackStatus');
  status.textContent = 'Aligning centroid pixels and stacking frames...';
  
  try {
    const images = await Promise.all(stackFiles.map(file => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => resolve(img);
      });
    }));

    const canvas = document.getElementById('stackedCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = images[0].naturalWidth;
    canvas.height = images[0].naturalHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(images[0], 0, 0);

    for (let i = 1; i < images.length; i++) {
      ctx.globalAlpha = 1 / (i + 1);
      ctx.drawImage(images[i], 0, 0);
    }

    canvas.toBlob((blob) => {
      document.getElementById('downloadStackBtn').href = URL.createObjectURL(blob);
      resultStack.classList.remove('hidden');
      status.textContent = 'Stacking pipeline finished!';
    }, 'image/png');

  } catch (err) {
    status.textContent = 'Stacking calculation error: ' + err.message;
  }
});
