import { create as createSkpBuilder } from "openskp";
import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES,
  STUDIO_BG3D_SKP_MAX_SOURCE_BYTES,
  STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES,
  StudioBg3dSkpConversionError,
  resolveStudioBg3dSkpMaxSourceBytes,
} from "./studio-bg3d-skp-contract";
import {
  assertStudioBg3dSkpModelDataSize,
  assertStudioBg3dSkpSourceSize,
  assertStudioBg3dSkpSupportedVersion,
  formatStudioBg3dSkpProductLabel,
  hasStudioBg3dSkpSignature,
  inspectStudioBg3dSkpHeader,
  preflightStudioBg3dSkpBytes,
  preflightStudioBg3dSkpSource,
} from "./studio-bg3d-skp-preflight";
import { createSkpHeaderBytes, createSkpVffBytes } from "./studio-bg3d-skp.test-fixture";

function failureOf(action: () => void): StudioBg3dSkpConversionError {
  try {
    action();
  } catch (error) {
    if (error instanceof StudioBg3dSkpConversionError) return error;
    throw error;
  }
  throw new Error("실패해야 하는 호출이 성공했습니다.");
}

describe("hasStudioBg3dSkpSignature", () => {
  it("accepts only the FF FE FF 0E signature", () => {
    expect(hasStudioBg3dSkpSignature(new Uint8Array([0xff, 0xfe, 0xff, 0x0e]))).toBe(true);
    expect(hasStudioBg3dSkpSignature(createSkpHeaderBytes())).toBe(true);
    expect(hasStudioBg3dSkpSignature(new Uint8Array([0xff, 0xfe, 0xff, 0x0f]))).toBe(false);
    expect(hasStudioBg3dSkpSignature(new Uint8Array([0x00, 0xfe, 0xff, 0x0e]))).toBe(false);
  });

  it("rejects empty and truncated input without throwing", () => {
    expect(hasStudioBg3dSkpSignature(new Uint8Array(0))).toBe(false);
    expect(hasStudioBg3dSkpSignature(new Uint8Array([0xff, 0xfe, 0xff]))).toBe(false);
  });
});

describe("inspectStudioBg3dSkpHeader", () => {
  it("reads a modern (VFF) header: container, version and product label", () => {
    const header = inspectStudioBg3dSkpHeader(createSkpHeaderBytes({ version: "{21.0.339}", container: "vff" }));
    expect(header.container).toBe("vff");
    expect(header.version).toEqual({ raw: "21.0.339", major: 21, label: "SketchUp 2021" });
  });

  it("reads a legacy (MFC) header", () => {
    const header = inspectStudioBg3dSkpHeader(createSkpHeaderBytes({ version: "{17.0.1}", container: "legacy" }));
    expect(header.container).toBe("legacy");
    expect(header.version).toEqual({ raw: "17.0.1", major: 17, label: "SketchUp 2017" });
  });

  it("reports an unknown container and a missing version honestly instead of guessing", () => {
    const header = inspectStudioBg3dSkpHeader(createSkpHeaderBytes({ version: null, container: "unknown" }));
    expect(header.container).toBe("unknown");
    expect(header.version).toEqual({ raw: null, major: null, label: null });
  });

  it("matches the header that the openskp writer actually produces", () => {
    const builder = createSkpBuilder();
    builder.addFace([[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]]);
    const header = inspectStudioBg3dSkpHeader(builder.toBytes());
    expect(header.container).toBe("legacy");
    expect(header.version.major).toBe(17);
    expect(header.version.label).toBe("SketchUp 2017");
  });

  it("fails immediately when the first bytes are not the SketchUp signature", () => {
    const text = new TextEncoder().encode("solid cube\nendsolid cube\n");
    const error = failureOf(() => inspectStudioBg3dSkpHeader(text));
    expect(error.code).toBe("skp-parse-failed");
    expect(error.reason).toBe("invalid-signature");
    expect(failureOf(() => inspectStudioBg3dSkpHeader(new Uint8Array(0))).reason).toBe("invalid-signature");
  });

  it("does not misread a version when the digits are not wrapped in braces", () => {
    const bytes = createSkpHeaderBytes({ version: "21.0.339" });
    expect(inspectStudioBg3dSkpHeader(bytes).version.raw).toBeNull();
  });
});

