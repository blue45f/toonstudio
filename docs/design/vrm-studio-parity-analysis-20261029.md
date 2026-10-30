# VRM 스튜디오(VRoid Studio) 기능 대응 분석과 생성 VRM 고도화 설계서

- **작성일**: 2026-10-29 · **갱신**: 2026-10-30(REA 분석 반영, 시선 정의·가닥별 흔들림 보강)
- **상태**: `current` — 구현과 단위·통합·UI 테스트 검증 완료. 실제 브라우저에서의 썸네일 래스터화·물리 흔들림·시선 육안 확인은 아직 하지 않았다(9절).
- **증거 원장**: [`docs/evidence/vrm-studio-parity-20261029.json`](../evidence/vrm-studio-parity-20261029.json)
- **관련 경계 문서**: [하이브리드 DCC 엔진 아키텍처 7.4.1 "VRM Studio형 캐릭터 창조"](../studio-hybrid-dcc-engine-architecture-2026-08-02.md), [Labs 캐릭터 엔진 참고 자료 5절(독점 제품 정책)](../engines/labs-character-engine-references-2026-10-01.md)

---

## 1. 목적과 범위

ToonStudio 의 아바타 조형(Avatar Forge)은 조형 상태를 레시피로 휴머노이드 VRM 1.0 을 새로 만든다. 이 문서는 VRM 캐릭터
제작 도구의 기준 제품인 VRoid Studio 의 **공개된 작업 흐름**과 그 출력 파일 구조를 분석해, 생성 VRM 경로에서 빠져 있던
세 가지 작업 흐름을 같은 수준으로 채운 결과를 기록한다.

1. 표정 편집 — 기본 표정을 부위(눈썹·눈·입) 슬라이더로 다듬고, VRM 프리셋에 없는 연기 표정을 커스텀 표정으로 더한다.
2. 헤어 흔들림 — 헤어 묶음과 덩어리(가닥)별 흔들림(단단함·처짐·공기 저항)을 조율해 생성 VRM 의 스프링본에 넣는다.
3. 아바타 정보·이용 조건·썸네일 — VRM 내보내기 화면의 필수·선택 항목을 작가가 정하고 정사각형 썸네일을 넣는다.
4. 시선(lookAt) — REA 정적 분석으로 찾은 누락. 생성 VRM 에 시선 표정은 있었지만 시선 정의가 없어 VRM 런타임이 시선을 만들지 않았다.

불러온 VRM 위에 얹는 비파괴 조형(오버레이)은 바꾸지 않는다. 네 기능은 **새로 만드는 VRM 에만** 들어간다.

## 2. 분석 방법 — REA 분석과 보조 경로

| 항목 | 현재 사실 |
| --- | --- |
| REA(`reverse-engineer-anything`) | 2026-10-30 사용자 허가를 받아 공개 npm 패키지 `rea-agents` 6.8.0(MIT, `github.com/morluto/rea`)을 이 세션에서 CLI 로 실행했다. 설치 스크립트를 끄고 격리 디렉터리에 설치했다. 이 세션에는 REA MCP 가 연결되지 않아, 같은 도구(`analyze_javascript_application`, `capture_browser_scenario`)를 CLI 로 썼다. |
| REA 분석 대상 | (1) VRoid Studio 자체의 공개 웹 문서 — 제품 소개(`vroid.com/en/studio`)·이용약관·가이드라인·공지·도움말(브라우저 캡처), (2) 생성 VRM 을 실제로 읽는 MIT 오픈소스 런타임 `@pixiv/three-vrm-core`·`@pixiv/three-vrm-springbone` 3.5.5 의 ES 모듈 빌드(정적 분석). |
| VRoid Studio 실행 파일 | 열지 않았다. 독점 제품은 공개 가이드의 워크플로만 재현하고 UI·프리셋·에셋 복제와 역공학을 하지 않는다는 저장소 정책과, 라이선스·약관 준수를 요구하는 REA 면책 조항을 따랐다. REA 로 캡처한 VRoid Studio 이용약관(`ev_56b62852…`)도 "소프트웨어의 전부 또는 일부를 리버스 엔지니어링·디컴파일·역어셈블하거나 그 밖의 방식으로 분석하는 행위"를 금지한다. 네이티브 바이너리를 열지 않았으므로 Ghidra 강제 정책이 적용될 대상은 없었다. |
| 도움말 센터 | `vroid.pixiv.help` 는 REA 브라우저 캡처에도 Cloudflare 봇 검증 화면만 돌려줬다(`ev_4342738a…`). 봇 보호는 우회하지 않았다. |

