/**
 * studio-color-match-episode.ts
 *
 * Episode-wide reference tone matching.
 *
 * The single-cut panel (StudioColorMatchPanel) already matches one image
 * against a reference. This module is the batch counterpart: it applies the
 * exact same reference and options to every cut of an episode in one pass,
 * so a whole episode can be unified to one tone with a single action
 * ("참조 지정 → 회차 전체 톤 적용 1회 동선").
 *
 * Semantics:
 * - Every page is processed independently with identical reference/options.
 * - A page the kernel refuses (e.g. budget-exceeded) is reported in place and
 *   never aborts the remaining pages; the caller decides what to commit.
 * - Inputs are never mutated (the kernel guarantees this) and page order and
 *   page ids are preserved in the result list.
 */

import {
  applyStudioReferenceImageColorMatch,
  type StudioAdvancedColorRefusalReason,
  type StudioAdvancedColorRgbaImage,
  type StudioReferenceColorMatchOptions,
} from "./studio-advanced-color-filter-kernels";

export interface StudioEpisodeTonePageInput {
  readonly pageId: string;
  readonly image: StudioAdvancedColorRgbaImage;
}

export type StudioEpisodeTonePageResult =
  | {
      readonly pageId: string;
      readonly status: "applied";
      readonly image: StudioAdvancedColorRgbaImage;
    }
  | {
      readonly pageId: string;
      readonly status: "refused";
      readonly reason: StudioAdvancedColorRefusalReason | "exception";
      readonly detail: string;
    };

export interface StudioEpisodeToneMatchSummary {
  readonly totalCount: number;
  readonly appliedCount: number;
  readonly refusedCount: number;
  readonly results: readonly StudioEpisodeTonePageResult[];
}

/**
 * Build the kernel options the panel preview uses, so the episode-wide apply
 * is guaranteed to use the identical tone as the single-cut preview.
 */
export function createReferenceToneMatchOptions(
  strengthPercent: number,
  clipSigma: number,
): StudioReferenceColorMatchOptions {
  const clampedPercent = Math.min(100, Math.max(0, strengthPercent));
  return {
    strength: clampedPercent / 100,
    clipSigma,
    minimumStandardDeviation: 1.0,
  };
}

/**
 * Apply one reference tone to every page of an episode in a single call.
 * Never throws: per-page failures are reported as refused entries.
 */
export function applyStudioReferenceToneToEpisodePages(args: {
  readonly pages: readonly StudioEpisodeTonePageInput[];
  readonly reference: StudioAdvancedColorRgbaImage;
  readonly options: StudioReferenceColorMatchOptions;
}): StudioEpisodeToneMatchSummary {
  const results: StudioEpisodeTonePageResult[] = [];

  for (const page of args.pages) {
    try {
      const outcome = applyStudioReferenceImageColorMatch({
        source: page.image,
        reference: args.reference,
        options: args.options,
      });
      if (outcome.status === "applied") {
        results.push({
          pageId: page.pageId,
          status: "applied",
          image: outcome.image,
        });
      } else {
        results.push({
          pageId: page.pageId,
          status: "refused",
          reason: outcome.reason,
          detail: outcome.detail,
        });
      }
    } catch (error) {
      results.push({
        pageId: page.pageId,
        status: "refused",
        reason: "exception",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const appliedCount = results.filter((r) => r.status === "applied").length;
  return {
    totalCount: results.length,
    appliedCount,
    refusedCount: results.length - appliedCount,
    results,
  };
}
