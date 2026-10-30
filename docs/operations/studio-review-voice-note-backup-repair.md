# 검수 음성 메모 함수의 백업·복원 경계 복구

- 기준일: **2026-10-30**
- 상태: **migration** — 이슈 [#2581](https://github.com/blue45f/toonstudio/issues/2581)의 전진 복구 변경과 검증 절차. 운영 적용 완료를 뜻하지 않는다.
- 운영 현재 상태(`current`): [인프라 지도](infrastructure-map.md) 7.2절의 onpod 적용 예외가 정본이다. 이 변경에서는 운영 DB에 접속하거나 변경하지 않는다.

## 원인과 변경 범위

0093은 `search_path = pg_catalog, public`에서 스키마를 생략해 함수를 생성한다. 슈퍼유저로
실행하면 `pg_catalog.studio_review_voice_note_guard()`가 생성되고 트리거가 이 함수를 참조할 수 있다.
일반 `pg_dump`는 시스템 스키마의 사용자 함수를 포함하지 않으므로 빈 DB 복원이 실패한다.
트리거를 `public`으로 연결해도 0093의 시스템 함수 권한 변경(ACL)은 덤프에 남아 복원을
실패시킬 수 있으므로 시스템 함수 정리도 필요하다.

기배포 `0093_review_voice_note_constraints_repair.sql`의 원문·체크섬·원장은 보존한다.
[0119](../../apps/api/src/platform/database/migrations/0119_studio_review_voice_note_guard_schema.sql)는
`public.studio_review_voice_note_guard()`를 명시적으로 정의하고
`public.studio_review_voice_note`의 트리거를 이 함수에 다시 연결한다. 이어서 기존
`pg_catalog.studio_review_voice_note_guard()`를 `DROP FUNCTION IF EXISTS … RESTRICT`로
제거한다. 다른 의존성이 있으면 전체 트랜잭션을 실패시키며 `CASCADE`로 강제 삭제하지 않는다.
`SECURITY INVOKER`, 함수의
`search_path=pg_catalog,public`, PUBLIC 실행 권한 차단, 기존 검수 불변식과 테이블 권한을 유지한다.
기존 `public` 함수에 부여한 개별 권한과 소유자는 `CREATE OR REPLACE FUNCTION`으로 유지한다.

행·객체 참조·해시·삭제 표식과 보존 기간은 바꾸지 않는다. 함수 교체와 트리거 재생성은 하나의
트랜잭션에서 시스템 함수 정리까지 수행하며 잠금 대기와 실행 시간 제한을 둔다.

## 로컬 검증

저장소 루트에서 실행한다. PostgreSQL 서버·`psql`·`pg_dump`·`pg_restore`·`createdb`와 설치된
workspace 의존성이 필요하다. 서버와 클라이언트 버전이 백업·복원에 호환되어야 한다.
운영 접속 환경을 상속하지 않은 숫자 loopback 전용 세션을 사용한다. source와 restore는 같은
격리 로컬 클러스터의 서로 다른 일회성 DB로 준비해 기존 소유자·권한 역할도 복원할 수 있게 한다.

자동 회귀 검사는 `TEST_DATABASE_URL`에 격리 로컬 테스트 DB를 지정한다. 이 검사만을 위한
관리자 역할에는 결함 재현용 시스템 함수 생성과 일회성 DB·역할 생성·삭제 권한이 필요하다.
수정 migration은 기존 시스템 함수 소유권이 있는 경우와 없는 경우를 구분해 권한·롤백
조건을 확인한다. 시스템 함수가 없는 신규 상태에서는 비슈퍼유저 소유자 적용도 확인한다.
URL을 설정하지 않아 검사가 생략된 결과는 성공 근거로 사용하지 않는다.

```bash
: "${TEST_DATABASE_URL:?격리 로컬 테스트 DB URL을 먼저 설정하세요}"
pnpm exec vitest run --no-file-parallelism scripts/studio-review-voice-note-backup.integration.test.mjs
pnpm exec vitest run scripts/run-production-database-migrations.test.mjs scripts/bootstrap-empty-production-database.test.mjs apps/api/src/modules/studio-project-graph/studio-review-voice-note.migration.test.ts
pnpm harness:verify
```

백업 회귀 검증은 운영 부트스트랩과 동일한 경로로 준비한 **수정 전 합성 데이터 DB**에서 시작한다.
0093 원문으로 만들어진 `pg_catalog` 함수에 트리거가 연결되어 있는지 먼저 확인하고,
수정 전 일반 복원의 실패를 보존한다. 별도 함수 복사나 restore 오류 무시는 금지한다.
source DB를 `STUDIO_VOICE_SOURCE_DATABASE`, 아직 존재하지 않는 복원 DB 이름을
`STUDIO_VOICE_RESTORE_DATABASE`, 로컬 전용 백업 출력 경로를 `STUDIO_VOICE_BACKUP_PATH`로 지정한다.
접속은 이 세션에 설정한 로컬 `PGHOST`·`PGPORT`·`PGUSER`와 기존 비밀값 저장소를 사용한다.

다음 명령으로 0119를 source DB에 적용한다. 동일 명령을 재실행해 행과 권한이 보존되는지
검사한다. 이 명령은 source DB의 함수와 트리거를 변경한다.

```bash
: "${STUDIO_VOICE_SOURCE_DATABASE:?합성 source DB 이름을 먼저 설정하세요}"
psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname="$STUDIO_VOICE_SOURCE_DATABASE" --file=apps/api/src/platform/database/migrations/0119_studio_review_voice_note_guard_schema.sql
```

이어서 새 빈 DB에 복원한다. `createdb`와 `pg_restore`는 복원 DB에 쓰기를 수행한다.

```bash
: "${STUDIO_VOICE_RESTORE_DATABASE:?새 복원 DB 이름을 먼저 설정하세요}"
: "${STUDIO_VOICE_BACKUP_PATH:?로컬 백업 출력 경로를 먼저 설정하세요}"
pg_dump --format=custom --file="$STUDIO_VOICE_BACKUP_PATH" --dbname="$STUDIO_VOICE_SOURCE_DATABASE"
createdb --template=template0 "$STUDIO_VOICE_RESTORE_DATABASE"
pg_restore --exit-on-error --single-transaction --dbname="$STUDIO_VOICE_RESTORE_DATABASE" "$STUDIO_VOICE_BACKUP_PATH"
```

복원은 `--no-owner`·`--no-acl` 없이 성공해야 한다. source와 restore 각각에서 다음 카탈로그
첫 쿼리 결과가 한 행이고 `guard_schema=public`, `invoker=true`, `fixed_search_path=true`,
`public_execute=false`이며 두 번째 쿼리의 `no_catalog_guard=true`인지 확인한다.

```sql
SELECT nsp.nspname AS guard_schema,
       NOT proc.prosecdef AS invoker,
       proc.proconfig @> ARRAY['search_path=pg_catalog, public'] AS fixed_search_path,
       EXISTS (
         SELECT 1
         FROM pg_catalog.aclexplode(COALESCE(
           proc.proacl, pg_catalog.acldefault('f', proc.proowner)
         )) AS acl
         WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       ) AS public_execute
FROM pg_catalog.pg_trigger AS guard
JOIN pg_catalog.pg_proc AS proc ON proc.oid = guard.tgfoid
JOIN pg_catalog.pg_namespace AS nsp ON nsp.oid = proc.pronamespace
WHERE guard.tgrelid = 'public.studio_review_voice_note'::regclass
  AND guard.tgname = 'studio_review_voice_note_guard_update'
  AND NOT guard.tgisinternal;

SELECT pg_catalog.to_regprocedure('pg_catalog.studio_review_voice_note_guard()') IS NULL
       AS no_catalog_guard;
```

함수·트리거만 검사해 완료로 판정하지 않는다. 기존 행과 개별 ACL 보존, 재적용 안전성,
본문 변경·직접 삭제·삭제 상태 역전 거부, 정상 삭제 표식, 부모 삭제 시 cascade를 검사한다.
기존 협업·검수 통합 검사도 source와 복원 DB에서 실행해 작품별 인가와 공개 역할 RLS 경계를
확인한다. 실제 실행 명령·성공 또는 실패·로그 위치는 PR 검증 기록에 남긴다.

## 운영 적용과 실패 시 복구

운영 적용은 별도 DB 릴리스 작업이다. 저장소 소유자의 명시적 승인, 승인한 40자리 main SHA,
필수 CI와 로컬 검증, 대상 DB·역할·기존 원장 체크섬 확인, 복구 가능한 백업·롤백 검토가 필요하다.
onpod는 상시 승인 범위 밖이며 현재 공식 러너의 TLS·역할 경계와도 차이가 있으므로
[인프라 지도](infrastructure-map.md)와 [DEPLOY.md](../../DEPLOY.md)의 해당 절차를 먼저 따른다.
이 문서는 운영 runner 검증을 완화하거나 SQL을 직접 실행할 권한을 부여하지 않는다.

적용 역할은 `public` 함수의 생성·교체와 기존 함수 소유권, 대상 테이블 트리거 변경에 필요한
권한을 가져야 한다. 기존 `pg_catalog` 함수가 있으면 그 함수를 삭제할 소유권 또는 슈퍼유저
권한도 필요하다. 시스템 함수가 없는 onpod·신규 상태는 이 추가 삭제 권한 없이 적용할 수 있다.
다른 의존성, 권한 부족 또는 잠금 시간 초과가 발생하면 해당 트랜잭션을 롤백하고 원인을
검토한다. `CASCADE`로 바꾸거나 변경된 체크섬을 기존 원장에 덮어쓰거나 실패를 숨기기 위한
재시도는 하지 않는다.

적용 후 일반 백업·별도 빈 DB 복원·검수 불변식 검증이 실패하면 릴리스를 중단하고 원인을
분석한다. 트리거를 `pg_catalog` 함수로 되돌리는 역방향 migration은 백업 결함을 다시 만들므로
사용하지 않는다. 이미 커밋된 변경은 검토한 추가 forward repair로 복구하며, 데이터 복원 등
파괴적인 조치가 필요하면 별도 승인을 받는다. API 이미지 롤백은 DB 변경을 되돌리지 않는다.

## 남는 레거시 예외

**legacy exception** — 0093 원문은 보존되므로 비슈퍼유저가 공식 빈 DB 부트스트랩에서
0093을 처음 실행하면 0119에 도달하기 전에 `pg_catalog` 함수 생성 권한 오류가 날 수 있다.
onpod의 실행 SQL 한정 치환 예외도 [인프라 지도](infrastructure-map.md) 7.2절에 남아 있다.
이번 전진 복구가 이 선행 부트스트랩 문제와 운영 적용까지 완료한 것으로 해석하지 않는다.