작업 흐름과 데이터 계약을 사실로 확인한 경로는 넷이다.

- **(A) 공개 가이드·공지**: vroid.com 공지는 REA 캡처로 원문을 확보했다(`ev_a66a0982…`). 도움말 센터 본문은 봇 검증에 막혀 검색 요약만 썼다(미확인 항목은 4.3절).
- **(B) 출력 파일 구조**: 저장소에 CC0 로 들어 있는 VRoid Studio 0.8.1 출력 VRM 7종의 GLB JSON 청크만 읽어 표정·흔들림·콜라이더·메타·재질·시선
  구조를 요약했다. 바이너리 청크(정점·텍스처)는 해석하지 않았다. 파일별 SHA-256 은 증거 원장에 있다.
- **(C) 런타임 계약(REA)**: REA 정적 분석으로 three-vrm 의 표정·메타·시선·스프링본 로더 위치(모듈 내 오프셋)를 찾고, 그 구간 원문을 읽어
  생성 VRM 출력과 대조했다(4.1절 7~11항). VRoid Studio 공식 작업 흐름은 제품 소개 캡처와 대조했다(12항).
- **(D) 현재 구현**: 생성 경로 소스·테스트(변경 전 커밋 `112b5f0750fecd9914faead0dd89f9f814073f54`).

## 3. 증거 원장 요약

