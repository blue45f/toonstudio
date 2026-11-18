# NestJS 검증 보드 어드민 통합 검증 기록

- 문서 상태: **current — 개발 브랜치에서 실행한 검증**, 운영 적용은 별도 승인 대기.
- 검증일: 2026-11-18.
- 시작 기준 main: `5ea952cd44b31dd1074ab96ab251e97f84932128`.
- 후속 확인 main: `2cfbfa55056732f67e01f0d02b648dbae35498cb`.
- 병합 전 동기화 main: `45dbe47d7cc86b238054df608d5bff5757e8afab`.
- 후속 main 변경은 3D·Character Lab 기능이며 API·Admin·contracts·lockfile은 동일하다.

## 확인한 결과

아래 검사는 임시 개발 checkout과 별도 PostgreSQL 17.11에서 실행했다. 운영 계정·
운영 DB를 사용하지 않았으며 운영 migration·배포는 실행하지 않았다. 테스트 사이에
같은 사례가 포함될 수 있으므로 표의 수치를 하나의 총합으로 합산하지 않는다.

| 검사 | 실행 결과와 범위 |
| --- | --- |
| 공유 보드 계약 | 43개 통과. 원본 Sites·네이티브 JSON, 참조·날짜·URL·완료 증거·승인 상태·크기 한도 |
| Admin 단위 테스트 | 19개 파일, 152개 통과. 기존 기능과 새 저장·권한·충돌·JSON·초안 보존 |
| Admin 타입 검사·독립 빌드 | 통과 |
| API 전체 TypeScript | 통과 |
| API·ACL·migration·readiness 관련 테스트 | 10개 파일, 229개 통과 |
| 관리자 스키마 정본 통합 후 회귀 | 영향 7개 파일 204개 및 실제 PostgreSQL 관리자 스키마 6개 통과 |
| 새 보드의 실제 PostgreSQL 통합 | 9개 통과. CAS·재전송·권한 회수·원자적 감사 이력·재적용·최소 권한·저장소 오류 |
| 기존 어댑터·socket auth·auth ticket 단위 경계 | 변경하지 않은 3개 파일, 54개 통과. 실제 API 시작·PG 전파·브라우저 연결 증거와 구분 |
| Character Lab 관련 회귀 | 최초 140개, 최신 main 반영 후 root/app 설정에서 각각 동일한 146개 통과. 타입 검사·ESLint 통과 |
| 필수 CI 실행 배선 | 계약 58개 및 DB 없는 정적 shard의 단위·HTTP·공유 계약 64개 통과. CI 모드 실제 PostgreSQL 9개 통과 |
| 리뷰 정책 변경 전 | review-race 67개 중 62 통과, 5 실패 |
| 리뷰 정책 fixture 수정 후 | review-race 68개와 preview-producer 54개, 모두 통과 |
| 공식 리뷰 DB 목록 중 16개 스위트 | 315개 통과, 실패 0. 기존 조건부 브라우저 검사 1개 미실행 |

Nest HTTP 검사는 실제 Nest와 운영 미들웨어 순서를 사용하되 토큰 검증·세션 조회를
모의 처리한다. 인증 없는 사용자 헤더, 만료·회수 세션, CSRF 오류, 운영자 저장 거부,
잘못된 입력·초과 크기를 확인했으며 실제 운영 서명·로그인 성공을 뜻하지 않는다.

PostgreSQL 통합은 실제 서버와 SQL 제약을 사용했다. 서버마다 독립된 임시 데이터
디렉터리·DB를 만들고 검사를 마친 뒤 종료했다. 문서 저장과 감사 INSERT 사이의
실패 시 원복, 최초 저장을 포함한 두 요청의 경쟁, 같은 요청의 중복 재전송을 확인했다.

## 기존 main 실패의 원인과 수정

기준 main의 [CI44231435766](https://github.com/blue45f/toonstudio/actions/runs/44231435766)과
후속 main의 [CI44235319729](https://github.com/blue45f/toonstudio/actions/runs/44235319729)는
각각의 소스·시각에 대한 증거다. 개발 브랜치의 통과를 해당 run의 성공으로 바꾸지 않는다.

Character Lab의 세 파일이 기존 크기 한도를 넘었고 `toon-reference.ts`에 사용하지
않는 초기 할당이 있었다. 화면 helper·HUD·렌더 상수를 응집된 모듈로 분리하고
모든 분기에서 재할당되는 초기값만 제거했다. 한도·래칫 기준과 검사 명령은 유지했다.

리뷰 DB의 5개 실패는 정책 fixture가 요청자와 승인자를 같은 소유자로 만들고 다른
지정 검토자까지 추가하여, 정책 정족수 검사보다 자기 승인 금지에 먼저 걸린 것이었다.
정책 fixture에서만 편집자를 요청자로, 소유자와 viewer를 투표자로 분리했다.
별도로 소유자의 자기 승인도 거부되고 리뷰가 open으로 남는 검사를 추가했다.
실제 인증·인가·정책 로직은 변경하지 않았다.

후속 Character Lab main의 manga FX 추가로 뷰포트가 다시 파일 한도를 넘어서,
기존 엔진·오류·드로잉 상태 표시를 독립 컴포넌트로 분리했다. 신규 manga FX와
표시 위치를 보존했고 페인트 설정 변경이 즉시 반영되는 회귀도 추가했다.

새 보드의 DB 테스트는 필수 `database` 작업에 연결했다. DB 없는 정적 shard는
단위·HTTP·공유 입력·ACL 계약을 실행한다. 각 테스트가 한 경로에서 실행되도록
필수 manifest와 소유권 계약을 확인했으며, CI에서 DB 주소가 누락되면 즉시 실패한다.

## 아직 완료로 주장하지 않는 범위

- 로컬 `pnpm harness:verify`의 린트·Secretlint·아키텍처·문서·경계·크기 검사는
  통과했지만 전체 Web 타입 검사 worker의 프로그램 목록 생성에서 종료되었다.
  별도 4GB heap 진단에서는 메모리 부족을 확인했다. 전체 Web 타입 검사와 최종
  `core`·`verify` 통과는 공식 PR CI에서 확인하며 로컬 harness 전체 성공으로 기록하지 않는다.
- 로컬 Playwright는 Chromium 실행 전 소켓 제한으로 종료되어 브라우저 통과로 기록하지 않았다.
  새 7개 스펙은 공식 Admin Playwright 설정에 등록했다. 기존 CI의 Chromium 설치 및
  `pnpm test:admin:e2e`에서 실제 실행 결과를 확인해야 한다.
- 리뷰 backup 스위트는 로컬 `pg_dump`·`pg_restore` 부재로 실행하지 않았다. 공식 CI의
  PostgreSQL client 설치 후 실행하는 기존 검사를 유지했다.
- 리뷰 16개 스위트의 조건부 브라우저 검사 1개는 `TOONSTUDIO_RBAC_BROWSER_ORIGIN`
  미설정으로 기존 조건에 따라 실행되지 않았다. 새 skip을 추가하지 않았다.
- 보드에 담긴 16개 최소 시나리오 전체를 실행한 것은 아니다. 실제 API 시작, 운영 인증,
  Socket.IO 재연결·이벤트 순서·누락·중복, 다중 노드 PG 전달, payload·queue 제한은
  각 시나리오의 실제 환경과 증거를 확인할 때까지 미확인으로 유지한다.

운영 반영 전제와 실패·복구 경로는
[관리자 NestJS 호환성 검증 보드](../operations/admin-nestjs-quality-board.md)를 따른다.
