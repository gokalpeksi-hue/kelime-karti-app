/* Prompter — sese duyarlı teleprompter
 * - Metinler localStorage'da, video kayıtları IndexedDB'de saklanır.
 * - Ses takibi Web Speech API (tr-TR) ile yapılır; metin, konuşulan kelimeye
 *   eşlenerek konuşma hızında akar. Desteklenmeyen tarayıcıda sabit hızlı
 *   otomatik akış kullanılabilir.
 */

'use strict';

// ---------------------------------------------------------------- yardımcılar
const $ = (id) => document.getElementById(id);

function toast(msg, ms = 3000) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add('hidden'), ms);
}

function fmtTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1e3)) + ' KB';
}

// Türkçe'ye uygun kelime normalizasyonu (eşleştirme için)
function normWord(w) {
  return w.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

// İki kelime "aynı" sayılır mı? (ses tanıma hataları ve ekler için toleranslı)
function wordsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  if (len >= 4 && (a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 3) return true;
  if (len < 4) return false;
  return levenshtein(a, b) / len <= 0.3;
}

// ------------------------------------------------------------- metin deposu
const SCRIPTS_KEY = 'prompter_scripts_v1';

function loadScripts() {
  try { return JSON.parse(localStorage.getItem(SCRIPTS_KEY)) || []; }
  catch { return []; }
}

function saveScripts(list) {
  localStorage.setItem(SCRIPTS_KEY, JSON.stringify(list));
}

// ------------------------------------------------------- video kayıt deposu
const DB_NAME = 'prompter-db';
const DB_STORE = 'recordings';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(rec);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ------------------------------------------------------------------- durum
const state = {
  editingId: null,        // editörde açık metnin id'si
  activeScript: null,     // prompter'daki metin
  cameraStream: null,
  recorder: null,
  recChunks: [],
  recStartTs: 0,
  recTimerInt: null,
  autoScroll: false,
  autoScrollRaf: 0,
  voiceOn: false,
  recognition: null,
  finalTranscript: '',
  spokenCount: 0,         // işlenmiş konuşulan kelime sayısı
  wordEls: [],            // prompter'daki kelime span'leri
  wordNorms: [],
  currentIdx: -1,         // son okunan kelimenin indeksi
  wakeLock: null,
  playerUrl: null,
};

const SEARCH_AHEAD = 14; // ses eşleştirmede ileriye bakılacak kelime penceresi

// ------------------------------------------------------------------ ekranlar
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ------------------------------------------------------------------ ana ekran
function renderHome() {
  const scripts = loadScripts().sort((a, b) => b.updatedAt - a.updatedAt);
  const listEl = $('script-list');
  listEl.innerHTML = '';
  $('script-empty').classList.toggle('hidden', scripts.length > 0);

  for (const s of scripts) {
    const wc = s.text.trim() ? s.text.trim().split(/\s+/).length : 0;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-info">
        <div class="card-title"></div>
        <div class="card-meta">${wc} kelime · ${fmtDate(s.updatedAt)}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-icon act-start" title="Prompter'ı başlat">▶</button>
        <button class="btn btn-icon act-edit" title="Düzenle">✎</button>
        <button class="btn btn-icon danger act-del" title="Sil">🗑</button>
      </div>`;
    card.querySelector('.card-title').textContent = s.title || '(Başlıksız)';
    card.querySelector('.card-info').onclick = () => openEditor(s.id);
    card.querySelector('.act-edit').onclick = () => openEditor(s.id);
    card.querySelector('.act-start').onclick = () => startPrompter(s);
    card.querySelector('.act-del').onclick = () => {
      if (!confirm(`"${s.title || '(Başlıksız)'}" silinsin mi?`)) return;
      saveScripts(loadScripts().filter((x) => x.id !== s.id));
      renderHome();
    };
    listEl.appendChild(card);
  }

  renderRecordings();
}

async function renderRecordings() {
  let recs = [];
  try { recs = (await dbAll()).sort((a, b) => b.createdAt - a.createdAt); }
  catch { /* IndexedDB kullanılamıyorsa liste boş kalır */ }

  const listEl = $('recording-list');
  listEl.innerHTML = '';
  $('recording-empty').classList.toggle('hidden', recs.length > 0);

  for (const r of recs) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-info">
        <div class="card-title"></div>
        <div class="card-meta">${fmtDate(r.createdAt)} · ${fmtTime(r.duration)} · ${fmtSize(r.blob.size)}</div>
      </div>
      <div class="card-actions">
        <button class="btn btn-icon act-play" title="Oynat">▶</button>
        <button class="btn btn-icon act-dl" title="İndir">⬇</button>
        <button class="btn btn-icon danger act-del" title="Sil">🗑</button>
      </div>`;
    card.querySelector('.card-title').textContent = r.name;
    card.querySelector('.act-play').onclick = () => playRecording(r);
    card.querySelector('.act-dl').onclick = () => downloadRecording(r);
    card.querySelector('.act-del').onclick = async () => {
      if (!confirm(`"${r.name}" kaydı silinsin mi?`)) return;
      await dbDelete(r.id);
      renderRecordings();
    };
    listEl.appendChild(card);
  }
}

function recordingFileName(r) {
  const safe = (r.name || 'kayit').replace(/[^\p{L}\p{N}\- ]/gu, '').trim().replace(/\s+/g, '-');
  return `${safe || 'kayit'}.webm`;
}

function playRecording(r) {
  if (state.playerUrl) URL.revokeObjectURL(state.playerUrl);
  state.playerUrl = URL.createObjectURL(r.blob);
  $('player-video').src = state.playerUrl;
  const dl = $('player-download');
  dl.href = state.playerUrl;
  dl.download = recordingFileName(r);
  $('player-overlay').classList.remove('hidden');
}

function downloadRecording(r) {
  const url = URL.createObjectURL(r.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = recordingFileName(r);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ------------------------------------------------------------------- editör
function openEditor(id) {
  state.editingId = id || null;
  const s = id ? loadScripts().find((x) => x.id === id) : null;
  $('editor-title').value = s ? s.title : '';
  $('editor-text').value = s ? s.text : '';
  updateEditorMeta();
  showScreen('screen-editor');
  if (!s) $('editor-title').focus();
}

function updateEditorMeta() {
  const text = $('editor-text').value.trim();
  const wc = text ? text.split(/\s+/).length : 0;
  $('editor-wordcount').textContent = `${wc} kelime`;
  // ortalama konuşma temposu ~130 kelime/dk
  $('editor-duration').textContent = `~${Math.max(1, Math.round(wc / 130))} dk konuşma`;
}

function saveEditor(silent) {
  const title = $('editor-title').value.trim();
  const text = $('editor-text').value;
  if (!text.trim()) {
    if (!silent) toast('Metin boş — kaydedilecek bir şey yok.');
    return null;
  }
  const list = loadScripts();
  let s;
  if (state.editingId) {
    s = list.find((x) => x.id === state.editingId);
  }
  if (!s) {
    s = { id: 'sc_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), createdAt: Date.now() };
    list.push(s);
    state.editingId = s.id;
  }
  s.title = title || text.trim().split(/\s+/).slice(0, 5).join(' ');
  s.text = text;
  s.updatedAt = Date.now();
  saveScripts(list);
  if (!silent) toast('Metin arşive kaydedildi ✓');
  return s;
}

// ----------------------------------------------------------------- prompter
async function startPrompter(script) {
  state.activeScript = script;
  buildPrompterText(script.text);
  showScreen('screen-prompter');
  $('prompter-scroll').scrollTop = 0;
  updateVoiceStatus('kapalı');

  // ekranın kararmasını engelle
  try { state.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* opsiyonel */ }

  // kamera + mikrofon
  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    $('camera').srcObject = state.cameraStream;
    $('camera-off-note').classList.add('hidden');
  } catch (err) {
    state.cameraStream = null;
    $('camera').srcObject = null;
    $('camera-off-note').classList.remove('hidden');
    toast('Kameraya erişilemedi — yalnızca metin modundasınız. Kayıt için kamera izni gerekir.', 4500);
  }
}

function buildPrompterText(text) {
  const container = $('prompter-text');
  container.innerHTML = '';
  state.wordEls = [];
  state.wordNorms = [];
  state.currentIdx = -1;

  // paragraf yapısını koru
  for (const para of text.split(/\n+/)) {
    if (!para.trim()) continue;
    const p = document.createElement('p');
    for (const word of para.trim().split(/\s+/)) {
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = word;
      p.appendChild(span);
      p.appendChild(document.createTextNode(' '));
      state.wordEls.push(span);
      state.wordNorms.push(normWord(word));
    }
    container.appendChild(p);
  }
}

function setCurrentWord(idx) {
  if (idx <= state.currentIdx) return;
  for (let i = Math.max(0, state.currentIdx); i <= idx; i++) {
    state.wordEls[i]?.classList.remove('current');
    state.wordEls[i]?.classList.add('read');
  }
  const el = state.wordEls[idx];
  if (!el) return;
  el.classList.remove('read');
  el.classList.add('current');
  state.currentIdx = idx;

  // okunan kelimeyi okuma çizgisine (üstten %38) hizala
  const scroller = $('prompter-scroll');
  const target = el.offsetTop - scroller.clientHeight * 0.38;
  scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
}

function restartPrompterPosition() {
  for (const el of state.wordEls) el.classList.remove('read', 'current');
  state.currentIdx = -1;
  state.finalTranscript = '';
  state.spokenCount = 0;
  $('prompter-scroll').scrollTo({ top: 0, behavior: 'smooth' });
}

// ------------------------------------------------------------- ses takibi
function updateVoiceStatus(text, listening) {
  const el = $('voice-status');
  el.textContent = `🎙 ${text}`;
  el.classList.toggle('listening', !!listening);
}

function getRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function startVoiceTracking() {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    toast('Bu tarayıcı ses tanımayı desteklemiyor. Chrome/Edge deneyin veya ▶ ile sabit hızlı akışı kullanın.', 5000);
    return false;
  }
  stopAutoScroll();

  const rec = new Ctor();
  rec.lang = 'tr-TR';
  rec.continuous = true;
  rec.interimResults = true;

  state.finalTranscript = '';
  state.spokenCount = 0;

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) state.finalTranscript += res[0].transcript + ' ';
      else interim += res[0].transcript + ' ';
    }
    processSpoken(state.finalTranscript + interim);
  };

  rec.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      state.voiceOn = false;
      $('btn-voice').classList.remove('on');
      updateVoiceStatus('izin yok');
      toast('Mikrofon izni verilmedi — ses takibi kapatıldı.', 4000);
    }
    // 'no-speech' vb. geçici hatalarda onend yeniden başlatır
  };

  rec.onend = () => {
    if (state.voiceOn) {
      // tanıma servisi periyodik olarak kapanır; oturum sürerken yeniden başlat
      state.finalTranscript = '';
      state.spokenCount = 0;
      try { rec.start(); } catch { /* zaten çalışıyor */ }
    } else {
      updateVoiceStatus('kapalı');
    }
  };

  try { rec.start(); } catch { return false; }
  state.recognition = rec;
  updateVoiceStatus('dinliyor…', true);
  return true;
}