| 구분 | 대상 | 방법 | 결과 |
| --- | --- | --- | --- |
| 공개 가이드 | 표정 편집(v0.12.0, 2020-12-17) | 공지 검색 요약 | 얼굴 편집의 표정 탭에서 프리셋 표정을 슬라이더로 편집 |
| 공개 가이드 | 헤어 흔들림 | 도움말 검색 요약 | 본 수 1~16, 고정점 0.01~0.99, 단단함·중력 0~1, 충돌 반경 |
| 공개 가이드 | VRM 내보내기 | 도움말 검색 요약 | VRM 1.0 은 아바타 이름·제작자 필수, 폴리곤·머티리얼·본 감축 단계 |
| 공개 가이드 | v1.20.0 공지(2023-03-02) | 공지 원문 | VRM 0.0/1.0 선택, VRM 0.0 Other 라이선스에 추가 라이선스 URL |
| 제품 소개(REA) | `vroid.com/en/studio`(v2.16.0 배포 페이지) | `capture_browser_scenario` `ev_9e89290f06a8d3a482a0530e74a431d8869b77bf6565d284fd0c37a53f730ba6` | 공식 작업 흐름: 프리셋 + 슬라이더 실시간 편집, 의상 템플릿 겹치기, 액세서리, 텍스처 펜·레이어, 붓질로 헤어 덩어리 만들기와 **덩어리마다 따로 정하는 헤어 흔들림**, 모델별 이용 조건 설정과 VRM 내보내기 |
| 이용약관(REA) | `policies.pixiv.net/en.html#vroidstudio` | `capture_browser_scenario` `ev_56b62852d5ca7aef970304e17e93fc15b41bcca94ce6399c90fa5e4dd1d1804e` | 소프트웨어 리버스 엔지니어링·디컴파일·역어셈블·분석 금지 |
| 가이드라인(REA) | `vroid.com/en/studio/guidelines` | `capture_browser_scenario` `ev_555a70b17f4b0972d4bbedc44d23fcdc42ac7e0b081bc99f040eef8b03da780d` | 직접 만든 텍스처·헤어 메시의 권리는 작가, 기본 모델·의상 메시·프리셋은 pixiv 제공(CC0 아님) |
| 공개 공지(REA) | vroid.com v1.20.0 공지 | `capture_browser_scenario` `ev_a66a0982d8810caafef6a357c389c0e36fe217d3b23a5c32812540cf067b7f1e` | VRM1.0 내보내기 추가, VRM0.0 Other 라이선스 추가 URL, 얼굴 메시 없이 내보내기 |
| 도움말(REA) | vroid.pixiv.help 헤어 흔들림 문서 | `capture_browser_scenario` `ev_4342738a358eb1ff79e4b92a6b48f85039e848c0ec30c9b9546a985ef221e38f` | Cloudflare 봇 검증 화면 — 본문 미수집 |
| 런타임(REA) | `@pixiv/three-vrm-core` 3.5.5 `lib/three-vrm-core.module.js` | `analyze_javascript_application` `ev_a3a92d5b466aa8391981f9d0b1b52ccca4d871f38aa79d4708b12c22537c2124`(요약 `ev_c0a12cee…`) | AST 노드 13,822 · 발견 66 · 표정/메타/시선 로더 위치 |
| 런타임(REA) | `@pixiv/three-vrm-springbone` 3.5.5 `lib/three-vrm-springbone.module.js` | `analyze_javascript_application` `ev_71590d6f1aa9a70e0b2caa7dfd35a8872c8851952886169a444d4d16f7d2436a`(요약 `ev_24cca463…`) | AST 노드 7,201 · 발견 43 · 관절 설정·짝짓기 위치 |
| 출력 파일 | CC0 샘플 7종(`Sendagaya_Shino.vrm` 등) | GLB JSON 청크 요약 스크립트 | 4.1절 관측 사실 |
| 현재 구현 | `studio-vrm-generate-recipe.ts` 외 | 소스 판독·기존 테스트 | 메타 고정, 썸네일 없음, 표정 프리셋 18종, 흔들림 자동 조율만, 시선 정의 없음 |

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
7. **표정 로더(REA, three-vrm-core 22945–28818)**: 프리셋 이름 밖의 `preset` 과 프리셋 이름을 쓴 `custom` 은 경고 뒤 버린다. `isBinary` 기본 false,
   override 3종 기본 `"none"`, 모프 바인드 가중치 기본 1 이다. 모프 바인드는 노드의 **모든** 프리미티브가 그 모프 번호를 가질 때만 묶이고,
   아니면 경고만 남긴다(표정은 등록되지만 움직이지 않는다). 생성 VRM 재적재 테스트에 바인드가 얼굴 프리미티브 4개를 모두 덮는지 단언을 더했다.
8. **메타 로더(REA, 108480–113081)**: 썸네일은 `needThumbnailImage` 를 켠 뷰어만 `images[thumbnailImage].bufferView` → Blob → 이미지로 읽는다.
   앱 라이브러리의 `extractEmbeddedVrmThumbnailBytes` 도 같은 경로(`meta.thumbnailImage` → `images[i].bufferView`)로 꺼낸다.
9. **스프링본 로더(REA, three-vrm-springbone 35392–42306·18888–20821)**: VRM 1.0 관절은 이웃한 두 개씩 짝지어 **앞 관절의 설정**으로 스프링을
   만든다. 마지막 관절의 설정은 쓰이지 않고, 관절이 하나뿐인 스프링은 흔들리지 않는다. 생략값은 hitRadius 0 · stiffness 1 · gravityPower 0 ·
   gravityDir (0,−1,0) · dragForce 0.4 다. 생성 VRM 은 스타일 프리셋 21종·헤어 스타일 14종 모두 스프링당 관절 4~7개라 흔들리지 않는 스프링이 없다.
