# 기존 시안과 현재 구현·검증 대조표 — 2026-11-11

상태: **migration** — **1~5절은 `53f184ad…`, 6~10절은 Phase2 기준의 역사 기록으로 보존**한다. 그 안의 “현재”, 행 번호, “남은 작업”은 당시 판정이다. **11~13절에 고정된 Phase3 실행 증거와 Phase4 잔여 범위**를 추가한다. 구현·모델·목표와 브라우저 검증·최종 빌드·원격 반영·운영 배포를 구분한다.

당시 상태 표기: **current** — 현재 소스와 보유 검증 증거를 읽기 전용으로 대조한 기록이다. 후속 수정·실제 사용자 여정·운영 배포를 완료했다는 문서가 아니다. 각 행의 남은 작업은 **target**이다.

## 기준과 판정 방법

- 기준 브랜치: `codex/sitewide-ux-clarity-20261111`, 기준 HEAD: `53f184adac261710813c44f41da936e13751d430`. 현재 작업 트리의 UI 명료성 변경을 함께 읽었다.
- 루트 담당의 원격 조회 기록: `2026-11-11 21:44 KST`의 `origin/main`도 `53f184ad…`였다. Mac의 `e7f3eb1c`는 참고 식별자이며 이 대조에서 fetch·merge·cherry-pick하지 않았다.
- 대조 자료: ToonStudio 독립 샘플과 명세 7~12장, Starlight A~P·M1~M4, UI/UX v2 Blueprint, clarity 원장·감사·갤러리.
- **구현 있음**은 실제 소스·마운트·콜백 연결을 뜻한다. **테스트 있음**은 테스트 소스를 확인했다는 뜻이며 이번 읽기 전용 대조에서 실행 통과를 확인했다는 뜻이 아니다.
- Blueprint의 “100% 반영” 문구와 정적 앵커 검사를 기능 완주·직관성·운영 검증의 증거로 사용하지 않는다. 새 시안은 생성하지 않았다.

## 1. 먼저 확인한 44px 수정과 테스트 버전

| 항목 | 현재 코드 사실 | 추가로 확인할 범위 |
| --- | --- | --- |
| `StudioProjectLibraryManagementContent.tsx` | 검색 결과 없음·보관함·휴지통 복귀와 각 목록 더보기 등 자체 행동 11곳에 `min-h-11`이 있다(`160~288행`). 이 44px 수정은 기준 소스에 이미 포함되어 있어 Mac 참고 커밋을 그대로 가져올 이유가 없다. | 반응형 CSS를 적용한 실제 버튼 경계값, 키보드 확장 후 포커스, 비활성·빈 목록 상태를 브라우저에서 확인한다. 클래스 존재만으로 전 화면 터치 크기를 보증하지 않는다. |
| `verify-ui-ux-v2-contracts.mjs` | 위 Content 파일을 85행에서 검사한다. 컴포넌트의 `min-h-6..10` 문자열·이전 주소·앵커와 문서 존재 등을 정적으로 검사한다. 모듈·출력의 버전 표기는 `v2.6`이다. | 실제 라우트 해석·데이터·작업 실행·렌더된 터치 크기를 이 스크립트가 검증하는 것은 아니다. |
| `verify-ui-ux-v2-contracts.test.mjs` | 현재 `it()`는 **3개**다: 실제 저장소 계약, 모바일 스피너 재유입, 일부 허브의 이전 주소/44px 미만 재유입. | 최신 고정 소스에서 실행 결과를 루트 통합 검증과 함께 기록한다. |
| `7.1.2` | 위 두 스크립트의 버전이 아니다. 현재 `package.json:480`의 `rollup-plugin-visualizer` 의존성 버전이다. | 서로 다른 도구의 버전·테스트 개수를 혼합해 보고하지 않는다. |

## 2. A~P · M1~M4 화면 계열 대조

아래 검증 열에서 “테스트 소스”로 쓴 항목은 이번 읽기 전용 대조에서 재실행하지 않았다. 앱의 최종 통합·브라우저 결과는 루트 담당의 고정 소스 검증 결과로 갱신한다.

