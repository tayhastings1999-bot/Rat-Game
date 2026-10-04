# Baseline · phase1

2026-10-04T20:32:09.935Z · brawler · 10 simulated minutes per profile · SwiftShader (frame times not representative)

| Measure | expert | average |
|---|---|---|
| Runs (deaths) | 1 (0) | 1 (0) |
| Peak enemies | 80 | 87 |
| Update ms mean / p95 / max | 0.45 / 1 / 43.1 | 0.54 / 1.1 / 12.9 |
| Update steps over 50 ms | 0 | 0 |
| Sync ms mean / max | 0.53 / 1.39 | 0.33 / 0.6 |
| Draw calls (peak) | 235 | 204 |
| Triangles (peak) | 74416 | 75073 |
| Shader programs | 40 | 40 |
| GPU geometries / textures | 1634 / 42 | 1887 / 43 |
| Unique scene geometries | 1175 | 1249 |
| Meshes | 1231 | 1312 |
| Shadow casters | 183 | 226 |
| Lights (visible) | 8 | 8 |
| Sprites | 364 | 360 |

## Update cost by enemy count

**expert**

| Enemies | Steps | Mean ms | p95 ms |
|---|---|---|---|
| 0–49 | 15022 | 0.38 | 0.8 |
| 50–99 | 3005 | 0.79 | 1.6 |

**average**

| Enemies | Steps | Mean ms | p95 ms |
|---|---|---|---|
| 0–49 | 14419 | 0.46 | 0.9 |
| 50–99 | 3606 | 0.83 | 1.4 |

No page errors.