10. **시선 로더(REA, 102557–104188·97872–)**: `VRMC_vrm.lookAt` 이 없으면 시선을 만들지 않는다. `expression` 형식은
    `rangeMapVerticalUp`·`rangeMapVerticalDown`·`rangeMapHorizontalOuter` 로 lookUp·lookDown·lookLeft·lookRight 가중치를
    `outputScale × saturate(각도 / inputMaxValue)` 로 정하고, 시선 원점은 `offsetFromHeadBone` 에 raw head 노드의 matrixWorld 를 곱한 위치다.
    `VRMLookAt.update` 는 요·피치가 바뀔 때만 표정을 다시 쓴다.
11. **시선 대조**: VRoid CC0 출력 7종은 모두 시선을 정의한다(Bone 형식, 원점 (0, 0.06, 0), 입력 90°에 출력 8~16°). 변경 전 생성 VRM 은 시선 표정
    4종만 있고 `lookAt` 이 없어, three-vrm 과 앱의 웹캠 시선 추적(`vrm.lookAt` 이 있으면 그것으로 구동)이 생성 캐릭터의 눈동자를 움직이지 못했다.
12. **VRoid Studio 공식 작업 흐름(REA, 제품 소개 `ev_9e89290f…`)**: 프리셋을 고른 뒤 슬라이더로 실시간 조정하고, 헤어는 붓질 한 번으로 덩어리를
    만든 뒤 파라미터로 다듬으며 **흔들림을 덩어리마다 따로** 정한다. 모델·텍스처·아이템마다 상업 이용·크레딧 같은 이용 조건을 정해 VRM 으로 내보낸다.
    변경 전 ToonStudio 의 흔들림은 묶음 5종 단위까지만 정할 수 있었다(→ 가닥 단위 보강).

### 4.2 추론

- **INF-VRM-01**: VRoid 출력의 부위 모프(눈썹·눈·입)와 프리셋 묶음 구조는 표정을 부위 조합으로 다루는 편집 모델과 맞는다. ToonStudio 는
  얼굴을 패치 지오메트리로 굽기 때문에, 같은 작업 흐름을 **패치 연산 조정량**으로 재현할 수 있다(모프 이름·UI·프리셋 값은 복제하지 않는다).
- **INF-VRM-02**: 헤어 묶음마다 stiffness·gravity·hitRadius 가 다른 것은 묶음별 슬라이더의 결과로 보인다. ToonStudio 는 길이 자동 조율을 유지한 채
  묶음 배율을 곱하면 같은 자유도를 주면서 짧은 가닥·긴 머리의 자연스러움을 잃지 않는다.
- **INF-VRM-03**: 출력 파일이 모두 썸네일을 담는 것은 VRM 뷰어·허브의 목록 아이콘 호환 때문으로 보인다. 생성 VRM 도 정사각형 썸네일을 넣는다.

### 4.3 미확인

- VRoid 표정 편집의 정확한 슬라이더 목록과 범위(도움말 센터가 봇 검증으로 막혀 REA 캡처로도 본문을 얻지 못했다).
- 최신 VRoid Studio(1.x 이후) 출력 구조. 분석한 샘플은 0.8.1 베타 출력이다.
- 내보내기 감축(폴리곤·머티리얼 아틀라스·본)의 알고리즘 세부.

## 5. 기능 격차표

