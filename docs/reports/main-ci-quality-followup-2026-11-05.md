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


## 2026-11-05 21:06 Chemy V1 검사 계약 결정

사용자는 제시한 변경안에 대해 판단과 진행을 위임했다. 기존 원고의 외관 보존을 선택하여 Chemy V1만 최종 합성 알파 질량 `>1.15` 하한을 기존 저압·고압 픽셀과 필압 전달 경로 보존 검사로 교체한다. **이는 원래 15% 하한 보장을 포기하는 검사 계약 변경이며 동등하거나 강화된 하한이 아니다.** 다른 topology 33종의 `>1.15`, 원래 입력·seed·640×480 크기와 JSON·DPR streaming·SVG·hybrid·대칭 검사는 유지한다. 제품 렌더러·기존 원고·저장 형식·권한을 이 수정에서 바꾸지 않는다.

독립 보관한 기존 raw RGBA·입력·순서 있는 geometry/color·양압력 절대 opacity 지문과 실제 보정 필압의 비례 관계를 검사한다. 픽셀·절대 지문은 정확 일치를 요구하며 비례 관계의 IEEE754 반올림 경계 4EPS만 별도로 둔다. PNG 파일 지문은 fixture 무결성이고 실제 렌더 픽셀 지문과 구분한다. 제품 종이 수식을 복제하거나 실행 중 golden을 자동 갱신하지 않는다. 낮은 필압 12,307,470·높은 필압 13,936,892의 기존 합계와 비율 1.1323929288472774, 원래 하한 미충족 상태를 보고서에 계속 기록한다.

검토 후보의 기존 pixel-quality 파일 30개는 통과했고, 이 중 26개 음성 회귀는 관측 객체 변형 검사다. 실제 제품 엔진 소스에 오류를 주입해 탐지한 결과로 해석하지 않는다. 원래 macOS/arm64 Chromium 156 환경에서 저압·고압 실제 Canvas 각 1회만 그린 제한 검사는 종료 코드 0이고 원본 픽셀·입력·geometry·opacity 지문이 일치했다. 전체 34모델 실행과 Linux 픽셀 검증을 뜻하지 않는다. 승인 상태 메타데이터를 실제 결정으로 교정한 통합 후 관련 정책·의미 검사 2파일 42개도 통과했다.

Linux는 아직 미검증 환경으로 실패하게 둔다. 원래 하한 미달의 두 Canvas와 raw RGBA·입력·primitive 개수·순서 geometry·opacity 지문을 별도 진단 산출물에 보존해 독립 대조한다. 같은 mass만으로 픽셀 동일성을 추정하지 않으며 독립 Linux 근거를 확인한 뒤 환경 계약을 확장한다. 최종 정확한 SHA의 전체 CI와 협업 검증을 통과하기 전에는 이 후속 PR을 병합하지 않는다. 검사 계약 변경을 되돌리면 기존 15% 하한과 현재 V1의 실패가 다시 나타나며 원고 변환이나 DB 변경은 필요하지 않다.

## 2026-11-05 main 5165 통합 후 협업 보존 경계와 CI 입력 교정

상태: `current` 로컬 재현·수정 기록. 비교 main은 `5165e4faf796cebe255460ab38d1c13fde8972c4`이고 최신 required selector는 918개다. 과거 880개 기록은 당시 시점의 사실이며 이번 통합에서 최신 manifest를 유지했다. 원격 CI·후속 PR·병합 상태는 정확한 head의 Checks로 별도 확인한다.

