# 가상 스튜디오 HD 고도화 벤치마크와 최고 설계 — 2026-10-14

상태: **current**. 2026-09-20 벤치마크(`virtual-studio-benchmark-20260920.md`)와 2026-09-27 경험 기록(`virtual-studio-experience-20260927.md`) 위에 HD 스프라이트 파이프라인 v9를 얹은 현재 설계다. 구현되지 않은 계획을 현재 기능처럼 서술하지 않는다.

## 1. 경쟁 제품 재측정 (2026-10-14 확인)

| 제품 | 스프라이트·아트 강점 | 한계 | ToonStudio 적용 |
| --- | --- | --- | --- |
| Gather 2.0 | 사람·영역 검색, 명시적 접근(Wave·Meet), 기본 꺼진 미디어 | 도트·저해상도 아바타, 공간 장식과 구조 편집 분리 | 검색·목적지 안내·동의 후 미디어 경계 유지, 아트 품질로 추월 |
| WorkAdventure | Tiled+인라인 편집 구분, 객체 깊이·충돌·동작의 데이터화 | 픽셀 타일 의존, 캐릭터 4방향 rur | flattened 배경과 독립 prop 구분 계승, HD 8프레임 보행으로 추월 |
| Kumospace | Profile Card·방 목록·맵 일치, knock·follow 수락 | 카메라가 소리 범위 밖에도 노출되는 프라이버시 모호 | 사람 카드·방 목록 일치만 수용, 승인 수신자 목록으로 프라이버시 강화 |
| ZEP | 저사양 접근성, 교육 템플릿 | 2D 도트 한계, 제작-검수 연결 없음 | 저전력 모드는 품질 저하가 아닌 선택지로만 제공 |
| Roblox/Fortnite Creative | UGC 생태계 | 웹툰 제작 authority 없음 | 에셋 패키지·템플릿 개념만 참조, Review authority는 ToonStudio 고유 유지 |

판정: **아트·보행·제작-검수 연결**이 차별점이다. 기능·해상도를 내려서 비용을 줄이지 않는다(2026-09-20 §6 유지).

## 2. 최고 설계 v9 (이번 구현)

- `studio-virtual-space-hd-sprite-pipeline.ts`: DPR·뷰포트·pixelated·이펙트 레벨로 SD/HD/ULTRA를 고르는 순수 함수. 픽셀 아트(retro)는 NEAREST 고정, HD 일러스트는 LINEAR+밉맵.
- Phaser 연동: `StudioVirtualSpacePhaserCanvas.tsx` 부팅 시 HD 티어를 계산해 `data-hd-sprite-tier/sampling` 진단에 남긴다. 실제 샘플링 전환은 기존 `textureLod`가 맡아 회귀를 막는다. 진단 실패는 엔진 실패로 취급하지 않는다(위 주석은 Phaser-CSS 공유 계약과 fail-safe를 설명하는 필수 주석이다).
- 마스터 월드: `VirtualStudioMasterBackdrop`에 `fetchPriority=high`·`decoding=async`·HD 등급 필터(`saturate 1.06·contrast 1.03`)와 시네마틱 그레이드 오버레이(상하 비네팅+중앙 광원)를 추가. 치비 SVG는 `geometricPrecision`+이중 드롭 섀도우로 윤곽 계단을 줄인다.
- 6 스타일 × 4 배경 24 원본(1536×1024), 6종 플레이어·4종 NPC 32프레임, 가구·랜드마크 1254×1254 16프레임 체계를 유지. 새로 압축·재가공하지 않는다.

## 3. 검증

- `studio-virtual-space-hd-sprite-pipeline.test.ts` 5 테스트: 픽셀 강제, 티어 분기, low 이펙트 감쇠, 스케일 스냅, CSS·image-set.
- 기존 게이트 유지: `studio-virtual-space-phaser-canvas-texture-lod.test.ts`의 기존 문자열 단언 포함(원본 라인 보존).
- `pnpm harness:verify`와 영향 영역 Vitest를 실행하고 결과를 완료 보고에 기록한다.

## 4. v10 최상 고도화 — 2026-10-14 (origin/main 병합 뒤)

- 풀 1회(`fetch origin` + `merge origin/main --no-edit`, 병합 `941a6dec6`)를 먼저 반영하고 그 위에서 고도화했다. 마라톤 최종조립과 HD 파이프라인 간 파일 겹침·충돌은 없었다.
- 티어 판정 hardening: 비유한 DPR·뷰포트·메모리를 안전한 기본값으로 떨어뜨리고, 모션 감소 사용자는 `high` 이펙트에서도 ultra로 올리지 않고 hd에 머문다.
- 스케일 스냅 상한 4 고정(HD·픽셀 공통)으로 거대 스프라이트 폭주를 막는다.
- 배경 image-set 인용부호 가드: 비정상 URL은 `none` 또는 1x로 떨어뜨려 CSS 깨짐을 막는다.
- 테스트 3건 추가(모션 감소 캡, 비정상 입력, 스냅 상한)로 v10 계약을 고정한다.
