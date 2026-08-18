# Prompter — Sese Duyarlı Teleprompter

Toplantılar ve YouTube video çekimleri için bağımsız bir web uygulaması (PWA).
Konuşma metninizi önceden yazarsınız; prompter ekranında metin, kamera
görüntüsünün önünden akar ve ses tanıma sayesinde siz konuştukça konuşma
hızınıza uyum sağlar. Aynı anda video kaydı alınabilir.

## Özellikler

- **Metin editörü ve konuşma arşivi** — metinler tarayıcıda (localStorage) saklanır
- **Kamera önizlemesi** — metin yarı saydam katman olarak kameranın önünden akar
- **Sese duyarlı akış** — Web Speech API (tr-TR) konuşmanızı dinler, okuduğunuz
  kelimeyi vurgulayıp metni tam sizin hızınızda kaydırır
- **Sabit hızlı akış** — ses tanıma desteklemeyen tarayıcılar için
- **Video kaydı** — MediaRecorder ile görüntü+ses; kayıtlar cihazda arşivlenir,
  `.webm` olarak indirilip Google Drive'a yüklenebilir
- **PWA** — ana ekrana ayrı bir uygulama olarak kurulabilir, çevrimdışı açılır

## Çalıştırma

Statik dosyalardır; herhangi bir web sunucusuyla servis edilebilir. Kamera,
mikrofon ve ses tanıma için sayfanın **HTTPS** (veya `localhost`) üzerinden
açılması gerekir. Ses tanıma en iyi Chrome/Edge'de çalışır.

```bash
# yerel deneme
python3 -m http.server 8000
# http://localhost:8000
```

GitHub Pages ile yayınlamak için depo ayarlarından Pages'i açmanız yeterlidir.
