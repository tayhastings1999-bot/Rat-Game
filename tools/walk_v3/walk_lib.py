"""Shared south-walk builder for Scurry painted heroes (walk v2 rules, GAD 18 Nov 2026).
Frames are derived ONLY from the hero's approved painted idle pixels: cut-out layers + whole-pixel rigid moves +
horizontal mirroring of approved leg images. NO limb stretching (no row duplication / row drop on any limb),
no image generation, no new colours, no 3D render (uprightRig v7 / FRAME_TIMING = timing + pose reference only).
All pose numbers are data (cfg['poses']); timing is data (stride + speed profiles)."""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
sys.path.insert(0, '/workspace/scurry-art/pipeline')
from scurrylib import derive_cloth_mask, bleed_pixels
EXP = os.environ.get('SCURRY_IDLE_SPRITES', '/workspace/rg-video/public/sprites')
RINGS = '/workspace/scurry-art/sprites/heroes_v2/painted/{}_ring.png'
W, H, ANCHOR = 128, 160, (64, 150)
YY, XX = np.mgrid[0:H, 0:W]
FL = (28, 40, 40)

def rects(spec):
    m = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in spec: m[y0:y1 + 1, x0:x1 + 1] = True
    return m

def frame_ms(stride, v, n=8): return int(round(min(133, max(40, 1000 * stride / (n * v)))))

