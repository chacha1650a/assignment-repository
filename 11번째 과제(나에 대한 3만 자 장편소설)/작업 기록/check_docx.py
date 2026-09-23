import sys, unicodedata, re
from docx import Document

path = sys.argv[1]
doc = Document(path)

paras = [p.text for p in doc.paragraphs]
# also walk tables? no, body markers are only in top-level paragraphs

start_idx = None
end_idx = None
for idx, t in enumerate(paras):
    if t.strip() == '[[ALEPH_BODY_START]]':
        start_idx = idx
    if t.strip() == '[[ALEPH_BODY_END]]':
        end_idx = idx

print('start_idx', start_idx, 'end_idx', end_idx)
print('start count', sum(1 for t in paras if t.strip()=='[[ALEPH_BODY_START]]'))
print('end count', sum(1 for t in paras if t.strip()=='[[ALEPH_BODY_END]]'))

body_paras = paras[start_idx+1:end_idx]
body_text = '\n\n'.join(body_paras)
nfc = unicodedata.normalize('NFC', body_text)
nospace = ''.join(ch for ch in nfc if not ch.isspace())
print('body paragraphs (non-empty):', len([p for p in body_paras if p.strip()]))
print('nospace len:', len(nospace))

chapters = [t for t in body_paras if re.match(r'^\d+장\.', t.strip())]
print('chapter count:', len(chapters))
for c in chapters:
    print(' -', c)

for bad in ['TODO','TBD']:
    print(bad, sum(t.count(bad) for t in body_paras))
print('FIXME', sum(len(re.findall('(?i)fixme', t)) for t in body_paras))
