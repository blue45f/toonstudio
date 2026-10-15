import { describe, expect, it } from "vitest";

import { readStudioBg3dSkpModelDataSize } from "./studio-bg3d-skp-zip-index";
import { createSkpVffBytes, createZipIndexBytes } from "./studio-bg3d-skp.test-fixture";

describe("readStudioBg3dSkpModelDataSize", () => {
  it("reads the declared uncompressed size of model.dat among the other entries", () => {
    const bytes = createSkpVffBytes([
      { name: "meta/meta.dat", uncompressedSize: 120 },
      { name: "model.dat", uncompressedSize: 40 * 1024 * 1024 },
      { name: "materials/a/material.xml", uncompressedSize: 900 },
    ]);
    expect(readStudioBg3dSkpModelDataSize(bytes)).toBe(40 * 1024 * 1024);
  });

  it("matches a nested path and any letter case, the way openskp picks its model entry", () => {
    expect(readStudioBg3dSkpModelDataSize(createSkpVffBytes([{ name: "Content/Model.DAT", uncompressedSize: 777 }]))).toBe(777);
    expect(readStudioBg3dSkpModelDataSize(createSkpVffBytes([{ name: "notmodel.dat", uncompressedSize: 5 }]))).toBeNull();
  });

  it("finds the end record even when a ZIP comment follows it", () => {
    const bytes = createSkpVffBytes([{ name: "model.dat", uncompressedSize: 2048 }], { commentBytes: 300 });
    expect(readStudioBg3dSkpModelDataSize(bytes)).toBe(2048);
  });

  it("uses offsets relative to where the ZIP starts, so a large file is read from its tail only", () => {
    const bytes = createSkpVffBytes([{ name: "model.dat", uncompressedSize: 123_456_789 }], { dataBytes: 24 * 1024 * 1024 });
    expect(bytes.byteLength).toBeGreaterThan(24 * 1024 * 1024);
    const started = performance.now();
    expect(readStudioBg3dSkpModelDataSize(bytes)).toBe(123_456_789);
    expect(performance.now() - started).toBeLessThan(250);
  });

  it("does not guess when the size is a ZIP64 marker or model.dat is missing", () => {
    expect(readStudioBg3dSkpModelDataSize(createSkpVffBytes(
      [{ name: "model.dat", uncompressedSize: 1 }],
      { zip64FirstEntry: true },
    ))).toBeNull();
    expect(readStudioBg3dSkpModelDataSize(createSkpVffBytes([{ name: "meta/meta.dat", uncompressedSize: 10 }]))).toBeNull();
    expect(readStudioBg3dSkpModelDataSize(createSkpVffBytes([]))).toBeNull();
  });

  it("returns null for bytes that are not a ZIP, are too short, or have no end record", () => {
    expect(readStudioBg3dSkpModelDataSize(new Uint8Array(0))).toBeNull();
    expect(readStudioBg3dSkpModelDataSize(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBeNull();
    expect(readStudioBg3dSkpModelDataSize(new Uint8Array(4096).fill(9))).toBeNull();
    const truncated = createZipIndexBytes([{ name: "model.dat", uncompressedSize: 10 }]).slice(0, 60);
    expect(readStudioBg3dSkpModelDataSize(truncated)).toBeNull();
  });

  it("returns null instead of reading outside a damaged central directory", () => {
    const base = createZipIndexBytes([{ name: "model.dat", uncompressedSize: 64 }]);
    // 첫 항목의 서명을 깨뜨린다.
    const brokenSignature = base.slice();
    brokenSignature[30] = 0;
    expect(readStudioBg3dSkpModelDataSize(brokenSignature)).toBeNull();

    // 이름 길이를 디렉터리 밖까지 늘린다.
    const longName = base.slice();
    new DataView(longName.buffer).setUint16(30 + 28, 60_000, true);
    expect(readStudioBg3dSkpModelDataSize(longName)).toBeNull();

    // 항목 수만 65,535개로 적고 실제 항목은 하나뿐이며 model.dat 도 아니다. 디렉터리 끝에서 멈춘다.
    const overCount = createZipIndexBytes([{ name: "other.bin", uncompressedSize: 1 }]);
    new DataView(overCount.buffer).setUint16(overCount.byteLength - 22 + 10, 65_535, true);
    expect(readStudioBg3dSkpModelDataSize(overCount)).toBeNull();

    // 중앙 디렉터리 오프셋이 파일 밖을 가리킨다.
    const farOffset = base.slice();
    new DataView(farOffset.buffer).setUint32(farOffset.byteLength - 22 + 16, 0x7fff_0000, true);
    expect(readStudioBg3dSkpModelDataSize(farOffset)).toBeNull();
  });
});
