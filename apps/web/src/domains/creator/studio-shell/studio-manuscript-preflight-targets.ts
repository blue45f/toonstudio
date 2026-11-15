import { SERIAL_STUDIO_BUBBLE_FONTS } from "../lettering/bubble-preset-editor-engine";
import type { StudioExportFindingLocation } from "../studio-export-preflight";
import type {
  StudioExportPageElementIssueFact,
  StudioManuscriptExportFacts,
} from "../studio-project-export-snapshot";

const STANDARD_AVAILABLE_FONT_FAMILIES: readonly string[] = [
  "pretendard",
  "pretendard variable",
  "inter",
  "noto sans",
  "noto sans kr",
  "noto sans cjk kr",
  "noto serif",
  "noto serif kr",
  "apple sd gothic neo",
  "malgun gothic",
  "맑은 고딕",
  "arial",
  "helvetica",
  "helvetica neue",
  "georgia",
  "times new roman",
  "courier new",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "impact",
  "comic sans ms",
  "sans-serif",
  "serif",
  "monospace",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "cursive",
  "fantasy",
  ...SERIAL_STUDIO_BUBBLE_FONTS.flatMap((spec) => [
    spec.family.toLowerCase(),
    spec.label.toLowerCase(),
  ]),
];

const KNOWN_FONT_FAMILY_SET: ReadonlySet<string> = new Set(STANDARD_AVAILABLE_FONT_FAMILIES);

function normalizeFontFamilyToken(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/gu, "").trim();
}

export function extractPrimaryFontFamily(rawFont: string | undefined | null): string | null {
  if (typeof rawFont !== "string") return null;
  const trimmed = rawFont.trim();
  if (!trimmed) return null;
  const firstSegment = trimmed.split(",")[0] ?? "";
  const cleaned = normalizeFontFamilyToken(firstSegment);
  return cleaned.length > 0 ? cleaned : null;
}

export function isStudioExportFontFamilyAvailable(primaryFamily: string): boolean {
  const normalized = normalizeFontFamilyToken(primaryFamily).toLowerCase();
  if (!normalized) return true;
  if (KNOWN_FONT_FAMILY_SET.has(normalized)) return true;

  if (typeof document !== "undefined" && document.fonts) {
    try {
      for (const face of document.fonts) {
        if (
          face.status === "loaded" &&
          normalizeFontFamilyToken(face.family).toLowerCase() === normalized
        ) {
          return true;
        }
      }
    } catch {
      // 런타임 FontFaceSet 순회 미지원 환경(일부 테스트 런타임)에서는 정본 카탈로그 기준으로 판정한다.
    }
  }
  return false;
}

