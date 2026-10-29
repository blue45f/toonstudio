# VRM 스튜디오(VRoid Studio) 기능 대응 분석과 생성 VRM 고도화 설계서

- **작성일**: 2026-10-29
- **상태**: `current` — 구현과 단위·통합·UI 테스트 검증 완료. 실제 브라우저에서의 썸네일 래스터화·물리 흔들림 육안 확인은 아직 하지 않았다(9절).
- **증거 원장**: [`docs/evidence/vrm-studio-parity-20261029.json`](../evidence/vrm-studio-parity-20261029.json)
- **관련 경계 문서**: [하이브리드 DCC 엔진 아키텍처 7.4.1 "VRM Studio형 캐릭터 창조"](../studio-hybrid-dcc-engine-architecture-2026-08-02.md), [Labs 캐릭터 엔진 참고 자료 5절(독점 제품 정책)](../engines/labs-character-engine-references-2026-10-01.md)

---

## 1. 목적과 범위

ToonStudio 의 아바타 조형(Avatar Forge)은 조형 상태를 레시피로 휴머노이드 VRM 1.0 을 새로 만든다. 이 문서는 VRM 캐릭터
제작 도구의 기준 제품인 VRoid Studio 의 **공개된 작업 흐름**과 그 출력 파일 구조를 분석해, 생성 VRM 경로에서 빠져 있던
세 가지 작업 흐름을 같은 수준으로 채운 결과를 기록한다.

1. 표정 편집 — 기본 표정을 부위(눈썹·눈·입) 슬라이더로 다듬고, VRM 프리셋에 없는 연기 표정을 커스텀 표정으로 더한다.
2. 헤어 흔들림 — 헤어 묶음별 흔들림(단단함·처짐·공기 저항)을 조율해 생성 VRM 의 스프링본에 넣는다.
3. 아바타 정보·이용 조건·썸네일 — VRM 내보내기 화면의 필수·선택 항목을 작가가 정하고 정사각형 썸네일을 넣는다.

불러온 VRM 위에 얹는 비파괴 조형(오버레이)은 바꾸지 않는다. 세 기능은 **새로 만드는 VRM 에만** 들어간다.

## 2. 분석 방법 — REA 대체 절차

| 항목 | 현재 사실 |
| --- | --- |
| REA(`reverse-engineer-anything`) MCP | 이 클라우드 세션에 연결되어 있지 않아 쓰지 못했다. 그래서 `ev_…` 형식의 REA 증거 ID 는 만들지 않았다. |
| Ghidra | 설치되어 있지 않다(루트 `AGENTS.md` 의 Ghidra 강제 정책은 바이너리를 열 때 적용된다). |
| VRoid Studio 실행 파일 | 내려받거나 열지 않았다. 독점 제품은 공개 가이드의 워크플로만 재현하고 UI·프리셋·에셋 복제와 역공학을 하지 않는다는 저장소 정책을 따랐다. |

대신 같은 목적(작업 흐름과 데이터 계약을 사실로 확인)을 세 경로로 달성했다.

- **(A) 공개 가이드·공지**: VRoid 도움말과 공지의 검색 요약. 도움말 본문은 HTTP 403 으로 직접 열람하지 못했다(미확인 항목은 4.3절).
- **(B) 출력 파일 구조**: 저장소에 CC0 로 들어 있는 VRoid Studio 0.8.1 출력 VRM 7종의 GLB JSON 청크만 읽어 표정·흔들림·콜라이더·메타·재질
  구조를 요약했다. 바이너리 청크(정점·텍스처)는 해석하지 않았다. 파일별 SHA-256 은 증거 원장에 있다.
- **(C) 현재 구현**: 생성 경로 소스·테스트(변경 전 커밋 `112b5f0750fecd9914faead0dd89f9f814073f54`)와 설치된 `@pixiv/three-vrm` 3.5.5(MIT) 로더 계약.

## 3. 증거 원장 요약

