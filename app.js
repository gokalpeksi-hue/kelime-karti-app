let cards = [];
let currentIndex = 0;
let showingTurkish = false;
let femaleVoice = null;
let maleVoice = null;
let autoSpeak = false; // otomatik seslendirme kapalı (sadece 🔊 butonuyla okur)

// ——— Önbellekler ———
const wordCache = {};   // İngilizce → Türkçe çeviri (diğer kelimeler için)
const defCache = {};    // İngilizce → sözlük tanımları
const phraseCache = {}; // İngilizce cümle → Türkçe çeviri (örnek cümleler için)

// ——— Zamanlayıcılar ———
let hideTooltipTimer = null;
let hoverTimer = null;

// ——— Açık olan açıklama balonunun kaynağı (aç/kapa için) ———
let activeTooltipEl = null;

// ——— Örnek Cümle Modu ———
let isShowingExample = false;
let originalCardIndex = 0;

// =========================================================
// VERİ YÜKLEME
// =========================================================
async function loadCards() {
    const response = await fetch("data.json");
    cards = await response.json();
    loadVoices();
}

function deduplicateCards(arr) {
    const seen = new Set();
    return arr.filter(card => {
        const key = (card.sentence || card.english || '').toLowerCase().trim();
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
                word: String(row[0]).trim().split(' ')[0].toLowerCase(),
                meanings: [String(row[1]).trim()],
                sentence: String(row[0]).trim(),
                turkish: String(row[1]).trim()
            }));

            const uniqueCount = parsed.length;
            parsed = deduplicateCards(parsed);
            cards = parsed;
            currentIndex = 0;
            isShowingExample = false;
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
// SES
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