function stopVoiceTracking() {
  state.voiceOn = false;
  if (state.recognition) {
    try { state.recognition.stop(); } catch { /* yoksay */ }
    state.recognition = null;
  }
  updateVoiceStatus('kapalı');
}

// Konuşulan metni prompter'daki konuma eşle
function processSpoken(transcript) {
  const words = transcript.trim() ? transcript.trim().split(/\s+/).map(normWord).filter(Boolean) : [];
  if (words.length < state.spokenCount) state.spokenCount = words.length; // interim geri alındı

  for (let i = state.spokenCount; i < words.length; i++) {
    const spoken = words[i];
    const from = state.currentIdx + 1;
    // yalnızca ileriye doğru, dar bir pencerede ara: konuşmacı kelime atlasa da toparlar
    for (let j = from; j < Math.min(from + SEARCH_AHEAD, state.wordNorms.length); j++) {
      if (wordsMatch(spoken, state.wordNorms[j])) {
        setCurrentWord(j);
        break;
      }
    }
  }
  state.spokenCount = words.length;
}

// ------------------------------------------------------- sabit hızlı akış
function startAutoScroll() {
  stopVoiceIfOn();
  state.autoScroll = true;
  $('btn-autoscroll').classList.add('on');
  $('btn-autoscroll').textContent = '⏸';
  let last = performance.now();
  const step = (now) => {
    if (!state.autoScroll) return;
    const dt = (now - last) / 1000;
    last = now;
    const speed = Number($('slider-speed').value); // px/sn
    const scroller = $('prompter-scroll');
    scroller.scrollTop += speed * dt;
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      stopAutoScroll();
      return;
    }
    state.autoScrollRaf = requestAnimationFrame(step);
  };
  state.autoScrollRaf = requestAnimationFrame(step);
}

