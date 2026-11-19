#!/usr/bin/env python3
"""Golden-image + colour-bleed guard for Scurry hero art (PIXEL_STYLE_GUIDE v1.9 §4.2, DECISIONS.md).

  python3 scripts/art/golden.py init                 # seed goldens from the approved list (only if manifest is empty)
  python3 scripts/art/golden.py check  [--json OUT]  # approved files + newer versions vs goldens (exact px diff)
  python3 scripts/art/golden.py bleed  [--json OUT]  # player-hue pixels outside each hero's cloth mask must be 0
  python3 scripts/art/golden.py approve <file>... [--status approved|provisional] [--by Taylor] [--note "..."]
  python3 scripts/art/golden.py selftest             # proves the checks catch drift/bleed (in memory, touches nothing)

Rules enforced:
 * An approved file whose pixels differ from its golden snapshot FAILS, unless every changed pixel lies inside a
   region listed for that file in art/golden/allowed_changes.json (region + reason + date + requested_by).
 * A newer version of an approved file (same name, higher _vNx tag, e.g. slinger_idle_v2_f3 vs slinger_idle_v1_f3)
   is diffed against the golden the same way.
 * Any PNG in export/public/sprites that has no golden FAILS (unapproved art in the ship package).
 * Bleed: visible player-hue pixels outside the approved cloth mask (+1 px edge) = 0; cloth coverage within
   ±COV_TOL percentage points of the golden; for changed files, 0 new player-hue colours outside the cloth.
Read-only on art. Writes only under art/golden/ and scripts/out/. No image generation.
"""
import sys, os, json, glob, fnmatch, re, argparse, datetime
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scurrylib import *

MANIFEST = os.path.join(PIPE, 'golden_manifest.json')
ALLOWED = os.path.join(PIPE, 'allowed_changes.json')
SNAPDIR = os.path.join(PIPE, 'snapshots')
MASKDIR = os.path.join(PIPE, 'masks')
COV_TOL = 1.5          # percentage points of cloth coverage drift allowed vs golden (scarf flutter etc.)
MOVE_TOL = 4           # px a cloth cluster may move and still count as the approved cloth
TODAY = datetime.date.today().isoformat()

# ---- the approved list (DECISIONS.md R-list; brief of 2026-11-18) ----
INITIAL = [
  # (glob, status, note)   repo-relative (Rat-Game); painted sources stay in scurry-art
  ('public/sprites/*.png', 'approved', 'Idle-only export package (spritelint-green 29 Oct 2026); handed to OverLord'),
  ('public/sprites/atlas_heroes.json', 'approved', 'Atlas frame table (sha only)'),
  ('scripts/spritelint.mjs', 'approved', 'Patched spritelint (v1.9 §4.2) - sha pinned so the lint cannot be weakened silently'),
]


def load_manifest():
    return load_json(MANIFEST, {'version': 1, 'spec': 'PIXEL_STYLE_GUIDE v1.9 §4.2', 'files': {}})


def kind_of(rp):
    b = os.path.basename(rp)
    if not rp.endswith('.png'): return 'file'
    if b.startswith('atlas_'): return 'atlas_mask' if b.endswith('_m.png') else 'atlas'
    if b.endswith('_m.png'): return 'mask'
    if b.endswith('_sheet.png'): return 'sheet'
    if b.endswith('_set.png'): return 'still'
    return 'frame'


def cloth_mask_for(rp, a, hero):
    """Approved cloth mask: the export's own _m map when it exists, else the build_export.py derivation."""
    p = ab(rp)
    sib = p[:-4] + '_m.png'
    if os.path.exists(sib):
        m = load_rgba(sib)
        if m.shape[:2] == a.shape[:2]: return m[..., 0] == 255, 'export _m map'
    return derive_cloth_mask(a, hero), 'derived (build_export.py logic)'


