/**
 * axe-core 실행 래퍼(@axe-core/playwright). 저장소의 e2e/a11y-smoke.spec.ts 와 같은 WCAG 태그 묶음을 쓴다.
 * best-practice 규칙은 제외한다 — 제목 계층·랜드마크는 이 도구가 별도 항목으로 직접 재기 때문이다(이중 감점 방지).
 */
import { withTimeout } from "./util.mjs";

export const AXE_TAGS = Object.freeze(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);

/**
 * @param {import("playwright").Page} page
 * @param {{ timeoutMs?: number }} [options]
 */
export async function runAxe(page, { timeoutMs = 90_000 } = {}) {
  // 무거운 모듈이라 실제로 분석할 때만 불러온다(--dry 와 단위 시험이 브라우저 패키지에 의존하지 않게).
  const { default: AxeBuilder } = await import("@axe-core/playwright");
  const results = await withTimeout(new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze(), timeoutMs, "axe 분석");
  const violations = results.violations
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? "minor",
      help: violation.help,
      nodes: violation.nodes.length,
      samples: violation.nodes.slice(0, 3).map((node) => ({
        target: node.target.map(String).join(" ").slice(0, 160),
        html: node.html.replace(/\s+/gu, " ").slice(0, 160),
      })),
    }))
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  return {
    measured: true,
    version: results.testEngine?.version ?? "",
    violations,
    incomplete: results.incomplete.length,
    passes: results.passes.length,
  };
}
