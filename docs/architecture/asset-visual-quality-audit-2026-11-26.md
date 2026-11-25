# 전사 3D·2D 시각 에셋 품질·웹툰 적합성·용량·중복·참조 전수 감사 보고서

- **감사 기준일**: 2026-11-26 | **감사 도구**: `scripts/audit-visual-assets-quality.mjs` (바이너리 헤더·glTF/VRM JSON·PNG/WebP/JPEG/SVG 100% 실측)
- **대상 범위**: `apps/web/public/`, `apps/character-lab/public/` 전수 (`apps/web/src/`, `apps/character-lab/src/` 및 public manifest 대조)
- **안전 원칙**: 본 배치에서는 에셋을 삭제하지 않았으며, 절감 용량은 중복 집계 없는 상호 배타 버킷으로 산출했다(`추정` 별도 표기).

## 1. 전사 에셋 요약 (실측)

| 구분 | 파일 수 | 총 용량 | HERO_KEEP | OPTIMIZE | UPGRADE | QUARANTINE | 코드 참조 | 활성 매니페스트 | 비활성 매니페스트 | 완전 고아 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 3D 캐릭터 (VRM) | 117 | 452.03 MB | 40 | 15 | 0 | 62 | 117 | 0 | 0 | 0 |
| 3D 배경·소품·파츠 (GLB) | 1,702 | 1737.27 MB | 545 | 118 | 23 | 1,016 | 588 | 1,091 | 3 | 20 |
| 2D 이미지·아이콘·SVG | 7,102 | 1713.19 MB | 2,325 | 652 | 42 | 4,083 | 1,782 | 2,316 | 2,824 | 180 |
| **전사 합계** | 8,921 | 3902.49 MB | 2,910 | 785 | 65 | 5,161 | 2,487 | 3,407 | 2,827 | 200 |

### 상호 배타 절감 가능 용량 요약 (중복 집계 0건)
- **1) 제거·격리 대상(`QUARANTINE_OFF_STYLE`) 실측 회수**: **415.05 MB** (블록형 Kenney·밈 VRM·LPC 픽셀·비활성/고아 에셋)
- **2) 중복·구리비전(격리 제외분, SHA-256 72그룹 + 3D 구리비전 8건) 실측 회수**: **98.06 MB** (전체 SHA-256 낭비 7.77 MB, 3D 구리비전 90.32 MB)
- **3) 과대 3D(>5 MB, 125개 = 1244.35 MB) Draco+1K/2K 압축 (65% 추정)**: **~808.83 MB**
- **4) 비압축 대용량 PNG(>300 KB, 435개 = 562.67 MB) WebP 전환 (72% 추정)**: **~405.12 MB**
- **5) 과대 2D 비PNG(>2 MB, 139개 = 412.67 MB) 리사이즈·WebP (50% 추정)**: **~206.33 MB**
- **총 예상 절감 가능 용량**: **~1933.40 MB** (전사 3902.49 MB 대비 **49.5%**)

## 2. 등급별 용량 분포 (실측)

| 등급 | 3D 수량 (용량) | 2D 수량 (용량) | 합계 수량 (용량) |
|---|---:|---:|---:|
| 유지 (HERO_KEEP) | 585 (641.42 MB) | 2,325 (528.05 MB) | 2,910 (1169.47 MB) |
| 최적화·중복 (OPTIMIZE_HEAVY_OR_DUP) | 133 (1334.67 MB) | 652 (983.08 MB) | 785 (2317.75 MB) |
| 고품질 교체 (UPGRADE_LOW_CRAFT) | 23 (0.10 MB) | 42 (0.12 MB) | 65 (0.22 MB) |
| 제거·격리 (QUARANTINE_OFF_STYLE) | 1,078 (213.11 MB) | 4,083 (201.95 MB) | 5,161 (415.05 MB) |

## 3. Top 20 즉시 제거·격리 대상 (`QUARANTINE_OFF_STYLE` — VRM 8 · GLB 6 · 2D 6)

