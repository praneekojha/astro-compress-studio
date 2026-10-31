const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const quality = document.getElementById('quality');
const qualityValue = document.getElementById('qualityValue');
const format = document.getElementById('format');
const result = document.getElementById('result');
let selectedFile = null;
let previewUrl = null;
let outputUrl = null;

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('Please select a supported image file.');
    return;
  }
  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  document.getElementById('originalMeta').textContent =
    `${file.name} · ${formatBytes(file.size)}`;
  dropzone.classList.add('hidden');
  editor.classList.remove('hidden');
  result.classList.add('hidden');
}

fileInput.addEventListener('change', (event) => loadFile(event.target.files[0]));
['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault(); dropzone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault(); dropzone.classList.remove('dragover');
}));
dropzone.addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));
quality.addEventListener('input', () => qualityValue.textContent = `${quality.value}%`);

document.getElementById('compressBtn').addEventListener('click', async () => {
  if (!selectedFile) return;
  const button = document.getElementById('compressBtn');
  button.disabled = true;
  button.textContent = 'Compressing…';
  try {
    const image = new Image();
    image.src = previewUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    const mime = format.value;
    const qualityFactor = Number(quality.value) / 100;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mime, qualityFactor));
    if (!blob) throw new Error('This image format could not be created by your browser.');
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    const savedPercent = Math.max(0, (1 - blob.size / selectedFile.size) * 100);
    document.getElementById('beforeSize').textContent = formatBytes(selectedFile.size);
    document.getElementById('afterSize').textContent = formatBytes(blob.size);
    document.getElementById('saved').textContent = `${savedPercent.toFixed(1)}%`;
    const extension = mime.split('/')[1].replace('jpeg', 'jpg');
    const link = document.getElementById('downloadBtn');
    link.href = outputUrl;
    link.download = `astrocompress-${Date.now()}.${extension}`;
    document.getElementById('resultNote').textContent =
      blob.size < selectedFile.size ? 'Your optimized image is ready.' : 'This output is not smaller than the original. Try another quality or format.';
    result.classList.remove('hidden');
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    alert(error.message || 'Compression failed. Try another image.');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Compress image <span>→</span>';
  }
});

document.getElementById('resetBtn').addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  editor.classList.add('hidden');
  result.classList.add('hidden');
  dropzone.classList.remove('hidden');
});
