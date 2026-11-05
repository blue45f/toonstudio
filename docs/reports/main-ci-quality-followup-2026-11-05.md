# 2026-11-05 main CI 후속 검증 실행 기록

상태: `current` 검증 기록. 운영 미적용. 기록 시각: 2026-11-05 14:35 KST.

제품 실행부의 검증 체크포인트는 `3c8acca8d55bdfea88b571a40f063b537f038c01`, 비교 기준 main은 `84ea914a449e3123eef6948939f6207e3f6289c6`입니다. `/private/tmp/toonstudio-sixpass-final.uKAUb2`의 검증 시작·종료 상태는 clean입니다. 아래는 그 시점의 고정 실행 기록이며, 이후 원격 CI·병합 상태의 정본은 해당 PR의 Checks·GitHub 병합 메타데이터입니다.

원래 요청의 PR·main 상태와 후속 수정의 이유는 다음과 같습니다.

- [PR #2712](https://github.com/blue45f/toonstudio/pull/2712)는 main `534ee5b1`에 병합됐으며, [PR 실행 41914697748](https://github.com/blue45f/toonstudio/actions/runs/41914697748)과 [main 실행 41917134015](https://github.com/blue45f/toonstudio/actions/runs/41917134015)는 각각 실제 13개 검사 성공을 확인했습니다.
- [PR #2713](https://github.com/blue45f/toonstudio/pull/2713)은 `e2cce5c3`에서 외부 경로로 main `a5224fb2`에 병합됐습니다(병합 실행 경로 미확인). 당시 static precache 190 B 초과와 갈필 live 품질 실패가 있었고, 실행 중 취소된 Full Test는 통과로 계산하지 않습니다.
- 기준 main `84ea914a`의 [Core 실행 41964653471](https://github.com/blue45f/toonstudio/actions/runs/41964653471)은 실제 13개 검사 성공이지만 static 빌드를 포함하지 않습니다. 아래 후속 로컬 증거로 해당 범위를 따로 확인했습니다.

| 3c8acca8에서 실제 확인한 항목 | 결과 |
| --- | --- |
| 하네스·타입 검사 | 실제 exit 0. lint·Secretlint·아키텍처·문서·크기·eager graph, Web 및 API 3개 TypeScript 설정 통과 |
| 회귀 | 일반 73파일·939테스트 + 전용 성능 1파일·1테스트 = 74파일·940테스트 통과 |
| 별도 Node 협업 검사 | 81개 통과. Vitest에도 포함된 동일 항목으로 940과 중복 합산하지 않음 |
| static production 빌드 | 1회 exit 0. critical 82 URL·2,588,403 B, 예산 2,588,672 B 대비 269 B 여유. warm 54 URL·297,214 B |
| 번들 검사 | Studio·Remotion exit 0. 공개 CWV 실측을 뜻하지 않음 |
| 실제 갈필 | 기존 50ms 검사 exit 0, 1프리셋 저장 6/6·Undo 복원·품질 실패 0 |
| 실제 Hokusai | 명시적 charcoal 변환·Undo/Redo·같은 ID/PNG 재열기 및 새 진단 전체 exit 0. source와 dist 바인딩 유지 |
| 후속 CI 배선 패치 | 누락 8개 추가로 필수 855개. Node 27개·Vitest 18파일 323개·lint·Secretlint 통과. 940개와 중복 합산하지 않음 |
| 실제 API·두 계정 검증 | peer의 교정된 3c8 context에서 Canvas editor·viewer 2/2와 직군·담당 HTTP 1/1 통과, skip 0·exit 0. 원격 후속 PR·CI·병합은 이 기록 이후 확인 |

14:35 체크포인트에서의 후속 메타데이터는 CI 대상 목록·배선 검사·해설 집계 숫자를 다루는 3파일과 이 검증 기록 1파일입니다. CI 배선 패치는 3c8 기준 별도 작업 폴더에서 검증됐으며 대상 삭제·serial 경계·임계값·제품 실행 코드 변경은 없습니다. 제품 빌드·화면 결과는 3c8에, 855개 배선 결과는 해당 패치에 각각 귀속하며 최종 커밋 전체의 동일 산출물 검증으로 합치지 않습니다.

peer Canvas의 첫 실행은 wrapper의 `VITE_API_BASE=/api`가 `/api/api` 요청을 만든 환경 실패였습니다. `passed=false` 원문을 보존하고 제품 오류 확정이나 성공으로 세지 않았습니다. 로컬 검사 서버를 모두 종료한 뒤 빈 prefix·새 context로 재실행해 2/2 Canvas와 1/1 HTTP 검사가 통과했습니다. 포인터 22 samples의 편집·공동 저장·인계·승인 뒤 REST 403/live forbidden·refresh/relogin을 확인했습니다. 기존 행·권한 8개 지문과 관련 소스 435개, 실행 전후 3c8 SHA·clean 상태가 같았고 시험 서버·소유 브라우저는 종료했습니다. 이 검증은 별도 시험 DB/API의 권한 경계 증거이며 Hokusai 정적 preview의 API 미검증을 대신하지 않습니다.

갈필 live→released는 원시 변경 0픽셀·중심 이동 0px로 일치했습니다. live/released→settled에는 원시 변경 6,248픽셀·최대 채널 차이 46·중심 이동 0.547197px·에너지 비율 1.018209가 남으며 기존 soft-wet-continuous 기준을 통과했습니다. 라이브 침착 표면은 메모리 전용이고, 최종 40스텝 저장 결과·RGBA와 분리합니다. 활성 획만 새 미리보기를 만들며 재열기는 최종 계산만, 커밋 대기는 정확히 같은 기존 미리보기만 재사용합니다.

Hokusai는 로컬 production preview에서 선택한 획의 명시적 변환을 검증했습니다. 기본 선반 3종은 벡터 경로를 유지하며 Hokusai live 시작은 0입니다. `apiVerified=false`인 선택적 API 부재 원문 67건을 별도 보존했으므로 실제 API 서버·협업 통합 성공으로 확대하지 않습니다. 분리 대상 외 진단 오류와 issues는 0입니다.

선행 `82e61b11`에서는 UI 12개가 통과했고 Hokusai 변환·Undo/Redo·자동 재열기 ID/PNG 시나리오는 완주했지만 전체 exit 1이었으므로 전체 통과로 세지 않습니다. 현재 Hokusai 전체 exit 0과는 별개 증거입니다. 선행 UI의 drag·lock·reload는 실제 변경값 보존을 확인했으며, 기본값과 같은 명시적 reset은 이전 custom 저장값을 갱신하지 않아 재열기 시 돌아올 수 있는 선행 한계가 남아 있으므로 같은 세션 표시 보존·자동 쓰기 0을 영구 reset 통과로 표시하지 않습니다.

원래 precache 190 B 초과는 SVG 두 개의 구조 공백 459 B 감축으로 보완했습니다. 선행 `82e61b11`의 82 URL·2,588,403 B와 별도로, 현재 `3c8acca8` 빌드에서도 같은 수치를 실제 확인했습니다. 원본 SVG 그림·문자·라이선스·URL과 예산 상한은 유지합니다.

협업 계약은 Node·Vitest 양쪽에서 검사하며, 기술 해설은 기본 LT의 설정별 역할과 선택형 6패스를 구분합니다. 기존 3D 도형 삽입·카메라 적용·문서 저장 계약은 바꾸지 않았습니다. 외부 SketchUp·Blender 파일 호환성·기능 동등성 및 Higgsfield API 연동은 별도 미검증입니다.

canonical 보존 재검사는 기존 dirty source 9개의 SHA-256 일치를 확인했습니다. canonical은 다른 경로에서 main `84ea914a`로 이동했고 별도 `.codex/config.toml` dirty 1개가 있으나 이 채팅의 canonical 변경은 0입니다. 운영 DB 적용·배포도 이 채팅에서 0이며 다른 담당 채팅의 승인을 확대하지 않습니다.

근거: `/tmp/main-followup-3c8-validation-summary.json`, `/tmp/main3c8-dry-brush-quality-summary-20261105.json`, `/tmp/main3c8-hokusai-live-verified-20261105/{source-binding-after.json,studio-hokusai-live-integration.json}`, `/tmp/main-ci-canonical-preservation-final-20261105.json`. CI 배선 근거는 `/tmp/main-followup-core-pins-855-20261105.{patch,json}`입니다. 이 문서는 검증 시점의 기록으로 유지하며 원격 CI·병합 결과가 나올 때마다 문서 수정 커밋을 추가하지 않습니다. 최종 상태는 해당 PR Checks·병합 메타데이터와 별도 실행 산출물로 확인합니다.


## 2026-11-05 원격 진단 이후의 교정

상태: `current` 검증 기록. 다음은 `db0942abc9f3b2b0246c28b76ee22e77862315cd` 원격 실행의 실패와 이후 교정을 구분한 기록이다. 새 통합 head의 하네스·빌드·화면·원격 CI와 병합은 PR Checks 및 해당 head의 실행 산출물로 별도 확인한다.

- [Core 41976218987](https://github.com/blue45f/toonstudio/actions/runs/41976218987)은 실제 검사 10개 성공, 성능 1개 실패와 집계 2개 실패였다. 기존 갈필 probe가 새 분기에서 carrier를 받지 못했으며, 별도 계측에서 3,200점 fallback 전체 계산 약 43.5ms도 확인했다.
- `f6de9e810090c68969b18d18a438ed8b8002dfe4`는 기존 증분 planner·재질·carrier를 재사용하면서 실제 활성 갈필 침착 표면도 요청한다. 원본 2배·8ms 기준의 22파일 435개와 관련 단위 7파일 132개가 통과했다. 최종 40스텝 RGBA는 전후 동일하다. 전체 호스트의 prefix 복사·서명은 O(n)이고, 8ms는 작업 분할 목표이며 실제 atomic turn 초과와 cap 이후 cache hit은 별도로 기록했다.
- 브러시 desktop은 4,874,542,315B artifact 수신 중 `Free space left: 0 MB`로 제품 검사 전 실패했다. 기존 Core의 SDK 두 경로 정리·20GiB gate를 같은 표준 Ubuntu 24.04 runner에 재사용한다. 전체 checkout·public·artifact·7개 matrix·시간 기준을 보존한다. 로컬에서 실제 SDK 삭제는 하지 않았다.
- Smart Shape는 뒤늦게 관리 위치로 이동한 접힌 오프라인 안내와 고정 polygon 좌표가 겹쳤다. 첫 ROI 보완도 실제 실행에서 실패해 원문을 보존했다. 제품 `db0942`/검사기 `442add3a`의 다음 단독 실행은 정상 안내·관리 상태와 실측 위치 정착 후 전체 그리드를 같은 크기로 왼쪽 67px 옮겨 6개 도형·저장·보정·Undo/Redo·냉간 재열기와 같은 ID 6개 복원을 확인했다. 정적 API 부재는 `staticApiVerified:false`이며 다른 브러시 matrix 결과는 포함하지 않는다.
- filters는 정상 갤러리를 열고 일반 parameter dialog를 기다리는 검사기 불일치가 있었다. 실제 갤러리의 활성 효과 스택을 선택해 기존 적용·픽셀·Undo·내구 저장 검증으로 연결한다. 반응형 40px 버튼은 DOMRect에서 39.999969px로 관측됐으므로 기준을 낮추지 않고 기존 모바일·고대비 44px 목표를 desktop에도 통일한다. 실제 새 화면 검증은 별도다.
- [Full Diagnostic 41976218977](https://github.com/blue45f/toonstudio/actions/runs/41976218977)은 root 8,674파일·100,157테스트 성공과 15파일 실패·12테스트 실패·98기존 skip으로 종료했다. 무수집 Node suite 4개를 포함하며 전체 통과가 아니다. 선행 API 28파일은 502성공·1기존 skip이었고, root 실패 뒤 serial 단계는 실행되지 않았다.
- Node/Vitest 연결은 기존 단언과 30초 인자를 유지한다. 경계 검사는 실제 helper·route 정본을 따라 검증한다. CRDT root가 Nest/DB 혼합 모듈을 가져오던 실제 경계는 `71ea20a7bdd78b3a23e47270a248203ece8c5291`에서 순수 모듈로 분리했다. 원본 비교 16개를 포함한 9파일 60개와 Node 12개가 통과했으며 서로 겹치는 실행은 합산하지 않는다. admission·REST 본문, 409/code/message, JSON SyntaxError, clone·공유 reference, 상수·예산·저장 shape/version·ACL·DB는 보존한다.
- 누락 route 분류, 정본 오류의 다음 행동과 말투, 언어 지역 옵션·접근 이름·서버 시계 차이/만료 focus 회귀를 교정했다. 관련 9파일 128개·번역 43개·문구 정책 13개가 통과했고 가드·허용목록은 그대로다. 채용의 기존 CI 실패는 조용한 로컬에서 재현되지 않았으므로 새 CI로 확인해야 한다.
- AI modal은 제품 지연으로 단정하지 않는다. 같은 사례의 원본 로컬 8.79초 중 약 93%가 전역 DOM query였다. 같은 15개 단언·9개 동작·30초 기한을 유지한 범위 검색으로 최종 20개가 통과했고 해당 사례는 0.59초였다. 새 Full CI 결과는 별도다.
- mesh는 GLB bytes가 아니라 257코너 실패 입력의 report hash 차이였다. 실행마다 삼각함수로 만들던 원래 8e445 좌표를 고정하고 매번 새 객체로 복사한다. 생산 digest·golden 파일·18개 기대값은 바꾸지 않았다. 삼각함수 호출을 금지한 RED 이후 2파일 36개가 통과했으며 Linux의 새 CI 결과를 별도로 확인한다.

핵심 교정 대상은 최초 876개 required selector에 고정했으며, main `994e5ba34`의 CRDT 회귀 네 경로와 통합한 현재 합집합은 880개다. 문서가 필요한 closure만 기존 product 소유에 두고 실제 expanded owner·sparse 입력을 확인했다. 대상 삭제·skip 추가·serial 22개·timeout·성능/크기 기준 완화는 없다. 이 문서의 로컬 계측·선행 화면 통과를 새 head 전체의 통과로 합산하지 않는다.

원본·패치·해시·실행 명세는 `/tmp/pr2716-ci-additional-20261105/`, `/tmp/pr2716-dry-carrier-patch-manifest-20261105.json`, `/tmp/pr2716-full-boundary-manifest-20261105.json`, `/tmp/full-ui-guards-442add3-20261105-evidence.json`, `/tmp/pr2716-ai-modal-query-scope-manifest-20261105.json`, `/tmp/main442-smart-shapes-readiness-db0942-20261105/verification-summary.json`에 보존했다. 운영 DB 적용·배포 및 외부 전문 도구 호환성 검증은 이 교정에 포함하지 않았다.

2026-11-05 PR #2718 병합 후 충돌 해결에서는 API facade와 root schema의 순수 shape 경로를 유지하고, main의 유효 filter mask 검증만 새 shape 함수로 이식했다. 동결 fixture/hash와 다른 함수 동등성·오류 경계는 보존하며, 해당 validator의 의도한 mask 확장을 별도 동작 비교로 검증한다. 이 범위에는 morphology 필압 진단이나 운영 변경을 포함하지 않는다.


## 2026-11-05 PR #2717의 이미지 입력·실제 표시 경계 보완

상태: `current` 로컬 보완 검증. 비교 head는 `289effabfebec9fcb215063bc1a6eddee989e98a`, main은 `994e5ba34df98b6bcf1cb46c567456924a89dd68`이다. 다음 두 수정은 선행 CI의 실패를 재현한 범위이며 새 head의 전체 CI 성공이나 병합을 뜻하지 않는다.

- 기반 회귀의 route visual 소비자는 원본 배경 PNG 14개를 읽지만 해당 shard의 sparse checkout에 파일이 없었다. 실제 소비 경로를 따른 재현은 4개 성공·1개 실패였고 이미지 입력을 복원한 뒤 5개가 통과했다. 기존 원본 PNG 14개(54,701,774 B)만 `studio-foundation`에 조건부 포함한다. 공통 영상 2개는 이미 포함돼 추가하지 않았다. 소비 소스에서 경로를 읽고 Git sparse checkout을 5개 shard에 실제 투영하는 회귀 검사로 소유 shard의 정확한 이미지 포함과 다른 이미지 제외를 확인했다. 제품 asset·selector·영상·저장 형식 변경은 없다. 통합 폴더의 관련 Node 검사는 6개 성공·skip 0이다.
- [선행 shapes 실패](https://github.com/blue45f/toonstudio/actions/runs/42008415687/job/127186551031)는 연결 상태가 정상적으로 `server-unavailable`/`local-only`가 된 뒤에도 60초 준비 기한을 넘겼다. 실제 client 캔버스 오른쪽은 1083px인데 제품 observer가 stable scrollbar gutter를 포함한 border box 1093px를 사용했다. 수정 전 회귀는 안내 패널 오른쪽 1084.703125px, 협업 패널 1085px로 CI 산출물과 같았고 신규 3개가 실패했다. observer만 실제 client 영역·화면 배율·조상 overflow의 잘림을 측정하도록 바꿨다. 관련 4파일 51개가 통과했으며 기존 사용자 배치 override·위치/크기 잠금·명시 도킹·좁은 화면 가드는 유지했다.
- 별도 실제 Chromium DOM 검사에서도 같은 CSS gutter 10px·clientWidth 733px와 수정 전 좌표를 재현했다. 수정 후 패널 오른쪽은 각각 1074.703125px·1075px이며 기존 strict readiness는 `false → true`였다. 이는 실제 CSS 측정과 제품 helper의 경계를 확인하는 제한된 브라우저 검사다. 전체 Studio 앱의 Smart Shape 그리기·저장·Undo/Redo 완료로 확대하지 않으며 해당 흐름은 새 head의 hosted browser 검사로 확인한다. 준비 조건·60초 기한·도형 입력·픽셀·저장 검사는 변경하지 않았다.

별도 Chemy 필압 검사는 기존 640px Canvas에서 총 알파 비율 1.1323929288472774로 현행 `>1.15` 기준을 충족하지 못했다. 같은 도형을 넓은 캔버스로 옮긴 경우도 1.1268981614405127로 실패했다. 입력 필압과 개별 도포 알파 반응은 존재하며 중첩 포화가 최종 합성 비율을 줄이므로 이를 필압 무효로 단정하지 않는다. 선행 hosted 보고서의 다른 topology 33종은 해당 기준을 통과했다. 기존 V1의 도포식 변경은 저장 획의 재생 외관에 영향을 주므로 적용하지 않았다. 임계값·입력·golden·fixture·검사 대상 변경도 없으며 현재 필압 실패와 PR 전체 미완료 상태를 유지한다.

원문·수정 전후 근거는 `/tmp/pr2717-shell-client-bounds-{red,green}.log`, `/tmp/pr2717-shell-browser-probe.json`, `/tmp/pr2717-foundation-route-visual-inputs-1391-evidence.json`, `/tmp/pr2717-chemy-pressure-canvas1391-v2-evidence/report.json`에 구분했다. 이 보완은 운영 DB·기존 데이터·권한·시크릿을 바꾸지 않았고 운영 배포를 수행하지 않았다.


20:22:18 KST GitHub 기록에서 `blue45f` 계정의 PR #2717 병합을 확인했다. 병합 SHA는 `63dcf937ca8658fbae52396595416daa1a796043`이며, 이 통합 채팅은 병합을 실행하지 않았다. 당시 head `289effab`의 전체 CI는 완료되지 않았고 material-morphology 및 session goals의 실패가 남아 있었다. 병합 부모에는 별도 PR #2719의 `f8cdc07f`도 포함돼 이전 head와 40파일 차이가 있으므로 이전 하네스·화면 결과를 새 main 전체의 증거로 승격하지 않는다. 남은 보완은 후속 PR에서 새 main과 통합해 검증한다.

session goals의 추가 실패 중 발표 문구는 실제 required selector 880개와 한국어·영어의 876개 설명이 불일치했다. 원본 한 줄의 두 언어 수치만 880으로 고쳤으며 기존 숫자 대조 검사와 lint가 통과했다. 채용 후보의 focus 만료 검사는 CI에서 만료 시점의 버튼 비활성 단언이 실패했지만, 같은 원본의 로컬 14개는 통과해 제품 결함으로 확정하지 않았다. 응답을 명시적 pending promise로 두고 async `act` 안에서 완료해 화면 갱신·focus 구독이 반영된 뒤 시계를 전진하도록 검사 경계만 보완했다. 서버와 로컬의 5분 시계 차이, 59,999ms의 허용 및 60,000ms의 차단, 보내기 호출 0 단언은 모두 그대로며 보완 후 14개가 통과했다. 제품·권한·만료 정책은 변경하지 않았다.

필압 기준을 바꾸기 전에 Linux 원본 픽셀을 별도로 확보하도록 실패 모델의 기존 저압·고압 Canvas PNG와 raw RGBA SHA-256, 원본 입력 JSON 지문만 CI 산출물에 추가한다. PNG 파일 hash와 raw RGBA hash는 구분하며, 캡처·파일 쓰기 오류는 원래 cases·failures를 덮지 않고 진단 오류로 남긴다. 기존 모델 순회·입력·렌더러·`>1.15` 검사와 그리기 순서를 보존했다. mock 캡처/쓰기 검증에서 독립 Node SHA 대조, PNG 바이트 보존, 경로 탈출 거절, 쓰기·인코딩 실패, 이전 보고서 필드 부재 호환성을 확인했다. 이는 실제 Linux 픽셀 수집 완료나 필압 기준 통과를 뜻하지 않는다. Chemy V1에 대한 검사 계약 교체 후보는 별도 검토 대상으로 두며 사용자 승인 전에는 후속 PR에도 적용하지 않는다.
