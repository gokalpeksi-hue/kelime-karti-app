let cards = [];
let currentIndex = 0;
let showingTurkish = false;
let femaleVoice = null;
let maleVoice = null;

// ——— Önbellekler ———
const wordCache = {};       // İngilizce → Türkçe çeviri
const defCache = {};        // İngilizce → sözlük tanımları ({ data: [], promise: Promise } yapısında)

// ——— Zamanlayıcılar ———
let hideTooltipTimer = null;
let hoverTimer = null;

// =========================================================
//  VERİ YÜKLEME
// =========================================================

async function loadCards() {
    const response = await fetch("data.json");
    cards = await response.json();
    loadVoices();
}

function deduplicateCards(arr) {
    const seen = new Set();
    return arr.filter(card => {
        const key = card.english.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ——— Excel / CSV yükleme ———
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
                english: String(row[0]).trim(),
                turkish: String(row[1]).trim()
            }));

            const uniqueCount = parsed.length;
            parsed = deduplicateCards(parsed);

            cards = parsed;
            currentIndex = 0;
            showEnglish();

            const dedupMsg = uniqueCount !== cards.length
                ? ` (${uniqueCount - cards.length} tekrar temizlendi)`
                : "";
            fileStatus.textContent = `✅ ${cards.length} benzersiz kelime yüklendi${dedupMsg}: ${file.name}`;
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
//  SES
// =========================================================

function loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        assignVoices(voices);
        showEnglish();
    } else {
        window.speechSynthesis.onvoiceschanged = () => {
            const allVoices = window.speechSynthesis.getVoices();
            assignVoices(allVoices);
            showEnglish();
        };
    }
}

function assignVoices(voices) {
    const englishVoices = voices.filter(v => v.lang.startsWith("en"));

    femaleVoice = englishVoices.find(v =>
        v.name.toLowerCase().includes("zira") ||
        v.name.toLowerCase().includes("female")
    );
    maleVoice = englishVoices.find(v =>
        v.name.toLowerCase().includes("david") ||
        v.name.toLowerCase().includes("mark") ||
        v.name.toLowerCase().includes("male")
    );

    if (!femaleVoice && englishVoices.length > 0) femaleVoice = englishVoices[0];
    if (!maleVoice && englishVoices.length > 1) maleVoice = englishVoices[1];
    if (!maleVoice && englishVoices.length > 0) maleVoice = englishVoices[0];
}

function speakEnglish(text) {
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speech.rate = 0.85;
    speech.pitch = 1;

    const voice = currentIndex % 2 === 0 ? femaleVoice : maleVoice;
    if (voice) {
        speech.voice = voice;
    }

    window.speechSynthesis.speak(speech);
}

// =========================================================
//  SAYAÇ
// =========================================================

function updateCounter() {
    const counter = document.getElementById("counter");
    if (cards.length > 0) {
        counter.textContent = `${currentIndex + 1} / ${cards.length}`;
    } else {
        counter.textContent = "";
    }
}

// =========================================================
//  ZAMANLAYICI YARDIMCILARI
// =========================================================

function clearTimers() {
    clearTimeout(hideTooltipTimer);
    clearTimeout(hoverTimer);
}

function scheduleHideTooltip(delay) {
    clearTimeout(hideTooltipTimer);
    hideTooltipTimer = setTimeout(() => {
        const tooltip = document.getElementById("word-tooltip");
        if (!tooltip || !tooltip.matches(':hover')) {
            hideTooltip();
        }
    }, delay);
}

// =========================================================
//  ANA EKRAN – İNGİLİZCE / TÜRKÇE GÖSTER
// =========================================================