| 순위 | 경로 | 종류 | 용량 | 참조 상태 | 판정 사유 |
|---:|---|---|---:|---|---|
| 1 | `apps/web/public/vrm/PirateBot.vrm` | VRM | 11.10 MB | code-direct | 웹툰 톤 이질적 밈/마스코트/복셀 VRM |
| 2 | `apps/web/public/vrm/Seed_san.vrm` | VRM | 10.25 MB | code-direct | 웹툰 톤 이질적 밈/마스코트/복셀 VRM |
| 3 | `apps/web/public/vrm/SportMecha.vrm` | VRM | 8.13 MB | code-direct | 웹툰 톤 이질적 밈/마스코트/복셀 VRM |
| 4 | `apps/web/public/vrm/CoolTiger.vrm` | VRM | 7.86 MB | code-direct | 웹툰 톤 이질적 밈/마스코트/복셀 VRM |
| 5 | `apps/web/public/vrm/StitchWitch.vrm` | VRM | 7.34 MB | code-direct | 웹툰 톤 이질적 밈/마스코트/복셀 VRM |
| 6 | `apps/web/public/vrm/WeirdCat.vrm` | VRM | 6.09 MB | code-direct | 웹툰 톤 이질적 밈/마스코트/복셀 VRM |
| 7 | `apps/web/public/vrm/BaoSamurai.vrm` | VRM | 6.04 MB | code-direct | 웹툰 톤 이질적 밈/마스코트/복셀 VRM |
| 8 | `apps/web/public/vrm/GoodKnight.vrm` | VRM | 5.81 MB | code-direct | 웹툰 톤 이질적 밈/마스코트/복셀 VRM |
| 9 | `apps/web/public/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-j.glb` | GLB | 441.1 KB | manifest-active | 웹툰 톤 이질적 블록/장난감 팩(Kenney); 코드 직접 미참조 |
| 10 | `apps/web/public/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-n.glb` | GLB | 344.0 KB | manifest-active | 웹툰 톤 이질적 블록/장난감 팩(Kenney); 코드 직접 미참조 |
| 11 | `apps/web/public/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-m.glb` | GLB | 304.7 KB | manifest-active | 웹툰 톤 이질적 블록/장난감 팩(Kenney); 코드 직접 미참조 |
| 12 | `apps/web/public/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-l.glb` | GLB | 294.5 KB | manifest-active | 웹툰 톤 이질적 블록/장난감 팩(Kenney); 코드 직접 미참조 |
| 13 | `apps/web/public/assets/studio/cc0-20260906/assets/kenney-city-commercial/building-k.glb` | GLB | 252.0 KB | manifest-active | 웹툰 톤 이질적 블록/장난감 팩(Kenney); 코드 직접 미참조 |
| 14 | `apps/web/public/assets/studio/cc0-20260906/assets/kenney-watercraft/ship-ocean-liner.glb` | GLB | 231.6 KB | manifest-active | 웹툰 톤 이질적 블록/장난감 팩(Kenney); 코드 직접 미참조 |
| 15 | `apps/web/public/assets/virtual-studio/living-world/master-clean-plate.webp` | 2D | 1.97 MB | manifest-inactive | 비활성 매니페스트 미참조 2D |
| 16 | `apps/web/public/assets/3d/environments/hero-v1/lineart/kr_school_rooftop_hero-lineart.svg` | 2D | 1.83 MB | orphan | 미참조 고아 2D 에셋 |
| 17 | `apps/web/public/assets/3d/environments/hero-v1/lineart/kr_atelier_cafe_interior-lineart.svg` | 2D | 1.22 MB | orphan | 미참조 고아 2D 에셋 |
| 18 | `apps/web/public/assets/virtual-studio/studio-art-v10/source/illustrated-floor-panorama-source.jpg` | 2D | 1.09 MB | orphan | 미참조 고아 2D 에셋 |
| 19 | `apps/web/public/assets/virtual-studio/studio-art-v10/source/illustrated-decor-atlas-source.jpg` | 2D | 840.9 KB | orphan | 미참조 고아 2D 에셋 |
| 20 | `apps/web/public/assets/3d/environments/hero-v1/lineart/rofan_imperial_palace_hall_balcony-lineart.svg` | 2D | 772.5 KB | orphan | 미참조 고아 2D 에셋 |