| 화면 계열·시안 | 구현 확인 | 확인한 검증 범위 | 남은 실제 검증·차이 |
| --- | --- | --- | --- |
| 시작·작업 목록 **A / M1** | `StudioProjectLibraryManagementHeader.tsx`가 최근 작업·새 작업·가져오기를 제공하고 FastStartStrip을 마운트한다. `ManagementContent`는 실제 작업 뒤에 예제를 둔다. | LibraryPage·recovery-regressions·Header.clarity 테스트 소스에 이어하기 문맥, IME, 목록 확장 초점, 빈 상태, 저장 실패 재시도, 부가 도구 접힘이 있다. | 처음 방문과 재방문에서 시작→편집기→재열기 완주, 빈 검색·보관함·휴지통의 실제 44px와 초점을 확인한다. |
| 문서 편집·프로젝트 공정 **B · F / M2** | `StudioDocumentWindowHub.tsx:338`이 5단계 바의 `onSelectWorkspace`를 `onChangeWorkspace`에 연결한다. `StudioProjectShellPage.tsx:759`가 팀 브리지를 마운트한다. | Stage 바·프로젝트 셸·팀 브리지 테스트 소스가 있다. `StudioProjectTeamKanbanBridge.test.tsx:12`는 프로젝트별 링크와 44px 클래스를 검사한다. | 브리지 자체는 **5개 이동 카드**다. 실제 회차 상태가 갱신되는 칸반·인계 완주와 같다고 표현하지 않는다. 공정 이동 후 같은 문서·선택·저장 상태 유지 검증이 필요하다. |
| 3D·전문 도구·컴패니언 **C · O / M2** | BG3D가 쉘프를 조건부 마운트한다(`StudioBg3dProfessionalWorkspace.tsx:326`). `studio-workspace-route.ts:505~513`에 DCC 모드 파서가 있다. | BG3D Workspace 테스트와 DCC route lifecycle 테스트 소스를 확인했다. | 쉘프의 Split-Wipe는 로컬 버튼 상태만 바꾼다. “원고 컷에 바로 굽기”는 `/studio/comic` 이동 링크이며 캡처/적용 콜백이 아니다. `/studio/companion/canvas`는 허용 surface 4종과 불일치한다. GPU·컷 적용·복귀는 별도 검증이 필요하다. |
| 내보내기·검수 **D / M2** | 8타깃 `runStudioExportPreflight`는 `studio-shell/StudioExportPanel.tsx:221`에 연결돼 있다. 출력 요약·서명·배경 상태도 구현돼 있다. | 8타깃 사전 점검 테스트 소스는 권리·원본 보존·인쇄 등을 검사한다. | `StudioPublishPreflightPanel`은 별도 **3프로필** 모델이다. `StudioExportOutputSummary.tsx:42~45`의 “Rights BOM 출처 자동 점검” 문구는 너비·높이만으로 선택된다. 실제 검사 결과에 근거한 문구, 출력 파일·원본 보존 왕복 검증이 남아 있다. |
| 작품 탐색·상세·감상 **E · N / M3** | SearchPage는 검색 방식·입력·결과를 먼저 두고 안내를 접는다. Reader는 `TitleReaderImmersiveCreationBar`를 마운트하며 “창작·뷰어 체험”을 기본 접힘으로 제공한다. | 관련 검색·리더·상세 및 공통 헤더 테스트 소스가 있다. 초기 Vite 관측은 준비 지연으로 중단된 진단 결과다. | 실제 작품·유효 회차에서 검색→상세→공식 감상/읽기→이전·다음→목록 복귀를 검증한다. 오류·빈 회차 fixture만으로 감상 완료라고 하지 않는다. |
| 소재 마켓·요금·지갑 **G / M4** | 카드·상세에 적합성·가격·라이선스와 44px 빠른 실행 동선이 있다. `MarketResourceCard.tsx:194`, 상세 `:112`에 BOM 배지가 있다. | MarketResourceCard 테스트 소스는 메타데이터·상세 링크를 검사한다. | BOM 배지는 해당 렌더 구간에서 상시 표시된다. 실제 설치·원고 반입·출처 보존과 결제/주문 성공을 배지 존재로 대체하지 않는다. |
| 리서치·학습·기술 문서 **H · P / M4** | `OpenDataLabPage.tsx:177`의 목적·검색·초기화 콜백은 실제 필터 파라미터와 연결돼 있다. `EngineeringStoryUi.tsx:232/253`에 모바일 접이식·데스크톱 고정 목차가 있다. 발행 교차 브리지도 마운트된다. | 필터·문서 목차·발행 관련 테스트 소스와 공통 헤더 동작 검증이 있다. | 자료 검색→원문/허용된 반입→기존 작업 복귀, 학습 실습 이동과 문서 앵커를 실제 좁은 화면에서 확인한다. |
| 커뮤니티·쇼케이스 **I / M3·M4** | `ShowcasePage.tsx:42`가 소셜 바를 마운트한다. 소셜 바는 4개 목적지와 캐릭터 챗 링크를 제공한다. | `ShowcaseSocialHubBar.test.tsx`는 링크·터치 클래스, ShowcasePage 테스트 소스는 화면 동작을 검사한다. | 이동 바가 게시·팀 모집·대화 실행을 보증하지 않는다. 목록→상세→작성/취소/복귀와 인증·입력 보존을 확인한다. |
| 브러시·오디오·AI 등 보조 도구 **J / M2·M4** | `StudioAssetHubPage.tsx:150`이 5개 정본 도구 링크와 프로젝트 문맥을 가진 전문 도구 바를 마운트한다. | `StudioSpecialistSuiteBar.test.tsx:12`는 5개 링크의 프로젝트 문맥 보존을 검사한다. | 순수 9상태 생성 큐 모델의 실제 UI 소비자는 확인되지 않았다. 독립 샘플을 실행되는 큐로 간주하거나 검증 없이 새 기능을 통합하지 않는다. |
| 개인 공간·설정·복구 **K / M4** | MySpaceHub가 볼트/쉬어가기 바를 마운트한다(`:636`). 저장 복구 모델은 실제 상태바·상태 센터에서 소비된다. 작업 공간 3-way 병합도 런타임에 연결돼 있다. | VaultAndRestBar·save-recovery·workspace-three-way-merge 테스트 소스가 있다. | 샘플 명세의 충돌 3선택 UI는 확인되지 않았다. 현재 외부 변경 병합은 local-wins와 안내다. 기본 상태에 `SQLite/OPFS` 용어가 노출되는 경로도 남아 있다. |
| 관리자·독립 앱 **L · O / M4** | Admin 도메인 UI와 독립 admin-web에 Edge Gate 배지가 있고 의미 토큰·44px 스타일이 있다. desktop-sync 충돌 화면은 44px와 760px 이하 1열 비교를 정의한다. | 정적 게이트와 각 앱 테스트 소스가 있다. | 배지는 실제 접근 통제 동작의 증거가 아니다. 운영자 권한·거부·세션 만료와 독립 앱의 실행·충돌 해결은 전용 여정으로 확인한다. |
| 인증·온보딩·네이티브 오프라인 **M / M1** | `auth-session.tsx:20/39`에 3초 준비 기한이 있다. 모바일 HTML에 스켈레톤, mobile.css에 48px 버튼·모션 감소·강제 색상 처리가 있다. | auth-session 테스트 소스에 초기 응답 지연·오프라인·온라인 복귀·인증 반영이 있다. | 이 타이머가 모든 라우트 청크의 준비를 보증하지는 않는다. 실제 느린 연결·오프라인·재연결과 iOS/Android 설치 셸 검증을 별도로 기록한다. |
| 공통 셸·새 clarity 갤러리 **전 계열** | 창작 활용 안내는 본문 뒤, CTA는 닫힌 details 안에 있다. 공통 기본 페이지 헤더의 높이·아트 밀도를 줄였다. 갤러리의 18개 계열은 target이다. | 담당 범위 셸 4파일 71테스트, 독립 갤러리 6조건(320/390/1440 × Starlight/Paper)에서 검색·필터·넘침·axe 검증을 수행했다. | 갤러리는 실제 앱 화면 검증과 다르다. 실제 페이지의 네이티브 details Tab 순서·노출, 공통 헤더를 쓰지 않는 화면과 명시적 hero는 별도로 확인한다. |

## 3. ToonStudio 독립 샘플을 그대로 적용하지 않는 이유

샘플은 `apps/`에서 import되지 않는다. 기능을 새로 복제하기 전에 실제 구현을 재사용하고 아래 차이를 확인한다.

