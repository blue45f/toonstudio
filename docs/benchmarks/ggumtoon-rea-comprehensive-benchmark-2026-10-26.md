# 꿈툰 (`https://www.ggumtoon.com/`) REA 전 기능 역공학 분석 및 ToonStudio 통합 (2026-10-26)

- 문서 상태: `current`
- 작성일: `2026-10-26`
- 분석 대상: `https://www.ggumtoon.com/` (꿈툰 – AI 웹툰·웹소설 창작 스튜디오 `/studio`, 말풍선·식자 에디터 `BubbleEditor`, 연재·뷰어 `/work/[id]/view`, 이중 지갑·출석·기다무·바이럴 공유, 창작자 수익 정산 `/mypage/settlement`, 어드민 16개 모듈 `/admin/*`)

## 1. REA 증거 번들 (Evidence IDs & Shipped Artifacts)

REA(`reverse-engineer-anything`) 런타임 브라우저 시나리오 캡처(`capture_browser_scenario`), 스크립트 추출(`export_web_scripts`) 및 AST 정적 분석(`analyze_javascript_application`, `inspect_analysis_view`)을 통해 총 36개 배포 산출물(JS 청크 35개 + CSS 1개, 총 `4,650,910 bytes`)을 확보했다.

### 1.1 주요 REA Evidence IDs

- `ev_d4902d82e3fad7d5ad769dbc3cd80eb921300e9c2a2f80d89e351dd808294746`: `https://www.ggumtoon.com/` 메인 홈 런타임 캡처 (600건 네트워크 이벤트)
- `ev_53d2538c974e07f9c281fd337ce24c4f5bcaaf5e17df652c11f094dccce8d2dc`: 메인 홈 프론트엔드 스크립트 번들 추출 (`export_web_scripts`)
- `ev_cd71a6c586ddb03910bb5c0c831ec1dc0182b0c7f428c795466bcde6360e2760` · `ev_80ed884db6b9f75d8c262eb97272adf13f69ddd639f100b546b4e99067b00f37`: `https://www.ggumtoon.com/studio` 런타임 캡처 및 스크립트 추출
- `ev_dabce1e5c23b1cfa7603da1671af5a647e472114ce3f3e51559c1b9dd90c11d5` · `ev_4207146c44ad0d1d118bf5b4e612c19e0a38b078be3755bd9255d7c3a1bf68e7`: `https://www.ggumtoon.com/login` 런타임 캡처 및 스크립트 추출
- `ev_9a37bf16096f756e6211244456b6d3a4820cc1badafa0d09f0078871b09c6005`: `/studio` 핵심 청크(`0-du3dytc8ifq.js` 318,884B, `08gfdlvcw7-x9.js` mammoth DOCX 파서 568,115B, `087envq-b9~k8.js` Fabric.js 308,212B) 직접 추출 캡처
- `ev_d731ba9f82519e34e2ce3ba013d79c4c821cd554c3acdce26940a69f0080ef5f` · `ev_e049b3f0dd6d1932da3b01d7cc5d1d99cbeed9715bf5578dc44b97a5bac289af`: `/webtoon`, `/novel`, `/challenge`, `/event`, `/search`, `/mypage`, `/admin` 라우트 청크 캡처
- `ev_d14c49011cd3aeb34ba87271af372a0e88b2e9cbf149bbcb41af13d529cf2fd1`: 작품 상세 `/work/bda0a3d2-82f7-4e67-a1c5-ae5e6d4334d8` (`0rdx-ygp7ub4e.js` 47,201B) 런타임 캡처
- `ev_fd49cc795982ce5d3522cc24b50f68301dc873e2075dfd3bcc07e699f74ef016` · `ev_ca91fc8d7b2ae80ba17877612471dac2ab7eb22c6f5b827a928e286218d4b687`: 뷰어 `/work/bda0a3d2-82f7-4e67-a1c5-ae5e6d4334d8/view` (`0gfmlm~a9-5g..js` 66,672B, `17hmzbn.gv9qb.js` 2,719B, `03~yq9q893hmn.js` 112,594B) 캡처
- `ev_c6883850dce1ea4515e4c0faa4f90c684eca43568c1799e89e647667074b1658` · `ev_c554ecb2fa179f87a16d9f106a9a85815129de0d7ea3066393edf0770df7b6c9`: 수익 정산 `/mypage/settlement` (`0zs~t~wjid82~.js` 10,469B) 캡처
- `ev_860a7f0914bf5c336c5d568cb5dd160a3c5abb314971463fcbe1a9e3016c23b7` (뷰: `ev_4d11bd80daf97feea4eef73a7f35b6dd6b71bcf7c8837e1c253408f62fa2ed13`, `ev_8355316a682ccf43d15a90bda972a74765bd66df9e2acb48c477a300244cc0d9`, `ev_d25aacd65c94e874c39b2390ff1f5fbbd757e18f39bb13b13e78961cffa94a95`): `analyze_javascript_application` 배치 1 (30개 파일, 2,580,622B, 476,876 AST 노드, 1,832건 발견, 761개 모듈, 번들 SHA-256 `914655cf81cf2f58489652722a5b45e12fcce80f177717a460ed024fce4facee`)
- `ev_73ddc7d87f507f8344296969015715881838390eafc47b4776c4a9876eff328cb9` · `ev_3a1553fc7a7caf581b7ba426caf668687a7f236d4d6aafaf7966dc7742db8bd2`: `analyze_javascript_application` 배치 2 (뷰어 3개 청크, 57,148 AST 노드, 374건 발견, 번들 SHA-256 `4a77ab4d54af594bbaecfbec057b49b7dec287ea676e650982cdbe4b7ea30d54`)
- `ev_2a5bf028d1cead7df9e7db289fa51ff51933720d9cc6cb30b42882f9d5912e2e` · `ev_316188bf14a965fa12c105f72e711f592ba5b64d8401bc812fc3c674f3b6a481`: `analyze_javascript_application` 배치 3 (`/mypage/settlement` 정산 청크 `0zs~t~wjid82~.js`, 2,922 AST 노드, 68건 발견, 번들 SHA-256 `eb19b04fb5d491c4823db530f7836e3b982f84acbb9a60bdba940b63e0c2ca89`)