## 4. Top 20 즉시 교체(고품질 리메이크) 대상 (`UPGRADE_LOW_CRAFT` — 3D 12 · 2D 8)

| 순위 | 경로 | 종류 | 용량 | 형상/해상도 실측 | 참조 상태 | 판정 사유 |
|---:|---|---|---:|---|---|---|
| 1 | `apps/web/public/creator-essentials/prop-stairs.glb` | GLB | 2.4 KB | 24v / 12t / tex 0 | code-direct | 초소형 더미/플레이스홀더(2.4 KB); 텍스처 0 · 극저폴리(12 tris) |
| 2 | `apps/web/public/models/varco3d/shaper-rofan-tiara.glb` | GLB | 2.9 KB | 34v / 56t / tex 0 | code-direct | 초소형 더미/플레이스홀더(2.9 KB); 텍스처 0 · 극저폴리(56 tris) |
| 3 | `apps/web/public/models/varco3d/shaper-cyber-visor.glb` | GLB | 2.9 KB | 34v / 56t / tex 0 | code-direct | 초소형 더미/플레이스홀더(2.9 KB); 텍스처 0 · 극저폴리(56 tris) |
| 4 | `apps/web/public/models/varco3d/shaper-murim-jade-sword.glb` | GLB | 2.9 KB | 34v / 56t / tex 0 | code-direct | 초소형 더미/플레이스홀더(2.9 KB); 텍스처 0 · 극저폴리(56 tris) |
| 5 | `apps/web/public/models/varco3d/shaper-hunter-mana-gauntlet.glb` | GLB | 2.9 KB | 34v / 56t / tex 0 | code-direct | 초소형 더미/플레이스홀더(2.9 KB); 텍스처 0 · 극저폴리(56 tris) |
| 6 | `apps/web/public/creator-essentials/prop-doorway.glb` | GLB | 3.4 KB | 48v / 24t / tex 0 | code-direct | 초소형 더미/플레이스홀더(3.4 KB); 텍스처 0 · 극저폴리(24 tris) |
| 7 | `apps/web/public/models/varco3d/cyberpunk-holo-kiosk.glb` | GLB | 3.4 KB | 48v / 72t / tex 0 | code-direct | 초소형 더미/플레이스홀더(3.4 KB); 텍스처 0 · 극저폴리(72 tris) |
| 8 | `apps/web/public/creator-essentials/prop-desk.glb` | GLB | 3.5 KB | 48v / 24t / tex 0 | code-direct | 초소형 더미/플레이스홀더(3.5 KB); 텍스처 0 · 극저폴리(24 tris) |
| 9 | `apps/web/public/creator-essentials/prop-window-wall.glb` | GLB | 3.9 KB | 48v / 24t / tex 0 | code-direct | 초소형 더미/플레이스홀더(3.9 KB); 텍스처 0 · 극저폴리(24 tris) |
| 10 | `apps/web/public/creator-essentials/prop-bench.glb` | GLB | 3.9 KB | 48v / 24t / tex 0 | code-direct | 초소형 더미/플레이스홀더(3.9 KB); 텍스처 0 · 극저폴리(24 tris) |
| 11 | `apps/web/public/creator-essentials/prop-chair.glb` | GLB | 3.9 KB | 48v / 24t / tex 0 | code-direct | 초소형 더미/플레이스홀더(3.9 KB); 텍스처 0 · 극저폴리(24 tris) |
| 12 | `apps/web/public/models/varco3d/cafe-espresso-bar.glb` | GLB | 4.1 KB | 66v / 104t / tex 0 | code-direct | 초소형 더미/플레이스홀더(4.1 KB) |
| 13 | `apps/web/public/brand/production-os-workspace.svg` | 2D | 11.2 KB | 1600x980 (path 10/rect 38/도형 60) | code-direct | 극단순 와이어프레임/도형 SVG(1600x980, 도형 60개) |
| 14 | `apps/web/public/brand/production-os-hero.svg` | 2D | 9.6 KB | 1600x1120 (path 17/rect 30/도형 75) | code-direct | 극단순 와이어프레임/도형 SVG(1600x1120, 도형 75개) |
| 15 | `apps/web/public/brand/production-os-journey.svg` | 2D | 5.9 KB | 1600x680 (path 8/rect 8/도형 29) | code-direct | 극단순 와이어프레임/도형 SVG(1600x680, 도형 29개) |
| 16 | `apps/web/public/brand/studio-scene.svg` | 2D | 5.4 KB | 720x560 (path 43/rect 4/도형 67) | code-direct | 극단순 와이어프레임/도형 SVG(720x560, 도형 67개) |
| 17 | `apps/web/public/brand/theme-scenes/aurora-studio.svg` | 2D | 3.4 KB | 1200x800 (path 10/rect 8/도형 23) | code-direct | 극단순 와이어프레임/도형 SVG(1200x800, 도형 23개) |
| 18 | `apps/web/public/brand/theme-scenes/blossom-studio.svg` | 2D | 3.3 KB | 1200x800 (path 11/rect 6/도형 28) | code-direct | 극단순 와이어프레임/도형 SVG(1200x800, 도형 28개) |
| 19 | `apps/web/public/brand/theme-scenes/sepia-studio.svg` | 2D | 3.2 KB | 1200x800 (path 7/rect 12/도형 33) | code-direct | 극단순 와이어프레임/도형 SVG(1200x800, 도형 33개) |
| 20 | `apps/web/public/brand/theme-scenes/midnight-studio.svg` | 2D | 2.9 KB | 1200x800 (path 8/rect 15/도형 26) | code-direct | 극단순 와이어프레임/도형 SVG(1200x800, 도형 26개) |