def build(cfg, out):
    hid = cfg['hero']; os.makedirs(os.path.join(out, 'frames'), exist_ok=True)
    idle = [np.array(Image.open(f'{EXP}/hero_{hid}_idle_s_{i:02d}.png')) for i in range(16)]
    base = idle[0]; op = base[..., 3] == 255; cloth = derive_cloth_mask(base, hid)
    cols0 = set(map(tuple, np.concatenate([f[f[..., 3] == 255] for f in idle])[:, :3].tolist()))
    ys_, = np.where(op.any(1)); top0, bot0 = int(ys_.min()), int(ys_.max()); height0 = bot0 - top0 + 1
    assert height0 == cfg['locked_height'], (height0, cfg['locked_height'])
    excl = rects(cfg.get('leg_exclude', []))
    # ---- legs: connected components below leg_top, picked by x-range ----
    lt = cfg['leg_top']; cand = op & ~cloth & (YY >= lt) & ~excl
    lab, n = ndimage.label(cand, np.ones((3, 3)))
    def pick(xr):
        best = None
        for i in range(1, n + 1):
            ys, xs = np.where(lab == i)
            if xr[0] <= xs.mean() <= xr[1] and (best is None or len(ys) > best[1]): best = (i, len(ys))
        return lab == best[0]
    legs = {}
    for side in ('A', 'B'):
        LS = cfg['legs'][side]
        if 'rect' in LS:                                       # explicit leg box (crouched / robed heroes)
            c = rects(LS['rect']) & op & ~cloth & ~excl
            if LS.get('no_grey'):                              # keep blades out of the leg (low-sat bright = steel)
                hh = base[..., :3].astype(int); mx_ = hh.max(-1); mn_ = hh.min(-1)
                c &= ~(((mx_ - mn_) < 0.25 * np.maximum(mx_, 1)) & (mx_ > 90))
            l2, n2 = ndimage.label(c, np.ones((3, 3)))
            if n2 > 1 and LS.get('largest', True):
                sz = ndimage.sum(c, l2, range(1, n2 + 1)); c = l2 == (int(np.argmax(sz)) + 1)
        else:
            c = pick(LS['x'])
        if cfg['legs'][side].get('add'): c |= rects(cfg['legs'][side]['add']) & op & ~cloth
        ys, xs = np.where(c); tr = ys.min()
        ext = op & ~cloth & ~excl & (YY >= tr - cfg.get('leg_ext', 3)) & (YY < tr) & (XX >= xs[ys <= tr + 1].min()) & (XX <= xs[ys <= tr + 1].max())
        legs[side] = dict(core=c, layer=c | ext, bottom=int(ys.max()), cx=float(xs[ys >= ys.max() - 3].mean()))
    swap = legs['A']['bottom'] != legs['B']['bottom']
    front = 'A' if legs['A']['bottom'] >= legs['B']['bottom'] else 'B'; back = 'B' if front == 'A' else 'A'
    c2 = int(round(legs['A']['cx'] + legs['B']['cx']))         # mirror x' = c2 - x maps one foot onto the other
    def leg_px(side):
        m = legs[side]['layer']; ys, xs = np.where(m); return ys, xs, base[ys, xs]
    tailz = rects(cfg.get('tail_zone', [])) & ~legs['A']['core'] & ~legs['B']['core']
    fixed = rects(cfg.get('ground_zone', [])) & ~legs['A']['core'] & ~legs['B']['core']   # pixels that stay with the ground
    bodym = op & ~legs['A']['core'] & ~legs['B']['core'] & ~tailz & ~fixed
    planted_row = cfg.get('feet_row', bot0)
    frames, rep, legcanv = [], [], []
    N = len(cfg['poses'])
    headz = rects(cfg.get('head_zone', []))
    for i, p in enumerate(cfg['poses']):
        f = np.zeros_like(base); fills = []
        t = idle[p.get('tail', 0)]
        def put(ys, xs, c, dx=0, dy=0):
            o = np.argsort(ys + dy, kind='stable'); ty = ys[o] + dy; tx = np.clip(xs[o] + dx, 0, W - 1)
            ok = (ty >= 0) & (ty < H); f[ty[ok], tx[ok]] = c[o][ok]
        # ground-side tail / fixed bits (no bob, no sway)
        if not cfg.get('tail_with_body'):
            ys, xs = np.where((t[..., 3] == 255) & tailz); put(ys, xs, t[ys, xs])
        ys, xs = np.where(fixed); put(ys, xs, base[ys, xs])
        # legs: planted side shows the front image on its own spot, other side the back image, lifted rigidly
        ps = p['plant']   # 'A' or 'B' = which side is planted
        for side in ('A', 'B'):
            planted = side == ps
            want = front if planted else back                 # which approved image this side shows
            ys, xs, c = leg_px(want)
            if want != side:
                if not swap: ys, xs, c = leg_px(side)
                else: xs = c2 - xs
            lift = 0 if planted else p['lift']
            put(ys, xs, c, dx=p.get('leg_dx', {}).get(side, 0) if not planted else 0, dy=-lift)
            fh = cfg.get('fill_holes', {}).get(side)
            if fh and swap and want != side:
                # Fill notches in a mirrored leg image (pixels the source leg lost to an occluder, e.g. a blade)
                # with this side's OWN approved idle leg pixels at the same spot; optionally also replace
                # mirrored grey (blade-edge) pixels. Approved pixels only, no stretching.
                M = np.zeros((H, W), bool); ty = ys - lift; ok = (ty >= 0) & (ty < H); M[ty[ok], np.clip(xs[ok], 0, W - 1)] = True
                orig = legs[side]['core']
                fx = f[..., :3].astype(int); mxx = fx.max(-1); mnn = fx.min(-1)
                greyish = ((mxx - mnn) < fh.get('grey_sat', 0.3) * np.maximum(mxx, 1)) & (mxx > fh.get('grey_v', 70))
                for y in range(fh['rows'][0], fh['rows'][1] + 1):
                    xs_row = np.where(M[y])[0]
                    if not len(xs_row) or y + lift >= H: continue
                    span = (XX[y] >= xs_row.min()) & (XX[y] <= xs_row.max() + fh.get('pad_right', 0))
                    if fh.get('own_thigh'):      # upper leg rows: this side's own approved thigh/shin wins outright
                        tgt = orig[y + lift] & (span | orig[y + lift])
                        f[y, tgt] = base[y + lift, tgt]
                        drop = M[y] & ~orig[y + lift] & greyish[y]      # mirrored blade-edge grey left outside it
                        f[y, drop] = 0
                        fills.append(int(tgt.sum()) + int(drop.sum()))
                    else:
                        tgt = orig[y + lift] & span & (~M[y] | (greyish[y] if fh.get('greyfix') else False))
                        f[y, tgt] = base[y + lift, tgt]
                        fills.append(int(tgt.sum()))
        legcanv.append(f.copy())
        # body (+ arms/weapons/tail-with-body) with bob + sway
        b = base.copy(); b[~bodym] = 0
        if cfg.get('tail_with_body'):
            tz = rects(cfg['tail_zone']); b[tz] = 0; b[tz & (t[..., 3] == 255)] = t[tz & (t[..., 3] == 255)]
        for L in cfg.get('swings', []):
            d = p.get(L['name'], 0)
            if not d: continue
            m = rects(L['rect']) & (base[..., 3] == 255) & bodym
            ys, xs = np.where(m); layer = base[ys, xs].copy()
            w = np.clip((ys - L['pivot_y']) / max(1, L['len']), 0, 1) if L.get('pivot_y') is not None else np.ones(len(ys))
            dy = np.round(d * w).astype(int) if L.get('axis', 'y') == 'y' else np.zeros(len(ys), int)
            dx = np.round(d * w).astype(int) if L.get('axis') == 'x' else np.zeros(len(ys), int)
            if L.get('mode', 'cut') == 'cut': b[ys, xs] = 0
            o = np.argsort(ys + dy, kind='stable'); b[ys[o] + dy[o], np.clip(xs[o] + dx[o], 0, W - 1)] = layer[o]
        # If a head zone is set, keep the head out of the bobbed body so it stays planted
        # (slight stabilization). The body/neck still ride the bob; the head uses a reduced dy.
        bob, sway = p.get('bob', 0), p.get('sway', 0)
        if headz.any():
            hm = headz & (b[..., 3] == 255)
            b[hm] = 0
        ys, xs = np.where(b[..., 3] == 255); put(ys, xs, b[ys, xs], dx=sway, dy=bob)
        if headz.any():
            src = base if not cfg.get('tail_with_body') else b
            # Head always comes from the approved idle (base), not a swung body copy.
            hs = headz & (base[..., 3] == 255)
            ys, xs = np.where(hs)
            hbob = int(round(bob * cfg.get('head_bob_mul', 0)))
            put(ys, xs, base[ys, xs], dx=sway, dy=hbob)
        f[f[..., 3] != 255] = 0
        specks = 0
        sc = cfg.get('speck_clean')
        if sc and i in sc.get('frames', range(99)):
            # grey specks = small 8-connected clumps of greyish pixels (in the box) that touch transparency;
            # each speck pixel is replaced by the nearest non-grey approved pixel of the same frame, or
            # cleared if it sits on the silhouette edge with nothing behind it.
            fx = f[..., :3].astype(int); mxx = fx.max(-1); mnn = fx.min(-1); o_ = f[..., 3] == 255
            gr = o_ & ((mxx - mnn) < sc.get('sat', 0.3) * np.maximum(mxx, 1)) & (mxx > sc.get('v', 70)) & rects(sc['box'])
            lab_, n_ = ndimage.label(gr, np.ones((3, 3)))
            for k_ in range(1, n_ + 1):
                comp = lab_ == k_
                if comp.sum() > sc.get('max_px', 6): continue
                ys2, xs2 = np.where(comp); specks += len(ys2)
                src = o_ & ~gr
                for yy, xx in zip(ys2, xs2):
                    near = None
                    for dy_, dx_ in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (-1, 1), (1, -1), (1, 1)):
                        y3, x3 = yy + dy_, xx + dx_
                        if 0 <= y3 < H and 0 <= x3 < W and src[y3, x3]: near = (y3, x3); break
                    if near is None: f[yy, xx] = 0
                    else: f[yy, xx] = f[near]
            o_ = f[..., 3] == 255     # drop any pixel left with no 8-neighbour
            nb = ndimage.convolve(o_.astype(int), np.ones((3, 3), int), mode='constant') - o_
            f[o_ & (nb == 0) & rects(sc['box'])] = 0
        mask = derive_cloth_mask(f, hid)
        mi = np.zeros_like(f); mi[mask] = (255, 0, 0, 255)
        name = f'hero_{hid}_walk_s_{i:02d}'
        Image.fromarray(f, 'RGBA').save(os.path.join(out, 'frames', name + '.png'), optimize=True)
        Image.fromarray(mi, 'RGBA').save(os.path.join(out, 'frames', name + '_m.png'), optimize=True)
        o2 = f[..., 3] == 255; ys, = np.where(o2.any(1))
        rep.append(dict(frame=name, pose=p['key'], top=int(ys.min()), bottom=int(ys.max()), height=int(ys.max() - ys.min() + 1),
            height_delta=int(ys.max() - ys.min() + 1 - height0), hole_fill_px=int(sum(fills)), speck_px=int(specks), opaque=int(o2.sum()), mask_pct=round(float(100 * mask.sum() / o2.sum()), 2),
            bleed_px_tol0=int(bleed_pixels(f, hid, mask, tol=0).sum()), mask_on_transparent=int((mask & ~o2).sum()),
            new_colours=len(set(map(tuple, f[o2][:, :3].tolist())) - cols0), alpha=sorted(np.unique(f[..., 3]).tolist())))
        frames.append(f)
    # planted-foot lock
    lock = {}
    for side in ('A', 'B'):
        pl = [i for i, p in enumerate(cfg['poses']) if p['plant'] == side]
        zx = np.where(legs[side]['core'].any(0))[0]
        x0, x1 = (zx.min(), zx.max())
        if swap and side != front:   # planted side shows the mirrored front image
            fx = np.where(legs[front]['core'].any(0))[0]; x0, x1 = c2 - fx.max(), c2 - fx.min()
        zone = (XX >= x0) & (XX <= x1) & (YY >= planted_row - 5)
        lock[side] = dict(planted_frames=pl, foot_zone=[int(x0), int(planted_row - 5), int(x1), H - 1],
                          identical=bool(all((legcanv[pl[0]][zone] == legcanv[j][zone]).all() for j in pl)),
                          identical_visible=bool(all((frames[pl[0]][zone] == frames[j][zone]).all() for j in pl)),
                          on_feet_row=bool(all((frames[j][planted_row][x0:x1 + 1, 3] == 255).any() for j in pl)))
    prof = {k: frame_ms(cfg['stride_u'], v, N) for k, v in cfg['speed_profiles'].items()}
    ms = prof[cfg['default_profile']]
    table = {
     'meta': dict(app='scurry-anim walk/lib/walk_lib.py', version=cfg['version'], hero=hid, direction='S', spec='PIXEL_STYLE_GUIDE v1.9 §4.2 + GAD walk rules 18 Nov 2026 (±1 px bob, no limb stretch)',
       source=f'scurry-art/sprites/heroes_v2/export/public/sprites/hero_{hid}_idle_s_00..15 (approved painted idle)', ai=True, aiTool=cfg['aiTool'],
       idle_height=height0, idle_feet_row=planted_row, leg_swap_mirror=bool(swap), mirror_sum_x=c2, separate_from='atlas_heroes.json (idle-only package); not merged'),
     'timing': dict(rule='ms = clamp(1000*stride/(N*v), 40, 133)', source='FRAME_TIMING.md v0.5 (slow movement = same frames at a lower rate; < 0.15 u/s -> idle)',
       stride_u=cfg['stride_u'], frames_per_stride=N, clamp_ms=[40, 133], idle_below_u_s=0.15, profiles_ms=prof, default_profile=cfg['default_profile'],
       note='Edit poses / speed_profiles in the hero build script and re-run; no redraw.'),
     'frames': {r['frame']: dict(frame=dict(x=0, y=0, w=W, h=H), sourceSize=dict(w=W, h=H), anchor=dict(x=ANCHOR[0], y=ANCHOR[1]), pivot=dict(x=0.5, y=0.9375),
       ms=ms, ai=True, aiTool=cfg['aiTool'], pose=r['pose'], file=f'frames/{r["frame"]}.png', mask=f'frames/{r["frame"]}_m.png') for r in rep},
     'actions': {f'hero_{hid}_walk_s': dict(frames=[r['frame'] for r in rep], loop=True, ms=[ms] * N, loopMs=ms * N, ms_by_profile={k: [v] * N for k, v in prof.items()})},
     'poses': cfg['poses'],
     'checks': dict(per_frame=rep, planted_foot_lock=lock),
    }
    json.dump(table, open(os.path.join(out, f'atlas_{hid}_walk_s.json'), 'w'), indent=1)
    preview(cfg, out, idle, frames, table)
    return table