interface FrameGeometry {
  readonly id: string;
  readonly cutNumber: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function finiteNumberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function collectVisibleFrames(
  elements: readonly Record<string, unknown>[],
  hiddenGroupIds: ReadonlySet<string>,
): readonly FrameGeometry[] {
  const rawFrames = elements.filter((el) => {
    if (el.type !== "frame") return false;
    if (el.hidden === true || el.visible === false) return false;
    if (typeof el.groupId === "string" && hiddenGroupIds.has(el.groupId)) return false;
    return typeof el.id === "string" && el.id.trim().length > 0;
  });

  const sorted = [...rawFrames].sort((a, b) => {
    const ay = finiteNumberOr(a.y, 0);
    const by = finiteNumberOr(b.y, 0);
    if (Math.abs(ay - by) > 8) return ay - by;
    return finiteNumberOr(a.x, 0) - finiteNumberOr(b.x, 0);
  });

  return sorted.map((frame, idx) => ({
    id: String(frame.id).trim(),
    cutNumber: idx + 1,
    x: finiteNumberOr(frame.x, 0),
    y: finiteNumberOr(frame.y, 0),
    width: Math.max(1, finiteNumberOr(frame.width, 1)),
    height: Math.max(1, finiteNumberOr(frame.height, 1)),
  }));
}

function resolveElementCutTarget(
  element: Record<string, unknown>,
  frames: readonly FrameGeometry[],
): { readonly cutNumber: number | null; readonly cutId: string | null } {
  if (frames.length === 0) {
    return { cutNumber: null, cutId: null };
  }

  if (typeof element.frameClipId === "string" && element.frameClipId.trim().length > 0) {
    const matched = frames.find((frame) => frame.id === element.frameClipId);
    if (matched) {
      return { cutNumber: matched.cutNumber, cutId: matched.id };
    }
  }

  const ex = finiteNumberOr(element.x, 0);
  const ey = finiteNumberOr(element.y, 0);
  const ew = Math.max(1, finiteNumberOr(element.width, 40));
  const eh = Math.max(1, finiteNumberOr(element.height, 40));
  const cx = ex + ew / 2;
  const cy = ey + eh / 2;

  for (const frame of frames) {
    if (
      cx >= frame.x &&
      cx <= frame.x + frame.width &&
      cy >= frame.y &&
      cy <= frame.y + frame.height
    ) {
      return { cutNumber: frame.cutNumber, cutId: frame.id };
    }
  }

  let bestFrame: FrameGeometry | null = null;
  let bestOverlap = 0;
  for (const frame of frames) {
    const ix = Math.max(0, Math.min(ex + ew, frame.x + frame.width) - Math.max(ex, frame.x));
    const iy = Math.max(0, Math.min(ey + eh, frame.y + frame.height) - Math.max(ey, frame.y));
    const area = ix * iy;
    if (area > bestOverlap) {
      bestOverlap = area;
      bestFrame = frame;
    }
  }
  if (bestFrame) {
    return { cutNumber: bestFrame.cutNumber, cutId: bestFrame.id };
  }

  return { cutNumber: null, cutId: null };
}

export function extractPagePreflightIssues(
  rawPage: Record<string, unknown>,
  pageNumber: number,
  pageId: string,
  pageLabel: string,
): readonly StudioExportPageElementIssueFact[] {
  const rawElements = Array.isArray(rawPage.elements) ? rawPage.elements : [];
  if (rawElements.length === 0) return Object.freeze([]);

  const hiddenGroupIds = new Set<string>();
  if (Array.isArray(rawPage.groups)) {
    for (const rawGroup of rawPage.groups) {
      if (
        rawGroup &&
        typeof rawGroup === "object" &&
        (rawGroup as Record<string, unknown>).hidden === true &&
        typeof (rawGroup as Record<string, unknown>).id === "string"
      ) {
        hiddenGroupIds.add(String((rawGroup as Record<string, unknown>).id));
      }
    }
  }

  const elementRecords = rawElements.filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === "object"),
  );
  const frames = collectVisibleFrames(elementRecords, hiddenGroupIds);
  const issues: StudioExportPageElementIssueFact[] = [];

  for (const el of elementRecords) {
    if (el.hidden === true || el.visible === false) continue;
    if (typeof el.groupId === "string" && hiddenGroupIds.has(el.groupId)) continue;
    const elementId = typeof el.id === "string" && el.id.trim().length > 0 ? el.id.trim() : "";
    if (!elementId) continue;

    const type = typeof el.type === "string" ? el.type : "";
    if (type === "image") {
      if (el.adjustmentLayer || el.filterPageComposite) continue;
      const src = typeof el.src === "string" ? el.src.trim() : "";
      const explicitMissing =
        el.missing === true ||
        el.broken === true ||
        el.loadError === true ||
        el.assetStatus === "missing" ||
        src.startsWith("missing:") ||
        src.startsWith("broken:");
      if (!src || explicitMissing) {
        const cutTarget = resolveElementCutTarget(el, frames);
        const assetId =
          typeof el.assetId === "string" && el.assetId.trim().length > 0
            ? el.assetId.trim()
            : elementId;
        const label =
          (typeof el.name === "string" && el.name.trim()) ||
          (typeof el.label === "string" && el.label.trim()) ||
          assetId;
        issues.push(
          Object.freeze({
            kind: "missing-asset",
            id: assetId,
            label,
            pageNumber,
            pageId,
            pageLabel,
            cutNumber: cutTarget.cutNumber,
            cutId: cutTarget.cutId,
            elementId,
          }),
        );
      }
      continue;
    }

    if (type === "bubble" || type === "text") {
      const cutTarget = resolveElementCutTarget(el, frames);
      const rawFont =
        typeof el.font === "string"
          ? el.font
          : typeof el.fontFamily === "string"
            ? el.fontFamily
            : "";
      const primaryFamily = extractPrimaryFontFamily(rawFont);
      if (
        el.missingFont === true ||
        (primaryFamily !== null && !isStudioExportFontFamilyAvailable(primaryFamily))
      ) {
        const fontLabel = primaryFamily ?? rawFont.trim() ?? elementId;
        issues.push(
          Object.freeze({
            kind: "missing-font",
            id: fontLabel,
            label: fontLabel,
            pageNumber,
            pageId,
            pageLabel,
            cutNumber: cutTarget.cutNumber,
            cutId: cutTarget.cutId,
            elementId,
          }),
        );
      }

      const rawFontSize =
        typeof el.fontSize === "number" && Number.isFinite(el.fontSize) && el.fontSize > 0
          ? el.fontSize
          : type === "bubble"
            ? 24
            : null;
      if (rawFontSize !== null) {
        const snippet =
          typeof el.text === "string" && el.text.trim().length > 0
            ? el.text.trim().slice(0, 18)
            : elementId;
        issues.push(
          Object.freeze({
            kind: "text-size",
            id: elementId,
            label: `${snippet} (${Math.round(rawFontSize)}px)`,
            pageNumber,
            pageId,
            pageLabel,
            cutNumber: cutTarget.cutNumber,
            cutId: cutTarget.cutId,
            elementId,
            fontSizePx: rawFontSize,
          }),
        );
      }
    }
  }

  return Object.freeze(issues);
}

