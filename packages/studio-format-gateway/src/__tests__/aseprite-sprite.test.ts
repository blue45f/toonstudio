import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildAsepriteFixture,
  celChunk,
  layerChunk,
  sliceChunk,
  frameOf,
  spriteOf,
  richAsepriteSpec,
  RICH_RAW_2X2,
  type FixtureSpec,
} from "../../../../tests/corpus/formats/aseprite-fixtures";
import {
  ASEPRITE_SPRITE_LIMITS,
  AsepriteSpriteError,
  importAsepriteSprite,
  inspectAsepriteSignature,
  type AsepriteSpriteErrorCode,
  type AsepriteSpriteImportOptions,
  type AsepriteSpriteImportResult,
} from "../aseprite-sprite";

type Input = Uint8Array | ArrayBuffer | Blob;

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((entry) => entry.code);
}

async function importSpec(spec: FixtureSpec, options?: AsepriteSpriteImportOptions): Promise<AsepriteSpriteImportResult> {
  return importAsepriteSprite(buildAsepriteFixture(spec), options);
}

async function failureOf(input: Input, options?: AsepriteSpriteImportOptions): Promise<AsepriteSpriteErrorCode> {
  try {
    await importAsepriteSprite(input, options);
  } catch (error) {
    if (error instanceof AsepriteSpriteError) return error.code;
    throw error;
  }
  throw new Error("예외가 발생하지 않았다");
}

describe("Aseprite 서명과 입력", () => {
  it("매직 0xA5E0만 Aseprite로 판정하고 Adobe Swatch Exchange와 구분한다", () => {
    const bytes = buildAsepriteFixture(spriteOf([frameOf([])]));

    expect(inspectAsepriteSignature(bytes)).toBe("aseprite");
    expect(inspectAsepriteSignature(new TextEncoder().encode("ASEF\u0000\u0001\u0000\u0000"))).toBe("adobe-swatch-exchange");
    expect(inspectAsepriteSignature(new Uint8Array(200))).toBe("unknown");
    expect(inspectAsepriteSignature(bytes.subarray(0, 127))).toBe("unknown");
  });

  it("서명이 틀리거나 헤더보다 짧은 입력은 signature-invalid로 거부한다", async () => {
    const adobe = new Uint8Array(200);
    adobe.set([0x41, 0x53, 0x45, 0x46]);

    expect(await failureOf(new Uint8Array(0))).toBe("signature-invalid");
    expect(await failureOf(new Uint8Array(127))).toBe("signature-invalid");
    expect(await failureOf(buildAsepriteFixture(spriteOf([frameOf([])], { magicOverride: 0xa5e1 })))).toBe("signature-invalid");
    await expect(importAsepriteSprite(adobe)).rejects.toThrow(/Adobe Swatch Exchange/);
  });

  it.each([
    ["색 깊이 12", { depthOverride: 12 }],
    ["너비 0", { width: 0 }],
    ["높이 0", { height: 0 }],
    ["프레임 0개", { frameCountOverride: 0 }],
  ] as const)("헤더가 %s이면 header-invalid로 거부한다", async (_label, extra) => {
    expect(await failureOf(buildAsepriteFixture(spriteOf([frameOf([])], extra)))).toBe("header-invalid");
  });

  it("호출자는 한도를 낮추기만 할 수 있고 넘으면 해당 한도 오류로 거부한다", async () => {
    const bytes = buildAsepriteFixture(spriteOf([frameOf([]), frameOf([])]));

    expect(await failureOf(bytes, { limits: { maxCanvasDimension: 3 } })).toBe("limit-exceeded");
    expect(await failureOf(bytes, { limits: { maxFrames: 1 } })).toBe("limit-exceeded");
    expect(await failureOf(bytes, { limits: { maxFileBytes: bytes.byteLength - 1 } })).toBe("source-too-large");
    // 기본값보다 큰 값, 음수, 소수는 한도로 받지 않는다.
    expect(await failureOf(bytes, { limits: { maxFrames: ASEPRITE_SPRITE_LIMITS.maxFrames + 1 } })).toBe("source-too-large");
    expect(await failureOf(bytes, { limits: { maxFrames: -1 } })).toBe("source-too-large");
    expect(await failureOf(bytes, { limits: { maxFrames: 1.5 } })).toBe("source-too-large");
    expect(Object.isFrozen(ASEPRITE_SPRITE_LIMITS)).toBe(true);
  });

  it("프레임당 청크 수·레이어 수·셀 수 한도를 지킨다", async () => {
    const layers = buildAsepriteFixture(spriteOf([frameOf([layerChunk({ name: "a" }), layerChunk({ name: "b" })])]));
    const cel = (layer: number) => celChunk({ layer, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(1, 2, 3, 4) } });
    const cels = buildAsepriteFixture(spriteOf([frameOf([layerChunk({ name: "a" }), cel(0), cel(0)])]));
    const slices = buildAsepriteFixture(
      spriteOf([frameOf([sliceChunk({ name: "s1", keys: [] }), sliceChunk({ name: "s2", keys: [] })])]),
    );

    expect(await failureOf(layers, { limits: { maxChunksPerFrame: 1 } })).toBe("limit-exceeded");
    expect(await failureOf(layers, { limits: { maxLayers: 1 } })).toBe("limit-exceeded");
    expect(await failureOf(cels, { limits: { maxCels: 1 } })).toBe("limit-exceeded");
    expect(await failureOf(slices, { limits: { maxSlices: 1 } })).toBe("limit-exceeded");
  });

  it("중단 신호가 이미 켜져 있거나 해제 중에 켜지면 aborted로 거부한다", async () => {
    const early = new AbortController();
    early.abort();
    const bytes = buildAsepriteFixture(
      spriteOf([
        frameOf([
          layerChunk({ name: "L" }),
          celChunk({ layer: 0, body: { kind: "compressed", width: 1, height: 1, pixels: Uint8Array.of(1, 2, 3, 4) } }),
        ]),
      ]),
    );
    const late = new AbortController();

    expect(await failureOf(bytes, { signal: early.signal })).toBe("aborted");
    expect(
      await failureOf(bytes, {
        signal: late.signal,
        inflate: async () => {
          late.abort();
          throw new DOMException("중단", "AbortError");
        },
      }),
    ).toBe("aborted");
  });

  it("Uint8Array·ArrayBuffer·Blob 입력이 같은 결과와 SHA-256을 내고 호출자 버퍼와 메모리를 공유하지 않는다", async () => {
    const bytes = buildAsepriteFixture(richAsepriteSpec());
    const expectedSha = createHash("sha256").update(bytes).digest("hex");

    const fromBytes = await importAsepriteSprite(bytes);
    const fromBuffer = await importAsepriteSprite(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const fromBlob = await importAsepriteSprite(new Blob([new Uint8Array(bytes)]));
    const rawPixels = fromBytes.cels[0]!.pixels!.slice();
    bytes.fill(0xff);

    expect(fromBytes.source).toEqual({ byteLength: fromBuffer.source.byteLength, sha256: expectedSha });
    expect(fromBuffer.source).toEqual(fromBytes.source);
    expect(fromBlob.source).toEqual(fromBytes.source);
    expect(fromBytes.cels[0]!.pixels).toEqual(rawPixels);
    expect(rawPixels).toEqual(RICH_RAW_2X2);
  });
});

