#!/usr/bin/env python3
"""Summarise a gate run (scripts/out/art) into PASS/FAIL + 'exceptions for Taylor'. Used by gate.sh."""
import sys, os, json, re, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scurrylib import PIPE, load_json

R = sys.argv[1]
rc = dict(l.strip().split('=') for l in open(os.path.join(R, 'rc.txt')) if '=' in l)
log = open(os.path.join(R, 'gate.log')).read()
g = load_json(os.path.join(R, 'golden.json'), {}); b = load_json(os.path.join(R, 'bleed.json'), {})
u = load_json(os.path.join(R, 'budget.json'), {})
man = load_json(os.path.join(PIPE, 'golden_manifest.json'), {'files': {}})
m = re.search(r'spritelint: (\d+) file\(s\), (\d+) failing', log)
lint = f'{m.group(1)} files, {m.group(2)} failing' if m else 'no summary line'
st = re.search(r'selftest (PASS|FAIL)', log)
rows = [
 ('spritelint', rc.get('spritelint') == '0', lint),
 ('golden check', rc.get('golden') == '0', f"{g.get('goldens',0)} goldens, {g.get('newer_versions_checked',0)} newer version(s), {len(g.get('allowed',[]))} allowed change(s), {len(g.get('fail',[]))} fail"),
 ('bleed check', rc.get('bleed') == '0', f"{b.get('checked',0)} hero images, {len(b.get('fail',[]))} with player colour outside the cloth"),
 ('budget check', rc.get('budget') == '0', f"{u.get('ok_frames',0)} frames in budget, {len(u.get('fail',[]))} fail, {len(u.get('open',[]))} open"),
 ('guard selftest', rc.get('selftest') == '0', st.group(0) if st else 'no result'),
]
ok = all(r[1] for r in rows)
now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M %Z').strip() or datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
print(f"SCURRY ART GATE  {now} ET  =>  {'PASS' if ok else 'FAIL'}")
for n, p, d in rows: print(f"  [{'PASS' if p else 'FAIL'}] {n}: {d}")
exc = []
for x in g.get('fail', []): exc.append(f"FAIL golden: {x['file']} - {x.get('changed_px','')} px {x.get('bbox_xyxy','') or ''} {x.get('why','')}".replace('  ', ' '))
for x in b.get('fail', []): exc.append(f"FAIL bleed: {x['file']} - {x['why']}")
for x in u.get('fail', []): exc.append(f"FAIL budget: {x['file']} - {x['why']}")
if rc.get('spritelint') != '0': exc.append('FAIL spritelint: see scripts/out/art/gate.log')
if rc.get('selftest') != '0': exc.append('FAIL guard selftest: the checks themselves are broken - do not trust this run')
for x in g.get('allowed', []): exc.append(f"LOOK allowed change: {x['file']} ({x['changed_px']} px, {'; '.join(x['allowed_by'])}) - approve with golden.py approve once Taylor signs off")
taste = []
prov = sorted({re.sub(r'_f\d+\.png$|_sheet\.png$', '', os.path.basename(k)) for k, e in man['files'].items() if e.get('status') == 'provisional'})
if prov: taste.append(f"TASTE provisional (sent, awaiting Taylor's OK on cleanups): {', '.join(prov)}")
seen = set()
for x in b.get('review', []):
    k = x['why']
    if k not in seen: taste.append(f"TASTE {x['file']}: {x['why']}"); seen.add(k)
for x in u.get('open', []):
    if 'OPEN' in x['why'] or 'ruling' in x['why'] or 'no budget' in x['why']: taste.append(f"TASTE budget: {x['file']} - {x['why']}")
known = [f"{x['file']}: {x['why']}" for x in u.get('open', []) if 'ring' in x['why']]
print('Exceptions for Taylor:' if (exc or taste) else 'Exceptions for Taylor: none')
for e in exc + taste: print('  - ' + e)
if known:
    print(f'Known open work (no decision needed): {len(known)} item(s)')
    for k in known: print('  - ' + k)
print('Details: scripts/out/art/{gate.log,golden.json,bleed.json,budget.json}')
sys.exit(0 if ok else 1)