## 5. Top 20 용량 최적화·중복 제거 대상 (`OPTIMIZE_HEAVY_OR_DUP` — 3D 14 · 2D 6)

| 순위 | 경로 | 종류 | 용량 | 메시/텍스처 실측 | 참조 상태 | 최적화 조치 |
|---:|---|---|---:|---|---|---|
| 1 | `apps/web/public/assets/studio/cc0-20260906/assets/polyhaven-modular-street-seating/modular_street_seating.glb` | GLB | 25.19 MB | 25,156t · tex 15(max 2048px) · minY 0m | code-direct | 과대 용량(25.19 MB > 5 MB) |
| 2 | `apps/web/public/assets/3d/environments/refined-v6/compact_apartment_interior.glb` | GLB | 23.38 MB | 44,946t · tex 31(max 1024px) · minY 0m | code-direct | 과대 용량(23.38 MB > 5 MB) |
| 3 | `apps/web/public/assets/3d/environments/expansion-v1/library_reading_room.glb` | GLB | 22.71 MB | 149,261t · tex 22(max 1024px) · minY 0m | code-direct | 과대 용량(22.71 MB > 5 MB); 구버전/리비전 중복(/assets/3d/environments/expansion-v2/library_reading_room.glb) |
| 4 | `apps/web/public/assets/3d/environments/expansion-v2/library_reading_room.glb` | GLB | 22.71 MB | 148,949t · tex 22(max 1024px) · minY 0m | manifest-active | 과대 용량(22.71 MB > 5 MB) |
| 5 | `apps/web/public/assets/studio/cc0-20260906/assets/polyhaven-brass-goblets/brass_goblets-mobile-v1.glb` | GLB | 20.24 MB | 9,600t · tex 9(max 2048px) · minY 0.0049m | code-direct | 과대 용량(20.24 MB > 5 MB) |
| 6 | `apps/web/public/assets/3d/environments/expansion-v1/independent_bookshop.glb` | GLB | 20.05 MB | 88,478t · tex 22(max 1024px) · minY 0m | code-direct | 과대 용량(20.05 MB > 5 MB); 구버전/리비전 중복(/assets/3d/environments/expansion-v2/independent_bookshop.glb) |
| 7 | `apps/web/public/assets/3d/environments/expansion-v2/independent_bookshop.glb` | GLB | 20.05 MB | 88,382t · tex 22(max 1024px) · minY 0m | manifest-active | 과대 용량(20.05 MB > 5 MB) |
| 8 | `apps/web/public/assets/3d/environments/expansion-v1/park_garden_pavilion.glb` | GLB | 19.93 MB | 92,171t · tex 21(max 1024px) · minY 0m | code-direct | 과대 용량(19.93 MB > 5 MB); 구버전/리비전 중복(/assets/3d/environments/expansion-v2/park_garden_pavilion.glb) |
| 9 | `apps/web/public/assets/3d/environments/expansion-v2/park_garden_pavilion.glb` | GLB | 19.93 MB | 92,147t · tex 21(max 1024px) · minY 0m | manifest-active | 과대 용량(19.93 MB > 5 MB) |
| 10 | `apps/web/public/vrm/Darkness_Shibu.vrm` | VRM | 19.48 MB | 33,758t · tex 27(max 2048px) · minY -0.0001m | code-direct | 과대 용량(19.48 MB > 5 MB) |
| 11 | `apps/web/public/assets/3d/environments/refined-v6/stylized_cafe_interior.glb` | GLB | 18.59 MB | 68,134t · tex 24(max 1024px) · minY 0m | code-direct | 과대 용량(18.59 MB > 5 MB) |
| 12 | `apps/web/public/vrm/Sakurada_Fumiriya.vrm` | VRM | 18.45 MB | 39,548t · tex 30(max 2048px) · minY 0.0002m | code-direct | 과대 용량(18.45 MB > 5 MB) |
| 13 | `apps/web/public/assets/studio/cc0-20260906/assets/polyhaven-vintage-radio-transceiver/vintage_radio_transceiver.glb` | GLB | 17.50 MB | 42,350t · tex 6(max 2048px) · minY -0.0015m | code-direct | 과대 용량(17.50 MB > 5 MB) |
| 14 | `apps/web/public/vrm/Vivi.vrm` | VRM | 17.25 MB | 25,834t · tex 28(max 2048px) · minY -0.0001m | code-direct | 과대 용량(17.25 MB > 5 MB) |
| 15 | `apps/web/public/assets/studio/cc0-20260906/assets/polyhaven-leafy-grass/leafy_grass_nor_gl_2k.jpg` | 2D | 5.77 MB | 2048x2048 (jpg) | orphan | 과대 2D 파일(5.77 MB > 2 MB) |
| 16 | `apps/web/public/assets/studio/cc0-20260906/assets/polyhaven-red-laterite-soil-stones/red_laterite_soil_stones_nor_gl_2k.jpg` | 2D | 5.65 MB | 2048x2048 (jpg) | manifest-active | 과대 2D 파일(5.65 MB > 2 MB) |
| 17 | `apps/web/public/assets/studio/cc0-20260906/assets/polyhaven-gravel-embedded-concrete/gravel_embedded_concrete_nor_gl_2k.jpg` | 2D | 5.57 MB | 2048x2048 (jpg) | manifest-active | 과대 2D 파일(5.57 MB > 2 MB) |
| 18 | `apps/web/public/assets/studio/cc0-20260906/assets/polyhaven-brown-mud-leaves-01/brown_mud_leaves_01_nor_gl_2k.jpg` | 2D | 5.43 MB | 2048x2048 (jpg) | manifest-active | 과대 2D 파일(5.43 MB > 2 MB) |
| 19 | `apps/web/public/assets/studio/cc0-20260906/assets/ambientcg-fabric066/fabric066-2k-jpg-color.webp` | 2D | 5.42 MB | 2048x2048 (webp) | code-template | 과대 2D 파일(5.42 MB > 2 MB) |
| 20 | `apps/web/public/assets/studio/cc0-20260906/assets/polyhaven-forrest-ground-01/forrest_ground_01_nor_gl_2k.jpg` | 2D | 5.29 MB | 2048x2048 (jpg) | manifest-active | 과대 2D 파일(5.29 MB > 2 MB) |

