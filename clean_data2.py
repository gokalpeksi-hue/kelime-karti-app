import json, re, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

def clean_meanings(m_list, word):
    result = []
    for m in m_list:
        m = m.strip().rstrip(';.').strip()
        # skip long translations (full sentences)
        if len(m) > 25:
            continue
        # skip pattern-based noisy translations
        lower = m.lower()
        if 'anlam' in lower or 'anlami' in lower:
            continue
        if lower.startswith('bir '):
            continue
        if lower.startswith('isim ') or lower.startswith('noun '):
            continue
        if lower == word.lower():
            continue
        if lower.endswith(' icin') or lower.endswith(' için'):
            continue
        if 'degisikligine' in lower or 'hizlandirilmis' in lower:
            continue
        if 'neden olmak' in lower:
            continue
        if 'etme eylemi' in lower:
            continue
        if any(m.lower() == x.lower() for x in result):
            continue
        result.append(m)
    return result if result else (m_list[:1] if m_list else [word])

for card in data:
    card['meanings'] = clean_meanings(card['meanings'], card['word'])

with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Print summary
stats = {}
for c in data:
    w = c['word']
    if w not in stats:
        stats[w] = {'count': 0, 'meanings': c['meanings']}
    stats[w]['count'] += 1

print(f"OK: {len(data)} kart, {len(stats)} kelime")
for w, s in sorted(stats.items()):
    m = ", ".join(s['meanings'])
    print(f"  {w}: {m}")