function stopAutoScroll() {
  state.autoScroll = false;
  cancelAnimationFrame(state.autoScrollRaf);
  $('btn-autoscroll').classList.remove('on');
  $('btn-autoscroll').textContent = '▶';
}

function stopVoiceIfOn() {
  if (state.voiceOn) {
    stopVoiceTracking();
    $('btn-voice').classList.remove('on');
  }
}

// ------------------------------------------------------------- video kaydı
function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function startRecording() {
  if (!state.cameraStream) {
    toast('Kayıt için kamera izni gerekli. Sayfayı yenileyip izin verin.', 4000);
    return;
  }
  if (typeof MediaRecorder === 'undefined') {
    toast('Bu tarayıcı video kaydını desteklemiyor.');
    return;
  }
  state.recChunks = [];
  const recorder = new MediaRecorder(state.cameraStream, { mimeType: pickMimeType() || undefined });
  recorder.ondataavailable = (e) => { if (e.data.size) state.recChunks.push(e.data); };
  recorder.onstop = onRecordingStopped;
  recorder.start(1000);
  state.recorder = recorder;
  state.recStartTs = Date.now();

  $('btn-record').classList.add('recording');
  $('btn-record').textContent = '⏹';
  $('rec-status').classList.remove('hidden');
  $('rec-timer').textContent = '00:00';
  state.recTimerInt = setInterval(() => {
    $('rec-timer').textContent = fmtTime((Date.now() - state.recStartTs) / 1000);
  }, 500);
}