describe("Aseprite 헤더와 프레임", () => {
  it("헤더 필드와 플래그를 읽고 깨끗한 파일에는 진단이 없다", async () => {
    const result = await importSpec({
      width: 7,
      height: 5,
      depth: 16,
      headerFlags: 7,
      speed: 90,
      transparentIndex: 3,
      colorCount: 16,
      pixelWidth: 2,
      pixelHeight: 1,
      grid: { x: -4, y: 6, width: 24, height: 12 },
      frames: [frameOf([])],
    });

    expect(result.format).toBe("aseprite");
    expect(result.specProfile).toBe("aseprite-file-format-public-spec");
    expect(result.header).toMatchObject({
      frameCount: 1,
      width: 7,
      height: 5,
      colorDepth: 16,
      flags: 7,
      layerOpacityValid: true,
      groupBlendOpacityValid: true,
      layerUuidPresent: true,
      deprecatedFrameDurationMs: 90,
      transparentIndex: 3,
      colorCount: 16,
      pixelRatio: { width: 2, height: 1 },
      grid: { x: -4, y: 6, width: 24, height: 12 },
    });
    expect(result.header.declaredFileSize).toBe(result.source.byteLength);
    expect(result.truncated).toBe(false);
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  it("픽셀 비율에 0이 하나라도 있으면 1:1로 본다", async () => {
    const zeroWidth = await importSpec(spriteOf([frameOf([])], { pixelWidth: 0, pixelHeight: 3 }));
    const zeroHeight = await importSpec(spriteOf([frameOf([])], { pixelWidth: 3, pixelHeight: 0 }));

    expect(zeroWidth.header.pixelRatio).toEqual({ width: 1, height: 1 });
    expect(zeroHeight.header.pixelRatio).toEqual({ width: 1, height: 1 });
  });

  it("프레임 지속시간 0은 헤더 속도로 대체하고 선언값은 따로 보존한다", async () => {
    const result = await importAsepriteSprite(buildAsepriteFixture(richAsepriteSpec()));

    expect(result.frames.map((frame) => frame.durationMs)).toEqual([100, 120, 250]);
    expect(result.frames.map((frame) => frame.declaredDurationMs)).toEqual([100, 0, 250]);
    expect(result.frames.map((frame) => frame.index)).toEqual([0, 1, 2]);
    expect(result.frames[1]!.byteOffset).toBe(result.frames[0]!.byteOffset + result.frames[0]!.byteLength);
  });

  it("헤더의 파일 크기가 실제와 다르면 경고만 하고 계속 읽는다", async () => {
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "L" })])], { fileSizeOverride: 12345 }));

    expect(codes(result.warnings)).toEqual(["aseprite-file-size-mismatch"]);
    expect(result.layers).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it("청크 수는 신 필드가 0이 아니면 신 필드를, 0이면 구 필드를 따른다", async () => {
    const two = [layerChunk({ name: "a" }), layerChunk({ name: "b" })];
    const newWins = await importSpec(spriteOf([frameOf(two, { oldCount: 1, newCount: 2 })]));
    const oldFallback = await importSpec(spriteOf([frameOf(two, { oldCount: 2, newCount: 0 })]));
    const sentinel = await importSpec(spriteOf([frameOf(two, { oldCount: 0xffff, newCount: 2 })]));
    const undercount = await importSpec(spriteOf([frameOf(two, { oldCount: 1, newCount: 0 })]));

    expect(newWins.layers).toHaveLength(2);
    expect(oldFallback.layers).toHaveLength(2);
    expect(sentinel.layers).toHaveLength(2);
    expect(sentinel.frames[0]!.chunkCount).toBe(2);
    // 선언보다 청크가 더 있으면 남은 바이트를 진단한다.
    expect(undercount.layers).toHaveLength(1);
    expect(codes(undercount.warnings)).toEqual(["aseprite-frame-trailing-bytes"]);
  });

  it("구 청크 수 0xFFFF와 신 청크 수 0을 함께 선언한 프레임은 읽지 않고 truncated로 표시한다", async () => {
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "a" })], { oldCount: 0xffff, newCount: 0 })]));

    expect(result.truncated).toBe(true);
    expect(result.frames).toEqual([]);
    expect(codes(result.unsupported)).toEqual(["aseprite-frame-invalid"]);
    expect(codes(result.warnings)).toContain("aseprite-frame-count-mismatch");
  });

  it.each([
    ["매직이 틀린", { magic: 0xf1fb }],
    ["크기가 파일을 넘는", { bytesOverride: 100_000 }],
    ["크기가 헤더보다 작은", { bytesOverride: 8 }],
  ] as const)("%s 프레임부터는 읽지 않고 앞 프레임은 유지한다", async (_label, bad) => {
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "ok" })]), frameOf([layerChunk({ name: "lost" })], bad)]));

    expect(result.truncated).toBe(true);
    expect(result.frames).toHaveLength(1);
    expect(result.layers.map((layer) => layer.name)).toEqual(["ok"]);
    expect(codes(result.unsupported)).toEqual(["aseprite-frame-invalid"]);
    expect(codes(result.warnings)).toContain("aseprite-frame-count-mismatch");
  });

  it("프레임 헤더가 파일 끝을 넘으면 aseprite-frame-truncated로 표시한다", async () => {
    const bytes = buildAsepriteFixture(spriteOf([frameOf([]), frameOf([])]));
    const cut = bytes.subarray(0, 128 + 16 + 8);
    const result = await importAsepriteSprite(cut);

    expect(result.truncated).toBe(true);
    expect(result.frames).toHaveLength(1);
    expect(codes(result.warnings)).toEqual(expect.arrayContaining(["aseprite-frame-truncated", "aseprite-file-size-mismatch"]));
  });

  it("마지막 프레임 뒤와 청크 밖의 남은 바이트를 경고한다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "L" })], { trailing: Uint8Array.of(9, 9) })], { trailing: Uint8Array.of(1, 2, 3) }),
    );

    expect(codes(result.warnings).sort()).toEqual(["aseprite-frame-trailing-bytes", "aseprite-trailing-bytes"]);
    expect(result.truncated).toBe(false);
    expect(result.layers).toHaveLength(1);
  });

  it("손으로 배치한 최소 바이트열(레이어 1개, 1x1 RGBA 셀)을 읽는다", async () => {
    // 필드 순서와 크기만 확인하는 독립 리터럴이다. 빌더를 거치지 않는다.
    const header = new Array<number>(128).fill(0);
    header.splice(0, 4, 199, 0, 0, 0); // 파일 크기 = 128 + 프레임 71
    header.splice(4, 2, 0xe0, 0xa5); // 매직
    header.splice(6, 2, 1, 0); // 프레임 수
    header.splice(8, 2, 1, 0); // 너비
    header.splice(10, 2, 1, 0); // 높이
    header.splice(12, 2, 32, 0); // 색 깊이
    header.splice(14, 4, 1, 0, 0, 0); // 플래그: 레이어 불투명도 유효
    header.splice(18, 2, 100, 0); // 폐기된 프레임 속도
    const frameHeader = [71, 0, 0, 0, 0xfa, 0xf1, 2, 0, 50, 0, 0, 0, 2, 0, 0, 0];
    const layer = [
      25, 0, 0, 0, 0x04, 0x20, // 크기, 타입 0x2004
      3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, // 플래그, 종류, 레벨, 기본 크기, 블렌드, 불투명도, 예약
      1, 0, 0x4c, // 이름 "L"
    ];
    const cel = [
      30, 0, 0, 0, 0x05, 0x20, // 크기, 타입 0x2005
      0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 레이어, x, y, 불투명도, 타입 0, z, 예약
      1, 0, 1, 0, 10, 20, 30, 40, // 1x1, RGBA
    ];
    const bytes = Uint8Array.from([...header, ...frameHeader, ...layer, ...cel]);

    expect(bytes.byteLength).toBe(199);
    const result = await importAsepriteSprite(bytes);

    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(result.frames[0]).toMatchObject({ durationMs: 50, chunkCount: 2, byteOffset: 128, byteLength: 71 });
    expect(result.layers[0]).toMatchObject({ name: "L", kind: "image", opacity: 255, opacityValid: true });
    expect(result.cels[0]).toMatchObject({ layerIndex: 0, x: 0, y: 0, opacity: 255, kind: "image", width: 1, height: 1 });
    expect(Array.from(result.cels[0]!.pixels!)).toEqual([10, 20, 30, 40]);
  });
});

