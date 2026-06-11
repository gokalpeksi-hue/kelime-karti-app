// =========================================================
// ALES KART — Soru / Çözüm kartları
// Bir yüz: ALES sorusu (mor), diğer yüz: çözümü (sarı)
// =========================================================
let cards = [];
let currentIndex = 0;
let showingSolution = false;

// ——— Veri yükleme ———
async function loadCards() {
    try {
        const response = await fetch("data.json");
        cards = await response.json();
    } catch (e) {
        cards = [];
    }
    currentIndex = 0;
    showingSolution = false;
    showQuestion();
}

function deduplicateCards(arr) {
    const seen = new Set();
    return arr.filter(card => {
        const key = (card.question || '').toLowerCase().trim();
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ——— HTML kaçışı (güvenlik + düz metni koru) ———
function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// =========================================================
// EXCEL / CSV YÜKLEME — A sütunu: soru, B sütunu: çözüm
// =========================================================
document.getElementById("file-input").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    const fileStatus = document.getElementById("file-status");

    reader.onload = function (loadEvent) {
        try {
            let data;
            if (file.name.endsWith(".csv")) {
                data = XLSX.read(loadEvent.target.result, { type: "string" });
            } else {
                data = XLSX.read(loadEvent.target.result, { type: "array" });
            }

            const sheet = data.Sheets[data.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            const rows = json.filter(row => row.length >= 2 && row[0] && row[1]);

            if (rows.length === 0) {
                fileStatus.textContent = "❌ Dosyada geçerli veri bulunamadı!";
                return;
            }

            let parsed = rows.map(row => ({
                question: String(row[0]).trim(),
                solution: String(row[1]).trim()
            }));

            const total = parsed.length;
            parsed = deduplicateCards(parsed);
            cards = parsed;
            currentIndex = 0;
            showingSolution = false;
            showQuestion();

            const dedupMsg = total !== cards.length
                ? ` (${total - cards.length} tekrar temizlendi)`
                : "";
            fileStatus.textContent = `✅ ${cards.length} soru yüklendi${dedupMsg}: ${file.name}`;
        } catch (err) {
            fileStatus.textContent = "❌ Dosya okunamadı: " + err.message;
        }
    };

    if (file.name.endsWith(".csv")) {
        reader.readAsText(file, "UTF-8");
    } else {
        reader.readAsArrayBuffer(file);
    }
});

// =========================================================
// SAYAÇ
// =========================================================
function updateCounter() {
    const counter = document.getElementById("counter");
    if (cards.length > 0) {
        const label = showingSolution ? "✅ Çözüm" : "📝 Soru";
        counter.textContent = `${label} · ${currentIndex + 1} / ${cards.length}`;
    } else {
        counter.textContent = "";
    }
}

// =========================================================
// SORU / ÇÖZÜM GÖSTER
// =========================================================
function showQuestion() {
    showingSolution = false;
    const card = document.getElementById("card");
    const c = cards[currentIndex];
    if (!c) {
        card.innerHTML = `<div class="qa-empty">Henüz soru yok.<br>Excel / CSV yükleyin (A: soru, B: çözüm).</div>`;
        updateCounter();
        return;
    }
    card.innerHTML = `<div class="qa-block qa-question">
<div class="qa-label">📝 ALES SORUSU</div>
<div class="qa-text">${escapeHtml(c.question)}</div>
<div class="qa-hint">👆 Çözümü görmek için karta dokun</div>
</div>`;
    updateCounter();
}

function showSolution() {
    showingSolution = true;
    const card = document.getElementById("card");
    const c = cards[currentIndex];
    if (!c) return;
    card.innerHTML = `<div class="qa-block qa-solution">
<div class="qa-label">✅ ÇÖZÜM</div>
<div class="qa-text">${escapeHtml(c.solution)}</div>
<div class="qa-hint">👆 Soruya dönmek için karta dokun</div>
</div>`;
    updateCounter();
}

// =========================================================
// KART TIKLAMA — ÇEVİR
// =========================================================
document.getElementById("card").addEventListener("click", function () {
    if (cards.length === 0) return;
    const card = this;
    card.classList.add("flip-effect");
    setTimeout(() => {
        if (showingSolution) {
            showQuestion();
        } else {
            showSolution();
        }
        card.classList.remove("flip-effect");
    }, 300);
});

// =========================================================
// SESLENDİRME (Türkçe)
// =========================================================
function speakCurrent() {
    if (cards.length === 0) return;
    const c = cards[currentIndex];
    const text = showingSolution ? c.solution : c.question;
    if (!text) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "tr-TR";
    speech.rate = 0.95;
    const trVoice = window.speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith("tr"));
    if (trVoice) speech.voice = trVoice;
    window.speechSynthesis.speak(speech);
}

// =========================================================
// GEZİNME
// =========================================================
function goToCard(index) {
    window.speechSynthesis.cancel();
    const card = document.getElementById("card");
    card.classList.add("fade-out");
    setTimeout(() => {
        currentIndex = index;
        showQuestion();
        card.classList.remove("fade-out");
    }, 300);
}

function nextCard() {
    if (cards.length === 0) return;
    let next = currentIndex + 1;
    if (next >= cards.length) next = 0;
    goToCard(next);
}

function prevCard() {
    if (cards.length === 0) return;
    let prev = currentIndex - 1;
    if (prev < 0) prev = cards.length - 1;
    goToCard(prev);
}

document.getElementById("next-btn")?.addEventListener("click", nextCard);
document.getElementById("prev-btn")?.addEventListener("click", prevCard);
document.getElementById("speak-btn")?.addEventListener("click", function (e) {
    e.stopPropagation();
    speakCurrent();
});

// =========================================================
// KLAVYE KISAYOLLARI
// =========================================================
document.addEventListener("keydown", function (e) {
    const pageInput = document.getElementById("page-input");
    if (document.activeElement === pageInput) {
        if (e.key === "Enter") {
            const num = parseInt(pageInput.value);
            if (num >= 1 && num <= cards.length) goToCard(num - 1);
            pageInput.value = "";
        }
        return;
    }
    if (e.key === "ArrowLeft") { e.preventDefault(); prevCard(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); nextCard(); }
});

// ——— Sayfa atlama ———
document.getElementById("page-input")?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        const num = parseInt(this.value);
        if (num >= 1 && num <= cards.length) goToCard(num - 1);
        this.value = "";
    }
});

