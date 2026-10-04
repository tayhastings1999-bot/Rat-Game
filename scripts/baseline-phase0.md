# Baseline · phase0

2026-10-04T03:40:57.218Z · brawler · 10 simulated minutes per profile · SwiftShader (frame times not representative)

| Measure | expert | average |
|---|---|---|
| Runs (deaths) | 1 (0) | 1 (0) |
| Peak enemies | 220 | 220 |
| Update ms mean / p95 / max | 1.14 / 2.6 / 11.1 | 1.28 / 2.8 / 8.9 |
| Update steps over 50 ms | 0 | 0 |
| Sync ms mean / max | 0.57 / 1.24 | 0.74 / 1.68 |
| Draw calls (peak) | 339 | 240 |
| Triangles (peak) | 130211 | 110911 |
| Shader programs | 43 | 41 |
| GPU geometries / textures | 2237 / 54 | 2210 / 51 |
| Unique scene geometries | 1461 | 1361 |
| Meshes | 1564 | 1459 |
| Shadow casters | 237 | 254 |
| Lights (visible) | 8 | 8 |
| Sprites | 450 | 454 |

## Update cost by enemy count

**expert**

| Enemies | Steps | Mean ms | p95 ms |
|---|---|---|---|
| 0–49 | 5105 | 0.33 | 0.7 |
| 50–99 | 4809 | 0.88 | 1.5 |
| 100–149 | 3306 | 1.19 | 1.8 |
| 150–199 | 2849 | 1.96 | 2.9 |
| 200–249 | 2102 | 2.47 | 3.4 |

**average**

| Enemies | Steps | Mean ms | p95 ms |
|---|---|---|---|
| 0–49 | 5107 | 0.31 | 0.7 |
| 50–99 | 3603 | 0.64 | 1.2 |
| 100–149 | 2405 | 1.42 | 2.1 |
| 150–199 | 3907 | 2.14 | 3.1 |
| 200–249 | 3006 | 2.45 | 3.5 |

No page errors.
