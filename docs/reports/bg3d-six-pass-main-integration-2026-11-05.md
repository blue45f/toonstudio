# 6패스 LT와 최신 main의 동작 보존 통합

- 상태: **migration — 검증된 6패스와 main의 동작을 함께 보존하는 통합 후보**
- 작성일: 2026-11-05
- 검증 원본: `e8ea1cfc7e2e784514919cb21869e9697d229212`
- 수신 main: `2fbf6c3160e5f9f8b19df0576079e0b96fa6a296`
- 기존 통합 커밋: `f774af067082c48499007862ee14539b6e312167` — 위 두 SHA를 부모로 한 일반 merge.
- 추가 수신 main: `ac6a0a8e8b7e3f55ea08ee58427f654cf69c871f` — PR #2710의 6패스 squash와 PR #2709의 후속 UI를 포함한다.
- 최초 작업 위치: `codex/bg3d-six-pass-main-20261105`의 독립 작업트리.
- 복구 작업 위치: `/Users/hjunkim/WebstormProjects/toonstudio-bg3d-integration-20261105`, `codex/bg3d-six-pass-recovered-20261105`.
- 승인 범위: 충돌 해결·회귀·CI 확인·PR 병합. **운영 DB 적용·배포는 별도 승인**이다.

## 1. 기존 작업 보존과 충돌 판정

