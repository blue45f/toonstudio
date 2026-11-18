# 관리자 작업 보드 통합과 자료 접근

상태: **current — 저장소 구현 기준**, 운영 반영은 **migration** 단계다. 작성일: 2026-11-18.

## 화면과 기록의 정본

`/admin/platform/operations`에서 독립 관리자 앱의 `/admin/workspace/`로 이동한다.
통합 작업실은 업무별 보드 연결, 교차 작업의 검토 기록, CI·배포 증거와 중복 연결 확인을 담당한다.
전문 업무의 상세 상태를 또 하나의 편집 가능한 보드로 복제하지 않는다.

| 업무 | 정본 화면 | 저장과 접근 |
| --- | --- | --- |
| CI·QA | `/admin/platform/quality/` | 기존 관리자별 브라우저 로컬 저장·JSON 내보내기 유지 |
| AI·무료 운영 | `/admin/platform/ai-operations/` | 전문 보드의 서버 저장과 권한 검사 |
| 의존성·회귀 | `/admin/platform/quality/?view=dependency-review` | 기존 CI·QA의 의존성 탭, 관리자별 로컬 기록 |
| NestJS·협업 | `/admin/platform/quality/?view=nestjs` | 전문 보드의 서버 공동 저장·revision |
| 클라우드 작업 | `/admin/platform/quality/?view=cloud-work` | 관리자 개인별 서버 저장 |
| 사업계획·제출 | `/admin/growth/business-plan/` | 비공개 정본, 소유자와 명시적으로 허용된 계정 |
| 교차 작업 검토 | `/admin/workspace/`의 통합 검토 | 운영 범위의 서버 공동 저장 |

이전 Sites 자료는 참조 기록과 원문으로 보존한다. 사업계획 본문·인용·멘토 요청·제출 후보·이력은
비공개 이전 자료 보관함에만 보관하며, 현재 제출 문서의 편집은 전문 사업계획서 보드에서 진행한다.
두 보드의 접근 권한은 별개이며, 한쪽의 허용이 다른 쪽의 접근을 부여하지 않는다.

## 증거의 현재성과 승인

공통 계약은 `packages/contracts/src/admin-workspace/evidence.ts`와 `change-identity.ts`다.
기존 CI·QA의 v1 데이터와 브라우저 저장 계약은 변경하지 않는다.

- CI는 저장소·run·attempt·event·workflow·job·shard·검증 범위·실제 테스트 SHA를 보존한다.
  PR head/base와 테스트한 merge SHA를 구분한다. 동일 범위의 더 최신 실패나 진행 중 재실행이 있으면
  이전 성공을 현재 성공으로 계산하지 않는다. 같은 회차의 상충한 최종 결과는 재확인이 필요하다.
- main 기준에는 저장소·SHA·관측 시각·근거 주소가 필요하다. 기본 main 관측 기한은 1시간,
  CI·배포 증거는 24시간이다. 이는 보드의 검토 기준이며 서비스 제공자의 유효기간 보증이 아니다.
- 배포는 이미지 digest·소스 SHA, 실제 적용 SHA·시각, 대상 환경·origin, 원점 준비와 스모크를
  별개로 확인한다. 이미지 생성만으로 배포 완료가 되지 않으며 staging 결과가 production을 증명하지 않는다.
- 문서 증거는 문서 ID·버전·내용 해시와 검토 범위에 연결한다. 검증 시각과 수집 시각을 분리한다.
  가져오기 시각은 이전 CI 완료일이나 문서 검증일을 갱신하지 않는다.
- 업무·PR·CI·배포·승인 상태는 독립적이다. 성공 증거가 승인을 생성하지 않는다.
  승인 기록에는 주체·시각·범위·대상·근거가 필요하며, 보드가 외부 실행을 수행하지 않는다.

UI의 “저장된 관측 기준 유효”는 사용자가 연결한 증거에 대한 판정이다. GitHub나 배포 서비스를
자동 조회했다는 의미가 아니다. CI 재실행, PR 생성·병합, 배포, 계정 변경, 유료 전환 버튼은 제공하지 않는다.

## 중복과 이관

정확한 GitHub 저장소와 PR 번호, 원본 보드와 항목 ID를 안정적 식별자로 사용한다.
명시적 Sites project ID가 없는 이전 자료는 내부 legacy namespace로 구분하고 실제 Sites ID로 추측하지 않는다.
JSON 속성 순서를 바꿔도 같은 원본 묶음의 digest는 같다. 화면 ID가 바뀌어도 같은 원본이면
현재 편집을 보존하고 원문 변경을 별도 검토한다. 원본 참조는 최초 연결 후 바꿀 수 없다.