def preview(cfg, out, idle, walk, table):
    hid = cfg['hero']; S = 3
    try: ring = Image.open(RINGS.format(cfg['ring'])).convert('RGBA')
    except FileNotFoundError: ring = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    act = table['actions'][f'hero_{hid}_walk_s']
    def cell(a, label):
        b = Image.new('RGBA', (W, H), FL + (255,)); b.alpha_composite(ring); b.alpha_composite(Image.fromarray(a, 'RGBA'))
        b = b.convert('RGB').resize((W * S, H * S), Image.NEAREST); ImageDraw.Draw(b).text((6, 6), label, fill=(230, 230, 230)); return b
    def gif(profile, path, total=2400):
        ms = act['ms_by_profile'][profile][0]; ev = sorted(set(list(range(0, total, 150)) + list(range(0, total, ms)))); fr, du = [], []
        for k, t in enumerate(ev):
            im = Image.new('RGB', (2 * W * S + 8, H * S), (10, 10, 12))
            im.paste(cell(idle[(t // 150) % 16], 'idle (approved) 150 ms'), (0, 0)); im.paste(cell(walk[(t // ms) % len(walk)], f"walk {cfg['version']} {profile}: {ms} ms"), (W * S + 8, 0))
            fr.append(im); du.append((ev[k + 1] if k + 1 < len(ev) else total) - t)
        pal = fr[0].quantize(colors=255, method=Image.MEDIANCUT); q = [x.quantize(palette=pal, dither=Image.Dither.NONE) for x in fr]
        q[0].save(path, save_all=True, append_images=q[1:], duration=du, loop=0, disposal=1)
    gif(cfg['default_profile'], os.path.join(out, 'preview_walk_vs_idle.gif'))
    gif(list(cfg['speed_profiles'])[-1], os.path.join(out, 'preview_walk_vs_idle_slow133.gif'))
    box = cfg['contact_box']; w, h = box[2] - box[0], box[3] - box[1]; Z = 5
    ims = [idle[0]] + walk; lab = ['idle f0'] + [f"{k[-2:]} {table['frames'][k]['pose']}" for k in act['frames']]
    cols = 5 if len(ims) > 7 else 4
    rows = (len(ims) + cols - 1) // cols
    cs = Image.new('RGB', (cols * (w * Z + 8), rows * (h * Z + 8)), (10, 10, 12))
    for k, (a, l) in enumerate(zip(ims, lab)):
        c = Image.fromarray(a, 'RGBA').crop(box); b = Image.new('RGBA', c.size, FL + (255,)); b.alpha_composite(c)
        b = b.convert('RGB').resize((w * Z, h * Z), Image.NEAREST); ImageDraw.Draw(b).text((6, 6), l, fill=(230, 230, 230)); cs.paste(b, ((k % cols) * (w * Z + 8), (k // cols) * (h * Z + 8)))
    cs.save(os.path.join(out, 'contact_walk_5x.png'))
