#!/usr/bin/env python3
"""Preview builder for PRs / Taylor reviews. Read-only on art; writes to scripts/out/art/previews/ (or --out).

  python3 scripts/art/preview.py idle            # the 4 current hero idles (+ a lineup GIF)
  python3 scripts/art/preview.py fidget          # Sewer Rat belly-scratch
  python3 scripts/art/preview.py slinger_idle_v1 # one frame set by name
  python3 scripts/art/preview.py 'sprites/heroes_v2/painted/sneak_idle_v1_f*.png'   # any glob
  python3 scripts/art/preview.py export          # every action in export/public/sprites/atlas_heroes.json

Per set: <set>_preview.gif (nearest-neighbour 3x, transparent -> dark bg, real per-frame ms) and
<set>_contact_5x.png (lossless 5x contact sheet, frame index + ms under each frame).
Timing source, in order: <set>_sheet.json frameMs, atlas_heroes.json action ms, budgets.json action ms, 150.
GIF note: a GIF frame holds 256 colours; the soft painted frames have 1-3k, so each GIF frame gets its own
max-coverage palette with NO dithering (the max error is printed, ~5/255). The contact sheet is exact. No image generation.
"""
import sys, os, re, glob, json, argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scurrylib import *

BG = (22, 20, 28)          # dark review background (close to Void/Sewer Slate)
LABEL = (200, 196, 210)
OUT = os.path.join(ART, 'scripts', 'out', 'art', 'previews')
CURRENT_IDLES = ['sewer_rat_idle_v4g', 'slinger_idle_v1', 'sneak_idle_v1', 'warlock_idle_v1']


def nat(p):
    m = re.search(r'_f?(\d+)\.png$', p); return int(m.group(1)) if m else 0


def timing(name, n, files):
    sj = os.path.join(os.path.dirname(files[0]), name + '_sheet.json')
    if os.path.exists(sj):
        ms = load_json(sj).get('frameMs')
        if ms and len(ms) == n: return ms, os.path.basename(sj)
    aj = load_json(os.path.join(EXPORT_SPRITES, 'atlas_heroes.json'), {})
    for an, act in aj.get('actions', {}).items():
        if an == name and len(act['ms']) == n: return act['ms'], 'atlas_heroes.json'
    B = load_json(os.path.join(PIPE, 'budgets.json'), {})
    for k, v in B.get('actions', {}).items():
        if f'_{k}' in name:
            ms = v.get('ms')
            if isinstance(ms, dict): ms = ms.get(hero_of(name + '_'))
            if isinstance(ms, int): return [ms] * n, 'budgets.json'
            if isinstance(ms, list) and len(ms) == n: return ms, 'budgets.json'
    return [150] * n, 'default 150'


def on_bg(a):
    bg = Image.new('RGBA', (a.shape[1], a.shape[0]), BG + (255,))
    return Image.alpha_composite(bg, Image.fromarray(a, 'RGBA')).convert('RGB')


def gif(frames_rgb, ms, path, scale=3):
    """Per-frame 256-colour palette (MAXCOVERAGE, no dither): keeps every colour within a few levels, so the
    player colours (e.g. the Warlock's small yellow rope) are not shifted. Returns the max channel error."""
    q, err = [], 0
    for f in frames_rgb:
        p = f.quantize(colors=256, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE)
        err = max(err, int(np.abs(np.array(p.convert('RGB')).astype(int) - np.array(f).astype(int)).max()))
        q.append(p.resize((f.width * scale, f.height * scale), Image.NEAREST))
    q[0].save(path, save_all=True, append_images=q[1:], duration=list(ms), loop=0, optimize=False, disposal=1)
    return err


