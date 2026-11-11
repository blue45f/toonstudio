# ToonStudio Starlight Atelier 전수 디자인 시안 패키지 (v2.6)

- 상태: **현재** (`2026-11-11`, 데스크톱 `시안 A ~ 시안 P` 16종 + 모바일 `모바일 시안 M1 ~ M4` 4종 전수 아트보드·토큰·실제 코드 1:1 동기화 완료)
- 상위 정본: [PRODUCT.md](../../../PRODUCT.md), [DESIGN.md](../../../DESIGN.md), [UI/UX v2 통합 개편 설계서](../../architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md), [품질 게이트 정책](../../operations/quality-gates-policy.md)

## 1. 시안 패키지 구성 파일

이 폴더는 툰스튜디오 모노레포 7개 애플리케이션(`web`, `api`, `admin-web`, `brush-lab`, `character-lab`, `mobile`, `desktop-sync`)과 웹 24개 라우트 그룹 전체의 **Starlight Atelier** 시각 시안을 프로젝트 저장소 안에서 언제든 열람·검증할 수 있도록 정제한 정본 시안 번들입니다.

| 파일 경로 | 용도 및 내용 |
| :--- | :--- |
| [starlight-atelier-interactive-gallery.html](./starlight-atelier-interactive-gallery.html) | WebStorm 미리보기나 브라우저에서 바로 열어 전체 20개 시안(`시안 A~P` · `모바일 M1~M4`), OKLCH 스와치, 고해상도 아트보드를 탭별로 필터링해 볼 수 있는 독립 실행형 시안 아틀라스 |
| [starlight-atelier-design-tokens.json](./starlight-atelier-design-tokens.json) | OKLCH 의미 색상 팔레트, 13개 Spectacle 계약 토큰, `44px`(`min-h-11`) 터치 타깃 불변식, 20대 보드별 정본 라우트 매핑 JSON 원장 |
| [boards/board-a-b-home-and-studio-lobby.svg](./boards/board-a-b-home-and-studio-lobby.svg) | **시안 A · B · F** — 루트 홈 프로스티드 커맨드 히어로 + 첫 화면 4열 Bento 런치패드 + 스튜디오 3열 아틀리에 로비 + 5열 공정 칸반 벡터 아트보드 |
| [boards/board-b-c-editor-2d-and-3d-live-ink.svg](./boards/board-b-c-editor-2d-and-3d-live-ink.svg) | **시안 B · C · D · O** — 2D 웹툰 에디터 단일 44px 5공정 스냅 바(68rem 클리핑 해제 + 자동저장 배지) + Rights BOM 출고 요약 + 3D Live Ink 에셋 선반 벡터 아트보드 |
| [boards/board-e-n-discover-spectrum-and-reader.svg](./boards/board-e-n-discover-spectrum-and-reader.svg) | **시안 E · N** — 스펙트럼 탐색 패싯 허브 + 연재 캘린더 오늘 열 강조 + 작품 상세 `WHERE TO READ` 라우터 + 2.5D WebXR 공간 리더 + Starlight 컷츠 피드 벡터 아트보드 |
| [boards/board-g-h-i-k-p-ecosystem-hubs.svg](./boards/board-g-h-i-k-p-ecosystem-hubs.svg) | **시안 G · H · I · J · K · L · M · P** — 소재 마켓 Fit Lab + 28개 공공 고증 핀보드 + 소셜 살롱 4탭/펜카페 + 보조 도구 스위트 + 내 공간 볼트 + Edge Gate Admin + 12종 기술 아틀라스 벡터 아트보드 |
| [boards/board-m1-m4-mobile-starlight-suite.svg](./boards/board-m1-m4-mobile-starlight-suite.svg) | **모바일 시안 M1 ~ M4 (`<768px`)** — 모바일 하단 글래스 독 + 한손 6슬롯 Thumb-Arc 에디터 + 모바일 1열 가격 라우터 + 무스피너 실루엣 스켈레톤 네이티브 셸 벡터 아트보드 |

## 2. 대표 시각 아트보드 미리보기

### 2.1 시안 A · B · F — 통합 홈 런치패드 · 스튜디오 아틀리에 로비 · 5열 공정 칸반

![시안 A·B·F 아트보드](./boards/board-a-b-home-and-studio-lobby.svg)

### 2.2 시안 B · C · D · O — 2D 단일 44px 공정 바 · 출고 프리플라이트 · 3D Live Ink 에셋 선반

![시안 B·C·D·O 아트보드](./boards/board-b-c-editor-2d-and-3d-live-ink.svg)

### 2.3 시안 E · N — 스펙트럼 탐색 · 작품 상세 라우터 · WebXR 2.5D 공간 리더 · 컷츠

![시안 E·N 아트보드](./boards/board-e-n-discover-spectrum-and-reader.svg)

### 2.4 시안 G ~ P — 마켓 Fit Lab · 고증 핀보드 · 소셜 살롱 · 볼트 · Admin · 기술 아틀라스

![시안 G~P 아트보드](./boards/board-g-h-i-k-p-ecosystem-hubs.svg)

### 2.5 모바일 시안 M1 ~ M4 — 모바일 하단 글래스 독 · 한손 Thumb-Arc · 무스피너 네이티브 셸

![모바일 시안 M1~M4 아트보드](./boards/board-m1-m4-mobile-starlight-suite.svg)

## 3. 시안-코드 자동 검증 연결

모든 시안 패키지 파일 존재 여부, OKLCH 토큰 계약, 정본 경로 사용(레거시 리다이렉트 별칭 금지), 전 핵심 화면군 `>=44px`(`min-h-11`) 터치 타깃, 시각 앵커 무결성은 [verify-ui-ux-v2-contracts.mjs](../../../scripts/verify-ui-ux-v2-contracts.mjs)를 통해 커밋·푸시 및 아키텍처 검증 시마다 자동 검사됩니다.
