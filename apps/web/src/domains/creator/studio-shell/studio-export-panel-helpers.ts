import { resolveStudioExportPageSelection } from "../export/studio-export-page-selection";
import {
  type StudioExportPreflightResult,
  type StudioExportTargetId,
} from "../studio-export-preflight";
import {
  estimateStudioExportBytes,
  recommendedStudioExportDraft,
  type StudioExportDraftInput,
  type StudioManuscriptExportFacts,
  type StudioRecommendedManuscriptBasis,
} from "../studio-project-export-snapshot";

export const EXPORT_TARGET_VISUALS: Readonly<Record<StudioExportTargetId, string>> = {
  "webtoon-platform": "/brand/theme-scenes/ink-studio.svg",
  social: "/brand/theme-scenes/blossom-studio.svg",
  print: "/brand/theme-scenes/paper-studio.svg",
  "image-pdf": "/brand/theme-scenes/sepia-studio.svg",
  editable: "/brand/theme-scenes/graphite-studio.svg",
  ebook: "/brand/theme-scenes/aurora-studio.svg",
  video: "/brand/theme-scenes/starlight-studio.svg",
  archive: "/brand/theme-scenes/midnight-studio.svg",
};

export function computeManuscriptBasis(
  manuscript: StudioManuscriptExportFacts | null,
  selectionMode: "all" | "custom",
  selectionExpression: string,
): StudioRecommendedManuscriptBasis | null {
  if (!manuscript || manuscript.pages.length === 0) return null;
  const sourceWidth = manuscript.pages[0]!.width;
  let selectedIndices = manuscript.pages.map((_, index) => index);
  if (selectionMode === "custom") {
    const resolved = resolveStudioExportPageSelection(manuscript.pages.length, selectionExpression);
    if (resolved.ok && resolved.indices.length > 0) {
      selectedIndices = resolved.indices;
    }
  }
  const sourceHeight = selectedIndices.reduce(
    (sum, index) => sum + (manuscript.pages[index]?.height ?? 0),
    0,
  );
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  return {
    documentId: manuscript.documentId,
    sourceWidth,
    sourceHeight,
  };
}

export function buildInitialDraft(
  projectId: string,
  target: StudioExportTargetId,
  manuscript: StudioManuscriptExportFacts | null,
): StudioExportDraftInput {
  const basis = computeManuscriptBasis(manuscript, "all", "");
  const recommended = recommendedStudioExportDraft(projectId, target, basis);
  if (!manuscript || !basis) return recommended;
  return {
    ...recommended,
    documentId: manuscript.documentId,
    width: basis.sourceWidth,
    height: basis.sourceHeight,
    estimatedFileSizeBytes: estimateStudioExportBytes({
      width: basis.sourceWidth,
      height: basis.sourceHeight,
      format: recommended.format,
    }),
  };
}

export function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function updatePreflight(
  results: readonly StudioExportPreflightResult[],
  next: StudioExportPreflightResult,
): readonly StudioExportPreflightResult[] {
  return Object.freeze(
    [
      ...results.filter(
        (item) => item.target !== next.target || item.policyVersion !== next.policyVersion,
      ),
      next,
    ].sort((a, b) =>
      `${a.target}:${a.policyVersion}`.localeCompare(`${b.target}:${b.policyVersion}`),
    ),
  );
}

export function resultTone(result: StudioExportPreflightResult | null): string {
  if (!result) return "border-line bg-panel";
  if (result.status === "pass") return "border-success/30 bg-success-soft/15";
  if (result.status === "warning") return "border-warning/35 bg-warning-soft/15";
  return "border-danger/35 bg-danger-soft/15";
}
