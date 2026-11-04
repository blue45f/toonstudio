# 실제 두 계정 Canvas·저장·인계·재로그인 회귀

상태: **migration** — 선택 적용 RBAC의 로컬 통합 검증 기록이다. 운영 배포·운영 프로젝트 활성화
완료를 뜻하지 않는다. 작성일은 2026-11-05이며 실제 브라우저 실행은 2026-11-04 KST에 수행했다.

## 기준과 결론

실제 AppModule, 서명 로그인 세션, 별도 PostgreSQL runtime 계정, Vite와 Chromium을 연결한
회귀에서 **editor/viewer 두 경우 모두 2/2 PASS**했다. 총 실행 시간은 80.10초였으며 각 경우의
실제 pointer 요청은 grant 문맥을 포함해 5건 전송·5건 ACK·거절 0건이었다. 저장 뒤 새 stroke의
ID·`frameClipId`·`points`가 서버 정본과 일치하는 것까지 확인했다.

실행 당시 기준 HEAD는 `28fb2a9ef0111f0c0d0fa5e87f519c54795bcd6e`였고 추가 수정은 작업본에
있었다. 해당 후보는 이후 다음 커밋으로 보존했다. 기록된 21개 수정 파일의 SHA-256과 현재
보존 커밋의 파일을 대조해 불일치 0건을 확인했다. 이 기록을 새 main SHA의 브라우저 재실행이나
필수 hosted CI 통과로 해석하지 않는다.

| 보존 커밋 | 내용 |
| --- | --- |
| `77746df1c0fa55455d07b9b3f68fd10d1ac26e47` | 실제 협업 저장의 scoped 문맥 전달과 검수 업로드의 단일 decode |
| `25512815a51a43f8f7db45ae4cf78d5ffafac403` | 실제 Canvas 동기화 뒤 제한 저장·Compiler snapshot·게시 감사 보존 |
| `e8c0e3c29a11f326ef8c94a8f93084d51a93668a` | 실제 두 계정 Canvas·저장·인계·재로그인 회귀와 실행 harness |

2026-11-04의 [초기 경계 감사](role-pipeline-rbac-boundary-audit-2026-11-04.md)는 당시의 계획 UI와
기존 권한 조사 기록으로 그대로 유지한다. 선택 적용 기능과 이번 실제 Canvas 검증의 계약은
[프로젝트별 직군 권한 문서](../studio/role-pipeline-access.md)를 따른다.

## 실제 실행한 범위

신규 시험 계정 두 개와 시험 작품 두 개만 사용했다. 각 작품에서는 owner와 담당자가 별도
BrowserContext로 접속했다. 담당자의 기존 작품 ACL을 `editor` 또는 `viewer`로 두고 실제
`creator` 직군 binding과 등록된 컷 범위를 연결했다. 플랫폼 관리자 역할로 우회하지 않았다.

| 검사 | editor | viewer |
| --- | --- | --- |
| 실제 회원가입·이메일 확인·로그인·작품 초대 수락·제작 프로젝트/배정 API | PASS | PASS |
| 최초 live sync 이후 실제 Canvas pointer → 새 stroke·담당 frame·서버 ACK | PASS | PASS |
| 실제 저장 버튼 → REST 200·revision 증가·새 stroke ID/points 보존 | PASS | PASS |
| 새로고침 후 저장 원고와 담당 grant 유지 | PASS | PASS |
| owner의 다른 담당자 보호 범위 입력 차단 및 원고 수정 REST 403 | PASS | PASS |
| owner의 비매핑 범위 편집·저장 유지, 보호 범위는 후속 저장 뒤에도 동일 | PASS | PASS |
| 실제 검수 계정의 승인 뒤 REST 403·유효 Socket.IO 요청의 forbidden ACK·DB 불변 | PASS | PASS |
| 실제 인계 버튼 → `storyboard-conte` 저장·`story-script` 동결 | PASS | PASS |
| 양 계정 실제 logout/login 뒤 원고·동결 유지, 이전 세션 403 | PASS | PASS |