실제 Git `63dcf937`의 reader·publisher와 `5165e4fa`의 서비스, MemoryRepo, 하나의 Yjs 인스턴스를 사용해 구 클라이언트의 보존 필드 손실을 재현했다. archive가 없어도 PSD 그룹 또는 `colorizeMaskEnabled: false`만으로 v7 획이 만들어지지만 구 reader는 이를 읽기 결과에서 제외했다. 원시 기록은 즉시 삭제되지 않았다. 이후 구 publisher가 같은 ID의 캐시된 v6 원고를 수정하면 서버가 이를 승인했고 PSD·마스크 필드가 원시 CRDT에서도 사라졌다. 이어진 undo/redo도 해당 필드를 복구하지 못했다. 독립 재현에서는 정규 형식의 PSD·마스크·linked3d 보존 필드 7개 전체가 같은 경로로 소실됐다. 최초 v7 커밋 응답의 요구 capability가 빈 배열인 경우도 확인했다. 삭제된 v7 기록에서는 구 편집이 명시적 복원 오류로 거절됐으며 부활이나 원시 필드 손실은 재현하지 못했다.

이는 합성 문서·실제 코드·메모리 저장소의 서버 기록 손실 재현이다. 실제 사용자 피해나 운영 DB의 손상을 확인한 결과가 아니다. 네트워크와 실제 DB는 사용하지 않았다. 원본 실행 보고서의 경로 목록은 `/tmp/toonstudio-wire7-real-current.json`에 보관했다.

수정은 기존 `legacy-pigment-preservation.v1` capability를 보존 필드 전체에 적용한다. cold sync, 입장, durable before·candidate의 원자적 append와 REST baseline·candidate·삭제 이력을 확인하며 첫 커밋 이후 실제 요구 목록을 다시 계산한다. 서버는 BG3D 전용·보존 전용·두 기능 교집합 수신 방을 구분하고 작품 전환·binary 선택 해제 때 모두 정리한다. 구 reader에게 지원하지 않는 본문을 보내지 않고 업그레이드 오류를 전달한다. Web의 권위 있는 서버 응답과 비권위 peer 광고를 구분하며 P2P의 모든 요구 기능도 확인한다.

보존 정보 없는 v1-v6는 기존 경로를 유지한다. v7 보존 정보나 삭제 이력이 있는 문서는 구 버전 앱의 읽기·쓰기에 업그레이드가 필요하다. 최신 reader의 수정·실제 Y.UndoManager undo/redo·명시 삭제는 허용한다. 저장 wire·프로토콜 8·로컬 brand·DB schema·렌더러·권한과 revision/sequence/CAS 정책은 변경하지 않는다. 이 호환성 수정은 새 저장 형식이나 운영 변경을 도입하지 않는다.

관련 8파일 238개 회귀가 통과했다. 포함된 서비스 10개 회귀는 실제 구 publisher 바이트를 합성 fixture로 고정하여 첫 v7, cold sync, 구 writer 거절·sequence 불변, 삭제 이력, 최신 undo/redo/삭제와 두 서비스의 제어된 beforeAppend 경합을 검사한다. 7필드 전체의 실재현 증거와 최소 필드 중심 자동 회귀의 범위는 구분한다. 전체 브라우저 UI undo 흐름을 실행한 결과로 확대하지 않는다. 로그는 `/tmp/wire7-consistency-final.log`와 `/tmp/wire7-real-regression-green.log`다.

추가 CI 원인도 각각 독립적으로 교정했다. foundation shard에는 실제 소비하는 OpenCascade 고지·Studio promotion 문서·ADR 경로 3개만 포함하고 Git sparse 투영으로 검증했다. 가상 HTTP fixture의 동적 import는 실제 URL로 구성해 파일 시스템 import 검사 오탐을 해소했으며 allowlist나 검사 제외는 추가하지 않았다. 작은 프로젝트 버전 청크의 런타임 정본 import를 없애고 같은 7필드의 존재별 동작 회귀를 두어 저장 버전 판정과 청크 격리를 유지했다. 일반 dual-tip/smudge 비교는 지원하는 동일 안료로 고정하고 이전 Mixbox 획의 실행 거절은 유지했다.

검증 결과는 CI 배선 Node 4파일 61개, material engine 24개, 가상 fixture 3개, 청크 경계·보존 필드별 13개 통과와 `quality:imports` 성공이다. 마지막 13개는 필터한 실행이며 같은 파일의 저장·복구 검사를 반복한 결과로 세지 않는다. API 3개 TypeScript 구성도 통과했다. main 5165 통합 후 macOS/arm64 Chromium의 Chemy 실제 2회 그리기는 기존 픽셀·geometry·opacity와 비율 1.1323929288472774를 유지했지만 Linux 및 전체 34개 모델 성공을 뜻하지 않는다.

