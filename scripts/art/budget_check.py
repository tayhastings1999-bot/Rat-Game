#!/usr/bin/env python3
"""Enforce art/golden/budgets.json on hero art: frame counts, ms, canvas, anchor, heights, feet row, alpha,
mask coverage, atlas page size and AI flag. Read-only.  python3 scripts/art/budget_check.py [--json OUT]
Scope: approved goldens + newer versions of them + any NEW painted frame set (name_vN_fK.png) + the export package."""
import sys, os, re, glob, json, argparse
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scurrylib import *

ACT_RE = re.compile(r'_(idle_mid|idle|fidget|walk|run|attack|special|dodge|squeeze|hurt|death|victory|taunt)(?:_|$)')


def action_of(name):
    if name.endswith('_set') or '_idle_mid_' in name: return 'still'
    m = ACT_RE.search(name)
    return m.group(1) if m else None


def frame_sets():
    """painted sets to check: newest version per family (and any brand-new family)."""
    sets = {}
    for p in glob.glob(os.path.join(PAINTED, '*_f[0-9]*.png')):
        b = os.path.basename(p); m = re.match(r'(.+)_f(\d+)\.png$', b)
        if m: sets.setdefault(m.group(1), []).append((int(m.group(2)), p))
    best = {}
    for name in sets:
        fam, ver = family(name + '.png')
        key = fam or name
        if key not in best or (ver or (0, '')) > best[key][1]: best[key] = (name, ver or (0, ''))
    return {n: sorted(sets[n]) for n, _ in best.values()}


