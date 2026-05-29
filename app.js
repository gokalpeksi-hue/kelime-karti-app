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

// ——— Örnek Cümle Modu ———
let isShowingExample = false;
let originalCardIndex = 0;

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
        if (isShowingExample) {
            counter.textContent = `📝 Örnek · ${originalCardIndex + 1} / ${cards.length}`;
        } else {
            counter.textContent = `${currentIndex + 1} / ${cards.length}`;
        }
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

    hideTooltip();
    clearTimers();

    if (isShowingExample) {
        showOriginalCard();
        return;
    }

    const sentence = cards[currentIndex].english;

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
    attachWordListeners(card);

    speakEnglish(sentence);
    updateCounter();
}

function attachWordListeners(card) {
    card.querySelectorAll('.word-clickable').forEach(span => {
        span.addEventListener('click', function (e) {
            e.stopPropagation();
            clearTimers();
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
//  KARTLAR İÇİNDE KELİME ARAMA (bağlamsal örnek cümleler)
// =========================================================

function getContextualSentences(word) {
    const lower = word.toLowerCase().replace(/[^a-z']/g, '');
    if (!lower || lower.length < 2) return [];
    const results = [];
    for (let i = 0; i < cards.length; i++) {
        const tokens = cards[i].english.toLowerCase().match(/[\w']+/g) || [];
        if (tokens.includes(lower)) {
            results.push({
                sentence: cards[i].english,
                turkish: cards[i].turkish,
                index: i
            });
            if (results.length >= 8) break;
        }
    }
    return results;
}

// =========================================================
//  ZENGİN TOOLTIP (çok anlamlı + örnek cümle butonları)
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

    // ——— Anlamlar + Örnek Cümle Butonları ———
    let meaningsHtml = '<div class="tooltip-meanings">';
    if (meanings && meanings.length > 0) {
        meanings.forEach((meaning, mi) => {
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
                    meaningsHtml += `<button class="example-btn" data-example="${encodeURIComponent(def.example)}" data-word="${word}">▶ Kartta Göster</button>`;
                }
                meaningsHtml += `</div>`;
            });

            meaningsHtml += `</div>`;
        });

        // ——— Kartlardan bağlamsal örnek cümleler ———
        const contextSentences = getContextualSentences(word);
        if (contextSentences.length > 0) {
            meaningsHtml += `<div class="meaning-group contextual-group">
                <div class="meaning-pos">📖 KARTLARDAN ÖRNEKLER</div>`;
            contextSentences.forEach((ctx, ci) => {
                const isCurrent = ctx.index === currentIndex;
                meaningsHtml += `<div class="meaning-item ${isCurrent ? 'current-card' : ''}">
                    <div class="meaning-example ctx-example">${ctx.sentence}</div>
                    <button class="example-btn small" data-example="${encodeURIComponent(ctx.sentence)}" data-word="${word}" data-turkish="${encodeURIComponent(ctx.turkish)}" data-ctxindex="${ctx.index}">▶ Kartta Göster</button>
                </div>`;
            });
            meaningsHtml += `</div>`;
        }
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
        top = rect.bottom + 12;
    }

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";

    // Animasyonlu göster
    requestAnimationFrame(() => {
        tooltip.style.opacity = "1";
    });

    // ——— Örnek Cümle Butonları ———
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

    // ——— Tooltip fare olayları ———
    tooltip.addEventListener('mouseenter', () => {
        clearTimeout(hideTooltipTimer);
    });
    tooltip.addEventListener('mouseleave', () => {
        scheduleHideTooltip(300);
    });
}

// =========================================================
//  ÖRNEK CÜMLEYİ KARTTA GÖSTER
// =========================================================

function showExampleInCard(exampleSentence, word, turkishTranslation, ctxIndex) {
    window.speechSynthesis.cancel();
    isShowingExample = true;
    originalCardIndex = currentIndex;

    const card = document.getElementById("card");

    // Kelimeyi vurgula
    const tokens = exampleSentence.match(/[\w']+|[^\w']+/g) || [];
    const html = tokens.map(token => {
        if (token.toLowerCase() === word.toLowerCase()) {
            return `<span class="word-highlight">${token}</span>`;
        }
        // Diğer kelimeler de tıklanabilir olsun
        if (/^[a-zA-Z']{2,}$/.test(token)) {
            return `<span class="word-clickable" data-word="${token}" data-lower="${token.toLowerCase()}">${token}</span>`;
        }
        return token;
    }).join('');

    card.innerHTML = `
        <div class="example-card-content">
            <div class="example-badge">📝 Örnek Cümle</div>
            <h2>${html}</h2>
            ${turkishTranslation ? `<div class="example-translation">🇹🇷 ${turkishTranslation}</div>` : ''}
            <button class="back-to-card-btn">← Ana Karta Dön</button>
        </div>
    `;

    // Alt kelimelere de tooltip dinleyicisi ekle
    attachWordListeners(card);

    // Geri butonu
    card.querySelector('.back-to-card-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        showOriginalCard();
    });

    updateCounter();

    // Örnek cümleyi seslendir
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
}

// =========================================================
//  KART TIKLAMA – ÇEVİRİYİ GÖSTER / GİZLE
// =========================================================

document.getElementById("card").addEventListener("click", function () {
    // Örnek cümle modunda → ana karta dön
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
    if (tooltip && !tooltip.contains(e.target) && !e.target.closest('.word-clickable')) {
        hideTooltip();
    }
});

// =========================================================
//  ÖNCEKİ / SONRAKİ KART
// =========================================================

document.getElementById("next-btn")?.addEventListener("click", nextCard);
document.getElementById("prev-btn")?.addEventListener("click", prevCard);

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
//  KLAVYE KISAYOLLARI
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
//  SAYFA ATLAMA INPUT
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
//  BAŞLAT
// =========================================================

loadCards();