| VRoid 공개 작업 흐름 | 변경 전 ToonStudio | 이번 변경 | 남은 일 |
| --- | --- | --- | --- |
| 표정 편집(프리셋 조정) | 없음 | 감정 5종·입모양 5종을 눈썹·눈·입 슬라이더 9종으로 조정, 입모양은 입만 | — |
| 커스텀 표정 | 없음 | 웹툰 연기 템플릿 10종에서 최대 12개, VRM 1.0 `expressions.custom`, 깜빡임·립싱크 override 자동 | 템플릿 밖 이름 짓기 |
| 헤어 묶음·덩어리별 흔들림 | 길이 자동 조율만 | 프리셋 5종 + 전체·묶음(앞·옆·뒤·묶음/땋은·삐침)·가닥(스프링 체인, 화면 왼쪽부터 번호) 배율 3종을 차례로 곱함 | 충돌 반경·본 수 조정, 붓질로 덩어리 만들기 |
| 가슴·치마 흔들림, 팔·손 콜라이더 | 없음 | — | 의상 메시 스킨과 함께 설계 필요 |
| 아바타 정보·이용 조건 | 고정값 | 이름·제작자 필수 검증, 버전·저작권·연락처·참조, 이용 조건 묶음 4종 + 개별 항목, 추가 라이선스 URL | — |
| 썸네일 | 없음 | 조형 미리보기 자동(1024px 정사각형) 또는 내 이미지(가운데 자르기) | 3D 렌더 썸네일 |
| 시선(lookAt) | 시선 표정 4종만 있고 정의 없음 → 런타임이 시선을 만들지 않음 | `expression` 형식, 원점 = 두 눈동자 가운데(head 로컬), 범위 90° → 1 | 눈 본 기반(`bone`) 시선 |
| VRM 0.0 내보내기 | 없음(1.0 전용) | — | 좌표계 반전·0.x 메타·BlendShape·secondaryAnimation 변환 |
| 폴리곤·머티리얼·본 감축 | 없음 | — | 생성 캐릭터는 이미 경량(재질 9개, 텍스처 없음)이라 우선순위 낮음 |

## 6. 구현 매핑

| 영역 | 구현 파일 | 테스트 | 내용 |
| --- | --- | --- | --- |
| 표정 정의·편집 | `apps/web/src/domains/creator/vrm/studio-vrm-generate-expressions.ts` | `studio-vrm-generate-expressions.test.ts` | 기본 표정 테이블(휴머노이드 메시에서 이동), 부위 조정량 → 패치 연산, 커스텀 템플릿, override 정책 |
| 표정 미리보기 | `studio-vrm-generate-expression-preview.ts` | `studio-vrm-generate-expression-preview.test.ts` | 실제 얼굴 프리미티브 + 모프 델타 정면 투영, 깊이 순 칠하기 |
| 헤어 흔들림 | `studio-vrm-generate-hair-sway.ts` | `studio-vrm-generate-hair-sway.test.ts` | 자동 조율 × 전체 × 묶음 × 가닥 배율, VRM 범위(dragForce 0~1) 보장. 가닥 키는 체인 id 형식만, 최대 32개, 정렬해 저장. 지금 헤어에 없는 가닥의 조정은 걷어 내고(`keepStudioVrmHairSwayChains`) 요약은 지금 헤어에 있는 묶음·가닥만 센다 |
| 흔들림 묶음·가닥 판정 | `studio-vrm-humanoid-mesh.ts`(`buildStudioVrmHumanoidHairRig`), `studio-vrm-generate-recipe.ts`(`listStudioVrmGenerateHairSwayChains`·`listStudioVrmGenerateHairSwayGroups`) | `studio-vrm-generate-authoring.test.ts`, `StudioVrmAvatarForgeGenerateSection.test.tsx` | 메시를 굽지 않고 스프링 체인만 세워 **실제로 흔들리는 묶음과 가닥**만 탭으로 보인다(정수리 번·짧은 덩어리 제외). 가닥 하나를 조정하면 그 스프링만 바뀐다. 가닥 목록은 생성 구역이 외형 서명이 바뀔 때만 한 번 세워 요약 배지와 흔들림 편집이 함께 쓴다 |
| 저작 설정 저장 | `studio-vrm-avatar-forge-authoring.ts`, `studio-vrm-avatar-reference-product.ts` | 통합 테스트, `studio-vrm-avatar-reference-product.test.ts` | `AvatarForgeState.authoring` 검증 읽기·쓰기, 스타일 프리셋·참고 이미지 추천을 적용해도 이어받기 |
| 아바타 정보 | `studio-vrm-generate-export-meta.ts` | `studio-vrm-generate-export-meta.test.ts` | 폼 모델·검증·이용 조건 묶음·썸네일 헤더 판독·파일 이름 |
| 기기 기억 | `studio-vrm-export-profile-store.ts` | `studio-vrm-export-profile-store.test.ts` | Studio SQLite/OPFS 키-값, 실패 시 메모리 전용 표시 |
| 썸네일 래스터화 | `studio-vrm-generate-thumbnail.ts` | 맞춤 계산만 단위 테스트 | SVG → 캔버스 → PNG, 사용자 이미지 가운데 자르기 |
| 생성 연결 | `studio-vrm-generate-recipe.ts`, `studio-vrm-humanoid-mesh.ts`, `studio-vrm-generate-mcp.ts` | `studio-vrm-generate-authoring.test.ts`, `studio-vrm-generate.test.ts` | preset/custom 분리, 스프링 배율, 메타·썸네일, three-vrm 재적재. 내보내기 검증이 거절하면 연결 장애 안내 대신 그 사유를 보인다 |
| UI | `StudioVrmAvatarForgeGenerateSection.tsx`, `StudioVrmGenerateExpressionEditor.tsx`, `StudioVrmGenerateHairSwayControls.tsx`, `StudioVrmGenerateExportInfoForm.tsx` | `StudioVrmAvatarForgeGenerateSection.test.tsx` | "새 VRM 캐릭터" 구역의 접이식 옵션 3개. 다른 모델로 바꾸면 이름·버전·참조·직접 고른 썸네일을 비우고 제작자·이용 조건은 남긴다. "내 이미지"인데 이미지가 없으면 생성을 막고, 4MB 넘는 파일은 읽기 전에 거른다 |
| 상태 문구 i18n | `status-i18n/studio-vrm-generate-status-i18n.ts` | `studio-vrm-generate-status-i18n.test.ts`, `creator-status-i18n-contract.test.ts` | 차단·실패·빈 상태·완료·저장 상태 안내 13개를 ko/en 키로 등록(한국어 폴백). 새 UI 4파일을 상태 문구 가드에 등록 |
| 포저 라벨 | `studio-vrm-poser-helpers.ts` | 기존 포저 테스트 | 커스텀 표정 키(ASCII)를 한글 템플릿 라벨로 표시 |
| 시선(lookAt) | `studio-vrm-export-look-at.ts`(신규), `studio-vrm-export-vrm-extension.ts`, `studio-vrm-export-plan.ts`, `studio-vrm-generate-recipe.ts`(`generatedLookAt`), `studio-vrm-export-error.ts`(`look-at-invalid`) | `studio-vrm-export-look-at.test.ts`, `studio-vrm-generate-authoring.test.ts` | `bone` 은 좌우 눈 본, `expression` 은 시선 표정 4종이 있을 때만 쓴다. 범위·원점을 검증한다. three-vrm 이 30°에서 lookLeft 1/3 을 걸고, 4두신에서도 원점이 렌더된 두 눈 가운데에서 2mm 안이다 |

