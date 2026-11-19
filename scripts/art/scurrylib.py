"""Shared helpers for the Scurry art pipeline (PIXEL_STYLE_GUIDE v1.9 §4.2).
Read-only on art: nothing in here writes to sprites/. No image generation."""
import os, re, json, glob, hashlib
import numpy as np
from PIL import Image
from scipy import ndimage

# Rat-Game CI port of scurry-art/pipeline (Game Art Director, LOW_OVERSIGHT_SPEC §a).
# Repo mapping: scurry-art export/public/sprites/X -> public/sprites/X, pipeline/ -> art/golden/.
# ART is the repo root; override with SCURRY_REPO only for sandbox tests.
ART = os.path.abspath(os.environ.get('SCURRY_REPO', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))
PIPE = os.path.join(ART, 'art', 'golden')          # manifest, snapshots, masks, budgets, allowed changes
PAINTED = os.path.join(ART, 'art', 'painted')      # painted sources are not in this repo (glob finds nothing)
EXPORT = ART
EXPORT_SPRITES = os.path.join(ART, 'public', 'sprites')

# hero ids: painted/ uses sewer_rat, export/ uses tank
HERO_ALIASES = {'sewer_rat': 'tank', 'tank': 'tank', 'slinger': 'slinger', 'sneak': 'sneak', 'warlock': 'warlock'}
# Player-hue bands + core saturation: identical to export/build_export.py (B, SM) and painted/build_v4.py (PH, PSMIN)
BANDS = {'tank': lambda h: (h <= 6.5) | (h >= 349), 'slinger': lambda h: (h >= 195) & (h <= 265),
         'warlock': lambda h: (h >= 38) & (h <= 62), 'sneak': lambda h: (h >= 70) & (h <= 170)}
CORE_SAT = {'tank': .78, 'slinger': .3, 'sneak': .3, 'warlock': .3}
# "Visible" player colour: chroma (max-min of RGB) at or above this. Near-black outline/shadow pixels whose
# faint hue happens to fall in the band (chroma <= 60 in the approved art) are not colour bleed.
VISIBLE_CHROMA = 64
MASK_TOL_PX = 1  # cloth-edge tolerance (chessboard px) around the approved cloth mask


def hero_of(path):
    b = os.path.basename(path)
    m = re.match(r'hero_(tank|slinger|warlock|sneak)_', b)
    if m: return m.group(1)
    for k in ('sewer_rat', 'slinger', 'sneak', 'warlock'):
        if b.startswith(k + '_'): return HERO_ALIASES[k]
    return None


def load_rgba(path):
    return np.array(Image.open(path).convert('RGBA'))


def pixel_sha(a):
    return hashlib.sha256(np.ascontiguousarray(a).tobytes() + str(a.shape).encode()).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''): h.update(c)
    return h.hexdigest()


def hsv(a):  # same formula as build_export.py
    r, g, b = [a[..., i].astype(float) for i in range(3)]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b); d = mx - mn; dd = np.where(d == 0, 1, d)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    return h % 360, np.where(mx > 0, d / np.maximum(mx, 1), 0), mx / 255


def core_hue(a, hero):
    op = a[..., 3] > 127
    h, s, v = hsv(a)
    return op & BANDS[hero](h) & (s > CORE_SAT[hero]) & (v > 0.18)


def visible_hue(a, hero):
    chroma = a[..., :3].max(-1).astype(int) - a[..., :3].min(-1).astype(int)
    return core_hue(a, hero) & (chroma >= VISIBLE_CHROMA)


def derive_cloth_mask(a, hero):
    """Exact mask logic of export/build_export.py: core player hue, clusters >=8 px, 3x3 closing, opaque only."""
    op = a[..., 3] > 127
    core = core_hue(a, hero)
    lab, n = ndimage.label(core, structure=np.ones((3, 3)))
    if n == 0: return np.zeros_like(op)
    sz = ndimage.sum(core, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, z in enumerate(sz) if z >= 8])
    return (ndimage.binary_closing(keep, structure=np.ones((3, 3))) | keep) & op


def bleed_pixels(a, hero, mask, tol=MASK_TOL_PX):
    """Visible player-hue pixels outside the (approved) cloth mask grown by `tol` px."""
    grown = ndimage.binary_dilation(mask, structure=np.ones((3, 3)), iterations=tol) if tol else mask
    return visible_hue(a, hero) & ~grown


def diff(a, b):
    """Changed pixels between two RGBA arrays (any channel; fully transparent pixels compare as equal)."""
    if a.shape != b.shape: return None
    aa = a.copy(); bb = b.copy(); aa[aa[..., 3] == 0] = 0; bb[bb[..., 3] == 0] = 0
    ch = (aa != bb).any(-1)
    n = int(ch.sum())
    if not n: return dict(changed=0, bbox=None, mask=ch)
    ys, xs = np.where(ch)
    return dict(changed=n, bbox=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())], mask=ch)


VER_RE = re.compile(r'_v(\d+)([a-z]*)(?=_|\.|$)')


def family(name):
    """Strip the version token: sewer_rat_idle_v4g_f3.png -> ('sewer_rat_idle_{V}_f3.png', (4,'g'))."""
    m = VER_RE.search(name)
    if not m: return None, None
    return name[:m.start()] + '_{V}' + name[m.end():], (int(m.group(1)), m.group(2))


def rel(p):
    return os.path.relpath(p, ART)


def ab(p):
    return p if os.path.isabs(p) else os.path.join(ART, p)


def load_json(p, default=None):
    if not os.path.exists(p): return default
    with open(p) as f: return json.load(f)


def save_json(p, d):
    tmp = p + '.tmp'
    with open(tmp, 'w') as f: json.dump(d, f, indent=1)
    os.replace(tmp, p)