def contact(frames_rgb, ms, path, title, scale=5, per_row=8):
    try: font = ImageFont.load_default(size=14)
    except TypeError: font = ImageFont.load_default()
    w, h = frames_rgb[0].width * scale, frames_rgb[0].height * scale
    rows = (len(frames_rgb) + per_row - 1) // per_row; cols = min(per_row, len(frames_rgb)); pad, lab, top = 6, 20, 24
    im = Image.new('RGB', (cols * (w + pad) + pad, top + rows * (h + lab + pad) + pad), (10, 9, 14))
    d = ImageDraw.Draw(im); d.text((pad, 4), title, fill=LABEL, font=font)
    for i, f in enumerate(frames_rgb):
        x = pad + (i % per_row) * (w + pad); y = top + (i // per_row) * (h + lab + pad)
        im.paste(f.resize((w, h), Image.NEAREST), (x, y)); d.text((x + 4, y + h + 2), f'f{i}  {ms[i]} ms', fill=LABEL, font=font)
    im.save(path, optimize=True)


def build(name, files, out):
    files = sorted(files, key=nat)
    arrs = [load_rgba(p) for p in files]
    ms, src = timing(name, len(files), files)
    rgb = [on_bg(a) for a in arrs]
    os.makedirs(out, exist_ok=True)
    g = os.path.join(out, f'{name}_preview.gif'); c = os.path.join(out, f'{name}_contact_5x.png')
    e = gif(rgb, ms, g)
    contact(rgb, ms, c, f'{name}  {len(files)} frames  loop {sum(ms)} ms  (timing: {src})')
    print(f'{name}: {len(files)} frames, {sum(ms)} ms/loop ({src}); GIF max colour error {e}/255 -> {rel(g)}, {rel(c)}')
    return dict(name=name, files=[rel(p) for p in files], ms=ms, gif=g, contact=c, rgb=rgb)


def set_files(name):
    fs = glob.glob(os.path.join(PAINTED, name + '_f[0-9]*.png'))
    if not fs: fs = glob.glob(os.path.join(EXPORT_SPRITES, name + '_[0-9][0-9].png'))
    return fs


def lineup(results, out, fname):
    """Side-by-side lineup GIF of several sets on one clock (frame ms must match)."""
    n = max(len(r['rgb']) for r in results); ms = results[0]['ms']
    if any(r['ms'] != ms for r in results): print('lineup skipped: sets have different timing'); return None
    W = sum(r['rgb'][0].width for r in results); Hh = results[0]['rgb'][0].height
    frames = []
    for i in range(n):
        im = Image.new('RGB', (W, Hh), BG); x = 0
        for r in results: im.paste(r['rgb'][i % len(r['rgb'])], (x, 0)); x += r['rgb'][0].width
        frames.append(im)
    p = os.path.join(out, fname); e = gif(frames, ms, p); print(f'lineup (GIF max colour error {e}/255) ->', rel(p)); return p


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('target'); ap.add_argument('--out', default=OUT); a = ap.parse_args()
    t = a.target
    if t == 'idle':
        rs = [build(n, set_files(n), a.out) for n in CURRENT_IDLES]
        lineup(rs, a.out, 'all_heroes_idle_lineup_preview.gif')
    elif t == 'fidget':
        build('sewer_rat_fidget_scratch_v1', set_files('sewer_rat_fidget_scratch_v1'), a.out)
    elif t == 'export':
        aj = load_json(os.path.join(EXPORT_SPRITES, 'atlas_heroes.json'))
        for an, act in aj['actions'].items():
            build(an, [os.path.join(EXPORT_SPRITES, f + '.png') for f in act['frames']], a.out)
    elif any(ch in t for ch in '*?['):
        fs = glob.glob(ab(t)); 
        if not fs: sys.exit(f'no files match {t}')
        name = re.sub(r'_f?\d+\.png$', '', os.path.basename(sorted(fs, key=nat)[0]))
        build(name, fs, a.out)
    else:
        fs = set_files(t)
        if not fs: sys.exit(f'no frame set named {t}')
        build(t, fs, a.out)


if __name__ == '__main__':
    main()