describe("Aseprite 레이어", () => {
  it("종류·플래그·블렌드 모드·불투명도를 읽는다", async () => {
    const result = await importAsepriteSprite(buildAsepriteFixture(richAsepriteSpec()));
    const [background, group, ink] = result.layers;

    expect(result.layers.map((layer) => layer.index)).toEqual([0, 1, 2]);
    expect(background).toMatchObject({
      name: "Background",
      kind: "image",
      typeValue: 0,
      flags: { visible: true, editable: true, background: true, collapsed: false, lockMovement: false, preferLinkedCels: false, reference: false },
      blendMode: 0,
      blendModeName: "normal",
      opacity: 255,
      uuid: null,
      tilesetIndex: null,
      firstSeenFrame: 0,
    });
    expect(group).toMatchObject({ name: "Group", kind: "group", flags: { visible: true, collapsed: true, editable: false } });
    expect(ink).toMatchObject({ name: "Ink", kind: "image", blendMode: 1, blendModeName: "multiply", opacity: 128 });
  });

  it("자식 레벨로 부모와 깊이를 정하고 보임 여부를 조상까지 합친다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "g1", type: 1, flags: 2 }),
          layerChunk({ name: "g1.a", level: 1, flags: 1 | 2 }),
          layerChunk({ name: "g1.g2", type: 1, level: 1, flags: 1 | 2 }),
          layerChunk({ name: "g1.g2.b", level: 2, flags: 1 | 2 }),
          layerChunk({ name: "root", flags: 1 | 2 }),
        ]),
      ]),
    );

    expect(result.layers.map((layer) => [layer.name, layer.parentIndex, layer.depth, layer.effectiveVisible])).toEqual([
      ["g1", null, 0, false],
      ["g1.a", 0, 1, false],
      ["g1.g2", 0, 1, false],
      ["g1.g2.b", 2, 2, false],
      ["root", null, 0, true],
    ]);
    expect(result.layers[1]!.flags.visible).toBe(true);
  });

  it("헤더 플래그 1·2에 따라 불투명도와 블렌드 모드의 유효성을 표시한다", async () => {
    const chunks = [layerChunk({ name: "img", opacity: 77 }), layerChunk({ name: "grp", type: 1, opacity: 66 })];
    const none = await importSpec(spriteOf([frameOf(chunks)], { headerFlags: 0 }));
    const opacityOnly = await importSpec(spriteOf([frameOf(chunks)], { headerFlags: 1 }));
    const both = await importSpec(spriteOf([frameOf(chunks)], { headerFlags: 3 }));

    const validity = (r: AsepriteSpriteImportResult) => r.layers.map((layer) => [layer.opacityValid, layer.blendModeValid]);
    expect(validity(none)).toEqual([[false, true], [false, false]]);
    expect(validity(opacityOnly)).toEqual([[true, true], [false, false]]);
    expect(validity(both)).toEqual([[true, true], [true, true]]);
    expect(both.layers.map((layer) => layer.opacity)).toEqual([77, 66]);
  });

  it("레벨이 두 단계 이상 뛰면 경고하고 직전 깊이에 붙인다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "g", type: 1 }), layerChunk({ name: "deep", level: 3 })])]),
    );

    expect(codes(result.warnings)).toEqual(["aseprite-layer-child-level-invalid"]);
    expect(result.layers[1]).toMatchObject({ parentIndex: 0, depth: 1 });
  });

  it("그룹이 아닌 부모를 가리키는 레이어는 경고하고 루트에 붙인다", async () => {
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "img" }), layerChunk({ name: "kid", level: 1 })])]));

    expect(codes(result.warnings)).toEqual(["aseprite-layer-parent-not-group"]);
    expect(result.layers[1]).toMatchObject({ parentIndex: null, depth: 0 });
  });

  it("알 수 없는 블렌드 모드와 레이어 타입은 이름을 비우고 경고한다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "x", blend: 99 }), layerChunk({ name: "y", type: 7 })])]),
    );

    expect(result.layers[0]).toMatchObject({ blendMode: 99, blendModeName: null });
    expect(result.layers[1]).toMatchObject({ kind: "unknown", typeValue: 7 });
    expect(codes(result.warnings).sort()).toEqual(["aseprite-blend-mode-unknown", "aseprite-layer-type-unknown"]);
  });

  it("블렌드 모드 19종의 이름을 순서대로 대응한다", async () => {
    const names = [
      "normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light",
      "difference", "exclusion", "hue", "saturation", "color", "luminosity", "addition", "subtract", "divide",
    ];
    const result = await importSpec(spriteOf([frameOf(names.map((_, blend) => layerChunk({ name: `m${blend}`, blend })))]));

    expect(result.layers.map((layer) => layer.blendModeName)).toEqual(names);
    expect(result.warnings).toEqual([]);
  });

  it("헤더 플래그 4이면 레이어마다 UUID 16바이트를 읽는다", async () => {
    const uuid = Array.from({ length: 16 }, (_, index) => index * 17);
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "u", uuid })])], { headerFlags: 1 | 4 }));

    expect(result.layers[0]!.uuid).toBe("00112233-4455-6677-8899-aabbccddeeff");
    expect(result.warnings).toEqual([]);
  });

  it("UUID 플래그가 있는데 UUID가 없는 레이어 청크는 그 청크만 chunk-invalid로 보고한다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "short" }), layerChunk({ name: "ok", uuid: new Array<number>(16).fill(1) })])], { headerFlags: 1 | 4 }),
    );

    expect(result.layers.map((layer) => layer.name)).toEqual(["ok"]);
    expect(codes(result.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(result.truncated).toBe(false);
  });

  it("타일맵 레이어는 타일셋 인덱스를 읽는다", async () => {
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "tiles", type: 2, tilesetIndex: 5 })])]));

    expect(result.layers[0]).toMatchObject({ kind: "tilemap", tilesetIndex: 5 });
  });

  it("첫 프레임이 아닌 프레임의 레이어 청크는 경고하고 뒤에 덧붙인다", async () => {
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "a" })]), frameOf([layerChunk({ name: "late" })])]));

    expect(result.layers.map((layer) => [layer.name, layer.firstSeenFrame])).toEqual([["a", 0], ["late", 1]]);
    expect(codes(result.warnings)).toEqual(["aseprite-layer-in-later-frame"]);
  });

  it("한글·이모지 이름은 보존하고 UTF-8이 아닌 이름은 대체 문자로 읽고 경고한다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([layerChunk({ name: "배경 🎨" }), layerChunk({ name: "", rawName: [0x41, 0xff, 0x42] })]),
      ]),
    );

    expect(result.layers[0]!.name).toBe("배경 🎨");
    expect(result.layers[1]!.name).toBe("A�B");
    expect(codes(result.warnings)).toEqual(["aseprite-string-utf8-invalid"]);
  });
});