### SHA-256 완전 중복 상위 그룹 (실측)

| 순위 | 중복 수 | 낭비 용량 | 기준 파일 | 중복 파일 예시 |
|---:|---:|---:|---|---|
| 1 | 2 | 1.11 MB | `apps/web/public/assets/studio/backgrounds/webtoon_palace.jpg` | `apps/web/public/assets/studio/backgrounds/webtoon_palace.png` |
| 2 | 2 | 1.01 MB | `apps/web/public/assets/studio/backgrounds/webtoon_cafe.jpg` | `apps/web/public/assets/studio/backgrounds/webtoon_cafe.png` |
| 3 | 2 | 972.9 KB | `apps/web/public/assets/studio/backgrounds/webtoon_street.jpg` | `apps/web/public/assets/studio/backgrounds/webtoon_street.png` |
| 4 | 2 | 908.8 KB | `apps/web/public/assets/studio/backgrounds/webtoon_classroom.jpg` | `apps/web/public/assets/studio/backgrounds/webtoon_classroom.png` |
| 5 | 2 | 800.0 KB | `apps/web/public/assets/studio/backgrounds/webtoon_corridor.jpg` | `apps/web/public/assets/studio/backgrounds/webtoon_corridor.png` |
| 6 | 2 | 533.1 KB | `apps/web/public/assets/virtual-studio/art-v4/world/ink.webp` | `apps/web/public/assets/virtual-studio/style-packs/ink/tiles/world-base.webp` |
| 7 | 2 | 186.8 KB | `apps/web/public/assets/3d/characters/thumbnails/toonstudio-hero-v1/romance-female.png` | `apps/web/public/vrm/toonstudio-hero-v1/thumbnails/romance-female.png` |
| 8 | 2 | 179.7 KB | `apps/web/public/assets/virtual-studio/art-v4/world/webtoon.webp` | `apps/web/public/assets/virtual-studio/style-packs/webtoon/tiles/world-base.webp` |
| 9 | 2 | 176.5 KB | `apps/web/public/assets/3d/characters/thumbnails/toonstudio-hero-v1/academy-female.png` | `apps/web/public/vrm/toonstudio-hero-v1/thumbnails/academy-female.png` |
| 10 | 2 | 176.1 KB | `apps/web/public/assets/virtual-studio/art-v4/world/neon.webp` | `apps/web/public/assets/virtual-studio/style-packs/neon/tiles/world-base.webp` |
| 11 | 2 | 174.7 KB | `apps/web/public/assets/virtual-studio/art-v4/world/pastel.webp` | `apps/web/public/assets/virtual-studio/style-packs/pastel/tiles/world-base.webp` |
| 12 | 2 | 172.5 KB | `apps/web/public/assets/3d/characters/thumbnails/toonstudio-hero-v1/chibi-mascot.png` | `apps/web/public/vrm/toonstudio-hero-v1/thumbnails/chibi-mascot.png` |

