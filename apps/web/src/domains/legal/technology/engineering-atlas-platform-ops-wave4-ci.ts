import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · platform-ops · Wave-4 HyperCore:
 * 스마트 CI 변경 파일 역방향 의존성 그래프 경로 필터 & Graham LPT 샤드 부하 분산기.
 */
export const PLATFORM_OPS_WAVE4_CI_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "smart-ci-dep-graph-lpt-shard-scheduler",
    category: "platform-ops",
    name: "Smart CI Dependency Filter · LPT Shard Scheduler",
    title: t("스마트 CI 역방향 의존성 경로 필터 · LPT 샤드 분산기", "Smart CI reverse-dependency filter & LPT shard load-balancer"),
    status: "experimental",
    tagline: t(
      "단위 테스트에서 core·verify를 유지하며 영향 범위와 LPT 샤드 배치를 계산하는 계획기를 확인했습니다.",
      "Unit tests verify a planner that keeps core and verify, computes affected scopes and uses LPT to assign shards.",
    ),
    background: [
      t(
        "모노레포 규모가 커질수록 문서 한 줄이나 단일 프런트엔드 컴포넌트 수정에도 전체 DB 통합·마켓 E2E·3D 런타임 스위트가 모두 돌면 러너 대기 시간과 비용이 늘어나고, 반대로 단순 경로 건너뛰기를 잘못 쓰면 필수 브랜치 보호 체크가 영원히 Pending 상태로 멈춥니다.",
        "Running every heavy E2E and DB workflow on tiny edits wastes runner minutes, yet naive path skipping stalls branch protection if required status checks are omitted.",
      ),
      t(
        "ci-smart-shard-scheduler.ts 의 propagateImpactedPackages 는 변경 파일에서 출발해 모노레포 역방향 패키지 의존성을 전파하되, MANDATORY_RELEASE_GATES(core, verify)는 어떤 변경에서도 무조건 실행 집합에 고정(mandatoryGatesPreserved: true)하고 영향 없는 선택형 중량 워크플로만 건너뜁니다.",
        "propagateImpactedPackages walks reverse workspace dependencies from changed files while unconditionally pinning MANDATORY_RELEASE_GATES (core, verify) so required checks never hang.",
      ),
      t(
        "선택한 테스트를 예상 실행 시간이 긴 순서로 배치합니다. 문서 변경 단위 테스트는 입력으로 준 실행 시간에서 러너 시간 40분 이상 절감을 계산합니다. GitHub Actions 매트릭스 연동은 후속 단계입니다.",
        "The planner assigns selected suites in descending order of estimated duration. A docs-only fixture computes over 40 runner-minutes of savings from supplied durations. Wiring it into the GitHub Actions matrix is a follow-up.",
      ),
    ],
    keyPoints: [
      t("필수 보호 게이트(core · verify) 100% 강제 보존(Pending 교착 원천 방지)", "100% preservation of mandatory core & verify release gates"),
      t("모노레포 역방향 패키지 의존성 전파 및 미분류 루트 변경 fail-closed", "Reverse workspace dependency propagation with fail-closed root guard"),
      t("Graham LPT(4/3 - 1/3m) 알고리즘으로 러너 샤드 완료 시간 균등화", "Graham LPT shard balancing minimizing makespan stragglers"),
      t("기준선 대비 절감된 러너 분(Runner-Minutes) 및 샤드 불균형비 정량 산출", "Quantifies saved runner-minutes and shard imbalance ratio"),
    ],
    diagram: {
      id: "smart-ci-dep-graph-lpt-shard-scheduler-diagram",
      kind: "sequence",
      title: t("역방향 의존성 경로 필터 · 필수 게이트 보존 · LPT 샤드 배치", "Reverse-dep path filter, mandatory gate lock & LPT shard balance"),
      caption: t(
        "변경 파일의 역방향 영향 범위를 계산하되 core·verify 는 항상 잠그고, 선택된 스위트를 긴 순서부터 빈 샤드에 채웁니다.",
        "Computes reverse impact from git diff, locks core+verify, and packs suites longest-first across runner shards.",
      ),
      alt: t(
        "PR 변경 파일 목록이 역방향 의존성 분석기로 들어가 영향 패키지를 구하고, 워크플로 필터가 core 와 verify 필수 게이트를 고정한 채 무관한 중량 잡만 제외한 뒤, LPT 스케줄러가 샤드별 실행 시간을 고르게 맞춥니다.",
        "PR changed files enter the reverse-dependency analyzer; the workflow filter pins core and verify while skipping unrelated heavy jobs, and the LPT balancer equalizes shard durations.",
      ),
      actors: [
        { id: "diff", label: t("PR 변경 파일", "PR git diff"), sub: t("경로 목록 입력", "Changed file paths"), tone: "local" },
        { id: "dep", label: t("역방향 의존성", "Reverse dep graph"), sub: t("패키지 영향 전파", "Impact propagation"), tone: "good" },
        { id: "gate", label: t("게이트 보존 필터", "Gate-safe filter"), sub: t("core+verify 고정", "Pins core + verify"), tone: "warn" },
        { id: "lpt", label: t("LPT 샤드 분산기", "LPT shard balancer"), sub: t("최장 작업 우선 배치", "Longest-first pack"), tone: "good" },
      ],
      messages: [
        { from: "diff", to: "dep", label: t("변경 경로 전달 (미분류는 루트 취급)", "Pass changed paths (fail-closed root)") },
        { from: "dep", to: "gate", label: t("영향받는 상위 패키지 집합 산출", "Emit impacted workspace set") },
        { from: "gate", to: "lpt", label: t("core+verify 유지 + 관련 스위트 전달", "Keep core+verify + affected suites") },
        { from: "lpt", to: "diff", label: t("균등 샤드 계획 · 절감 러너 분 보고", "Return balanced shards & saved mins"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("스마트 CI 역방향 의존성 필터 & Graham LPT 샤드 스케줄러", "Smart CI reverse-dependency filter & Graham LPT shard scheduler"),
        role: t(
          "실험용 계획기를 입력 경로와 예상 실행 시간으로 단위 검증했습니다. GitHub Actions 실행 연결은 후속 단계입니다.",
          "The experimental planner has unit coverage using input paths and estimated durations. Wiring it into GitHub Actions is a follow-up.",
        ),
        paths: [
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/ci-smart-shard-scheduler.ts",
          "apps/web/src/domains/creator/wasm64-wave4-hypercore/wasm64-wave4-hypercore.test.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("Graham LPT(최장 실행 시간 우선) 최소 부하 샤드 선택", "Graham LPT least-loaded shard assignment"),
        language: "ts",
        ...sampleSource([
          ["export function assignLptShards(durationsMs: readonly number[], shardCount: number): readonly number[] {"],
          ["  const loads = new Array<number>(Math.max(1, shardCount)).fill(0);"],
          ["  for (const d of [...durationsMs].sort((a, b) => b - a)) {"],
          ["    let minIdx = 0;"],
          ["    for (let i = 1; i < loads.length; i += 1) if ((loads[i] ?? 0) < (loads[minIdx] ?? 0)) minIdx = i;"],
          ["    loads[minIdx] = (loads[minIdx] ?? 0) + d;", "가장 일찍 비는 샤드에 긴 스위트부터 배정", "pack longest suite onto earliest-free shard"],
          ["  }"],
          ["  return loads;"],
          ["}"],
        ]),
        explain: t(
          "실행 시간이 긴 스위트를 먼저 배치하고 짧은 스위트들로 막바지 차이를 메우면 느린 단일 꼬리 샤드(Straggler) 현상이 크게 줄어듭니다.",
          "Placing long suites first and filling gaps with short suites eliminates slow straggler shards.",
        ),
        source: "apps/web/src/domains/creator/wasm64-wave4-hypercore/ci-smart-shard-scheduler.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "GitHub Docs · Troubleshooting Required Status Checks",
        url: "https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks",
        kind: "docs",
        note: t("브랜치 보호 필수 체크가 생략되면 병합이 차단되는 이유와 설계 기준", "Why required branch-protection checks must always report"),
      },
      {
        title: "Vitest · Test Sharding & CI Performance",
        url: "https://vitest.dev/guide/improving-performance",
        kind: "docs",
        note: t("멀티 샤드 실행 및 테스트 시간 분산 가이드", "Multi-shard test execution reference"),
      },
    ],
    chapterIds: ["quality", "delivery"],
    talk: {
      pitch: t(
        "단위 테스트에서 변경 파일에 따라 러너 계획을 만들고, 선택된 샤드에 core·verify가 포함되는지 확인했습니다.",
        "Unit tests build runner plans for changed paths and check that those plans include core and verify.",
      ),
      analogy: t(
        "공항의 필수 보안 검색대(core·verify)는 모든 승객이 반드시 통과하되, 국제선 환승객이 아니면 세관 재검사는 건너뛰고 가장 줄이 짧은 계산대부터 큰 짐을 배정하는 방식입니다.",
        "Like keeping mandatory airport security open for everyone while skipping customs for domestic flights and routing big bags to the shortest lane.",
      ),
      questions: [
        {
          question: t("알 수 없는 루트 설정 파일이 바뀌면 실수로 테스트를 건너뛰지 않나요?", "Could an unfamiliar root config change accidentally skip tests?"),
          answer: t(
            "classifyChangedFileNode 는 미분류 루트 파일이나 빈 목록이 들어오면 fail-closed 로 전체 워크스페이스 영향(scripts/ci-root)으로 격상해 모든 스위트를 실행합니다.",
            "classifyChangedFileNode fails closed by escalating unknown root files to full workspace impact.",
          ),
        },
      ],
    },
    technologies: ["GitHub Actions", "Vitest", "pnpm", "TypeScript"],
    reviewedAt: "2026-11-26",
  },
];
