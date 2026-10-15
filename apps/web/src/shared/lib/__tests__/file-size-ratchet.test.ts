import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { evaluateSizes, validateBaseline } from "../../../../../../scripts/lib/source-file-size-ratchet.mjs";
import { listCandidateFiles, measureSourceFiles } from "../../../../../../scripts/lib/source-file-size-scan.mjs";

/**
 * 소스 파일 크기 래칫의 전체 시험(Vitest) 쪽 집행 (2026-10-02 도입, 2026-10-15 기준선 단일화).
 *
 * 배경: StudioCuttoonEditorHost.tsx 29,642줄처럼 단일 파일이 비대해지면 리뷰·충돌·
 * 도구 타임아웃이 구조적으로 반복된다. 이 래칫은 "현 상태 동결 + 축소만 허용"으로
 * 재발을 막는다.
 *
 * 규칙·상한·기준선·줄 수 측정의 권위는 scripts/check-source-file-size.mjs 와
 * scripts/source-file-size-baseline.json 한 곳이다(`pnpm run check:source-file-size`).
 * CI core 의 typecheck 잡이 의존성 설치 전에, 푸시 훅의 validate:architecture 가 돌린다.
 * 이 시험은 같은 판정 함수와 같은 기준선을 읽어 전체 시험(`pnpm test`)에서도 같은 규칙이
 * 지켜지는지 확인할 뿐, 상한이나 기준선을 따로 두지 않는다.
 *
 * 단일화 이유: 이 파일은 apps/web/src 만 따로 세는 규칙(새 파일 1,000줄)과 별도 기준선
 * (file-size-ratchet-baseline.json, 327개)을 가지고 있었다. 새 게이트가 생긴 뒤에도 그 기준선은
 * 갱신되지 않아 기록 줄 수를 넘긴 파일 48개와 천장이 없는 1,000줄 초과 파일 13개가 쌓였고,
 * 같은 파일을 서로 다른 기준선으로 지키는 두 규칙은 CI 가 지키는 새 게이트와 다른 말을 했다.
 * 기준선 한 곳으로 합치면서 새 파일 상한은 1,000줄에서 800줄로 조여졌고 대상은 웹 소스에서
 * 저장소 전체 소스로 넓어졌다. 새 게이트(CLI)는 바꾸지 않았다.
 *
 * 규칙: 기준선에 없는 파일은 limit 줄을 넘을 수 없고, 기준선에 기록된 큰 파일은 기록 줄 수보다
 * 늘 수 없으며, 새 `// @ts-nocheck` 를 둘 수 없다. 파일을 줄였으면 같은 변경에서
 * `node scripts/check-source-file-size.mjs --tighten` 으로 기준선도 낮춘다(천장이 다시 올라가지 않게).
 * 새 초과 파일은 `--update-baseline --reason "<사유>"` 로만 등록한다.
 */
const ROOT = fileURLToPath(new URL("../../../../../../", import.meta.url));
const BASELINE_FILE = path.join(ROOT, "scripts", "source-file-size-baseline.json");

/** 판정 함수(scripts/lib/source-file-size-ratchet.mjs 의 evaluateSizes)가 돌려주는 위반 한 건. */
interface SizeViolation {
  readonly kind: "new-over-limit" | "grew" | "new-ts-nocheck";
  readonly file: string;
  readonly lines?: number;
  readonly limit?: number;
  readonly recorded?: number;
}

interface SizeBaseline {
  readonly limit: number;
  readonly files: Record<string, number>;
  readonly tsNoCheck: string[];
}

interface RepositoryScan {
  readonly scanned: number;
  readonly violations: readonly SizeViolation[];
}

let cachedScan: RepositoryScan | undefined;

/** 저장소 소스 전체를 한 번만 훑는다(소스 1만여 개). 이후 시험은 같은 결과를 쓴다. */
function repositoryScan(): RepositoryScan {
  if (cachedScan) return cachedScan;
  const raw: unknown = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const baseline = validateBaseline(raw) as SizeBaseline;
  const measurements = measureSourceFiles(ROOT, listCandidateFiles(ROOT));
  const evaluation = evaluateSizes({ measurements, baseline });
  cachedScan = { scanned: evaluation.summary.scanned, violations: evaluation.violations as readonly SizeViolation[] };
  return cachedScan;
}

const violationsOf = (kind: SizeViolation["kind"]): readonly SizeViolation[] =>
  repositoryScan().violations.filter((violation) => violation.kind === kind);

describe("file size ratchet", () => {
  it("scans the repository sources instead of passing vacuously", () => {
    expect(repositoryScan().scanned).toBeGreaterThan(1000);
  }, 60_000);

  it("freezes recorded giants at their recorded line counts (shrink-only)", () => {
    const grew = violationsOf("grew").map(
      (violation) => `${violation.file}: ${violation.lines} lines > recorded ceiling ${violation.recorded} (shrink-only)`,
    );
    expect(grew).toEqual([]);
  }, 60_000);

  it("keeps new files within the limit and records a baseline ceiling for every oversized file", () => {
    const oversized = violationsOf("new-over-limit").map(
      (violation) => `${violation.file}: ${violation.lines} lines > new-file limit ${violation.limit} (split it, or register it with --update-baseline --reason)`,
    );
    expect(oversized).toEqual([]);
  }, 60_000);

  it("allows no new @ts-nocheck directive", () => {
    expect(violationsOf("new-ts-nocheck").map((violation) => violation.file)).toEqual([]);
  }, 60_000);
});
