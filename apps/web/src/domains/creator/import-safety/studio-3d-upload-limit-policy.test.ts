import { describe, expect, it } from "vitest";

import { planStudioBg3dModelImports, type StudioBg3dImportFile } from "../bg3d/studio-bg3d-model-import";
import { resolveStudioBg3dSkpMaxSourceBytes } from "../bg3d/studio-bg3d-skp-contract";
import {
  STUDIO_3D_CLOUD_AI_INLINE_MAX_BYTES,
  STUDIO_3D_CLOUD_WORK_ASSET_3D_MAX_BYTES,
  STUDIO_3D_LOCAL_BATCH_CONSTRAINED_MAX_BYTES,
  STUDIO_3D_LOCAL_BATCH_STANDARD_MAX_BYTES,
  STUDIO_3D_LOCAL_BATCH_WASM64_BALANCED_MAX_BYTES,
  STUDIO_3D_LOCAL_BATCH_WASM64_MAX_BYTES,
  STUDIO_3D_LOCAL_CONSTRAINED_MAX_BYTES,
  STUDIO_3D_LOCAL_CONVERSION_CONSTRAINED_MAX_BYTES,
  STUDIO_3D_LOCAL_CONVERSION_STANDARD_MAX_BYTES,
  STUDIO_3D_LOCAL_CONVERSION_WASM64_BALANCED_MAX_BYTES,
  STUDIO_3D_LOCAL_CONVERSION_WASM64_MAX_BYTES,
  STUDIO_3D_LOCAL_SKP_MOBILE_MAX_BYTES,
  STUDIO_3D_LOCAL_SKP_STANDARD_MAX_BYTES,
  STUDIO_3D_LOCAL_SKP_WASM64_BALANCED_MAX_BYTES,
  STUDIO_3D_LOCAL_SKP_WASM64_MAX_BYTES,
  STUDIO_3D_LOCAL_STANDARD_MAX_BYTES,
  STUDIO_3D_LOCAL_WASM64_BALANCED_MAX_BYTES,
  STUDIO_3D_LOCAL_WASM64_MAX_BYTES,
  classifyStudio3dUploadTarget,
  describeStudio3dLocalLimitBanner,
  detectStudio3dOpfsAvailable,
  formatStudio3dByteLimit,
  probeStudio3dWasm64Support,
  readStudio3dDeviceMemoryGb,
  resolveStudio3dUploadLimitPolicy,
} from "./studio-3d-upload-limit-policy";
import { STUDIO_WASM_PAGE_BYTES } from "../studio-wasm64-memory-governor";

const MIB = 1024 * 1024;
const ONE_PAGE = Number(STUDIO_WASM_PAGE_BYTES);

