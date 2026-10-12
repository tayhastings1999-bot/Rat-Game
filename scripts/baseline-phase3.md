# Baseline · phase3

2026-10-12T16:37:04.087Z · brawler · 10 simulated minutes per profile · SwiftShader (frame times not representative)

| Measure | expert | average |
|---|---|---|
| Runs (deaths) | 1 (0) | 1 (0) |
| Peak enemies | 66 | 84 |
| Update ms mean / p95 / max | 0.41 / 0.8 / 25.5 | 0.31 / 0.7 / 23.1 |
| Update steps over 50 ms | 0 | 0 |
| Sync ms mean / max | 0.31 / 0.54 | 0.19 / 0.36 |
| Draw calls (peak) | 224 | 212 |
| Triangles (peak) | 64481 | 64570 |
| Shader programs | 40 | 40 |
| GPU geometries / textures | 1587 / 30 | 1802 / 33 |
| Unique scene geometries | 1312 | 1313 |
| Meshes | 1376 | 1377 |
| Shadow casters | 249 | 247 |
| Lights (visible) | 8 | 8 |
| Sprites | 388 | 395 |

## Update cost by enemy count

**expert**

| Enemies | Steps | Mean ms | p95 ms |
|---|---|---|---|
| 0–49 | 17721 | 0.4 | 0.8 |
| 50–99 | 300 | 0.84 | 1.5 |

**average**

| Enemies | Steps | Mean ms | p95 ms |
|---|---|---|---|
| 0–49 | 17720 | 0.3 | 0.7 |
| 50–99 | 301 | 0.82 | 1.4 |

No page errors.

## Compared with phase2b

Update and sync times are 2–3× the phase2b capture at every enemy count. A same-machine A/B on the day (30 mawlings plus nest children around the rat, `update()` timed over 200-step windows) put the phase2b code at 0.50–0.97 ms per step and this code at 0.47–0.73 ms, so the difference is the machine, not the Phase 3 systems. Peak enemies rose (66/84 from 50/48); likely causes, not isolated: nests and packs sit in different spots now that they avoid props (the seeded layouts shifted), and bots now detour for power-ups. Draw calls rose by about 20 (marked pipes, power-up tokens, vault gates); geometry and texture counts fell slightly.