| 샘플·명세 항목 | 실제 구현과의 대조 | 남은 범위 |
| --- | --- | --- |
| 기획→콘티→작화 | `studio-storyboard-planner.ts:241/433`, `studio-episode-document-handoff.ts:75`와 UI 핸드오프가 실제로 연결돼 있다. | 실제 저장 프로젝트에서 생성·전환·재열기 완주. |
| 컨트롤 룸 | 실제 GridPanel은 3뷰·필터와 재배열 차단·드래그 속성을 구현한다. 샘플은 재배열 안내와 컷 선택 텍스트만 제공한다. | 실제 키보드·드래그·선택 패널 편집 검증. 샘플을 기능 완성본으로 가져오지 않는다. |
| 통합 소재 | 실제 Workspace는 `/` 검색, caution 승인과 빠른 삽입 보호, 3D 미리보기를 가진다. | 삽입 위치 버튼 `StudioUnifiedAssetWorkspace.tsx:889`의 `min-h-10`(정적 40px), 반입·권리 확인·실제 배치·되돌리기 검증. |
| 생성 큐 | 정본 `studio-ai-job.ts` 모델·테스트는 있다. 생산 소스에서 확인한 import는 `studio-ai-provider.ts:1`의 type-only `StudioAiSkillId`다. | 정본 상태 모델의 실제 UI 연결은 확인되지 않았다. 샘플의 자체 `useState` 상태 전환을 정본 큐 통합으로 보고하지 않는다. |
| 사전 점검 | 실제 8타깃 검사와 별도 3프로필 게시 검사 모델이 모두 있다. | 샘플의 내보내기 버튼 `396~411행`에는 실행 핸들러가 없다. 실제 검사·출력 경로로 검증한다. |
| 저장·충돌 | 실제 상태바는 기기 저장 범위·시각을 구분한다. 병합 런타임은 외부 동기화와 local-wins 처리를 가진다. | 샘플의 일반적인 “저장됨” 문구로 정보 수준을 낮추거나, 명세의 3선택 UI를 구현된 것으로 표시하지 않는다. |

샘플에는 고정 2열 배치(`:213`), 키보드 동작 없는 클릭 가능한 article(`:221`), 최소 44px가 없는 큐 버튼(`:270~320`), HEX 인라인 스타일이 있다. 기존 Starlight 의미 토큰·접근성·저장 권위의 대체 구현으로 사용하지 않는다.

## 4. 정적 441개와 실제 런타임 범위의 차이

정본 AST 수집기가 만든 441개는 **앱 등록·Studio 매니페스트·별칭·학습 콘텐츠의 정적 확장**이다. 독립 페이지 수·사용성 점수·전 런타임 경로 수가 아니다.

확인한 구체 예로 `studio-workspace-route.ts:505~513`은 `/studio/3d/dcc/{mode}`와 work/remix 문맥을 파싱하지만 현재 정적 매니페스트의 편집기 표면 목록은 이 DCC 변형을 열거하지 않는다. 따라서 441개 원장에 DCC 변형이 모두 나타나지 않는다. DCC 파서와 경로 생명주기 테스트를 추가 증거로 보되, 441개 감사만으로 parser-only 경로까지 검증했다고 주장하지 않는다.

보유 초기 브라우저 보고서는 `initial-partial-status.json`에서 `interrupted-for-production-build`로 명시돼 있다. 같은 시점의 baseline report는 게스트·API 503·GPU 비활성화 조건이며 중단 뒤 관측도 섞여 있으므로 최종 사용성·실데이터 검증으로 인용하지 않는다. 전체 typecheck도 실행 중 입력 변경으로 실패했던 첫 결과와 고정 후 재실행 결과를 구분한다.

## 5. 현재 확인된 수정 후보 — target

새 기능을 늘리기보다 기존 행동과 표시를 일치시키는 순서다. 실제 수정과 검증은 루트가 현재 고정 소스 검증을 마친 뒤 결정한다.

1. **기존 작업 여정 검증**: 시작→편집→저장→재열기→검수→내보내기를 실제 사용 가능한 예제/프로젝트로 완주하고 막힌 위치를 수정한다.
2. **도착하지 않는 동선**: BG3D의 `/studio/companion/canvas`를 실제 허용된 목적지와 맞춘다. 현재 Workspace 테스트도 이 미지원 주소를 기대하므로 라우트 resolver로 목적지를 확인하는 검증이 필요하다.
3. **행동과 결과 문구 일치**: 로컬 표시만 바꾸는 Split-Wipe와 이동 링크인 “바로 굽기”를 실행 기능처럼 읽히지 않게 한다. 실제로 존재하고 검증 가능한 renderer 명령만 연결한다.
4. **실제 검사에 근거한 상태**: 크기만 본 출력 요약에 권리 검사 완료를 섞지 않는다. 마켓의 상시 BOM 배지도 실제 보존 단계와 구분한다.
5. **남은 터치·용어 정리**: 소재 삽입 위치의 40px와 기본 상태에 남은 저장 엔진 용어를 정리하고 실제 좁은 화면·키보드 상태를 확인한다.

수정 완료, 자동 검증 통과, 실제 업무 완주, 운영 배포는 각각 별도 증거로 기록한다.

## 6. Phase2 현재 기준 — 2026-11-11

- 제품 소스 체크포인트는 `70c577828b35886ec6ae71a1b37949798eab4323`이다. Phase1 `9393369b8d`의 공통 정보 위계 개선에 작업 재개·공식 감상·소재 적용·편집기 표시 정리를 추가했다.
- 원격 `origin/main`은 `933caa71cf57f79d783a7703ccfc60bb93a98e00`으로 갱신됐다. 추가 CI 수정 3개를 병합한 현재 소스 HEAD는 `e780510fd4`이며 충돌 없이 병합했다. 과거 `53f184ad…` 조회와 구분하며, Mac 참고 `e7f3eb1c`는 중복 cherry-pick하지 않았다.
- **implemented**는 실제 소스에 연결된 동작이다. 한 계열의 일부 구현이 모든 하위 경로·권한·데이터 여정의 완료를 뜻하지 않는다. **model-only**는 모델·테스트가 있지만 해당 UI 소비자를 확인하지 못한 범위다. **target**은 아직 구현 또는 해당 실행 증거가 필요한 범위다.
- 아래 소스 브라우저 증거는 최종 프로덕션 번들 검사와 별개다. 이 문서 갱신 시점의 최종 빌드·전체 주소 관측·전체 타입 검사·배포 결과는 **대기**이며, 성공으로 선기록하지 않는다. 최종 릴리스 판정은 [검증·배포 인계](./validation-and-release.md)에 기록한다.

## 7. 기존 Gemini SVG 5개 확인

