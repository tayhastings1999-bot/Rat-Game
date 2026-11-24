#!/usr/bin/env python3
"""8-frame south walks from approved painted idle pixels (cut-out / rigid move / mirror).
Adds the missing 'up' / reach pose, lagged tails, opposite arm swing, and slight head
stabilization. No new colours, no limb stretch, canvas 128×160, anchor (64,150).
Run from repo: python3 tools/walk_v3/build_walk_v3.py
"""
import os, sys, json, shutil
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from walk_lib import build, W, H, ANCHOR

AI = ('derived from ai-flagged painted idle pixels (hero_{hid}_idle_s_*, concept origin GenerateImage); '
      'walk frames are script-only cut-out/rigid-move/mirror, no image generator')

# Tail indices lag the body by ~2 idle frames so the tail trails the stride.
# Baked bob is 0 on every pose (v2's ±1 hop read as bounce). Weight is in lift and a 1-px sway.

def tank():
    return dict(hero='tank', version='walk_v3', locked_height=88, ring='red', aiTool=AI.format(hid='tank'),
      leg_top=134, leg_ext=3,
      legs={'A': dict(x=(40, 63)), 'B': dict(x=(73, 92))},
      tail_zone=[(0, 134, 40, 159), (0, 120, 20, 133)],
      head_zone=[(36, 62, 94, 100)], head_bob_mul=0,
      swings=[dict(name='shield', rect=[(22, 84, 50, 133)], mode='overlay'),
              dict(name='hand', rect=[(89, 96, 127, 112), (92, 113, 127, 133)], pivot_y=96, len=22, mode='cut')],
      poses=[
        dict(key='contact_A', plant='A', lift=0, bob=0,  sway=0,  shield=0, hand=1, tail=14),
        dict(key='down_A',    plant='A', lift=2, bob=0,  sway=-1, shield=0, hand=1, tail=1),
        dict(key='pass_A',    plant='A', lift=4, bob=0,  sway=-1, shield=1, hand=0, tail=3),
        dict(key='up_A',      plant='A', lift=2, bob=0,  sway=0,  shield=1, hand=0, tail=5),
        dict(key='contact_B', plant='B', lift=0, bob=0,  sway=0,  shield=1, hand=0, tail=7),
        dict(key='down_B',    plant='B', lift=2, bob=0,  sway=1,  shield=1, hand=0, tail=9),
        dict(key='pass_B',    plant='B', lift=4, bob=0,  sway=1,  shield=0, hand=1, tail=11),
        dict(key='up_B',      plant='B', lift=2, bob=0,  sway=0,  shield=0, hand=1, tail=13),
      ],
      stride_u=2.20, speed_profiles={'base_run_5.6': 5.6, 'slow_run_4.0': 4.0, 'walk_2.75': 2.75},
      default_profile='base_run_5.6', contact_box=(10, 56, 114, 152))

def slinger():
    return dict(hero='slinger', version='walk_v3', locked_height=100, ring='blue', aiTool=AI.format(hid='slinger'),
      leg_top=110, leg_ext=3,
      legs={'A': dict(x=(50, 62)), 'B': dict(x=(63, 75))},
      tail_zone=[(73, 106, 92, 130), (38, 104, 53, 140)], tail_with_body=True,
      head_zone=[(48, 50, 84, 86)], head_bob_mul=0,
      poses=[
        dict(key='contact_B', plant='B', lift=0, bob=0,  sway=0,  tail=14),
        dict(key='down_B',    plant='B', lift=3, bob=0,  sway=1,  tail=1),
        dict(key='pass_B',    plant='B', lift=5, bob=0,  sway=1,  tail=3),
        dict(key='up_B',      plant='B', lift=3, bob=0,  sway=0,  tail=5),
        dict(key='contact_A', plant='A', lift=0, bob=0,  sway=0,  tail=7),
        dict(key='down_A',    plant='A', lift=3, bob=0,  sway=-1, tail=9),
        dict(key='pass_A',    plant='A', lift=5, bob=0,  sway=-1, tail=11),
        dict(key='up_A',      plant='A', lift=3, bob=0,  sway=0,  tail=13),
      ],
      stride_u=2.30, speed_profiles={'base_run_5.6': 5.6, 'slow_run_4.0': 4.0, 'walk_2.88': 2.88},
      default_profile='base_run_5.6', contact_box=(28, 44, 104, 152))