Canvas 좌표는 Stage 전체 비율이나 DOM 존재만으로 판정하지 않았다. 실제 Konva 종이 노드의
변환된 좌표를 읽고, 같은 frame 안에서 HUD에 가리지 않은 전체 pointer 경로가 CANVAS에
닿는지 확인했다. 정상 원고 import와 실제 원고·신규 획 렌더도 화면으로 검토했다. 인계 완료
화면과 재로그인 후 동결 안내·편집 배정 없음 표시도 직접 확인했다.

## 실행 중 확인한 최소 보정

새 권한 판정기를 중복 추가하지 않고 현재 actor·target·grant·변경 효과·revision·ACK 검사를
그대로 사용하도록 누락된 전달과 수명 경계를 보정했다.

| 확인한 경계 | 최소 보정과 보존한 계약 |
| --- | --- |
| 자동 clip 전의 일반 펜에 frame ID가 없어 담당 grant 문맥이 빠짐 | 서버와 같은 실제 frame 효과 판정 뒤 명시 선택한 target/grant에만 새 획을 연결했다. 비매핑 편집·명시 noClip·모호한 frame의 거절을 유지했다. |
| 첫 live 생성 선언 뒤 deferred 로컬 확정이 같은 획을 새 생성/복원으로 재해석 | 현재 room·계정·문서 세대의 실제 CRDT 객체와 생성 근거를 확인했다. 실제 undo/redo 복원과 오래된 outbox 원문은 유지했다. |
| 공동 초안 저장이 기존 게시 감사의 owner·publisher와 출처 checksum을 다시 씀 | RBAC가 켜진 공유 원고의 draft만 기존 게시 감사·출처를 보존했다. 서버의 전역 변경 검사와 일반 저장·게시 경로는 유지했다. |
| React Compiler가 같은 authority 객체의 이전 저장 가능 여부를 캐시 | 구독 epoch를 identity·policy·저장 가능 여부 snapshot의 명시 입력으로 연결했다. 실제 production Compiler 회귀로 확인했다. |
| viewer 저장의 정책 refresh가 아직 확정하지 않은 획 ticket을 무효화 | 현재 ticket으로 마지막 로컬 획 확정 → ticket/문서 세대 재기록 → 정책 refresh 순서로 옮겼다. 서버 ACK 뒤 재검증과 회수 시 저장 거절은 유지했다. |
| global/parameter Zod pipe가 multipart intent를 두 번 변환 | 명시 parameter pipe가 한 번만 decode하도록 body의 runtime metatype을 조정했다. strict schema·guard·업로드 한도·global pipe는 유지했다. |
| 실제 DI publication wrapper가 여섯 번째 scoped 인자를 버림 | 정본 `StudioScopedRestWriteInput`을 부모 저장소에 그대로 전달했다. 기존 게시 directive 보호 처리는 유지했다. |

관련 소스와 회귀:

- [실제 Canvas 회귀](../../apps/api/src/modules/creator/studio-role-pipeline-canvas.integration.test.ts),
  [실제 AppModule·DB harness](../../apps/api/src/modules/creator/studio-role-pipeline-canvas-test-harness.ts)
- [펜·원고 변경의 매핑 검사](../../apps/web/src/domains/creator/studio-collab/studio-role-pipeline-mutation.ts),
  [제한 편집 authority](../../apps/web/src/domains/creator/studio-collab/studio-scoped-write-authority.ts)
- [epoch 기반 저장 가능 여부](../../apps/web/src/domains/creator/studio-collab/studio-scoped-draft-save.ts),
  [실제 Compiler 회귀](../../apps/web/src/domains/creator/studio-collab/studio-scoped-draft-save.compiler.test.mjs)
- [viewer 저장 순서](../../apps/web/src/domains/creator/studio-collab/studio-scoped-page-save-pipeline.ts),
  [게시 감사·출처 보존](../../apps/web/src/domains/creator/export/studio-save-publication-boundary.ts)
- [multipart 경계](../../apps/api/src/modules/studio-project-graph/studio-review-preview-producer.controller.ts),
  [실제 DI 저장 wrapper](../../apps/api/src/modules/creator/creator-publication-collaboration.repository.ts)

