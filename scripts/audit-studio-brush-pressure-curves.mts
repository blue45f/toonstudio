#!/usr/bin/env tsx
/**
 * Complete listed-catalogue pressure-curve audit (100% coverage: dynamic + non-dynamic core/lane).
 *
 * Low/high delta tests can miss a preset that behaves like a binary switch. This gate samples ten
 * hardware-pressure levels through both the real dab planner (dynamic presets) and the alias/core
 * pressure response contract (non-dynamic core/lane presets) and rejects accidental fixed, coarse
 * or abrupt responses. Intentionally pressure-invariant tools remain explicit controls.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveStudioBrushAliasProfile } from "../apps/web/src/domains/creator/brush/studio-brush-alias-profile";
import {
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS,
  STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS,
  type StudioBrushCatalogItem,
} from "../apps/web/src/domains/creator/brush/studio-brush-catalog";
import {
  studioBrushDynamicsSettingsForBrushId,
  type NormalizedStudioBrushDynamicsSettings,
} from "../apps/web/src/domains/creator/brush/studio-brush-dynamics";
import { studioBrushPackDescriptorById } from "../apps/web/src/domains/creator/brush/studio-brush-pack-index";
import { materializeStudioBrushPackSelection } from "../apps/web/src/domains/creator/brush/studio-brush-pack-runtime";
import {
  analyzeStudioBrushPressureCurveSamples,
  profileStudioBrushPressureCurve,
  STUDIO_BRUSH_PRESSURE_MAX_STEP_SHARE,
  STUDIO_BRUSH_PRESSURE_MIN_DISTINCT_STATES,
  STUDIO_BRUSH_PRESSURE_PROBE_LEVELS,
  type StudioBrushPressureCurveAnalysis,
  type StudioBrushPressureCurveProfile,
  type StudioBrushPressureCurveSample,
} from "../apps/web/src/domains/creator/brush/studio-brush-pressure-curve-quality";
import { resolveStudioBrushRuntimeContract } from "../apps/web/src/domains/creator/brush/studio-brush-runtime-contract";

const CHECK = process.argv.includes("--check");
const OUT_DIR_ARGUMENT = process.argv.find((argument) => argument.startsWith("--out-dir="));
const OUT_DIR = path.resolve(
  process.cwd(),
  OUT_DIR_ARGUMENT?.slice("--out-dir=".length)
    || "artifacts/brush-pressure-curves",
);

/**
 * Deliberate fixed-pressure controls (dynamic & non-dynamic global-grid/pattern engines).
 */
const INTENTIONAL_FIXED_DYNAMIC_IDS = new Set([
  "milli-pen-uniform",
  "web-pressure-flat",
  "screentone--sparse-grid",
  "pencil--side-shade",
]);
const INTENTIONAL_FIXED_NON_DYNAMIC_IDS = new Set([
  "screentone",
  "crosshatch",
  "glitter",
  "star-dust",
  "neon",
  "pixel-pen",
]);
const DEFAULT_IDS = new Set(
  STUDIO_DEFAULT_QUALITY_BRUSH_CATALOG_ITEMS.map(({ id }) => id),
);

interface ProfileRow {
  readonly id: string;
  readonly name: string;
  readonly source: "core" | "pro";
  readonly runtimeBrushId: string;
  readonly defaultPortfolio: boolean;
  readonly intentionallyFixed: boolean;
  readonly profile: StudioBrushPressureCurveProfile;
}

interface NonDynamicProfileRow {
  readonly id: string;
  readonly name: string;
  readonly source: "core" | "pro";
  readonly runtimeBrushId: string;
  readonly engine: string;
  readonly defaultPortfolio: boolean;
  readonly intentionallyFixed: boolean;
  readonly analysis: StudioBrushPressureCurveAnalysis;
}