최종 전체 하네스와 정확한 SHA의 hosted CI는 이 기록 이후 실행한다. 기존 원고·실제 CRDT·권한 정책·환경변수·운영 DB는 수정하지 않았으며 운영 배포는 수행하지 않는다.

추가 독립 재현에서는 부모 seed 없이 실제 v7 증분을 먼저 받은 API가 이를 pendingStructs로 보관한 뒤 구 writer의 v6 덮어쓰기와 부모 seed를 sequence 1→2→3으로 승인하는 경로도 확인했다. 최종 원시 기록은 v6가 되고 보존 필드가 사라졌다. 이는 위 첫 수정 이후의 추가 결함이며 `/tmp/toonstudio-wire7-pending-audit/report.json`에 기록했다. Yjs 내부 pending V2 증분도 기존 capability 탐지에 포함하되 계약 모듈에 Yjs를 정적으로 추가하지 않는다. 일반 좌표·JSON의 숫자 7을 새 버전으로 추정하거나 모든 pending 변경을 거절하지 않는다. 정상 v1-v6 순서 역전과 보존 정보가 있는 pending의 송수신·ACK 경계를 별도 회귀로 검사한다.

중간 통합 커밋 `e5a531e5a99c7846f8a522a7597cafe18de5666d`의 원래 비동기 CRDT 회귀 4파일 42개는 모두 통과했고 skip은 0이었다. 이 시점의 전체 하네스는 새 Web 페이지 fixture의 필수 속성 누락 5개와 capability 배열의 좁은 literal 추론 1개로 실패했다. 이를 정상 타입으로 교정하며 `any`·ignore로 덮지 않는다. 중간 238개 통과나 과거 main의 검증을 최종 하네스 성공으로 표시하지 않는다.

2026-11-05 PR #2726의 추가 대조에서는 Web가 이미 직렬화·해독하는 기존 `sketch`가 API의 획 JSON 목록과 공통 서버 투영 목록에서 빠진 별도 공백을 확인했다. 합성 실제 코드에서 active·archive 두 사례의 서버 root 입장 거절을 재현했고, TEMP 2파일은 정상 v7 테스트 helper의 reader 광고 누락까지 포함해 12실패·26성공이었다. 두 정본 목록에 기존 키 하나씩만 연결하고, 본래 출처·권위 검사를 검증하는 정상 테스트에 지원 capability를 광고하도록 교정했다. 구 reader 거절의 빈 광고는 유지했다. 동일 TEMP 38개와 저장소 실제 경로의 wire·service·root boundary 3파일 42개가 통과했으며 둘은 겹치는 실행이므로 합산하지 않는다. 실제 DB·네트워크 호출은 0이었다. 필드 shape·기본값·저장 버전·렌더러·권한 변경은 없고 기존 스타일을 그대로 전달한다.

일반 dual-tip 회귀는 자체 안료와 spectral 양쪽에서 같은 어댑터를 검사하고, 이전 Mixbox V1 원고의 명시적 전환 전 재생 거절도 따로 확인해 26개가 통과했다. 별도 GPU packed atlas·공개 인코딩 기본값 변경은 이 PR에 포함하지 않았다. 문서 입력은 소비자가 실제 읽는 ADR 13개와 promotion·capability survey·고지 3개, 총 16개의 개별 Markdown으로 고정했다. 기존 PNG 14개와 종전 111개 선언을 보존하며 총 141개 선언·136개 고유 경로이고 무관한 ADR·문서를 제외한다. CI 배선 4파일 61개와 실제 tiny Git sparse 투영이 통과했다. 최종 source의 전체 하네스·원격 CI는 추가 변경을 포함한 정확한 커밋에서 별도 확인한다.

