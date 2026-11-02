import { sha256Hex } from "./market-authority";

import type { CreatorMarketplaceAuthoringKind } from "@/shared/lib/creator-marketplace-authoring-workshop";
import {
  CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND,
  CREATOR_MARKETPLACE_RUNTIME_BY_KIND,
  CreatorMarketplacePortablePayloadSchema,
  CreatorMarketplaceResourceManifestSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
  type CreatorMarketplaceJsonValue,
  type CreatorMarketplaceResourceEngine,
  type CreatorMarketplaceResourceKind,
  type CreatorMarketplaceResourceLicense,
  type CreatorMarketplaceResourceManifest,
  type CreatorMarketplaceResourceRecord,
} from "@/shared/lib/creator-marketplace-resource-contract";

const MEDIA_TYPE_BY_KIND = {
  asset: "application/vnd.toonstudio.asset+json",
  brush: "application/vnd.toonstudio.brush+json",
  filter: "application/vnd.toonstudio.filter+json",
  palette: "application/vnd.toonstudio.palette+json",
  template: "application/vnd.toonstudio.template+json",
  "3d-preset": "application/vnd.toonstudio.3d-preset+json",
  "3d-asset": "application/vnd.toonstudio.3d-asset+json",
} as const;

export const AUTHORING_KIND_BY_RESOURCE_KIND: Readonly<
  Record<CreatorMarketplaceResourceKind, CreatorMarketplaceAuthoringKind>
> = {
  brush: "brush",
  palette: "palette",
  filter: "tone",
  template: "template",
  asset: "material",
  "3d-preset": "background",
  "3d-asset": "3d",
};

export const DEFAULT_MANIFEST_BUILDER_SWATCHES = [
  "#1e2433",
  "#4c6ef5",
  "#f59f00",
  "#f8f9fa",
  "#e8590c",
];

export const MANIFEST_BUILDER_ENGINE_OPTIONS: readonly {
  readonly id: CreatorMarketplaceResourceEngine;
  readonly label: string;
}[] = [
  { id: "canvas2d", label: "Canvas 2D" },
  { id: "webgl2", label: "WebGL 2" },
  { id: "webgpu", label: "WebGPU" },
  { id: "three", label: "Three.js" },
];

export function sanitizeManifestBuilderSlug(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return cleaned || fallback;
}

export interface MarketMultiKindManifestInput {
  readonly kind: CreatorMarketplaceResourceKind;
  readonly builderName: string;
  readonly slug: string;
  readonly version: string;
  readonly minStudioVersion: string;
  readonly description: string;
  readonly tagsRaw: string;
  readonly license: CreatorMarketplaceResourceLicense;
  readonly attributionText: string;
  readonly containsAi: boolean;
  readonly origin: "original" | "permissive";
  readonly sourceName: string;
  readonly sourceUrl: string;
  readonly sourceLicenseUrl: string;
  readonly engines: readonly CreatorMarketplaceResourceEngine[];
  readonly swatches: readonly string[];
  readonly filterEngine: string;
  readonly filterStrength: number;
  readonly filterWarmth: number;
  readonly templateId: string;
  readonly recipeMode: "procedural-recipe" | "builtin-ref";
  readonly recipeId: string;
  readonly detailLevel: number;
  readonly brushSize: number;
  readonly brushSmoothing: number;
  readonly brushPresetFamily: string;
  readonly brushEngineCount: number;
  readonly publisherId: string;
  readonly publisherName: string;
}

export type MarketMultiKindManifestResult =
  | {
      readonly ok: true;
      readonly manifest: CreatorMarketplaceResourceManifest;
      readonly previewRecord: CreatorMarketplaceResourceRecord;
      readonly fileName: string;
    }
  | {
      readonly ok: false;
      readonly issue: string;
    };

/**
 * 7종 마켓 리소스 시각 폼 상태를 공개 manifest JSON 및 실시간 프리뷰 레코드로 조립·검증한다.
 */
