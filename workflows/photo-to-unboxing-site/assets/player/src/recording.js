/** Records the rendered 3D canvas only. UI controls and audio are not captured. */
export function setupRecording({ canvas, button, status, labels } = {}) {
  const copy = {
    zh: {
      idle: '录制开盒',
      recording: '停止并保存',
      preparing: '正在准备录制…',
      saving: '正在保存录像…',
      started: '录制已开始，仅记录 3D 画面。再次点击即可停止并下载。',
      saved: '录像已下载。',
      unsupported: '当前浏览器不支持画布录制，可使用系统录屏。',
      failed: '录制未成功，请重试或使用系统录屏。',
      empty: '没有录到有效画面，请稍等片刻后再停止，或使用系统录屏。',
    },
    en: {
      idle: 'Record opening',
      recording: 'Stop & save',
      preparing: 'Preparing recording…',
      saving: 'Saving recording…',
      started: 'Recording the 3D canvas only. Click again to stop and download.',
      saved: 'Recording downloaded.',
      unsupported: 'Canvas recording is unavailable in this browser. Use your system screen recorder.',
      failed: 'Recording failed. Try again or use your system screen recorder.',
      empty: 'No video frames were recorded. Wait a moment before stopping, or use your system screen recorder.',
    },
  };
  const text = () => copy[typeof labels === 'function' && labels() === 'zh' ? 'zh' : 'en'];
  const supported = Boolean(canvas && typeof canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined');
  let recorder = null;
  let stream = null;
  let chunks = [];
  let state = 'idle';
  let failed = false;
  let destroyed = false;
  let stopTimer = null;
  let session = 0;
  const downloads = new Map();

  function notify(key) {
    if (!destroyed && typeof status === 'function') status(text()[key]);
  }

  function refresh() {
    if (!button) return;
    button.hidden = !supported || destroyed;
    button.disabled = state === 'preparing' || state === 'saving';
    button.dataset.recording = String(state === 'recording');
    button.setAttribute('aria-pressed', String(state === 'recording'));
    const label = text()[state === 'recording' ? 'recording' : state === 'preparing' ? 'preparing' : state === 'saving' ? 'saving' : 'idle'];
    button.textContent = label;
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  function releaseStream() {
    clearTimeout(stopTimer);
    stopTimer = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.onended = null;
        track.stop();
      }
    }
    stream = null;
  }

  function clearRecorder() {
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
    }
    recorder = null;
    chunks = [];
    releaseStream();
    state = 'idle';
    refresh();
  }

  function preferredType() {
    if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
    for (const type of [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
    ]) {
      try { if (MediaRecorder.isTypeSupported(type)) return type; } catch { /* Try the next browser-supported container. */ }
    }
    return '';
  }

  function downloadVideo(blob) {
    const extension = /mp4/i.test(blob.type) ? 'mp4' : 'webm';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `unboxing-${timestamp}.${extension}`;
    link.hidden = true;
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); }
    // Keep the blob URL alive long enough for browsers to start their download.
    const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 60_000);
    downloads.set(url, timer);
  }

  function finish(currentSession) {
    if (currentSession !== session || destroyed) return;
    const type = recorder?.mimeType || chunks.find(chunk => chunk.type)?.type || 'video/webm';
    const blob = new Blob(chunks, { type });
    const wasFailed = failed;
    clearRecorder();
    if (wasFailed) { notify('failed'); return; }
    if (!blob.size) { notify('empty'); return; }
    try { downloadVideo(blob); notify('saved'); } catch { notify('failed'); }
  }

  function stop() {
    if (!recorder || state === 'saving' || state === 'idle') return;
    state = 'saving';
    refresh();
    const currentSession = session;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
      else finish(currentSession);
      // A broken recorder must not leave a live capture track behind.
      if (state === 'saving') stopTimer = setTimeout(() => {
        if (session !== currentSession || state !== 'saving') return;
        clearRecorder();
        notify('failed');
      }, 4_000);
    } catch {
      clearRecorder();
      notify('failed');
    }
  }

  function start() {
    if (destroyed || !supported || state !== 'idle') return;
    state = 'preparing';
    failed = false;
    chunks = [];
    refresh();
    const currentSession = ++session;
    try {
      stream = canvas.captureStream(30);
      // captureStream normally produces video only; explicitly reject any audio.
      for (const track of stream.getAudioTracks()) { stream.removeTrack(track); track.stop(); }
      if (!stream.getVideoTracks().length) throw new Error('No canvas video track');
      const mimeType = preferredType();
      const options = { videoBitsPerSecond: 6_000_000, ...(mimeType ? { mimeType } : {}) };
      try { recorder = new MediaRecorder(stream, options); }
      catch { recorder = new MediaRecorder(stream); }
      recorder.ondataavailable = event => {
        if (session === currentSession && !destroyed && event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = () => finish(currentSession);
      recorder.onerror = () => {
        if (currentSession !== session || destroyed) return;
        failed = true;
        if (recorder?.state !== 'inactive') stop();
        else { clearRecorder(); notify('failed'); }
      };
      for (const track of stream.getVideoTracks()) track.onended = () => {
        if (currentSession === session && !destroyed) stop();
      };
      recorder.start(250);
      state = 'recording';
      refresh();
      notify('started');
    } catch {
      clearRecorder();
      notify('failed');
    }
  }

  function onClick() {
    if (!supported) { notify('unsupported'); return; }
    if (state === 'recording') stop();
    else if (state === 'idle') start();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    session++;
    button?.removeEventListener('click', onClick);
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* Tracks still get released below. */ }
    }
    clearRecorder();
    for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); }
    downloads.clear();
  }

  button?.addEventListener('click', onClick);
  refresh();
  return { refresh, stop, destroy, supported, get recording() { return state === 'recording'; } };
}
