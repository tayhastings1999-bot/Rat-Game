#!/usr/bin/env python3
"""Build the art-gate PR comment: animated GIFs of changed sprite sets + before/after frames for golden changes.
Used by the art-preview CI job (.github/workflows/qa.yml). Read-only on art; writes to --out only.

  python3 scripts/art/pr_preview.py --changed changed.txt --base origin/main --out scripts/out/art/pr \
      [--url-prefix https://raw.githubusercontent.com/OWNER/REPO/art-previews/pr-N/SHA] [--summary scripts/out/art/summary.txt]

changed.txt holds one repo-relative path per line (the PR's changed files).
* Every changed PNG under public/sprites/ is grouped into its frame set (name_NN.png, masks skipped) and the
  WHOLE set is rendered as a GIF (3x, real ms from atlas_heroes.json / budgets.json) + 5x contact sheet.
* Before/after: for each changed sprite with a golden, the golden snapshot (before) next to the PR pixels (after)
  plus a red diff overlay; for each golden refresh (art/golden/golden_manifest.json entry whose pixel_sha changed vs
  --base) the base snapshot (before) next to the new snapshot (after).
Writes comment.md (with the marker <!-- art-gate-preview -->) next to the images.
"""
import sys, os, re, io, json, argparse, subprocess
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scurrylib import *
import preview as pv

MARKER = '<!-- art-gate-preview -->'
MAX_SETS = 12           # keep the comment reviewable in ~10 s
MAX_PAIRS = 16


def git_show(ref, path):
    try: return subprocess.run(['git', 'show', f'{ref}:{path}'], cwd=ART, capture_output=True, check=True).stdout
    except subprocess.CalledProcessError: return None


def set_name(rp):
    b = os.path.basename(rp)
    if not b.endswith('.png') or b.endswith('_m.png'): return None
    m = re.match(r'(.+?)_(\d+)\.png$', b)
    return m.group(1) if m else b[:-4]


def pair_image(before, after, scale=3):
    """before | after | diff (changed px in red over a dimmed after). Arrays RGBA; sizes may differ."""
    tiles = [pv.on_bg(before), pv.on_bg(after)]
    if before.shape == after.shape:
        d = diff(after, before)
        ov = np.array(pv.on_bg(after)).astype(float) * .35
        if d['changed']: ov[d['mask']] = (255, 40, 40)
        tiles.append(Image.fromarray(ov.astype(np.uint8)))
        n = d['changed']
    else:
        n = None
    W = sum(t.width for t in tiles) + 6 * (len(tiles) - 1); H = max(t.height for t in tiles)
    im = Image.new('RGB', (W, H), (10, 9, 14)); x = 0
    for t in tiles: im.paste(t, (x, 0)); x += t.width + 6
    return im.resize((im.width * scale, im.height * scale), Image.NEAREST), n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--changed', required=True); ap.add_argument('--base', default='origin/main')
    ap.add_argument('--out', default=os.path.join(ART, 'scripts', 'out', 'art', 'pr'))
    ap.add_argument('--url-prefix', default=''); ap.add_argument('--summary', default='')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    changed = [l.strip() for l in open(a.changed) if l.strip()]
    url = (lambda f: f"{a.url_prefix.rstrip('/')}/{f}") if a.url_prefix else (lambda f: f)
    md = [MARKER, '### 🐀 Art gate preview', '']
    if a.summary and os.path.exists(a.summary):
        md += ['```', open(a.summary).read().strip(), '```', '']

    # 1) animated GIFs of every changed frame set (whole set, so the loop can be judged)
    sets = {}
    for rp in changed:
        if not rp.startswith('public/sprites/'): continue
        n = set_name(rp)
        if n: sets.setdefault(n, None)
    gifs = []
    for name in sorted(sets)[:MAX_SETS]:
        fs = sorted(glob.glob(os.path.join(EXPORT_SPRITES, name + '_[0-9][0-9].png')))
        if not fs:
            p = os.path.join(EXPORT_SPRITES, name + '.png')
            if not os.path.exists(p) or name.startswith('atlas_'): continue
            fs = [p]
        r = pv.build(name, fs, a.out)
        gifs.append((name, len(fs), sum(r['ms']), os.path.basename(r['gif']), os.path.basename(r['contact'])))
    if gifs:
        md += ['#### Changed sprite sets (GIF at 3×, real timing)', '', '| set | preview | contact sheet (5×) |', '|---|---|---|']
        md += [f"| `{n}` · {k} frames · {ms} ms | ![{n}]({url(g)}) | [contact sheet]({url(c)}) |" for n, k, ms, g, c in gifs]
        if len(sets) > MAX_SETS: md.append(f'\n_…and {len(sets) - MAX_SETS} more set(s); see the art-gate artifact._')
        md.append('')

    # 2) before/after frames
    man = load_json(os.path.join(PIPE, 'golden_manifest.json'), {'files': {}})
    pairs = []
    for rp in changed:                                   # changed sprites vs their golden
        e = man['files'].get(rp)
        if not (e and rp.endswith('.png') and e.get('snapshot') and os.path.exists(ab(rp))): continue
        before = load_rgba(ab(e['snapshot'])); after = load_rgba(ab(rp))
        if before.shape == after.shape and diff(after, before)['changed'] == 0: continue
        pairs.append((rp, 'golden → PR', before, after))
    if 'art/golden/golden_manifest.json' in changed:      # golden refreshes vs base branch
        raw = git_show(a.base, 'art/golden/golden_manifest.json')
        old = json.loads(raw) if raw else None
        if old is None:
            md += [f"_Golden manifest introduced on this branch ({len(man['files'])} goldens); no base to compare._", '']
        for rp, e in sorted(man['files'].items() if old else []):
            o = old['files'].get(rp)
            if not e.get('snapshot') or (o and o.get('pixel_sha') == e.get('pixel_sha')): continue
            ob = git_show(a.base, o['snapshot']) if o and o.get('snapshot') else None
            before = np.array(Image.open(io.BytesIO(ob)).convert('RGBA')) if ob else np.zeros((1, 1, 4), np.uint8)
            pairs.append((rp, 'golden refresh (base → new)' if o else 'NEW golden', before, load_rgba(ab(e['snapshot']))))
    if pairs:
        md += ['#### Before / after', '', '_before · after · changed pixels in red_', '', '| file | change | before · after · diff |', '|---|---|---|']
        for i, (rp, kind, b, af) in enumerate(pairs[:MAX_PAIRS]):
            im, n = pair_image(b, af); fn = f'pair_{i:02d}_{os.path.basename(rp)}'
            im.save(os.path.join(a.out, fn), optimize=True)
            md.append(f"| `{rp}` | {kind}{'' if n is None else f' · {n} px'} | ![{rp}]({url(fn)}) |")
        if len(pairs) > MAX_PAIRS: md.append(f'\n_…and {len(pairs) - MAX_PAIRS} more; see the art-gate artifact._')
        md.append('')
    if not gifs and not pairs: md += ['_No changed sprite frames to preview._', '']
    md.append('<sub>Posted by the art-preview job (scripts/art/pr_preview.py). Golden changes never qualify for auto-merge.</sub>')
    open(os.path.join(a.out, 'comment.md'), 'w').write('\n'.join(md) + '\n')
    print(f'{len(gifs)} GIF set(s), {len(pairs)} before/after pair(s) -> {rel(os.path.join(a.out, "comment.md"))}')


if __name__ == '__main__':
    main()