추가 Web 재현에서는 부모가 없는 색상 변경에 올바른 보존 요구를 붙여 수신해도 재전송 metadata가 비는 현상을 확인했다. 실제 적용 시 검증한 요구를 살아 있는 Y.Doc의 WeakMap에 미해결 기간만 보관해 peer 응답과 후속 입장에 유지한다. 거절·실패·obsolete 적용은 오염시키지 않고, 부모가 도착해 일반 v6임이 확인되면 해제한다. 기존 합본 8파일 250개가 통과했다. API에서는 이 색상 선도착 후 현대 부모가 도착하면 v7·PSD가 유지됐고, stale 4순열도 root 또는 reader 검사에서 중단되어 이 새 경로의 영속 손실은 확정하지 않았다. WeakMap을 재시작·직렬화·서버 영속의 보장으로 확대하지 않는다.

첫 원격 PR 실행 `eb43690`에서는 전체 Web·API 타입 검사와 협업 수렴 회귀가 통과했다. semantic 작업은 실제 의미·재질·필압 감사 뒤 이동 전 summary 테스트 경로 때문에 lint에서 실패했다. 실제 경로 네 곳을 교정하고 18파일 lint·summary 3개를 통과했다. 이 workflow의 Typecheck만 공식 검사와 같은 16GiB로 맞춘 것은 별도 portfolio의 확정된 12GiB OOM에 따른 예방 정렬이며 해당 semantic 단계에서 OOM이 재현된 결과는 아니다.

session goals와 morphology는 전체 516종 검사 fixture가 현재 카탈로그를 강제로 V1으로 만들면서 이전 Mixbox 재생 보호에 걸렸다. 제품의 현재 영수증 생성기를 사용하고 전체 재질 계산 검사용 noncommercial-full 프로필을 테스트에만 명시했다. 기존 516종 순회와 모든 렌더 단언은 유지하며 soak 4개가 통과했다. 제품 기본 프로필의 실제 선택 허용·차단 회귀 4개도 별도 통과했다. 제품 권리 설정·원고 자동 전환·renderer 변경은 없다. 기존 번역 2,382키에 대한 오래된 2,381 기대도 실제 실패 1개를 확인한 뒤 현재 키·언어 순서·중복 부재를 검사해 42개를 통과했다. 이 세 42개 실행은 각각 다른 검사이므로 파일·SHA와 함께 구분한다.

초기 원격 preflight는 문서 본문을 내려받지 않는 sparse checkout에서 문서 존재 단언이 실패했다. 해당 선언 검사를 기존 Git 정본 확인 패턴으로 교정하고 실제 preflight sparse 회귀를 추가했다. 오타·미추적 파일은 거절하며 기존 5 shard의 16문서·14PNG 소유와 실제 복원 단언은 유지한다. 실제 sparse의 원격 동일 Node 명령 13파일 158개와 기존 CI 배선 4파일 61개가 통과했다.

Feedback 초기 CI의 첫 페이지는 HTML 서버 응답 대기 42,721ms 뒤 기존 45초 제한에서 실패했고, API 요청·제품 단언에 도달하지 않았다. 뒤 35개는 통과했으며 바로 다음 같은 화면은 836ms였다. 산출물 지문과 synthetic merge source를 대조했고 이를 제품 결함이나 특정 optimizer의 확정 결함으로 확대하지 않는다. 테스트 전용 준비 endpoint가 기존 두 진입점의 변환·정적 import·의존성 준비를 기다리도록 보완했다. 기존 서버 준비 120초·테스트 45초·expect 10초·36검사·재시도 0·실패 gate는 유지한다. mock 8경계와 전파된 예외의 HTTP 500 유지·lint·구문 검사는 통과했다. Vite 내부에서 로그만 남기고 해결하는 optimizer 오류까지 endpoint가 모두 거절한다고 보장하지 않으며 실제 UI 성공은 기존 36개 검사와 최종 gate가 확인한다.