| 구분 | 대상 | 방법 | 결과 |
| --- | --- | --- | --- |
| 공개 가이드 | 표정 편집(v0.12.0, 2020-12-17) | 공지 검색 요약 | 얼굴 편집의 표정 탭에서 프리셋 표정을 슬라이더로 편집 |
| 공개 가이드 | 헤어 흔들림 | 도움말 검색 요약 | 본 수 1~16, 고정점 0.01~0.99, 단단함·중력 0~1, 충돌 반경 |
| 공개 가이드 | VRM 내보내기 | 도움말 검색 요약 | VRM 1.0 은 아바타 이름·제작자 필수, 폴리곤·머티리얼·본 감축 단계 |
| 공개 가이드 | v1.20.0 공지(2023-03-02) | 공지 원문 | VRM 0.0/1.0 선택, VRM 0.0 Other 라이선스에 추가 라이선스 URL |
| 출력 파일 | CC0 샘플 7종(`Sendagaya_Shino.vrm` 등) | GLB JSON 청크 요약 스크립트 | 4.1절 관측 사실 |
| 현재 구현 | `studio-vrm-generate-recipe.ts` 외 | 소스 판독·기존 테스트 | 메타 고정, 썸네일 없음, 표정 프리셋 18종, 흔들림 자동 조율만 |

## 4. 관측된 사실 · 추론 · 미확인

### 4.1 관측된 사실

1. **부위별 표정 모프**: 얼굴 메시 모프 41개가 `Fcl_ALL`(통합) 5 · `Fcl_BRW`(눈썹) 5 · `Fcl_EYE`(눈) 11 · `Fcl_MTH`(입) 13 · `Fcl_HA`(송곳니) 6 ·
   `EyeExtra` 1 로 나뉜다. BlendShape 그룹 15개 중 감정(angry·fun·joy·sorrow·Surprised)은 `Fcl_ALL_*` 하나에 가중치 100, 입모양
   (a·i·u·e·o)은 `Fcl_MTH_*`, 깜빡임은 `Fcl_EYE_Close*` 에 묶인다. `Extra` 는 프리셋이 아닌 커스텀 그룹이다.
2. **헤어 묶음별 흔들림**: 헤어는 묶음마다 별도 boneGroup 이다(시노 15개). 샘플 전체에서 stiffness 0.4~0.911, gravityPower 0~0.085,
   hitRadius 0.0064~0.0496 으로 묶음마다 다르고 dragForce 는 0.4 로 같다. 가슴(0.75/0/0.05/0.02)·치마·소매(0.5/0/0.05/0.02)는 별도 그룹이다.
3. **콜라이더**: 12그룹(척추, 윗가슴 3구, 목, 머리, 위팔 3구·아래팔 4구·손 좌우, 허벅지 3구 좌우). 헤어는 다리를 뺀 10그룹과 충돌한다.
4. **메타와 썸네일**: 7종 모두 썸네일 텍스처와 이용 조건(허가 대상·폭력·성적·상업·추가 허가 URL·라이선스)을 메타에 담는다.
5. **ToonStudio 생성 경로(변경 전)**: 메타가 고정값(제작자=생성기 이름, 제작자 전용·개인 비영리·크레딧 필요·개변 허용)이고 썸네일이 없다. 표정은
   VRM 프리셋 이름과 같은 모프 18개뿐이며, 헤어 스프링은 체인 길이로만 자동 조율된다. 콜라이더는 몸통 캡슐 1개와 두개골 캡슐 2개다.
6. **로더 계약**: `@pixiv/three-vrm` 3.5.5 의 메타 로더는 라이선스 URL 이 `https://vrm.dev/licenses/1.0/` 가 아니면 거부하고,
   썸네일 이미지는 기본값(`needThumbnailImage: false`)에서 디코드하지 않는다.

### 4.2 추론

- **INF-VRM-01**: VRoid 출력의 부위 모프(눈썹·눈·입)와 프리셋 묶음 구조는 표정을 부위 조합으로 다루는 편집 모델과 맞는다. ToonStudio 는
  얼굴을 패치 지오메트리로 굽기 때문에, 같은 작업 흐름을 **패치 연산 조정량**으로 재현할 수 있다(모프 이름·UI·프리셋 값은 복제하지 않는다).
- **INF-VRM-02**: 헤어 묶음마다 stiffness·gravity·hitRadius 가 다른 것은 묶음별 슬라이더의 결과로 보인다. ToonStudio 는 길이 자동 조율을 유지한 채
  묶음 배율을 곱하면 같은 자유도를 주면서 짧은 가닥·긴 머리의 자연스러움을 잃지 않는다.