진행 중 별도 주체가 원본 6패스 변경을 [PR #2710](https://github.com/blue45f/toonstudio/pull/2710)으로
2026-11-05 04:21:59 KST에 squash 병합한 사실을 확인했다. 이 채팅에서 해당 병합을 실행하지 않았다.
후속 UI PR #2709도 반영된 main을 일반 merge로 수신했으며, 이미 반영된 기능을 중복 구현하지 않는다.
이 후보의 후속 PR은 CI 등록·정규 DB 준비·공유 정책 불변 fixture·결합 회귀를 보강하는 범위다.

동일 파일이 양쪽 이력에 추가된 네 add/add 충돌은 source blob을 비교했다. main 쪽은 원래
f774 파일과 동일하고, 후보 쪽 차이는 이 보고서의 회귀·정책 불변 검사·기록 구분뿐이었다.
해당 hunk를 각각 검토해 보강을 유지했으며, main의 별도 UI 변경은 그대로 받았다.


검증 원본과 기존 handoff 작업트리는 변경하지 않았다. 기존 handoff의 통합 커밋을 새 후보에
보존했고, 아래 세 교차 파일의 의미를 확인했다. wholesale ours/theirs 복원은 사용하지 않았다.

| 파일 | 함께 보존한 동작 |
| --- | --- |
| `creator-publication-collaboration.repository.ts` | main의 scoped 문맥과 6패스 reader capability를 각각 여섯 번째·일곱 번째 인자로 전달한다. 게시 감사·출처 보호와 입력 patch 불변도 유지한다. |
| `studio-page-save-pipeline.ts` | main의 `prepareStudioSavePublicationBase`와 mapped-full 공유 초안의 게시 보호, native·retained-only 원고의 봉인 후 저장 분기를 함께 유지한다. |
| `studio-crdt-room-binding.ts` | main의 scoped flush·현재 live entity 권위와 native reader·origin/work scope·원본 검증 후 hydration을 함께 유지한다. |

통합 커밋의 오프라인 충돌 사전 지연 로딩도 유지했다. 실제 의도 시점에 runtime과 사전을
함께 읽고 같은 room generation 가드를 재확인하므로, 권한·문구 의미를 바꾸지 않고 초기
Studio 정적 그래프 한도를 지킨다. 파일 크기·eager graph 기준선을 올리지 않았다.

## 2. 실제 실행되는 CI 경계

기존 CI 고정 목록에는 새 native 테스트와 PostgreSQL suite가 포함되지 않았다. 이번 보강은
기존 다섯 static shard와 PostgreSQL job/service를 재사용하며 새 runner·권한·유료 옵션을 만들지 않는다.

- 공통 계약·실제 capture와 renderer admission·문서/ZIP·CRDT/구 reader·원격 봉인/복구·
  썸네일의 32개 selector를 추가했다. 실제 새 static 실행 파일은 38개이며, DB suite는 별도 job에서 실행한다.
- 경로 허용은 `tests/unit/contracts/`만 확장했다. 인접 접두사·경로 이탈·명령 인자와 구분자 거부를 유지한다.
- 정규 DB 준비는 빈 loopback 테스트 DB에 Drizzle schema와 정본 0121 SQL을 적용하고,
  `studio_bg3d_revision_guard`와 `studio_bg3d_artifact_guard`의 실제 존재를 확인한다.
- native PG fixture는 공유 `plan:free` 정책을 생성·삭제하지 않는다. 테스트 계정의 usage event로
  quota를 소진하고, 계정 FK 정리와 공유 정책의 전후 불변을 검사한다.

PR #2710의 실제 CI 로그에서 정규 테스트 DB의 `studio_bg3d_bundle_guard()` 부재와
이전 migration 목록·reader capability 기대값의 불일치를 확인했다. 위 DB 준비 경계와 함께
정확한 0121 추가·project 최대 지원 버전 5·아카이브 544 MiB·capture adapter v7·번역 5키를
기대값에 반영한다. 크기 경계의 정확한 한도와 +1 거부, 미래 버전 6 거부, 원래 단일 캡처의
허용·거부·dispose 검증을 유지한다. sparse checkout은 기존 원본 자산 다섯 경로만 추가한다.

다른 채팅이 담당한 `a23e4dd8bcded2c82ebf17020fa503f8a897b66e`도 일반 merge로 받았다.
Creator hub Web 타입 검사에 정본 16 GiB Node heap을 적용하는 두 줄이며, 검사 범위·runner·
권한·보호 규칙은 변경하지 않는다. 별도 중복 PR은 만들지 않도록 조율했다.

## 3. 로컬 통합 검증

아래 결과는 수신 main과 6패스 변경을 결합한 후보에서 실제 실행한 결과다. 명령 로그와
소스 해시는 작업별 증거에 보존하며, PR의 최종 head CI 상태는 PR check 결과를 따른다.

- 관련 Vitest **113파일 1,494개 통과**. 기존 6패스 회귀와 main의 scoped 저장·게시 경계,
  live 권위 및 publication provider의 기본/명시 capability 전달을 포함한다.
- 새 curated 범위 **38파일 279개 통과**. 위 회귀와 겹치므로 합산하지 않는다.
- CI 정책 Node **73개 통과**, runner·runtime ACL Vitest **13개 통과**.
- 새 빈 PostgreSQL DB에서 정규 준비 명령 **exit 0**, Studio invariant trigger **23개 확인**.
- 동일한 준비 DB에서 native 저장·복구·승격 11개와 main의 일반 asset·Graph 비소유 runtime/
  권한 회수 6개, 합계 **3파일 17개 통과**. 공유 정책과 테스트 계정의 잔존 행은 없다.
- 복구 뒤 정규 CI DB 명령 전체 **17파일 319개 통과·기존 조건부 skip 1개**.
  별도 stale 기대값 회귀 **3파일 19개**, MToon·번역 **2파일 65개**, migration·공개 원본
  **5파일 58개**, sparse checkout·CI 정책 Node **43개**를 통과했다. 서로 겹치는 실행은 합산하지 않는다.
- `a48769219`를 별도 새 DB·비소유 runtime·실제 AppModule·Vite·Chromium으로 검증한
  관련 채팅의 2D Canvas editor/viewer **2/2**, 직군·담당자 전환 HTTP **1/1**도 통과했다.
  pointer→reader capability 포함 이진 ACK→저장·재열기→타인 보호→승인 잠금→인계·양계정 재로그인을
  확인한 범위이며 6패스 GPU나 15직군 전수 검증으로 확대하지 않는다. 실행 파일 경로가 없었던
  초기 실패 시도는 성공에 포함하지 않았고, 새 격리 DB의 공유 불변 메타데이터 7 blob·14 object는 보존했다.
- 실제 제품 UI에서 GPU 캡처 1회로 22개 객체→6층/1그룹·8 native 본문→두 탭→undo/redo→
  ZIP v5→새 문맥 재열기→22개 객체·38°·lens shift 0.12 재편집→2배 PNG 출력을 확인했다.
  5개 시점의 native/Stage 원본 픽셀·장면·설정·선화 index가 동일했고 page error와 외부 HTTP는 0이다.
  자동화가 모달 mount 전 DOM을 읽은 timing 오류 1회는 raw 기록에 남겼고, 같은 UI를 기다려
  다시 관측했다. 제품 오류나 추가 GPU 캡처로 바꾸어 집계하지 않았다.
- 관련 lint·파일 크기·eager graph 검사를 통과했다. eager graph는 20,490,417 bytes,
  1,671 modules다. 동작 변경이 없는 테스트 fixture는 원래 계약에 맞춰 타입을 명시했다.

정상 push 전 검사와 `pnpm harness:verify`, 정확한 PR head의 `core`·`verify` 및 하위 실행
lane이 모두 성공한 것을 확인한 뒤 병합한다. 과거 PR·다른 SHA의 성공을 대체 근거로 쓰지 않는다.

### 검증 환경 중단과 복구

2026-11-05 04:44 KST 무렵 `.codex/worktrees` 아래 원본·보존·후보 작업트리의 경로와
등록이 사라졌다. 이 채팅은 삭제·정리 명령을 실행하지 않았으며 원인은 확정하지 못했다.
실행 중이던 최종 하네스와 새 ZIP 재열기 검증은 중단으로 기록했고, DB 17파일 재실행은
Vite 설정을 읽는 단계에서 종료되어 suite를 하나도 실행하지 않았다. 이를 성공으로 세지 않는다.

Git 객체 `e8ea1cfc7`, `f774af067`, `5b86681ec`는 남아 있어 별도 보존 ref를 다시 만들고,
`5b86681ec`의 정확한 tree를 위 새 작업트리에 복구했다. 기준 `fa68e24ef`가 필요한 증분
Git bundle도 생성·검증했다. 새 작업트리는 진행 중 정리를 막도록 잠갔고 의존성을 offline·
frozen lockfile로 재설치했다. 기존 canonical main의 미발행 세 커밋은 변경하지 않았다.
복구 뒤 하네스·정규 CI DB 명령·최종 원고 재열기를 새 환경에서 다시 검증하며 원래 로그와
중단 로그를 모두 보존한다. 이후 실행 결과는 PR의 검증 기록에 추가한다.

### 원격 전체 PostgreSQL 진단의 후속 보정

후속 PR #2711의 `a48769219`에서는 정규 Core DB와 별도로 전체 PostgreSQL 28파일을
실행하는 진단이 readiness 목록 순서 한 건에서 실패했다. native 저장 11개는 통과했고,
테이블 누락이나 ACL 실패가 아니라 SQL의 정렬된 카탈로그 결과와 정본 목록의 순서 차이였다.
`health-readiness.repository.ts`에서 두 bg3d 테이블 이름만 알파벳 위치로 옮긴다. 이름·개수와
실제 순서 무관 `containsEvery` 판정은 그대로 유지하며 기존 통합 테스트의 비교도 완화하지 않는다.
따라서 최초 25파일 보강 뒤에는 이 API 목록 순서 보정이 추가된다. 실제 편집·저장·권한 경로는 바뀌지 않는다.

새 로컬 DB와 고유 비소유 runtime role을 정규 bootstrap해 121개 migration의 checksum·
capability를 확인한 뒤 전체 PostgreSQL runner는 **28파일 502개 통과·기존 조건부 skip 1개**,
marketplace verifier까지 exit 0이었다. skip은 `PRODUCTION_OPERATION_TEST_RUNTIME_ROLE`
미설정 시의 기존 operation-policy 조건이다. readiness 3개와 native 11개는 모두 실행했다.
정적 health 11파일 146개, API 생산 CJS·테스트 ESM 타입, lint·기존 1,690줄 한도를 통과했다.
기존 Core DB와 새 DB의 계정·공유 정책은 모두 0→0으로 유지됐다. 최초 bootstrap의 URL password
형식 거부는 DDL 실행 전 종료였으며, 기존 role/password를 바꾸지 않고 로컬 trust 연결의 URL
형식을 맞춰 재실행했다. 운영 환경의 인증·TLS 검사를 우회한 결과가 아니다.

같은 head의 Discovery·Material 실패는 과거 main에서도 같은 source/workflow로 재현된
별도 CI 불일치였다. Discovery는 이동한 `export`·`planning`·`live` 시험 세 개의 lint·unit·
이벤트 감시 경로만 현재 위치로 맞춘다. Material은 실제 일반 caller가 기존 물리 이미지 ID를
전달하는 계약에 맞춰 두 번째 fixture의 `canonicalImageId`만 첫 transaction의 ID로 바꾼다.
물리 레이어 한 개·원본 두 획의 누적·scope admission·wiring assertion은 유지하며 관련
3파일 22개 회귀를 통과했다. 브러시 제품 동작·권한·clip·제한 편집 경로는 바꾸지 않는다.

## 4. 운영과 기능 범위

0121은 검토 가능한 추가형 migration 파일이다. 이 작업은 운영 DB·객체 저장소·환경변수·
quota·배포를 변경하지 않는다. 이미 승인된 다른 세션의 릴리스에는 이 변경이 섞이지 않도록
정확한 릴리스 SHA와 6패스 병합 순서를 조율한다.

기능 지원과 외부 파일 호환성은 [6패스 구현 보고](bg3d-six-pass-bundle-implementation-2026-11-05.md)의
범위를 유지한다. 내부 도형 기반 6패스 저장/원고 전달 검증을 SketchUp·Blender 전체 기능
동등성이나 Higgsfield 외부 서비스 통합 완료로 표시하지 않는다.
