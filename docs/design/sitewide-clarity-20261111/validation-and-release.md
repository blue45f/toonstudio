# 화면 명료성 개선 검증·배포 인계 — 2026-11-11

상태: **migration**. 최신 고정 번들의 실제 관측은 아래 `d400de4b…` 절이다. 그 뒤에 수정한
제품 소스는 아직 새 번들로 검증하지 않았으며, 단위 검사와 CSS 실험을 실제 구현 완료로
바꾸지 않는다. `4911a5b0…`, `e780510f…`, Phase3의 기록은 각 버전의 역사 증거로 보존한다.
로컬 구현·분야별 검증·전체 타입·원격 CI·main 반영·운영 배포를 각각 구분한다.

## 2026-11-12 d400 고정 번들의 시안·동선 재검증

`d400de4bdf3efea5ef6650d18136e10c37371a68 / b5c24948e4d0`는 9분 56초 빌드와 CSP·라이선스·번들·제품 투어 청크 검사를 통과했다. Story 잔여 **9/9**, Showcase 잔여 **9/9**에서 실제 입력·헤더 아래 Tab 초점, 공개 카드 Back 초점/정확한 스크롤·검색 조건, 저장 연속성과 시안 대조를 확인했다. 홍보 랜딩은 390/1440/320px 검색·분류·첫 재생의 첫 화면 노출·44px, 대표 호환/원본 재생·원본 다운로드·503 복구를 확인했고, 별도 flow-only **2/2**로 URL/Back·IME를 확인했다. 첫 실행의 QA summary 다중 선택 오류는 보존했다. 실제 시안 쌍을 직접 검토했고 기존 49편 완주 결과와 다른 성공 수로 합산하지 않는다.

게시 새 범위 **12/13**은 320px 빈 상태 생성 버튼이 첫 화면 밖에 있어 전체 성공으로 표시하지 않았다. 공통 데스크톱 브랜드 이름 1건과 홍보 선택/접기의 화살표 발견 가능성도 잔여로 기록했다. 세 가지를 최소 소스로 보완하고 지정 7파일 의미 검사 진단 0건·관련 회귀·lint·Secretlint를 확인했다. 기존 번들의 DOM/CSS trial은 새 제품 실제 검증과 구분하며 새 빌드에서 해당 세 조건만 다시 확인한다. 원본 실패·비교 PNG·조건은 분야별 `.qa` 원장에 남겼다.

이 절은 로컬 번들·지정 흐름 증거다. 전수 주소 882조건, 필수 전체 Web/API 타입 검사·푸시·원격 CI·main·운영 배포는 별도 단계이며 이 기록 시점 완료가 아니다.

## 2026-11-12 6d597 고정 번들 관측과 추가 보완

대상은 `6d597b8571cc444ee66635563958ad3e41170f06`, `buildId=21c89bdc5d3d`의 로컬 프로덕션 번들이다. 빌드 **8분 54초·exit 0**, CSP·라이선스 생성과 Studio 번들 구조·제품 투어 청크 검사를 통과했다. 기존 비차단 크기 관측 15건은 성능 성공으로 바꾸지 않는다. `origin/main`은 2026-11-12 06:02 KST 재조회에서 `933caa71…`였다.

| 실행 범위 | 실제 확인 결과 | 남은 차이·검증 제한 |
| --- | --- | --- |
| 쇼츠 터치 재생·원본 보존 | **49/49** 실제 첫 프레임·진행·완주. H.264 호환본 21개와 유지 원본 28개, 초기 MP4/src 0·동시 src 최대 1·미디어/한도 오류 0. 실제 원본 다운로드 2건의 URI·파일명·SHA 일치, 호환 URL의 명시적 503 뒤 초점·Enter 재시도·재생 회복 통과 | Chromium 터치 에뮬레이션이며 Android/Samsung Internet/Safari 실기기·운영 CDN 검증은 아니다. 최종 길이는 선택한 파일의 실제 probe와 비교했다. axe 확정 위반 0과 별개로 generic 그룹·대비·자막 수동 확인이 남았다. 랜딩의 검색/필터가 첫 화면 아래에 있는 문제를 후속 재설계 대상으로 기록 |
| Story 입력·복귀·저장 | **19/21** 흐름 통과. 세 폭의 유효 hash Back 복귀·기기 초안·로컬 저장 실패/재시도, 조작 버튼 44px·스크롤 뒤 경계와 중심을 확인. 지정 axe 확정 위반 0 | 두 모바일 보조 메뉴가 실제 Shift+Tab에서도 헤더에 가렸고, 320px 첫 제목 입력을 고정 조작 막대가 덮었다. 자연 인트로 종료 뒤 실제/시안 쌍을 다시 촬영했다. 일부 최초 PNG의 인트로는 시각 증거에서 제외 |
| Showcase 탐색·검색 | **7/12** 동작군 통과. 390px 목록 제목 y655.55~683.55, 320px y707.09~735.09로 하단 메뉴 위에 전체 노출. 빠른 Enter 검색 유지와 320px 정보 팝업의 경계·44px 클릭을 확인 | 모바일 Back 초점 2건, 조건 메뉴의 헤더 가림 2건, 접근성 이름 불일치 1건을 보존. PC 4군은 통과했으나 뒤에 묶인 모바일 IME/외부 URL 검사는 미실행이다. 가상 작품/브랜드 표지 예시이며 실제 게시물 아님 |
| 게시 정보 준비 | 새 범위 **8/8** 기능 확인. 320/390/1440px 활성 주 행동 ≥44px·중심 hit 정상·하단 탭 겹침 0, 검증 초점·단계 입력·checkbox 이름/클릭, 실제 빈 상태를 확인 | 공통 헤더의 이름 위반이 남아 전체 exit는 1. 1440px 캡처는 내부 스크롤이 남아 첫 진입 증거에서 제외. 빈 상태에서 비활성 Continue가 생성 링크를 덮는 문제는 추가 보완 대상 |
| 드로잉 보이는 이름 | ko/en의 390/1440px 지정 이름·기존 원고 불변 5개 확인. ko 지정 axe 위반 0 | en의 기존 Save 이름 1곳은 추가 보완 대상. 복귀 locale 정리 실패와 별도 실제 UI를 통한 ko 복귀 성공을 구분하고, 원고의 동일 필드 서명을 화면의 동일 pan/zoom으로 확대하지 않음 |