- **INF-VRM-03**: 출력 파일이 모두 썸네일을 담는 것은 VRM 뷰어·허브의 목록 아이콘 호환 때문으로 보인다. 생성 VRM 도 정사각형 썸네일을 넣는다.

### 4.3 미확인

- VRoid 표정 편집의 정확한 슬라이더 목록과 범위(도움말 본문 직접 열람 실패).
- 최신 VRoid Studio(1.x 이후) 출력 구조. 분석한 샘플은 0.8.1 베타 출력이다.
- 내보내기 감축(폴리곤·머티리얼 아틀라스·본)의 알고리즘 세부.

## 5. 기능 격차표

| VRoid 공개 작업 흐름 | 변경 전 ToonStudio | 이번 변경 | 남은 일 |
| --- | --- | --- | --- |
| 표정 편집(프리셋 조정) | 없음 | 감정 5종·입모양 5종을 눈썹·눈·입 슬라이더 9종으로 조정, 입모양은 입만 | — |
| 커스텀 표정 | 없음 | 웹툰 연기 템플릿 10종에서 최대 12개, VRM 1.0 `expressions.custom`, 깜빡임·립싱크 override 자동 | 템플릿 밖 이름 짓기 |
| 헤어 묶음별 흔들림 | 길이 자동 조율만 | 프리셋 5종 + 전체·묶음(앞·옆·뒤·묶음/땋은·삐침) 배율 3종 | 충돌 반경·본 수 조정 |
| 가슴·치마 흔들림, 팔·손 콜라이더 | 없음 | — | 의상 메시 스킨과 함께 설계 필요 |
| 아바타 정보·이용 조건 | 고정값 | 이름·제작자 필수 검증, 버전·저작권·연락처·참조, 이용 조건 묶음 4종 + 개별 항목, 추가 라이선스 URL | — |
| 썸네일 | 없음 | 조형 미리보기 자동(1024px 정사각형) 또는 내 이미지(가운데 자르기) | 3D 렌더 썸네일 |
| VRM 0.0 내보내기 | 없음(1.0 전용) | — | 좌표계 반전·0.x 메타·BlendShape·secondaryAnimation 변환 |
| 폴리곤·머티리얼·본 감축 | 없음 | — | 생성 캐릭터는 이미 경량(재질 9개, 텍스처 없음)이라 우선순위 낮음 |

## 6. 구현 매핑