describe("assertStudioBg3dSkpSupportedVersion / preflightStudioBg3dSkpBytes", () => {
  it("accepts SketchUp 2013 (major 13) and newer, including unknown future majors", () => {
    expect(() => preflightStudioBg3dSkpBytes(createSkpHeaderBytes({ version: "{13.0.4810}" }))).not.toThrow();
    expect(() => preflightStudioBg3dSkpBytes(createSkpHeaderBytes({ version: "{99.1.0}" }))).not.toThrow();
  });

  it("rejects files older than SketchUp 2013 with the unsupported-version code", () => {
    const error = failureOf(() => preflightStudioBg3dSkpBytes(createSkpHeaderBytes({ version: "{12.0.5}" })));
    expect(error.code).toBe("skp-unsupported-version");
    expect(error.reason).toBe("unsupported-version");
    expect(error.detail).toEqual({ major: 12, minimumMajor: 13 });
    expect(failureOf(() =>
      assertStudioBg3dSkpSupportedVersion({ raw: "8.0.4810", major: 8, label: "SketchUp 8" })).message,
    ).toContain("SketchUp 8");
  });

  it("lets a file with an unreadable version through to the parser to decide", () => {
    expect(() => preflightStudioBg3dSkpBytes(createSkpHeaderBytes({ version: null }))).not.toThrow();
  });

  it("labels versions as product years from 2013 and as plain numbers before", () => {
    expect(formatStudioBg3dSkpProductLabel(25)).toBe("SketchUp 2025");
    expect(formatStudioBg3dSkpProductLabel(13)).toBe("SketchUp 2013");
    expect(formatStudioBg3dSkpProductLabel(8)).toBe("SketchUp 8");
  });
});

