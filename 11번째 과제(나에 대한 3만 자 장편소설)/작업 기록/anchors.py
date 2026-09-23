import re, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = sys.argv[1]
text = open(path, encoding='utf-8').read()
m = re.search(r'\[\[ALEPH_BODY_START\]\](.*)\[\[ALEPH_BODY_END\]\]', text, re.S)
body = m.group(1)

# split into chapters
chapter_splits = re.split(r'^# (\d+장\..*)$', body, flags=re.M)
# chapter_splits[0] is empty/prefix, then alternating title, content
chapters = []
for i in range(1, len(chapter_splits), 2):
    title = chapter_splits[i].strip()
    content = chapter_splits[i+1]
    paras = [p.strip() for p in re.split(r'\n\s*\n', content) if p.strip()]
    chapters.append((title, paras))

for idx, (title, paras) in enumerate(chapters, start=1):
    print(f'CH{idx:02d} - {title} - paragraphs: {len(paras)}')
    for pi, p in enumerate(paras, start=1):
        snippet = p[:24].replace('\n',' ')
        print(f'  P{pi:03d}: {snippet}...')