2026-11-05 23:52 KST, `1dafc0168d1bb8ba6870eb0472b7bfc05c0d3403`의 Feedback 4파일 36개를 처음 존재하지 않는 고유 캐시 경로에서 실제 Chromium으로 실행해 모두 통과했다(exit 0, 43.4초, 전후 HEAD 동일·clean). 원래 45초·10초·120초·재시도 0과 모든 단언을 유지했다. 최초 임시 외부 config의 작업 디렉터리 오류는 Vite·브라우저·case 실행 전 1초에 종료됐고 별도 원문을 남겼으며, 원래 저장소 cwd를 명시한 다음 실행의 36개 결과와 구분한다. 기존 공유 캐시는 삭제하지 않았다. 이 macOS cold 검증을 Linux 효과나 모든 optimizer 오류 전파의 증거로 확대하지 않는다.

2026-11-06 추가 actual room 회귀에서는 v6→v7→v6 publisher 변경 중 seq2 sync가 seq1 비동기 6패스 복원을 추월하면, seq1 본문은 stale로 적용되지 않는데 수신 요구 메모만 남아 정상 BG3D peer를 불필요하게 차단하는 현상을 재현했다. 본문·state vector·정상 v6 pending은 그대로였으며 데이터 손실·인가 우회는 재현하지 않았다. 내부 callback의 명시적 false로 적용 생략을 알려 메모를 복원하고 실제 적용은 true로 알린다. 기존 void callback과 정당한 중복 적용은 유지한다. 원래 비동기 회귀와 reader 회귀를 합친 5파일 62개가 통과했고 DB·fetch는 0이었다. 과거 250개와 겹치는 회귀이므로 합산하지 않는다.

2026-11-06 `6e6808de844e4592a374722b2db89f7ccbbf5462`는 main `5165e4fa` 대비 전체 하네스와 정상 pre-push의 Web·API 타입·구조·lint·Secretlint를 통과한 뒤 같은 SHA로 PR #2726에 반영됐다. 새 원격 실행의 성공을 뜻하지 않으며 Draft를 유지한다.

초기 `eb43690` Full Diagnostic의 Hybrid DCC 세 문구 실패를 최신 source에서 재현했다. 제품은 번역 정본의 현재 한국어를 표시하지만 검사는 과거 fallback 문구를 기대했다. 제품 변경 없이 정본과 정확히 비교하며 원본 hash·journal·undo·숨긴 객체의 실행 차단 검사는 유지했다. AI suite는 초기 안내가 존재하는지만 검사하고 네 동적 작업 완료 전에 테스트를 끝낼 수 있어 실제 결과와 버튼의 완료 상태를 기다리도록 강화했다. 별도 modal의 기존 role·label·text 조회는 해당 dialog와 콘티 tabpanel 내부로 한정했다. AI timeout과 teardown 오류는 제한된 로컬 재현에서 발생하지 않았으므로 확정 해결로 주장하지 않는다. 보완 후 해당 다섯 파일 전체 44개가 통과했고 시간 제한·재시도·제품 코드는 바꾸지 않았다.

Full Diagnostic의 두 이력 source 계약도 오래된 함수 문구를 요구해 현재 source에서 실패했다. 제품의 P1 보완을 과거 구현으로 되돌리지 않고, 전체 복원·속성 선반영 양쪽에서 같은 이력을 ref → journal → state 순으로 발행하는지 검사한다. 최초 번들 없는 frontier가 editable paint 전 동기 경로로 준비 상태에 도달하는지도 호출 관계로 확인한다. 순서 역전·다른 이력 발행·비동기 전환은 음성 대조에서 거절하며, 두 파일 11개가 통과했다. 기존 실제 경합·이력 42개와 source 계약 검사의 범위는 구분한다.

