# L1·L2·L4 인덱스 (2026-10-28)

상태: 현재 상태 기록. 코드 변경 없음. 이 문서는 전체 목록을 새로 만든 것이 아니라, 확인한 목록과 아직 확인하지 않은 부분을 구분해 적는다.

## L1: web↔API 대응표 (시작본)

규칙: 새 기능을 시작하기 전에 아래 표에 행을 먼저 추가한다. 행의 5개 필드는 이름, 웹 진입점, API 진입점, 책임, 테스트 이름이다.

확인한 범위(2026-10-28): `apps/web/src/domains/`와 `apps/api/src/modules/`의 폴더 이름 목록만 대조했다. 엔드포인트 단위 대응은 아직 확인하지 않았다.

| 이름(폴더명 수준) | 웹 | API |
| --- | --- | --- |
| catalog | `apps/web/src/domains/catalog/` | `apps/api/src/modules/catalog/` |
| community | `apps/web/src/domains/community/` | `apps/api/src/modules/community/` |
| creator-marketplace | `apps/web/src/domains/market/`(마켓 화면 계열) | `apps/api/src/modules/creator-marketplace/` |
| membership-wallet | `apps/web/src/domains/monetization/`(결제·수익 계열, 폴더명 다름) | `apps/api/src/modules/membership-wallet/` |

위 4행은 폴더명 수준의 대응이며, 실제 호출 경로까지 확인한 것이 아니다. 특히 마켓·지갑 행은 웹 폴더명과 API 모듈명이 다르므로, 엔드포인트를 확인할 때 이름을 다시 대조해야 한다.

## L2: 포맷 코드 레지스트리

`packages/studio-format-gateway/src/`에 있는 `csp-*` 파일 19개(2026-10-28 확인). 파일명을 바꾸기 전에 이 표를 먼저 갱신한다. 설명 헤더가 없는 파일은 설명을 추측하지 않고 비워 둔다.

| 코드 파일 | 머리말 설명(요약) |
| --- | --- |
| `csp-bfps-cscr-prmi.ts` | Clip Studio Paint 5.1.5 브러시 모양 프리셋 DB, 소재 카탈로그 경로 복구 테이블, 프로모션 일러스트 스크램블 이미지 코덱 |
| `csp-c2fr-c3dd-psd-pdfx.ts` | Clip Studio Paint 5.1.5 3D 캐릭터 아카이브 |
| `csp-cls.ts` | Clip Studio Paint `.cls`(SLCC Color Set) 파서·인코더 |
| `csp-complete-archive-cs3o-foil-shortcuts.ts` | Clip Studio 1.5 아카이브 관련(머리말 전문 확인 필요) |
| `csp-cs3o-foil-sprite-atlas.ts` | Clip Studio 1.5 관련(머리말 전문 확인 필요) |
| `csp-fto-pwui-bento-design.ts` | Clip Studio 1.5 UI/UX 디자인 아키텍처 관련 |
| `csp-hand-setup-pad.ts` | Clip Studio Paint 5.1.5 3D 핸드 셋업 포즈 프리셋 |
| `csp-laf-sgs-spws.ts` | Clip Studio Paint 5.1.5 `.laf`(Auto Action Set), `.sgs`(Gradation Set) 코덱 |
| `csp-lippreview-tos-scan-skshaper.ts` | Clip Studio 1.5 관련(머리말 전문 확인 필요) |
| `csp-material-boot-placement.ts` | Clip Studio Paint 1.5 소재 패키지 |
| `csp-pep-3dp.ts` | Clip Studio Paint 3D 데생 인형 포즈(`.pep`)·체형 비율(`.3dp`) 코덱 |
| `csp-print-epub-3d-archive.ts` | Clip Studio 1.5 출판·인쇄소, 전자책 디바이스 관련 |
| `csp-sut-error.ts` | 설명 헤더 없음(추측하지 않음) |
| `csp-sut-pressure-graph.ts` | 설명 헤더 없음(추측하지 않음) |
| `csp-sut-variant-schema.ts` | Clip Studio Paint `.sut`/`.sutg` 관련 |
| `csp-sut.ts` | 설명 헤더 없음(추측하지 않음) |
| `csp-tgcxs-certmdul-mobile-companion.ts` | 설명 헤더 없음(추측하지 않음) |
| `csp-tomd-spws-palette-dock.ts` | Clip Studio Paint 5.1.5 수식 키 설정 DB |
| `csp-urml-puppet-story-animation-roku.ts` | 설명 헤더 없음(추측하지 않음) |

공유 헬퍼: `bounded-zip.ts`, `format-common` 계열은 게이트웨이 내부에서만 쓴다.

## L4: contracts·core 공개 표면 인덱스

- `packages/contracts`(`@toonstudio/contracts`): package.json export 72개. `src/index.ts`는 작고, 공개 표면은 index가 아니라 하위 경로 export와 `src/public-exports.test.ts`를 기준으로 확인한다. 생성 파일(`*.generated.ts`)은 손으로 고치지 않는다.
- `packages/core`(`@toonstudio/core`): package.json export 25개. `src/index.ts`는 여러 `export *`를 가진 배럴이다. 새 도메인을 배럴에 추가하지 않고 하위 경로를 먼저 쓴다.

### kmas 수정 순서 정정 (2026-10-28 확인)

`apps/api/src/server/kmas.ts`가 `packages/core/src/catalog/catalog-store`를 직접 import하는 위반은 맞다. 다만 수정에 새로운 export 추가는 필요 없다. `packages/core/package.json`의 `./catalog` export는 이미 `src/catalog/index.ts`를 가리키고, 그 index가 `catalog-store`를 re-export하며, `activeTags`와 `TITLES`가 거기서 export된다. 따라서 수정은 import처를 `@toonstudio/core/catalog`로 바꾸는 것이고, 그 뒤 knip + 타입체크 + kmas 관련 테스트를 한다.