### 1.2 핵심 배포 청크 SHA-256 요약

| 파일명 | 바이트 크기 | SHA-256 해시 | 역할 |
| --- | ---: | --- | --- |
| `0-du3dytc8ifq.js` | `318,884` | `07f4f1dd7622709d2c79d69b86c713158086ef89d3f3c8613d6c8eb156de7b74` | `/studio` AI 창작 스튜디오 & `BubbleEditor` |
| `0n5493b7spg.s.js` | `124,016` | `39b3ba969d66957198856171739a83473f2ff1188a90de621899a54965b334ca` | `OPENAI_SIZES`, `CREDIT_COSTS`, `WEB_COIN_PLANS`, Supabase 컨텍스트 |
| `0_qdehbuvn5r3.js` | `59,645` | `c8532a60b07419deefccdb5a4c0153d87bf67710a067164551d1a8d8d0c7e134` | `/mypage` 지갑·출석체크·정산 요약 |
| `0gfmlm~a9-5g..js` | `66,672` | `5d0876b8c4e4198ff05e7eb7e6aa795bc855c92b0c9d03c2a1b42a93d4d2a190` | `/work/[id]/view` 웹툰·웹소설 뷰어·번역·공유 리워드 |
| `0rdx-ygp7ub4e.js` | `47,201` | `c1be1809e34925bc87f5a30164a46bd8ca3b00b0f1b61d14998ffdd84b36f249` | `/work/[id]` 작품 상세·기다리면 무료 카운트다운 |
| `0zs~t~wjid82~.js` | `10,469` | `bd6b479e6ffbd0ba9c2ba2f3a3780cc329faef2a8272ba84664897da38e9db1b` | `/mypage/settlement` 수익 정산 신청·14개 은행 |
| `0w.h9fapc_f97.js` | `25,302` | `07e8b1235c0b5508bb92cbbe5c23787ab3cb1783c6371ca0d15eb8b423c31aa8` | `/subscribe` `Standard`/`Pro`/`Ultra` 월간 구독 |
| `0695ucpa4z0id.js` | `19,367` | `4c99142b1c2642573bf2bf0ff496003be8b98ac0aa6db26085d9fd6b7bb4ffbd` | `/admin` 어드민 대시보드 및 주간 꿈 소비율 |
| `0uhdfyo3fw~s4.js` | `8,387` | `fb644e5e683da1e1b6c3af06f2b360953c7b42127671f3fd63109d4d2c723c84` | `/admin/*` 어드민 16대 관리 모듈 네비게이션 |