// Otomatik seslendirme (autoSpeak kapalıyken sessizdir)
function speakEnglish(text) {
    if (!autoSpeak) return; // otomatik seslendirme kapalıysa hiçbir şey yapma
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

// ——— İsteğe bağlı (elle) seslendirme — 🔊 butonu bunu çağırır ———
function speakCurrentSentence() {
    let text = "";
    if (isShowingExample) {
        const h2 = document.querySelector("#card h2");
        text = h2 ? h2.textContent : "";
    } else if (cards[currentIndex]) {
        text = cards[currentIndex].sentence || cards[currentIndex].english || "";
    }
    if (!text) return;

    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speech.rate = 0.85;
    speech.pitch = 1;
    const voice = currentIndex % 2 === 0 ? femaleVoice : maleVoice;
    if (voice) speech.voice = voice;
    window.speechSynthesis.speak(speech);
}

// =========================================================
// SAYAÇ
// =========================================================
function updateCounter() {
    const counter = document.getElementById("counter");
    if (cards.length > 0) {
        if (isShowingExample) {
            counter.textContent = `📝 Örnek · ${originalCardIndex + 1} / ${cards.length}`;
        } else {
            const card = cards[currentIndex];
            const word = card.word || '';
            counter.textContent = `${word} · ${currentIndex + 1} / ${cards.length}`;
        }
    } else {
        counter.textContent = "";
    }
}

// =========================================================
// ZAMANLAYICI YARDIMCILARI
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
// İNGİLİZCE KALIPLAR (PHRASES) — cümlede tek tıklanabilir birim olarak
// =========================================================
const PHRASES = [
    // Bağlaç / edat kalıpları
    "as long as", "as soon as", "as well as", "as far as", "as much as",
    "as if", "as though", "as a result of", "as a result", "as opposed to",
    "in case of", "in case", "in order to", "in order for", "in spite of",
    "in terms of", "in addition to", "in addition", "in front of",
    "in favor of", "in favour of", "in charge of", "in accordance with",
    "in advance", "in line with", "in light of", "in the long run",
    "in the short term", "in the event of", "in response to", "in contrast to",
    "instead of", "the case for", "the case against",
    "due to", "owing to", "thanks to", "according to", "regardless of",
    "apart from", "aside from", "rather than", "other than", "such as",
    "so that", "so as to", "even though", "even if", "for the sake of",
    "on behalf of", "on account of", "with respect to", "with regard to",
    "with regards to", "by means of", "ahead of", "prior to", "subject to",
    "based on", "up to date", "more or less", "at least", "at most",
    "at first", "at last", "no longer", "as of",
    // Fiil kalıpları (phrasal / collocation)
    "look forward to", "take into account", "take advantage of",
    "give rise to", "come up with", "carry out", "point out", "set up",
    "follow up", "break down", "deal with", "rely on", "depend on",
    "result in", "lead to", "focus on", "go through", "bring about",
    "phase out", "roll out", "scale up", "ramp up", "follow through",
    "keep up with", "catch up with", "make up for", "account for",
    "due diligence", "supply chain", "value chain", "market share",
    "go to market", "first mover", "first-mover advantage", "first mover advantage"
];

let _phraseRegex = null;
function getPhraseRegex() {
    if (_phraseRegex) return _phraseRegex;
    const sorted = [...PHRASES].sort((a, b) => b.length - a.length);
    const escaped = sorted.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    _phraseRegex = new RegExp('\\b(?:' + escaped.join('|') + ')\\b', 'gi');
    return _phraseRegex;
}

// Cümleyi kalıpları tek parça, geri kalanı verilen tokenizer ile işleyerek HTML üretir
function buildHtmlWithPhrases(sentence, tokenizeSegment) {
    const regex = getPhraseRegex();
    regex.lastIndex = 0;
    let result = '';
    let lastIndex = 0;
    let m;
    while ((m = regex.exec(sentence)) !== null) {
        result += tokenizeSegment(sentence.slice(lastIndex, m.index));
        const phraseText = m[0];
        result += `<span class="word-phrase" data-phrase="${phraseText}" data-lower="${phraseText.toLowerCase()}">${phraseText}</span>`;
        lastIndex = m.index + phraseText.length;
        if (phraseText.length === 0) regex.lastIndex++; // güvenlik
    }
    result += tokenizeSegment(sentence.slice(lastIndex));
    return result;
}

// Düz metin parçasını kelimelere ayırıp anahtar kelimeyi vurgular
function tokenizeSegmentKeyword(text, keyWord) {
    const tokens = text.match(/[\w']+(?:-[\w']+)*|[^\w']+/g) || [];
    return tokens.map(token => {
        if (keyWord && token.toLowerCase() === keyWord.toLowerCase()) {
            return `<span class="word-keyword" data-word="${token}" data-lower="${token.toLowerCase()}">${token}</span>`;
        }
        if (/^[a-zA-Z][a-zA-Z'-]*$/.test(token)) {
            return `<span class="word-clickable" data-word="${token}" data-lower="${token.toLowerCase()}">${token}</span>`;
        }
        return token;
    }).join('');
}

// Düz metin parçasını kelimelere ayırıp eşleşen kelimeyi (örnek kartında) vurgular
function tokenizeSegmentHighlight(text, word) {
    const tokens = text.match(/[\w']+(?:-[\w']+)*|[^\w']+/g) || [];
    return tokens.map(token => {
        if (word && token.toLowerCase() === word.toLowerCase()) {
            return `<span class="word-highlight">${token}</span>`;
        }
        if (/^[a-zA-Z][a-zA-Z'-]*$/.test(token)) {
            return `<span class="word-clickable" data-word="${token}" data-lower="${token.toLowerCase()}">${token}</span>`;
        }
        return token;
    }).join('');
}

// =========================================================
// ANA EKRAN – İNGİLİZCE CÜMLE + ANAHTAR KELİME VURGULU
// =========================================================
function showEnglish() {
    showingTurkish = false;
    const card = document.getElementById("card");
    hideTooltip();
    clearTimers();

    if (isShowingExample) {
        showOriginalCard();
        return;
    }

    const cardData = cards[currentIndex];
    const sentence = cardData.sentence || cardData.english || '';
    const keyWord = cardData.word || '';

    // Cümleyi kalıplar (örn. "as long as") tek parça, geri kalanı kelime kelime işle
    const html = buildHtmlWithPhrases(sentence, (t) => tokenizeSegmentKeyword(t, keyWord));

    card.innerHTML = `<h2>${html}</h2>`;

    // Tıklanabilir kelimelere olay dinleyicisi ekle
    attachWordListeners(card);

    speakEnglish(sentence);
    updateCounter();
}

function attachWordListeners(card) {
    // Anahtar kelime (vurgulu) - özel davranış: Türkçe anlamları göster
    card.querySelectorAll('.word-keyword').forEach(span => {
        span.addEventListener('click', function (e) {
            e.stopPropagation();
            clearTimers();
            // Aynı kelimeye tekrar basılırsa açıklamayı kapat (aç/kapa)
            if (activeTooltipEl === this && document.getElementById('word-tooltip')) {
                hideTooltip();
                return;
            }
            const word = this.dataset.word;
            // Anahtar kelimeye tıklandı → karttaki Türkçe anlamları göster
            showKeywordMeanings(word, this);
        });

        span.addEventListener('mouseenter', function () {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
                const word = this.dataset.word;
                showKeywordMeanings(word, this);
            }, 300);
        });

        span.addEventListener('mouseleave', function () {
            clearTimeout(hoverTimer);
            scheduleHideTooltip(400);
        });
    });

    // Diğer tıklanabilir kelimeler - dictionary API ile çeviri
    card.querySelectorAll('.word-clickable').forEach(span => {
        span.addEventListener('click', function (e) {
            e.stopPropagation();
            clearTimers();
            // Aynı kelimeye tekrar basılırsa açıklamayı kapat (aç/kapa)
            if (activeTooltipEl === this && document.getElementById('word-tooltip')) {
                hideTooltip();
                return;
            }
            const word = this.dataset.word;
            const lower = this.dataset.lower;
            showWordMeanings(lower, word, this);
        });

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

    // Kalıplar (phrase) - kalıbın Türkçe anlamını göster
    card.querySelectorAll('.word-phrase').forEach(span => {
        span.addEventListener('click', function (e) {
            e.stopPropagation();
            clearTimers();
            // Aynı kalıba tekrar basılırsa açıklamayı kapat (aç/kapa)
            if (activeTooltipEl === this && document.getElementById('word-tooltip')) {
                hideTooltip();
                return;
            }
            showPhraseMeaning(this.dataset.phrase, this);
        });

        span.addEventListener('mouseenter', function () {
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => {
                showPhraseMeaning(this.dataset.phrase, this);
            }, 300);
        });

        span.addEventListener('mouseleave', function () {
            clearTimeout(hoverTimer);
            scheduleHideTooltip(400);
        });
    });
}

// =========================================================
// KALIBIN (PHRASE) TÜRKÇE ANLAMINI GÖSTER
// =========================================================
function showPhraseMeaning(phrase, spanElement) {
    hideTooltip();

    const tooltip = document.createElement("div");
    tooltip.className = "word-tooltip";
    tooltip.id = "word-tooltip";

    tooltip.innerHTML = `<div class="tooltip-header">
<strong>${phrase}</strong>
<span class="tooltip-tr">🧩 kalıp</span>
</div>
<div class="tooltip-meanings">
<div class="meaning-group">
<div class="meaning-pos">🧩 KALIP ANLAMI</div>
<div class="meaning-item">
<div class="meaning-def" data-phrasetr>🔄 çevriliyor...</div>
</div>
</div>
</div>`;

    document.body.appendChild(tooltip);

    // ——— Konumlandır ———
    const rect = spanElement.getBoundingClientRect();
    tooltip.style.opacity = "0";
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 12;
    if (left < 8) left = 8;
    if (left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tooltipRect.width - 8;
    }
    if (top < 8) {
        top = rect.bottom + 12;
    }
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    requestAnimationFrame(() => {
        tooltip.style.opacity = "1";
    });

    tooltip.addEventListener('mouseenter', () => clearTimeout(hideTooltipTimer));
    tooltip.addEventListener('mouseleave', () => scheduleHideTooltip(300));

    activeTooltipEl = spanElement;

    // Kalıbın Türkçe karşılığını çevir
    (async () => {
        const tr = await translateToTurkish(phrase);
        if (!document.body.contains(tooltip)) return;
        const el = tooltip.querySelector('[data-phrasetr]');
        if (el) {
            el.textContent = tr ? `🇹🇷 ${tr}` : 'Çeviri bulunamadı';
        }
    })();
}

function showTurkish() {
    window.speechSynthesis.cancel();
    showingTurkish = true;
    const card = document.getElementById("card");
    hideTooltip();
    clearTimers();

    const cardData = cards[currentIndex];
    const turkishText = cardData.turkish || '';

    card.innerHTML = `<p>${turkishText}</p>`;
}

// =========================================================
// ANAHTAR KELİMENİN TÜRKÇE ANLAMLARINI GÖSTER (data.json'dan)
// =========================================================
function showKeywordMeanings(word, spanElement) {
    hideTooltip();

    const cardData = cards[currentIndex];
    const meanings = cardData.meanings || [];

    const tooltip = document.createElement("div");
    tooltip.className = "word-tooltip";
    tooltip.id = "word-tooltip";

    // ——— Başlık ———
    let html = `<div class="tooltip-header">
<strong>${word}</strong>
<span class="tooltip-tr">🇹🇷 ${meanings.length} anlam</span>
</div>`;

    // ——— Her Türkçe anlam + İngilizce örnek cümle + Türkçe çevirisi ———
    html += '<div class="tooltip-meanings">';
    html += '<div class="meaning-group">';
    html += '<div class="meaning-pos">📖 TÜRKÇE ANLAMLARI & ÖRNEKLER</div>';
    meanings.forEach((m, i) => {
        html += `<div class="meaning-item">
<div class="meaning-def">${i + 1}. ${m}</div>
<div class="meaning-example" data-exslot="${i}">⏳ örnek hazırlanıyor...</div>
<div class="meaning-example-tr" data-exslot-tr="${i}"></div>
</div>`;
    });
    html += '</div>'; // meaning-group

    // ——— Eş anlamlılar (ikame kelimeler) ———
    html += `<div class="meaning-group contextual-group">
<div class="meaning-pos">🔁 EŞ ANLAMLILAR (İKAME)</div>
<div class="syn-list" data-synlist>⏳ aranıyor...</div>
</div>`;

    html += '</div>'; // tooltip-meanings

    tooltip.innerHTML = html;
    document.body.appendChild(tooltip);

    // ——— Konumlandır ———
    const rect = spanElement.getBoundingClientRect();
    tooltip.style.opacity = "0";
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 12;
    if (left < 8) left = 8;
    if (left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tooltipRect.width - 8;
    }
    if (top < 8) {
        top = rect.bottom + 12;
    }
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    requestAnimationFrame(() => {
        tooltip.style.opacity = "1";
    });

    // Tooltip fare olayları
    tooltip.addEventListener('mouseenter', () => clearTimeout(hideTooltipTimer));
    tooltip.addEventListener('mouseleave', () => scheduleHideTooltip(300));

    // Bu balon artık açık → aç/kapa için kaydet
    activeTooltipEl = spanElement;

    // Önce örnekleri, sonra eş anlamlıları sırayla doldur (hız sınırını aşmamak için)
    fillKeywordExamples(word, meanings, tooltip)
        .then(() => fillKeywordSynonyms(word, tooltip));
}

// =========================================================
// EŞ ANLAMLILAR (İKAME KELİMELER) — Free Dictionary API'den
// =========================================================
async function fillKeywordSynonyms(word, tooltip) {
    const container = tooltip.querySelector('[data-synlist]');
    if (!container) return;

    const lower = word.toLowerCase().replace(/[^a-z']/g, '');
    let synonyms = [];

    if (lower.length >= 2) {
        try {
            const defs = await getDictionaryDefinitions(lower, word);
            const set = new Set();
            for (const meaning of (defs || [])) {
                (meaning.synonyms || []).forEach(s => set.add(s));
                for (const def of (meaning.definitions || [])) {
                    (def.synonyms || []).forEach(s => set.add(s));
                }
            }
            synonyms = [...set]
                .filter(s => s && s.toLowerCase() !== lower)
                .slice(0, 8);
        } catch (_) {}
    }

    if (!document.body.contains(tooltip)) return;

    if (synonyms.length === 0) {
        container.textContent = '— eş anlamlı bulunamadı —';
        return;
    }

    // İngilizce eş anlamlıları listele, Türkçelerini sırayla ekle
    container.innerHTML = synonyms.map((s, i) =>
        `<div class="syn-item"><span class="syn-en">${s}</span> <span class="syn-tr" data-syntr="${i}"></span></div>`
    ).join('');

    for (let i = 0; i < synonyms.length; i++) {
        if (!document.body.contains(tooltip)) return;
        const trEl = container.querySelector(`[data-syntr="${i}"]`);
        if (!trEl) continue;
        const tr = await translateToTurkish(synonyms[i]);
        if (tr) trEl.textContent = `(${tr})`;
    }
}

// =========================================================
// HER ANLAM İÇİN İNGİLİZCE ÖRNEK CÜMLE + TÜRKÇE ÇEVİRİSİ
// =========================================================
async function fillKeywordExamples(word, meanings, tooltip) {
    const cardData = cards[currentIndex];
    const lower = word.toLowerCase().replace(/[^a-z']/g, '');

    // ——— Örnek havuzu oluştur: { en, tr } ———
    const pool = [];

    // 1. Mevcut kartın cümlesi (gerçek bağlam, Türkçesi hazır)
    if (cardData.sentence) {
        pool.push({ en: cardData.sentence, tr: cardData.turkish || '' });
    }

    // 2. Aynı kelimeyi içeren diğer kartlar (Türkçeleri hazır)
    for (let i = 0; i < cards.length && pool.length < meanings.length + 2; i++) {
        if (i === currentIndex) continue;
        const s = cards[i].sentence || cards[i].english || '';
        const tokens = s.toLowerCase().match(/[\w']+/g) || [];
        if (tokens.includes(lower)) {
            pool.push({ en: s, tr: cards[i].turkish || '' });
        }
    }

    // 3. Yeterli örnek yoksa sözlük API'sinden örnek cümleler çek (Türkçesi sonra çevrilir)
    if (pool.length < meanings.length && lower.length >= 2) {
        try {
            const defs = await getDictionaryDefinitions(lower, word);
            for (const meaning of (defs || [])) {
                for (const def of (meaning.definitions || [])) {
                    if (def.example) {
                        pool.push({ en: def.example, tr: null });
                        if (pool.length >= meanings.length + 2) break;
                    }
                }
                if (pool.length >= meanings.length + 2) break;
            }
        } catch (_) {}
    }

    // ——— Her anlama bir örnek ata ve gerekirse Türkçeye çevir ———
    for (let i = 0; i < meanings.length; i++) {
        const enEl = tooltip.querySelector(`[data-exslot="${i}"]`);
        const trEl = tooltip.querySelector(`[data-exslot-tr="${i}"]`);
        if (!enEl) continue;

        const ex = pool[i];
        if (!ex) {
            enEl.textContent = '— örnek bulunamadı —';
            if (trEl) trEl.style.display = 'none';
            continue;
        }

        enEl.textContent = `💬 ${ex.en}`;
        let tr = ex.tr;
        if (!tr) {
            if (trEl) trEl.textContent = '🔄 Türkçesi çevriliyor...';
            tr = await translateToTurkish(ex.en);
        }
        if (trEl) {
            if (tr) {
                trEl.textContent = `🇹🇷 ${tr}`;
            } else {
                trEl.style.display = 'none';
            }
        }
    }
}

// =========================================================
// DİĞER KELİMELER İÇİN DICTIONARY API ÇEVİRİSİ
// =========================================================
async function showWordMeanings(lower, originalWord, spanElement) {
    let translation = wordCache[lower];
    if (!translation) {
        translation = await fetchTranslation(lower, originalWord);
    }
    const meanings = await getDictionaryDefinitions(lower, originalWord);
    showRichTooltip(spanElement, originalWord, translation, meanings);
}

// ——— Türkçe çeviri API (tek kelime) ———
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

// ——— Cümle / ifade çevirisi (örnek cümlelerin Türkçesi için) ———
async function translateToTurkish(text) {
    const key = text.toLowerCase().trim();
    if (phraseCache[key]) return phraseCache[key];

    // LibreTranslate
    try {
        const res = await fetch("https://libretranslate.de/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: text, source: "en", target: "tr" })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.translatedText) {
                phraseCache[key] = data.translatedText;
                return data.translatedText;
            }
        }
    } catch (_) {}

    // Google Translate (yedek)
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const translation = (data[0] || []).map(seg => seg[0]).join("");
            if (translation) {
                phraseCache[key] = translation;
                return translation;
            }
        }
    } catch (_) {}

    return "";
}

// ——— Sözlük tanımları (Free Dictionary API) ———
async function getDictionaryDefinitions(lower, originalWord) {
    if (defCache[lower]) {
        if (defCache[lower].data !== undefined) return defCache[lower].data;
        return defCache[lower].promise;
    }

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
// ZENGİN TOOLTIP (diğer kelimeler için)
// İngilizce tanımlar + her örnek cümlenin Türkçe çevirisi
// =========================================================
function showRichTooltip(spanElement, word, translation, meanings) {
    hideTooltip();

    const tooltip = document.createElement("div");
    tooltip.className = "word-tooltip";
    tooltip.id = "word-tooltip";

    let headerHtml = `<div class="tooltip-header">
<strong>${word}</strong>`;
    if (translation && translation !== "🔄" && translation !== "❌") {
        headerHtml += `<span class="tooltip-tr">🇹🇷 ${translation}</span>`;
    } else if (translation === "🔄") {
        headerHtml += `<span class="tooltip-tr loading">🔄 çeviriliyor...</span>`;
    }
    headerHtml += `</div>`;

    let exIndex = 0;
    const examplesToTranslate = [];
    let defIndex = 0;
    const defsToTranslate = [];

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
                // Her İngilizce tanımın Türkçe karşılığı (parantez içinde)
                const didx = defIndex++;
                defsToTranslate.push({ idx: didx, text: def.definition });
                meaningsHtml += `<div class="meaning-def-tr" data-deftr="${didx}">🔄 Türkçesi çevriliyor...</div>`;
                if (def.example) {
                    const idx = exIndex++;
                    examplesToTranslate.push({ idx: idx, text: def.example });
                    meaningsHtml += `<div class="meaning-example">💬 ${def.example}</div>`;
                    meaningsHtml += `<div class="meaning-example-tr" data-extr="${idx}">🔄 Türkçesi çevriliyor...</div>`;
                    meaningsHtml += `<button class="example-btn" data-example="${encodeURIComponent(def.example)}" data-word="${word}">▶ Kartta Göster</button>`;
                }
                meaningsHtml += `</div>`;
            });

            meaningsHtml += `</div>`;
        });
    } else {
        meaningsHtml += `<div class="meaning-item">
<div class="meaning-def">${translation || "Çeviri bulunamadı"}</div>
</div>`;
    }
    meaningsHtml += '</div>';

    tooltip.innerHTML = headerHtml + meaningsHtml;
    document.body.appendChild(tooltip);

    const rect = spanElement.getBoundingClientRect();
    tooltip.style.opacity = "0";
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 12;
    if (left < 8) left = 8;
    if (left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tooltipRect.width - 8;
    }
    if (top < 8) {
        top = rect.bottom + 12;
    }
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    requestAnimationFrame(() => {
        tooltip.style.opacity = "1";
    });

    // Tanımların ve örneklerin Türkçesini SIRAYLA çevir (paralel istekler ücretsiz
    // çeviri servisinde hız sınırına takıldığı için teker teker yapılır)
    (async () => {
        const tasks = [
            ...defsToTranslate.map(d => ({
                sel: `[data-deftr="${d.idx}"]`,
                text: d.text,
                fmt: tr => `(🇹🇷 ${tr})`
            })),
            ...examplesToTranslate.map(ex => ({
                sel: `[data-extr="${ex.idx}"]`,
                text: ex.text,
                fmt: tr => `🇹🇷 ${tr}`
            }))
        ];

        for (const t of tasks) {
            // Balon kapandıysa boşuna çeviri yapma
            if (!document.body.contains(tooltip)) return;
            const el = tooltip.querySelector(t.sel);
            if (!el) continue;
            const tr = await translateToTurkish(t.text);
            if (tr) {
                el.textContent = t.fmt(tr);
            } else {
                el.style.display = "none";
            }
        }
    })();

    tooltip.querySelectorAll('.example-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            const example = decodeURIComponent(this.dataset.example);
            const word = this.dataset.word;
            const turkish = this.dataset.turkish
                ? decodeURIComponent(this.dataset.turkish)
                : '';
            const ctxIndex = this.dataset.ctxindex !== undefined
                ? parseInt(this.dataset.ctxindex)
                : null;
            showExampleInCard(example, word, turkish, ctxIndex);
            hideTooltip();
        });
    });

    tooltip.addEventListener('mouseenter', () => clearTimeout(hideTooltipTimer));
    tooltip.addEventListener('mouseleave', () => scheduleHideTooltip(300));

    // Bu balon artık açık → aç/kapa için kaydet
    activeTooltipEl = spanElement;
}