def warlock():
    return dict(hero='warlock', version='walk_v3', locked_height=84, ring='yellow', aiTool=AI.format(hid='warlock'),
      leg_top=140, leg_ext=2,
      leg_exclude=[(34, 60, 41, 159)],
      legs={'A': dict(rect=[(42, 142, 57, 149)]), 'B': dict(rect=[(60, 141, 77, 149)])},
      tail_zone=[(78, 108, 95, 140), (34, 62, 42, 72)], tail_with_body=True,
      head_zone=[(34, 66, 80, 98)], head_bob_mul=0,
      poses=[
        dict(key='contact_B', plant='B', lift=0, bob=0,  sway=0,  tail=14),
        dict(key='down_B',    plant='B', lift=2, bob=0,  sway=1,  tail=1),
        dict(key='pass_B',    plant='B', lift=3, bob=0,  sway=1,  tail=3),
        dict(key='up_B',      plant='B', lift=2, bob=0,  sway=0,  tail=5),
        dict(key='contact_A', plant='A', lift=0, bob=0,  sway=0,  tail=7),
        dict(key='down_A',    plant='A', lift=2, bob=0,  sway=-1, tail=9),
        dict(key='pass_A',    plant='A', lift=3, bob=0,  sway=-1, tail=11),
        dict(key='up_A',      plant='A', lift=2, bob=0,  sway=0,  tail=13),
      ],
      stride_u=2.00, speed_profiles={'base_run_5.6': 5.6, 'slow_run_4.0': 4.0, 'walk_2.5': 2.5},
      default_profile='base_run_5.6', contact_box=(26, 60, 102, 152))

def sneak():
    return dict(hero='sneak', version='walk_v3', locked_height=74, ring='green', aiTool=AI.format(hid='sneak'),
      leg_top=124, leg_ext=3,
      leg_exclude=[(82, 120, 95, 139)],
      legs={'A': dict(rect=[(41, 124, 57, 147)]),
            'B': dict(rect=[(70, 128, 86, 150)], no_grey=True)},
      fill_holes={'A': dict(rows=(124, 138), own_thigh=True)},
      # A-planted frames are 04–07 once the 'up' poses are inserted after each pass.
      speck_clean=dict(frames=[4, 5, 6, 7], box=[(44, 128, 66, 144)], max_px=6),
      tail_zone=[(82, 120, 95, 139)], tail_with_body=True,
      head_zone=[(44, 77, 86, 104)], head_bob_mul=0,
      poses=[
        dict(key='contact_B', plant='B', lift=0, bob=0,  sway=0,  tail=14, dagger_l=0),
        dict(key='down_B',    plant='B', lift=2, bob=0,  sway=1,  tail=1,  dagger_l=1),
        dict(key='pass_B',    plant='B', lift=3, bob=0,  sway=1,  tail=3,  dagger_l=1),
        dict(key='up_B',      plant='B', lift=2, bob=0,  sway=0,  tail=5,  dagger_l=0),
        dict(key='contact_A', plant='A', lift=0, bob=0,  sway=0,  tail=7),
        dict(key='down_A',    plant='A', lift=2, bob=0,  sway=-1, tail=9),
        dict(key='pass_A',    plant='A', lift=3, bob=0,  sway=-1, tail=11),
        dict(key='up_A',      plant='A', lift=2, bob=0,  sway=0,  tail=13),
      ],
      stride_u=2.00, speed_profiles={'base_run_5.6': 5.6, 'slow_run_4.0': 4.0, 'walk_2.5': 2.5},
      default_profile='base_run_5.6', contact_box=(24, 70, 100, 154))

CFGS = [tank, slinger, warlock, sneak]