def snapshot(rp, entry_extra=None):
    p = ab(rp)
    e = dict(path=rp, sha256=file_sha(p), kind=kind_of(rp), hero=hero_of(p))
    if p.endswith('.png'):
        a = load_rgba(p); ps = pixel_sha(a)
        os.makedirs(SNAPDIR, exist_ok=True); os.makedirs(MASKDIR, exist_ok=True)
        snap = os.path.join(SNAPDIR, ps[:24] + '.png')
        if not os.path.exists(snap): Image.fromarray(a, 'RGBA').save(snap)   # lossless per-pixel copy
        e.update(pixel_sha=ps, size=[a.shape[1], a.shape[0]], snapshot=rel(snap),
                 opaque_px=int((a[..., 3] > 127).sum()), colours=int(len(np.unique(a[a[..., 3] > 127][:, :3], axis=0))))
        if e['hero'] and e['kind'] in ('frame', 'still', 'sheet'):
            m, src = cloth_mask_for(rp, a, e['hero'])
            mp = os.path.join(MASKDIR, ps[:24] + '_cloth.png')
            Image.fromarray((m * 255).astype(np.uint8), 'L').save(mp)
            e.update(cloth_mask=rel(mp), cloth_mask_source=src,
                     cloth_cov_pct=round(100 * m.sum() / max(1, e['opaque_px']), 3))
        fam, ver = family(os.path.basename(rp))
        if fam: e.update(family=os.path.join(os.path.dirname(rp), fam), version=list(ver))
    if entry_extra: e.update(entry_extra)
    return e


def approve(files, status, by, note, quiet=False):
    man = load_manifest()
    for f in files:
        p = ab(f)
        if not os.path.exists(p): print('missing:', f); continue
        rp = rel(os.path.abspath(p)); old = man['files'].get(rp)
        e = snapshot(rp, dict(status=status, approved_by=by, approved_on=TODAY, note=note))
        if old:
            e['history'] = old.get('history', []) + [dict(pixel_sha=old.get('pixel_sha'), sha256=old['sha256'],
                                                        approved_on=old.get('approved_on'), status=old.get('status'))]
            if old.get('sha256') == e['sha256']: e['history'] = old.get('history', []); e['approved_on'] = old.get('approved_on')
        man['files'][rp] = e
        if not quiet: print(('refreshed ' if old else 'approved  ') + rp, status)
    man['updated'] = TODAY
    save_json(MANIFEST, man)
    return man


def cmd_init(_):
    man = load_manifest()
    if man['files']:
        print('manifest already has', len(man['files']), 'goldens; use approve <file> to add/refresh'); return 0
    n = 0
    for g, status, note in INITIAL:
        fs = sorted(glob.glob(os.path.join(ART, g)))
        if not fs: print('WARN no files for', g)
        for f in fs:
            if rel(f) in load_manifest()['files']: continue
            approve([f], status, 'Taylor' if status == 'approved' else 'pending Taylor', note, quiet=True); n += 1
    print('seeded', n, 'goldens ->', rel(MANIFEST)); return 0


# ---------------- allowed changes ----------------
def load_allowed():
    d = load_json(ALLOWED, {'changes': []}); errs = []
    for i, c in enumerate(d.get('changes', [])):
        miss = [k for k in ('file', 'reason', 'date', 'requested_by') if not c.get(k)]
        if not (c.get('regions') or c.get('region')): miss.append('region(s)')
        if c.get('date') and not re.match(r'^\d{4}-\d{2}-\d{2}$', c['date']): miss.append('date format YYYY-MM-DD')
        if miss: errs.append(f'allowed_changes[{i}] invalid: missing {", ".join(miss)}')
    return d.get('changes', []), errs


def allowed_for(rp, chmask, changes):
    regs = []; reasons = []
    for c in changes:
        if fnmatch.fnmatch(rp, c['file']) or fnmatch.fnmatch(os.path.basename(rp), c['file']):
            for r in (c.get('regions') or [c['region']]): regs.append(r)
            reasons.append(f"{c['reason']} ({c['requested_by']}, {c['date']})")
            if c.get('max_pixels') is not None and chmask.sum() > c['max_pixels']: return False, reasons, 'exceeds max_pixels'
    if not regs: return False, [], 'no allow entry'
    ok = np.zeros_like(chmask)
    for x0, y0, x1, y1 in regs: ok[y0:y1 + 1, x0:x1 + 1] = True
    out = chmask & ~ok
    if out.any():
        ys, xs = np.where(out)
        return False, reasons, f'{int(out.sum())} changed px outside allowed region(s), bbox [{xs.min()},{ys.min()},{xs.max()},{ys.max()}]'
    return True, reasons, ''


# ---------------- discovery of newer versions / unknown export files ----------------
def newer_versions(man):
    fams = {}
    for rp, e in man['files'].items():
        if e.get('family') and rp.endswith('.png'):
            cur = fams.get(e['family'])
            if not cur or tuple(e['version']) > tuple(man['files'][cur]['version']): fams[e['family']] = rp
    out = []
    dirs = {os.path.dirname(f) for f in fams}
    for d in dirs:
        for p in glob.glob(os.path.join(ART, d, '*.png')):
            rp = rel(p)
            if rp in man['files']: continue
            fam, ver = family(os.path.basename(p))
            if not fam: continue
            key = os.path.join(d, fam)
            if key in fams and ver > tuple(man['files'][fams[key]]['version']): out.append((rp, fams[key]))
    return sorted(out)


