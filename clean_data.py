import json, re

with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

skip_prefixes = ['isim ', 'noun ', 'anlami ', 'anlami', 'anlamı ', 'anlamı']

def clean(m_list, word):
    result = []
    for m in m_list:
        m = m.strip().rstrip(';.').strip()
        
        # Skip if too long (full sentence)
        if len(m) > 35:
            continue
        
        # Skip if starts with skip prefixes
        skip = False
        for p in skip_prefixes:
            if m.lower().startswith(p):
                skip = True
                break
        if skip:
            continue
        
        # Skip if same as original word
        if m.lower() == word.lower():
            continue
        
        # Skip duplicates (case insensitive)
        if any(m.lower() == x.lower() for x in result):
            continue
        
        if m:
            result.append(m)
    
    return result if result else [m_list[0]] if m_list else [word]

for card in data:
    card['meanings'] = clean(card['meanings'], card['word'])

with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("OK:", len(data), "kart")
for c in data[:5]:
    print(f"  {c['word']}: {c['meanings']}")