브러시 초안의 원문 백업 쓰기는 실제 미등록 권위로 검출됐으며 오탐으로 제외하지 않았다. `studio-current-boundaries.md`의 명시적 호환 import 범위에 따라 DraftGuard의 정확한 파일·키 표현식·쓰기 1회만 필수 원문 백업으로 검토 등록했다. 이를 선택적 UI 상태로 분류하거나 scanner·일반 원고 저장을 허용하지 않는다. 다른 owner·key·payload 및 추가 project 쓰기는 음성 대조에서 거절한다. 기존 6개에 namespace·기존 충돌 사본 보존·원문 재해석·readback 불일치·101개 백업 상한의 무삭제·무덮어쓰기를 보강해 guard 9개, 실제 전체 권위 scan·음성 경계 11개, 두 파일 20개가 통과했다. 제품 저장 코드·기존 데이터·자동 이주 정책 변경은 없다.
모바일 초기 CI는 작업 메뉴 안의 숨겨진 브러시 설정 버튼을 기다리다가 실패했다. 실제 도크를 마운트한 결정적 회귀에서 늦은 안내의 정상 닫기 pointerdown이 기존 outside-pointer 효과로 메뉴를 접고, 종전 검사기는 메뉴를 다시 열지 못하는 경합을 재현했다. 안내 처리 뒤 매 클릭 시도에 필요한 메뉴를 정상 토글로 다시 열며 같은 60초 예산을 사용한다. 계속 안내가 나타나는 음성 사례는 정상 설정 클릭 0·설정 열기 0·정확한 60,000ms 실패를 유지했다. 도크의 실제 상태/효과와 대기 adapter를 연결한 unit 증거이며 실제 CI에서 닫힌 안내의 종류나 Chromium 인과를 확정한 결과는 아니다. 기존 거대 verifier에는 줄을 더하지 않고 메뉴 준비 함수만 작은 helper로 추출해 같은 실제 함수를 회귀에서 호출한다. 도크 54개·기존 readiness 25개, 합계 두 파일 79개가 통과했다. 제품 UI·권한·44px 기준·대기 상한·강제 클릭은 변경하지 않는다.

판상 흑연은 초기 Linux UI에서 9.49 CSS px 두 점 획이 정상 저장됐지만 최대 채널 차이 3으로 기존 가시성 기준 4에 미달했다. 원본 UUID와 control UUID의 독립 실제 Canvas도 같은 실패를 재현했으며 완전 무픽셀이나 입력 손실로 단정하지 않는다. 기존 renderer를 바꾸지 않고 새 선택 catalogue 행의 flow만 0.46→0.57로 조정한다. 새 획과 사용자 명시 기본값 복원의 결과는 더 진해지며 flow +23.913%, 순수 8UUID×5위치의 energy +24.0~47.43%라는 영향을 적용 전에 사용자 검토안에 공개했다. 무영향·동등 외관인 변경으로 설명하지 않는다.

실제 catalogue의 정확한 한 행만 바꾼 격리 overlay에서 공개 선택이 15px·opacity 0.82·flow 0.57·기존 seed임을 확인했다. 원본·control·40조합 중 최소 energy 입력 세 개는 최대 차이 4로 통과했다. 저장된 0.46 snapshot 두 개와 snapshot 없는 legacy의 전체 RGBA는 원본 세 해시와 완전히 같았다. 최종 6draw 진단은 exit 0·console/page 오류 0이었다. 이전 진단의 자체 HMR 차단 오류 exit 1은 별도 보존했고, 정확한 자체 HMR만 허용한 후속의 여섯 픽셀 해시가 전부 같음을 확인했다. 이 제한 검증을 Linux·다른 필압/색상·장획·모든 seed의 보증으로 확대하지 않는다.

저장 snapshot·사용자 flow를 재생 시 우선하며, snapshot 없는 원고와 구 slot은 기존 core replay-safe fallback을 사용한다. 활성 획도 시작 snapshot을 사용한다. catalogue flow에 의존하지 않는 tip atlas·renderer·필압 곡선·굵기·opacity·저장 형식·권한은 변경하지 않는다. 실제 source 적용 후 공개 선택의 세 UUID 경계·원래 0.46 및 사용자 0.21 보존과 기존 slot·재생·atlas 회귀 네 파일 167개가 통과했다. 전체 새 head의 hosted 품질·CI는 별도 확인한다. catalogue 행을 되돌려도 이미 저장된 각 획의 snapshot을 다시 쓰거나 변환하지 않는다.
