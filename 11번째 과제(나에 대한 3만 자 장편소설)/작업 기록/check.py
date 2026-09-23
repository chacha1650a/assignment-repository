import re, unicodedata, sys

path = sys.argv[1]
text = open(path, encoding='utf-8').read()
m = re.search(r'\[\[ALEPH_BODY_START\]\](.*)\[\[ALEPH_BODY_END\]\]', text, re.S)
body = m.group(1)
nfc = unicodedata.normalize('NFC', body)
nospace = ''.join(ch for ch in nfc if not ch.isspace())
print('raw len:', len(body))
print('nospace len (C05 target >=30000):', len(nospace))

chapters = re.findall(r'^# (\d+장\..*)$', body, re.M)
print('chapter count (C06 target >=10):', len(chapters))
for c in chapters:
    print(' -', c)

# check empty chapters (C07): split by chapter heading
parts = re.split(r'^# \d+장\..*$', body, flags=re.M)
parts = [p.strip() for p in parts if p.strip()]
print('non-empty chapter body blocks:', len(parts))

for bad in ['TODO', 'TBD']:
    print(bad, 'count:', body.count(bad))
import re as re2
fixme = re2.findall(r'(?i)fixme', body)
print('FIXME count:', len(fixme))
for phrase in ['자리 표시', '내용 추가 예정']:
    print(phrase, 'count:', body.count(phrase))

starts = len(re.findall(r'\[\[ALEPH_BODY_START\]\]', text))
ends = len(re.findall(r'\[\[ALEPH_BODY_END\]\]', text))
print('START marker count:', starts, 'END marker count:', ends)

# duplicate paragraph check (paragraphs = blank-line separated blocks, len>40 after normalize)
paras = [p.strip() for p in re.split(r'\n\s*\n', body) if p.strip()]
def norm(p):
    import unicodedata as ud
    p2 = ud.normalize('NFKC', p).lower()
    p2 = ''.join(ch for ch in p2 if not ch.isspace() and not unicodedata.category(ch).startswith('P'))
    return p2

seen = {}
dups = []
for i, p in enumerate(paras):
    n = norm(p)
    if len(n) > 40:
        if n in seen:
            dups.append((seen[n], i))
        else:
            seen[n] = i
print('total paragraphs:', len(paras))
print('duplicate paragraph pairs:', dups)
