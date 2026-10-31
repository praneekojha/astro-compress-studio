// Navigation Switching between Tools
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

// 1. IMAGE COMPRESSOR LOGIC
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
  document.getElementById('originalMetaImg').textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;
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
  document.getElementById('resultNoteImg').textContent = `Compressed from ${(currentImgFile.size/1024).toFixed(1)} KB to ${(blob.size/1024).toFixed(1)} KB!`;
  resultImg.classList.remove('hidden');
});

// 2. VIDEO COMPRESSOR LOGIC (FFmpeg.wasm)
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
  status.textContent = 'Loading FFmpeg engine...';
  try {
    const { FFmpeg } = FFmpegWASM;
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    
    status.textContent = 'Reading video file...';
    const data = await videoFile.arrayBuffer();
    await ffmpeg.writeFile('input.mp4', new Uint8Array(data));
    
    status.textContent = 'Compressing video (preserving FPS & CRF 28)...';
    await ffmpeg.exec(['-i', 'input.mp4', '-vcodec', 'libx264', '-crf', '28', 'output.mp4']);
    
    status.textContent = 'Generating download link...';
    const outputData = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([outputData.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    
    const downloadVideoBtn = document.getElementById('downloadVideoBtn');
    downloadVideoBtn.href = url;
    resultVideo.classList.remove('hidden');
    status.textContent = 'Compression complete!';
  } catch (err) {
    status.textContent = 'Error: ' + err.message + ' (Note: Large videos may exceed mobile browser memory limits).';
  }
});

// 3. ASTROPHOTOGRAPHY STACKER LOGIC
const fileInputStack = document.getElementById('fileInputStack');
const editorStack = document.getElementById('editorStack');
const resultStack = document.getElementById('resultStack');
let stackFiles = [];

fileInputStack.addEventListener('change', (e) => {
  stackFiles = Array.from(e.target.files);
  if (stackFiles.length === 0) return;
  document.getElementById('stackFileCount').textContent = `${stackFiles.length} frames selected for stacking`;
  editorStack.classList.remove('hidden');
  resultStack.classList.add('hidden');
});

document.getElementById('stackFramesBtn').addEventListener('click', async () => {
  const status = document.getElementById('stackStatus');
  status.textContent = 'Loading and blending star frames...';
  
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
    
    // Draw base image and blend subsequent frames with opacity to simulate stacking noise reduction
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
    ctx.drawImage(images[0], 0, 0);

    for (let i = 1; i < images.length; i++) {
      ctx.globalAlpha = 1 / (i + 1); // Average blending approximation
      ctx.drawImage(images[i], 0, 0);
    }

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      document.getElementById('downloadStackBtn').href = url;
      resultStack.classList.remove('hidden');
      status.textContent = 'Stacking finished successfully!';
    }, 'image/png');

  } catch (err) {
    status.textContent = 'Stacking error: ' + err.message;
  }
});