선행 runtime ACL 보정도 기존 column GRANT와 불변성을 유지했다. work asset은 허용 열만 명시해
INSERT하고, 검수 blob은 동일한 clean/valid 메타데이터만 재사용하며 pending/blocked 행을 승격하지
않는다. 관련 [asset 저장소](../../apps/api/src/modules/creator/studio-work-asset.repository.ts)와
[검수 저장소](../../apps/api/src/modules/studio-project-graph/studio-review-preview-producer.repository.ts)에
새 GRANT나 권한 확대를 넣지 않았다.

## 데이터와 검증 전제

- DB는 전용 loopback 환경이며 migration/정리 계정과 앱 runtime 계정을 분리했다. 실제 import된
  앱 연결의 host·port·DB·사용자가 예상 runtime과 같은지 SQL 실행 전에 확인했다. DB 소유자,
  superuser, bypassRLS 및 주요 관계 소유 역할의 회원이면 시험을 중단한다.
- 기준 원고는 실제 API로 만들고 정본 Web serializer로 페이지·frame·획·순서를 구성했다.
  정책 OFF의 실제 owner guarded 서비스·REST로 저장한 뒤 정책을 켰다. 이후의 새 pointer ID와
  points를 따로 확인했으므로 초기 기준 원고 저장을 실제 pointer 성공으로 계산하지 않았다.
- 외부 이메일과 private object storage만 시험 port다. HTTP API 전체 응답이나 브라우저 인증,
  서버 ACL, Socket.IO ACK, PostgreSQL 저장 응답을 mock하지 않았다.
- 검수 preview는 명시한 **2×1 PNG 업로드 fixture**다. 실제 원고 전체의 검수용 고해상도 렌더나
  운영 R2·외부 이메일 전달 검증으로 확대하지 않는다.
- 이 회귀는 기존 작품 ACL의 editor/viewer와 실제 creator binding 두 조합이다. 15직군·18그룹
  전체의 UI 전수 검사, 모든 공정 전환, 동시 pointer 충돌·다중 API 노드 수렴을 실행한 결과는 아니다.
  개인 직군 프로필·계획 UI 전환을 서버 권한 변경으로 계산하지 않았다.

viewer의 전역 읽기 전용 배너는 담당 범위 예외를 설명하지 않고 원고 편집·저장이 불가하다고
표시하지만, 담당 picker·공동 저장·서버 권한은 정상 동작했다. 공통 lockMessage 변경은 metadata
잠금 안내에도 영향을 주므로 이번 제품 수정에 추가하지 않았으며, 화면 회귀 PASS를 문구
일관성까지 완료한 결과로 확대하지 않는다.

최종 실행 전 존재하던 행의 전체 내용 digest를 실행 후 다시 비교했다. `user` 1행,
`studio_blob` 426행, `creator_asset_storage_object` 902행은 모두 동일했다. 기존 작품·멤버십·
scoped policy는 이 격리 DB에 0행이었다. 이를 운영 기존 원고 전체의 데이터 비교로 해석하지 않는다.

시험 계정과 작품은 삭제했다. 이번 최종 실행의 신규 공유 메타데이터 **blob 4행·storage object
8행은 잔존**한다. content-addressed 공유 행을 임의로 지워 기존 참조를 훼손하지 않도록 정리
결과에 수를 남겼다. 기존 공유 행·설정·권한은 다시 쓰지 않았다.

검증 뒤 API·Vite·시험 Chromium과 전용 PostgreSQL을 종료했고 해당 포트의 listener가 없음을
확인했다. PG 데이터 디렉터리와 `PG_VERSION`은 보존했으며 reset/drop은 실행하지 않았다.

## 개발환경 재현

저장소 루트에서 Node 24 이상, 설치된 workspace 의존성·Chromium, 별도 Git ignored 0600 env
파일과 전용 로컬 스택을 준비한다. DB URL·계정·비밀번호·서명키 값은 명령·로그에 출력하지 않는다.
아래 명령은 기존 운영 환경이나 다른 세션의 스택에 적용하지 않는다.

