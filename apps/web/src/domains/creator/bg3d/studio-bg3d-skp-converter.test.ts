import { create as createSkpBuilder } from "openskp";
import { describe, expect, it } from "vitest";

import {
  convertStudioBg3dSkpToGlb,
  StudioBg3dSkpConverterUnavailableError,
  StudioBg3dSkpParseError,
  type OpenSkpModuleLike,
} from "./studio-bg3d-skp-converter";

// Minimal GLB header: magic "glTF" + version + length (12 bytes, no chunks — the facade only
// checks the magic and non-emptiness; full GLB validation happens downstream in the importer).
function fakeGlbBytes(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
  return bytes;
}

function fakeModule(overrides: Partial<OpenSkpModuleLike> = {}): OpenSkpModuleLike {
  return {
    buildScene: () => ({ glbPrimitives: [] }),
    toGLB: () => fakeGlbBytes(),
    ...overrides,
  };
}

describe("convertStudioBg3dSkpToGlb", () => {
  it("converts via buildScene → toGLB and passes an ArrayBuffer copy", async () => {
    let received: unknown;
    const loader = async () =>
      fakeModule({
        buildScene: (source) => {
          received = source;
          return { scene: true };
        },
      });
    const input = new Uint8Array([0xff, 0xfe, 0x25, 0x73]);
    const glb = await convertStudioBg3dSkpToGlb(input, loader);
    expect(glb.subarray(0, 4)).toEqual(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
    expect(received).toBeInstanceOf(ArrayBuffer);
  });

  it("propagates converter-unavailable honestly instead of faking a conversion", async () => {
    const loader = async (): Promise<OpenSkpModuleLike> => {
      throw new StudioBg3dSkpConverterUnavailableError();
    };
    await expect(convertStudioBg3dSkpToGlb(new Uint8Array([1]), loader)).rejects.toBeInstanceOf(
      StudioBg3dSkpConverterUnavailableError,
    );
  });

  it("maps parser failures to the typed parse error", async () => {
    const loader = async () =>
      fakeModule({
        buildScene: () => {
          throw new Error("unsupported container");
        },
      });
    await expect(convertStudioBg3dSkpToGlb(new Uint8Array([1]), loader)).rejects.toBeInstanceOf(
      StudioBg3dSkpParseError,
    );
  });

  it("rejects converter output that is not a GLB", async () => {
    const loader = async () =>
      fakeModule({ toGLB: () => new Uint8Array([0x50, 0x4b, 0x03, 0x04]) });
    await expect(convertStudioBg3dSkpToGlb(new Uint8Array([1]), loader)).rejects.toBeInstanceOf(
      StudioBg3dSkpParseError,
    );
  });

  it("accepts ArrayBuffer output from toGLB", async () => {
    const loader = async () =>
      fakeModule({ toGLB: () => fakeGlbBytes().buffer as ArrayBuffer });
    const glb = await convertStudioBg3dSkpToGlb(new Uint8Array([1]), loader);
    expect(glb.byteLength).toBe(12);
  });
});

describe("convertStudioBg3dSkpToGlb with the real openskp package", () => {
  // openskp 1.3.0이 정식 의존성으로 활성화된 뒤의 기본 로더 경로를 검증한다.
  // 픽스처는 openskp 자체 작성기(SkpBuilder)로 만든 실제 .skp 바이트다.
  function realSkpBytes(): Uint8Array {
    const builder = createSkpBuilder();
    builder.addFace([[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]]);
    return builder.toBytes();
  }

  it("converts a real .skp file to a GLB through the default loader", async () => {
    const glb = await convertStudioBg3dSkpToGlb(realSkpBytes());
    expect(glb.byteLength).toBeGreaterThan(0);
    expect(glb.subarray(0, 4)).toEqual(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
  });

  it("maps a corrupt .skp file to the parse error, not the unavailable error", async () => {
    await expect(convertStudioBg3dSkpToGlb(new Uint8Array([7, 8, 9]))).rejects.toBeInstanceOf(
      StudioBg3dSkpParseError,
    );
  });
});
