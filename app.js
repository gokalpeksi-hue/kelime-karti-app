let cards = [];
let currentIndex = 0;
let showingTurkish = false;
let femaleVoice = null;
let maleVoice = null;

// ——— Varsayılan veriyi yükle ———
async function loadCards() {
    const response = await fetch("data.json");
    cards = await response.json();
    loadVoices();
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
                // CSV dosyası
                data = XLSX.read(loadEvent.target.result, { type: "binary", raw: true });
            } else {
                // Excel dosyası (.xlsx / .xls)
                data = XLSX.read(loadEvent.target.result, { type: "array" });
            }

            const sheet = data.Sheets[data.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            // Başlık satırını atla (varsa), veri satırlarını al
            const rows = json.filter(row => row.length >= 2 && row[0] && row[1]);

            if (rows.length === 0) {
                fileStatus.textContent = "❌ Dosyada geçerli veri bulunamadı!";
                return;
            }

            cards = rows.map(row => ({
                english: String(row[0]).trim(),
                turkish: String(row[1]).trim()
            }));

            currentIndex = 0;
            showEnglish();
            fileStatus.textContent = `✅ ${cards.length} kelime yüklendi: ${file.name}`;
        } catch (err) {
            fileStatus.textContent = "❌ Dosya okunamadı: " + err.message;
        }
    };

    if (file.name.endsWith(".csv")) {
        reader.readAsBinaryString(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
});

function loadVoices() {
    // Mevcut sesleri yükle
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        assignVoices(voices);
        showEnglish();
    } else {
        // voices henüz yüklenmemişse bekle
        window.speechSynthesis.onvoiceschanged = () => {
            const allVoices = window.speechSynthesis.getVoices();
            assignVoices(allVoices);
            showEnglish();
        };
    }
}

function assignVoices(voices) {
    // İngilizce sesleri filtrele
    const englishVoices = voices.filter(v => v.lang.startsWith("en"));

    // Kadın sesi bul (Zira, female vb.)
    femaleVoice = englishVoices.find(v =>
        v.name.toLowerCase().includes("zira") ||
        v.name.toLowerCase().includes("female")
    );

    // Erkek sesi bul (David, Mark, male vb.)
    maleVoice = englishVoices.find(v =>
        v.name.toLowerCase().includes("david") ||
        v.name.toLowerCase().includes("mark") ||
        v.name.toLowerCase().includes("male")
    );

    // Bulunamazsa ilk 2 İngilizce sesi kullan
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

function showEnglish() {
    showingTurkish = false;
    const card = document.getElementById("card");
    card.innerHTML = `<h2>"${cards[currentIndex].english}"</h2>`;
    speakEnglish(cards[currentIndex].english);
    updateCounter();
}

function showTurkish() {
    window.speechSynthesis.cancel();
    showingTurkish = true;
    const card = document.getElementById("card");
    card.innerHTML = `<p>${cards[currentIndex].turkish}</p>`;
}

// Kart tıklama — çeviriyi göster/gizle
document.getElementById("card").addEventListener("click", function () {
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

// Sonraki kart
document.getElementById("next-btn").addEventListener("click", nextCard);

function speakEnglish(text) {
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speech.rate = 0.85;
    speech.pitch = 1;

    // Kadın/erkek ses alternasyonu — kart indeksine göre sabit
    const voice = currentIndex % 2 === 0 ? femaleVoice : maleVoice;
    if (voice) {
        speech.voice = voice;
    }

    window.speechSynthesis.speak(speech);
}

function nextCard() {
    window.speechSynthesis.cancel();
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
