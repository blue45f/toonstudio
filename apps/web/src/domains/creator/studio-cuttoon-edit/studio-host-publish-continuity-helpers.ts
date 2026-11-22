import {
  filterAssetsByLabel,
  filterBgSceneSections,
} from "../studio-assets";
import type { StudioCharacterBible } from "../studio-character-bible";
import type { StudioCommentThread } from "../studio-comments";
import { formatStudioCommunityAssetCredit } from "../studio-community-asset-license";
import {
  lintStudioContinuity,
  type StudioContinuityIssue,
  type StudioStoryBeat,
} from "../studio-continuity";
import type { FrameEl } from "../studio-element-model";
import { pageDisplayName } from "../studio-page-meta";
import type { PageState } from "../studio-page-state";
import { EMPTY_STUDIO_OPTIONAL_ASSETS } from "../studio-page-editor-ui-contracts";
import {
  computeStudioProductionInsights,
  type StudioProductionInsights,
} from "../studio-production-insights";
import { buildStudioProductionInsightsInput } from "../studio-production-projection";
import type { StudioPublishComplianceResult } from "../studio-publish-compliance";
import {
  getStudioPublishPlatformPreset,
  planStudioPublishCanvasSlices,
  planStudioPublishPackage,
  type StudioPublishPackagePlan,
  type StudioPublishPackageSettings,
} from "../studio-publish-package";
import {
  validateStudioPublishPreflight,
  type StudioPublishPreflightInput,
  type StudioPublishProfile,
} from "../studio-publish-preflight";
import type {
  FxPickerSection,
  StudioOptionalAssetPacks,
} from "../StudioToolBeltContent";

export interface StudioContinuitySceneEntry {
  readonly id: string;
  readonly frameId: string;
  readonly pageId: string;
  readonly label: string;
  readonly beat: StudioStoryBeat;
}

export interface StudioProductionBibleAssetOption {
  readonly id: string;
  readonly label: `${string} · ${string}`;
}

export function deriveStudioContinuityScenes(
  active: boolean,
  pages: readonly PageState[],
): StudioContinuitySceneEntry[] {
  if (!active) return [];
  return pages.flatMap((page, pageIndex) =>
    page.elements
      .filter((element): element is FrameEl => element.type === "frame" && !!element.storyBeat)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((frame, sceneIndex) => ({
        id: frame.id,
        frameId: frame.id,
        pageId: page.id,
        label: `${pageDisplayName(page, pageIndex)} · 장면 ${sceneIndex + 1}${
          frame.storyBeat?.summary ? ` — ${frame.storyBeat.summary.slice(0, 48)}` : ""
        }`,
        beat: {
          sceneId: frame.id,
          ...(frame.storyBeat?.continuity ?? {}),
        } satisfies StudioStoryBeat,
      })),
  );
}

export function deriveStudioContinuityIssues(
  active: boolean,
  characters: StudioCharacterBible["characters"],
  continuityScenes: readonly StudioContinuitySceneEntry[],
): StudioContinuityIssue[] {
  if (!active) return [];
  return lintStudioContinuity({
    characters: characters.map((character) => ({
      name: character.name,
      appearance: character.appearance,
      voice: character.voice,
      goal: character.goal,
    })),
    beats: continuityScenes.map((scene) => scene.beat),
  });
}

export function collectStudioPublishPackageCreditsText(
  manualCredits: string,
  pages: readonly PageState[],
): string {
  const credits = new Map<string, string>();
  if (manualCredits.trim()) credits.set("manual", manualCredits.trim());
  for (const page of pages) {
    for (const element of page.elements) {
      if (element.type !== "image") continue;
      if (element.stockImageCredit) {
        const credit = element.stockImageCredit;
        credits.set(
          `stock:${credit.unsplashPhotoPageUrl}`,
          `${credit.photographerName} · ${credit.photographerProfileUrl} · ${credit.unsplashPhotoPageUrl}`,
        );
      }
      if (element.communityAssetCredit) {
        const line = formatStudioCommunityAssetCredit(element.communityAssetCredit);
        if (line) credits.set(`community:${element.communityAssetCredit.assetId}`, line);
      }
    }
  }
  return [...credits.values()].join("\n");
}

export interface BuildStudioPublishPackagePlanInput {
  readonly open: boolean;
  readonly pages: readonly PageState[];
  readonly canvasWidth: number;
  readonly currentPageId: string;
  readonly title: string;
  readonly episodeTitle: string;
  readonly settings: StudioPublishPackageSettings;
  readonly getCreditsText: () => string;
}

export function buildStudioPublishPackagePlan(
  input: BuildStudioPublishPackagePlanInput,
): StudioPublishPackagePlan | null {
  if (!input.open) return null;
  const canvases = input.pages.map((page) => ({
    id: page.id,
    width: input.canvasWidth,
    height: page.canvasH,
  }));
  const slices = planStudioPublishCanvasSlices({
    destination: input.settings.destination,
    seriesTitle: input.title,
    canvases,
    format: input.settings.outputFormat,
  });
  const preset = getStudioPublishPlatformPreset(input.settings.destination);
  const thumbnails = preset.thumbnails
    .filter((thumbnail) =>
      input.settings.requestedThumbnailSlots.includes(thumbnail.slot),
    )
    .map((thumbnail) => ({
      id: `planned-thumbnail-${thumbnail.slot}`,
      sourceCanvasId: input.currentPageId,
      slot: thumbnail.slot,
      mimeType: thumbnail.allowedMimeTypes[0],
      width: thumbnail.width,
      height: thumbnail.height,
    }));
  return planStudioPublishPackage({
    settings: input.settings,
    seriesTitle: input.title,
    episodeTitle: input.episodeTitle,
    canvases,
    episodeImages: slices.map((slice, index) => ({
      id: `planned-episode-image-${index + 1}`,
      sourceCanvasId: slice.sourceCanvasId,
      mimeType: slice.mimeType,
      width: slice.output.width,
      height: slice.output.height,
      fileName: slice.fileName,
    })),
    thumbnails,
    creditsText: input.getCreditsText(),
  });
}

