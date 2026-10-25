import { CheckCircle2, Cpu, Layers, Paintbrush, Sparkles, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { dispatchCharacterCommand } from "../character-platform/application/character-command-dispatcher";
import { CharacterOperationCoordinator } from "../character-platform/application/character-operation-coordinator";
import {
  planCharacterPurposeApply,
  type CharacterApplyPurpose,
} from "../character-platform/apply/character-purpose-apply-plan";
import {
  CHARACTER_CAPABILITY_EVIDENCE_LEVELS,
  CHARACTER_CAPABILITY_EVIDENCE_VERSION,
} from "../character-platform/compatibility/character-capability-evidence";
import { migrateCharacterPoseV2ToV3 } from "../character-platform/pose-v3/character-pose-migrate";
import { STUDIO_DCC_CATALOG_FEATURE_DISPATCH_REVISION } from "../hybrid-dcc/studio-dcc-catalog-feature-dispatch";
import {
  STUDIO_DCC_KERNEL_COVERAGE_REVISION,
  studioCatalogKernelReadyIds,
} from "../hybrid-dcc/studio-dcc-catalog-registry";
import { STUDIO_DCC_SECTION6_LITE_OPS_REVISION } from "../hybrid-dcc/studio-dcc-section6-lite-ops";
import { STUDIO_HYBRID_EDIT_PRODUCT_SURFACES } from "../hybrid-dcc/studio-hybrid-edit-product-admission";
import {
  STUDIO_HYBRID_AUTHORITY_ROLES,
  STUDIO_HYBRID_ENGINE_CONTRACT_REVISION,
} from "../hybrid-dcc/studio-hybrid-engine-contract";
import {
  STUDIO_HYBRID_PRESSURE_RENDER_DYNAMICS_VERSION,
  resolveStudioHybridPressureRenderDynamics,
} from "../hybrid-dcc/studio-hybrid-pressure-render-dynamics";
import {
  STUDIO_HYBRID_TEXTURED_VECTOR_INK_BUDGETS,
  STUDIO_HYBRID_TEXTURED_VECTOR_INK_PROVIDER_REVISION,
} from "../hybrid-dcc/studio-hybrid-textured-vector-ink-provider";
import {
  STUDIO_HYBRID_VECTOR_CONTRACT_ID,
  STUDIO_HYBRID_VECTOR_CONTRACT_VERSION,
} from "../hybrid-dcc/studio-hybrid-vector-geometry";
import {
  STUDIO_EXTERNAL_3D_PROVIDER,
  STUDIO_EXTERNAL_3D_TRIANGLE_BUDGET,
  STUDIO_EXTERNAL_3D_TRIPO_DEFAULT_MODEL,
  planStudioExternal3dIntake,
} from "../scene-3d/studio-external-3d-intake";
import {
  StudioScene3dDocumentCommandError,
  createStudioScene3dTransformOperation,
} from "../scene3d/studio-scene3d-document-command";
import { resolveStudioScene3dLinkedLayerRoundTrip } from "../scene3d/studio-scene3d-linked-layer-bridge";
import { applyStudioScene3dTemplateAtomically } from "../scene3d/studio-scene3d-template-transaction";
import {
  STUDIO_ATTACHMENT_GRIP_PRESETS,
  STUDIO_ATTACHMENT_SOCKET_CATALOG,
} from "../vrm/studio-vrm-attachment-graph";
import { DEFAULT_AVATAR_FORGE_STATE } from "../vrm/studio-vrm-avatar-forge";
import { buildAvatarForgeBodyAdjustmentPlan } from "../vrm/studio-vrm-avatar-forge-body-plan";
import {
  STUDIO_VRM_AVATAR_REFERENCE_HARNESS_LIMITS,
  STUDIO_VRM_AVATAR_REFERENCE_HARNESS_VERSION,
} from "../vrm/studio-vrm-avatar-reference-recommendation-harness";
import { runStudioVrmComponentPsdExport } from "../vrm/studio-vrm-component-psd-export-job";
import {
  createStudioTextureArchiveRecord,
  planStudioTextureMemoryEviction,
} from "../vrm/studio-vrm-texture-dilation";
import { createStudioVrmTexturePaintCursor } from "../vrm/studio-vrm-texture-paint-cursor";
import {
  STUDIO_VRM_TEXTURE_PAINT_GPU_BYTES_PER_PIXEL,
  STUDIO_VRM_TEXTURE_PAINT_GPU_UPLOAD_LIMITS,
} from "../vrm/studio-vrm-texture-paint-gpu-upload";
import {
  STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS,
  STUDIO_VRM_XPBD_GARMENT_BAKE_VERSION,
  garmentSlotForKind,
} from "../vrm/studio-vrm-xpbd-garment-bake";

const CHARACTER_APPLY_PURPOSES: readonly {
  readonly id: CharacterApplyPurpose;
  readonly labelKo: string;
}[] = [
  { id: "manuscript", labelKo: "원고 합치기" },
  { id: "line-and-color", labelKo: "선화·밑색 분리" },
  { id: "ai-control", labelKo: "AI 제어 패스" },
  { id: "review", labelKo: "검수 프리뷰" },
  { id: "file-export", labelKo: "다중 패스 내보내기" },
];

export interface StudioBg3dVrmHybridDccPanelProps {
  readonly disabled?: boolean;
  readonly onSelectApplyPurpose?: (purpose: CharacterApplyPurpose, passCount: number) => void;
  readonly onSelectAttachmentPreset?: (presetId: string) => void;
  readonly onPlanExternalIntake?: (prompt: string, maxTriangles: number) => void;
}

/**
 * VRM 아바타·텍스처 페인트·XPBD 의상·캐릭터 플랫폼·하이브리드 DCC·Scene3D 트랜잭션 통합 패널.
 */
export function StudioBg3dVrmHybridDccPanel({
  disabled = false,
  onSelectApplyPurpose,
  onSelectAttachmentPreset,
  onPlanExternalIntake,
}: StudioBg3dVrmHybridDccPanelProps) {
  const [applyPurpose, setApplyPurpose] = useState<CharacterApplyPurpose>("line-and-color");
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    STUDIO_ATTACHMENT_GRIP_PRESETS[0]?.id ?? "sword-one-hand",
  );
  const [externalKind, setExternalKind] = useState<"character" | "garment" | "prop">("prop");

  const vrmAndTextureDiag = useMemo(() => {
    const bodyPlan = buildAvatarForgeBodyAdjustmentPlan(DEFAULT_AVATAR_FORGE_STATE.body);
    const cursorSvg = createStudioVrmTexturePaintCursor({
      blend: "normal",
      color: "#1e293b",
      sizeTexels: 24,
      tuning: { hardness: 0.8 },
    });
    const evictionPlan = planStudioTextureMemoryEviction(
      [
        {
          id: "tex-vrm-face",
          bytes: 4 * 1024 * 1024,
          active: true,
          dirty: false,
          lastUsedAtMs: 1000,
        },
      ],
      16 * 1024 * 1024,
    );
    const archiveRec = createStudioTextureArchiveRecord({
      modelHash: "vrm-canonical-01",
      channel: "color",
      width: 2,
      height: 2,
      pixels: new Uint8ClampedArray(16),
      colorSpace: "srgb",
      channelPacking: "rgba",
    });
    const topSlot = garmentSlotForKind(" pleated-skirt " as never) ?? "bottom";
    const psdExportAvailable = typeof runStudioVrmComponentPsdExport === "function";

    return {
      socketCount: STUDIO_ATTACHMENT_SOCKET_CATALOG.length,
      gripPresetCount: STUDIO_ATTACHMENT_GRIP_PRESETS.length,
      bodyAdjustedBones: bodyPlan.length,
      cursorReady: cursorSvg.startsWith("url("),
      residentTextures: evictionPlan.residentIds.length,
      archiveChannel: archiveRec.channel,
      gpuBytesPerPx: STUDIO_VRM_TEXTURE_PAINT_GPU_BYTES_PER_PIXEL,
      maxGpuTextureDim: STUDIO_VRM_TEXTURE_PAINT_GPU_UPLOAD_LIMITS.maxDimension,
      xpbdVersion: STUDIO_VRM_XPBD_GARMENT_BAKE_VERSION,
      xpbdMaxVerts: STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxParticles,
      topSlot,
      refHarnessVer: STUDIO_VRM_AVATAR_REFERENCE_HARNESS_VERSION,
      refHarnessMaxTopN: STUDIO_VRM_AVATAR_REFERENCE_HARNESS_LIMITS.maxQueries,
      psdExportAvailable,
    };
  }, []);

  const characterPlatformDiag = useMemo(() => {
    const applyPlan = planCharacterPurposeApply({
      purpose: applyPurpose,
      availablePasses: [
        "beauty",
        "flat",
        "line",
        "shadow",
        "highlight",
        "mask-face",
        "mask-hair",
        "mask-top",
        "mask-bottom",
        "depth",
        "normal",
        "part-id",
        "surface-paint",
      ],
      replaceLinkedGroup: true,
    });

    const coordinator = new CharacterOperationCoordinator();
    const acquire = coordinator.tryAcquire({
      operationId: "op-pose-sync",
      owner: "studio-workbench",
      claims: [{ resource: "pose-preview", mode: "shared" }],
    });
    if (acquire.ok) {
      acquire.lease.release();
    }

    const bridgesReady =
      typeof dispatchCharacterCommand === "function" &&
      typeof migrateCharacterPoseV2ToV3 === "function";

    return {
      plannedPasses: applyPlan.passes.filter((p) => p.status === "planned").length,
      ready: applyPlan.ready,
      evidenceVersion: CHARACTER_CAPABILITY_EVIDENCE_VERSION,
      evidenceLevels: CHARACTER_CAPABILITY_EVIDENCE_LEVELS.length,
      leaseOk: acquire.ok,
      bridgesReady,
    };
  }, [applyPurpose]);

  const hybridDccAndScene3dDiag = useMemo(() => {
    const readyKernelIds = studioCatalogKernelReadyIds();
    const pressureDyn = resolveStudioHybridPressureRenderDynamics("ink-brush-soft", {
      rawPressure: 0.72,
      baseWidth: 12,
      baseOpacity: 0.9,
      baseFlow: 0.85,
    });

    const intakePlan = planStudioExternal3dIntake(
      {
        kind: externalKind,
        prompt: "웹툰 학원 소품 가방",
      },
      {
        cliTokenPresent: true,
        apiKeyPresent: false,
      },
      { ownerConfirmed: true },
    );

    const transformOp = createStudioScene3dTransformOperation({
      entityId: "node-prop-01",
      patch: { position: [0, 1, 0] },
    });
    const cmdErrCode = new StudioScene3dDocumentCommandError("EMPTY_TRANSACTION", "probe").code;
    const scene3dBridgesReady =
      typeof resolveStudioScene3dLinkedLayerRoundTrip === "function" &&
      typeof applyStudioScene3dTemplateAtomically === "function";

    return {
      kernelRev: STUDIO_DCC_KERNEL_COVERAGE_REVISION,
      dispatchRev: STUDIO_DCC_CATALOG_FEATURE_DISPATCH_REVISION,
      liteOpsRev: STUDIO_DCC_SECTION6_LITE_OPS_REVISION,
      readyKernelCount: readyKernelIds.length,
      productSurfaces: Object.keys(STUDIO_HYBRID_EDIT_PRODUCT_SURFACES).length,
      engineContractRev: STUDIO_HYBRID_ENGINE_CONTRACT_REVISION,
      authorityRoles: STUDIO_HYBRID_AUTHORITY_ROLES.length,
      pressureVer: STUDIO_HYBRID_PRESSURE_RENDER_DYNAMICS_VERSION,
      resolvedWidthPx: Math.round((pressureDyn?.resolvedWidth ?? 12) * 10) / 10,
      vectorInkRev: STUDIO_HYBRID_TEXTURED_VECTOR_INK_PROVIDER_REVISION,
      maxStampCount: STUDIO_HYBRID_TEXTURED_VECTOR_INK_BUDGETS.maxStations,
      vectorContractId: STUDIO_HYBRID_VECTOR_CONTRACT_ID,
      vectorContractVer: STUDIO_HYBRID_VECTOR_CONTRACT_VERSION,
      externalProvider: STUDIO_EXTERNAL_3D_PROVIDER,
      tripoModel: STUDIO_EXTERNAL_3D_TRIPO_DEFAULT_MODEL,
      triangleBudget: STUDIO_EXTERNAL_3D_TRIANGLE_BUDGET[externalKind],
      intakeStatus: intakePlan.status,
      transformEntityId: transformOp.id,
      cmdErrCode,
      scene3dBridgesReady,
    };
  }, [externalKind]);

  return (
    <div
      data-testid="bg3d-vrm-hybrid-dcc-panel"
      className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3 text-xs text-fg"
    >
      {/* 1. 캐릭터 플랫폼 적용 목적별 멀티패스 플래너 */}
      <div className="rounded-lg border border-line bg-panel/60 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-fg">
            <UserCheck className="size-3.5 text-accent" />
            캐릭터 플랫폼 적용 목적별 멀티패스 플래너
          </span>
          <span
            data-testid="bg3d-character-apply-readout"
            className="text-[11px] text-fg-2"
          >
            계획 패스 {characterPlatformDiag.plannedPasses}종 ·{" "}
            {characterPlatformDiag.ready ? "즉시 적용 가능" : "대기"} · 리스{" "}
            {characterPlatformDiag.leaseOk ? "정상" : "충돌"}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHARACTER_APPLY_PURPOSES.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-char-purpose-${item.id}`}
              onClick={() => {
                setApplyPurpose(item.id);
                onSelectApplyPurpose?.(item.id, characterPlatformDiag.plannedPasses);
              }}
              className={`rounded-md border px-2.5 py-1 text-[11px] ${
                applyPurpose === item.id
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {item.labelKo}
            </button>
          ))}
        </div>
      </div>

      {/* 2. VRM 어태치먼트 소켓·그립 & 텍스처 페인트·XPBD 의상 */}
      <div className="rounded-lg border border-line bg-panel/60 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-fg">
            <Paintbrush className="size-3.5 text-accent" />
            VRM 소켓·그립 그래프 ({vrmAndTextureDiag.socketCount}소켓) · GPU 페인트 · XPBD 의상 베이크
          </span>
          <span data-testid="bg3d-vrm-xpbd-readout" className="text-[11px] text-fg-2">
            체형 본 {vrmAndTextureDiag.bodyAdjustedBones}개 · XPBD v{vrmAndTextureDiag.xpbdVersion} (최대{" "}
            {vrmAndTextureDiag.xpbdMaxVerts}정점) · GPU 상한 {vrmAndTextureDiag.maxGpuTextureDim}px
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STUDIO_ATTACHMENT_GRIP_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-vrm-grip-preset-${preset.id}`}
              onClick={() => {
                setSelectedPresetId(preset.id);
                onSelectAttachmentPreset?.(preset.id);
              }}
              className={`rounded-md border px-2.5 py-1 text-[11px] ${
                selectedPresetId === preset.id
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {preset.label} ({preset.contact})
            </button>
          ))}
        </div>
      </div>

      {/* 3. 외부 3D 에셋 인테이크 (Tripo CLI) & Scene3D 트랜잭션 */}
      <div className="rounded-lg border border-line bg-panel/60 p-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-fg">
            <Layers className="size-3.5 text-accent" />
            외부 3D 에셋 인테이크 ({hybridDccAndScene3dDiag.externalProvider}) · Scene3D 링크드 레이어
          </span>
          <span data-testid="bg3d-external-intake-readout" className="text-[11px] text-fg-2">
            모델 {hybridDccAndScene3dDiag.tripoModel} · 삼각형 예산{" "}
            {hybridDccAndScene3dDiag.triangleBudget.toLocaleString()}개 ({hybridDccAndScene3dDiag.intakeStatus})
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "prop", labelKo: "소품 (25K)" },
              { id: "garment", labelKo: "의상 (25K)" },
              { id: "character", labelKo: "캐릭터 (90K)" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              data-testid={`bg3d-external-intake-${item.id}`}
              onClick={() => {
                setExternalKind(item.id);
                onPlanExternalIntake?.(
                  item.labelKo,
                  STUDIO_EXTERNAL_3D_TRIANGLE_BUDGET[item.id],
                );
              }}
              className={`rounded-md border px-2.5 py-1 text-[11px] ${
                externalKind === item.id
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {item.labelKo}
            </button>
          ))}
        </div>
      </div>

      {/* 4. 하이브리드 DCC 커널·필압 다이나믹스·벡터 잉크 계약 요약 */}
      <div
        data-testid="bg3d-hybrid-dcc-summary"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card/80 px-2.5 py-2 text-[11px] text-fg-2"
      >
        <span className="flex items-center gap-1.5 font-medium text-fg">
          <Cpu className="size-3.5 text-good" />
          DCC 커널 Ready {hybridDccAndScene3dDiag.readyKernelCount}종 · 편집 표면{" "}
          {hybridDccAndScene3dDiag.productSurfaces}종 · 권한 역할{" "}
          {hybridDccAndScene3dDiag.authorityRoles}종
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-accent" />
          필압 폭 {hybridDccAndScene3dDiag.resolvedWidthPx}px · 벡터 계약{" "}
          {hybridDccAndScene3dDiag.vectorContractId} v{hybridDccAndScene3dDiag.vectorContractVer}
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5 text-good" />
          Scene3D 브리지 {hybridDccAndScene3dDiag.scene3dBridgesReady ? "정상" : "점검"} · 증거 레벨{" "}
          {characterPlatformDiag.evidenceLevels}단계
        </span>
      </div>
    </div>
  );
}
