import { describe, expect, it } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import {
  deriveStudioBg3dProfessionalDeviceCapabilities,
  inspectStudioBg3dGlbBinaryHeader,
  resolveStudioBg3dProfessionalRuntimeReadiness,
} from "./studio-bg3d-professional-runtime-readiness";

const BOX: BgPrimitive = {
  id: "box-a",
  kind: "box",
  position: [0, 0.5, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  color: "#ffffff",
};

const WEBGPU_PLAN = Object.freeze({
  backend: "webgpu" as const,
  runtimeId: "three-webgpu" as const,
  status: "available" as const,
  reason: "user-webgpu-override" as const,
  notice: "ready",
  diagnostics: Object.freeze([]),
});

const WEBGPU_PROBE = Object.freeze({
  supported: true,
  reason: "available" as const,
  computeSupported: true,
  timestampQuerySupported: true,
  limits: Object.freeze({ maxComputeWorkgroupSizeX: 256 }),
});

function capabilities() {
  return deriveStudioBg3dProfessionalDeviceCapabilities({
    enginePlan: WEBGPU_PLAN,
    webGpuProbe: WEBGPU_PROBE,
    deviceSignals: { deviceMemoryGb: 8 },
    maxTextureDimension2d: 8192,
    compressedTextureAstc: true,
    float16Shaders: true,
  });
}

function readiness(
  patch: Partial<Parameters<typeof resolveStudioBg3dProfessionalRuntimeReadiness>[0]> = {},
) {
  return resolveStudioBg3dProfessionalRuntimeReadiness({
    authorityId: "bg3d:document-a",
    primitives: [BOX],
    customModels: [],
    attachmentByStorageModelId: new Map(),
    baseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    viewportAspectRatio: 1,
    revision: 4,
    capabilities: capabilities(),
    ...patch,
  });
}

function buildMockGlb(jsonPayload: Record<string, unknown>): ArrayBuffer {
  const raw = new TextEncoder().encode(JSON.stringify(jsonPayload));
  const paddedLen = Math.ceil(raw.byteLength / 4) * 4;
  const totalLen = 20 + paddedLen;
  const buf = new ArrayBuffer(totalLen);
  const view = new DataView(buf);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLen, true);
  view.setUint32(12, paddedLen, true);
  view.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(buf, 20, paddedLen);
  bytes.fill(0x20);
  bytes.set(raw);
  return buf;
}

describe("Studio BG3D professional runtime readiness", () => {
  it("projects live runtime objects into one authority before planning render passes", () => {
    const result = readiness();
    expect(result.status).toBe("ready");
    expect(result.productionReady).toBe(true);
    expect(result.authority?.document.entities).toContainEqual(
      expect.objectContaining({ id: "box-a", kind: "primitive" }),
    );
    expect(result.summary).toMatchObject({
      authorityId: "bg3d:document-a",
      entityCount: 1,
      primaryRenderer: "three-webgpu",
      maxTextureDimension2d: 8192,
      deviceMemoryGiB: 8,
      gpuBudgetStatus: "optimal",
      recommendedMaxDpr: 2,
      recommendedTargetFps: 60,
    });
    expect(result.summary.enabledPassCount).toBeGreaterThanOrEqual(8);
  });

  it("flags constrained GPU memory/texture budgets without mutating scene ownership", () => {
    const lowMemCaps = deriveStudioBg3dProfessionalDeviceCapabilities({
      enginePlan: WEBGPU_PLAN,
      webGpuProbe: WEBGPU_PROBE,
      deviceSignals: { deviceMemoryGb: 4 },
      maxTextureDimension2d: 4096,
    });
    const result = readiness({ capabilities: lowMemCaps });
    expect(result.summary).toMatchObject({
      maxTextureDimension2d: 4096,
      deviceMemoryGiB: 4,
      gpuBudgetStatus: "constrained",
      recommendedMaxDpr: 1.25,
      recommendedTargetFps: 30,
    });
  });

  it("verifies glTF 2.0 binary framing and blocks negative-scale normal inversion", () => {
    const cleanGlb = buildMockGlb({
      asset: { version: "2.0" },
      meshes: [{ name: "SalonProp" }],
      nodes: [{ mesh: 0, scale: [1, 1, 1] }],
    });
    expect(inspectStudioBg3dGlbBinaryHeader(cleanGlb)).toEqual({
      valid: true,
      magicHex: "0x46546c67",
      version: 2,
      meshCount: 1,
      negativeScaleNodeCount: 0,
      failureReason: null,
    });

    const flippedGlb = buildMockGlb({
      asset: { version: "2.0" },
      meshes: [{ name: "MirroredDoor" }],
      nodes: [{ mesh: 0, scale: [-1, 1, 1] }],
    });
    const flippedAudit = inspectStudioBg3dGlbBinaryHeader(flippedGlb);
    expect(flippedAudit.valid).toBe(false);
    expect(flippedAudit.negativeScaleNodeCount).toBe(1);
    expect(flippedAudit.failureReason).toContain("외곽선 노멀 반전");
  });

  it("fails closed while preserving the canonical authority receipt when the renderer is unavailable", () => {
    const result = readiness({
      capabilities: { ...capabilities(), webgpu: false, webgl2: false },
      runtimeFailure: {
        kind: "webgpu-device-lost",
        attempt: 1,
        recoverable: false,
      },
    });
    expect(result).toMatchObject({
      status: "blocked",
      failureCode: "renderer-unavailable",
      editorReady: false,
      productionReady: false,
    });
    expect(result.summary.gpuBudgetStatus).toBe("unknown");
    expect(result.authority?.sourceHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.recovery).toMatchObject({
      action: "offer-explicit-webgl2-switch",
      preservesDocumentAuthority: true,
      requiresUserConfirmation: true,
    });
  });

  it("keeps Babylon outside scene ownership and only counts enabled specialist passes", () => {
    const result = readiness({ babylonSpecialistAvailable: true });
    expect(result.summary.specialistPassCount).toBe(0);
    expect(result.plan?.renderGraph.passes.find(({ id }) => id === "fx-overlay")).toMatchObject({
      executor: "babylon-specialist",
      enabled: false,
    });
    expect(result.authority?.kind).toBe("toonstudio.scene3d-authority");
  });
});
