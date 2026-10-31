const { createFFmpeg, fetchFile } = FFmpeg;

// Initialize FFmpeg instance with log output for debugging
const ffmpeg = createFFmpeg({
  log: true,
  corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
});

const videoInput = document.getElementById('videoInput');
const previewVideo = document.getElementById('previewVideo');
const crfRange = document.getElementById('crfRange');
const crfValue = document.getElementById('crfValue');
const compressBtn = document.getElementById('compressBtn');
const statusMessage = document.getElementById('statusMessage');
const downloadContainer = document.getElementById('downloadContainer');
const downloadBtn = document.getElementById('downloadBtn');

let selectedFile = null;

// Update UI label on CRF slider movement
crfRange.addEventListener('input', (e) => {
  crfValue.textContent = e.target.value;
});

// File upload preview handling
videoInput.addEventListener('change', (e) => {
  selectedFile = e.target.files[0];
  if (selectedFile) {
    const url = URL.createObjectURL(selectedFile);
    previewVideo.src = url;
    previewVideo.style.display = 'block';
  }
});

// Video Processing Engine
compressBtn.addEventListener('click', async () => {
  if (!selectedFile) {
    showStatus('Please select a video or image file first.', 'error');
    return;
  }

  const targetHeight = document.getElementById('resolutionSelect').value;
  const crf = crfRange.value;

  try {
    compressBtn.disabled = true;
    showStatus('Loading processing core...', 'info');

    if (!ffmpeg.isLoaded()) {
      await ffmpeg.load();
    }

    showStatus('Reading input file...', 'info');
    ffmpeg.FS('writeFile', 'input_file', await fetchFile(selectedFile));

    showStatus(`Processing video to ${targetHeight}p without dropping FPS...`, 'info');

    // Run FFmpeg CLI command inside WebAssembly
    // -r 30 ensures 30FPS stream preservation; scale=-2 keeps original aspect ratio dynamically
    await ffmpeg.run(
      '-i', 'input_file',
      '-vf', `scale=-2:${targetHeight}`,
      '-r', '30',
      '-c:v', 'libx264',
      '-crf', crf.toString(),
      '-preset', 'ultrafast', // Prevents browser memory allocation overflow crashes
      '-c:a', 'copy',
      'output.mp4'
    );

    // Read result
    const data = ffmpeg.FS('readFile', 'output.mp4');
    const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
    const downloadUrl = URL.createObjectURL(videoBlob);

    downloadBtn.href = downloadUrl;
    downloadContainer.style.display = 'block';
    showStatus('Compression Complete!', 'success');

  } catch (err) {
    console.error(err);
    showStatus('Compression failed: Memory/Load error. Try selecting a slightly higher CRF (e.g., 20) or lower resolution.', 'error');
  } finally {
    compressBtn.disabled = false;
  }
});

function showStatus(msg, type) {
  statusMessage.style.display = 'block';
  statusMessage.textContent = msg;
  statusMessage.className = `status ${type}`;
}