| 입력 이름 | 준비 경계 |
| --- | --- |
| `TOONSTUDIO_LOCAL_ENV_FILE`, `TOONSTUDIO_LOCAL_STACK_DIR` | 전용 ignored env 파일과 별도 데이터 디렉터리 |
| `TOONSTUDIO_LOCAL_MIGRATION_DATABASE_URL` | 로컬 migration/fixture 정리 계정, 앱 접속용으로 사용하지 않음 |
| `TOONSTUDIO_LOCAL_DATABASE_URL` | 같은 로컬 DB의 비소유자·최소 권한 runtime 계정 |
| `TOONSTUDIO_LOCAL_API_ORIGIN`, `TOONSTUDIO_LOCAL_WEB_ORIGIN` | 명시 포트의 loopback origin. 이번 harness API는 4111에 바인딩 |
| `TEST_DATABASE_URL`, `STUDIO_LIVE_POSTGRES_INTEGRATION_URL` | 실행기가 migration URL을 읽어 프로세스에만 전달 |
| `TOONSTUDIO_RBAC_RUNTIME_DATABASE_URL` | 실행기가 runtime URL을 읽어 별도로 전달 |
| `TOONSTUDIO_RBAC_BROWSER_ORIGIN` | 실행 중인 Vite의 loopback origin; 명시 opt-in 입력 |
| `NEST_API_URL`, `VITE_STUDIO_LIVE_DEV_PROXY_ENABLED` | Vite의 HTTP·live WebSocket 프록시를 시험 API에 연결 |
| `API_LOCAL_ENV_FILE_ENABLED` | API가 기존 `.env.local`을 읽지 않도록 실행 시 비활성화 |
| `PLAYWRIGHT_EXECUTABLE_PATH` | 기본 Chromium이 없을 때 이미 설치한 실행 파일 경로, 선택 입력 |

새 비밀값과 시험 계정은 harness가 로컬 0600 파일에 기록한다. 실제 API 세션 secret이나 외부
provider 키를 복사해 넣지 않는다. 인증 limiter도 바꾸지 않는다. 두 경우의 초기 로그인과 양
계정 재로그인을 합쳐 정본 IP 한도 내 10회로 실행한다.

먼저 [로컬 하네스 절차](../../scripts/local-fullstack/README.md)에 따라 전용 DB의 기준 스키마·
번호 migration·runtime ACL을 준비한다. 기존 데이터가 있는 DB를 reset하지 않는다. 이미 준비한
DB를 다시 켜는 명령은 다음과 같다. env 파일·스택 경로는 실행자가 사전에 지정한다.

```sh
node scripts/local-fullstack/cli.mjs check
node scripts/local-fullstack/cli.mjs db:start
```

별도 터미널 A에서는 실제 실행과 같은 Vite만 띄운다. 이 회귀가 AppModule API를 직접 만들기
때문에 `api:start`나 전체 `up`으로 4111 포트를 먼저 점유하지 않는다.

```sh
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readEnvValues } from './scripts/local-fullstack/lib/env-file.mjs';
import { assertLocalOrigin, buildChildEnv } from './scripts/local-fullstack/lib/guard.mjs';
const values = readEnvValues(readFileSync(process.env.TOONSTUDIO_LOCAL_ENV_FILE, 'utf8'),
  ['TOONSTUDIO_LOCAL_API_ORIGIN', 'TOONSTUDIO_LOCAL_WEB_ORIGIN']);
const api = assertLocalOrigin(values.TOONSTUDIO_LOCAL_API_ORIGIN, 'TOONSTUDIO_LOCAL_API_ORIGIN');
const web = assertLocalOrigin(values.TOONSTUDIO_LOCAL_WEB_ORIGIN, 'TOONSTUDIO_LOCAL_WEB_ORIGIN');
if (api.hostname !== '127.0.0.1' || web.hostname !== '127.0.0.1' || api.port !== 4111) {
  throw new Error('시험 origin과 API 포트를 확인하세요.');
}
const child = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', '--config',
  'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', String(web.port), '--strictPort'], {
  stdio: 'inherit', env: buildChildEnv({ extra: {
    NEST_API_URL: api.origin, VITE_STUDIO_LIVE_DEV_PROXY_ENABLED: 'true',
  } }),
});
process.exit(child.status ?? 1);
NODE
```

