let cards = [];
let currentIndex = 0;
let showingTurkish = false;
let femaleVoice = null;
let maleVoice = null;

// Kelime çeviri önbelleği
const wordCache = {};

// ——— Varsayılan veriyi yükle ———
async function loadCards() {
    const response = await fetch("data.json");
    cards = await response.json();
    loadVoices();
}

/**
 * Tekrarlanan kartları ingilizce cümleye göre temizler.
 * İlk geçen kart korunur, sonraki tekrarlar atılır.
 */
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

function updateCounter() {
    const counter = document.getElementById("counter");
    if (cards.length > 0) {
        counter.textContent = `${currentIndex + 1} / ${cards.length}`;
    } else {
        counter.textContent = "";
    }
}

/**
 * İngilizce cümleyi kelimelere ayırıp her kelimeyi tıklanabilir span yapar.
 */
function showEnglish() {
    showingTurkish = false;
    const card = document.getElementById("card");
    const sentence = cards[currentIndex].english;

    // Tooltip'i gizle
    hideTooltip();

    // Cümleyi kelimelere ve noktalama işaretlerine ayır
    // Regex: kelime (harf + ' + harf) veya noktalama/boşluk
    const tokens = sentence.match(/[\w']+|[^\w']+/g) || [];

    const html = tokens.map(token => {
        // Sadece harflerden oluşan token'ları tıklanabilir yap (2+ harf)
        if (/^[a-zA-Z']{2,}$/.test(token)) {
            const lower = token.toLowerCase();
            return `<span class="word-clickable" data-word="${token}" data-lower="${lower}">${token}</span>`;
        }
        // Noktalama ve boşlukları olduğu gibi ekle
        return token;
    }).join('');

    card.innerHTML = `<h2>${html}</h2>`;

    // Her tıklanabilir kelimeye olay dinleyicisi ekle
    card.querySelectorAll('.word-clickable').forEach(span => {
        span.addEventListener('click', function (e) {
            e.stopPropagation(); // Kart tıklamasını engelle
            const word = this.dataset.word;
            const lower = this.dataset.lower;
            showWordTranslation(lower, word, this);
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
    card.innerHTML = `<p>${cards[currentIndex].turkish}</p>`;
}

/**
 * Bir kelimenin Türkçe çevirisini gösterir.
 */
async function showWordTranslation(lower, originalWord, spanElement) {
    // Önce önbelleğe bak
    if (wordCache[lower]) {
        showTooltip(spanElement, originalWord, wordCache[lower]);
        return;
    }

    // Tooltip'te "yükleniyor" göster
    showTooltip(spanElement, originalWord, "🔄 Çeviriliyor...");

    try {
        // LibreTranslate dene
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
                showTooltip(spanElement, originalWord, translation);
                return;
            }
        }
    } catch (e) {
        // LibreTranslate başarısız, Google Translate dene
    }

    try {
        // Google Translate dene (CORS proxy'siz)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(originalWord)}`;
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            const translation = data[0]?.[0]?.[0] || "";
            if (translation) {
                wordCache[lower] = translation;
                showTooltip(spanElement, originalWord, translation);
                return;
            }
        }
    } catch (e) {
        // Her iki API de başarısız
    }

    showTooltip(spanElement, originalWord, "❌ Çeviri alınamadı");
}

/**
 * Kelimenin üzerinde tooltip gösterir.
 */
function showTooltip(spanElement, word, translation) {
    hideTooltip();

    const tooltip = document.createElement("div");
    tooltip.className = "word-tooltip";
    tooltip.id = "word-tooltip";
    tooltip.innerHTML = `
        <div class="tooltip-content">
            <strong>${word}</strong>
            <span class="tooltip-arrow">→</span>
            <span class="tooltip-translation">${translation}</span>
        </div>
    `;

    // Tooltip'i span'ın üstüne konumlandır
    document.body.appendChild(tooltip);

    const rect = spanElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    // Tooltip'i kelimenin üstüne, ortalanmış şekilde konumlandır
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 10;

    // Taşma kontrolü
    if (left < 5) left = 5;
    if (top < 5) top = rect.bottom + 10; // Üstte yer yoksa alta koy

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
    tooltip.style.opacity = "1";
}

function hideTooltip() {
    const existing = document.getElementById("word-tooltip");
    if (existing) {
        existing.remove();
    }
}

// Kart tıklama — çeviriyi göster/gizle
document.getElementById("card").addEventListener("click", function () {
    // Eğer tooltip açıksa kapat ama kart çevirme
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

// Sonraki kart
document.getElementById("next-btn").addEventListener("click", nextCard);

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

function nextCard() {
    window.speechSynthesis.cancel();
    hideTooltip();
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

loadCards();