## 2. 관측 사실(Observed Facts) · 추론(Inferences) · 미확인 영역(Unknowns)

### 2.1 관측 사실 (Observed directly from shipped bundles & live runtime)

1. **작가 등록 및 작품 위저드 (`0-du3dytc8ifq.js`)**:
   - 작가 이름은 `/^[가-힣a-zA-Z0-9]{2,12}$/` 정규식을 따르며 `/api/author/check-name`으로 중복 검사 후 등록하면 변경할 수 없다.
   - 작품 등록(`/api/work/create`) 시 10대 장르(`판타지`, `로맨스`, `액션`, `스릴러`, `일상`, `무협`, `이세계`, `공포`, `코미디`, `학원물`) 중 최대 2개를 선택하며, 연재 방식은 **자유 연재(작가 40% / 플랫폼 60%)**, **정기 연재(주 1회 요일 지정, 작가 60% / 플랫폼 40%)**, **주 2회 연재(주 2회 요일 지정, 작가 80% / 플랫폼 20%)** 3단계로 구성되고 변경 시 1개월간 재변경이 잠긴다(`serial_type_locked_until`).
   - 표지(`800×1120`, `5:7`)와 상세 배너(`800×400`, `3:1`) 노출 영역 크롭 수식(`reactEasyCrop` 회전·줌·패닝 행렬)이 내장되어 있다.
2. **AI 웹툰 스타일·캐릭터 시트·장면·인페인팅·여백 컷 (`0-du3dytc8ifq.js`, `0n5493b7spg.s.js`)**:
   - **스타일 생성(`/api/studio/generate-style`)**: 5대 빠른 시작 프리셋을 제공하며, 최초 3장 후보 생성 시 **3크레딧**, 재생성 시 **1크레딧**을 차감한다. 생성 직후 `/api/studio/detect-characters`를 호출해 등장인물 외모·얼굴 크롭 후보를 자동 추출한다.
   - **캐릭터 시트(`/api/character/create-sheet`, `/api/character/regenerate-sheet`)**: 캐릭터 이름·외모 프롬프트 기반으로 3장의 캐릭터 시트 후보를 생성한다(`character_sheet: 9`, 최소 진입 게이트 3크레딧).
   - **장면 생성(`/api/studio/generate-webtoon`)**: `normal`(Medium 퀄리티 3장, **3크레딧**)과 `highlight`(High 퀄리티 1장, **5크레딧**) 모드를 지원하며, `OPENAI_SIZES` 3종(`1024x1536` 세로형 `2:3`, `1024x1024` 정방형 `1:1`, `1536x1024` 와이드 `3:2`)을 선택한다. 컷툰(`view_mode === "cut"`) 작품은 `1024x1024`로 자동 고정되며, 이전 확정 장면 이미지를 다음 장면의 레퍼런스로 자동 체이닝(`eo ?? (!eo && ec && v ? v : undefined)`)한다.
   - **부분 수정 인페인팅(`/api/studio/inpaint`)**: 선택된 장면 이미지와 수정 지시문으로 3장의 수정 후보 이미지를 생성한다(**3크레딧**).
   - **여백 패널(`textPanel`)**: 장면 하단에 `80px ~ 2,000px` 높이로 드래그 조절 가능한 여백 컷을 추가하며, 단색 또는 각도 기반 삼각함수 선형 그라디언트(`x0 = ((1 - sin(rad))/2)*w`, `y0 = ((1 + cos(rad))/2)*h`) 배경과 말풍선을 합성한다.