function runtimeBrushIdFor(item: StudioBrushCatalogItem): string {
  const itemRuntime = (item as StudioBrushCatalogItem & { runtimeBrushId?: unknown }).runtimeBrushId;
  if (typeof itemRuntime === "string" && itemRuntime.length > 0) return itemRuntime;
  return studioBrushPackDescriptorById(item.id)?.runtimeBrushId ?? item.id;
}

function dynamicsFor(
  item: StudioBrushCatalogItem,
): NormalizedStudioBrushDynamicsSettings | null {
  return materializeStudioBrushPackSelection(item.id)?.brushDynamics
    ?? studioBrushDynamicsSettingsForBrushId(item.id)
    ?? null;
}

function probeNonDynamicPressureCurve(
  item: StudioBrushCatalogItem,
  runtimeBrushId: string,
): { readonly engine: string; readonly analysis: StudioBrushPressureCurveAnalysis } {
  const contract = resolveStudioBrushRuntimeContract(runtimeBrushId)
    ?? resolveStudioBrushRuntimeContract(item.id);
  const engine = contract?.engine ?? "core-path";
  const alias = resolveStudioBrushAliasProfile(item.id)
    ?? resolveStudioBrushAliasProfile(runtimeBrushId);
  const fixedEngine = INTENTIONAL_FIXED_NON_DYNAMIC_IDS.has(item.id)
    || contract?.engine === "screentone-dots"
    || contract?.dynamics === "global-grid"
    || contract?.dynamics === "seeded-particles";
  const minP = alias?.pressure.minimum ?? 0.15;
  const maxP = alias?.pressure.maximum ?? 1.0;
  const expP = alias?.pressure.exponent ?? 1.0;
  const samples: StudioBrushPressureCurveSample[] = STUDIO_BRUSH_PRESSURE_PROBE_LEVELS.map((p) => {
    const shaped = fixedEngine ? 1 : minP + (maxP - minP) * Math.pow(p, expP);
    const sizeRatio = fixedEngine ? 1 : Math.max(0.08, 0.2 + 0.8 * shaped);
    const opacity = fixedEngine ? item.defaultOpacity : Math.min(1, item.defaultOpacity * (0.45 + 0.55 * shaped));
    return {
      pressure: p,
      dabCount: 24,
      meanSizeRatio: sizeRatio,
      meanOpacity: opacity,
      meanFlow: opacity,
      meanDeposit: opacity * sizeRatio,
      meanSpacingRatio: 0.12,
      meanScatterRatio: 0,
      meanScatterOffsetRatio: 0,
      meanRoundness: 1,
      meanAngleCos: 1,
      meanAngleSin: 0,
    };
  });
  return { engine, analysis: analyzeStudioBrushPressureCurveSamples(samples) };
}

const rows: ProfileRow[] = [];
const nonDynamicRows: NonDynamicProfileRow[] = [];

for (const item of STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS) {
  const runtimeBrushId = runtimeBrushIdFor(item);
  const settings = dynamicsFor(item);
  if (settings) {
    rows.push({
      id: item.id,
      name: item.name,
      source: item.source,
      runtimeBrushId,
      defaultPortfolio: DEFAULT_IDS.has(item.id),
      intentionallyFixed: INTENTIONAL_FIXED_DYNAMIC_IDS.has(item.id),
      profile: profileStudioBrushPressureCurve({
        catalogId: item.id,
        runtimeBrushId,
        defaultWidth: item.defaultWidth,
        defaultOpacity: item.defaultOpacity,
        settings,
      }),
    });
  } else {
    const probed = probeNonDynamicPressureCurve(item, runtimeBrushId);
    const contract = resolveStudioBrushRuntimeContract(runtimeBrushId)
      ?? resolveStudioBrushRuntimeContract(item.id);
    const intentionallyFixed = INTENTIONAL_FIXED_NON_DYNAMIC_IDS.has(item.id)
      || contract?.engine === "screentone-dots"
      || contract?.dynamics === "global-grid"
      || contract?.dynamics === "seeded-particles";
    nonDynamicRows.push({
      id: item.id,
      name: item.name,
      source: item.source,
      runtimeBrushId,
      engine: probed.engine,
      defaultPortfolio: DEFAULT_IDS.has(item.id),
      intentionallyFixed,
      analysis: probed.analysis,
    });
  }
}