사용자가 지칭한 기존 Gemini 시안은 [Starlight 참고 패키지](../starlight-atelier-v2-mockups-2026-11-11/README.md)의 SVG 5개 묶음으로 보존돼 있다. `2026-11-11`에 `git ls-tree origin/main`과 `git show origin/main:<path>`로 위 원격 참조의 객체를 읽고 Python `xml.etree.ElementTree.fromstring`으로 검사했다. **5개 모두 존재하며 XML 파싱과 SVG 루트 확인에 성공**했다. 새 시안 생성·원본 덮어쓰기·별도 cherry-pick은 하지 않았다.

| 기존 SVG | 바이트 | XML·SVG 루트 | 상태 |
| --- | ---: | --- | --- |
| [A·B·F 홈·로비](../starlight-atelier-v2-mockups-2026-11-11/boards/board-a-b-home-and-studio-lobby.svg) | 19,049 | 정상 | reference / target |
| [B·C·D·O 편집·3D](../starlight-atelier-v2-mockups-2026-11-11/boards/board-b-c-editor-2d-and-3d-live-ink.svg) | 10,237 | 정상 | reference / target |
| [E·N 탐색·리더](../starlight-atelier-v2-mockups-2026-11-11/boards/board-e-n-discover-spectrum-and-reader.svg) | 12,005 | 정상 | reference / target |
| [G~P 생태계 허브](../starlight-atelier-v2-mockups-2026-11-11/boards/board-g-h-i-k-p-ecosystem-hubs.svg) | 12,392 | 정상 | reference / target |
| [M1~M4 모바일](../starlight-atelier-v2-mockups-2026-11-11/boards/board-m1-m4-mobile-starlight-suite.svg) | 12,309 | 정상 | reference / target |

모든 보드의 `viewBox`는 `0 0 1440 860`이다. 존재·파싱 성공은 시안의 실제 기능 적용이나 화면 사용성·접근성·운영 검증 완료를 입증하지 않는다.

## 8. 18개 계열의 현재 적용·모델·목표 구분

계열 이름과 ID는 기존 [clarity 갤러리](./index.html)의 분류를 그대로 쓴다. 표는 Phase2 추가 상태이며 2절의 A~P·M1~M4 대조 원문을 대체하거나 모든 계열을 완료 처리하지 않는다. 공통 셸·메뉴·의미 토큰의 적용은 각 계열의 고유 업무 검증과 분리한다.