3. **말풍선·식자 에디터 (`BubbleEditor`, `0-du3dytc8ifq.js` + `087envq-b9~k8.js`)**:
   - **66종 말풍선 템플릿**(`[57..66, 1..56]` 순서로 `/bubbles/bubble-${n}.png` 매핑)과 **3종 효과 템플릿**(`/effects/effect-1..3.png`), 번호 검색 필터를 제공한다.
   - **40종 한국어 웹툰 서체**(나눔 7종, 구글 한글 17종, 조선일보 10종, 국민대 80주년 4종, 머니그래피 2종)와 `localStorage["dreamtoon_fav_fonts"]` 즐겨찾기 상단 고정을 지원한다.
   - 삽입 이미지(`custom-image`)에 대한 **9종 도형 클립 프레임**(`none`, `circle`, `rect`, `roundRect`, `hexagon`, `pentagon`, `triangle`, `diamond`, `star`), `600px` 캔버스 기준 **6방향 정렬**(`left`, `center-h`, `right`, `top`, `center-v`, `bottom`), **60단계 링 버퍼 Undo/Redo**(`r.length > 60 && r.shift()`), `Ctrl+D` `+20px` 오프셋 복제, 배경 레이어(`scene-bg`) 삭제 방지 가드 및 방향별 말풍선 꼬리 SVG Path 생성기(`S(e,t,r,s)`)가 구현되어 있다.
4. **AI 웹소설 생성·원고 업로드·회차 유무료 규칙 (`0-du3dytc8ifq.js`, `08gfdlvcw7-x9.js`)**:
   - `/api/studio/generate-novel`로 줄거리 기반 웹소설 본문을 생성(**3크레딧**)하며, 직접 업로드 시 `.txt` 및 `.docx`(`mammoth.extractRawText`) 파일(`최대 10MB`, 권장 `5,000~20,000자`)을 지원한다.
   - 직접 업로드 웹툰 원고 이미지는 **세로 `1,120px` 이상**(`naturalHeight < 1120` 차단)이어야 하며, 정식 연재 웹툰은 **1~3화 자동 무료 · 4화부터 유료(1꿈 차감) 고정**, 웹소설은 **1화 무료 · 2화부터 유료**, 도전만화는 전 회차 무료 정책을 적용한다.