주요 원본은 followups `.qa/promo-shorts-repair/after-compatible-2026-11-11T20-37-47.610Z/validation.json`, `.qa/story-after-fidelity/{phase6-actual-attempt1,phase6-focused-probe-attempt1}`, `.qa/showcase-density-review/phase6-review-summary.json`, `.qa/wave4-purpose-review/phase6-6d597b85-publish-focused-v1`와 root `production-interactions`의 버전별 이름 probe다. 기능·지정 상태의 수치를 합산해 전 페이지 성공 수로 쓰지 않는다.

이후 소스에서 보완한 **모바일 조작 막대의 일반 흐름 배치, 헤더 아래 초점 여백, 공개 카드 Back 초점, 조건·공통 헤더·Save 이름, 프로젝트 확인 전 조작 막대**는 새 번들의 검증이 필요하다. CSS-TRIAL에서는 같은 두 폭의 native 초점 여유가 −41.625px에서 **12.375px**로 개선되고 320px 첫 제목의 실제 클릭을 확인했으나, 주입 CSS를 제품 actual로 쓰지 않는다.

후속 TypeScript 25파일의 지정 의미 검사에서 테스트의 DOM 타입 진단 2건을 확인해 실제 `HTMLElement` 가드로 수정했다. 동일 입력의 나머지 파일은 유지하고 수정된 3파일을 다시 검사해 지정 범위 진단 0건을 확인했다. 전체 Web/API 타입 검사는 별도이며 이 결과로 대체하지 않는다. 공개 카드·hash/검색 복귀 40개 회귀와 기존 계약 13개, 홍보 재배치 관련 25개, Story 31개, 게시 34개와 공통 이름의 지정 테스트 묶음을 각각 검증했다. 수치를 합산한 전역 테스트 성공 수로 쓰지 않는다.