// =========================================================
// ÖRNEK CÜMLEYİ KARTTA GÖSTER
// =========================================================
function showExampleInCard(exampleSentence, word, turkishTranslation, ctxIndex) {
    window.speechSynthesis.cancel();
    isShowingExample = true;
    originalCardIndex = currentIndex;
    const card = document.getElementById("card");

    // Kalıplar tek parça, geri kalanı kelime kelime; eşleşen kelime vurgulanır
    const html = buildHtmlWithPhrases(exampleSentence, (t) => tokenizeSegmentHighlight(t, word));

    card.innerHTML = `
<div class="example-card-content">
<div class="example-badge">📝 Örnek Cümle</div>
<h2>${html}</h2>
${turkishTranslation ? `<div class="example-translation">🇹🇷 ${turkishTranslation}</div>` : ''}
<button class="back-to-card-btn">← Ana Karta Dön</button>
</div>
`;

    attachWordListeners(card);

    card.querySelector('.back-to-card-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        showOriginalCard();
    });

    updateCounter();
    speakEnglish(exampleSentence);
}

function showOriginalCard() {
    isShowingExample = false;
    currentIndex = originalCardIndex;
    showEnglish();
}

function hideTooltip() {
    const existing = document.getElementById("word-tooltip");
    if (existing) {
        existing.remove();
    }
    activeTooltipEl = null;
}