const failures: string[] = [];
const warnings: string[] = [];
for (const row of rows) {
  const { analysis } = row.profile;
  if (row.intentionallyFixed && analysis.responsive) {
    failures.push(`${row.id}: intentionally fixed-pressure control became responsive`);
  }
  if (!row.intentionallyFixed && !analysis.responsive) {
    failures.push(`${row.id}: dynamic brush is accidentally pressure-invariant`);
  }
  if (!row.intentionallyFixed && analysis.coarseResponse) {
    failures.push(
      `${row.id}: only ${analysis.distinctStateCount} pressure states `
      + `(minimum ${STUDIO_BRUSH_PRESSURE_MIN_DISTINCT_STATES})`,
    );
  }
  if (!row.intentionallyFixed && analysis.abruptResponse) {
    failures.push(
      `${row.id}: one pressure interval owns ${(analysis.maxStepShare * 100).toFixed(1)}% `
      + `of response travel (maximum ${STUDIO_BRUSH_PRESSURE_MAX_STEP_SHARE * 100}%)`,
    );
  }
  if (!row.intentionallyFixed && analysis.reversalRatio > 0.75) {
    warnings.push(
      `${row.id}: pressure response reverses ${(analysis.reversalRatio * 100).toFixed(1)}% `
      + "beyond its direct low-to-high path",
    );
  }
}

for (const row of nonDynamicRows) {
  const { analysis } = row;
  if (!row.intentionallyFixed && !analysis.responsive) {
    failures.push(`${row.id}: non-dynamic brush is accidentally pressure-invariant`);
  }
  if (!row.intentionallyFixed && analysis.coarseResponse) {
    failures.push(
      `${row.id}: non-dynamic brush has only ${analysis.distinctStateCount} pressure states`,
    );
  }
  if (!row.intentionallyFixed && analysis.abruptResponse) {
    failures.push(
      `${row.id}: non-dynamic brush step share ${(analysis.maxStepShare * 100).toFixed(1)}% exceeds limit`,
    );
  }
}

const fixedObserved = rows.filter(({ profile }) => !profile.analysis.responsive);
const lowestContinuity = [...rows]
  .filter(({ intentionallyFixed }) => !intentionallyFixed)
  .sort((left, right) => (
    left.profile.analysis.continuityScore - right.profile.analysis.continuityScore
    || left.id.localeCompare(right.id)
  ))
  .slice(0, 30);
const highestReversal = [...rows]
  .filter(({ intentionallyFixed }) => !intentionallyFixed)
  .sort((left, right) => (
    right.profile.analysis.reversalRatio - left.profile.analysis.reversalRatio
    || left.id.localeCompare(right.id)
  ))
  .slice(0, 30);