5. **플랫폼 경제·지갑·출석·기다무·바이럴 공유·뷰어·정산·어드민 (`0_qdehbuvn5r3.js`, `0gfmlm~a9-5g..js`, `0zs~t~wjid82~.js`, `0uhdfyo3fw~s4.js`)**:
   - **이중 지갑**: 독자 열람 코인 **꿈**(`10/30/50/100꿈`, 첫 충전 `hasNeverCharged` 시 **10% 보너스 지급**)과 창작자 **AI 크레딧**(`50/100/300/500개` 1년 유효 단건 충전 + `Standard 120`/`Pro 380`/`Ultra 900` 월간 구독, 말일 소멸·이월 불가)을 분리 운영한다.
   - **10일 사이클 출석체크**: 3·6·9일차에 각 `1꿈`, 10일차 개근 보너스로 추가 `1꿈`(10일 주기 총 `4꿈`)을 지급한다.
   - **기다리면 무료 & 열람 판정 트리(`ev()`)**: `챌린지 무료 → 1~3화 무료 → 무료 플래그 → 본인 작가 → 기열람 → 기다무 이용권 도착 → 유료 꿈 차감` 순으로 판정한다.
   - **3회 유료 열람 자동 좋아요(`ew()`) & 공유 리워드(`/api/share/create`)**: 한 작품의 유료 회차를 3개 이상 읽으면 자동으로 작품 좋아요 및 업데이트 알림을 활성화하며, 에피소드 공유 링크 클릭당 `1꿈`(이벤트당 **최대 15꿈**)을 지급한다.
   - **뷰어 & 실시간 번역**: 웹소설 뷰어 3종 테마(`dark #0a0a0f`, `light #f8f6f0`, `sepia #f4efe4`), 3단계 글자 크기(`14/17/20px`), 웹툰 텍스트 박스 한→영 번역(`/api/translate-episode`), 원작 웹소설↔웹툰 교차 배너(`adaptedWebtoon`/`novel`)를 제공한다.
   - **수익 정산(`/mypage/settlement`) & 16대 어드민 모듈**: **유료 충전 꿈 열람분만 정산 대상**(가입·출석 무료 꿈 제외)으로 하며, 연재 방식별 정산율(`40%/60%/80%`), 인앱 결제 수수료(`30%`), 개인 원천징수(`3.3%`, 익월 10일 지급, 연간 125만원 이상 세무신고 안내) 및 14개 정산 은행 계좌 검증을 수행한다.

### 2.2 추론(Inferences) 및 미확인 영역(Unknowns)

- **추론(Inferences)**: 클라이언트 번들의 `OPENAI_SIZES`(`1024x1536`, `1024x1024`, `1536x1024`)와 `quality: "medium" | "high"` 파라미터 구조로 볼 때 서버의 `/api/studio/generate-webtoon` 및 `/api/studio/inpaint`는 OpenAI `gpt-image-1` 계열 이미지 생성/편집 파이프라인을 호출하는 것으로 추론된다.
- **미확인 영역(Unknowns)**: 서버 측 `/api/studio/*` 내부 시스템 프롬프트 원문과 Supabase RLS/RPC 내부 SQL 본문은 서버 비공개 영역이므로, ToonStudio에서는 클라이언트 번들에서 확인된 모든 입출력 계약·검증식·기하/정산 수식을 결정론적 도메인 엔진과 워크벤치 UI로 내재화했다.

## 3. ToonStudio 구현 및 UI 연동 매핑

| 영역 | ToonStudio 도메인 엔진 | 연결된 Studio UI 컴포넌트 | 검증 테스트 |
| --- | --- | --- | --- |
| AI 창작 스튜디오 (스타일·캐릭터·장면·인페인팅·여백·웹소설·원고검증) | `apps/web/src/domains/creator/ai/ggumtoon-studio-suite.ts` | `StudioGgumtoonSuitePanel.tsx` (`StudioWebtoonMasterPipelineCard.tsx` 내장) | `apps/web/src/domains/creator/ai/__tests__/ggumtoon-suite.test.tsx` |
| 말풍선 66종 · 한국어 40서체 · 클립 프레임 9종 · 60단계 히스토리 (`BubbleEditor`) | `apps/web/src/domains/creator/lettering/ggumtoon-bubble-editor-engine.ts` | `StudioGgumtoonBubbleEditorPanel.tsx` (`StudioBubbleToolPopoverBody.tsx` 내장) | `apps/web/src/domains/creator/lettering/__tests__/ggumtoon-bubble-editor.test.tsx` |
| 플랫폼 경제 (이중 지갑·출석·기다무·공유 15꿈·뷰어·3.3% 정산·어드민 16모듈) | `apps/web/src/domains/creator/ai/ggumtoon-platform-economy.ts` | `StudioGgumtoonPlatformSubPanel.tsx` (`StudioGgumtoonSuitePanel.tsx` 내장) | `apps/web/src/domains/creator/ai/__tests__/ggumtoon-suite.test.tsx` |
