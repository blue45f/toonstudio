import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ODIFF_MAX_DIFF_PERCENTAGE,
  ODIFF_OPTIONS,
  ODIFF_THRESHOLD,
  normalizeOdiffResult,
  pairScreenshotsByName,
  summarizeVerdicts,
} from "./lib/visual-regression-odiff.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const readRepo = (relative) => readFileSync(path.join(here, "..", relative), "utf8");

describe("odiff 표준 옵션 동결", () => {
  it("threshold·허용 비율 상수가 표준값으로 고정되고 옵션 객체가 동결된다", () => {
    expect(ODIFF_THRESHOLD).toBe(0.1);
    expect(ODIFF_MAX_DIFF_PERCENTAGE).toBe(0.1);
    expect(ODIFF_OPTIONS).toEqual({
      threshold: 0.1,
      antialiasing: true,
      failOnLayoutDiff: true,
      noFailOnFsErrors: true,
      diffColor: "#ff0000",
    });
    expect(Object.isFrozen(ODIFF_OPTIONS)).toBe(true);
  });
});

describe("normalizeOdiffResult", () => {
  it("match는 그대로 통과한다", () => {
    expect(normalizeOdiffResult({ match: true })).toEqual({
      pass: true, status: "match", reason: null, diffCount: 0, diffPercentage: 0, maxDiffPercentage: 0.1,
    });
  });

  it("허용치 이하·경계값의 pixel-diff는 within-tolerance로 통과한다", () => {
    const within = normalizeOdiffResult({ match: false, reason: "pixel-diff", diffCount: 12, diffPercentage: 0.05 });
    expect(within.pass).toBe(true);
    expect(within.status).toBe("within-tolerance");
    const boundary = normalizeOdiffResult({ match: false, reason: "pixel-diff", diffCount: 24, diffPercentage: 0.1 });
    expect(boundary.pass).toBe(true);
  });

  it("허용치를 넘는 pixel-diff는 실패한다", () => {
    const over = normalizeOdiffResult({ match: false, reason: "pixel-diff", diffCount: 99, diffPercentage: 0.11 });
    expect(over.pass).toBe(false);
    expect(over.status).toBe("pixel-diff");
  });

  it("layout-diff와 file-not-exists는 허용치와 무관하게 실패한다", () => {
    expect(normalizeOdiffResult({ match: false, reason: "layout-diff" }).pass).toBe(false);
    const missing = normalizeOdiffResult({ match: false, reason: "file-not-exists", file: "a.png" });
    expect(missing.pass).toBe(false);
    expect(missing.status).toBe("file-not-exists");
    expect(missing.file).toBe("a.png");
  });

  it("같은 입력은 같은 판정을 돌려준다(재현성)", () => {
    const input = { match: false, reason: "pixel-diff", diffCount: 7, diffPercentage: 0.42 };
    expect(normalizeOdiffResult(input)).toEqual(normalizeOdiffResult(input));
    expect(normalizeOdiffResult(input, { maxDiffPercentage: 0.5 }).pass).toBe(true);
  });

  it("잘못된 허용치와 알 수 없는 결과는 던진다", () => {
    expect(() => normalizeOdiffResult({ match: true }, { maxDiffPercentage: 101 })).toThrow();
    expect(() => normalizeOdiffResult({ match: true }, { maxDiffPercentage: -1 })).toThrow();
    expect(() => normalizeOdiffResult({ match: false, reason: "unknown" })).toThrow();
  });
});

describe("pairScreenshotsByName / summarizeVerdicts", () => {
  it("이름순으로 쌍을 만들고 누락 쪽을 표시한다", () => {
    const pairs = pairScreenshotsByName(["b.png", "a.png"], ["a.png", "c.png"], {
      baselineDir: "/base", actualDir: "/actual", diffDir: "/diff",
    });
    expect(pairs.map((pair) => [pair.name, pair.missing])).toEqual([
      ["a.png", null], ["b.png", "actual"], ["c.png", "baseline"],
    ]);
    expect(pairs[0].baselinePath).toBe(path.join("/base", "a.png"));
  });

  it("요약은 전 항목 통과일 때만 pass다", () => {
    expect(summarizeVerdicts([{ name: "a", pass: true }]).pass).toBe(true);
    const summary = summarizeVerdicts([
      { name: "a", pass: true },
      { name: "b", pass: false, status: "pixel-diff", diffPercentage: 3 },
    ]);
    expect(summary).toEqual({
      pass: false, total: 2, passed: 1, failed: 1,
      failures: [{ name: "b", status: "pixel-diff", diffPercentage: 3 }],
    });
  });
});

describe("배선 계약", () => {
  it("odiff-bin은 devDependencies에만 정확 핀으로 있고 스크립트가 lib를 가리킨다", () => {
    const pkg = JSON.parse(readRepo("package.json"));
    expect(pkg.devDependencies["odiff-bin"]).toBe("4.5.0");
    expect(pkg.dependencies["odiff-bin"]).toBeUndefined();
    expect(pkg.scripts["visual:diff"]).toBe("node scripts/compare-visual-regression.mjs");
    expect(pkg.scripts["test:visual-regression"]).toBe("vitest run scripts/visual-regression-odiff.test.mjs");
  });

  it("주요 시각 감사 2종이 표준 모듈과 AUDIT_BASELINE_DIR 게이트를 공유한다", () => {
    for (const file of ["scripts/audit-sitewide-visual-ux.mjs", "scripts/audit-auth-modal-visual-ux.mjs"]) {
      const source = readRepo(file);
      expect(source).toContain('from "./lib/visual-regression-odiff.mjs"');
      expect(source).toContain("compareScreenshotWithOdiff(");
      expect(source).toContain("AUDIT_BASELINE_DIR");
      expect(source).toContain("visual-regression:${verdict.status}");
    }
  });

  it("CLI가 표준 lib를 통해서만 비교하고 리포트에 시각 필드를 넣지 않는다", () => {
    const source = readRepo("scripts/compare-visual-regression.mjs");
    expect(source).toContain('from "./lib/visual-regression-odiff.mjs"');
    expect(source).toContain("visual-regression-report.json");
    expect(source).not.toContain("generatedAt");
    expect(source).not.toContain("toISOString()");
  });
});