def pack_atlas(public, tables):
    """Rebuild atlas_heroes.png / _m.png / .json: unchanged idle frames, then 8-frame walks."""
    from PIL import Image
    heroes = ['tank', 'slinger', 'warlock', 'sneak']
    AW, CW, CH = 2048, 128, 160
    old = json.loads((public / 'atlas_heroes.json').read_text())
    frames, acts = {}, {}
    tiles, masks = [], []
    def add(name, im, mk, meta):
        frames[name] = meta
        tiles.append(im)
        masks.append(mk)
    for hid in heroes:
        for i in range(16):
            name = f'hero_{hid}_idle_s_{i:02d}'
            im = Image.open(public / f'{name}.png').convert('RGBA')
            mkp = public / f'{name}_m.png'
            mk = Image.open(mkp).convert('RGBA') if mkp.exists() else Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
            meta = dict(old['frames'][name])
            add(name, im, mk, meta)
        acts[f'hero_{hid}_idle_s'] = old['actions'][f'hero_{hid}_idle_s']
    AI_TOOL = None
    for hid, table in tables:
        act = table['actions'][f'hero_{hid}_walk_s']
        src = HERE / 'out' / hid / 'frames'
        for i, key in enumerate(act['frames']):
            im = Image.open(src / f'{key}.png').convert('RGBA')
            mk = Image.open(src / f'{key}_m.png').convert('RGBA')
            fr = table['frames'][key]
            meta = dict(frame=dict(x=0, y=0, w=CW, h=CH), rotated=False, trimmed=False,
                        spriteSourceSize=dict(x=0, y=0, w=CW, h=CH), sourceSize=dict(w=CW, h=CH),
                        anchor=dict(x=ANCHOR[0], y=ANCHOR[1]), pivot=dict(x=0.5, y=0.9375),
                        ms=fr['ms'], ai=True, aiTool=fr['aiTool'], pose=fr.get('pose'))
            add(key, im, mk, meta)
            AI_TOOL = fr['aiTool']
            # also publish loose frames
            im.save(public / f'{key}.png', optimize=True)
            mk.save(public / f'{key}_m.png', optimize=True)
        acts[f'hero_{hid}_walk_s'] = act
        # drop obsolete 06+ if a future shrink happens; remove leftover 06-only? we now have 00-07
    # remove old loose walk frames that are no longer in the table (none if we only added)
    used = {k for k in frames}
    for p in public.glob('hero_*_walk_s_*.png'):
        stem = p.name[:-4]
        if stem.endswith('_m'):
            key = stem[:-2]
            if key not in used: p.unlink()
        else:
            if stem not in used: p.unlink()

    n = len(tiles)
    cols = AW // CW
    rows = (n + cols - 1) // cols
    used_h = rows * CH
    AH = 1
    while AH < used_h: AH *= 2
    atl = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
    atm = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
    for i, (im, mk) in enumerate(zip(tiles, masks)):
        x, y = (i % cols) * CW, (i // cols) * CH
        atl.paste(im, (x, y)); atm.paste(mk, (x, y))
        frames[list(frames)[i]]['frame'] = dict(x=x, y=y, w=CW, h=CH)
    atl.save(public / 'atlas_heroes.png')
    atm.save(public / 'atlas_heroes_m.png')
    meta = dict(old['meta'])
    meta['app'] = 'scurry tools/walk_v3 pack + build_export idle'
    meta['size'] = dict(w=AW, h=AH)
    meta['image'] = 'atlas_heroes.png'
    meta['mask'] = 'atlas_heroes_m.png'
    meta['spec'] = 'PIXEL_STYLE_GUIDE v1.9 §4.2 + walk_v3 8-frame stride'
    out = dict(frames=frames, actions=acts, meta=meta)
    (public / 'atlas_heroes.json').write_text(json.dumps(out, indent=1) + '\n')
    return dict(frames=n, atlas=(AW, AH), profiles={hid: tables[i][1]['timing']['profiles_ms'] for i, hid in enumerate(heroes)})


def main():
    public = Path('/workspace/rg-video/public/sprites')
    tables = []
    for fn in CFGS:
        cfg = fn()
        out = HERE / 'out' / cfg['hero']
        if out.exists(): shutil.rmtree(out)
        out.mkdir(parents=True)
        t = build(cfg, str(out))
        print(cfg['hero'], t['timing']['profiles_ms'], 'n', len(cfg['poses']))
        bad = [r for r in t['checks']['per_frame'] if r['new_colours'] or r['bleed_px_tol0'] or r['mask_on_transparent'] or r['alpha'] != [0, 255]]
        if bad:
            print('  FAIL checks', bad)
            sys.exit(1)
        lock = t['checks']['planted_foot_lock']
        for side, L in lock.items():
            if not L['on_feet_row']:
                print('  FAIL foot row', side, L); sys.exit(1)
        for r in t['checks']['per_frame']:
            print(' ', {k: r[k] for k in ('frame', 'pose', 'top', 'bottom', 'height', 'height_delta', 'mask_pct', 'new_colours')})
        tables.append((cfg['hero'], t))
    info = pack_atlas(public, tables)
    print('packed', info)


if __name__ == '__main__':
    main()
