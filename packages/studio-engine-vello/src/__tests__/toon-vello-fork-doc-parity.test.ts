import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 정본 결과 JSON(`tests/benchmarks/results/toon-vello-fork.json`)과 이를 인용하는 문서의 일치 검사.
 *
 * 실브라우저 하니스(`toon-vello-fork-browser-probe.test.ts`, `TOON_VELLO_FORK_PROBE=1`)는 같은 JSON
 * 파일을 덮어쓴다. 다시 측정한 뒤 문서의 교환 비용 표를 고치지 않으면 문서와 정본이 어긋나므로(2026-10-08에
 * 문서 1.89~2.43배 vs JSON 0.93~3.29배로 실제 발생), 이 테스트가 그 어긋남을 막는다.
 * 기본 verify 에서 실행되는 순수 파일 대조이며 브라우저를 열지 않는다.
 */

interface ExchangeCostRow {
  readonly size: number;
  readonly adoptedRenderToSharedTextureP50Ms: number;
  readonly l0ExchangeP50Ms: number;
  readonly exchangeSpeedupVsL0: number;
}

interface ForkResult {
  readonly measuredAt: string;
  readonly browser: { readonly launch: string; readonly version: string };
  readonly exchangeCost: readonly ExchangeCostRow[];
}

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isExchangeCostRow(value: unknown): value is ExchangeCostRow {
  return isRecord(value)
    && typeof value.size === "number"
    && typeof value.adoptedRenderToSharedTextureP50Ms === "number"
    && typeof value.l0ExchangeP50Ms === "number"
    && typeof value.exchangeSpeedupVsL0 === "number";
}

function loadForkResult(): ForkResult {
  const parsed: unknown = JSON.parse(readRepoFile("tests", "benchmarks", "results", "toon-vello-fork.json"));
  if (!isRecord(parsed)) throw new Error("toon-vello-fork.json 형식이 객체가 아닙니다.");
  const { measuredAt, browser, exchangeCost } = parsed;
  if (
    typeof measuredAt !== "string"
    || !isRecord(browser)
    || typeof browser.version !== "string"
    || typeof browser.launch !== "string"
    || !Array.isArray(exchangeCost)
  ) {
    throw new Error("toon-vello-fork.json 에 measuredAt/browser/exchangeCost 가 없습니다.");
  }
  return {
    measuredAt,
    browser: { launch: browser.launch, version: browser.version },
    exchangeCost: exchangeCost.filter(isExchangeCostRow),
  };
}

/** `docs/engines/vello-baseline.md` 의 §3.5 구간만 잘라 낸다. */
function baselineSection35(): string {
  const doc = readRepoFile("docs", "engines", "vello-baseline.md");
  const start = doc.indexOf("### 3.5 ");
  const end = doc.indexOf("### 3.6 ");
  if (start < 0 || end < start) throw new Error("vello-baseline.md 에서 §3.5 구간을 찾지 못했습니다.");
  return doc.slice(start, end);
}

describe("toon-vello-fork.json 과 문서의 일치", () => {
  const result = loadForkResult();

  it("정본 JSON 은 256²·512²·1024² 세 크기의 교환 비용을 담고 배속은 L0÷adopted 로 계산된다", () => {
    expect(result.exchangeCost.map((row) => row.size)).toEqual([256, 512, 1024]);
    for (const row of result.exchangeCost) {
      expect(row.exchangeSpeedupVsL0).toBeCloseTo(row.l0ExchangeP50Ms / row.adoptedRenderToSharedTextureP50Ms, 6);
    }
  });

  it("vello-baseline.md §3.5 의 교환 비용 표가 JSON 값(소수 둘째 자리)과 같다", () => {
    const section = baselineSection35();
    // 표는 목록 항목 안에 들여써 있으므로 줄 앞 공백을 허용한다.
    const tableRows = [...section.matchAll(/^[ \t]*\|\s*(\d+)²\s*\|\s*([\d.]+)ms\s*\|\s*([\d.]+)ms\s*\|\s*([\d.]+)×\s*\|[ \t]*$/gmu)]
      .map((match) => ({
        size: Number(match[1]),
        l0: match[2],
        adopted: match[3],
        speedup: match[4],
      }));

    expect(tableRows).toEqual(result.exchangeCost.map((row) => ({
      size: row.size,
      l0: row.l0ExchangeP50Ms.toFixed(2),
      adopted: row.adoptedRenderToSharedTextureP50Ms.toFixed(2),
      speedup: row.exchangeSpeedupVsL0.toFixed(2),
    })));
  });

  it("문서는 표의 측정 날짜와 브라우저 조건을 함께 적는다", () => {
    const section = baselineSection35();
    expect(section).toContain(result.measuredAt.slice(0, 10));
    expect(section).toContain(result.browser.version);
  });

  it("엔진 후보 조사표도 같은 최소 배속(소수 둘째 자리)과 근거 문서를 인용한다", () => {
    const survey = readRepoFile("docs", "candidates", "engine-portfolio", "capability-survey.md");
    const row = survey.split("\n").find((line) => line.includes("Toon GPU fabric/fork")) ?? "";
    const minSpeedup = Math.min(...result.exchangeCost.map((entry) => entry.exchangeSpeedupVsL0));
    expect(row).toContain(`${minSpeedup.toFixed(2)}×`);
    expect(row).toContain("docs/engines/vello-baseline.md");
  });
});
