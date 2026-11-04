# 가상 스튜디오 후속 변경의 focused 회귀 검증

2026-11-03 기준 PR #2674의 GitHub 실행 41729018125는 571개 파일 중 8개 파일에서
11개 시험이 실패했고 7,323개 시험은 통과했다. 기존 실행은 재실행하지 않았다.

## 재현과 수정 범위

- CC0 표면 시험은 82개 baseColor/preview와 320개 2K PBR 실물 파일을 읽는데 focused
  checkout은 manifest만 포함했다. 클라우드 전체 작업공간에서는 통과했다. PR checkout에
  해당 CC0 디렉터리를 포함하고 기존 marketplace CC0 시험 제외도 제거했다. 수동 smoke는
  기존 manifest 범위를 유지한다. 실제 Git sparse fixture로 PR·수동 입력 경계를 검증한다.
- 프레임 계측 시험은 기본 해상도가 자동 하락한다고 기대했지만 governor는 명시적 adaptive
  요청이 없으면 해상도를 보존한다. 기본 배율 1의 단일 통지와 과부하 계측을 함께 검사한다.
- 장면 GLB 출처 시험은 이전 mutable catalog URL만 흉내 냈다. 현재 빌드 고정 release의
  catalog·index·완료 요청과 실제 SHA/바이트를 계산한 합성 응답으로 준비값을 갱신했다.
  실제 loader·validator를 실행하며 service-only 다운로드 거부와 쓰기 없음은 유지한다.
- PNG 통과 간 크기 불일치 시험은 width만 바꿔서 더 앞선 IHDR 검증에서 거부됐다. 서로 다른
  실제 크기의 유효 PNG 두 개를 제공해 원래 검사하려던 pass shape 거부까지 도달한다.
- Hybrid DCC에는 상태 영역이 여러 개 있다. 실제 저장 영수증의 role과 고유 데이터 속성으로
  범위를 좁히고 저장 상태·sequence·source hash·document state hash 검사를 유지한다.
- 저장 outbox 시험은 현재 서버 저장 기록 표시 문구로 버튼을 찾는다. 같은 저장 promise가
  진행 중일 때 연속 클릭이 한 번만 전송되는 검사는 유지한다.
- 제작 검수 라우트 시험에는 인증 완료 provider가 없어 기본 ready=false에 머물렀다.
  실제 저장·재시도·계정 해제 동작을 검증하도록 인증 완료 상태와 세션을 준비하고 정리한다.
- 문서 접근 hook의 scope 시험은 새 scoped-write 자식 hook까지 실제로 호출해 불완전한
  mutation mock을 WeakMap 키로 넘겼다. 기존 자식 hook 분리 방식에 맞추고 scoped-write에도
  actorId/workId가 정확히 전달되는 검사를 추가했다. 권한 엔진 자체를 대체하는 수정은 아니다.

## 확인한 결과

- 실패한 8개 파일을 함께 실행: 수정 전 7실패·1통과, 10실패·61통과.
  수정 후 8개 파일·71개 시험 모두 통과. CC0 누락 한 건은 GitHub sparse 입력 차이였다.
- CI 계약·과거 기준 SHA·CC0 sparse 입력 Node 시험 30개 통과.
- CI와 같은 2 worker·8GB 힙의 전체 related 검사: 571개 파일·7,334개 시험 모두 통과.
- 새 커밋의 GitHub 필수 CI 결과는 PR 본문에서 별도로 추적한다.

이 절까지의 수정에는 테스트 삭제·새 제외·권한 또는 출처 제한 완화·시간 제한 확대·러너 변경이 없다.
실제 미디어 연결의 클라우드 UDP 제약과 기기 저장/클라우드 저장 검증 구분도 유지한다.

## 이동한 검사 파일의 실행 경로

새 협업 문서 CI 41735533279는 188개 시험 통과 후 lint가 이동 전
`creator/StudioDraftOperationSyncAssistant.test.tsx`를 찾아 exit 2로 중단됐다.
현재 파일은 `creator/live/`에 있다. test와 lint 모두 실제 파일로 연결한다.

이번 변경이 실행하는 workflow들의 실제 run 입력을 추가 조사해 5개 workflow에서
12개 이동 전 경로를 확인했다. CC0 장면 선택, 문서 저장 범위·프로젝트 읽기,
이어서 작업하기와 마감 품질 시험을 각각 현재 scene3d/live/export/lettering/
studio-cuttoon-editor 경로로 연결한다. Vitest가 여러 입력 중 없는 파일만 조용히
건너뛰는 경우에도 원래 시험이 실제로 수집되게 한다. 마감 품질의 이동한 glob도
현재 경로에 연결하며 root에 남은 통합 시험 범위는 유지한다.