def unknown_export(man):
    return sorted(rel(p) for p in glob.glob(os.path.join(EXPORT_SPRITES, '*.png')) if rel(p) not in man['files'])


def golden_pixels(e):
    return load_rgba(ab(e['snapshot']))


# ---------------- check ----------------
def cmd_check(args):
    man = load_manifest(); changes, aerr = load_allowed()
    res = dict(command='check', fail=[], allowed=[], ok=0, reencoded=[], review=[], errors=aerr)
    def compare(rp, e, label):
        p = ab(rp)
        if not os.path.exists(p): res['fail'].append(dict(file=rp, why='approved file missing')); return
        if label == 'golden' and file_sha(p) == e['sha256']: res['ok'] += 1; return
        if not rp.endswith('.png'):
            res['fail'].append(dict(file=rp, why='non-image approved file changed (sha256 mismatch)')); return
        a = load_rgba(p); g = golden_pixels(e)
        if a.shape != g.shape:
            res['fail'].append(dict(file=rp, against=e['path'], why=f'canvas changed {g.shape[1]}x{g.shape[0]} -> {a.shape[1]}x{a.shape[0]}')); return
        d = diff(a, g)
        if d['changed'] == 0:
            if label == 'golden': res['reencoded'].append(rp); res['ok'] += 1
            else: res['ok'] += 1   # identical copy under a new version name
            return
        ok, reasons, why = allowed_for(rp, d['mask'], changes)
        item = dict(file=rp, against=e['path'], changed_px=d['changed'], bbox_xyxy=d['bbox'],
                    status=e.get('status'), allowed_by=reasons)
        if ok: res['allowed'].append(item)
        else: item['why'] = why; res['fail'].append(item)
    for rp, e in sorted(man['files'].items()): compare(rp, e, 'golden')
    for rp, grp in newer_versions(man): compare(rp, man['files'][grp], 'newer')
    # new-version frames with no golden counterpart (e.g. a 20-frame v2 of a 16-frame v1) need a look
    fams_dirs = {os.path.dirname(k) for k in man['files']}
    for rp in unknown_export(man): res['fail'].append(dict(file=rp, why='PNG in ship package has no golden (unapproved art)'))
    if aerr: res['fail'] += [dict(file='art/golden/allowed_changes.json', why=x) for x in aerr]
    res['newer_versions_checked'] = len(newer_versions(man)); res['goldens'] = len(man['files'])
    res['pass'] = not res['fail']
    report(res, args)
    return 0 if res['pass'] else 1


# ---------------- bleed ----------------
def bleed_one(a, hero, gmask=None, gcov=None, gcolours=None):
    """Returns dict(bleed_px, bbox, cov_pct, cov_delta, foreign_clusters, new_tint_px)."""
    op = a[..., 3] > 127; opn = max(1, int(op.sum()))
    der = derive_cloth_mask(a, hero)
    foreign = 0
    if gmask is not None:
        near = ndimage.binary_dilation(gmask, structure=np.ones((3, 3)), iterations=MOVE_TOL)
        lab, n = ndimage.label(der, structure=np.ones((3, 3)))
        okl = [i for i in range(1, n + 1) if (near & (lab == i)).any()]
        foreign = n - len(okl)
        # cloth may move up to MOVE_TOL px from the approved mask (flutter); anything beyond that is growth = bleed
        cloth = (np.isin(lab, okl) & near) | (gmask & op)
    else:
        cloth = der
    b = bleed_pixels(a, hero, cloth)
    cov = 100 * float((cloth & op).sum()) / opn
    out = dict(bleed_px=int(b.sum()), foreign_clusters=int(foreign), cov_pct=round(cov, 2))
    if b.any():
        ys, xs = np.where(b); out['bbox_xyxy'] = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
    if gcov is not None: out['cov_delta'] = round(cov - gcov, 2)
    if gcolours is not None:   # new player-band colours (guide's wide test S>.08,V>.1) outside the cloth
        h, s, v = hsv(a); wide = op & BANDS[hero](h) & (s > .08) & (v > .1) & ~ndimage.binary_dilation(cloth, iterations=1)
        cols = a[..., :3][wide]
        if len(cols):
            gset = gcolours
            new = np.array([tuple(c) not in gset for c in map(tuple, cols)])
            out['new_tint_px'] = int(new.sum())
        else: out['new_tint_px'] = 0
    return out