describe("assertStudioBg3dSkpSourceSize", () => {
  it("accepts the exact limit and rejects one byte more with the source-limit reason", () => {
    expect(() => assertStudioBg3dSkpSourceSize(1000, { maxBytes: 1000 })).not.toThrow();
    const error = failureOf(() => assertStudioBg3dSkpSourceSize(1001, { maxBytes: 1000 }));
    expect(error.code).toBe("skp-too-large");
    expect(error.reason).toBe("source-limit");
    expect(error.detail).toEqual({ byteLength: 1001, limitBytes: 1000 });
  });

  it("applies the much smaller main-thread cap when no Worker can be used", () => {
    expect(() => assertStudioBg3dSkpSourceSize(STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES, {
      maxBytes: STUDIO_BG3D_SKP_MAX_SOURCE_BYTES,
      mainThread: true,
    })).not.toThrow();
    const error = failureOf(() => assertStudioBg3dSkpSourceSize(STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES + 1, {
      maxBytes: STUDIO_BG3D_SKP_MAX_SOURCE_BYTES,
      mainThread: true,
    }));
    expect(error.code).toBe("skp-too-large");
    expect(error.reason).toBe("main-thread-limit");
  });

  it("rejects empty and non-integer sizes as unreadable files", () => {
    for (const size of [0, -1, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(failureOf(() => assertStudioBg3dSkpSourceSize(size, { maxBytes: 100 })).code).toBe("skp-parse-failed");
    }
  });

  it("uses a smaller source cap on mobile than on desktop", () => {
    expect(resolveStudioBg3dSkpMaxSourceBytes("mobile")).toBe(STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES);
    expect(resolveStudioBg3dSkpMaxSourceBytes("desktop")).toBe(STUDIO_BG3D_SKP_MAX_SOURCE_BYTES);
    expect(resolveStudioBg3dSkpMaxSourceBytes(undefined)).toBe(STUDIO_BG3D_SKP_MAX_SOURCE_BYTES);
    expect(STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES).toBeLessThan(STUDIO_BG3D_SKP_MAX_SOURCE_BYTES);
  });
});

const MIB = 1024 * 1024;

describe("assertStudioBg3dSkpModelDataSize", () => {
  const policy = { maxBytes: 32 * MIB };

  it("rejects a small modern file whose model data expands beyond the limit, with the model-data reason", () => {
    const bytes = createSkpVffBytes([{ name: "model.dat", uncompressedSize: 32 * MIB + 1 }]);
    expect(bytes.byteLength).toBeLessThan(1024);
    const error = failureOf(() => assertStudioBg3dSkpModelDataSize(bytes, inspectStudioBg3dSkpHeader(bytes), policy));
    expect(error.code).toBe("skp-too-large");
    expect(error.reason).toBe("model-data-limit");
    expect(error.detail).toEqual({ modelDataBytes: 32 * MIB + 1, limitBytes: 32 * MIB });
  });

  it("accepts model data exactly at the limit and reads nothing into legacy or unreadable files", () => {
    const atLimit = createSkpVffBytes([{ name: "model.dat", uncompressedSize: 32 * MIB }]);
    expect(() => assertStudioBg3dSkpModelDataSize(atLimit, inspectStudioBg3dSkpHeader(atLimit), policy)).not.toThrow();

    // 레거시는 파일 전체가 모델 데이터라 원본 크기 검사가 이미 맡는다.
    const legacy = createSkpHeaderBytes({ container: "legacy", version: "{17.0.1}" });
    expect(() => assertStudioBg3dSkpModelDataSize(legacy, inspectStudioBg3dSkpHeader(legacy), policy)).not.toThrow();

    // 크기를 확실히 읽지 못하면(ZIP64, model.dat 없음) 거절하지 않고 파서에 맡긴다.
    const zip64 = createSkpVffBytes([{ name: "model.dat", uncompressedSize: 1 }], { zip64FirstEntry: true });
    expect(() => assertStudioBg3dSkpModelDataSize(zip64, inspectStudioBg3dSkpHeader(zip64), policy)).not.toThrow();
  });

  it("applies the much smaller main-thread cap to the model data as well", () => {
    const bytes = createSkpVffBytes([{ name: "model.dat", uncompressedSize: STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES + 1 }]);
    const header = inspectStudioBg3dSkpHeader(bytes);
    expect(() => assertStudioBg3dSkpModelDataSize(bytes, header, policy)).not.toThrow();
    const error = failureOf(() => assertStudioBg3dSkpModelDataSize(bytes, header, { ...policy, mainThread: true }));
    expect(error.reason).toBe("model-data-limit");
    expect(error.detail).toEqual({
      modelDataBytes: STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES + 1,
      limitBytes: STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES,
    });
  });
});

describe("preflightStudioBg3dSkpSource", () => {
  const policy = { maxBytes: 32 * MIB };

  it("returns the header of a file that passes every check", () => {
    const header = preflightStudioBg3dSkpSource(createSkpVffBytes(), policy);
    expect(header).toMatchObject({ container: "vff", version: { major: 21 } });
  });

  it("reports the first failing check: size, then signature, then version, then model data", () => {
    const code = (bytes: Uint8Array, limit = policy) =>
      failureOf(() => preflightStudioBg3dSkpSource(bytes, limit)).reason;
    expect(code(createSkpVffBytes(), { maxBytes: 8 })).toBe("source-limit");
    expect(code(new Uint8Array(64).fill(3))).toBe("invalid-signature");
    expect(code(createSkpVffBytes([{ name: "model.dat", uncompressedSize: 1 }], { version: "{12.0.5}" }))).toBe("unsupported-version");
    expect(code(createSkpVffBytes([{ name: "model.dat", uncompressedSize: 33 * MIB }]))).toBe("model-data-limit");
  });
});
