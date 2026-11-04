# 직군 계획 UI와 실제 원고 편집 권한 검증

상태: **역사 자료(historical)** — 2026-11-04의 아래 소스와 로컬 검증 범위에 한정한다.

## 기준과 결론

- 대상: [PR #2669](https://github.com/blue45f/toonstudio/pull/2669) 이후 `origin/main`의
  `ac09b2353986eacd13e7e30f6f7d7469337d8dba`와 이 보고서에 함께 추가한 회귀 테스트.
- 격리 브랜치: `codex/role-pipeline-rbac-audit-20261104`.
- 기존 기본 checkout·다른 worktree·기존 계정 설정·운영 데이터·운영 권한은 변경하지 않았다.
- PR #2669의 15직군·18그룹·8단계 인계는 **계획·시뮬레이션 UI**다. 이 선택이 실제
  작품 ACL, Production 배정, 제한 편집 grant를 생성하거나 바꾸는 연결은 없다.
- 실제 원고는 별도의 기존 서버 ACL과 scoped-write 경로로 보호된다. 조사와 실행한 회귀 범위에서
  그 경로를 새 시뮬레이션 가드로 대체하거나 중복 구현할 필요가 있는 확정 우회 결함은 찾지 못했다.
- 전체 편집자의 타인 객체 수정 제한, 계획 인계에 따른 서버 동결, 승인 후 작업본 전체 잠금은
  현재 정책과 다르다. 추가 강제는 아래 승인 대상 제안으로 남기고 적용하지 않았다.

## 요청 항목별 판정

| 요청 | 계획 UI | 실제 서버 경계와 검증 범위 |
| --- | --- | --- |
| 직군 전환 | `useState`로 예시 메뉴와 권한 배지만 변경 | 실제 프로젝트별 직군 프로필도 화면 정렬·추천 설정이다. 계정 ACL은 변하지 않는다. |
| 다른 사용자 원화 수정 차단 | 레이어 그룹 ID를 이용한 예시 | 제한 편집은 실제 컷·요소·획·그룹·surface 귀속을 전후 비교한다. 범위 밖 REST·CRDT·제출을 거절하고 원고·revision·영수증을 보존하는 실제 DB/HTTP 회귀 통과. 전체 편집자는 기존 전체 편집 권한을 유지한다. |
| 공정 인계 후 이전 단계 잠금 | 이전 그룹을 예시상 동결하며 서버 상태를 바꾸지 않음 | 실제 제한 편집 grant는 현재 task가 `conditionally-approved`, `approved`, `done`, `cancelled`, `out-of-scope`이면 무효다. 정식 제출·검수·승인 API 뒤 새 REST·CRDT·재제출 거절과 원고·제작 aggregate 불변을 확인했다. Production API의 승인·인계와 계획 패널의 인계는 별개다. |
| 승인 원고 수정 방지 | 최종 동결 계획일 뿐 실제 승인 없음 | 승인 스냅샷과 terminal 검수 결정은 불변이다. `creator_work` 작업본 전체를 모든 편집자에게 동결하는 정책은 없다. 로컬 `page.review.locked`도 보편적인 서버 ACL이 아니다. |
| 새로고침·재로그인 | 의도적으로 1단계로 초기화 | 실제 정책·원고는 서버에 저장된다. 새 로그인에서 동일 grant·저장본 복원, 회수 후 이전 쿠키·writeContext 거절, DB 불변을 실제 HTTP로 검증했다. |

## 실제 편집·저장 경로

계획 경로:

`StudioBlankComicProDrawingSubPanel` / `StudioWorkflowPlanningPanel`
→ `StudioWebtoonRolePipelineSubPanel`
→ `evaluateRoleLayerEditGuard` / `executeOneClickStageHandoff`
→ 지역 React state와 배지·설명 변경.

현재 패널은 이미 “실제 원고·서버 권한·담당자·작업공간은 변경하지 않습니다”와 탭 이탈 시
초기화를 안내한다. 근거:
[계획 패널](../../apps/web/src/domains/creator/manga-toolkit/StudioWebtoonRolePipelineSubPanel.tsx),
[순수 계획 함수](../../apps/web/src/domains/creator/manga-toolkit/webtoon-role-pipeline-orchestrator.ts).

실제 편집 경로:

`useStudioDocumentAccessRuntime` → `useStudioScopedWriteRuntime`의 계정·작품별 서버 정책 조회
→ `StudioScopedWriteAuthority` → draw pointer·지연 commit·변경 효과·undo/redo 검사
→ scoped CRDT 및 doc-only PATCH.

서버 경로:

1. 서명 세션과 현재 세션 허용 여부로 실제 actor를 결정한다. 임의 `x-user-id`는 신뢰하지 않는다.
2. `PATCH /creator/works/:id/team/document`의 repository는 공통 work advisory lock과 작품 행 lock 뒤
   현재 멤버십 ACL, revision CAS, CRDT server sequence를 확인한다.
3. owner/admin/editor는 기존 전체 편집, active viewer/commenter는 관리자가 별도 부여한 제한 grant만
   사용할 수 있다. 클라이언트의 직군 선택은 권한 근거가 아니다.
4. 제한 저장은 현재 계정·party·assignment·task·scope·기간·회수 상태를 다시 확인하고 실제 변경
   귀속을 검사한다. 같은 transaction에서 doc·revision·ownership·receipt를 기록한다.
5. CRDT 및 영속 live op에도 같은 제한 권한과 변경 효과 검사가 연결되어 있다.

주요 근거:
[계정 세션](../../apps/api/src/session-middleware.ts),
[기존 ACL](../../apps/api/src/modules/creator/creator-collaboration.policy.ts),
[일반 저장](../../apps/api/src/modules/creator/creator-collaboration.repository.ts),
[제한 권한 확인](../../apps/api/src/modules/creator/studio-scoped-write-store.ts),
[변경 효과](../../apps/api/src/modules/creator/studio-scoped-write-effects.ts),
[제한 REST 저장](../../apps/api/src/modules/creator/studio-scoped-write-rest.ts),
[CRDT 저장](../../apps/api/src/modules/creator/studio-crdt.repository.ts),
[live op 저장](../../apps/api/src/modules/creator/studio-live-op.repository.ts),
[브라우저 authority](../../apps/web/src/domains/creator/studio-collab/studio-scoped-write-authority.ts),
[브라우저 저장](../../apps/web/src/domains/creator/studio-collab/studio-scoped-page-save-pipeline.ts).

## 실행한 개발환경 검증

별도 loopback PostgreSQL·Nest API·Vite를 사용했다. 기존 기본 로컬 스택은 재사용하거나 초기화하지
않았다. 테스트 비밀값은 별도 Git ignored env 파일에 권한 600으로 보관했고 출력하지 않았다.
새 로컬 DB에 99개 migration을 적용한 뒤 readiness의 DB·schema·runtime ACL이 통과했다.

| 검증 | 결과 |
| --- | --- |
| 프런트 권한·저장·이력·계획 회귀 | 9개 파일, 69개 테스트 통과 |
| 서버 ACL·scoped policy·변경 효과·영수증·불변 migration 회귀 | 6개 파일, 90개 테스트 통과 |
| 실제 Production HTTP·scoped producer HTTP·PostgreSQL REST 저장 | 3개 파일, 44개 테스트 통과, skip 0 |
| 실제 PostgreSQL 검수 승인·이력·동시성·runtime 권한 회귀 | 1개 파일, 67개 테스트 통과, skip 0 |
| 실제 브라우저 계획·직군 선택·8단계 동결·새로고침·로그아웃·재로그인 | 신규 Playwright 1개 테스트 통과, API 응답 모의 없음 |
| 로컬 인증 스모크 | 11개 통과, 실패 0, 레이트리밋 프로브 1개 의도적 미실행 |
| 로컬 스택 로그·상태의 알려진 비밀값 검사 | 누출 0건 |
| 하네스 doctor·check·verify | 통과. `node scripts/agent-harness.mjs verify`로 동일 실행 스크립트를 호출했다. |
| 구조·앱 경계·소스 크기·Studio 진입 그래프 | 하네스의 `validate:architecture` 전체 통과 |
| 전체 Web·API·브라우저 도구·PostgreSQL 도구 타입 검사 | 하네스의 `typecheck` 전체 통과 |
| 최종 변경 파일 lint·Secretlint·문서 링크·diff 공백 | 통과 |

브라우저에서는 실제 로그인 후 밑색 직군의 선화 편집 제외 표시, 허용되지 않은 인계 버튼 비활성,
이전 단계 동결 표시와 최종 동결 계획을 확인했다. 새로고침·재로그인 후 1단계로 복귀하고 서버
프로필과 동일 계정이 유지되는지 확인했다. 계획 동작 구간의 원고·Production·프로필·Graph 쓰기
요청이 없는지 검사했다. 로그인 초기화의 정상 `/api/me/merge`는 관찰 구간 밖이다.
1440px 최종 동결과 390px 재로그인 화면을 저장·직접 확인했다.

추가한 회귀:

- [실제 세션·정책·원고 복원과 회수](../../apps/api/src/modules/creator/studio-scoped-producer-http.integration.test.ts)
- 같은 파일에 실제 제출·필수 검수·승인 command 이후 제한 담당자의 REST·CRDT·재제출 차단과
  원고·Production aggregate 불변 회귀도 추가했다. 상태를 DB에서 직접 고쳐 승인한 fixture가 아니다.
- [실제 화면의 계획 범위·초기화](../../e2e/local-fullstack-role-preview.spec.mjs)
- [기존 로컬 전용 Playwright 설정에 연결](../../playwright.local-fullstack.config.mjs)

브라우저 재현은 [로컬 풀스택 하네스](../../scripts/local-fullstack/README.md)로 별도 스택을 준비한 뒤
해당 스택의 env 파일만 지정해 실행한다. 기본 CI에서는 브라우저 회귀를 실행하지 않는다.

```sh
TOONSTUDIO_LOCAL_ENV_FILE=/absolute/path/to/ignored-local-test.env \
  node scripts/local-fullstack/cli.mjs e2e -- local-fullstack-role-preview.spec.mjs
```

## 승인 후 별도로 검토할 정책 변경안 — 미적용

권장 방향은 **프로젝트별 명시적 opt-in**이며 기존 프로젝트와 전체 편집권을 자동 변환하지 않는다.

1. 관리자가 15직군을 실제 계정의 기존 Production assignment와 연결하고, 18종 예시 그룹을 실제
   원고 target ID에 명시적으로 매핑한다. 예시 직군 선택만으로 grant를 발급하지 않는다.
2. 실제 인계는 기존 제출·검수 command를 사용하며, 같은 transaction에서 이전 task의 편집 자격을
   종료하고 후속 담당자의 grant를 명시적으로 생성한다. 화면 계획 인계와 실행을 구분한다.
3. 프로젝트가 선택한 승인 동결 범위를 REST·CRDT·live op 공통 권한 경계에 적용한다. 해당 범위는
   기존 full editor도 차단하므로 현재 `access.edit`의 조기 허용 계약이 달라진다.
4. 승인본 수정은 잠금을 몰래 풀지 않고 새 revision/재작업 절차로 진행한다. 기존 승인 스냅샷,
   작업 이력, 계정 설정과 원고 데이터는 보존한다. 대기 outbox는 서버 거절 후 초안으로 보존한다.

영향: opt-in 프로젝트의 전체 편집자도 승인·인계된 범위를 바로 덮어쓸 수 없고 정식 재작업이
필요하다. 정책 버전·프로젝트 설정의 영속 계약과 호환 migration, 과거 데이터의 기본 OFF,
기존 편집자와 제한 담당자의 다중 계정 회귀가 필요하다. 이 제한은 현재 사용자 경험을 바꾸므로
소유자의 명시적 승인 전에 코드·DB·운영 설정에 적용하지 않는다. 운영 배포도 별도 승인 대상이다.

## 검증 한계와 변경 상태

- 운영 배포·운영 DB migration 적용·운영 계정 권한은 검사하거나 변경하지 않았다.
- 검수 DB 회귀는 승인 이후 코멘트 변경, 정책 이벤트 UPDATE/DELETE와 runtime 이력 변경 차단을
  직접 실행했다. `studio_revision.rootGraphHash` 본문을 SQL로 직접 변조하는 시도는 실행하지 않았다.
- 브라우저 회귀는 계획 UI의 범위를 검증한다. 여러 브라우저가 실제 캔버스에서 동시에 획을 그리고
  Socket.IO로 송수신하는 전체 시나리오는 이번 실행에 포함하지 않았다. CRDT는 실제 service와 DB
  통합 경계에서 검사했다.
- 앱의 권한 정책과 기존 사용자 설정을 바꾸는 구현 변경은 없다. 테스트와 검증 기록만 보강했다.
- 전용 로컬 웹·API·PostgreSQL은 검증 후 정상 종료했고 검증 DB·화면 증거는 보존했다.
- 커밋·PR 생성·병합·배포는 수행하지 않았다.