같은 PR·원본은 정확한 참조 중복이며, 수동 changeKey 일치는 검토할 후보다. 제목만으로 작업을 합치지 않는다.
`closed-unmerged` PR은 동등한 변경이 main에 있어도 병합 상태로 바뀌지 않는다.
동등 변경·대체 PR 관계에는 원본 SHA와 대상 SHA, 실제 비교 근거·관측 시각이 필요하다.
다른 저장소나 Sites 프로젝트의 같은 번호·항목 ID는 별도 기록으로 유지한다.

## 서버에서 강제하는 비공개 경계

통합 작업실 API는 `operations`와 `business` 범위로 읽기·저장·내보내기를 구분한다.
운영 응답에는 사업 기록·문서·인용·멘토·점검·제출 이력·원문 묶음·마감 설정을 포함하지 않는다.
운영 항목의 `origin.raw`에도 비공개 내용이 섞일 수 있으므로 정형 참조만 남긴다.
각 범위의 revision·갱신 시각도 분리해 비공개 편집 횟수와 시각을 운영 응답으로 알리지 않는다.

서버는 같은 트랜잭션에서 활성 계정과 소유자·grant를 확인한다. 역할 이름이 admin이라는 이유만으로
사업 자료를 반환하지 않는다. 읽기·편집·내보내기를 따로 허용하며 소유자만 허용 계정을 관리한다.
빈 보관함은 관리자가 명시적으로 자신의 소유권을 지정할 수 있다. 소유자가 없는 기존 자료는
마지막 편집자를 소유자로 추측하지 않고 접근을 거부한다.

scope별 CAS 저장은 다른 범위의 자료와 숨긴 원문 연결을 보존한다. 권한 밖 필드를 섞은 전체 덤프는
거부한다. mutation receipt와 감사 기록은 저장·grant 변경과 같은 트랜잭션에 포함되고,
감사 저장 실패는 전체 작업을 롤백한다. 비공개 읽기·내보내기도 감사한다.

브라우저는 사업 자료를 localStorage에 저장하지 않는다. 다운로드 직전에 서버에서 내보내기 권한을
다시 검사한다. 401/403 응답을 받으면 화면 데이터·대기 중 저장을 지우고 내보내기를 차단한다.
계정이 바뀌거나 화면을 닫으면 이전 요청을 취소한다. 허용된 사용자가 이미 내려받은 파일의
사본을 회수하는 기능은 아니므로, 파일 제공은 명시적인 내보내기로 처리한다.

## 운영 반영과 복구

새 서비스·유료 플랜·상주 작업·폴링·새 GitHub runner를 추가하지 않는다. 기존 API·PostgreSQL과
관리자 앱을 사용한다. 원문 payload는 기존 12MiB 한도를 유지하며 이관은 사용자가 선택한 파일에만 적용한다.

main 병합과 운영 배포는 구분한다. 운영 반영자는 현재 migration manifest 순서를 확인하고 기존
배포 절차에 따라 additive migration, API, 관리자 앱을 적용한다. migration은 재실행 가능해야 하며
새 열·권한·감사 테이블을 포함한 런타임 권한 계약 검증이 성공해야 한다.

소유자가 없는 과거 사업 자료의 복구는 운영 책임자가 실제 소유 주체와 이전 감사 이력을 대조한 뒤
별도로 승인한 작업으로 처리한다. 자동 owner 지정이나 공개 전환으로 복구하지 않는다.
이전 코드로 단순 복귀하면 비공개 경계를 잃을 수 있으므로 접근 기능을 닫은 상태에서 호환성을 먼저 확인한다.
실패 시 새 열·원문·감사 이력은 삭제하지 않고 기능 접근을 차단해 보존한다.

## 검증 근거

공통 계약의 `evidence.test.ts`, `change-identity.test.ts`, `import-review.test.ts`, `access.test.ts`에서
오래된 녹색·잘못된 SHA·프로젝트 충돌·원문 보존·scope 누출을 검사한다. API repository 통합 테스트는
실제 격리 PostgreSQL에서 동시 저장·권한 회수·재전송·감사 실패 롤백·migration 재적용·RLS를 검사한다.
관리자 UI 테스트는 승인 상태를 변경하지 않는 수동 증거 연결과 내보내기 직전 권한 회수를 검사한다.

실행 위치는 저장소 루트다. 아래 명령은 로컬 검증이며 운영 DB나 배포 서비스를 변경하지 않는다.

```sh
pnpm harness:verify
pnpm typecheck:admin
pnpm build:admin
pnpm exec vitest run packages/contracts/src/admin-workspace --maxWorkers=2
pnpm --dir apps/admin-web exec vitest run src/domains/workspace src/platform/http/workspace-api.test.ts --maxWorkers=2
```

실제 PostgreSQL 검증은 테스트 전용 URL·제한된 runtime role이 필요한 통합 테스트를 사용한다.
운영 DB URL을 테스트 환경 변수에 넣지 않는다. 최종 검증 결과와 원격 CI SHA는 해당 PR에 기록한다.