| 계열 | implemented — 현재 연결된 소스·추가 변경 | model-only / target — 남은 구분 | 현재 실행 증거·한계 |
| --- | --- | --- | --- |
| 시작·작업 홈 `start` | 실제 사용자 작업 또는 유효한 정확 재개 문맥이 있을 때만 최근 작업을 주 행동으로 선택한다. 예제만 있는 초기 상태는 새 작업이 주 행동이며 다른 시작 방식은 native details로 제공한다. | **target**: 최종 번들에서 작업 시작→편집→저장→같은 문서 재열기와 오프라인 복귀 완주. | 실제 게스트 로컬 작업·빈 프로필의 1440/390px, Enter/Space, 44px 주 행동과 넘침 0을 확인했다. 아래 L 증거 참조. |
| 프로젝트·편집기 `authoring` | `StudioDocumentWindowHub`의 작업공간 선택을 메뉴 안으로 옮기고 포커스 진입·Escape 복귀를 연결했다. 이동 바로가기를 실제 공정 진행률처럼 표시하지 않는다. 근거 없는 “안전 저장” 배지를 제거하고 저장 상태 소유자를 유지했다. 게시 제안은 마무리 도구 모드에서 제공한다. | **model-only**: 순수 9상태 생성 큐의 실제 UI 소비자는 여전히 확인하지 못했다. **target**: 최종 번들에서 문서·선택·저장 상태 보존과 실제 출력까지 완주. | 편집 관련 9파일 100테스트·모바일 소재 진입 관련 3파일 77테스트 로그를 확인했다. 실제 로컬 이미지 저장·재열기는 R 증거 범위이며 전체 편집·출력 보증은 아니다. |
| 소재·전문 도구 `assets` | 통합 소재를 검색·결과 우선으로 정리하고 필터를 접었다. Enter/Space/클릭은 상세 미리보기, 명시적 삽입만 원고를 변경한다. 세션 provider가 반응형 패널 재마운트 동안 검색·조건·선택을 보존한다. BG3D의 미지원 컴패니언 주소를 `/studio/companion/workspace`로 수정하고 가짜 Split-Wipe 토글을 제거했다. “바로 굽기/배치” 이동 링크는 실제 결과에 맞게 이름을 바꿨다. | **target**: 전문 3D·VRM 렌더, GPU 편집·캡처·원고 굽기, 외부 소재 반입·권리 확인·되돌리기. 소재 패널 세션 보존은 문서 저장 권위를 대체하지 않는다. | R: 실제 내장 래스터 소재의 미리보기 비변경·명시적 이미지 삽입·재열기와 390→320px 진입 **13/13**. 3D 모델링 검증으로 확대하지 않는다. |
| 제작·팀·발행 `production` | 기존 프로젝트 브리지는 목적지 이동으로 유지한다. `StudioExportOutputSummary`는 실제 선택 크기 안내만 표시하며 크기만으로 규격 적합·Rights BOM 자동 점검을 선언하던 문구·배지를 제거했다. 기존 8타깃 사전 점검과 별도 3프로필 게시 검사 경로는 구분한다. | **target**: 실제 팀 권한·담당·인계·칸반 상태 갱신과 검사→출력 파일→원본 보존 왕복. 이동 카드와 상태 모델만으로 완주를 판정하지 않는다. | 출력 요약의 문구·상태 관련 단위 검증 포함. 실제 최종 출력·게시 성공 증거는 대기다. |
| 작품 찾기 `discover` | 검색어 지우기 버튼의 등장과 무관하게 검색 입력의 접근성 이름을 유지한다. 실제 공개 카탈로그 결과와 상세 진입을 연결한다. | **target**: 최종 번들에서 같은 여정 재검증과 로그인·개인화 데이터 조건 검증. | C: 실제 생성 카탈로그 `nw-15640`, 1440/390/320px 검색→상세·Back 검색어 보존·로딩·빈 결과·실패 복구. 최종 수정 후 관련 RTL 10테스트 통과. |
| 작품 상세·감상 `reader` | 상세 주 행동과 직접 Reader 안내가 기존 모델의 `/api/go` `href`를 사용하며 새 탭을 명시한다. 확인된 공개 회차만 첫 회차·이전/다음·이어하기로 연결한다. 회차 정보가 없을 때 임의 1~6화·다음 화를 만들지 않고 안내 방문을 독서 완료로 기록하지 않는다. 수동 기록·저작 쇼케이스 경로는 유지한다. | **target**: 실제 회차 데이터가 있는 내부 경로와 저작 쇼케이스의 별도 완주. 공개 카탈로그에는 회차 컷이 제공되지 않아 이 안내를 내부 감상 완료로 표시하지 않는다. | C **23/23**은 로컬 API 503 조건의 공식 게이트웨이 이동 의도까지다. G의 운영 게이트웨이 302 관찰은 별도이며 최신 프런트엔드 배포 증거가 아니다. |
| 참고자료·리서치 `research` | 2절의 목적·검색·필터 연결은 기존 구현 이력이다. 공통 작업형 헤더·선택 안내 규칙을 적용한다. | **target**: 자료 검색→원문·허용된 반입→작업 복귀. 전문 출처별 이용 조건과 실제 반입은 별도 검증한다. | Phase2의 R 소재 검증을 외부 리서치 전체 여정으로 합산하지 않는다. |
| 학습·도움말 `learn` | 기존 학습 경로·목차와 공통 헤더 연결을 유지한다. | **target**: 실제 문서 앵커·실습 이동·없는 문서 복귀와 좁은 화면 목차 사용. | Phase2 고유 업무 완주 증거 추가 없음. 공통 메뉴 M 검증과 구분한다. |
| 커뮤니티·쇼케이스 `community` | 기존 소셜 이동 바·저작 쇼케이스 경로를 유지한다. 모바일 메뉴 이동 후 SPA 문서·Back 스크롤·연결된 포커스를 보존하도록 수정했다. | **target**: 로그인 후 게시·작성 취소·팀 모집·대화와 입력 보존. 이동 바 존재는 실행 완료를 뜻하지 않는다. | M: 실제 커뮤니티→랭킹→Back의 스크롤 220px·버튼 포커스 복원. 게스트/API fixture의 탐색 검증이다. |
| 마켓·요금 `market` | 기존 상품 메타데이터·상세 링크·명시적 hero를 유지한다. 공통 셸 간소화가 결제·라이선스 계약을 변경하지 않는다. | **target**: 주문·결제·설치·원고 반입·출처 보존. 2절의 상시 BOM 배지는 아직 실제 보존 성공 증거가 아니다. | Phase2 소재 R은 내장 무료 래스터 적용이며 마켓 구매·주문 성공 검증이 아니다. |
| 내 공간·메시지 `personal` | 기존 볼트·쉬어가기 연결을 유지한다. 작업 목록은 저장 프로필만으로 자동저장·백업 성공을 단정하지 않고 실제 오류·충돌·연결 필요만 안내한다. | **target**: 인증된 개인 데이터·메시지·공유·백업·복구 여정. 충돌의 3선택 UI가 구현됐다고 표시하지 않는다. | L은 게스트 로컬 작업 목록 증거다. 계정별 클라우드 동기화·메시지 검증으로 확대하지 않는다. |
| 설정·외부 연동 `settings` | 기존 설정 경로와 저장 상태 소유자를 유지한다. 저장 오류·충돌·재연결 안내를 작업 목록에서도 보존한다. | **target**: 실제 저장 대상 연결·권한·재연결·변경 취소·입력 보존. | Phase2 고유 외부 연동 완주 증거 추가 없음. 설정 프로필은 성공 영수증을 대신하지 않는다. |
| 신뢰·정책·기술 문서 `trust` | 기존 목차·본문 연결, 공통 기본 헤더의 24–32px 제목과 작은 장식 규칙을 유지한다. 명시적 hero·실제 aside 조작부는 보존한다. | **target**: 각 문서 앵커·상위 문서 복귀와 모바일 읽기 흐름. | 공통 헤더·토큰 단위 검증이 있으며 개별 문서 전체의 수동 검증 완료는 아니다. |
| 서비스 소개·안내 `marketing` | Phase1 홈은 실제 아이디어 입력·진행을 먼저 두고 Luna와 보조 기능 카드를 접었다. 과장된 “1초”·기술 용어 노출을 정리했고 기존 시작 목적지를 유지한다. | **target**: 각 소개·영상의 실제 재생·미지원 복구와 시작 전환. | 기존 Phase1 집중 검증 범위다. 이번 Phase2의 카탈로그·소재 수치와 합산하지 않는다. |
| 가벼운 체험 `experience` | 기존 체험 목적지와 공통 선택 안내 연결을 유지한다. | **target**: 체험별 시작·선택·결과·다시하기·움직임 정지와 터치 사용. | Phase2 고유 체험 완주 증거 추가 없음. |
| 운영자 콘솔 `admin` | 2절의 독립 admin-web·접근 배지·의미 토큰 구현 이력을 유지한다. | **target**: 운영자 권한·거부·세션 만료·감사·위험 명령. 배지는 접근 통제 검증이 아니다. | 게스트 시각 관측·공통 메뉴 결과로 운영자 업무 성공을 판정하지 않는다. |
| 인증·시스템 상태 `system` | 기존 인증 준비 기한을 유지하고 몰입형 장애 안내의 배경을 테마 표면으로 통일했다. 캔버스의 모바일 기기 안내는 처음 접힌 상태에서 열 수 있다. | **target**: 최종 번들의 느린 연결·오프라인→편집→로컬 저장→온라인 복귀와 iOS/Android 설치 셸. | source의 로딩·오류·재시도 C와 실제 게스트 로컬 R을 구분한다. 전체 라우트 준비·네이티브 셸 보증은 아니다. |
| 이전 주소·호환 경로 `compatibility` | 정적 441주소 원장과 기존 별칭·resolver를 유지하며 잘못된 BG3D 컴패니언 목적지 한 곳을 정본 surface로 수정했다. | **target**: 최종 번들의 별칭·동적 ID·권한·복귀와 정적 원장에 열거되지 않은 DCC 변형 검증. | 원장 수는 그대로 정적 범위다. 441개의 실제 문서·사용자 데이터를 완주한 수치가 아니다. |

## 9. Phase2 실행 증거 원장

아래 JSON은 이번 갱신에서 직접 읽었다. 브라우저 조건·시간·성공 항목을 보존하며 서로 다른 실행을 합산해 단일 “전 화면 통과”로 보고하지 않는다. `.qa/`는 로컬 검증 산출물이며 제품 번들이나 운영 배포 원장이 아니다.