export interface DeriveStudioProductionInsightsInput {
  readonly open: boolean;
  readonly pages: readonly PageState[];
  readonly publishProfile: StudioPublishProfile;
  readonly continuityIssues: readonly StudioContinuityIssue[];
  readonly publishComplianceResult: StudioPublishComplianceResult;
  readonly commentThreads: readonly StudioCommentThread[];
  readonly buildPreflightInput: () => StudioPublishPreflightInput;
}

export function deriveStudioProductionInsightsResult(
  input: DeriveStudioProductionInsightsInput,
): StudioProductionInsights | null {
  if (!input.open) return null;
  const productionPreflightResult = validateStudioPublishPreflight(
    input.buildPreflightInput(),
    input.publishProfile,
  );
  return computeStudioProductionInsights(
    buildStudioProductionInsightsInput(input.pages, [
      ...input.continuityIssues.map((issue) => ({ severity: issue.severity, resolved: false })),
      ...productionPreflightResult.issues
        .filter((issue) => issue.code !== "EDITORIAL_COMMENTS_OPEN")
        .map((issue) => ({
          severity: issue.severity,
          resolved: false,
        })),
      ...input.publishComplianceResult.issues.map((issue) => ({
        severity: issue.severity,
        resolved: false,
      })),
      ...input.commentThreads.map((thread) => ({
        severity: "warning" as const,
        resolved: thread.resolved,
      })),
    ]),
  );
}

export function deriveStudioProductionBibleAssetOptions(
  open: boolean,
  pages: readonly PageState[],
): StudioProductionBibleAssetOption[] {
  if (!open) return [];
  return Array.from(
    new Map(
      pages.flatMap((page, pageIndex) =>
        page.elements.flatMap((element) => {
          if (element.type !== "image") return [];
          const id =
            element.communityAssetCredit?.assetId
            ?? element.builtinRasterAssetId
            ?? element.id;
          return [[
            id,
            {
              id,
              label: `${pageDisplayName(page, pageIndex)} · ${element.name?.trim() || id}`,
            },
          ] as const];
        }),
      ),
    ).values(),
  );
}

export interface StudioFxPickerResultCounts {
  readonly fxMenuOpen: boolean;
  readonly sectionVisible: (section: Exclude<FxPickerSection, "all">) => boolean;
  readonly rasterCount: number;
  readonly sfxCount: number;
  readonly emojiCount: number;
  readonly comicCount: number;
  readonly creatureCount: number;
  readonly propCount: number;
  readonly linePresetCount: number;
  readonly overlayCount: number;
}

export function hasStudioFxPickerResults(input: StudioFxPickerResultCounts): boolean {
  return (
    input.fxMenuOpen && (
      (input.sectionVisible("raster") && input.rasterCount > 0) ||
      (input.sectionVisible("sfx") && input.sfxCount > 0) ||
      (input.sectionVisible("emoji") && input.emojiCount > 0) ||
      (input.sectionVisible("comic") && input.comicCount > 0) ||
      (input.sectionVisible("creature") && input.creatureCount > 0) ||
      (input.sectionVisible("prop") && input.propCount > 0) ||
      (input.sectionVisible("lines") && input.linePresetCount > 0) ||
      (input.sectionVisible("overlay") && input.overlayCount > 0)
    )
  );
}

export function filterStudioBgSceneCatalogSections(
  bgSceneMenuOpen: boolean,
  bgSceneGenreFilter: string,
  bgSceneSections: StudioOptionalAssetPacks["bgSceneSections"],
  bgSceneGenreGroups: StudioOptionalAssetPacks["bgSceneGenreGroups"],
  bgSceneSearchQuery: string,
): StudioOptionalAssetPacks["bgSceneSections"] {
  if (!bgSceneMenuOpen) return EMPTY_STUDIO_OPTIONAL_ASSETS.bgSceneSections;
  return filterBgSceneSections(
    bgSceneGenreFilter === "all"
      ? bgSceneSections
      : bgSceneGenreGroups.filter((group) => group.genre === bgSceneGenreFilter),
    bgSceneSearchQuery,
  );
}

export function filterStudioEmeresCatalogSections(
  emeresMenuOpen: boolean,
  emeresSections: StudioOptionalAssetPacks["emeresSections"],
  emeresCategoryFilter: string,
  emeresSearchQuery: string,
): StudioOptionalAssetPacks["emeresSections"] {
  if (!emeresMenuOpen) return EMPTY_STUDIO_OPTIONAL_ASSETS.emeresSections;
  return emeresSections
    .filter((section) => emeresCategoryFilter === "all" || section.category === emeresCategoryFilter)
    .map((section) => ({
      ...section,
      templates: filterAssetsByLabel(section.templates, emeresSearchQuery),
    }))
    .filter((section) => section.templates.length > 0);
}
