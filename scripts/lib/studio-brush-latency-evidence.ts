import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { readStudioSoakBuildEvidence, type StudioSoakBuildEvidence } from "./studio-soak-evidence";

import type { StudioBrushCatalogItem } from "../../apps/web/src/domains/creator/brush/studio-brush-catalog";
import type { StudioBrushCompetitiveExecutionCase, StudioBrushFrameBudgetEvaluation, StudioBrushFrameBudgetMetrics } from "../studio-brush-frame-budget-policy";
import type { evaluateStudioBrushLatencyCase, StudioBrushLatencyCaseMetrics, StudioBrushLatencyId } from "../studio-brush-latency-policy";

export interface StudioBrushLatencyBrowserErrors {
  readonly console: string[];
  readonly page: string[];
  readonly responses: string[];
  readonly staticPreviewReadinessUnavailable: string[];
}

export interface StudioBrushLatencyResult {
  readonly id: StudioBrushLatencyId;
  readonly name: string;
  readonly source: StudioBrushCatalogItem["source"];
  readonly runtimeMs: number;
  readonly metrics: StudioBrushLatencyCaseMetrics;
  readonly legacyLatencyTelemetry: ReturnType<typeof evaluateStudioBrushLatencyCase>;
  readonly frameBudgetMetrics: StudioBrushFrameBudgetMetrics;
  readonly frameBudgetEvaluation: StudioBrushFrameBudgetEvaluation;
  readonly competitiveExecutionCase: StudioBrushCompetitiveExecutionCase | null;
  readonly actualViewport: Readonly<{ width: number; height: number }>;
  readonly actualDeviceScaleFactor: number;
  readonly eraserFixture: Readonly<{ strokeCount: number; sampledPoints: number; minimumChangedPixels: number }> | null;
  readonly artifacts: Readonly<{ live: string; settled: string }>;
  readonly browserErrors: StudioBrushLatencyBrowserErrors;
}

export interface StudioBrushLatencyProvenance {
  readonly sourceCommit: string;
  readonly sourceDirty: boolean;
  readonly build: StudioSoakBuildEvidence;
}

/** 실행 전후의 소스와 실제 preview 산출물을 함께 기록한다. */
export async function readStudioBrushLatencyProvenance(input: {
  origin: string;
  spawnedPreview: boolean;
  root?: string;
}): Promise<StudioBrushLatencyProvenance> {
  const root = input.root ?? fileURLToPath(new URL("../../", import.meta.url));
  const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const sourceCommit = git(["rev-parse", "HEAD"]);
  const sourceDirty = git(["status", "--porcelain", "--untracked-files=normal"]).length > 0;
  const build = await readStudioSoakBuildEvidence({
    origin: input.origin.replace(/\/+$/u, ""), directory: join(root, "dist"),
    spawnedPreview: input.spawnedPreview, sourceCommit,
  });
  return { sourceCommit, sourceDirty, build };
}

export function evaluateStudioBrushLatencyProvenance(
  before: StudioBrushLatencyProvenance | null,
  after: StudioBrushLatencyProvenance | null,
) {
  const issues: string[] = [];
  for (const [phase, evidence] of [["before", before], ["after", after]] as const) {
    if (!evidence || !/^[0-9a-f]{40}$/u.test(evidence.sourceCommit)
      || evidence.sourceDirty || !evidence.build.verified
      || evidence.build.gitSha !== evidence.sourceCommit
      || !/^[0-9a-f]{64}$/u.test(evidence.build.indexSha256 ?? "")
      || !/^[0-9a-f]{64}$/u.test(evidence.build.metadataSha256 ?? "")) {
      issues.push(`${phase}-build-provenance`);
    }
  }
  if (before && after && (before.sourceCommit !== after.sourceCommit
    || before.build.source !== after.build.source || before.build.buildId !== after.build.buildId
    || before.build.indexSha256 !== after.build.indexSha256
    || before.build.metadataSha256 !== after.build.metadataSha256)) issues.push("build-changed");
  return { ok: issues.length === 0, issues, before, after };
}