document.getElementById("page-input")?.addEventListener("blur", function () {
    this.value = "";
});

// =========================================================
// DOKUNMATİK KAYDIRMA (SWIPE)
// =========================================================
(function setupSwipeNavigation() {
    const card = document.getElementById("card");
    if (!card) return;

    let startX = 0, startY = 0, startTime = 0, tracking = false;
    const MIN_DISTANCE = 50;
    const OFF_AXIS_RATIO = 0.8;
    const MAX_DURATION = 1000;

    function swallowNextClick() {
        const handler = function (e) {
            e.stopPropagation();
            e.preventDefault();
            cleanup();
        };
        const cleanup = function () {
            document.removeEventListener("click", handler, true);
            clearTimeout(timer);
        };
        document.addEventListener("click", handler, true);
        const timer = setTimeout(cleanup, 700);
    }

    card.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) { tracking = false; return; }
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY;
        startTime = Date.now();
        tracking = true;
    }, { passive: true });

    card.addEventListener("touchend", function (e) {
        if (!tracking) return;
        tracking = false;
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const dt = Date.now() - startTime;
        if (dt > MAX_DURATION) return;
        if (Math.abs(dx) < MIN_DISTANCE) return;
        if (Math.abs(dy) > Math.abs(dx) * OFF_AXIS_RATIO) return;
        swallowNextClick();
        if (dx < 0) nextCard(); else prevCard();
    }, { passive: true });

    card.addEventListener("touchcancel", function () { tracking = false; }, { passive: true });
}());

// =========================================================
// BAŞLAT
// =========================================================
loadCards();