| 식별자·실행 | 확인 결과 | 근거와 경계 |
| --- | --- | --- |
| **R — 소재 10+3** | core **10/10**, touch mobile **3/3**, 오류 0 | `.qa/clarity-20261111/dot-review-after/resource-core-results.json`(`14:40:45Z` 종료), `resource-mobile-entry-results.json`(`14:42:24Z` 종료). 실제 게스트·백엔드 부재·API fixture 없음·UI로 생성한 같은 문서다. canonical 로컬 원고에서 이미지 수가 빈 상태 0→Enter/Space 미리보기 0→명시적 삽입 1→재열기·모바일 재진입 1로 유지됐다. 최초 빈 원고의 snapshot 부재와 오류 없음도 명시돼 있다. software ANGLE/SwiftShader 조건이며 3D 모델링은 미검증이다. |
| **C — 실제 카탈로그** | **23/23**, 실패 0 | `.qa/clarity-20261111/catalog-core-flow/results.json`(`14:28:43Z` 종료). 실제 생성 공개 데이터, 게스트·API 503 fixture, 1440/390/320px. 검색·상세·게이트웨이 `href`·Enter 새 탭 요청·Back·회차 없는 안내·Escape·넘침·로딩·빈 목록·실패 재시도다. 외부 리다이렉트·회차 컷은 로컬에서 확인하지 않았다. 직접 URL을 썼던 이전 결과는 `pre-gateway-review-results.json`으로 분리했다. |
| **M — 모바일 메뉴** | **22/22**, 실패·HMR 0 | `.qa/clarity-20261111/dot-review-after/mobile-navigation/report.json`(`13:41:58Z` 종료). 390px·게스트/API 503 fixture·GPU 비활성에서 native Enter/Space, 닫힌 링크의 Tab 제외, 포커스 순환·Escape, 스크롤 잠금·inert 해제, 실제 이동과 Back 복원을 확인했다. 별도 `dot-review-after/menu-click-diagnostic.json`은 `documentReplaced=false`, bubble의 `defaultPrevented=true`와 연결된 링크를 확인한다. |
| **L — 실제 작업 목록** | `ok=true`, `pageErrors=[]` | `.qa/clarity-20261111/dot-review-after/creator-library-evidence.json`. 실제 게스트 로컬 작업과 새 프로필, API fixture 없이 빈 목록·작업 있음 1440/390px, 접힌 다른 시작의 Enter/Space, light·contrast 캡처를 포함한다. 관측한 주 행동은 44px·가로 넘침 0이다. 전체 저장·내보내기 완주 횟수로 세지 않는다. |
| **G — 운영 공식 게이트웨이 관찰** | GET **302**, 공식 NAVER URL의 `Location` | `.qa/clarity-20261111/production-official-gateway-observation.json`(`14:21:37Z`). 승인된 기존 프런트엔드 도메인의 `/api/go/naver-webtoon?...`에 자격증명·사용자 정의 헤더·리다이렉트 추적 없이 읽기 전용 요청했다. `frontendDeploymentVerified=false`, `externalEpisodeContentVerified=false`다. |

관련 자동 검증은 다음처럼 실행 범위를 따로 기록한다. 같은 테스트가 재실행되므로 아래 개수를 서로 더하지 않는다.

- 카탈로그 관련 6파일 98테스트 통과 후 게이트웨이 계약 수정 범위 3파일 **64테스트**를 다시 통과했다. RTL의 미지원 `exact: true` 제거 후 DiscoverHub **10테스트**를 재실행했다. 로컬 로그는 `/tmp/toonstudio-catalog-core-flow-unit.log`, `/tmp/toonstudio-catalog-gateway-contract-unit.log`, `/tmp/toonstudio-discover-role-options-unit.log`다.
- 편집 관련 **9파일 100테스트**(`.qa/clarity-20261111/editor-flow-tests.log`), 모바일 소재 진입 관련 **3파일 77테스트**(`editor-mobile-assets-tests.log`), 공통 토큰 관련 **6파일 102테스트**(`shared-tokens-phase2.log`)의 통과 로그를 확인했다. 실행 시점의 각 소스 범위 증거이며 최종 번들의 동작 성공과 구분한다.
- `.qa/clarity-20261111/architecture-phase2-final.log`에서 문서·source layout·앱 경계·파일 크기·Studio 초기 import 그래프 검증 통과를 확인했다.
- 수정 전 77개 웹 파일의 집중 의미 검사에서 나온 테스트 옵션 진단 11건은 수정 대상 기록이다. 이를 전체 타입 검사 성공 근거로 사용하지 않는다. 최종 pre-push 전체 타입 검사는 별도 결과를 기다린다.

## 10. 역사적 후보의 처리와 남은 릴리스 조건

5절 후보 중 BG3D 미지원 목적지, 실행되지 않는 Split-Wipe·굽기 문구, 크기만으로 Rights BOM 자동 점검을 선언하던 출력 요약, 소재 삽입 위치의 40px·중복 조작·미리보기 오삽입, 작업 목록의 근거 없는 저장 성공 표시는 Phase2 소스에서 수정됐다. 해당 문제를 여전히 미수정인 현행 상태로 읽지 않는다.

다음은 **target / 대기**로 남는다.

1. 고정 HEAD의 최종 프로덕션 빌드 성공·산출물 SHA와 전체 타입 검사·필수 CI 결과 확인.
2. 최종 번들에서 정적 원장 441주소×데스크톱·모바일의 관측 완전성과 화면 상태를 분리 판정. 접근 안내·오류·준비 지연을 정상 업무 성공으로 합산하지 않는다.
3. 실제 문서의 오프라인 편집·로컬 저장 영수증·온라인 복귀·같은 문서 재열기, 명시적 소재 적용·Undo·재열기와 출력 파일 검증. source의 R/L 결과를 최종 번들 재검증으로 대체하지 않는다.
4. 아직 해당 증거가 없는 로그인·팀·결제·외부 소재 권리·GPU·독립 앱 여정과 모델만 있는 생성 큐의 UI 연결 확인. 마켓의 상시 BOM 배지와 충돌 3선택 UI는 완료 처리하지 않는다.
5. 정본 배포 정책에 따른 원격 main·필수 CI·정적 웹 preflight·인증·승인 SHA·롤백 기록·배포 ID와 사후 스모크. G의 기존 운영 게이트웨이 302만으로 이번 프런트엔드가 배포됐다고 주장하지 않는다.

이 문서 갱신은 제품 소스·라우트·데이터 계약·시안 원본을 바꾸지 않는다. 최종 빌드·readiness·운영 배포의 결과는 확인된 뒤 별도 릴리스 증거로 추가한다.