function toFindingLocation(issue: StudioExportPageElementIssueFact): StudioExportFindingLocation {
  return Object.freeze({
    pageNumber: issue.pageNumber,
    pageId: issue.pageId,
    pageLabel: issue.pageLabel,
    cutNumber: issue.cutNumber,
    cutId: issue.cutId,
    elementId: issue.elementId,
    label: issue.label,
  });
}

export function aggregateSelectedScopePreflightFacts(input: {
  readonly manuscript: StudioManuscriptExportFacts | null;
  readonly selectedPageIndices: readonly number[];
  readonly plannedExportScale: number;
  readonly minimumRecommendedTextPx: number | null;
}): {
  readonly missingAssetIds: readonly string[];
  readonly missingFontIds: readonly string[];
  readonly minimumTextPx: number | null;
  readonly findingLocations: Readonly<Record<string, readonly StudioExportFindingLocation[]>>;
} | null {
  if (!input.manuscript || input.manuscript.sourceAuthority !== "manuscript-snapshot") {
    return null;
  }

  const scale =
    Number.isFinite(input.plannedExportScale) && input.plannedExportScale > 0
      ? input.plannedExportScale
      : 1;
  const selectedPages = input.selectedPageIndices
    .map((index) => input.manuscript?.pages[index])
    .filter((page): page is NonNullable<typeof page> => page !== undefined);

  const missingAssetIds: string[] = [];
  const missingFontIds: string[] = [];
  const missingAssetLocations: StudioExportFindingLocation[] = [];
  const missingFontLocations: StudioExportFindingLocation[] = [];
  const smallTextLocations: StudioExportFindingLocation[] = [];
  let minScaledTextPx: number | null = null;

  for (const page of selectedPages) {
    for (const issue of page.issues ?? []) {
      if (issue.kind === "missing-asset") {
        if (!missingAssetIds.includes(issue.id)) {
          missingAssetIds.push(issue.id);
        }
        missingAssetLocations.push(toFindingLocation(issue));
      } else if (issue.kind === "missing-font") {
        if (!missingFontIds.includes(issue.id)) {
          missingFontIds.push(issue.id);
        }
        missingFontLocations.push(toFindingLocation(issue));
      } else if (issue.kind === "text-size" && typeof issue.fontSizePx === "number") {
        const scaledPx = Math.max(1, Math.round(issue.fontSizePx * scale * 10) / 10);
        if (minScaledTextPx === null || scaledPx < minScaledTextPx) {
          minScaledTextPx = scaledPx;
        }
        if (
          input.minimumRecommendedTextPx !== null &&
          scaledPx < input.minimumRecommendedTextPx
        ) {
          smallTextLocations.push(
            Object.freeze({
              ...toFindingLocation(issue),
              label: `${issue.label} → ${scaledPx}px`,
            }),
          );
        }
      }
    }
  }

  const findingLocations: Record<string, readonly StudioExportFindingLocation[]> = {};
  if (missingAssetLocations.length > 0) {
    findingLocations["missing-assets"] = Object.freeze(missingAssetLocations);
  }
  if (missingFontLocations.length > 0) {
    findingLocations["missing-fonts"] = Object.freeze(missingFontLocations);
  }
  if (smallTextLocations.length > 0) {
    findingLocations["text-size"] = Object.freeze(smallTextLocations);
  }

  return Object.freeze({
    missingAssetIds: Object.freeze(missingAssetIds),
    missingFontIds: Object.freeze(missingFontIds),
    minimumTextPx: minScaledTextPx,
    findingLocations: Object.freeze(findingLocations),
  });
}
