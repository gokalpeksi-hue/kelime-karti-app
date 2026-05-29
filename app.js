let cards = [];
let currentIndex = 0;
let showingTurkish = false;
let femaleVoice = null;
let maleVoice = null;

async function loadCards() {
    const response = await fetch("data.json");
    cards = await response.json();
    loadVoices();
}

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

function showEnglish() {
    showingTurkish = false;
    const card = document.getElementById("card");
    card.innerHTML = `<h2>"${cards[currentIndex].english}"</h2>`;
    speakEnglish(cards[currentIndex].english);
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