## 11. Phase3 고정 번들의 실제 원고·오프라인·출력 — 역사적 실행 증거

대상은 `9d641f1c067905ec6921bcb97474ef3ed2026103`, `buildId=086eb4202efb`의 로컬 프로덕션 번들이다. `2026-11-12 02:00:22~02:01:15 KST`(`2026-11-11 17:00:22~17:01:15 UTC`)에 `http://127.0.0.1:5276`에서 실행했다. 해시가 있는 앱 자산을 사용하고 `/@vite/client`는 없었다. 원본 증거는 `.qa/clarity-20261111/dot-review-after/phase3-offline-2026-11-11T17-00-22-033Z/{summary,evidence}.json`이다. **운영 배포나 Phase4 변경 검증이 아니다.**

| 실제 동선·상태 | 확인 결과 | 한계·후속 |
| --- | --- | --- |
| 기존 원고→오프라인 편집→재연결→같은 원고 재접속 | **4/4**, `pageErrors=[]`. UI로 만든 기존 `project-yv58so / ep01-1te2igr`을 재사용했다. 오프라인 journal 바이트와 text CAS 해시·정확한 work/session 범위를 읽었고, 오프라인 중에는 canonical에 새 문구가 없음을 구분했다. 재연결 뒤 같은 페이지와 원래 원소 ID를 보존한 실제 레이어 **8개**가 재접속 화면에 나타났다. | 실제 게스트·백엔드 부재·성공 API fixture 및 정본 데이터 주입 없음. 영수증은 **`canonical-local`**, `serverSequence=null`이다. 서버 ACK·클라우드 동기화·백업 성공으로 표시하지 않는다. 최초 부분 projection을 곧바로 손실로 판정했던 이전 시도는 별도 보존했고, 최종 실행은 준비 기한 안의 전체 ID 복원을 확인했다. |
| 현재 페이지 PNG 내보내기 | 실제 다운로드 **720×5333px / 340,021bytes**. SHA-256 `bf95c728a9f243eb25b1f0baf4ec93d47e85fa3a0b998fd1ab68dfd6a5d3401b`. 실제 저장 시각은 `2026-11-11T17:00:40.363Z`다. | PNG 내보내기는 외부 게시·연재 예약·클라우드 저장이 아니다. ZIP·다른 포맷·전체 페이지 출력을 이 결과에 포함하지 않는다. |
| 1440/390/320px 재접속 화면·화면 맞춤 | 실제 화면 3장, 가로 넘침 0. 390/320px 화면 맞춤 버튼 높이 44px, 캔버스 viewport 시작은 각각 y206/y254였다. [실제 화면 모음](./review-renders/README.md)의 `after-phase3-*`를 참조한다. | 이 layout 측정은 해당 버튼·viewport의 증거이며 모든 조작부의 터치·가림·초보자 성공을 보증하지 않는다. 기존 QA 텍스트·이미지 겹침과 연결 재확인 안내를 지우거나 합성하지 않았다. |

같은 소스에서 뒤이어 확인한 실패도 유지한다. Phase3 성공을 아래 문제의 해결 증거로 확대하지 않는다.

| 별도 실제 실행 | 확인된 문제 | Phase4 상태 — 다음 번들 재검증 필요 |
| --- | --- | --- |
| 드로잉·협업 disclosure, `2026-11-12 02:10 KST` 시작 | 선행 11개 검사 후 **320px native tap 실패**. `함께 작업` summary를 브러시 HUD slider가 가렸다. 390px 탭과 320px Enter/Space/Escape 통과는 보존한다. 원본: `.qa/clarity-20261111/production-interactions/ui-browser-2026-11-11T17-10-07-951Z/results.json`. | HUD의 실제 canvas scrollport 밖 anchor·협업 UI 분류 수정이 followups 소스에 있다. **실제 새 번들 통과 대기**다. 다음 검증은 도구 찾기→실제 획→Undo/Redo→저장→같은 문서 재열기를 먼저 실행한다. |
| 소재 상세 적용 footer, `2026-11-12 01:49 KST` 시작 | 390/320px의 적용·스크롤·권리 helper **8개 검사 통과** 뒤 **1440px 실패**. 버튼 하단 y972.75가 외부 clip 하단 y840 밖이었고 center hit가 실패했다. 원본: followups `.qa/resource-detail-footer/production/results.json`. 오래된 restored chunk 요청 오류도 해당 원본에 별도 남아 있다. | desktop detail aside의 잘못된 scroll owner를 제거하는 CSS 수정이 followups 소스에 있다. **1440px 실제 재검증 대기**다. 권리 확인을 자동 체크하거나 문서를 변경하지 않은 검사 조건을 유지한다. |

## 12. 모노레포의 앱·패키지·콘텐츠와 18계열 연결 — 소스 조사 범위

이 절은 `9d641f1c…`와 followups의 AI/Admin 구현을 대조한 담당자의 `.qa/clarity-20261111/admin-account-package-surface-map.{md,json}`을 원장에 연결한 **source-inspection** 기록이다. 441개는 Web의 정적 주소 원장이고, `/admin` 22개도 Web manifest의 16업무와 별칭에서 왔다. 독립 `admin-web` source 행과 query/hash 행은 각각 0개다. 주소 441개·계열 18개·앱 7개·패키지 디렉터리 13개를 독립 화면 수나 사용자 업무 성공 수로 더하지 않는다.