def measure(a):
    op = a[..., 3] > 127
    ys = np.where(op.any(1))[0]
    return dict(height=int(ys.max() - ys.min() + 1) if len(ys) else 0, bottom=int(ys.max()) if len(ys) else -1,
                alpha=sorted(set(np.unique(a[..., 3]).tolist())), size=[a.shape[1], a.shape[0]], opaque=int(op.sum()))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--json'); args = ap.parse_args()
    B = load_json(os.path.join(PIPE, 'budgets.json')); H = B['hero']; A = B['actions']
    fails, opens, ok = [], [], 0
    def F(f, why): fails.append(dict(file=rel(f) if os.path.isabs(f) else f, why=why))
    def frame_checks(p, hero, act, m):
        nonlocal ok
        bad = []
        if m['size'] != H['canvas']: bad.append(f"canvas {m['size']} != {H['canvas']}")
        if not set(m['alpha']) <= set(H['alpha_values']): bad.append(f"non-binary alpha {m['alpha'][:4]}...")
        tol = H['height_tol_px'].get(act, 3)
        if abs(m['height'] - H['heights'][hero]) > tol: bad.append(f"height {m['height']} vs {H['heights'][hero]} (±{tol})")
        if act in H['bottom_row_constant_actions'] and m['bottom'] != H['bottom_row'][hero]: bad.append(f"feet row {m['bottom']} != {H['bottom_row'][hero]}")
        for x in bad: F(p, x)
        if not bad: ok += 1
    # 1. painted stills
    for p in sorted(glob.glob(os.path.join(PAINTED, '*_idle_mid_v4_set.png'))):
        frame_checks(p, hero_of(p), 'still', measure(load_rgba(p)))
    # 2. painted frame sets (newest per family)
    for name, frames in sorted(frame_sets().items()):
        hero = hero_of(name); act = action_of(name)
        if not hero: continue
        if act not in A: opens.append(dict(file=name, why=f'action "{act}" has no budget - needs Rat Leader/Taylor')); continue
        bud = A[act]
        if bud.get('heroes') and hero not in bud['heroes']: opens.append(dict(file=name, why=f'{act} budgeted only for {bud["heroes"]} - new {hero} {act} needs a ruling'))
        if bud.get('status', '').startswith('OPEN'): opens.append(dict(file=name, why=f'{act} budget is OPEN: {bud.get("note","")}'))
        idx = [i for i, _ in frames]
        if len(frames) != bud['frames']: F(name, f"{act}: {len(frames)} frames, budget {bud['frames']}")
        if idx != list(range(len(frames))): F(name, f'frame indices not contiguous: {idx}')
        bottoms = set()
        for _, p in frames:
            m = measure(load_rgba(p)); bottoms.add(m['bottom']); frame_checks(p, hero, act, m)
        if act in H['bottom_row_constant_actions'] and len(bottoms) > 1: F(name, f'feet slide: bottom rows {sorted(bottoms)}')
        sj = os.path.join(PAINTED, name + '_sheet.json')
        if os.path.exists(sj):
            j = load_json(sj); ms = j.get('frameMs', [])
            if j.get('frameCount') != bud['frames']: F(sj, f"frameCount {j.get('frameCount')} != {bud['frames']}")
            exp = bud.get('ms')
            if isinstance(exp, dict): exp = exp.get(hero)
            if isinstance(exp, int): exp = [exp] * bud['frames']
            if exp and ms != exp: F(sj, f'frameMs {ms} != budget {exp}')
            if 'ms_range' in bud and ms and not all(bud['ms_range'][0] <= x <= bud['ms_range'][1] for x in ms): F(sj, f"ms outside {bud['ms_range']}")
            if bud.get('loopMs') and j.get('loopMs') != bud['loopMs']: F(sj, f"loopMs {j.get('loopMs')} != {bud['loopMs']}")
            if j.get('anchor') and list(j['anchor']) != H['anchor']: F(sj, f"anchor {j['anchor']} != {H['anchor']}")
            if 'ai' not in j: F(sj, 'missing ai disclosure flag (D13)')
        else:
            opens.append(dict(file=name, why='no _sheet.json - timing not machine-checkable'))
    # 3. export package
    aj = os.path.join(EXPORT_SPRITES, 'atlas_heroes.json')
    if os.path.exists(aj):
        j = load_json(aj); mx = B['atlas']['max_page']
        for pg in glob.glob(os.path.join(EXPORT_SPRITES, 'atlas_*.png')):
            w, h = Image.open(pg).size
            if w > mx[0] or h > mx[1]: F(pg, f'atlas page {w}x{h} > {mx}')
            if B['atlas']['power_of_two'] and (w & (w - 1) or h & (h - 1)): F(pg, f'atlas page {w}x{h} not power of two')
        for k, fr in j['frames'].items():
            miss = [x for x in B['atlas']['frame_fields_required'] if x not in fr]
            if miss: F(aj, f'{k} missing {miss}')
            if [fr['frame']['w'], fr['frame']['h']] != H['canvas']: F(aj, f'{k} frame size')
            if [fr['anchor']['x'], fr['anchor']['y']] != H['anchor']: F(aj, f'{k} anchor')
        for an, act in j['actions'].items():
            a_ = action_of(an + '_'); hero = hero_of(an + '_')
            bud = A.get(a_)
            if not bud: opens.append(dict(file=an, why='atlas action has no budget')); continue
            if len(act['frames']) != bud['frames']: F(aj, f"{an}: {len(act['frames'])} frames, budget {bud['frames']}")
            exp = bud.get('ms'); exp = exp.get(hero) if isinstance(exp, dict) else exp
            if isinstance(exp, int) and any(x != exp for x in act['ms']): F(aj, f"{an}: ms {set(act['ms'])} != {exp}")
            if bud.get('loopMs') and act.get('loopMs') != bud['loopMs']: F(aj, f"{an}: loopMs {act.get('loopMs')}")
        cov = B['mask_coverage_pct']
        for p in sorted(glob.glob(os.path.join(EXPORT_SPRITES, 'hero_*_[0-9][0-9].png'))):
            hero = hero_of(p); act = action_of(os.path.basename(p)); m = measure(load_rgba(p)); frame_checks(p, hero, act, m)
            mp = p[:-4] + '_m.png'
            if not os.path.exists(mp): F(p, 'missing _m mask'); continue
            mm = load_rgba(mp); c = 100 * float((mm[..., 0] == 255).sum()) / max(1, m['opaque'])
            if act == 'idle' and not cov[hero][0] <= c <= cov[hero][1]: F(mp, f'mask coverage {c:.2f}% outside {cov[hero]}')
            if ((mm[..., 0] == 255) & (load_rgba(p)[..., 3] == 0)).any(): F(mp, 'mask on transparent pixel')
    # 3b. animation walk folders (<SCURRY_WALK_DIR>/<hero>/frames + atlas_*_walk_*.json beside it).
    # Rat-Game: no default (scurry-anim is not on CI). gate.sh stages public/sprites/hero_*_walk_* into this
    # shape with scripts/art/stage_walks.py and sets SCURRY_WALK_DIR only when walk frames exist.
    # If SCURRY_WALK_DIR is set but holds no walk frames, that is a FAIL, never a silent pass.
    WALK = os.environ.get('SCURRY_WALK_DIR')
    if WALK is not None and not glob.glob(os.path.join(WALK, '*', 'frames', 'hero_*_walk_*_[0-9][0-9].png')):
        F(WALK or '(empty SCURRY_WALK_DIR)', 'SCURRY_WALK_DIR is set but no walk frames (<hero>/frames/hero_*_walk_*_NN.png) were found')
    for fd in sorted(glob.glob(os.path.join(WALK, '*', 'frames'))) if WALK else []:
        hd = os.path.dirname(fd); act = 'walk'; bud = A.get(act, {})
        pngs = sorted(x for x in glob.glob(os.path.join(fd, 'hero_*_walk_*_[0-9][0-9].png')))
        if not pngs: opens.append(dict(file=fd, why='walk folder has no frames')); continue
        hero = hero_of(pngs[0])
        if len(pngs) != bud.get('frames', len(pngs)): F(fd, f"walk: {len(pngs)} frames, budget {bud.get('frames')}")
        mmin = B.get('mask_min_pct', 2.0)
        for p in pngs:
            a = load_rgba(p); m = measure(a); frame_checks(p, hero, act, m)
            if m['bottom'] != H['bottom_row'][hero]: F(p, f"planted foot row {m['bottom']} != idle feet row {H['bottom_row'][hero]}")
            mp = p[:-4] + '_m.png'
            if not os.path.exists(mp): F(p, 'missing _m mask'); continue
            mm = load_rgba(mp); on = mm[..., 0] == 255
            c = 100 * float(on.sum()) / max(1, m['opaque'])
            if c < mmin: F(mp, f'mask coverage {c:.2f}% < {mmin}%')
            if (on & (a[..., 3] == 0)).any(): F(mp, 'mask on transparent pixel')
        for aj in glob.glob(os.path.join(hd, 'atlas_*_walk_*.json')):
            j = load_json(aj); r = bud.get('ms_range', [50, 133])
            for an, ac in j.get('actions', {}).items():
                if len(ac.get('frames', [])) != bud.get('frames', 6): F(aj, f"{an}: {len(ac.get('frames', []))} frames")
                if not all(r[0] <= x <= r[1] for x in ac.get('ms', [])): F(aj, f"{an}: ms {ac.get('ms')} outside {r}")
            for k, fr in j.get('frames', {}).items():
                if [fr['anchor']['x'], fr['anchor']['y']] != H['anchor']: F(aj, f'{k} anchor')
                if 'ai' not in fr: F(aj, f'{k} missing ai disclosure flag (D13)')
    # 4. known open items
    for r in B['rings']['files']:
        if os.path.exists(ab(r)) and list(Image.open(ab(r)).size) != B['rings']['size']:
            opens.append(dict(file=r, why=f"ring is {Image.open(ab(r)).size}, locked size {B['rings']['size']} (re-cut pending)")); 
    res = dict(command='budget', pass_=not fails, ok_frames=ok, fail=fails, open=opens)
    if args.json: save_json(args.json, res)
    print(f"budget check: {ok} frame(s) within budget, {len(fails)} FAIL, {len(opens)} open item(s)")
    for x in fails: print(f"  FAIL {x['file']}: {x['why']}")
    for x in opens: print(f"  OPEN {x['file']}: {x['why']}")
    print('  =>', 'PASS' if not fails else 'FAIL')
    return 0 if not fails else 1


if __name__ == '__main__':
    sys.exit(main())