function showEnglish() {
    showingTurkish = false;
    const card = document.getElementById("card");
    const sentence = cards[currentIndex].english;

    hideTooltip();
    clearTimers();

    // Cümleyi kelimelere ve noktalama işaretlerine ayır
    const tokens = sentence.match(/[\w']+|[^\w']+/g) || [];

    const html = tokens.map(token => {
        if (/^[a-zA-Z']{2,}$/.test(token)) {
            const lower = token.toLowerCase();
            return `<span class="word-clickable" data-word="${token}" data-lower="${lower}">${token}</span>`;
        }
        return token;
    }).join('');

    card.innerHTML = `<h2>${html}</h2>`;

    // Her tıklanabilir kelimeye olay dinleyicisi ekle
    card.querySelectorAll('.word-clickable').forEach(span => {
        // Tıklama (mobil / masaüstü)
        span.addEventListener('click', function (e) {
            e.stopPropagation(); // Kart tıklamasını engelle
            clearTimers();
            const word = this.dataset.word;
            const lower = this.dataset.lower;
            showWordMeanings(lower, word, this);
        });

        // Hover – masaüstü için (gecikmeli)
        span.addEventListener('mouseenter', function () {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
                const word = this.dataset.word;
                const lower = this.dataset.lower;
                showWordMeanings(lower, word, this);
            }, 300);
        });

        span.addEventListener('mouseleave', function () {
            clearTimeout(hoverTimer);
            scheduleHideTooltip(400);
        });
    });

    speakEnglish(sentence);
    updateCounter();
}

function showTurkish() {
    window.speechSynthesis.cancel();
    showingTurkish = true;
    const card = document.getElementById("card");
    hideTooltip();
    clearTimers();
    card.innerHTML = `<p>${cards[currentIndex].turkish}</p>`;
}

// =========================================================
//  KELİMENİN TÜM ANLAMLARINI GETİR & GÖSTER
// =========================================================

async function showWordMeanings(lower, originalWord, spanElement) {
    // 1) Türkçe çeviriyi al (önbellek / API)
    let translation = wordCache[lower];
    if (!translation) {
        translation = await fetchTranslation(lower, originalWord);
    }

    // 2) Sözlük tanımlarını getir (Free Dictionary API)
    const meanings = await getDictionaryDefinitions(lower, originalWord);

    // 3) Zengin tooltip'i göster
    showRichTooltip(spanElement, originalWord, translation, meanings);
}

// ——— Türkçe çeviri API ———
async function fetchTranslation(lower, originalWord) {
    if (wordCache[lower]) return wordCache[lower];

    wordCache[lower] = "🔄";

    // LibreTranslate
    try {
        const response = await fetch("https://libretranslate.de/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                q: originalWord,
                source: "en",
                target: "tr"
            })
        });
        if (response.ok) {
            const data = await response.json();
            const translation = data.translatedText || "";
            if (translation) {
                wordCache[lower] = translation;
                return translation;
            }
        }
    } catch (_) {}

    // Google Translate (yedek)
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(originalWord)}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            const translation = data[0]?.[0]?.[0] || "";
            if (translation) {
                wordCache[lower] = translation;
                return translation;
            }
        }
    } catch (_) {}

    wordCache[lower] = "❌";
    return "❌";
}

// ——— Sözlük tanımları (Free Dictionary API) ———
async function getDictionaryDefinitions(lower, originalWord) {
    // Önbellekte varsa döndür
    if (defCache[lower]) {
        if (defCache[lower].data !== undefined) return defCache[lower].data;
        // Yükleniyor → promise'i bekle
        return defCache[lower].promise;
    }

    // API çağrısını başlat ve önbelleğe al
    const promise = (async () => {
        try {
            const response = await fetch(
                `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(originalWord)}`
            );
            if (response.ok) {
                const data = await response.json();
                const meanings = data[0]?.meanings || [];
                defCache[lower] = { data: meanings, promise: null };
                return meanings;
            }
        } catch (_) {}
        defCache[lower] = { data: [], promise: null };
        return [];
    })();

    defCache[lower] = { data: undefined, promise };
    return promise;
}

// =========================================================
//  ZENGİN TOOLTIP (çok anlamlı)
// =========================================================