function stopRecording() {
  if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
  clearInterval(state.recTimerInt);
  $('btn-record').classList.remove('recording');
  $('btn-record').textContent = '⏺';
  $('rec-status').classList.add('hidden');
}

async function onRecordingStopped() {
  const duration = (Date.now() - state.recStartTs) / 1000;
  const blob = new Blob(state.recChunks, { type: state.recorder?.mimeType || 'video/webm' });
  state.recChunks = [];
  state.recorder = null;
  if (!blob.size) { toast('Kayıt boş görünüyor, saklanmadı.'); return; }

  const rec = {
    id: 'rec_' + Date.now().toString(36),
    name: `${state.activeScript?.title || 'Konuşma'} — ${fmtDate(Date.now())}`,
    createdAt: Date.now(),
    duration,
    blob,
  };
  try {
    await dbPut(rec);
    toast('Video arşive kaydedildi ✓ Ana ekrandan indirip Drive\'a yükleyebilirsiniz.', 4500);
  } catch {
    toast('Video arşive yazılamadı — dosya indiriliyor.', 4000);
    downloadRecording(rec);
  }
}

// ------------------------------------------------------------------ kapanış
function closePrompter() {
  if (state.recorder && state.recorder.state !== 'inactive') {
    if (!confirm('Kayıt sürüyor. Kaydı bitirip çıkılsın mı?')) return;
    stopRecording();
  }
  stopVoiceIfOn();
  stopAutoScroll();
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((t) => t.stop());
    state.cameraStream = null;
  }
  $('camera').srcObject = null;
  state.wakeLock?.release?.().catch(() => {});
  state.wakeLock = null;
  restartPrompterPosition();
  showScreen('screen-home');
  renderHome();
}

// ---------------------------------------------------------------- olaylar
$('btn-new-script').onclick = () => openEditor(null);
$('btn-editor-back').onclick = () => { showScreen('screen-home'); renderHome(); };
$('btn-editor-save').onclick = () => { if (saveEditor(false)) renderHome(); };
$('editor-text').addEventListener('input', updateEditorMeta);

$('btn-editor-start').onclick = () => {
  const s = saveEditor(true);
  if (!s) { toast('Önce bir metin yazın.'); return; }
  startPrompter(s);
};

$('btn-prompter-close').onclick = closePrompter;
$('btn-restart').onclick = restartPrompterPosition;

$('btn-voice').onclick = () => {
  if (state.voiceOn) {
    stopVoiceTracking();
    $('btn-voice').classList.remove('on');
  } else {
    state.voiceOn = true;
    if (startVoiceTracking()) {
      $('btn-voice').classList.add('on');
      toast('Ses takibi açık — konuşmaya başlayın, metin sizi izleyecek. 🎙', 3500);
    } else {
      state.voiceOn = false;
    }
  }
};

$('btn-autoscroll').onclick = () => {
  if (state.autoScroll) stopAutoScroll();
  else startAutoScroll();
};

$('btn-record').onclick = () => {
  if (state.recorder && state.recorder.state !== 'inactive') stopRecording();
  else startRecording();
};

$('btn-mirror').onclick = () => {
  const on = $('prompter-text').classList.toggle('mirrored');
  $('btn-mirror').classList.toggle('on', on);
};

$('slider-font').oninput = () => {
  $('prompter-text').style.fontSize = $('slider-font').value + 'px';
};

$('slider-dim').oninput = () => {
  $('prompter-scroll').style.background = `rgba(0,0,0,${Number($('slider-dim').value) / 100})`;
};

$('player-close').onclick = () => {
  $('player-video').pause();
  $('player-video').removeAttribute('src');
  $('player-overlay').classList.add('hidden');
  if (state.playerUrl) { URL.revokeObjectURL(state.playerUrl); state.playerUrl = null; }
};

// sekme gizlenince wake lock düşer; geri gelince tazele
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && $('screen-prompter').classList.contains('active')) {
    try { state.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* opsiyonel */ }
  }
});

// ------------------------------------------------------------------ başlat
renderHome();