// =========================================================
// KART TIKLAMA – ÇEVİRİYİ GÖSTER / GİZLE
// =========================================================
document.getElementById("card").addEventListener("click", function () {
    if (isShowingExample) {
        showOriginalCard();
        return;
    }
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
    if (tooltip && !tooltip.contains(e.target) && !e.target.closest('.word-clickable') && !e.target.closest('.word-keyword')) {
        hideTooltip();
    }
});

// =========================================================
// ÖNCEKİ / SONRAKİ KART + SESLENDİRME BUTONU
// =========================================================
document.getElementById("next-btn")?.addEventListener("click", nextCard);
document.getElementById("prev-btn")?.addEventListener("click", prevCard);
document.getElementById("speak-btn")?.addEventListener("click", function (e) {
    e.stopPropagation();
    speakCurrentSentence();
});

function goToCard(index) {
    window.speechSynthesis.cancel();
    hideTooltip();
    clearTimers();
    if (isShowingExample) {
        isShowingExample = false;
    }
    const card = document.getElementById("card");
    card.classList.add("fade-out");
    setTimeout(() => {
        currentIndex = index;
        showEnglish();
        card.classList.remove("fade-out");
    }, 300);
}

function nextCard() {
    window.speechSynthesis.cancel();
    hideTooltip();
    clearTimers();
    if (isShowingExample) {
        currentIndex = originalCardIndex;
        isShowingExample = false;
    }
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

function prevCard() {
    window.speechSynthesis.cancel();
    hideTooltip();
    clearTimers();
    if (isShowingExample) {
        currentIndex = originalCardIndex;
        isShowingExample = false;
    }
    const card = document.getElementById("card");
    card.classList.add("fade-out");
    setTimeout(() => {
        currentIndex--;
        if (currentIndex < 0) {
            currentIndex = cards.length - 1;
        }
        showEnglish();
        card.classList.remove("fade-out");
    }, 300);
}

// =========================================================
// KLAVYE KISAYOLLARI
// =========================================================
document.addEventListener("keydown", function (e) {
    const pageInput = document.getElementById("page-input");
    if (document.activeElement === pageInput) {
        if (e.key === "Enter") {
            const num = parseInt(pageInput.value);
            if (num >= 1 && num <= cards.length) {
                goToCard(num - 1);
            }
            pageInput.value = "";
        }
        return;
    }

    if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevCard();
    } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextCard();
    }
});

