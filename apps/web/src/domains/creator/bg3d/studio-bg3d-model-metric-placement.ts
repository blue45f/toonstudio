import {
  copyStudioBg3dMetricInstanceScale,
  readStudioBg3dModelMetricPolicy,
  resolveStudioBg3dMetricInstanceScale,
  StudioBg3dModelMetricPolicyError,
} from "./studio-bg3d-model-metric-policy";
import { Box3 } from "three";
import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { attachStudioGeneric3dWorkflowMetadata, parseStudioGeneric3dWorkflowMetadata } from "../studio-generic-3d-workflow-metadata";

import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import { isStudioBg3dEnvironmentAssetId } from "./studio-bg3d-environment-catalog";
import {
  diagnoseStudioBg3dGlbUnitAndAxis,
  type StudioBg3dGlbUnitAxisReport,
} from "./studio-bg3d-glb-unit-axis-diagnostics";
import { readStudioBg3dSkpMetricImport } from "./studio-bg3d-skp-metric-provenance";

type MetricModelCache = Pick<StudioBg3dModelRootCacheEntry, "root" | "normalizationScale"> &
  Partial<Pick<StudioBg3dModelRootCacheEntry, "genericHints">>;

export function studioBg3dModelMetricPolicyMessage(): string {
  return translateCurrentStaticSourceText("domains.creator.bg3d.modelMetricPolicy", "ko", "원본 미터 치수를 문서의 배율 범위 안에서 보존할 수 없어 모델을 배치하지 않았습니다.");
}

/** 기존 장면 연결은 정책 누락까지 그대로 둔다. 새 라이브러리 배치만 명시된 등록 정책을 읽는다. */
export async function loadStudioBg3dMetricAttachment(
  attachment: StudioBg3dModelAttachment,
  existingAttachment: StudioBg3dModelAttachment | undefined,
  contentHash: string,
  cached?: MetricModelCache,
): Promise<StudioBg3dModelAttachment> {
  if (existingAttachment) return attachment;
  let policy = readStudioBg3dSkpMetricImport(cached?.root);
  if (!policy) {
    const { getStudioBg3dAssetMetadata } = await import("./studio-bg3d-asset-metadata-store");
    const metadata = await getStudioBg3dAssetMetadata(contentHash);
    policy = metadata?.format === "skp" ? readStudioBg3dModelMetricPolicy(metadata.skpImport) : undefined;
  }
  if (!policy) return attachment;
  const workflow = parseStudioGeneric3dWorkflowMetadata(attachment);
  const metricAttachment: StudioBg3dModelAttachment = { ...attachment, metricPolicy: policy };
  return attachStudioGeneric3dWorkflowMetadata(metricAttachment, {
    sourceFormat: "skp", ...(workflow?.classification ? { classification: workflow.classification } : {}),
  });
}

export function resolveStudioBg3dMetricPlacementScale(
  attachment: { readonly metricPolicy?: "authored-metres" },
  cached: MetricModelCache | undefined,
): [number, number, number] {
  const policy = readStudioBg3dModelMetricPolicy(attachment);
  const scale = resolveStudioBg3dMetricInstanceScale(policy, cached);
  if (!policy || !cached) return scale;
  const bounds = new Box3().setFromObject(cached.root, true);
  if (bounds.isEmpty() || [...bounds.min.toArray(), ...bounds.max.toArray()]
    .some((value) => !Number.isFinite(value) || Math.abs(value * scale[0]) > 10_000)) {
    throw new StudioBg3dModelMetricPolicyError();
  }
  return scale;
}

interface PlacementAsset {
  readonly modelId: string;
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly localInsertionPoint: readonly [number, number, number];
}

/** 고스트 경계와 접지 기준점도 최종 인스턴스와 같은 역배율을 적용하고 GLB 단위·축 사전 진단도 함께 산출한다. */
export function scaleStudioBg3dMetricPlacementAsset(
  asset: PlacementAsset,
  attachment: StudioBg3dModelAttachment | undefined,
  cached: MetricModelCache | undefined,
): PlacementAsset & {
  readonly instanceScale: readonly [number, number, number];
  readonly glbDiagnostics: StudioBg3dGlbUnitAxisReport;
} {
  const instanceScale = resolveStudioBg3dMetricPlacementScale(attachment ?? {}, cached);
  const size: [number, number, number] = [asset.size[0] * instanceScale[0], asset.size[1] * instanceScale[1], asset.size[2] * instanceScale[2]];
  const localInsertionPoint: [number, number, number] = [asset.localInsertionPoint[0] * instanceScale[0], asset.localInsertionPoint[1] * instanceScale[1], asset.localInsertionPoint[2] * instanceScale[2]];
  if (size.some((value) => !Number.isFinite(value) || value <= 0 || value > 10_000)
    || localInsertionPoint.some((value) => !Number.isFinite(value) || Math.abs(value) > 10_000)) {
    throw new StudioBg3dModelMetricPolicyError();
  }
  const normScale =
    typeof cached?.normalizationScale === "number" &&
    Number.isFinite(cached.normalizationScale) &&
    cached.normalizationScale > 0
      ? cached.normalizationScale
      : 1;
  const sourceFormat = attachment ? parseStudioGeneric3dWorkflowMetadata(attachment)?.sourceFormat : undefined;
  const glbDiagnostics =
    sourceFormat === "skp"
      ? diagnoseStudioBg3dGlbUnitAndAxis({ rawSize: [1, 1, 1], rawMinY: 0 })
      : diagnoseStudioBg3dGlbUnitAndAxis({
          rawSize: [asset.size[0] / normScale, asset.size[1] / normScale, asset.size[2] / normScale],
          rawMinY: asset.localInsertionPoint[1] / normScale,
          nodeNames: cached?.genericHints?.nodeNames,
          isBundledEnvironment: isStudioBg3dEnvironmentAssetId(asset.modelId),
        });
  return {
    ...asset,
    size,
    localInsertionPoint,
    instanceScale: copyStudioBg3dMetricInstanceScale(instanceScale),
    glbDiagnostics,
  };
}
