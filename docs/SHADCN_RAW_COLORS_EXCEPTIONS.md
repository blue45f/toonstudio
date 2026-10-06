# @shadcn/lint `no-raw-colors` 예외 원장

상태: current (현행 예외 등록부)
작성일: 2026-10-07 (단계 2 — 실위반 정리)
근거 측정: 파일럿 findings `hidden_files/shadcn-lint-pilot-2026-10-06/findings.md` (goals 워크스페이스)

## 목적

`shadcn/no-raw-colors`(warn)는 UI 색을 DESIGN.md 의미 토큰으로 강제하는 규칙이지만,
그래픽 아트워크 내부의 색·외부 브랜드 색·렌더 프리셋 데이터까지는 토큰화 대상이 아니다.
이 문서는 규칙을 끈 지점 전부를 한곳에 모아, "왜 이 파일/구간만 예외인가"를 추적 가능하게 한다.
예외 지점의 코드에는 반드시 사유와 이 문서 경로를 단 `eslint-disable` 주석이 함께 있다.
주석 없는 예외는 존재하지 않으며, 예외를 새로 만들 때는 이 문서에 먼저 등재한다.

단계 2 실측(2026-10-07, 표본 = `apps/web/src/shared/**` + `domains/market` + `domains/community`):
경고 195건/19파일 → 실위반 62건 토큰 교체, 예외 131건, 오탐 2건으로 전량 처분. 처분 후 표본 재실행 경고 0건.

## 파일 단위 예외 (그래픽 아트워크·렌더 데이터)

파일 전체가 그림/렌더 데이터라 파일 첫 줄에 disable을 건다.

| 파일 | 건수 | 사유 |
| --- | --- | --- |
| `apps/web/src/domains/market/components/MarketFilterPreview.tsx` | 29 | 필터 미리보기 SVG 일러스트 아트워크 — 하늘·별·캐릭터 색은 그림 데이터 |
| `apps/web/src/shared/components/virtual-studio/VirtualStudioMasterWorld.tsx` | 29 | 가상스튜디오 월드 SVG 아트워크 — 지형·건물·소품 색은 월드 렌더 데이터 |
| `apps/web/src/domains/market/components/MarketWebtoon3dViewerModal.tsx` | 26 | 3D 뷰어 조명 프리셋(sky·amber·rose·indigo 등) — 프리셋 색 자체가 데이터이고 스테이지 배경도 렌더 표면 |
| `apps/web/src/shared/motion-assets/motion-assets-illustrations.tsx` | 14 | 모션 일러스트 SVG 아트워크 |
| `apps/web/src/shared/components/virtual-studio/StudioChibiSprite.tsx` | 10 | 치비 캐릭터 스프라이트 SVG 아트워크 — 작화 데이터 |
| `apps/web/src/domains/market/components/MarketScene3dPreview.tsx` | 8 | 조명 프리셋으로 구동되는 3D 장면 미리보기 SVG 일러스트 — 장면 렌더 데이터 |

## 구간·라인 단위 예외 (UI 파일 안의 국소 지점)

| 파일 | 건수 | 사유 |
| --- | --- | --- |
| `apps/web/src/shared/components/share-dialog.tsx` (인스타그램 버튼 구간) | 3 | 외부 서비스(인스타그램) 브랜드 그라디언트 — 브랜드 표현 자체라 토큰 교체 불가 |
| `apps/web/src/shared/components/share-dialog.tsx` (QR 섹션 구간) | 2 | QR 카드는 스캔용 고정 화이트 표면 — 의미 토큰(fg)은 다크 테마에서 반전돼 QR 영역 글자가 읽히지 않는다 |
| `apps/web/src/shared/pwa/PwaOfflinePage.tsx` (히어로 SVG 구간) | 4 | 오프라인 안내 히어로 아트워크(브랜드 그라디언트 마크 `#818cf8→#c084fc` 포함) |
| `apps/web/src/shared/pwa/PwaInstallShowcase.tsx` (히어로 SVG 구간) | 3 | 설치 안내 히어로 아트워크(브랜드 그라디언트 마크 포함) |
| `apps/web/src/shared/pwa/PwaInstallWelcome.tsx` ("home" 아트 SVG 구간) | 2 | 웰컴 투어 아트워크 — 그라디언트 원 위 흰 체크는 그림 데이터 |
| `apps/web/src/shared/spectacle/SpectacleShowcase.tsx` (핑크 글로우 버튼 1줄) | 1 | 글로우 연출 데모의 핑크 샘플 버튼 — 색 자체가 시연 콘텐츠 |

## 오탐 (규칙이 색이 아닌 것을 색으로 오인)

플러그인 0.2.0이 비색상 유틸리티를 미선언 색 토큰으로 판정하는 알려진 오탐이다.
플러그인이 해당 파싱을 고치면 이 두 건의 disable은 제거한다.

| 파일 | 표기 | 사유 |
| --- | --- | --- |
| `apps/web/src/domains/market/components/MarketResourceCover.tsx` | `fill-none` | 채우기 없음 유틸리티 — 색상이 아님 |
| `apps/web/src/shared/ai/UnifiedAiSettings.tsx` | `focus-visible:outline-inset` | 아웃라인 위치 값 — 색상이 아님 |

## 재검토 조건

- @shadcn/lint가 파일/클래스 단위 무시 설정을 제공하면, disable 주석 방식을 설정 기반으로 옮길 수 있는지 재검토한다.
- PWA 브랜드 그라디언트(`#818cf8→#c084fc`)가 디자인 토큰으로 정식 승격되면 PWA 3파일의 예외는 토큰 참조로 교체한다.
- 3D 조명 프리셋이 토큰이 아닌 별도 프리셋 스키마로 분리되면 Market 3D 2파일의 예외 범위를 다시 잰다.
