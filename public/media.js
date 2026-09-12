export function drawSample(canvas) {
  const context = canvas.getContext('2d');
  context.fillStyle = '#ecf2ed';
  context.fillRect(0, 0, 2400, 1600);
  context.fillStyle = '#ffffff';
  context.fillRect(180, 120, 2040, 1360);
  context.fillStyle = '#1e473b';
  context.font = '50px sans-serif';
  context.fillText('NORTHWIND / OPERATIONS', 300, 290);
  context.font = 'bold 110px sans-serif';
  context.fillText('A quarter in view.', 300, 460);
  context.fillStyle = '#737c76';
  context.font = '38px sans-serif';
  context.fillText('ILLUSTRATIVE DATA  /  Q3 2026', 300, 555);
  const heights = [320, 480, 380, 540, 650, 580];
  heights.forEach((height, index) => {
    context.fillStyle = index === 4 ? '#d97859' : index % 2 ? '#9dbeb0' : '#226f57';
    context.fillRect(330 + index * 285, 1270 - height, 165, height);
    context.fillStyle = '#56635a';
    context.font = '32px sans-serif';
    context.fillText(['JUL 01', 'JUL 15', 'AUG 01', 'AUG 15', 'SEP 01', 'SEP 15'][index], 325 + index * 285, 1350);
  });
}

export async function sampleFile(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Unable to create the sample image.');
  return new File([blob], 'operations-report.png', { type: 'image/png' });
}

export async function sampleVideo(file, onProgress) {
  if (file.size > 50 * 1024 * 1024) throw new Error('Choose a video under 50 MB and 120 seconds.');
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  const url = URL.createObjectURL(file);
  const wait = (event) => new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, ready); video.removeEventListener('error', failed); };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('This video could not be decoded. Try MP4 or WebM.')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Video decoding timed out. Try a shorter video.')); }, 12000);
    video.addEventListener(event, ready, { once: true });
    video.addEventListener('error', failed, { once: true });
  });
  try {
    const loaded = wait('loadeddata');
    video.src = url;
    await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 120) throw new Error('Video duration must be between 0 and 120 seconds.');
    if (video.videoWidth * video.videoHeight > 24000000) throw new Error('Video frames exceed the 24-megapixel limit.');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    const count = Math.min(6, Math.max(1, Math.ceil(video.duration)));
    const frames = [];
    const timestamps = [];
    for (let index = 0; index < count; index += 1) {
      const time = video.duration * (index + 0.5) / count;
      const seeked = wait('seeked');
      video.currentTime = time;
      await seeked;
      context.drawImage(video, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (!blob || blob.size > 8 * 1024 * 1024) throw new Error('A sampled frame exceeds 8 MB. Choose a lower-resolution video.');
      frames.push(new File([blob], `frame-${index + 1}-${time.toFixed(2)}s.jpg`, { type: 'image/jpeg' }));
      timestamps.push(time);
      onProgress(`Sampling frame ${index + 1} of ${count}`);
    }
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return { files: frames, video: { name: file.name, originalBytes: file.size, duration: video.duration, timestamps, hash } };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}