def cmd_bleed(args):
    man = load_manifest(); budgets = load_json(os.path.join(PIPE, 'budgets.json'), {})
    covr = budgets.get('mask_coverage_pct', {})
    res = dict(command='bleed', fail=[], ok=0, review=[], checked=0)
    def colours_of(g):
        return set(map(tuple, g[g[..., 3] > 127][:, :3].tolist()))
    def judge(rp, a, hero, e, changed):
        gm = (np.array(Image.open(ab(e['cloth_mask']))) > 0) if e and e.get('cloth_mask') else None
        gc = e.get('cloth_cov_pct') if e else None
        gcol = colours_of(golden_pixels(e)) if (e and changed) else None
        r = bleed_one(a, hero, gm, gc, gcol); res['checked'] += 1
        why = []
        if r['bleed_px']: why.append(f"{r['bleed_px']} visible {hero} player-hue px outside cloth mask")
        if r['foreign_clusters']: why.append(f"{r['foreign_clusters']} player-hue cluster(s) away from the approved cloth")
        if gc is not None and abs(r.get('cov_delta', 0)) > COV_TOL: why.append(f"cloth coverage {r['cov_pct']}% vs golden {gc}% (> ±{COV_TOL}pp)")
        if gm is None and hero in covr and e is None and kind_of(rp) == 'frame':
            lo, hi = covr[hero]
            if not lo <= r['cov_pct'] <= hi: why.append(f"cloth coverage {r['cov_pct']}% outside budget {lo}-{hi}%")
        if r.get('new_tint_px'): why.append(f"{r['new_tint_px']} new player-hue colour px outside cloth (tint)")
        item = dict(file=rp, hero=hero, **r)
        if why: item['why'] = '; '.join(why); res['fail'].append(item)
        else: res['ok'] += 1
        if gm is None: res['review'].append(dict(file=rp, why='no golden cloth mask: bleed judged on derived mask only - needs a taste call'))
    for rp, e in sorted(man['files'].items()):
        if not (e.get('hero') and e.get('kind') in ('frame', 'still', 'sheet')) or not os.path.exists(ab(rp)): continue
        a = load_rgba(ab(rp)); changed = file_sha(ab(rp)) != e['sha256']
        judge(rp, a, e['hero'], e, changed)
    for rp, grp in newer_versions(man):
        e = man['files'][grp]
        if e.get('hero') and e.get('kind') in ('frame', 'still', 'sheet'): judge(rp, load_rgba(ab(rp)), e['hero'], e, True)
    for rp in unknown_export(man):
        h = hero_of(rp)
        if h and kind_of(rp) == 'frame': judge(rp, load_rgba(ab(rp)), h, None, True)
    res['pass'] = not res['fail']
    report(res, args)
    return 0 if res['pass'] else 1


def report(res, args):
    if getattr(args, 'json', None): save_json(args.json, res)
    c = res['command']
    if c == 'check':
        print(f"golden check: {res['goldens']} goldens, {res['newer_versions_checked']} newer version(s); "
              f"{res['ok']} identical, {len(res['allowed'])} allowed change(s), {len(res['fail'])} FAIL")
        for x in res['reencoded']: print('  note re-encoded (pixels identical):', x)
        for x in res['allowed']: print(f"  ALLOWED {x['file']}: {x['changed_px']} px bbox {x['bbox_xyxy']} - {'; '.join(x['allowed_by'])}")
    else:
        print(f"bleed check: {res['checked']} hero image(s); {res['ok']} clean, {len(res['fail'])} FAIL")
    for x in res['fail']:
        extra = f" {x['changed_px']} px bbox {x['bbox_xyxy']}" if 'changed_px' in x else ''
        print(f"  FAIL {x['file']}:{extra} {x.get('why','')}")
    for x in res.get('review', []): print(f"  REVIEW {x['file']}: {x['why']}")
    print('  =>', 'PASS' if res['pass'] else 'FAIL')