해당 5개 workflow의 실제 검사 명령에 있는 모든 소스·시험 입력이 존재하는지를
Node·Vitest 양쪽에서 검사하는 계약을 추가한다. 검사 제외·삭제·시간 또는 러너 변경은 없다.

이 workflow들의 실제 시험 89개 파일을 함께 실행해 1,712개 통과와 공개 화면 계약
3개 실패를 확인했다. 사이트맵에 정식 `/market/orders` 목적지를 추가하고 공개 구현
수치를 실제 worker 72개·client 64개와 2026-11-03 확인일로 갱신했다. `/marketplace`는
실제 `/market` 별칭이므로 양성 검사로 유지하고 `/marketplaces`와 `/learning`의
잘못된 부분 접두사는 계속 거부한다. 해당 3개 파일·58개 시험은 수정 후 통과했다.

수정 후 5개 workflow가 실행하는 89개 파일·1,715개 시험이 모두 통과했다.
실제 협업 lint 명령과 실행 입력·기존 CI 계약 Node 시험 33개도 통과했다.

## Scene3D 전체 타입 검사의 메모리 경계

Scene3D 실행 41735533137의 job 126263665949는 기능 시험(예: specialist 208개,
in-place 108개)을 통과한 뒤 직접 `tsc -p tsconfig.json --noEmit`을 실행했다.
이 경로는 job의 12GB 힙을 그대로 사용해 전체 타입 그래프에서 메모리가 부족했다.

Core·마감·동기화 검사와 같은 저장소 표준 `pnpm run typecheck`를 사용한다.
이 명령은 workspace 링크 검증, 고정된 웹 전체 타입 검사와 API 검사로 구성되며
명시적인 16GB Node 힙을 사용한다. 같은 16GB 클라우드에서 이 표준 명령을 포함한
정상 pre-push가 반복 통과했으며, 기존 20분 제한·러너·타입 범위·strict/noEmit 정책은
바꾸지 않는다. 명령을 하나로 통일하고 API 검사도 수행하는 계약을 추가한다.

## 공개 여정의 등록된 별칭

새 Public site candidate 실행 41740282668의 job 126279779075는 8개 파일 중
`public-site-pathways.test.ts`의 `/marketplace` 한 건에서 실패했고 72개는 통과했다.
앞선 destination 시험과 마찬가지로 실제 등록된 `/market` 별칭은 resources 여정으로
분류해야 한다. 별칭의 양성 검사를 추가하고 `/marketplaces` 음성 검사로 잘못된 부분
접두사 거부를 유지한다. 저장소의 같은 별칭 시험들을 검색해 이 오래된 기대값이 남은
한 곳임을 확인했다. 실제 라우트와 분류 구현은 변경하지 않는다.
수정 전 1실패·26통과를 재현했고, 수정 후 실제 후보 검사와 별칭·라우트 계약
11개 파일·125개 시험이 모두 통과했다.

## macOS 동기화와 전체 타입 검사의 분리

실행 41744412483의 job 126293693097은 macOS에서 실제 동기화·재접속 267개 시험과
lint를 통과했지만 전체 웹 타입 검사가 19분 28초 동안 끝나지 않아 기존 25분 한도에
취소됐다. 기존 실패 실행은 재실행하지 않는다.

macOS 시험·lint·라이프사이클 검사와 25분 한도는 그대로 유지한다. 전체 타입 검사는
Core와 같은 입력·표준 명령·25분 한도의 별도 Ubuntu 작업에서 수행한다. 기존
`collaboration-sync` 상태는 두 작업을 모두 필요로 하는 집계로 유지하며 어느 쪽이라도
실패·취소·skip이면 성공하지 않는다. 실제 Bash 집계의 상태 조합 25개로 이를 검사한다.

추가한 실행 플랫폼은 공개 저장소에서 무료로 제공되는 표준 `ubuntu-24.04`(16GB)다.
유료 larger runner·계정 설정·시간 제한·타입 범위는 바꾸지 않는다. 플랫폼별 검사를
줄이거나 이미 통과했다고 표시하는 대신 전체 검사를 별도 작업에서 실제로 끝낸다.
근거: [GitHub 표준 러너 사양](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

기존 integration CI 정책 시험은 이미 변경된 표준 build 명령의 16GB·incremental false를
이전 12GB 명령으로 기대해 실패했다. 제품 build 명령은 바꾸지 않고 실제 명령과 같은
계약으로 맞추며 noEmit·bundle-only 분리·원래 전체 검사 범위를 유지한다.
분리·집계 계약과 기존 CI Node 시험 31개, 실제 동기화 시험과 integration 정책
10개 파일·321개 시험이 모두 통과했다. 새 GitHub 실행 결과는 PR에서 별도 확인한다.
