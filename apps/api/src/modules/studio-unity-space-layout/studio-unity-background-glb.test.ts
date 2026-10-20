import { describe, expect, it } from "vitest";

import {
  UNITY_SPACE_BACKGROUND_MAX_BYTES,
  validateUnityBackgroundGlb,
} from "./studio-unity-background-glb";

/** 테스트용 최소 GLB를 조립한다 (JSON 청크 + 선택적 BIN 청크). */
function buildGlb(
  document: Record<string, unknown>,
  options: { binChunk?: boolean; version?: number; declaredLengthDelta?: number } = {},
): Buffer {
  const jsonText = JSON.stringify(document);
  const jsonPadded = jsonText + " ".repeat((4 - (jsonText.length % 4)) % 4);
  const jsonBuffer = Buffer.from(jsonPadded, "utf-8");
  const binBuffer = options.binChunk === false ? null : Buffer.alloc(16, 7);
  const totalLength =
    12 + 8 + jsonBuffer.length + (binBuffer ? 8 + binBuffer.length : 0);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(options.version ?? 2, 4);
  header.writeUInt32LE(totalLength + (options.declaredLengthDelta ?? 0), 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const parts = [header, jsonChunkHeader, jsonBuffer];
  if (binBuffer) {
    const binChunkHeader = Buffer.alloc(8);
    binChunkHeader.writeUInt32LE(binBuffer.length, 0);
    binChunkHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"
    parts.push(binChunkHeader, binBuffer);
  }
  return Buffer.concat(parts);
}

const VALID_DOCUMENT = {
  asset: { version: "2.0", generator: "test" },
  meshes: [{ primitives: [] }],
  scenes: [{ nodes: [] }],
};

describe("validateUnityBackgroundGlb", () => {
  it("accepts a minimal well-formed glTF 2.0 binary with a mesh", () => {
    const verdict = validateUnityBackgroundGlb(buildGlb(VALID_DOCUMENT));
    expect(verdict.ok).toBe(true);
  });

  it("accepts EXT_texture_webp as required (이전 Godot 무대 실측 — 목록 유지, DESIGN §5.5)", () => {
    const verdict = validateUnityBackgroundGlb(
      buildGlb({
        ...VALID_DOCUMENT,
        extensionsUsed: ["EXT_texture_webp"],
        extensionsRequired: ["EXT_texture_webp"],
      }),
    );
    expect(verdict.ok).toBe(true);
  });

  it("accepts a forbidden extension that is only used, not required", () => {
    const verdict = validateUnityBackgroundGlb(
      buildGlb({
        ...VALID_DOCUMENT,
        extensionsUsed: ["KHR_texture_basisu"],
      }),
    );
    expect(verdict.ok).toBe(true);
  });

  it("rejects an empty file", () => {
    const verdict = validateUnityBackgroundGlb(new Uint8Array(0));
    expect(verdict.ok).toBe(false);
  });

  it("rejects a file over the 20MB cap", () => {
    const verdict = validateUnityBackgroundGlb(
      new Uint8Array(UNITY_SPACE_BACKGROUND_MAX_BYTES + 1),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("20MB");
  });

  it("rejects a non-GLB payload (bad magic)", () => {
    const verdict = validateUnityBackgroundGlb(
      Buffer.from("this is not a glb file at all........"),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("GLB 파일이 아닙니다");
  });

  it("rejects a glTF 1.0 binary (version field)", () => {
    const verdict = validateUnityBackgroundGlb(
      buildGlb(VALID_DOCUMENT, { version: 1 }),
    );
    expect(verdict.ok).toBe(false);
  });

  it("rejects a truncated file (declared length mismatch)", () => {
    const verdict = validateUnityBackgroundGlb(
      buildGlb(VALID_DOCUMENT, { declaredLengthDelta: 16 }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("선언 길이");
  });

  it("rejects a document whose asset.version is not 2.x", () => {
    const verdict = validateUnityBackgroundGlb(
      buildGlb({ asset: { version: "1.0" }, meshes: [{}] }),
    );
    expect(verdict.ok).toBe(false);
  });

  it("rejects a GLB without a BIN chunk", () => {
    const verdict = validateUnityBackgroundGlb(
      buildGlb(VALID_DOCUMENT, { binChunk: false }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("BIN");
  });

  it("rejects a GLB without meshes", () => {
    const verdict = validateUnityBackgroundGlb(
      buildGlb({ asset: { version: "2.0" }, scenes: [{ nodes: [] }] }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("메시");
  });

  // 이전 Godot 런타임이 실제로 거부한 압축 확장들 (2026-10-12 헤드리스 실측).
  // Unity 전환 초기에는 동등성 확보를 위해 목록을 그대로 유지한다 (DESIGN §5.5).
  it.each([
    "EXT_meshopt_compression",
    "KHR_mesh_quantization",
    "KHR_draco_mesh_compression",
    "KHR_texture_basisu",
  ])("rejects %s when it is a required extension", (extension) => {
    const verdict = validateUnityBackgroundGlb(
      buildGlb({
        ...VALID_DOCUMENT,
        extensionsUsed: [extension],
        extensionsRequired: [extension],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain(extension);
  });

  it("rejects the meshopt+basisu combination of three.js-optimized files", () => {
    const verdict = validateUnityBackgroundGlb(
      buildGlb({
        ...VALID_DOCUMENT,
        extensionsUsed: [
          "EXT_meshopt_compression",
          "EXT_texture_webp",
          "KHR_mesh_quantization",
          "KHR_texture_basisu",
        ],
        extensionsRequired: [
          "EXT_meshopt_compression",
          "EXT_texture_webp",
          "KHR_mesh_quantization",
          "KHR_texture_basisu",
        ],
      }),
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toContain("EXT_meshopt_compression");
      expect(verdict.reason).toContain("KHR_texture_basisu");
    }
  });

  it("rejects a corrupt JSON chunk", () => {
    const glb = buildGlb(VALID_DOCUMENT);
    glb.write("{broken", 20, "utf-8");
    const verdict = validateUnityBackgroundGlb(glb);
    expect(verdict.ok).toBe(false);
  });

  it("rejects trailing garbage after the last chunk", () => {
    const glb = Buffer.concat([buildGlb(VALID_DOCUMENT), Buffer.from("xx")]);
    // 선언 길이를 실제와 맞추면 청크 워크가 끝에서 어긋나는 경우
    glb.writeUInt32LE(glb.length, 8);
    const verdict = validateUnityBackgroundGlb(glb);
    expect(verdict.ok).toBe(false);
  });
});
