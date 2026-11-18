# 관리자 NestJS 호환성 검증 보드

- 문서 상태: **current — 소스 구현**, **migration — 운영 DB 적용·배포 승인 대기**.
- 작성일: 2026-11-18.
- 대상 저장소: `blue45f/toonstudio`.
- 화면: `/admin/platform/quality/?view=nestjs`.

## 목적과 현재 범위

Sites에 만든 NestJS·API·실시간 협업 검증 기록을 ToonStudio의 독립 Admin 앱과
Nest API 안에서 관리한다. 기존 CI·QA 보드의 5상태·브라우저 저장 기록과 별도로,
NestJS 보드는 6상태와 서버 PostgreSQL 문서를 사용한다.

기본 문서에는 원본의 작업 총 28개가 있으며 그중 16개가 최소 검증 시나리오다. 최초 조회는
문서가 아직 없는 경우에만 기본 문서를 보여준다. 저장소 연결 실패, 테이블 누락,
손상된 저장 문서는 503으로 처리하며 기본 자료나 브라우저 저장 성공으로 대체하지 않는다.

이 보드는 기록 도구다. 코드 변경, CI 실행, PR 병합, 운영 배포, 외부 계정 연결을
실행하는 서버 기능이나 화면 버튼은 없다. 필요한 작업은 승인 대기 항목으로 기록한다.
소스 병합과 운영 환경 반영은 별도 단계다.

## 출처와 확인 범위

기본 문서의 main 기준은 `45dbe47d7cc86b238054df608d5bff5757e8afab`이며,
확인 시각은 **2026-11-18 13:39:54 KST**다. 이는 수동 관측 스냅샷이며 GitHub를
자동 동기화하는 값이 아니다. 화면은 24시간 이상 지난 관측에 재확인을 안내한다.

