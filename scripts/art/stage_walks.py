#!/usr/bin/env python3
"""Stage Rat-Game's flat walk sprites into the folder shape the art pipeline's walk checks expect.

  python3 scripts/art/stage_walks.py OUT_DIR

public/sprites/hero_<hero>_walk_<dir>_NN.png (+ _m.png)   ->  OUT_DIR/<hero>/frames/ (symlinks, assets never moved)
public/sprites/atlas_heroes.json walk actions + frames    ->  OUT_DIR/<hero>/atlas_<hero>_walk_<dir>.json
Prints the number of staged frames; exit 0 always (budget_check.py fails if SCURRY_WALK_DIR has no frames).
"""
import os, re, sys, glob, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scurrylib import EXPORT_SPRITES, load_json

RE = re.compile(r'^hero_([a-z]+)_walk_([a-z]+)_(\d\d)\.png$')


def main():
    out = os.path.abspath(sys.argv[1])
    atlas = load_json(os.path.join(EXPORT_SPRITES, 'atlas_heroes.json'), {'frames': {}, 'actions': {}})
    sets = {}
    for p in sorted(glob.glob(os.path.join(EXPORT_SPRITES, 'hero_*_walk_*_[0-9][0-9].png'))):
        m = RE.match(os.path.basename(p))
        if m: sets.setdefault((m.group(1), m.group(2)), []).append(p)
    n = 0
    for (hero, d), files in sorted(sets.items()):
        fd = os.path.join(out, hero, 'frames'); os.makedirs(fd, exist_ok=True)
        for p in files:
            for src in (p, p[:-4] + '_m.png'):
                if not os.path.exists(src): continue
                dst = os.path.join(fd, os.path.basename(src))
                if os.path.lexists(dst): os.remove(dst)
                os.symlink(src, dst)
            n += 1
        an = f'hero_{hero}_walk_{d}'
        act = atlas.get('actions', {}).get(an)
        j = dict(meta=dict(source='public/sprites/atlas_heroes.json (staged by scripts/art/stage_walks.py)'),
                 actions={an: act} if act else {},
                 frames={k: v for k, v in atlas.get('frames', {}).items() if k.startswith(an + '_')})
        with open(os.path.join(out, hero, f'atlas_{hero}_walk_{d}.json'), 'w') as f: json.dump(j, f, indent=1)
    print(f'staged {n} walk frame(s) in {len(sets)} set(s) -> {out}')


if __name__ == '__main__':
    main()