| 앱·진입점 | 실제 사용자/운영 기능·계열 연결 | 아직 별도인 검증 |
| --- | --- | --- |
| `web` — `apps/web/src/app/App.tsx` | 기존 18계열과 441주소 원장. query/hash·동적 문서·권한·데이터 소유자 조건을 추가 축으로 관리한다. | 각 상태의 실제 업무 완주와 최종 번들 전수 관측. 일반 페이지 준비가 문서 편집 성공을 뜻하지 않는다. |
| `admin-web` — `apps/admin-web/src/app/bootstrap/main.tsx` | 실제 마운트는 운영 정책·라이선스 capability 1개다. 별도 manifest의 16업무는 미이전이며 Web의 `admin`과 중복 구현 수로 세지 않는다. | 운영자·거부·만료·장애, 정책 read/preview/apply/audit와 Web 복귀를 분리한다. |
| `api` — `apps/api/src/modules/operation-policy/operation-policy.controller.ts` 등 | 사용자 페이지가 아닌 인증·정본 저장·제작·검색·거래·운영 정책 authority다. `admin/settings/create/pipeline/discover/reader/market` 행과 연결한다. | 프런트 메뉴 노출이나 배지를 서버 인가·실제 변경 성공으로 대체하지 않는다. |
| `mobile` — `apps/mobile/capacitor.config.ts` | 승인된 Web origin의 native wrapper와 launch/offline shell. `system/compatibility` 연결이다. | Web의 320/390px 관측은 iOS/Android 설치·권한·네이티브 오프라인 실행 증거가 아니다. |
| `desktop-sync` — `apps/desktop-sync/src/cli.ts`, `conflict-server.ts` | 폴더 동기화 CLI와 loopback 충돌 해결 HTML. `personal/settings/system/compatibility`에 연결되는 별도 surface다. | 실제 동기화·충돌 해결·재진입과 브라우저 보안 조건은 별도다. |
| `brush-lab` — `apps/brush-lab/src/app/bootstrap/main.tsx` | 독립 브러시 테스트 벤치. `create/resources`의 입력·PNG snapshot을 실험한다. | 제품 원고·서버 저장이 없는 실험 결과를 Studio 저장·복원 완주로 합산하지 않는다. |
| `character-lab` — `apps/character-lab/src/app/bootstrap/main.tsx` | 캐릭터 composition·엔진/패널 셸. `create/resources`와 연결한다. | 구조·NullEngine 테스트와 실제 GPU·모델·출력 브라우저 실행을 구분한다. |

패키지는 **JS workspace 12개 + Rust/WASM `studio-hokusai-wasm` 1디렉터리**다. 아래는 기존 소비자·역할 연결이며 13개의 새 메뉴나 페이지를 만들 근거가 아니다.

| 패키지 역할·실제 소비자 예 | 연결 계열·콘텐츠 | 검증 경계 |
| --- | --- | --- |
| `contracts` — admin HTTP/정책 DTO, Web/API schema | `admin/settings/create/pipeline/market` | actor·권한·revision·실패·감사와 실제 자산 출처. DTO 존재는 조작 성공이 아니다. |
| `core` — `shared/catalog/catalog-static-engine.ts` | `discover/reader/research/community/market/pipeline` | 생성 공개 카탈로그·공식 URL과 개인/거래 데이터 조건을 분리한다. |
| `play-core` — RPS·룰렛 등 게임 소비자 | `experience` | 게임별 시작·결과·다시하기·키보드 실행이 필요하다. `/play` 한 번의 준비로 대체하지 않는다. |
| `product-tour-film` — `ProductTourRemotionComposition.tsx` | `marketing` | 소개 영상 청크와 실제 재생·시킹·음성·BGM·자막·실패 복구를 분리한다. |
| `studio-project-model`, `studio-command-registry` — project graph, editor command client | `create/pipeline/system/personal` | 같은 문서 ID·원고·자산·journal/복구와 실제 명령 receipt·Undo/Redo. 서재 기록 백업과 구분한다. |
| `studio-brush-platform`, `studio-engine-registry` — vector ops·brush와 renderer provider 계획 | `create/resources` | 실제 입력·획·준비/미지원·fallback을 확인한다. capability 선언은 가동 결과가 아니다. |
| `studio-engine-skia`, `studio-engine-vello`, `studio-engine-thorvg` — document surface·vello hub·SVG preview의 실제 loader | `create/resources/pipeline` | 실제 선택된 renderer·GPU/CPU·글꼴·context loss·SVG/Lottie 제한·미리보기/삽입·원본/출력 일치를 따로 확인한다. |
| `studio-format-gateway` — compatibility report schema의 Web/API 소비 | `resources/create/pipeline` | export된 모든 형식을 UI 지원 완료로 세지 않는다. 실제 받는 파일·부분 지원·거절·손실 보고·원본 보존이 필요하다. |
| `studio-hokusai-wasm` — natural-media worker loader | `create/resources` | Rust/WASM 자연매체 입력·worker 실패·fallback·저장/출력. 일반 TS workspace 수와 구분한다. |

콘텐츠 소유권도 같은 원장에 연결한다. 공개 카탈로그는 공식 감상 안내와 실제 회차 콘텐츠를, 내장 래스터는 미리보기와 명시적 적용·Undo·재열기를, 운영 정책 근거는 read-only 조회와 preview/apply를 각각 분리한다. `library-backup.ts`의 별점·읽기·리뷰·컬렉션 복원을 Studio 원고·소재 복구로 표시하지 않는다.

추가 판정 축은 `계열 → 앱/base → route+query/hash → capability → actor/권한 → 데이터 소유자 → 진입/행동/복귀 → 준비/빈 상태/실패/거부/만료 → 구현 증거 → 실행 증거 → 빌드/배포 증거`다. 기존 18계열을 보완하며 새 전수 성공 수를 생산하지 않는다.

## 13. 기록 시점의 통합·배포 상태와 다음 판정

`2026-11-12 02:57 KST`(`2026-11-11 17:57 UTC`) 기록 시점에 마지막 확인한 원격 `origin/main`은 `933caa71cf57f79d783a7703ccfc60bb93a98e00`이고, 로컬 UX 체크포인트는 `9d641f1c067905ec6921bcb97474ef3ed2026103`이다. Phase4 구현은 `codex/sitewide-ux-final-followups-20261111` 작업본에 미커밋 상태다. 이 문서의 추가 화면은 그 변경을 포함하지 않는다.

- **코드·로컬 번들:** Phase3 고정 번들의 원고/오프라인/PNG 결과는 11절의 제한 안에서 확인했다. 이후 변경의 최종 타입 검사·통합 빌드·드로잉·소재·운영 흐름 검증은 별도다.
- **원격 반영:** 이 UX 브랜치의 push·PR·원격 main 반영은 이 기록 시점에 미실시다. 원격이 더 진행됐는지는 실제 통합 직전에 다시 확인한다.
- **운영 배포·운영 검증:** 미실시다. 원격 실행 환경의 기존 Cloudflare 인증 연결 부족은 배포 차단 단계다. 기존 운영 API live/ready 200이나 공식 게이트웨이 관측을 이번 프런트엔드 배포 증거로 사용하지 않는다.

드로잉·모바일 핵심 동선과 확인된 가림/clip 수정의 실제 재검증을 먼저 마친 뒤, 변경된 화면군과 필수 회귀·최종 빌드·현재 main 조율을 판정한다. 배포 전에는 기존 배포 커밋/진행 상태와 중복 원장을 확인한다. 이후 결과는 [검증·배포 인계](./validation-and-release.md)의 실제 증거로 갱신하며, 비용·권한·비밀 제한 때문에 실행하지 않은 단계는 미실시로 남긴다.