## 7. 하위호환·번들·성능 계약

- **출력 변화는 시선 정의 하나**: 저작 설정이 비어 있으면 조형 상태에 `authoring` 키가 생기지 않는다. 시선 정의를 넣으면서 모든 생성 VRM 의
  바이트가 바뀌었지만, 같은 스냅샷에서 `lookAt` 만 빼고 직렬화하면 기본 상태와 스타일 프리셋 21종, 모두 22개의 SHA-256 이 변경 전 커밋과 전부
  같다(증거 원장 `generatedOutputIdentity`). 즉 표정·흔들림·메타 기능은 편집하지 않으면 출력을 바꾸지 않는다.
- **즉시 로딩 그래프**: 조형 코어(`studio-vrm-avatar-forge.ts`)는 Studio 편집기가 처음부터 불러오는 모듈이다. 코어는 `authoring` 을
  장면 문서 정규 데이터와 같은 JSON 모양 원본으로 보관만 하고 검증기를 가져오지 않는다. 검증은 지연 로딩되는 생성·편집 모듈이
  `readAvatarForgeVrmAuthoring` 으로 한다. 그래서 `creator/vrm` 정적 도달 모듈 수가 14개 그대로다.
- **파일 크기 래칫**: 패널 1258 → 1116줄(생성 구역을 별도 컴포넌트로 분리), 휴머노이드 메시 2029 → 1961줄(기본 표정 테이블 이동,
  헤어 체인 계획 분리), 조형 코어 1108 → 1108줄, VRM 확장 829 → 829줄(짧은 import 접기), 내보내기 계획 991 → 990줄. 새 파일은 모두
  800줄 이하다.