| 영역 | 구현 파일 | 테스트 | 내용 |
| --- | --- | --- | --- |
| 표정 정의·편집 | `apps/web/src/domains/creator/vrm/studio-vrm-generate-expressions.ts` | `studio-vrm-generate-expressions.test.ts` | 기본 표정 테이블(휴머노이드 메시에서 이동), 부위 조정량 → 패치 연산, 커스텀 템플릿, override 정책 |
| 표정 미리보기 | `studio-vrm-generate-expression-preview.ts` | `studio-vrm-generate-expression-preview.test.ts` | 실제 얼굴 프리미티브 + 모프 델타 정면 투영, 깊이 순 칠하기 |
| 헤어 흔들림 | `studio-vrm-generate-hair-sway.ts` | `studio-vrm-generate-hair-sway.test.ts` | 자동 조율 × 전체 × 묶음 배율, VRM 범위(dragForce 0~1) 보장 |
| 흔들림 묶음 판정 | `studio-vrm-humanoid-mesh.ts`(`buildStudioVrmHumanoidHairRig`), `studio-vrm-generate-recipe.ts`(`listStudioVrmGenerateHairSwayGroups`) | `studio-vrm-generate-authoring.test.ts` | 메시를 굽지 않고 스프링 체인만 세워 **실제로 흔들리는 묶음**만 탭으로 보인다(정수리 번·짧은 덩어리 제외) |
| 저작 설정 저장 | `studio-vrm-avatar-forge-authoring.ts`, `studio-vrm-avatar-reference-product.ts` | 통합 테스트, `studio-vrm-avatar-reference-product.test.ts` | `AvatarForgeState.authoring` 검증 읽기·쓰기, 스타일 프리셋·참고 이미지 추천을 적용해도 이어받기 |
| 아바타 정보 | `studio-vrm-generate-export-meta.ts` | `studio-vrm-generate-export-meta.test.ts` | 폼 모델·검증·이용 조건 묶음·썸네일 헤더 판독·파일 이름 |
| 기기 기억 | `studio-vrm-export-profile-store.ts` | `studio-vrm-export-profile-store.test.ts` | Studio SQLite/OPFS 키-값, 실패 시 메모리 전용 표시 |
| 썸네일 래스터화 | `studio-vrm-generate-thumbnail.ts` | 맞춤 계산만 단위 테스트 | SVG → 캔버스 → PNG, 사용자 이미지 가운데 자르기 |
| 생성 연결 | `studio-vrm-generate-recipe.ts`, `studio-vrm-humanoid-mesh.ts`, `studio-vrm-generate-mcp.ts` | `studio-vrm-generate-authoring.test.ts`, `studio-vrm-generate.test.ts` | preset/custom 분리, 스프링 배율, 메타·썸네일, three-vrm 재적재. 내보내기 검증이 거절하면 연결 장애 안내 대신 그 사유를 보인다 |
| UI | `StudioVrmAvatarForgeGenerateSection.tsx`, `StudioVrmGenerateExpressionEditor.tsx`, `StudioVrmGenerateHairSwayControls.tsx`, `StudioVrmGenerateExportInfoForm.tsx` | `StudioVrmAvatarForgeGenerateSection.test.tsx` | "새 VRM 캐릭터" 구역의 접이식 옵션 3개. 다른 모델로 바꾸면 이름·버전·참조·직접 고른 썸네일을 비우고 제작자·이용 조건은 남긴다. "내 이미지"인데 이미지가 없으면 생성을 막고, 4MB 넘는 파일은 읽기 전에 거른다 |
| 상태 문구 i18n | `status-i18n/studio-vrm-generate-status-i18n.ts` | `studio-vrm-generate-status-i18n.test.ts`, `creator-status-i18n-contract.test.ts` | 차단·실패·빈 상태·완료·저장 상태 안내 13개를 ko/en 키로 등록(한국어 폴백). 새 UI 4파일을 상태 문구 가드에 등록 |
| 포저 라벨 | `studio-vrm-poser-helpers.ts` | 기존 포저 테스트 | 커스텀 표정 키(ASCII)를 한글 템플릿 라벨로 표시 |

## 7. 하위호환·번들·성능 계약

- **바이트 동일**: 저작 설정이 비어 있으면 조형 상태에 `authoring` 키가 생기지 않고, 생성 VRM 바이트가 변경 전과 같다. 기본 상태와 스타일 프리셋
  21종, 모두 22개의 SHA-256 을 변경 전 커밋과 변경 후 작업 트리에서 같은 스크립트로 계산해 전부 일치함을 확인했다(증거 원장
  `generatedOutputIdentity`).
- **즉시 로딩 그래프**: 조형 코어(`studio-vrm-avatar-forge.ts`)는 Studio 편집기가 처음부터 불러오는 모듈이다. 코어는 `authoring` 을
  불투명한 원본(`Readonly<Record<string, unknown>>`)으로 보관만 하고 검증기를 가져오지 않는다. 검증은 지연 로딩되는 생성·편집 모듈이
  `readAvatarForgeVrmAuthoring` 으로 한다. 그래서 `creator/vrm` 정적 도달 모듈 수가 14개 그대로다.
- **파일 크기 래칫**: 패널 1258 → 1116줄(생성 구역을 별도 컴포넌트로 분리), 휴머노이드 메시 2029 → 1961줄(기본 표정 테이블 이동,
  헤어 체인 계획 분리), 조형 코어 1108 → 1107줄. 새 파일은 모두 800줄 이하다. 바이트 동일 검사는 헤어 체인 계획을 분리한 뒤 다시 돌려
  22개 모두 일치했다.
