"""
data.json'daki her cumle icin anahtar kelimeyi cikarir,
Google Translate API ile Turkce anlamlarini alir,
yeni formatta zenginlestirilmis data.json olusturur.

Yeni format:
{
  "word": "accelerate",
  "meanings": ["hizlandirmak", "ivme kazandirmak", "hizlanmak"],
  "sentence": "We need to accelerate our 5G strategy...",
  "turkish": "5G stratejimizi hizlandirmamiz gerekiyor..."
}
"""
import json, requests, re, sys, time

# Windows terminal icin
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

STOP_WORDS = {
    'the','a','an','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','shall',
    'should','may','might','must','can','could','need','dare',
    'to','of','in','for','on','with','at','by','from','up',
    'about','into','over','after','all','also','and','as','but',
    'or','so','if','no','not','our','out','we','what','when',
    'where','which','who','why','how','this','that','these','those',
    'it','its','i','you','he','she','they','me','him','her',
    'them','my','your','his','their','here','there','then','than',
    'very','just','each','any','some','every','both','more','most',
    'other','such','only','own','same','too','under','through',
    'between','before','during','without','within','across','against',
    'because','while','since','until','once','though','yet','new',
    'now','well','back','even','still','already','always','never',
    'often','ever','again','quite','really','almost','nearly',
    'phase','protocol','guideline','segment','update','targeting',
    'per','as','via','due','strict'
}

BUSINESS_WORDS = [
    'accelerate','strategy','penetration','disrupt','ecosystem',
    'deployment','throughput','latency','infrastructure','overhaul',
    'router','modem','specification','architecture','pipeline',
    'sourcing','teardown','localizing','optimize','compliance',
    'exemption','sample','timeline','assembly','quality',
    'logistics','partnership','synergize','exclusivity',
    'hedging','volatility','feasibility','contingency',
    'mitigate','expense','profitability','metric','incentive',
    'turnover','inventory','distribution',
    'rollout','proposal','regulatory','permit',
    'customer','leverage','brand','label',
    'monitor','scraper','tracking','premium','share',
    'distributor','margin','stability','segment',
    'capture','evaluate','analyze','transition',
    'support','overcome','schedule','approval',
    'align','impact','conduct','grant','depend',
    'cooperate','maintain','expand',
    'review','prepare','present','address',
    'summarize','assign','elaborate',
    'finalize','sustain','hedge','expose'
]

def extract_keyword(sentence):
    """Cumleden en anlamli anahtar kelimeyi cikar."""
    clean = re.sub(r'[^\w\s]', ' ', sentence)
    words = [w.lower() for w in clean.split() if re.match(r'^[a-zA-Z]{3,}$', w)]
    
    # Once business kelimeleri kontrol et
    biz = [w for w in words if w in BUSINESS_WORDS]
    if biz:
        biz.sort(key=len, reverse=True)
        return biz[0]
    
    # Stop words'suz en uzun kelime
    cand = [w for w in words if w not in STOP_WORDS and len(w) >= 4]
    if not cand:
        cand = [w for w in words if len(w) >= 4]
    if not cand:
        cand = words
    if not cand:
        return ""
    cand.sort(key=len, reverse=True)
    return cand[0]

def translate(word):
    """Google Translate API ile tek ceviri al."""
    try:
        r = requests.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client":"gtx","sl":"en","tl":"tr","dt":"t","q":word},
            timeout=8
        )
        if r.ok:
            data = r.json()
            return data[0][0][0].strip() if data and data[0] and data[0][0] else ""
    except:
        pass
    return ""

def get_meanings(word):
    """Bir kelime icin birden fazla Turkce anlam bul."""
    results = []
    
    # 1. Direkt ceviri
    t1 = translate(word)
    if t1: results.append(t1)
    time.sleep(0.2)
    
    # 2. Fiil formu
    t2 = translate(f"to {word}")
    if t2 and t2 not in results and t2.lower() != word.lower(): results.append(t2)
    time.sleep(0.2)
    
    # 3. Isim formu
    t3 = translate(f"noun {word}")
    if t3 and t3 not in results and t3.lower() != word.lower(): results.append(t3)
    time.sleep(0.2)
    
    # 4. Sifat/form
    t4 = translate(f"{word} meaning")
    if t4 and t4 not in results and t4.lower() != word.lower(): results.append(t4)
    time.sleep(0.2)
    
    # 5. Definition tabanli - kisaca
    try:
        r = requests.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}", timeout=8)
        if r.ok:
            data = r.json()
            if data:
                for meaning in data[0].get('meanings', []):
                    for def_item in meaning.get('definitions', []):
                        d = def_item.get('definition','')
                        if d and len(d) < 60:
                            time.sleep(0.2)
                            td = translate(d)
                            if td and td not in results:
                                results.append(td)
                            break  # Sadece ilk definition
                    if len(results) >= 8:
                        break
    except:
        pass
    
    if not results:
        results = [t1] if t1 else [word]
    
    return results

def main():
    with open('data.json', 'r', encoding='utf-8') as f:
        old_data = json.load(f)
    
    print(f"Toplam {len(old_data)} kart okundu.")
    
    new_data = []
    cache = {}  # word -> [meanings]
    
    for i, card in enumerate(old_data):
        sentence = card.get('english','').strip()
        turkish = card.get('turkish','').strip()
        if not sentence: continue
        
        keyword = extract_keyword(sentence)
        if not keyword:
            keyword = sentence.split()[0].lower() if sentence.split() else "unknown"
        
        if keyword in cache:
            meanings = cache[keyword]
            print(f"[{i+1}/{len(old_data)}] '{keyword}' (cache)")
        else:
            meanings = get_meanings(keyword)
            cache[keyword] = meanings
            print(f"[{i+1}/{len(old_data)}] '{keyword}' -> {meanings}")
        
        new_data.append({
            "word": keyword,
            "meanings": meanings,
            "sentence": sentence,
            "turkish": turkish
        })
    
    # Ayni kelime icin tum anlamlari birlestir
    groups = {}
    for c in new_data:
        groups.setdefault(c['word'], []).append(c)
    
    for word, cards in groups.items():
        all_m = []
        for c in cards:
            for m in c['meanings']:
                if m not in all_m: all_m.append(m)
        for c in cards:
            c['meanings'] = all_m
    
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)
    
    print(f"\nDone! {len(new_data)} kart, {len(groups)} benzersiz kelime.")
    for word, cards in sorted(groups.items()):
        print(f"  {word}: {cards[0]['meanings']} ({len(cards)} kart)")

if __name__ == '__main__':
    main()