# ---------------- selftest ----------------
def cmd_selftest(_):
    man = load_manifest(); ok = True
    def t(name, cond):
        nonlocal ok; ok &= bool(cond); print(('  pass ' if cond else '  FAIL ') + name)
    def ent(pat):
        return next(e for k, e in sorted(man['files'].items()) if fnmatch.fnmatch(k, pat))
    tank = ent('*hero_tank_idle_s_00.png'); sneak = ent('*hero_sneak_idle_s_00.png'); war = ent('*hero_warlock_idle_s_00.png')
    def args_of(e):
        g = golden_pixels(e); m = np.array(Image.open(ab(e['cloth_mask']))) > 0
        return g, m, e['cloth_cov_pct'], set(map(tuple, g[g[..., 3] > 127][:, :3].tolist()))
    g, m, c, cols = args_of(tank)
    r = bleed_one(g, 'tank', m, c, cols); t('approved tank f0 is clean', r['bleed_px'] == 0 and r['foreign_clusters'] == 0 and r['new_tint_px'] == 0)
    b = g.copy(); b[110:113, 60:63, :3] = (200, 30, 30)   # 3x3 scarf-red blob on the belly
    r = bleed_one(b, 'tank', m, c, cols); t(f'3x3 red belly blob caught (bleed {r["bleed_px"]} px)', r['bleed_px'] >= 9)
    d = diff(b, g); t(f'golden diff counts 9 px, bbox {d["bbox"]}', d['changed'] == 9 and d['bbox'] == [60, 110, 62, 112])
    okk, _, why = allowed_for('x.png', d['mask'], [dict(file='x.png', region=[60, 110, 62, 112], reason='t', date='2026-11-18', requested_by='Taylor')])
    t('allowed region covering the change passes', okk)
    okk, _, why = allowed_for('x.png', d['mask'], [dict(file='x.png', region=[60, 110, 61, 112], reason='t', date='2026-11-18', requested_by='Taylor')])
    t(f'allowed region 1 px short fails ({why})', not okk)
    g, m, c, cols = args_of(sneak)
    b = g.copy(); op = b[..., 3] > 127
    torso = op & ~m & (g[..., :3].max(-1) > 40)   # every lit fur pixel turned green (the 'all green Sneak' failure)
    lum = b[..., :3].astype(float).mean(-1)
    b[torso, 0] = (lum[torso] * .4).astype(np.uint8); b[torso, 1] = np.clip(lum[torso] * 1.6 + 40, 0, 255).astype(np.uint8); b[torso, 2] = (lum[torso] * .4).astype(np.uint8)
    r = bleed_one(b, 'sneak', m, c, cols); t(f'"Sneak all green" torso caught (bleed {r["bleed_px"]} px, cov {r["cov_pct"]}% vs golden {c}%)', r['bleed_px'] > 0)
    b = g.copy(); arm = np.zeros_like(op); arm[112:128, 30:44] = True; arm &= op & ~m & (g[..., :3].max(-1) > 40)
    b[arm, 0] = (lum[arm] * .4).astype(np.uint8); b[arm, 1] = np.clip(lum[arm] * 1.6 + 40, 0, 255).astype(np.uint8); b[arm, 2] = (lum[arm] * .4).astype(np.uint8)
    r = bleed_one(b, 'sneak', m, c, cols); t(f'green tint on one Sneak arm caught (bleed {r["bleed_px"]} px, {int(arm.sum())} px painted)', r['bleed_px'] > 0)
    g, m, c, cols = args_of(war)
    b = g.copy(); blk = np.zeros_like(m); blk[100:108, 40:60] = True; blk &= (b[..., 3] > 127) & ~m
    b[blk, :3] = (215, 180, 40)                          # wide yellow belt block
    r = bleed_one(b, 'warlock', m, c, cols); t(f'warlock yellow belt block caught (bleed {r["bleed_px"]} px, cov delta {r["cov_delta"]}pp)', r['bleed_px'] > 0)
    b = g.copy(); sh = np.roll(g, 1, axis=1); d = diff(sh, g)
    t(f'1-px shift of whole sprite detected ({d["changed"]} px)', d['changed'] > 0)
    print('selftest', 'PASS' if ok else 'FAIL'); return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest='cmd', required=True)
    sp.add_parser('init')
    for n in ('check', 'bleed'):
        x = sp.add_parser(n); x.add_argument('--json')
    x = sp.add_parser('approve'); x.add_argument('files', nargs='+'); x.add_argument('--status', default='approved', choices=['approved', 'provisional'])
    x.add_argument('--by', default='Taylor'); x.add_argument('--note', default='')
    sp.add_parser('selftest')
    a = ap.parse_args()
    if a.cmd == 'approve':
        approve(a.files, a.status, a.by, a.note); return 0
    return dict(init=cmd_init, check=cmd_check, bleed=cmd_bleed, selftest=cmd_selftest)[a.cmd](a)


if __name__ == '__main__':
    sys.exit(main())