- **성능**: 휴머노이드 메시 생성은 Node 측정으로 약 10ms, 표정 미리보기 두 장은 약 16ms 다. 미리보기는 메시를 한 번 구워 무표정·편집
  결과를 함께 그리고, `useDeferredValue` 로 슬라이더 입력을 막지 않는다. 흔들림 묶음 판정은 체인만 세워 1~3ms 이고 저작 설정을 뺀 외형
  서명이 바뀔 때만 다시 계산한다. 레시피는 조형 상태가 바뀔 때만 만든다. 옵션 구역이 닫혀 있으면 미리보기를 계산하지 않는다.

## 8. 검증 결과(2026-10-29)

| 검증 | 결과 |
| --- | --- |
| 새·변경 단위·통합·UI 테스트 | 표정 18 · 흔들림 8 · 아바타 정보 11 · 기기 저장 3 · 생성 통합 11 · 미리보기 5 · 생성 구역 UI 12 · 상태 문구 3 · 참고 추천 6 · 생성 MCP 14, 모두 91개 통과 |
| 회귀 고정 확인 | 세션 전환 초기화·썸네일 미선택 차단·크기 선검사·참고 추천 이어받기는 수정을 하나씩 되돌리면 해당 테스트만 실패함을 확인 |
| VRM 도메인 + 상태 문구 + 매뉴얼 + i18n 계약 + 조형 상태·장면 문서 의존 테스트 | 최신 main(`d75bf4d3`) 위로 옮긴 뒤 352개 파일, 3,938개 테스트 모두 통과. 옮기기 전 기준 커밋(`112b5f07`)에서는 `studio-frozen-status-i18n-r3frz.test.ts` 1건이 같은 단언으로 실패하던 기존 실패였고, main 의 `20ecdbb0` 이 고쳤다. 그 사이 main 변경 중 이 변경과 겹치는 파일은 없다 |
| 매뉴얼 | `studio-manual.test.ts` 통과, `pnpm run verify:studio-manual-docs` 일치 |
| 타입 검사 | 저장소 전체 `tsc` 는 이 세션 머신(메모리 16GB, 스왑 없음)에서 힙 부족으로 강제 종료돼 임시 스왑 8GB 를 붙여 끝까지 돌렸다. 이 실행이 변경 파일 범위 검사로는 못 잡은 오류 4건을 찾았다(기존 테스트 2개 파일에서 조형 상태를 장면 문서 정규 데이터 `StudioVrmCanonicalData` 자리에 넣는데 `authoring` 타입이 `unknown` 을 담아 할당되지 않음). `authoring` 을 장면 문서와 같은 JSON 모양 타입으로 바꿔 고친 뒤, 변경 파일·그 의존 파일·선언 파일 범위(145개 파일과 그 import 그래프) 검사에서 오류 0 |
| lint | 변경 파일 eslint 오류·경고 0 |
| 래칫 | 파일 크기·즉시 로딩 그래프(`creator/vrm` 14/14) 통과. 미연결 코드 게이트는 변경 전 트리와 발견 목록이 같은 807건(기존 기준선 밖)으로 실패하며 차이는 0건 |

## 9. 남은 위험과 후속 과제

- 썸네일 래스터화(SVG → 캔버스)와 흔들림 배율의 실제 움직임은 실제 브라우저에서 아직 확인하지 않았다. 캔버스를 쓸 수 없으면 썸네일 없이 내보내도록
  실패를 닫아 두었다.
- 커스텀 표정 이름은 템플릿 키로 고정이다. 다른 앱에서는 `wink`, `jitome` 같은 키로 보인다.
- i18n 은 상태 안내만 키로 옮겼다. 폼 라벨·표정·흔들림 이름·도움말은 주변 조형 패널과 같이 한국어 원문이고, 내보내기 검증 사유는
  `studio-vrm-export-error` 의 고정 한글 어휘를 쓴다. 조형 패널 전체를 키 기반으로 옮기는 일은 별도 작업이다.
- 7.4.1 의 여덟 authority 중 이번 변경은 2(표정 바인딩)·4(헤어 흔들림 조율)·7(메타·썸네일·이용 조건) 을 넓혔다. VRM 0.x 내보내기,
  가슴·치마 흔들림 본과 팔·손 콜라이더, 내보내기 감축은 5절의 남은 일로 남는다. 따라서 "VRM Studio 대체 완료"라고 표현하지 않는다.