터미널 B에서는 env 파일의 필요한 키만 읽어 실제 사용한 Vitest 회귀를 실행한다. 외부 URL이나
DB 소유자 runtime이면 시험 자체가 중단된다. 동시 API suite를 띄우지 않고 단독 실행한다.

```sh
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readEnvValues } from './scripts/local-fullstack/lib/env-file.mjs';
const values = readEnvValues(readFileSync(process.env.TOONSTUDIO_LOCAL_ENV_FILE, 'utf8'), [
  'TOONSTUDIO_LOCAL_MIGRATION_DATABASE_URL', 'TOONSTUDIO_LOCAL_DATABASE_URL',
  'TOONSTUDIO_LOCAL_WEB_ORIGIN',
]);
const child = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
  'apps/api/src/modules/creator/studio-role-pipeline-canvas.integration.test.ts', '--maxWorkers=1',
  '--reporter=default', '--reporter=json', '--outputFile=.qa/rbac-canvas/result.json'], {
  stdio: 'inherit', env: { ...process.env,
    TEST_DATABASE_URL: values.TOONSTUDIO_LOCAL_MIGRATION_DATABASE_URL,
    STUDIO_LIVE_POSTGRES_INTEGRATION_URL: values.TOONSTUDIO_LOCAL_MIGRATION_DATABASE_URL,
    TOONSTUDIO_RBAC_RUNTIME_DATABASE_URL: values.TOONSTUDIO_LOCAL_DATABASE_URL,
    TOONSTUDIO_RBAC_BROWSER_ORIGIN: values.TOONSTUDIO_LOCAL_WEB_ORIGIN,
    API_LOCAL_ENV_FILE_ENABLED: 'false',
  },
});
process.exit(child.status ?? 1);
NODE
```

성공 기준은 두 경우 모두 PASS, 실제 REST·ACK·원고 일치·동결 assertions 통과와 보존 검사 성공이다.
실패하면 원인을 확인한 뒤 중단하며 시험 DB나 권한을 느슨하게 바꿔 통과시키지 않는다. API와
시험 브라우저는 harness가 종료한다. 터미널 A의 본인 Vite를 종료한 뒤 다음으로 DB를 중지한다.

```sh
node scripts/local-fullstack/cli.mjs db:stop
```

## 실행 증거와 배포 경계

실행 산출물은 ignored `.qa/rbac-canvas/`에 남으며 계정·secret 파일은 공개 증거에 복사하지 않는다.
작업 시 Git 공통 디렉터리의 `rbac-final-20261104/canvas-e2e-final/`에 비밀값을 제외한
`result.json`, `final-run.log`, 보존·잔존 수, 각 경우의 `flow-proof.json`, 승인 거절 결과와
원고·인계·재로그인 PNG를 별도 보존했다. 이 로컬 증거는 일반 clone이나 hosted CI에 동봉되지 않는다.

제품 공통 harness·구조·Web/API 타입 검사는 통과했고 관련 선택 회귀는 20개 파일 205/205,
CI 실행 계약은 47개가 통과했다. 최종 시험 파일의 진단 오류 cause 보존만 뒤에 보강한 후 API
세 설정 typecheck·두 파일 ESLint/Secretlint·diff 검사도 통과했다. 성공 실행 경로와 제품 코드는
바뀌지 않았다.

`CI=true`에서 브라우저 opt-in이 없을 때는 이 새 회귀의 두 경우가 의도대로 skip되고 import
오류 없이 끝나는 것을 별도로 확인했다. 기본 CI가 실제 브라우저 2/2를 자동 실행한 것은 아니다.

운영 DB·계정·GRANT·환경변수·프로젝트 정책은 변경하지 않았고 운영 배포도 하지 않았다.
정확한 최종 main SHA의 필수 hosted CI, 정적 웹과 Core API의 배포 결과, 필요한 추가형 migration
원장·복구 계획은 별도로 확인해야 한다. 이후 배포 결과는 이 로컬 검증 기록과 구분해 기록한다.