## 6. 미참조 고아 에셋 안전 삭제 목록 (디렉터리·팩 집계)

- **Tier A (즉시 안전 삭제)**: 코드·매니페스트 모두 미참조(`orphan`). **Tier B**: 죽은 매니페스트(`manifest-inactive`, `src/` 미로드). **Tier C**: 활성 매니페스트(`manifest-active`, 동시 수정 필수).

| 디렉터리/팩 | Tier A 완전 고아 | Tier B 비활성 매니페스트 | Tier C 활성 매니페스트 | 권고 조치 |
|---|---:|---:|---:|---|
| `assets/virtual-studio/style-packs` | 0 (0.00 MB) | 705 (105.22 MB) | 351 (7.10 MB) | 활성 매니페스트 검수 후 정리 |
| `assets/virtual-studio/style-packs-v5` | 0 (0.00 MB) | 1847 (38.24 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/virtual-studio/npc-cast-v3` | 0 (0.00 MB) | 69 (37.12 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `cc0/polyhaven-*` | 6 (22.72 MB) | 0 (0.00 MB) | 320 (561.88 MB) | 활성 매니페스트 검수 후 정리 |
| `assets/virtual-studio/npc-cast-v2` | 0 (0.00 MB) | 35 (17.11 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/virtual-studio/office-standing-expressions-v1` | 0 (0.00 MB) | 8 (15.74 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/3d/environments` | 9 (9.52 MB) | 3 (5.67 MB) | 60 (105.37 MB) | 활성 매니페스트 검수 후 정리 |
| `assets/characters/shaper-atelier-protagonist` | 0 (0.00 MB) | 6 (13.81 MB) | 1 (3.62 MB) | 활성 매니페스트 검수 후 정리 |
| `assets/virtual-studio/world-v2` | 4 (2.80 MB) | 2 (6.21 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/virtual-studio/living-town-v6` | 0 (0.00 MB) | 69 (6.75 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/characters/toonstudio-kit-v2` | 10 (3.26 MB) | 5 (0.08 MB) | 52 (59.88 MB) | 활성 매니페스트 검수 후 정리 |
| `assets/virtual-studio/studio-art-v10` | 3 (2.63 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/virtual-studio/reference` | 20 (2.51 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/virtual-studio/toon-office-v1` | 41 (0.41 MB) | 16 (2.04 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/virtual-studio/living-world` | 0 (0.00 MB) | 1 (1.97 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/virtual-studio/imagegen25-v7` | 0 (0.00 MB) | 18 (1.93 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/create` | 1 (1.81 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `brand/lobby-hq-20261003` | 20 (1.66 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/studio/scene-assistant` | 10 (1.08 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/virtual-studio/campus-v1` | 6 (1.06 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/3d/outfits` | 18 (0.89 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `(public-root)` | 10 (0.70 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `brand` | 0 (0.00 MB) | 4 (0.66 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `cc0/ambientcg-fabric066` | 1 (0.52 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `brand/showcase-covers-20261009` | 3 (0.49 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/site-experience/site-art-v1` | 0 (0.00 MB) | 4 (0.46 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/studio/vibrant-sprites` | 10 (0.42 MB) | 0 (0.00 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |
| `assets/virtual-studio/npc-cast-v1` | 0 (0.00 MB) | 35 (0.31 MB) | 0 (0.00 MB) | Tier A/B 일괄 삭제 후보 |

## 7. Wave 64B 실행 권고 (안전 순서)

1. **무위험 즉시 정리**: Tier A·B 비활성 팩(`virtual-studio/style-packs/`, `npc-cast-v1..v3/`, `revisions/*`, `reference/`) 및 SHA-256 중복(`.jpg==.png` 이중 파일, 중복 hero 썸네일) 제거.
2. **웹툰 톤앤매너 정화**: `kenney-*` 블록형 3D·2D 팩, `characters-lpc-v1` 픽셀 스프라이트, 100Avatars 밈/푸드 VRM을 카탈로그·매니페스트와 함께 안전 격리.
3. **라이브 저품질 리메이크**: `brand/studio-scene.svg`·`production-os-*.svg`·`theme-scenes/*-studio.svg` 와이어프레임 SVG와 `models/varco3d/shaper-*.glb`(2.9 KB)·`creator-essentials/prop-*.glb`(2.4~5.8 KB)을 웹툰 아틀리에 품질로 교체.
4. **대용량 포맷·메시 압축**: >300 KB PNG 일괄 WebP 전환, >5 MB Polyhaven/`refined-v6`/`expansion-v2`/VRM 에셋 Draco+1K/2K 텍스처 압축 및 `expansion-v1` 구판 정리.