export function buildMarketMultiKindManifest(
  input: MarketMultiKindManifestInput,
): MarketMultiKindManifestResult {
  const { kind, origin, license, publisherName, publisherId } = input;
  const safeSlug = sanitizeManifestBuilderSlug(input.slug, `${kind}-pack`);
  const packageId = `${origin === "original" ? "community" : "permissive"}/${kind}/${safeSlug}`;
  const entryName = input.builderName.trim().slice(0, 80) || `${kind} 기본 항목`;
  const entryId = `${kind}/${safeSlug}`;
  const tags = [
    ...new Set(
      input.tagsRaw
        .split(",")
        .map((tag) => tag.trim().replace(/^#/u, "").slice(0, 24))
        .filter(Boolean),
    ),
  ].slice(0, 8);

  const effectiveLicense: CreatorMarketplaceResourceLicense =
    origin === "permissive" && license === "toonspectrum-standard"
      ? "cc0-1.0"
      : license;
  const effectiveAttribution =
    (effectiveLicense === "cc-by-4.0" || effectiveLicense === "cc-by-nc-4.0") &&
    !input.attributionText.trim()
      ? `© ${publisherName}`
      : input.attributionText.trim();

  try {
    let entry: CreatorMarketplaceResourceManifest["entries"][number];
    const supportsBuiltin =
      kind === "asset" ||
      kind === "template" ||
      kind === "3d-preset" ||
      kind === "3d-asset";

    if (supportsBuiltin && input.recipeMode === "builtin-ref") {
      const prefix =
        CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND[
          kind as keyof typeof CREATOR_MARKETPLACE_BUILTIN_PREFIX_BY_KIND
        ];
      const runtimeRef = `${prefix}${sanitizeManifestBuilderSlug(input.recipeId, "starter-v1")}`;
      entry = {
        id: entryId,
        kind,
        name: entryName,
        delivery: {
          mode: "builtin-ref",
          runtimeRef,
          byteSize: 0,
          sha256: sha256Hex(canonicalizeCreatorMarketplaceJson({
            mode: "builtin-ref",
            runtimeRef,
          })),
        },
      };
    } else {
      let definition: Record<string, CreatorMarketplaceJsonValue>;
      if (kind === "palette") {
        const validColors = [
          ...new Set(
            input.swatches
              .map((hex) => hex.trim().toLowerCase())
              .filter((hex) => /^#[0-9a-f]{6}$/u.test(hex)),
          ),
        ];
        definition = {
          colors: validColors.length > 0 ? validColors : ["#1e2433", "#4c6ef5"],
        };
      } else if (kind === "filter") {
        definition = {
          engine: sanitizeManifestBuilderSlug(input.filterEngine, "color-grade"),
          values: {
            strength: Number((input.filterStrength / 100).toFixed(2)),
            warmth: input.filterWarmth,
          },
        };
      } else if (kind === "template") {
        definition = {
          templateId: sanitizeManifestBuilderSlug(input.templateId, "vertical-webtoon-4cut"),
        };
      } else if (kind === "brush") {
        definition = {
          snapshot: {
            schemaVersion: 2,
            presetFamily: input.brushPresetFamily || "webtoon-ink",
            baseSizePx: Math.max(1, Math.min(200, input.brushSize)),
            stabilization: Math.max(0, Math.min(100, input.brushSmoothing)),
            engineCount: input.brushEngineCount,
          },
        };
      } else {
        definition = {
          recipeId: sanitizeManifestBuilderSlug(input.recipeId, "procedural-studio-kit-v1"),
          parameters: {
            detailLevel: Math.max(1, Math.min(5, input.detailLevel)),
          },
        };
      }

      const payload = CreatorMarketplacePortablePayloadSchema.parse({
        schemaVersion: 1,
        resourceKind: kind,
        runtime: CREATOR_MARKETPLACE_RUNTIME_BY_KIND[kind],
        definition,
      });
      const canonicalPayload = canonicalizeCreatorMarketplaceJson(payload);
      const deliveryMode =
        kind === "asset" || kind === "3d-preset" || kind === "3d-asset"
          ? ("procedural-recipe" as const)
          : ("portable-json" as const);
      entry = {
        id: entryId,
        kind,
        name: entryName,
        delivery: {
          mode: deliveryMode,
          mediaType: MEDIA_TYPE_BY_KIND[kind],
          payload,
          byteSize: creatorMarketplaceJsonByteSize(payload),
          sha256: sha256Hex(canonicalPayload),
        },
      };
    }

    const candidate = {
      schemaVersion: 1 as const,
      packageId,
      name: entryName,
      description: input.description.trim().slice(0, 1_000),
      kind,
      resourceVersion: input.version.trim() || "1.0.0",
      minimumStudioVersion: input.minStudioVersion.trim() || "1.0.0",
      tags,
      license: effectiveLicense,
      attributionText: effectiveAttribution,
      containsAi: input.containsAi,
      rightsConfirmed: true as const,
      provenance:
        origin === "original"
          ? { origin: "original" as const, authoredByPublisher: true as const }
          : {
              origin: "permissive" as const,
              authoredByPublisher: false as const,
              sourceName: input.sourceName.trim() || "External Source",
              sourceUrl: input.sourceUrl.trim(),
              sourceLicenseUrl: input.sourceLicenseUrl.trim(),
            },
      compatibility: {
        engines:
          input.engines.length > 0
            ? [...input.engines]
            : (["canvas2d"] as CreatorMarketplaceResourceEngine[]),
      },
      entries: [entry],
    };

    const parsed = CreatorMarketplaceResourceManifestSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        ok: false,
        issue: parsed.error.issues[0]?.message ?? "manifest 입력값을 확인해 주세요.",
      };
    }

    const canonicalManifest = canonicalizeCreatorMarketplaceJson(
      parsed.data as unknown as CreatorMarketplaceJsonValue,
    );
    const manifestByteSize = creatorMarketplaceJsonByteSize(
      parsed.data as unknown as CreatorMarketplaceJsonValue,
    );
    const previewRecord: CreatorMarketplaceResourceRecord = {
      ...parsed.data,
      id: "00000000-0000-4000-8000-000000000099",
      manifestHash: sha256Hex(canonicalManifest),
      manifestByteSize,
      publisher: {
        id: publisherId,
        name: publisherName,
        avatar: null,
      },
      createdAt: "2026-11-02T00:00:00.000Z",
      updatedAt: "2026-11-02T00:00:00.000Z",
      isOwner: true,
      access: "free",
    };

    return {
      ok: true,
      manifest: parsed.data,
      previewRecord,
      fileName: `${safeSlug}-${parsed.data.resourceVersion}.toonmarket.json`,
    };
  } catch (caught) {
    return {
      ok: false,
      issue:
        caught instanceof Error && caught.message
          ? caught.message
          : "manifest 조립 중 오류가 발생했습니다.",
    };
  }
}