- **성능**: 휴머노이드 메시 생성은 Node 측정으로 약 10ms, 표정 미리보기 두 장은 약 16ms 다. 미리보기는 메시를 한 번 구워 무표정·편집
  결과를 함께 그리고, `useDeferredValue` 로 슬라이더 입력을 막지 않는다. 흔들림 묶음 판정은 체인만 세워 1~3ms 이고 저작 설정을 뺀 외형
  서명이 바뀔 때만 다시 계산한다. 레시피는 조형 상태가 바뀔 때만 만든다. 옵션 구역이 닫혀 있으면 미리보기를 계산하지 않는다.

## 8. 검증 결과(2026-10-29, 2026-10-30 갱신)

| 검증 | 결과 |
| --- | --- |
| 새·변경 단위·통합·UI 테스트 | 표정 18 · 흔들림 11 · 아바타 정보 11 · 기기 저장 3 · 생성 통합 13 · 미리보기 5 · 생성 구역 UI 14 · 상태 문구 3 · 참고 추천 6 · 생성 MCP 14 · 시선 내보내기 5, 모두 103개 통과 |
| 회귀 고정 확인 | 세션 전환 초기화·썸네일 미선택 차단·크기 선검사·참고 추천 이어받기는 수정을 하나씩 되돌리면 해당 테스트만 실패함을 확인. 시선 원점을 three-vrm 기본값(head 위 6cm)으로 바꾸면 4두신에서 10.8cm 어긋나 시선 테스트가 실패함을 확인. 지금 헤어에 없는 가닥 조정 32개가 쌓인 상태에서 요약 계산을 되돌리면 "묶음·가닥 32곳"으로 세고, 편집 전 걷어 내기를 되돌리면 새 가닥 조정이 정렬 순서에 밀려 저장되지 않아 생성 구역 테스트가 실패함을 확인 |
| VRM 도메인 + 상태 문구 + 매뉴얼 + i18n 계약 + 조형 상태·장면 문서·내보내기 의존 테스트 | 가닥별 흔들림과 가닥 정리 뒤 최신 main(`36cfccec`, 시선 정의 PR 병합 포함) 위에서 367개 파일, 4,199개 테스트 모두 통과. 깨끗한 `4685be49` 에서도 같은 단언으로 실패하던 기존 실패 6건(`studio-frozen2-status-i18n-r4frz`·`studio-frozen3-status-i18n-r5frz`·`studio-frozen5-status-i18n-r6frz5`·`studio-frozen6-status-i18n-r7frz6`·`studio-status-i18n-r3c06`·`studio-vrm-pose-overlay-boundary`)은 원인대로 함께 고쳤다. main 이 상태 문구를 각 파일의 이중 언어 헬퍼로 옮기며 남긴 죽은 키 5개를 등록부에서 지우고, bg3d 의 새 하드코딩 실패 문구를 frozen6 키로 옮기고, 다른 파일로 옮겨진 Hybrid 진단 문구 3건만큼 고정값을 낮추고, 포저 뷰포트가 쓰는 `CharacterShaperOrbitControls` 를 찾게 했다(손 IK·관절 핸들 가드 단언은 그대로). `36cfccec` 병합 뒤 새로 실패한 `studio-status-i18n-r3c07` 도 `64c3cd5b` 가 남긴 죽은 키 `saveSync.serverUnavailable` 를 지워 고쳤다(모두 7건). 그 전 기준(`35ee3aae`)에서는 355개 파일, 3,971개 테스트 모두 통과. 가닥별 흔들림은 편집하지 않으면 출력을 바꾸지 않는다(시선 추가 뒤 해시 22개와 같음). 옮기기 전 기준 커밋(`112b5f07`)에서는 `studio-frozen-status-i18n-r3frz.test.ts` 1건이 같은 단언으로 실패하던 기존 실패였고, main 의 `20ecdbb0` 이 고쳤다. 그 사이 main 변경 중 이 변경과 겹치는 파일은 없다 |
| 매뉴얼 | `studio-manual.test.ts` 통과, `pnpm run verify:studio-manual-docs` 일치. main 의 bg3d 변경(`96ba8e67`)이 원문만 바꿔 main 에서도 불일치였던 생성 문서를 `pnpm manual:gen` 으로 다시 맞춤 |
| 타입 검사 | 저장소 전체 `tsc` 는 이 세션 머신(메모리 16GB, 스왑 없음)에서 힙 부족으로 강제 종료돼 임시 스왑 8GB 를 붙여 끝까지 돌렸다. 이 실행이 변경 파일 범위 검사로는 못 잡은 오류 4건을 찾았다(기존 테스트 2개 파일에서 조형 상태를 장면 문서 정규 데이터 `StudioVrmCanonicalData` 자리에 넣는데 `authoring` 타입이 `unknown` 을 담아 할당되지 않음). `authoring` 을 장면 문서와 같은 JSON 모양 타입으로 바꿔 고친 뒤 푸시 전 훅의 전체 검사가 통과했고, 시선 정의를 더한 뒤에도 `pnpm run typecheck`(웹 tsc + API, 임시 스왑 8GB) 오류 0. 가닥 정리 뒤에는 변경 파일과 그 import 파일 범위 tsc 오류 0, 푸시 전 훅의 저장소 전체 tsc(웹)·API typecheck 통과 |
| lint | 변경 파일 eslint 오류·경고 0 |
| 래칫 | 파일 크기·즉시 로딩 그래프(`creator/vrm` 14/14) 통과. 미연결 코드 게이트는 변경 전 트리와 발견 목록이 같은 807건(기존 기준선 밖)으로 실패하며 차이는 0건 |

