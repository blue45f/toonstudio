# 6패스 LT와 최신 main의 동작 보존 통합

- 상태: **migration — 검증된 6패스와 main의 동작을 함께 보존하는 통합 후보**
- 작성일: 2026-11-05
- 검증 원본: `e8ea1cfc7e2e784514919cb21869e9697d229212`
- 수신 main: `2fbf6c3160e5f9f8b19df0576079e0b96fa6a296`
- 기존 통합 커밋: `f774af067082c48499007862ee14539b6e312167` — 위 두 SHA를 부모로 한 일반 merge.
- 작업 위치: `codex/bg3d-six-pass-main-20261105`의 독립 작업트리.
- 승인 범위: 충돌 해결·회귀·CI 확인·PR 병합. **운영 DB 적용·배포는 별도 승인**이다.

## 1. 기존 작업 보존과 충돌 판정

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
- 실제 제품 UI에서 GPU 캡처 1회로 22개 객체→6층/1그룹·8 native 본문→두 탭→undo/redo→
  ZIP v5→새 문맥 재열기→22개 객체·38°·lens shift 0.12 재편집→2배 PNG 출력을 확인했다.
  5개 시점의 native/Stage 원본 픽셀·장면·설정·선화 index가 동일했고 page error와 외부 HTTP는 0이다.
  자동화가 모달 mount 전 DOM을 읽은 timing 오류 1회는 raw 기록에 남겼고, 같은 UI를 기다려
  다시 관측했다. 제품 오류나 추가 GPU 캡처로 바꾸어 집계하지 않았다.
- 관련 lint·파일 크기·eager graph 검사를 통과했다. eager graph는 20,490,417 bytes,
  1,671 modules다. 동작 변경이 없는 테스트 fixture는 원래 계약에 맞춰 타입을 명시했다.

정상 push 전 검사와 `pnpm harness:verify`, 정확한 PR head의 `core`·`verify` 및 하위 실행
lane이 모두 성공한 것을 확인한 뒤 병합한다. 과거 PR·다른 SHA의 성공을 대체 근거로 쓰지 않는다.

## 4. 운영과 기능 범위

0121은 검토 가능한 추가형 migration 파일이다. 이 작업은 운영 DB·객체 저장소·환경변수·
quota·배포를 변경하지 않는다. 이미 승인된 다른 세션의 릴리스에는 이 변경이 섞이지 않도록
정확한 릴리스 SHA와 6패스 병합 순서를 조율한다.

기능 지원과 외부 파일 호환성은 [6패스 구현 보고](bg3d-six-pass-bundle-implementation-2026-11-05.md)의
범위를 유지한다. 내부 도형 기반 6패스 저장/원고 전달 검증을 SketchUp·Blender 전체 기능
동등성이나 Higgsfield 외부 서비스 통합 완료로 표시하지 않는다.