// =========================================================
// SAYFA ATLAMA INPUT
// =========================================================
document.getElementById("page-input")?.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
        const num = parseInt(this.value);
        if (num >= 1 && num <= cards.length) {
            goToCard(num - 1);
        }
        this.value = "";
    }
});

document.getElementById("page-input")?.addEventListener("blur", function () {
    this.value = "";
});

// =========================================================
// DOKUNMATİK KAYDIRMA (SWIPE) — parmakla sağa/sola geçiş
// Hem dikey hem yatay kullanımda çalışır.
// =========================================================
(function setupSwipeNavigation() {
    const card = document.getElementById("card");
    if (!card) return;

    let startX = 0, startY = 0, startTime = 0, tracking = false;
    const MIN_DISTANCE = 50;    // en az yatay kaydırma (px)
    const OFF_AXIS_RATIO = 0.8; // dikey hareket bu orandan büyükse swipe sayılmaz
    const MAX_DURATION = 1000;  // ms

    // Swipe sonrası tarayıcının ürettiği "click"i yut:
    // kartın çevrilmesini / kelime balonunun açılmasını engeller.
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
        startX = t.clientX;
        startY = t.clientY;
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
        if (Math.abs(dy) > Math.abs(dx) * OFF_AXIS_RATIO) return; // dikey kaydırma → yok say

        swallowNextClick();

        if (dx < 0) {
            nextCard();   // sola kaydır → sonraki kart
        } else {
            prevCard();   // sağa kaydır → önceki kart
        }
    }, { passive: true });

    card.addEventListener("touchcancel", function () {
        tracking = false;
    }, { passive: true });
}());

// =========================================================
// BAŞLAT
// =========================================================
loadCards();
