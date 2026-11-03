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

테스트 삭제·새 제외·권한 또는 출처 제한 완화·시간 제한 확대·러너 변경은 없다.
실제 미디어 연결의 클라우드 UDP 제약과 기기 저장/클라우드 저장 검증 구분도 유지한다.