## 9. 남은 위험과 후속 과제

- 썸네일 래스터화(SVG → 캔버스)와 흔들림 배율의 실제 움직임은 실제 브라우저에서 아직 확인하지 않았다. 캔버스를 쓸 수 없으면 썸네일 없이 내보내도록
  실패를 닫아 두었다.
- 커스텀 표정 이름은 템플릿 키로 고정이다. 다른 앱에서는 `wink`, `jitome` 같은 키로 보인다.
- 시선 범위는 VRM·three-vrm 의 `expression` 형식 기본값(90° → 가중치 1)이다. VRoid 의 Bone 형식(90° → 8~16°)과 체감 민감도가 다를 수 있고,
  실제 앱에서 육안으로 확인하지 않았다.
- 헤어를 바꾼 뒤 흔들림을 다시 편집하면 이전 헤어에만 있던 가닥 조정은 지워진다. 같은 앞머리처럼 파츠가 같은 가닥은 id 가 같아 이어진다.
- REA 증거 번들(three-vrm-core 18MB 등)은 저장소에 넣지 않았다. 같은 명령을 같은 아티팩트 해시(증거 원장)에 다시 실행하면 재현된다.
- VRoid 도움말 센터 본문은 봇 검증 때문에 REA 로도 수집하지 못했다. 슬라이더 범위 같은 세부는 검색 요약에 기대고 있다.
- i18n 은 상태 안내만 키로 옮겼다. 폼 라벨·표정·흔들림 이름·도움말은 주변 조형 패널과 같이 한국어 원문이고, 내보내기 검증 사유는
  `studio-vrm-export-error` 의 고정 한글 어휘를 쓴다. 조형 패널 전체를 키 기반으로 옮기는 일은 별도 작업이다.
- 7.4.1 의 여덟 authority 중 이번 변경은 2(표정 바인딩)·4(헤어 흔들림 조율)·7(메타·썸네일·이용 조건) 을 넓혔다. VRM 0.x 내보내기,
  가슴·치마 흔들림 본과 팔·손 콜라이더, 내보내기 감축은 5절의 남은 일로 남는다. 따라서 "VRM Studio 대체 완료"라고 표현하지 않는다.