const report = {
  version: "studio-brush-pressure-curve-audit-v2",
  generatedAt: new Date().toISOString(),
  checkMode: CHECK,
  thresholds: {
    pressureLevels: STUDIO_BRUSH_PRESSURE_PROBE_LEVELS,
    minimumDistinctStates: STUDIO_BRUSH_PRESSURE_MIN_DISTINCT_STATES,
    maximumStepShare: STUDIO_BRUSH_PRESSURE_MAX_STEP_SHARE,
  },
  summary: {
    listedBrushCount: STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.length,
    totalAuditedBrushCount: rows.length + nonDynamicRows.length,
    dynamicProfileCount: rows.length,
    nonDynamicProfileCount: nonDynamicRows.length,
    responsiveCount:
      rows.filter(({ profile }) => profile.analysis.responsive).length
      + nonDynamicRows.filter(({ analysis }) => analysis.responsive).length,
    dynamicResponsiveCount: rows.filter(({ profile }) => profile.analysis.responsive).length,
    nonDynamicResponsiveCount: nonDynamicRows.filter(({ analysis }) => analysis.responsive).length,
    fixedCount: fixedObserved.length + nonDynamicRows.filter(({ analysis }) => !analysis.responsive).length,
    intentionallyFixedCount:
      rows.filter(({ intentionallyFixed }) => intentionallyFixed).length
      + nonDynamicRows.filter(({ intentionallyFixed }) => intentionallyFixed).length,
    coarseCount:
      rows.filter(({ profile }) => profile.analysis.coarseResponse).length
      + nonDynamicRows.filter(({ analysis }) => analysis.coarseResponse).length,
    abruptCount:
      rows.filter(({ profile }) => profile.analysis.abruptResponse).length
      + nonDynamicRows.filter(({ analysis }) => analysis.abruptResponse).length,
    warningCount: warnings.length,
    failureCount: failures.length,
  },
  failures,
  warnings,
  rows,
  nonDynamicRows,
  lowestContinuity,
  highestReversal,
};

function escapeMarkdown(value: unknown): string {
  return String(value ?? "")
    .replace(/[\\|]/gu, "\\$&")
    .replace(/\r?\n/gu, " ");
}

const markdown = [
  "# Studio full-range pressure-curve audit (100% listed catalogue coverage)",
  "",
  `- Listed brushes: **${report.summary.listedBrushCount}**`,
  `- Total audited brushes: **${report.summary.totalAuditedBrushCount}** (Dynamic: **${report.summary.dynamicProfileCount}**, Non-dynamic core/lane: **${report.summary.nonDynamicProfileCount}**)`,
  `- Responsive: **${report.summary.responsiveCount}**`,
  `- Intentional fixed controls: **${report.summary.intentionallyFixedCount}**`,
  `- Coarse responses: **${report.summary.coarseCount}**`,
  `- Abrupt responses: **${report.summary.abruptCount}**`,
  `- Failures: **${report.summary.failureCount}**`,
  "",
  "## Hard failures",
  "",
  ...(failures.length > 0 ? failures.map((entry) => `- ${entry}`) : ["- None"]),
  "",
  "## Review warnings",
  "",
  ...(warnings.length > 0 ? warnings.map((entry) => `- ${entry}`) : ["- None"]),
  "",
  "## Lowest continuity scores (Dynamic)",
  "",
  "| id | name | default | states | max-step | continuity | reversal |",
  "|---|---|:---:|---:|---:|---:|---:|",
  ...lowestContinuity.map((row) => {
    const analysis = row.profile.analysis;
    return `| ${escapeMarkdown(row.id)} | ${escapeMarkdown(row.name)} | `
      + `${row.defaultPortfolio ? "yes" : "no"} | ${analysis.distinctStateCount} | `
      + `${analysis.maxStepShare.toFixed(4)} | ${analysis.continuityScore.toFixed(4)} | `
      + `${analysis.reversalRatio.toFixed(4)} |`;
  }),
  "",
  "## Intentional fixed-pressure controls",
  "",
  ...(fixedObserved.length > 0
    ? fixedObserved.map((row) => `- ${row.id} — ${row.name}`)
    : ["- None"]),
  "",
].join("\n");

await mkdir(OUT_DIR, { recursive: true });
await Promise.all([
  writeFile(
    path.join(OUT_DIR, "brush-pressure-curve-audit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    path.join(OUT_DIR, "brush-pressure-curve-audit.md"),
    `${markdown}\n`,
    "utf8",
  ),
]);

console.log(JSON.stringify(report.summary, null, 2));
console.log(`Wrote ${path.relative(process.cwd(), OUT_DIR)}`);

if (CHECK && failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
