# 타입 검사·빌드 명령 전환의 계약 검토 — 2026-11-05

상태: 읽기 전용 정적 조사. 기준 HEAD `b063d8e52c00d6f500a3eea37c7cda80f05973f9`.
대상 `scripts/`, `.github/`. 저장소·index·branch를 수정하지 않았고 테스트·heavy job을 실행하지 않았다.
타 담당 fixture.js·legacyV1·UX·runner disk·Mixbox 계약을 수정하지 않았다.

## 직접 충돌하는 assertion

1. `scripts/scene3d-output-ci-policy.test.mjs:29` — 부모가 이미 수정 중인 알려진 항목.
   실제 root `scripts.typecheck`에서 과거 `tsc -p tsconfig.json --incremental false`를 찾는다.
   `pnpm run typecheck:web` 호출과 별도의 `scripts["typecheck:web"]` bounded-runner 명령을 확인하도록
   바꾸고 workspace 검증·API stage의 기존 assertion은 유지한다.

2. `scripts/integration-test-runner-ci-policy.test.mjs:142–144` — 추가로 확인된 실제 충돌.
   131행에서 현재 `package.json`을 읽고142행의 `expect(packageManifest.scripts?.build).toBe(...)`가
   143행의 과거16GiB monolithic tsc + Vite 명령을 기대한다. fixture가 아니다.
   기대 문자열을 다음으로 갱신한다.

   ```text
   pnpm run typecheck:web && NODE_OPTIONS='--max-old-space-size=12288' vite build --config apps/web/vite.config.ts
   ```

   필요하면 bounded-runner entrypoint를 별도로 검증하되, 145–146행의 `build:bundle` Vite 명령과
   152–156행의 pre/post hook 검증을 그대로 유지한다. 140–141행의 설명은 monolithic tsc 대신
   전체 프로그램 문맥을 유지하는 noEmit bounded typecheck를 먼저 실행한다는 현재 의미로 갱신한다.

## 직접 충돌로 분류하지 않은 항목

- `scripts/__tests__/bundle-visualizer-contract.test.mjs:33–38`: `bundle:visualize`와 opt-in 제한 검증이다.
  b063의91행 명령과 일치한다. root build의 타입 검사 변경과 충돌하지 않는다.
- `scripts/ci-executed-gates.test.mjs:127–135`, `scripts/ci-merge-reliability.test.mjs:89–93`,
  `scripts/integration-test-runner-ci-policy.test.mjs:325–334`: CI가 `pnpm run typecheck`와
  별도 `build:bundle`을 호출한다는 검증이다. 명령 분리가 유지되어 이번 전환과 충돌하지 않는다.
- `scripts/creator-hub-validation-budget.test.mjs:12–13`: 전용 workflow 안의 직접 tsc 두 단계를 확인한다.
  root package 명령을 비교하는 stale assertion이 아니며, 해당 workflow도 여전히 같은 직접 tsc를 호출한다.
  원래 workflow의 메모리 전략은 이번 계약 수정과 별개다.
- `scripts/desktop-sync-release.test.mjs:128–131`: desktop-sync 자체 tsconfig를 실제로 컴파일하는 경로다.
  root 웹 typecheck 전환과 관계없다.
- `scripts/typecheck-shards.test.mjs:151`: 작은 임시 fixture를 실제 tsc와 비교하는 의미 검증이다.
  root monolithic 명령을 다시 요구하는 계약이 아니다.

`tsc`, `--incremental`, 기존16GiB 명령, root `scripts.build`·`scripts.typecheck` 접근,
build/typecheck 관련 문자열 assertion을 여러 정적 검색으로 대조했다. 위 두 항목 외에는
이번 canonical 명령 전환과 직접 충돌하는 stale assertion을 발견하지 못했다.
이 결론은 전체 테스트 통과를 주장하지 않으며 타 담당 실패의 수정 범위도 넓히지 않는다.