- 기준 PR: [2801](https://github.com/blue45f/toonstudio/pull/2801),
  [2798](https://github.com/blue45f/toonstudio/pull/2798),
  [2800](https://github.com/blue45f/toonstudio/pull/2800).
- 기준 main CI: [44237128814](https://github.com/blue45f/toonstudio/actions/runs/44237128814).
- PostgreSQL Socket.IO 어댑터:
  [고정 커밋의 구현](https://github.com/blue45f/toonstudio/blob/45dbe47d7cc86b238054df608d5bff5757e8afab/apps/api/src/realtime/studio-postgres-io.adapter.ts).

위 main에서 5개 핵심 Nest 패키지의 잠금 버전은 12.5.0이고 세 기준 PR은 이미
병합되어 있다. 해결된 버전 혼재를 현재의 미해결 장애로 다시 표시하지 않는다.
관측 시 최신 CI는 pending이며 최종 결론은 미확인이다. 앞선 main2cfbfa5의
개별 빌드 성공과 린트·파일 크기·별도 리뷰 DB 실패는 역사 자료로만 보존하고,
수정 중인 브랜치의 결과를 해당 main CI의 결과처럼 덮어쓰지 않는다.

`nestjs-zod 5.6.0`의 공개 peer 범위가 NestJS 12를 포함하지 않는 사실은
[해당 버전의 패키지 메타데이터](https://registry.npmjs.org/nestjs-zod/5.6.0)를
근거로 검토 항목에 기록한다. 이 선언만으로 실제 런타임 실패를 확정하지 않는다.
`WsAdapter`에 대한 릴리스 설명과 현재 `IoAdapter` 상속·`createIOServer` 재정의의
정적 경로도 별도 판단한다. 실제 재연결, 이벤트 순서·누락·중복, 큰 payload와
다중 인스턴스 동작은 해당 환경의 실행 증거가 있어야 완료로 기록한다.

## 화면과 상태

요약, 버전·PR·CI, 실행 경로, 작업 목록, 최소 시나리오, 승인 대기, 증거·이력 화면을 제공한다.
완료·보관 항목은 기본 작업 목록에서 제외하고 필요할 때 표시한다.

| 관리 상태 | 의미 |
| --- | --- |
| 미확인 | 검증 또는 근거를 아직 확인하지 못함 |
| 진행 중 | 담당자가 확인·재현 작업을 수행 중 |
| 검토 필요 | 정적 위험, 테스트 결과 또는 호환성 근거의 추가 판단 필요 |
| 승인 대기 | 코드 변경·후속 PR·배포 등 승인할 작업의 메모 |
| 검증 완료 | 검증일·결과·이후 증거·출처를 갖춘 범위의 완료 |
| main 머지 완료 | 관련 PR과 커밋 SHA 근거를 갖춘 병합 기록 |

작업에는 현재 상태와 별개로 범위, 결과, 환경, 검증일, 다음 조치, 실행 단계,
통과 조건, 전후 증거, PR·커밋·CI·릴리스·코드 링크를 저장한다. 모든 완료가
운영 검증 완료를 의미하지 않으며 결과의 범위와 환경을 함께 읽어야 한다.

## 인증과 저장 계약

`CiQualityAccess`는 기존 `GET /api/admin/me`로 신원을 확인한 뒤 화면을 연다.
서버는 글로벌 세션 인증과 CSRF 경계를 그대로 거친다. 브라우저가 보낸 임의 사용자
헤더를 신원으로 인정하지 않는다. 실제 사용자 역할은 저장 트랜잭션 안에서 다시 읽는다.

| 경계 | 현재 계약 |
| --- | --- |
| 조회 | 활성 `admin` 또는 `operator` |
| 저장 | 활성 `admin`만 허용 |
| 문서 | `schemaVersion: 1`, 저장소 `blue45f/toonstudio` 고정 |
| HTTP | `GET`·`POST /api/admin/quality/nestjs`, `Cache-Control: no-store` |
| 이력 상세 | `GET /api/admin/quality/nestjs/history/:revision` |
| 동시 수정 | `expectedRevision` 비교 및 같은 문서 행의 잠금 |
| 재전송 | 사용자·mutation ID와 요청 digest로 중복 저장 방지 |
| 감사 기록 | 변경 사유·행위자·시각·변경 항목·전후 문서, 문서 저장과 동일 트랜잭션 |
| 수정 충돌 | 409, 초안 보존·JSON 내보내기·명시적 폐기 후 재조회 |
| 권한 상실 | 401/403, 보드·이전 계정의 기록을 닫음 |
| 저장소 이상 | 503, 성공 처리·자동 초기화 없음 |

같은 계정의 권한을 재확인하는 동안 화면과 요청을 중지하되 미저장 초안은 유지한다.
계정이 바뀌거나 권한을 거부당하면 기존 계정의 화면을 제거한다. 변경된 작업의
revision과 수정 시각은 서버가 정하며 외부 JSON의 값을 감사 정보로 신뢰하지 않는다.

## JSON 이전과 변경 이력

공유 계약은 `packages/contracts/src/admin-nestjs-quality*.ts`가 소유하며 Admin과
API가 각자의 애플리케이션 source를 교차 import하지 않는다. 입력 검증은 문서 크기,
배열·문자열 한도, ID·참조, 날짜, 완료 증거, 링크 URL, 승인 상태를 확인한다.

원본 Sites의 내보내기와 새 문서 형식을 모두 가져올 수 있다. 화면은 먼저 전체 내용을
검증하고 변경·제거 항목을 보여준 다음 확인을 받아 서버에 저장한다. 기존 승인 필요
항목을 삭제하거나 승인 요구를 해제하는 가져오기는 서버도 거부한다.

내보내기는 **현재 문서 전체와 최근 서버 변경 이력 요약**이다. 각 작업의 전후 증거는
포함하지만 모든 과거 문서의 감사 사본을 일괄 내보내는 기능은 아니다. 개별 revision의
서버 전후 문서는 별도 이력 상세 API로 조회한다. 가져온 출처 이력은 `sourceHistory`에
보존하며 서버가 직접 기록한 행위자·변경 이력과 구분한다. Sites의 ChatGPT 사용자 ID를
ToonStudio `user.id`로 매핑하지 않으며, 가져오기 행위자는 현재 로그인한 관리자다.

## 운영 반영 절차 — 승인 대기

운영 반영 승인 주체는 ToonStudio 배포·DB 관리자다. 이 문서와 코드 병합은 운영
명령 실행 승인이 아니다. 승인 시 정확한 배포 커밋, migration 대상 DB와 실제 DB 역할을
먼저 확정한다. 현행 인프라의 single-owner 경로와 제한된 runtime 역할을 쓰는 절차를
같다고 가정하지 않는다. 새 ACL capability 검사는 테이블 소유자 역할을 거부하므로,
인프라 정본을 확인하고 역할 분리 또는 승인된 single-owner 반영 경로를 먼저 검토해야 한다.
운영 환경에서 어느 경로로 적용할지는 아직 확인하지 않았다.

1. 운영 데이터 백업·복구 절차와 배포 커밋의 CI 결과를 확인한다.
2. 기존 checksum manifest 기반 migration 절차로
   `0122_admin_nestjs_quality.sql`을 적용한다. 기존 migration 순서와 ledger 검증을 유지한다.
3. 기존 migration runner가 새 테이블의 runtime ACL을 적용하고 capability를 확인했는지 확인한다.
4. 해당 커밋의 API와 Admin 산출물을 배포하고 관리자·운영자·일반 사용자 권한 경계를 확인한다.
5. 별도 검증 기록으로 저장·재조회, 다른 세션의 동시 수정 409, 이력 전후 문서를 확인한다.

새 테이블은 `admin_nestjs_quality_board`, `admin_nestjs_quality_history`다. migration은
기존 문서를 덮어쓰지 않고 재실행할 수 있으며, 요청 처리 중에는 DDL을 실행하지 않는다.
이력은 INSERT만 허용하고 UPDATE·DELETE를 트리거와 runtime ACL로 금지한다.
보드는 지정된 문서·revision·수정 정보 열만 수정할 수 있다.

실패하면 새 기능의 노출과 배포를 중단하고 기존 문서·이력을 보존한다. 이전 앱 버전으로
돌리는 경우 새 테이블을 유지하는 것이 기본 복구 경로다. 이력 삭제나 테이블 삭제는
자동 rollback에 포함하지 않으며, 필요할 때 별도 데이터 보존 판단과 승인을 받는다.
새 API는 migration이 없는 DB를 503으로 처리하므로 스키마 적용 전에 기능을 열지 않는다.

## 검증 경로

저장소 루트에서 Node 24와 저장소가 선언한 pnpm 버전을 사용한다.

```sh
pnpm harness:verify
pnpm typecheck:admin
pnpm test:admin
pnpm build:admin
pnpm test:admin:e2e
```

단위 테스트는 공유 계약, 기존 어드민 기능, 저장 API의 오류·충돌·인증·권한을 검증한다.
`admin-nestjs-quality.http.test.ts`는 실제 Nest HTTP 경계와 세션·CSRF 미들웨어를
검증한다. 이 HTTP 테스트의 토큰 검증·세션 조회는 모의 처리하므로 실제 운영의 서명과
계정 상태를 확인한 증거는 아니다. `admin-nestjs-quality.integration.test.ts`는 명시적으로 설정한 임시
PostgreSQL에서 최초·후속 CAS, 재전송, 권한 회수, 감사 트랜잭션, migration 재적용,
runtime 최소 권한과 손상된 저장소를 검증한다. 운영 DSN을 테스트에 사용하지 않는다.

브라우저 검사는 합성 관리자·보드 API 응답으로 저장·재열기, 읽기 전용, 403·409,
JSON 왕복과 390px 키보드 흐름을 검증한다. 이 결과를 실제 운영 인증·운영 DB·
Socket.IO 재현 성공으로 확대하지 않는다. 실행 결과와 실행하지 못한 검사는 PR에
구분해서 기록하며 공식 CI를 최종 병합 판단에 사용한다.