function virtualImportFile(name: string, size: number): StudioBg3dImportFile {
  const file = new File([], name, { type: "application/octet-stream" });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

describe("studio-3d-upload-limit-policy", () => {
  describe("capability probes", () => {
    it("probes Wasm64 support across real runtime, null host, address:i64, and index:i64", () => {
      expect(typeof probeStudio3dWasm64Support()).toBe("boolean");
      expect(probeStudio3dWasm64Support({ webAssembly: null })).toBe(false);

      const addressI64Host = {
        Memory: class {
          readonly buffer: { readonly byteLength: number };
          constructor(descriptor: { readonly address?: string }) {
            if (descriptor.address !== "i64") {
              throw new TypeError("expected address: i64");
            }
            this.buffer = { byteLength: ONE_PAGE };
          }
        },
      } as unknown as typeof WebAssembly;
      expect(probeStudio3dWasm64Support({ webAssembly: addressI64Host })).toBe(true);

      const indexI64Host = {
        Memory: class {
          readonly buffer: { readonly byteLength: number };
          constructor(descriptor: { readonly index?: string }) {
            if (descriptor.index !== "i64") {
              throw new TypeError("expected index: i64");
            }
            this.buffer = { byteLength: ONE_PAGE };
          }
        },
      } as unknown as typeof WebAssembly;
      expect(probeStudio3dWasm64Support({ webAssembly: indexI64Host })).toBe(true);

      const wasm32OnlyHost = {
        Memory: class {
          constructor() {
            throw new TypeError("i64 memory unsupported");
          }
        },
      } as unknown as typeof WebAssembly;
      expect(probeStudio3dWasm64Support({ webAssembly: wasm32OnlyHost })).toBe(false);
    });

    it("reads deviceMemory and OPFS availability safely from navigatorLike", () => {
      expect(readStudio3dDeviceMemoryGb({ deviceMemory: 8 })).toBe(8);
      expect(readStudio3dDeviceMemoryGb({ deviceMemory: 0 })).toBeNull();
      expect(readStudio3dDeviceMemoryGb({ deviceMemory: Number.NaN })).toBeNull();
      expect(readStudio3dDeviceMemoryGb({ deviceMemory: "8" })).toBeNull();
      expect(readStudio3dDeviceMemoryGb(null)).toBeNull();

      expect(detectStudio3dOpfsAvailable({ storage: { getDirectory: () => Promise.resolve({}) } })).toBe(true);
      expect(detectStudio3dOpfsAvailable({ storage: {} })).toBe(false);
      expect(detectStudio3dOpfsAvailable(null)).toBe(false);
    });
  });

  describe("dynamic tier selection", () => {
    it("selects constrained tier on mobile or <= 2 GiB memory or low-RAM non-Wasm64", () => {
      const mobile = resolveStudio3dUploadLimitPolicy({
        profile: "mobile",
        isWasm64Supported: true,
        deviceMemoryGb: 8,
        opfsAvailable: true,
      });
      expect(mobile.tier).toBe("constrained");
      expect(mobile.maxLocalModelBytes).toBe(STUDIO_3D_LOCAL_CONSTRAINED_MAX_BYTES);
      expect(mobile.maxLocalVrmBytes).toBe(STUDIO_3D_LOCAL_CONSTRAINED_MAX_BYTES);
      expect(mobile.maxLocalConversionSourceBytes).toBe(STUDIO_3D_LOCAL_CONVERSION_CONSTRAINED_MAX_BYTES);
      expect(mobile.maxLocalSkpSourceBytes).toBe(STUDIO_3D_LOCAL_SKP_MOBILE_MAX_BYTES);
      expect(mobile.maxLocalBatchTotalBytes).toBe(STUDIO_3D_LOCAL_BATCH_CONSTRAINED_MAX_BYTES);

      const lowRamDesktop = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: true,
        deviceMemoryGb: 2,
      });
      expect(lowRamDesktop.tier).toBe("constrained");

      const wasm32LowRam = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: false,
        deviceMemoryGb: 3,
      });
      expect(wasm32LowRam.tier).toBe("constrained");
    });

    it("selects standard 256 MiB tier on non-Wasm64 desktop with >= 4 GiB or unknown memory", () => {
      const standardKnown = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: false,
        deviceMemoryGb: 8,
        opfsAvailable: true,
      });
      expect(standardKnown.tier).toBe("standard");
      expect(standardKnown.maxLocalModelBytes).toBe(STUDIO_3D_LOCAL_STANDARD_MAX_BYTES);
      expect(standardKnown.maxLocalConversionSourceBytes).toBe(STUDIO_3D_LOCAL_CONVERSION_STANDARD_MAX_BYTES);
      expect(standardKnown.maxLocalSkpSourceBytes).toBe(STUDIO_3D_LOCAL_SKP_STANDARD_MAX_BYTES);
      expect(standardKnown.maxLocalBatchTotalBytes).toBe(STUDIO_3D_LOCAL_BATCH_STANDARD_MAX_BYTES);

      const standardUnknown = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: false,
        deviceMemoryGb: null,
      });
      expect(standardUnknown.tier).toBe("standard");
    });

    it("selects wasm64-balanced 512 MiB tier on Wasm64 desktop with 4 GiB deviceMemory", () => {
      const balanced = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: true,
        deviceMemoryGb: 4,
        opfsAvailable: true,
      });
      expect(balanced.tier).toBe("wasm64-balanced");
      expect(balanced.maxLocalModelBytes).toBe(STUDIO_3D_LOCAL_WASM64_BALANCED_MAX_BYTES);
      expect(balanced.maxLocalConversionSourceBytes).toBe(STUDIO_3D_LOCAL_CONVERSION_WASM64_BALANCED_MAX_BYTES);
      expect(balanced.maxLocalSkpSourceBytes).toBe(STUDIO_3D_LOCAL_SKP_WASM64_BALANCED_MAX_BYTES);
      expect(balanced.maxLocalBatchTotalBytes).toBe(STUDIO_3D_LOCAL_BATCH_WASM64_BALANCED_MAX_BYTES);
    });

    it("selects wasm64-high-memory 1 GiB tier on Wasm64 desktop with >= 8 GiB or unreported memory", () => {
      const highMem = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: true,
        deviceMemoryGb: 8,
        opfsAvailable: true,
      });
      expect(highMem.tier).toBe("wasm64-high-memory");
      expect(highMem.maxLocalModelBytes).toBe(STUDIO_3D_LOCAL_WASM64_MAX_BYTES);
      expect(highMem.maxLocalConversionSourceBytes).toBe(STUDIO_3D_LOCAL_CONVERSION_WASM64_MAX_BYTES);
      expect(highMem.maxLocalSkpSourceBytes).toBe(STUDIO_3D_LOCAL_SKP_WASM64_MAX_BYTES);
      expect(highMem.maxLocalBatchTotalBytes).toBe(STUDIO_3D_LOCAL_BATCH_WASM64_MAX_BYTES);

      const highMemUnreported = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: true,
        deviceMemoryGb: null,
      });
      expect(highMemUnreported.tier).toBe("wasm64-high-memory");
      expect(highMemUnreported.cloudWorkAsset3dMaxBytes).toBe(STUDIO_3D_CLOUD_WORK_ASSET_3D_MAX_BYTES);
      expect(highMemUnreported.cloudAiInlineMaxBytes).toBe(STUDIO_3D_CLOUD_AI_INLINE_MAX_BYTES);
    });
  });

  describe("local OPFS vs cloud sync classification and formatting", () => {
    it("classifies files across cloud-syncable, local-opfs-only, and over-limit buckets", () => {
      const policy = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: true,
        deviceMemoryGb: 8,
        opfsAvailable: true,
      });

      const cloudSafe = classifyStudio3dUploadTarget(8 * MIB, "vrm", policy);
      expect(cloudSafe.status).toBe("local-and-cloud");
      expect(cloudSafe.summaryKo).toContain("1 GiB");
      expect(cloudSafe.summaryKo).toContain("12 MiB");

      const localOnly = classifyStudio3dUploadTarget(250 * MIB, "glb", policy);
      expect(localOnly.status).toBe("local-opfs-only");
      expect(localOnly.summaryKo).toContain("로컬 OPFS");
      expect(localOnly.summaryKo).toContain("12 MiB");

      const tooLarge = classifyStudio3dUploadTarget(STUDIO_3D_LOCAL_WASM64_MAX_BYTES + 1, "background3d", policy);
      expect(tooLarge.status).toBe("exceeds-local-limit");
      expect(tooLarge.summaryKo).toContain("초과");

      expect(classifyStudio3dUploadTarget(0, "glb", policy).status).toBe("exceeds-local-limit");
    });

    it("formats byte limits and builds banner copy cleanly for ko/en", () => {
      expect(formatStudio3dByteLimit(0)).toBe("0 B");
      expect(formatStudio3dByteLimit(512)).toBe("512 B");
      expect(formatStudio3dByteLimit(64 * 1024)).toBe("64 KiB");
      expect(formatStudio3dByteLimit(256 * MIB)).toBe("256 MiB");
      expect(formatStudio3dByteLimit(1024 * MIB)).toBe("1 GiB");
      expect(formatStudio3dByteLimit(1536 * MIB)).toBe("1.5 GiB");

      const policy = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: true,
        deviceMemoryGb: 16,
        opfsAvailable: true,
      });
      const withSkp = describeStudio3dLocalLimitBanner(policy, { includeSkp: true, includeCloudNote: true });
      expect(withSkp.headlineKo).toContain("Wasm64");
      expect(withSkp.headlineKo).toContain("로컬 OPFS");
      expect(withSkp.headlineKo).toContain("1 GiB");
      expect(withSkp.detailKo).toContain("SKP 최대 256 MiB");
      expect(withSkp.detailKo).toContain("12 MiB");
      expect(withSkp.detailKo).toContain("16 GiB");
      expect(withSkp.detailEn).toContain("SKP up to 256 MiB");

      const sessionOnly = resolveStudio3dUploadLimitPolicy({
        profile: "desktop",
        isWasm64Supported: false,
        deviceMemoryGb: null,
        opfsAvailable: false,
      });
      const noCloud = describeStudio3dLocalLimitBanner(sessionOnly, { includeSkp: false, includeCloudNote: false });
      expect(noCloud.headlineKo).toContain("브라우저 로컬 세션");
      expect(noCloud.detailKo).not.toContain("12 MiB");
    });
  });

  describe("integration with BG3D import planning and SKP limit resolution", () => {
    it("enforces dynamic Wasm64 tier limits in planStudioBg3dModelImports for GLB, OBJ, and SKP", () => {
      const glb300 = [virtualImportFile("castle.glb", 300 * MIB)];
      expect(() => planStudioBg3dModelImports(glb300, { isWasm64Supported: false, deviceMemoryGb: 8 }))
        .toThrowError(expect.objectContaining({ code: "file-too-large" }));
      expect(planStudioBg3dModelImports(glb300, { isWasm64Supported: true, deviceMemoryGb: 8 }).items).toHaveLength(1);

      const obj300 = [virtualImportFile("city.obj", 300 * MIB)];
      expect(() => planStudioBg3dModelImports(obj300, { isWasm64Supported: false, deviceMemoryGb: 8 }))
        .toThrowError(expect.objectContaining({ code: "file-too-large" }));
      expect(planStudioBg3dModelImports(obj300, { isWasm64Supported: true, deviceMemoryGb: 8 }).items).toHaveLength(1);

      const skp150 = [virtualImportFile("house.skp", 150 * MIB)];
      expect(() => planStudioBg3dModelImports(skp150, { profile: "mobile", isWasm64Supported: true }))
        .toThrowError(expect.objectContaining({ code: "skp-too-large" }));
      expect(() => planStudioBg3dModelImports(skp150, { isWasm64Supported: false, deviceMemoryGb: 8 }))
        .toThrowError(expect.objectContaining({ code: "skp-too-large" }));
      expect(planStudioBg3dModelImports(skp150, { isWasm64Supported: true, deviceMemoryGb: 8 }).items).toHaveLength(1);
    });

    it("resolves dynamic SKP source limits by profile and Wasm64 memory tier", () => {
      expect(resolveStudioBg3dSkpMaxSourceBytes("mobile", { isWasm64Supported: true, deviceMemoryGb: 8 }))
        .toBe(STUDIO_3D_LOCAL_SKP_MOBILE_MAX_BYTES);
      expect(resolveStudioBg3dSkpMaxSourceBytes("desktop", { isWasm64Supported: false, deviceMemoryGb: 8 }))
        .toBe(STUDIO_3D_LOCAL_SKP_STANDARD_MAX_BYTES);
      expect(resolveStudioBg3dSkpMaxSourceBytes("desktop", { isWasm64Supported: true, deviceMemoryGb: 4 }))
        .toBe(STUDIO_3D_LOCAL_SKP_WASM64_BALANCED_MAX_BYTES);
      expect(resolveStudioBg3dSkpMaxSourceBytes("desktop", { isWasm64Supported: true, deviceMemoryGb: 8 }))
        .toBe(STUDIO_3D_LOCAL_SKP_WASM64_MAX_BYTES);
    });
  });
});
