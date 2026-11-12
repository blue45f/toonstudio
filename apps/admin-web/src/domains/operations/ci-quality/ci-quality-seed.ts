import type { QualityBoard, QualityCheck } from "./ci-quality-model";

const metadata: readonly [string, string, string, QualityCheck["group"], string, string, string][] = [
  ["vitest", "Vitest", "단위·회귀·성능 테스트", "tests", "bolt", "pnpm run test:root\npnpm run test:perf\nnode scripts/ci-core-regression-shards.mjs <shard>", "package.json · .github/workflows/ci.yml · scripts/ci-core-regression-shards-impl.mjs"],
  ["playwright", "Playwright", "브라우저·접근성 워크플로", "tests", "browser", "pnpm run test:a11y\npnpm exec playwright test --config playwright.production-workflows.config.ts", "package.json · .github/workflows/ci.yml"],
  ["types", "타입 검사", "TypeScript·타입 커버리지", "quality", "code", "pnpm run typecheck\npnpm run typecheck:cloudflare-realtime\npnpm run check:type-coverage", "package.json · .github/workflows/ci.yml"],
  ["lint", "Lint", "정적 분석·코드 규칙", "quality", "list", "pnpm run lint:strict", "package.json · .github/workflows/ci.yml (PR은 lint-changed)"],
  ["csp", "CSP", "콘텐츠 보안 정책·dist 검증", "quality", "shield", "pnpm run verify:csp", "package.json · .github/workflows/ci.yml · postbuild 검증"],
  ["licenses", "라이선스", "의존성 정책·배포 고지", "quality", "file", "pnpm run audit:licenses", "package.json · .github/workflows/ci.yml · postbuild notices"],
  ["bundle", "번들 예산", "Studio·제품 투어 청크", "quality", "box", "pnpm run check:studio-bundle\npnpm run check:product-tour-remotion-chunks", "package.json · .github/workflows/ci.yml"],
  ["harness", "에이전트 하네스", "변경 범위별 빠른 게이트", "gates", "grid", "pnpm harness:verify", "AGENTS.md · package.json"],
  ["architecture", "아키텍처 경계", "앱 경계·패키지 구조", "gates", "box", "pnpm run validate:architecture", "AGENTS.md · package.json"],
  ["toolchain", "도구 체인 커버리지", "전용 도구 체인 게이트", "gates", "settings", "pnpm run verify:toolchain-coverage", "package.json · .github/workflows/ci.yml"],
  ["ci-core", "CI · core", "필수 CI 집계·전체 suite와 구분", "gates", "shield", "GitHub Actions · CI / core (결과 참조 전용)", ".github/workflows/ci.yml"],
  ["ci-verify", "CI · verify", "core 종속 최종 게이트", "gates", "check", "GitHub Actions · CI / verify (결과 참조 전용)", ".github/workflows/ci.yml"],
];

/** 2026-11-12 관측한 커밋 스냅샷이며 CI 결과를 추정하지 않는다. */
export function createQualityBoard(now = Date.now()): QualityBoard {
  const checks: QualityCheck[] = metadata.map(([id, name, subtitle, group, icon, command, source]) => ({
    id, name, subtitle, group, icon, command, source, status: "unknown", sha: "", executedAt: "", scope: "", logUrl: "", summary: "",
    stats: { passed: null, failed: null, skipped: null, total: null, duration: null },
    failure: { change: "", baseline: "", diff: "", cause: "", action: "", classification: "unknown" }, ciJson: null, updatedAt: "",
  }));
  const observedSha = "933caa71cf57f79d783a7703ccfc60bb93a98e00";
  return {
    schemaVersion: 1, project: "ToonStudio", mode: "manual", snapshotAt: new Date(now).toISOString(),
    commit: { sha: observedSha, message: "fix(test): critical 예산 재기준선에 사전 점검 기대값 정렬", committedAt: "2026-11-11T22:25:35+09:00", observedAt: "2026-11-12T06:46:20Z", source: "remote-main", url: `https://github.com/blue45f/toonstudio/commit/${observedSha}` },
    ttlHours: 24, checks, qa: { provider: "Testifly", integration: "reference-only", results: [] },
    approvals: [
      { id: "code", title: "코드 수정", icon: "code", category: "SOURCE CHANGE", description: "수정 제안·변경 범위·예상 영향을 기록합니다.", note: "", status: "approval", updatedAt: "" },
      { id: "deploy", title: "외부 배포", icon: "box", category: "DEPLOYMENT", description: "대상 SHA·검증 근거·배포 대상·롤백 계획을 기록합니다.", note: "", status: "approval", updatedAt: "" },
      { id: "account", title: "계정 설정 변경", icon: "settings", category: "ACCOUNT & INTEGRATION", description: "연결·권한·설정 변경의 필요성과 비용 영향을 기록합니다.", note: "", status: "approval", updatedAt: "" },
    ], history: [],
  };
}