function showRichTooltip(spanElement, word, translation, meanings) {
    hideTooltip();

    const tooltip = document.createElement("div");
    tooltip.className = "word-tooltip";
    tooltip.id = "word-tooltip";

    // ——— Header: kelime + Türkçe çeviri ———
    let headerHtml = `<div class="tooltip-header">
        <strong>${word}</strong>`;
    if (translation && translation !== "🔄" && translation !== "❌") {
        headerHtml += `<span class="tooltip-tr">🇹🇷 ${translation}</span>`;
    } else if (translation === "🔄") {
        headerHtml += `<span class="tooltip-tr loading">🔄 çeviriliyor...</span>`;
    }
    headerHtml += `</div>`;

    // ——— Anlamlar ———
    let meaningsHtml = '<div class="tooltip-meanings">';
    if (meanings && meanings.length > 0) {
        meanings.forEach((meaning) => {
            const posLabel = meaning.partOfSpeech
                .replace('verb', 'fiil')
                .replace('noun', 'isim')
                .replace('adjective', 'sıfat')
                .replace('adverb', 'zarf')
                .replace('preposition', 'edat')
                .replace('conjunction', 'bağlaç')
                .replace('pronoun', 'zamir')
                .replace('interjection', 'ünlem')
                .replace('determiner', 'belirteç')
                .replace('exclamation', 'ünlem');

            meaningsHtml += `<div class="meaning-group">`;
            meaningsHtml += `<div class="meaning-pos">${posLabel}</div>`;

            meaning.definitions.forEach((def, di) => {
                meaningsHtml += `<div class="meaning-item">`;
                meaningsHtml += `<div class="meaning-def">${di + 1}. ${def.definition}</div>`;
                if (def.example) {
                    meaningsHtml += `<div class="meaning-example">💬 ${def.example}</div>`;
                }
                meaningsHtml += `</div>`;
            });

            meaningsHtml += `</div>`;
        });
    } else {
        // Sözlük tanımı yoksa sadece çeviriyi göster
        meaningsHtml += `<div class="meaning-item">
            <div class="meaning-def">${translation || "Çeviri bulunamadı"}</div>
        </div>`;
    }
    meaningsHtml += '</div>';

    tooltip.innerHTML = headerHtml + meaningsHtml;

    document.body.appendChild(tooltip);

    // ——— Konumlandır ———
    const rect = spanElement.getBoundingClientRect();

    // Tooltip'i önce görünmez ekle ki getBoundingClientRect çalışsın
    tooltip.style.opacity = "0";
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 12;

    // Taşma kontrolleri
    if (left < 8) left = 8;
    if (left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tooltipRect.width - 8;
    }
    if (top < 8) {
        top = rect.bottom + 12; // Üstte yer yoksa alta koy
    }

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";

    // Animasyonlu göster
    requestAnimationFrame(() => {
        tooltip.style.opacity = "1";
    });

    // ——— Tooltip fare olayları (tooltip'e geçişe izin ver) ———
    tooltip.addEventListener('mouseenter', () => {
        clearTimeout(hideTooltipTimer);
    });
    tooltip.addEventListener('mouseleave', () => {
        scheduleHideTooltip(300);
    });
}

function hideTooltip() {
    const existing = document.getElementById("word-tooltip");
    if (existing) {
        existing.remove();
    }
}

// =========================================================
//  KART TIKLAMA – ÇEVİRİYİ GÖSTER / GİZLE
// =========================================================

document.getElementById("card").addEventListener("click", function () {
    const tooltip = document.getElementById("word-tooltip");
    if (tooltip) {
        hideTooltip();
        return;
    }

    const card = this;
    card.classList.add("flip-effect");

    setTimeout(() => {
        if (showingTurkish) {
            showEnglish();
        } else {
            showTurkish();
        }
        card.classList.remove("flip-effect");
    }, 300);
});

// Tooltip dışına tıklandığında tooltip'i kapat
document.addEventListener("click", function (e) {
    const tooltip = document.getElementById("word-tooltip");
    if (tooltip && !tooltip.contains(e.target) && !e.target.closest('.word-clickable')) {
        hideTooltip();
    }
});

// =========================================================
//  SONRAKİ KART
// =========================================================

document.getElementById("next-btn").addEventListener("click", nextCard);

function nextCard() {
    window.speechSynthesis.cancel();
    hideTooltip();
    clearTimers();
    const card = document.getElementById("card");
    card.classList.add("fade-out");
    setTimeout(() => {
        currentIndex++;
        if (currentIndex >= cards.length) {
            currentIndex = 0;
        }
        showEnglish();
        card.classList.remove("fade-out");
    }, 300);
}

// =========================================================
//  BAŞLAT
// =========================================================

loadCards();