홍보 랜딩은 [사용자에게 먼저 공유한 390/1440px 시안](https://chatgpt.com/space/page_1ceae82a16a081919d1aca249661d4e7)을 기준으로 검색·분류·비율을 앞으로 옮기는 구현을 진행한다. 이는 기존 영상 카드를 재사용한 정적 제안이며 실제 재생 증거와 구분한다. 882조건 전수 주소 관측·원격 push·PR·main 반영·원격 CI·운영 배포는 이 기록 시점 미실행이다.

## 2026-11-12 cf510 고정 번들 관측과 미빌드 후속 수정

실제 관측 기준은 `cf510d2c2becc289776e580de95339faa8e8920b`, `buildId=0060b8801dba`,
로컬 프로덕션 preview `http://127.0.0.1:5276`이다. `build-phase5.exit=0`, **13분 28초** 빌드,
CSP·제3자 라이선스 생성, Studio 번들 구조·제품 투어 청크 검사 통과를 확인했다.
번들 크기·요청 수의 비차단 관측 **15건**은 남아 있으며 CWV·실기기 성능 통과가 아니다.
빌드 근거는 root `.qa/clarity-20261111/{build-phase5.log,studio-bundle-phase5.log,remotion-chunks-phase5.log}`다.

아래 `root`는 `/workspace/toonstudio`, `followups`는 `/workspace/toonstudio-ux-followups`의
로컬 QA 원본을 뜻한다. 로컬 경로는 재현 근거이며 외부 다운로드 링크가 아니다.

| 실제 실행 범위 | cf510에서 확인한 결과 | 실패·조건·후속 |
| --- | --- | --- |
| 드로잉 시작·기기 안내 | **7/7**, 페이지 오류 0. ‘바로 그리기’→펜 선택·캔버스 초점→실제 획, 브러시 설정의 명시적 열기·닫기, 320/390px 기기 안내와 복구 요약·도크의 경계·키보드를 확인 | 실제 게스트·성공 API fixture 및 문서 주입 없음. 준비 알림은 측정 당시 `warmup=null`이므로 두 알림이 동시에 뜬 상태의 가림 해소까지 보증하지 않는다. 전체 저장·Undo/Redo·재열기 20개는 4911 결과를 재사용하며 이번 재실행 수에 더하지 않는다. 전체 접근성 검사는 별도 실패가 있다 |
| 가상 스튜디오 320px 전환 칩 | **4/4**. 2D 최초·스크롤 입력 후·3D 터치 전환·2D 복귀에서 버튼 **77.53125×44px**, 중심 클릭·화면/조상 경계 정상, `aria-pressed=false→true→false`, 가로 넘침 0 | Chromium 터치 뷰포트·SwiftShader·모션 감소. 현재 로비·리셉션 이름은 잘림 없음. 긴 이름·프라이빗 조합, 기존 자세·저장 전체 여정, Android 실기기·하드웨어 성능은 이번 범위 밖이다. 원본 프로필은 복사 보존하고 실제 PNG 2장을 직접 검토했다 |
| 홍보 쇼츠 49편 | **49/49 첫 프레임·재생 진행·native ended**, 미디어 오류·WebMediaPlayer 한도 오류 0. 카드 204개·쇼츠 49개를 유지하고 초기 MP4 요청·src는 0, 동시 연결 src 최대 1 | 실제 로컬 원본 영상·390px Chromium, 게스트 API 503 fixture. 명시적 미디어 503 주입 뒤 같은 원본의 키보드 재시도·초점·재생 회복 확인. 가입 팝업은 관측되지 않았다. 이 결과는 Android/Samsung Internet/Safari나 운영 CDN의 MIME·Range 성공 증거가 아니다. 아래 H.264 후속본도 이 실행에 포함되지 않는다 |
| StoryLab 3묶음·시안 대조 | **11개 통과·4개 실패**. 1440/390/320px의 8필드 키보드 입력·단계 왕복·native Back 현재 단계·reload, 실제 로컬 저장 실패 후 재시도는 확인 | 1440px 저장 버튼 중심을 부유 제어가 가렸고 3폭의 유효 hash Back 초점이 실패했다. 모바일 첫 입력도 공통 설명·메뉴 뒤로 밀렸다. 같은 예시·뷰포트 시안/실제 PNG 직접 검토에서 차이를 기록했다. 가상 세션·GET 503 조건, 기기 초안/로컬 보드이며 서버 ACK가 아니다. 전체 성공으로 판정하지 않는다 |
| 게시 정보 준비 | **14개 기능 검사 통과**, 390/1440px의 단계·입력·Back/Forward·실패/재시도·채널 변경 후 결과 폐기·피드, 실제 브라우저 JSON 다운로드 2개 확인 | 백엔드·사용자는 로컬 fixture다. JSON 준비는 게시·예약 실행이 아니다. 320px 주 행동은 하단 탭에 **31px** 겹쳐 중심 hit가 실패했고 390px도 일부 경계가 겹쳤다. 하네스 전체 exit는 **1**이며 접근성 실패도 남았다. 빈 상태 390 PNG는 브랜드 인트로가 덮인 시점이라 시각 검증 근거에서 제외했다 |
| Learn·Market | 선택 학습 경로의 클릭·키보드·마지막 수업·복귀, 동일 상품 503 재시도, 404 안내의 **3개 기능 검사 통과** | 정적 학습 콘텐츠·로컬 가상 세션/상품 응답, 모든 POST 차단. 원본 실행의 최종 assert가 차단된 analytics·계정 merge를 거래 요청과 함께 세어 exit 1이다. 원문을 보존하고 기능 성공 3개와 하네스 실패를 분리했다. 실제 주문·획득·결제 성공은 아니다 |
| Showcase 탐색·시안 대조 | PC의 목록·필터·검색·복귀와 일부 모바일 정보/모션 감소를 관측했으나 **모바일 완료 실패** | 390px populated 목록 제목 y899.55, 320px loading y933.09/populated y1049.09로 첫 화면 밖이다. 빠른 입력 후 Enter에서 검색어가 사라지는 경로와 320px 정보 팝업의 잘림/중심 hit 실패를 보존했다. 가상 작품 6/20개 및 별도 브랜드 표지 예시이며 실제 게시물이 아니다. 담당자의 후속 소스 수정·새 빌드 재검증이 진행 중이다 |

실제 원본은 다음과 같다. 분야별 수치는 중복 가능한 지정 범위이므로 합산해 ‘전 페이지 성공 수’로 쓰지 않는다.

- 드로잉: root `.qa/clarity-20261111/production-interactions/ui-welcome-notice-2026-11-11T20-00-46-733Z/results.json`
- 전환 칩: followups `.qa/space-stagechip-cf510/{results.json,README.md}`
- 쇼츠: followups `.qa/promo-shorts-repair/after-2026-11-11T19-52-47.974Z/report.json`
- Story: followups `.qa/story-after-fidelity/phase5-actual-attempt1/{results.json,manual-visual-review.json}`
- 게시: followups `.qa/wave4-purpose-review/phase5-cf510d2c-publish-qa-v3/{manual-visual-review.json,publish/results.json}`
- Learn·Market: followups `.qa/wave4-purpose-review/phase5-cf510d2c-purpose-qa-v1/{learn-market/results.json,learn-market-functional-interpretation.json}`
- Showcase: followups `.qa/showcase-density-review/after-cf510d2c2bec-2026-11-11T20-04-58.294Z/results.json`

### 실제 접근성·시안 충실도와 자동 검사 구분

핵심 화면의 axe WCAG 2 A/AA·2.1 A/AA 검사는 기능 성공과 분리했다. Story 1440px의 언어
버튼 label/name 불일치, 드로잉 390px의 보이는 도구 이름 불일치 3개 노드를 관측했다. 게시에서는
전역 언어 버튼 이름 불일치와 부모 label의 `aria-label` 수동 검토 항목을 구분했다. `aria-valid-attr-value`, 색 대비, 동영상 자막 등의
`incomplete`는 자동 통과도 확정 위반도 아니며 수동 확인이 남아 있다. 쇼츠의 지정 main
스캔 확정 위반 0도 전체 접근성·자막·초보자 동선 완료를 뜻하지 않는다.

사용자가 볼 수 있는 [제안 6장](https://chatgpt.com/space/page_1e4bdd165d908191b152ae11b81a568c)과
[원본·제안·버전별 구현 비교](https://chatgpt.com/space/page_6f98e6e9522081918d42d55476507ed2)는
기존 자료를 재사용한다. 사용자 지정 Gemini/Starlight SVG 5개는 접근·표시·origin/main
`933caa71…`와의 바이트 일치를 확인했으나 독립 생성 로그가 없어 생성 도구까지 확정하지 않는다.
Story·Showcase·Publish의 같은 뷰포트·상태 비교는 새 실제 캡처와 원본 시안을 구분하며,
위에서 발견한 가림·밀도·입력·초점 차이를 단순한 의도적 디자인 차이로 처리하지 않는다.

### cf510 이후 수정된 소스 — 새 통합 빌드·실제 재검증 대기

| 후속 소스 범위 | 확인한 로컬 근거 | 아직 완료하지 않은 것 |
| --- | --- | --- |
| 언어 버튼·그리기 도구 이름 | 언어/셸 **25테스트**, 드로잉 **68테스트**와 진입 계약 **20테스트** 통과. 보이는 언어·도구 이름을 접근성 이름에 포함하고 실제 동작은 유지 | 이 수정이 들어간 새 번들·실제 axe 재실행. cf510의 위반을 삭제하거나 최신 소스 해결 완료로 바꾸지 않음 |
| Story 밀도·hash 복귀 | **31테스트** 통과. 모바일의 추가 경로 안내와 유효한 visible hash 초점 소유를 보완 | 같은 예시의 320/390/1440px 실제 after·native Back 재검증. 공통 footer 후보의 3폭 `css-trial-attempt1`은 주입 CSS 실험이며 제품 actual after가 아님 |
| 게시 폼 라벨 | **33테스트** 통과. 중복 부모 label 이름을 정리하고 checkbox·label 클릭 계약 유지 | 새 번들의 라벨/키보드·320px sticky 가림·빈 상태 캡처·다운로드 재검증 |
| Showcase 모바일 | 첫 화면 밀도·빠른 Enter 검색·정보 팝업을 보완한 4파일을 안전 통합하고 **35테스트** 통과 | 새 실제 시안 대조와 검색/Back·한글 조합·320px 팝업 회귀 |
| H.264 호환 재생본 | 로컬 FFmpeg로 VP9 원본 21편에 별도 H.264/AAC 파일 **45,789,230bytes(약 43.67MiB)** 생성. 21개 전체 영상·오디오 디코딩/faststart/DTS 확인, 원본 49개 SHA 유지. 재생 소스 **43테스트** 통과 | 새 통합 번들의 재생본 선택·실제 완주·원본 회복 검증. Android/Safari 실기기, 운영 MIME·Range/206, 운영 배포 미검증. manifest는 `apps/web/public/brand/promo-shorts/compat/manifest.json` |

지정 범위의 단위 테스트·lint·Secretlint를 통합 타입·최종 빌드·원격 CI로 확대하지 않는다.
후속 TypeScript **20파일**의 전체 프로그램 내 의미 검사에서 진단 0건(69.828초), 아키텍처 검사를 통과했다. 전체 Web/API 타입 검사와 새 프로덕션 빌드는 별도다.
4911의 드로잉 **20개**, 소재 **9개**, 운영/AI **6동선 그룹**은 조건을 붙여 재사용한 역사
증거이며 cf510에서 다시 실행한 수가 아니다. 수정된 경로는 새 번들에서 다시 확인해야 한다.

이 기록 시점에는 최신 소스의 441주소×2폭 **882조건은 미실행**이다. 이전 e780의 유효
112관측을 합쳐 최신 전수 완료로 판정하지 않는다. 원격 push·PR·main 병합·해당 SHA의
`core`/`verify`·운영 배포·운영 검증도 아직 미실행이다. Cloudflare 인증 부재와 기존 원격
Mac 오프라인 상태는 별도 차단점으로 유지하며 비밀값 복사·거부된 접근 우회를 하지 않는다.
배포 가능한 상태가 되면 아래 단일 명령과 권한·SHA·중복 배포 방지 절차를 따른다.

## 2026-11-12 고정 번들의 후속 검증

이 절은 **4911 고정 번들의 역사적 실행 증거**다. 최신 cf510 관측과 미빌드 후속 소스 상태는 위 절을 따른다.

검증 기준은 `4911a5b0f3ddf179f0827d6c62ae3a8e51eab401`, `buildId=2931f94c0bb7`이며 로컬 `http://127.0.0.1:5276`의 해시 번들이다. `build-phase4.exit=0`, CSP·라이선스 생성, Studio 구조·제품 투어 청크 검사를 확인했다. 크기 예산의 기존 비차단 관측 15건과 VRM/WebGPU 경고를 실측 성능 통과로 바꾸지 않는다.

| 실행 범위 | 확인한 결과 | 조건·한계 |
| --- | --- | --- |
| 그리기→Undo→Redo→기기 보관→동일 문서 재열기 | 20/20, 페이지 오류 0. 같은 획 ID·값, 복구 안내, 320px native 터치·키보드·초점·폰트·도구/저장 캡션, 390px·가로·classic·desktop·canvas-only를 확인 | 실제 게스트·성공 API fixture/문서 주입 없음. ANGLE/SwiftShader·브라우저 마우스의 펜 도구이며 실제 스타일러스·서버 ACK·기기 간 복구·출력 픽셀 검증이 아님. 원본: `production-interactions/ui-drawing-2026-11-11T18-28-12-637Z/results.json` |
| 소재 권리 확인·적용 footer | 9/9. 390·320px 각각 4개, 1440px 1개 통과. desktop 버튼 하단 y972.75→824, clip 하단 840 안·center hit 정상. 실제 PNG 5장 확인 | 같은 원고 `ep01-193612v`, 체크 자동 승인·문서 주입 없음. 이번 원소 ID·종류·명칭·이미지·출처 요약 보존과 과거 전체 내용 검증을 구분. followups `.qa/resource-detail-footer/production-wave4/{results,review}.json` |
| 운영·AI·독립 관리자 | 로컬 실제 UI 6동선 그룹·390px 터치/가림 검사, 페이지 오류 0. 정책↔근거·Back·미저장 유지·revision 갱신·actor 전환·401/403·503 재시도·409·독립 preview 403 clear 확인 | 가상 세션/권한/정책 API fixture. 실제 운영 권한·정책 변경·provider 호출 없음. Web preview/apply 403의 기존 폼 유지와 독립 apply 403 브라우저 미검증은 별도. followups `.qa/operator-ui-review/summary-4911.json` |
| 창작 준비·쇼케이스·커뮤니티·샘플 제작 | 1440·390px 템플릿 검색/복구, 실제 StoryLab 초안 왕복·reload, Showcase 지연·가상 작품·빈 목록·503, 커뮤니티 링크와 샘플 일정 동선을 확인. 선별 PNG 35개 | StoryLab desktop 저장 버튼 40px·일부 Back 초점/스크롤은 잔여로 기록. Showcase 가상 작품은 실제 게시물 아님. 선택자/준비기한/중복 파일명 오류는 원본 보존·성공 집계 제외. BG3D 실제 적용 미검증. followups `.qa/creation-surfaces-review/phase4-before-4911-review-summary.json` |
| 가상 스튜디오 2D·3D | 자세와 그림 일치, 이동·착석/기립·모션 감소·실패 후 재선택 회복, 테마/조명 저장·재진입·native capture 해제·바닥 이동 확인 | 320 전환칩 잘림, HQ 공간 밀도, SwiftShader의 극저 프레임은 잔여. OS 취소·저장소 예외·recipe fill은 단위 증거. PNG 진단 3건은 성공 판정 제외. followups `.qa/sprite-motion-3d-after-4911/{results.json,README.md}` |

드로잉의 첫 실행은 객체 키 직렬화 순서 때문에 Redo hash 검사가 중단됐다. 읽기 전용 판독에서 ID·모든 필드·배열 값이 같음을 확인한 뒤 객체 키만 정규화해 같은 의미의 검사를 재실행했다. 이전 실패·판독 증거는 보존했다. 위 성공은 서버 저장·운영 배포 성공이 아니다.

공유한 [밀도 제안 6장](./density-proposals/README.md)과 [원본→제안→실제 비교](./comparison/index.html)는 reference·target·버전별 actual을 나눈다. 이후 StoryLab 3묶음, Showcase 목록 우선, Publish 3단계, 바로 그리기·안내 겹침, 공통 44px, 전환칩·홍보 미디어 후속은 새 소스의 렌더·동작·타입·빌드로 재검증해야 한다.

이 시점 원격 main 반영·원격 CI·운영 배포는 미실행이다. 전체 주소 882조건도 최신 성공이 아니며 `e780510f…` 중단 당시 유효한 desktop 112관측(정상 렌더 82·인증 게이트 22·차단 1·미준비 7)을 후속 버전의 완료 수로 합치지 않는다. Cloudflare 인증 연결이 없는 환경에서 API live/ready 응답만으로 최신 프런트 배포를 보고하지 않는다.

## 소스 기준과 현재 실행 단계

이 절의 ‘현재’와 단계 표는 **e780 당시의 역사 기록**이다. 이후 버전의 성공·실패는 위 고정 번들 절과 구분한다.

작업 브랜치는 `codex/sitewide-ux-clarity-20261111`이다. 아래 병합은 최신 main을 작업
브랜치에 반영한 로컬 병합이며, 이 변경을 원격 main에 배포하거나 병합했다는 뜻이 아니다.

| 소스 기준 | 커밋 |
| --- | --- |
| 1차 개선 체크포인트 | `9393369b8db21bbcbfad1bf511ce7dc346680924` |
| 2차 제품 소스·테스트 체크포인트 | `70c577828b35886ec6ae71a1b37949798eab4323` |
| 반영한 최신 main | `933caa71cf57f79d783a7703ccfc60bb93a98e00` |
| 병합 후 빌드 기준 HEAD | `e780510fd4928ee244f965f9ff697d71544e6d25` |

`dist/.vite/build-meta.json`에서 위 `gitSha`와 `buildId=35fcb401d50e`를 직접 확인했다.

| 단계 | 현재 상태 | 확인한 범위·남은 조건 |
| --- | --- | --- |
| 정적 경로 조사 | 확인 | 정본 AST 수집기 주소 441개. 별칭·리다이렉트와 동적 경로의 합성 표본을 포함하며 독립 페이지 수가 아니다. [경로 원장](./route-inventory.json) 참조 |
| 1차 전체 하네스 | 통과·1차 소스 범위 | 웹 타입 26,649/26,649 진단 0, API 타입 검사, 변경 모듈 Vitest 7파일 109테스트 통과. `.qa/clarity-20261111/harness-verify-final.log` 근거. 전체 테스트 스위트 완주가 아니며 하네스가 제외한 대형 2파일의 원격 샤드 검증은 별도다 |
| 2차 분야별 검증 | 지정 범위 통과 | 메뉴·Link 2파일 38테스트, 공유 계약 6파일 102테스트, 편집 여정 9파일 100테스트, 모바일 편집·소재 3파일 77테스트, 소재 4파일 45테스트의 개별 로그를 확인했다. 분야별 중복이 있어 합산 총계로 쓰지 않는다. 변경 파일 lint·Secretlint와 구조 검증도 전체 타입·원격 CI와 구분한다 |
| 2차 전체 타입·통합 하네스 | 중단·후속 검증 대기 | 26,658파일 대상 첫 샤드 완수 전 중단됐다. `phase2-interrupted-typecheck-report.json`은 `workers=[]`, `complete=false`로 전체 타입 통과 근거가 아니다. 1차 결과를 2차·main 병합 후 소스의 전체 통과로 승계하지 않는다. `focused-types-phase2.json`의 77파일·11진단도 테스트 옵션 수정 전 기록이므로 성공 근거에서 제외한다 |
| 최종 프로덕션 번들 | 통과 | 위 병합 HEAD에서 10분 21초, 종료 코드 0. `dist/index.html`, `dist/sw.js`, 일치하는 build-meta와 제3자 라이선스 고지 생성·CSP 검증을 확인했다. `.qa/clarity-20261111/build-final.log`, `build-final.exit` 근거. 아래 Three/VRM 경고와 해당 런타임 미검증은 별도로 남긴다 |
| Studio 번들 구조 검사 | 통과·성능 측정 아님 | `check:studio-bundle`: 기준선 27·개선 1·퇴행 0. 기존 정책상 size ratchet은 비활성이며 telemetry 예산 초과 15개가 남아 있다. 크기 예산 전부 충족·실측 성능 개선으로 보고하지 않는다 |
| 제품 투어 청크 검사 | 통과·구조 범위 | `check:product-tour-remotion-chunks` 통과. 제품 투어의 실제 재생·오디오·자막 게이트를 이 결과로 대신하지 않는다 |
| 빌드 번들 preview QA | 중단·후속 검증 대기 | 실행 당시 `http://127.0.0.1:5276`의 해시 에셋·`@vite` 미사용을 확인했다. 메뉴 22·카탈로그 23·모바일 소재 6·데스크톱 소재 2항목의 개별 통과 기록은 보존한다. 오프라인 변경의 정본 저장 확인은 실패했고 모바일 원고 가림·복구 전 시작 안내가 남아 있다. 아래 상세 조건과 후속 수정 재검증을 분리한다 |
| 441개 주소 전수 브라우저 관측 | 중단·후속 검증 대기 | 빌드 번들의 441주소 × 데스크톱·모바일 882조건 실행은 완료되지 않았다. 중간 전달 98/882는 최종 집계가 아니며, 중단 직전 유효한 원본 관측 수는 별도 확인 중이다. 정적 원장·갤러리 441행과 구분하며 정상·접근 제한·장애·기능 저하·미준비 상태를 각각 집계한다 |
| 최종 소스 원격 push | 대기 | 로컬 체크포인트·main 반영과 원격 push를 구분한다 |
| 최종 소스 PR·원격 main 병합 | 대기 | 최신 main을 작업 브랜치에 병합한 사실로 대신하지 않는다 |
| 릴리스 SHA의 원격 `core`·`verify` | 대기 | 해당 40자리 SHA에서 실제 성공을 확인해야 한다. 로컬 하네스·분야별 검증은 대체 증거가 아니다 |
| 운영 배포·배포 후 스모크 | 미실행 | 배포 인증을 제공받아 운영 배포를 실행한 기록, Worker 버전·배포 ID·배포 원장은 아직 없다 |

2차 분야별 테스트 근거는 로컬 `.qa/clarity-20261111/`의 `menu-back-fix-tests.log`,
`shared-tokens-phase2.log`, `editor-flow-tests.log`, `editor-mobile-assets-tests.log`,
`resource-tests.log`다. `architecture-phase2-final.log`는 구조·번들 진입 경계의 지정 범위
검증이며 최종 프로덕션 번들 검사 결과가 아니다. 1차 하네스·2차 분야별 실행·커밋 훅을
최종 전체 검증 한 번으로 합쳐 보고하지 않는다.

### 실행 중단과 후속 작업트리

15:35 UTC에 preview·전수 관측·타입 검사·새 체크아웃 등 실행 중인 작업이 `SIGKILL` 9로
강제 종료된 것을 확인했다. 관측한 `oom_kill` 값은 0이었고 원인은 확정되지 않았다.
종료를 제품의 기능 실패나 전체 타입 성공으로 분류하지 않는다. 타입 보고서의 진단 목록이
비어 있어도 `complete=false`인 실행은 미완료다.

후속 작업트리 `/workspace/toonstudio-ux-followups`의 체크아웃을 복구하고 offline frozen
의존성 설치를 마쳤으며 세 소유자가 후속 UX를 수정 중이다. 기존
`/workspace/toonstudio`의 제품 소스는 변경하지 않았다. 의존성 설치·체크아웃 복구를
후속 빌드·전체 타입·브라우저 검증·원격 배포 완료로 보고하지 않는다.

### 빌드 경고와 남은 런타임 확인

성공한 빌드에 `[IMPORT_IS_UNDEFINED]` 경고가 남았다. `@pixiv/three-vrm@3.5.5`의
`lib/nodes/index.module.js:106`이 참조하는 `THREE_WEBGPU.tslFn`은 사용 중인
`three@0.186.1/build/three.webgpu.js`에 대응 export가 없어 undefined가 된다는 경고다.
해당 VRM/WebGPU의 레거시 TSL 호환 경로는 실제 런타임을 아직 확인하지 않았다.
일반 화면·소프트웨어 ANGLE 2D 편집·GPU 비활성 전수 관측으로 그 경로의 동작을 보증하지 않는다.
빌드 성공·청크 검사 통과와 이 미검증 상태를 함께 기록한다.

## 빌드 번들 preview의 실제 동선

`production-interactions/summary.json`과 하위 메뉴·카탈로그 보고서, 아래 소재 JSON을 직접 읽었다.
메뉴·카탈로그 실행은 `gitSha=e780510fd4928ee244f965f9ff697d71544e6d25`,
`buildId=35fcb401d50e`, 해시 에셋과 `@vite` 미사용을 확인했다. 소재 실행도 같은 HTML의
SHA-256 `94027a32741fe436d968139dfa57b3762fb603df10d38d51ffbda41d794ee993`를 기록했다.
이는 로컬 프로덕션 preview이며 원격 운영 배포 기록이 아니다.

| 여정 | 확인한 결과 | 조건·남은 한계 |
| --- | --- | --- |
| 메뉴·서재 키보드 동선 | 22/22 통과, hot update 0 | 게스트·선택 API 503 fixture, GPU 비활성. `production-interactions/mobile-navigation/report.json`. 기존 스크립트는 pageerror를 별도로 수집하지 않았으므로 페이지 오류 0을 주장하지 않는다 |
| 실제 카탈로그·공식 감상 안내 | 23/23 통과. `nw-15640`과 `/api/go` 요청 의도, Back 검색어, 회차 미확인 안내, loading·empty·error·retry, 1440·390·320px 조건을 확인 | `production-interactions/catalog-core-flow/results.json`. 실제 공개 데이터이며 상태별 JSON 지연·빈 응답·503만 명시적으로 주입했다. populated 화면은 pageerror 0을 확인했으나 상태 fixture 화면은 별도 수집하지 않았다. 외부 리다이렉트·회차 콘텐츠·로그인 성공은 이 결과에 포함되지 않는다 |
| 모바일 소재 미리보기·적용·Undo·재열기 | 6/6 통과, 오류 목록 비어 있음. 같은 원고의 대상 소재 수가 `1→1(Enter)→1(Space)→2(명시적 탭)→1(Undo)→1(reload)`이며 정규화한 페이지 내용도 기준선과 일치 | `dot-review-after/production-resource/results.json`, `consistency.json`. 실제 UI 생성 원고·게스트·정본 OPFS/SQLite 판독, API fixture·원고 주입 없음. 390px 터치, 소프트웨어 ANGLE/SwiftShader, QA에서 service worker 차단. 기존 비이미지 draw 요소도 변경 없이 비교에 포함했다. 모바일 편집·선택기·상세 PNG 3개 확보 |
| 데스크톱의 같은 원고·미리보기 | 2/2 통과, 기존 대상 소재 1개 유지, 오류 목록 비어 있음 | `dot-review-after/production-resource-desktop/results.json`. 모바일 종료 후 같은 프로필의 별도 실행, 1440px·실제 로컬 백엔드 연결 불가·API fixture 없음. 선택기 PNG는 확보했으나 편집기 PNG는 캡처 시간 초과로 없어 시각 증거 전체 완료로 보고하지 않는다 |
| 선택 3D 진입 | 불완전 관측 | `production-interactions/summary.json`의 `optional3d`. 소프트웨어 ANGLE/SwiftShader에서 route state ready·pageerror 목록 비어 있음만 확인했고 전문 작업공간·스크린샷은 확보하지 못했다. 기능 통과나 VRM/WebGPU 호환성 증거가 아니다 |

### 실제 미완료 핵심 UX

다음 문제는 위 지정 동선 통과와 별개이며, 후속 소스 수정·새 번들에서 재검증해야 한다.

| 문제 | 실제 관측과 증거 | 완료로 인정하기 위한 조건 |
| --- | --- | --- |
| 기존 소재가 있는 원고의 오프라인 텍스트 저장 | `dot-review-after/production-offline-mobile-2026-11-11T15-13-06-610Z/evidence.json`은 `ok=false`, 실패 단계 `offline-edit`다. 원본 텍스트·소재의 기존 저장과 오프라인 실제 텍스트 입력까지 확인했지만, 변경하지 않은 에셋 참조 요소에 대한 거절 안내가 나타나 텍스트 제안 전체가 저장되지 않았다. 같은 문서의 정본 marker를 45초 안에 확인하지 못했다. UI의 “이 기기에 저장됨” 문구를 성공 증거로 사용하지 않는다 | 기존 에셋 참조의 검증·정본 권한을 유지하면서 새 텍스트가 같은 문서의 내구 저장소에 남아야 한다. 원래 텍스트·소재·요소 ID 보존, 오프라인 저장, 재연결 후 보존, reload 후 보존을 실제 UI와 정본 판독으로 다시 확인한다. 현재 실행은 재연결·reload 검증에 도달하지 못했고 클라우드 동기화도 미검증이다 |
| 모바일 원고가 도구·연결 안내에 가려짐 | 같은 보고서의 390·320px fit 관측과 `editor-before-offline-fit-390.png`, `editor-before-offline-fit-320.png`, `failure-offline-edit.png`. 폭 맞춤은 실제 surface 폭을 사용하지만 원고가 y=0에서 상단 absolute chrome 아래 시작하고, 연결 안내도 캔버스를 가린다. 가로 넘침 0·하단 버튼 44px만으로 원고 가시성을 통과 처리하지 않는다 | 실제 도구·상태 안내가 차지하는 영역을 고려한 원고 가시 영역과 조작 공간을 390·320px에서 확인한다. 저장 문서의 크기·좌표·출력 픽셀은 바꾸지 않고 실제 상·하단 내용 접근과 편집을 재검증한다 |
| 저장 원고 복구 전 빈 시작 안내 노출 | `production-interactions/coach-fit-source-analysis.json`에서 로컬 autosave 복구 대기와 시작 안내의 표시 조건이 연결되지 않아 빈 bootstrap 시점에 “바로 그리기”가 먼저 노출되는 경로를 확인했다. 해당 버튼이 원치 않는 획을 만든다는 인과는 확인되지 않았다 | 복구 중에는 빈 원고 시작 안내를 확정하지 않고, 복구 후 실제 빈 원고와 저장 원고를 구분해야 한다. 기존 원고 재열기·신규 빈 원고·명시적 도움말을 각각 재검증한다 |

위 분석에 대한 후속 수정은 별도 작업트리에서 진행 중이다. 이 문서의 `e780510fd4…` 빌드·
소재 성공 결과로 수정 완료를 선언하지 않는다. 전수 관측은 중단됐으며 전 페이지 통과가 아니다.

### 기존 운영 게이트웨이를 통한 공식 공개 회차 접근

`official-reading-observation/results.json`을 직접 읽었다. 임시 Chromium 컨텍스트 한 번에서
로그인·fixture·사용자 헤더·프록시 없이 기존 운영 `/api/go`의 `302`를 따라 공식 목록
`200`에 도달했고, 목록에 실제 노출된 “첫 화 보기”를 눌러
`https://comic.naver.com/webtoon/detail?titleId=15640&no=1&week=finish`의 `200`을 확인했다.
세 접근 항목은 통과했고 로그인 요구·403·429·captcha는 관측되지 않았다.

공식 viewer의 이미지 8개 중 3개가 로드된 메타데이터와 이전화 버튼 비활성·다음화 버튼 활성
상태를 확인했다. 이미지·화면 사본은 만들지 않았고 인접 회차는 열지 않았다. 공개 첫 화의
접근·부분 이미지 로드와 기존 버튼 상태의 증거이며, 회차 전체 로드·인접 회차 이동·플랫폼 전체
호환성이나 최신 프런트엔드 운영 배포 성공을 뜻하지 않는다.

## 개발 서버 동선과 기존 운영 게이트웨이 증거

아래 JSON을 직접 읽어 상태와 실행 조건을 대조했다. 개발 서버 기록과 기존 운영 게이트웨이의
일반 GET 관측을 구분하며, 개발 서버에서도 API fixture를 사용한 메뉴·카탈로그와 실제 게스트
저장소를 사용한 제작·소재 여정을 구분한다.

| 여정 | 확인한 결과 | 조건·보증하지 않는 범위 |
| --- | --- | --- |
| 모바일 메뉴·서재 | 수정 후 22/22 통과. 서재 사용법·쿼리 현재 위치, native Enter/Space, 닫힌 링크 제외, Tab 48회·Shift+Tab, 포커스 진입·Escape 복귀, 스크롤 잠금·배경 inert·해제, 링크 이동·Back 복원 | 390px, 게스트·다른 API 503 fixture, GPU 비활성. Vite hot update 0. `dot-review-after/mobile-navigation/report.json` |
| 실제 카탈로그 탐색·상세·공식 감상 안내 | 최종 게이트웨이 수정 후 23/23 통과. 실제 `nw-15640` 검색·상세, `/api/go` 모델 href, Enter로 열린 게이트웨이 팝업 요청, Back 검색어, 회차를 지어내지 않는 직접 리더 안내, Escape, loading·empty·error·retry, 1440·390·320px 넘침 확인 | 생성된 실제 공개 카탈로그, 게스트·선택 API 503 fixture. 로컬 팝업의 게이트웨이 요청 의도까지 확인했으며 외부 리다이렉트·회차 콘텐츠를 로컬에서 검증한 것은 아니다. `catalog-core-flow/results.json`; 기존 직접 URL 23항목은 `pre-gateway-review-results.json`에 보관 |
| 빈 작업실·최근 작업 | 빈 상태의 새 작업, 실제 작업이 있을 때 최근 작업 열기, 예제 구분, 다른 시작 방식의 native Enter/Space, 1440·390px 및 Starlight·light·contrast 화면 확인. `ok=true`, 페이지 오류 0 | 실제 게스트·로컬 개발 서버, API fixture·사용자 작업 주입 없음. 주요 행동 44px·가로 넘침 0의 관측이며 전 상태·전 테마 전체 접근성 검사를 뜻하지 않는다. `dot-review-after/creator-library-evidence.json` |
| 소재 검색·미리보기·원고 적용·재열기 | 10/10 통과. UI로 실제 문서 생성, 빈 검색 복구, Enter/Space 미리보기의 삽입 방지, 결과로 초점 복귀, 화면 전환 시 검색·선택·필터·밀도 보존, 명시적 적용 1개와 reload 후 유지 | 실제 내장 카탈로그·게스트·로컬 원고 저장소, API fixture·문서 상태 주입 없음. 소프트웨어 ANGLE/SwiftShader 사용. 실제 하드웨어 GPU·3D 모델링·서버 저장·배포·출력 파일은 이 결과로 보증하지 않는다. `dot-review-after/resource-core-results.json` |
| 모바일 소재 진입 | 3/3 통과. 이름 있는 작업 메뉴 진입, 실제 결과 우선 배치, 390→320px 상세·복귀 | 위 여정의 실제 로컬 문서, 터치 모드·실제 게스트, API fixture 없음. 모바일 전체 편집·내보내기 완주와 구분한다. `dot-review-after/resource-mobile-entry-results.json` |
| 기존 운영 공식 감상 게이트웨이 | 일반 비인증 GET의 상태 `302`, 공개 Location `https://comic.naver.com/webtoon/list?titleId=15640` 확인 | 승인된 `www.toonstudio.cloud`의 기존 `/api/go/naver-webtoon` 관측만 수행. 리다이렉트 추적·추가 인증·사용자 헤더·원점 직접 접근 없음. 최신 프런트 배포·외부 회차 콘텐츠의 증거가 아니다. `production-official-gateway-observation.json` |
| 로그인·실제 서버 원장·3D·출력 | 별도 미검증 | 게스트 로컬 편집·저장·재열기 성공을 로그인 후 서버 동기화·협업·실제 GPU 3D·검수·내보내기 성공으로 확장하지 않는다 |

위 파일 경로는 모두 로컬 `.qa/clarity-20261111/` 기준이다. JSON 조건과 해당 PNG가 근거이며,
서로 겹치는 관측을 “전 페이지 통과 수”로 합산하지 않는다. 후속 수정의 번들 preview와 공유할
스크린샷 패키지는 해당 소스의 산출물로 별도 연결한다.

### 이전 실패와 수정의 추적

초기 Vite 모듈 로딩과 동시 HMR 중 주요 경로 15조건·전수 실행 6조건을 기록한 뒤 중단했다.
닫힌 브라우저가 SIGTERM 이후 기록한 실패는 제외했고, 중단 전 수치는
`initial-partial-status.json`에 동결했다. 잘못된 헤더 선택자·닫힌 서재 안내 미활성화·native
details의 잔여 레이아웃 좌표는 `automation-corrections.json`에 제외 근거를 남겼다.

메뉴의 수정 전 22항목은 Back 스크롤·포커스 2항목이 실패했다. capture 닫기가 링크를 먼저
제거해 `defaultPrevented=false`인 native 문서 이동을 일으켰다. 수정 전
`mobile-navigation-confirmed/report.json`, `menu-click-diagnostic.json`은 보존했다.
닫기를 실제 Router `location.key` 변경 뒤로 옮긴 뒤 같은 22항목이 모두 통과했고,
Back의 220px 위치·연결된 버튼 포커스·동일 문서 ID·`defaultPrevented=true`를 확인했다.
수정 후 증거는 `dot-review-after/mobile-navigation/report.json`과
`dot-review-after/menu-click-diagnostic.json`이다. 저장·스크롤 기억 범위는 바꾸지 않았다.

1차 리더 부가 도구 12항목과 제목 크기 6항목은 당시 소스의 증거다. 당시 리더의 다음 회차
링크 보존 결과를 후속 공식 감상·회차 계약 변경의 최신 검증으로 사용하지 않는다. 현재 카탈로그
여정은 위의 게이트웨이 수정 후 보고서를 사용한다.

## 배포할 때 실행할 명령

실행 위치는 검토된 저장소 루트다. 현행 정적 웹 진입점은 다음 하나이며, 웹 빌드·R2 동기화와
기존 Cloudflare Worker의 운영 코드를 변경한다.

```bash
pnpm run deploy:web
```

현재 세션에서 이 명령을 실행한 것은 아니다. [배포 가이드](../../../DEPLOY.md#2-정적-웹과-core-api-배포)와
[정본 5단계 안내](../../operations/ai-deployment-quickstart.md)에 따라 다음을 먼저 준비한다.

1. clean `main`의 소문자 40자리 SHA와 배포 시점 `origin/main` 끝이 일치하고, 그 SHA의 `core`·`verify`가 성공해야 한다. 유효한 정적 웹 상시 승인은 매 릴리스 승인 변수를 대체하며 나머지 조건은 유지한다. 현재 작업 브랜치의 로컬 병합 SHA를 운영 릴리스 완료로 간주하지 않는다.
2. `deploy:verify`, 정적 웹 목적 preflight, 빌드·번들 검사와 dry-run을 통과하고, `dist/.vite/build-meta.json`의 `gitSha`가 릴리스 SHA와 같은지 확인한다. 정적 웹 preflight는 `pnpm run deploy:preflight --operation static-deploy --unit static-worker`다. pnpm 인자 사이에 별도 `--`를 넣지 않는다. 기존 실행은 변경된 작업트리·세션 인증 부재로 `blocked`였으며, `offline-contract-only`도 원격 권한·배포 완료를 뜻하지 않는다.
3. 기존 승인된 secret store에서 `CLOUDFLARE_API_TOKEN`과 `CLOUDFLARE_ACCOUNT_ID`만 필요한 배포 세션에 제공한다. 기존 `toonspectrum-web`의 코드·Static Assets 배포와 `toonspectrum-public-assets`의 객체 목록 조회·업로드 권한이 필요하다. 현재 R2 REST 동기화에는 API 토큰이 필요하며 OAuth 로그인만으로 전체 배포 가능성을 주장하지 않는다. 원문 비밀값·로컬 env·Keychain을 복사하거나 요청하지 않는다.
4. 직전 정상인 컷오버 이후 Worker 버전을 기록하고 `.git/toonstudio-deploy-ledger/cloudflare-static/<sha>.json`의 중복 여부를 확인한다. 같은 SHA를 자동 재배포하지 않는다.
5. 배포 후 실제 Worker 버전·SHA·배포 원장, 원점 readiness, 에지 출처 인증, 주요 화면·로그인, 제품 투어 실재생과 Studio의 `crossOriginIsolated`를 확인한다. 실패하면 기록한 정상 Worker 버전으로 복구하고 같은 스모크를 반복한다. 배포 ID·롤백 대상·실제 스모크 결과를 완료 원장에 추가한다.

이 웹 작업에 onpod 이미지·DB·DNS·기존 runtime secret 변경은 포함하지 않는다. 접근 권한이
거절된 서비스를 다른 도구로 우회하지 않으며, 배포·사후 검증을 실행하기 전에는 미실행 상태로 남긴다.
