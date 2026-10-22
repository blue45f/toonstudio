import { describe, expect, it, vi } from "vitest";

import { fitWithinEdge, planArtDirectorSegments } from "./claude-art-director";
import {
  ART_DIRECTOR_MAX_ENCODED_BYTES,
  ART_DIRECTOR_MAX_FILE_BYTES,
  ART_DIRECTOR_MAX_PIXELS,
  ArtDirectorImageError,
  BROWSER_ART_DIRECTOR_IMAGE_DEPS,
  prepareArtDirectorSource,
  readClipboardImage,
  type ArtDirectorBitmap,
  type ArtDirectorImageDeps,
  type ArtDirectorImageErrorCode,
} from "./claude-art-director-image";

/** 파일 머리만 맞는 PNG 모양 바이트. 디코드는 가짜 의존성이 하므로 크기 필드만 정확하면 된다. */
function pngFile(width: number, height: number, padding = 0): Blob {
  const bytes = new Uint8Array(33 + padding);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: "image/png" });
}

interface FakeEnvironment {
  readonly deps: ArtDirectorImageDeps;
  readonly bitmap: ArtDirectorBitmap & { close: ReturnType<typeof vi.fn> };
  readonly encode: ReturnType<typeof vi.fn>;
  readonly revoked: string[];
}

function fakeEnvironment(
  size: { width: number; height: number },
  encoded: Array<Blob | null> = [new Blob([new Uint8Array(1_000)])],
): FakeEnvironment {
  const bitmap = { ...size, source: {}, close: vi.fn() };
  const queue = [...encoded];
  const encode = vi.fn(async () => (queue.length > 1 ? queue.shift() ?? null : queue[0] ?? null));
  const revoked: string[] = [];
  let urlCounter = 0;
  const deps: ArtDirectorImageDeps = {
    decode: vi.fn(async () => bitmap),
    encode,
    toBase64: vi.fn(async () => "QkFTRTY0"),
    createObjectUrl: vi.fn(() => `blob:preview-${++urlCounter}`),
    revokeObjectUrl: (url) => { revoked.push(url); },
  };
  return { deps, bitmap, encode, revoked };
}

async function codeOf(promise: Promise<unknown>): Promise<ArtDirectorImageErrorCode | "no-error"> {
  try {
    await promise;
    return "no-error";
  } catch (error) {
    if (error instanceof ArtDirectorImageError) return error.code;
    throw error;
  }
}

describe("아트 디렉터 이미지 검증", () => {
  it("빈 파일과 12MB 초과 파일은 디코드 전에 거절한다", async () => {
    const environment = fakeEnvironment({ width: 100, height: 100 });
    expect(await codeOf(prepareArtDirectorSource(new Blob([]), environment.deps))).toBe("unreadable");
    const huge = new Blob([new Uint8Array(ART_DIRECTOR_MAX_FILE_BYTES + 1)]);
    expect(await codeOf(prepareArtDirectorSource(huge, environment.deps))).toBe("too-large");
    expect(environment.deps.decode).not.toHaveBeenCalled();
  });

  it("확장자가 아니라 파일 서명으로 형식을 판독한다", async () => {
    const environment = fakeEnvironment({ width: 100, height: 100 });
    const gif = new Blob([new TextEncoder().encode("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000\u0000;")], { type: "image/png" });
    expect(await codeOf(prepareArtDirectorSource(gif, environment.deps))).toBe("invalid-type");
    const text = new Blob([new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")], { type: "image/png" });
    expect(await codeOf(prepareArtDirectorSource(text, environment.deps))).toBe("invalid-type");
    expect(environment.deps.decode).not.toHaveBeenCalled();
  });

  it("머리가 깨진 PNG는 읽을 수 없다고 알린다", async () => {
    const environment = fakeEnvironment({ width: 100, height: 100 });
    const corrupt = new Uint8Array(40);
    corrupt.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    expect(await codeOf(prepareArtDirectorSource(new Blob([corrupt]), environment.deps))).toBe("unreadable");
  });

  it("작은 파일이 거대한 비트맵으로 풀리는 픽셀 폭탄은 디코드 전에 막는다", async () => {
    const environment = fakeEnvironment({ width: 100, height: 100 });
    const side = Math.ceil(Math.sqrt(ART_DIRECTOR_MAX_PIXELS)) + 1;
    expect(await codeOf(prepareArtDirectorSource(pngFile(side, side), environment.deps))).toBe("too-many-pixels");
    expect(environment.deps.decode).not.toHaveBeenCalled();
  });

  it("머리 판독값과 디코드 결과가 어긋나도 같은 상한으로 다시 막고 비트맵을 해제한다", async () => {
    const side = Math.ceil(Math.sqrt(ART_DIRECTOR_MAX_PIXELS)) + 1;
    const environment = fakeEnvironment({ width: side, height: side });
    expect(await codeOf(prepareArtDirectorSource(pngFile(100, 100), environment.deps))).toBe("too-many-pixels");
    expect(environment.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("디코드가 실패하면 읽을 수 없다고 알린다", async () => {
    const environment = fakeEnvironment({ width: 100, height: 100 });
    vi.mocked(environment.deps.decode).mockRejectedValueOnce(new Error("decode failed"));
    expect(await codeOf(prepareArtDirectorSource(pngFile(100, 100), environment.deps))).toBe("unreadable");
  });
});

describe("아트 디렉터 이미지 준비", () => {
  it("한 장짜리 이미지는 구간 하나로 전체를 줄여 보낸다", async () => {
    const environment = fakeEnvironment({ width: 3_136, height: 1_568 });
    const source = await prepareArtDirectorSource(pngFile(3_136, 1_568), environment.deps);

    expect(source.segments).toEqual([{ index: 0, top: 0, height: 1_568 }]);
    const rendered = await source.render(0);

    expect(environment.encode).toHaveBeenCalledTimes(1);
    expect(environment.encode).toHaveBeenCalledWith(
      environment.bitmap,
      { top: 0, height: 1_568 },
      { width: 1_568, height: 784 },
      "image/png",
      undefined,
    );
    expect(rendered.input).toEqual({ mediaType: "image/png", data: "QkFTRTY0", width: 1_568, height: 784 });
    expect(rendered.previewUrl).toBe("blob:preview-1");
    expect(rendered.bytes).toBe(1_000);
  });

  it("세로로 긴 웹툰은 구간으로 나누고 선택한 구간만 잘라 보낸다", async () => {
    const environment = fakeEnvironment({ width: 1_000, height: 6_000 });
    const source = await prepareArtDirectorSource(pngFile(1_000, 6_000), environment.deps);

    expect(source.segments).toEqual(planArtDirectorSegments(1_000, 6_000));
    expect(source.segments.length).toBeGreaterThan(1);

    const second = source.segments[1];
    expect(second).toBeDefined();
    if (!second) return;
    const rendered = await source.render(1);

    expect(environment.encode).toHaveBeenCalledWith(
      environment.bitmap,
      { top: second.top, height: second.height },
      fitWithinEdge(1_000, second.height),
      "image/png",
      undefined,
    );
    expect(rendered.input.width).toBe(fitWithinEdge(1_000, second.height).width);
    expect(rendered.input.height).toBe(fitWithinEdge(1_000, second.height).height);
    expect(rendered.segment).toEqual(second);
  });

  it("PNG가 4MB를 넘으면 JPEG로 내려가고, 형식과 품질을 순서대로 시도한다", async () => {
    const tooBig = new Blob([new Uint8Array(ART_DIRECTOR_MAX_ENCODED_BYTES + 1)]);
    const small = new Blob([new Uint8Array(2_000)]);
    const environment = fakeEnvironment({ width: 800, height: 1_000 }, [tooBig, tooBig, small]);
    const source = await prepareArtDirectorSource(pngFile(800, 1_000), environment.deps);

    const rendered = await source.render(0);

    expect(environment.encode.mock.calls.map((call) => [call[3], call[4]])).toEqual([
      ["image/png", undefined],
      ["image/jpeg", 0.9],
      ["image/jpeg", 0.75],
    ]);
    expect(rendered.input.mediaType).toBe("image/jpeg");
    expect(rendered.bytes).toBe(2_000);
  });

  it("어떤 형식으로도 4MB 안에 들어가지 않으면 너무 크다고 알린다", async () => {
    const tooBig = new Blob([new Uint8Array(ART_DIRECTOR_MAX_ENCODED_BYTES + 1)]);
    const environment = fakeEnvironment({ width: 800, height: 1_000 }, [tooBig]);
    const source = await prepareArtDirectorSource(pngFile(800, 1_000), environment.deps);

    expect(await codeOf(source.render(0))).toBe("too-large");
    expect(environment.deps.createObjectUrl).not.toHaveBeenCalled();
  });

  it("브라우저가 형식을 만들 수 없으면(null) 다음 형식으로 넘어간다", async () => {
    const environment = fakeEnvironment({ width: 800, height: 1_000 }, [null, new Blob([new Uint8Array(500)])]);
    const source = await prepareArtDirectorSource(pngFile(800, 1_000), environment.deps);

    const rendered = await source.render(0);

    expect(rendered.input.mediaType).toBe("image/jpeg");
  });

  it("없는 구간을 요청하거나 해제한 뒤에 그리면 실패한다", async () => {
    const environment = fakeEnvironment({ width: 800, height: 1_000 });
    const source = await prepareArtDirectorSource(pngFile(800, 1_000), environment.deps);

    expect(await codeOf(source.render(5))).toBe("unreadable");
    source.dispose();
    expect(await codeOf(source.render(0))).toBe("unreadable");
  });

  it("미리보기 주소와 비트맵은 한 번만 해제한다", async () => {
    const environment = fakeEnvironment({ width: 800, height: 1_000 });
    const source = await prepareArtDirectorSource(pngFile(800, 1_000), environment.deps);
    const rendered = await source.render(0);

    rendered.dispose();
    rendered.dispose();
    source.dispose();
    source.dispose();

    expect(environment.revoked).toEqual(["blob:preview-1"]);
    expect(environment.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("그리는 도중 해제되면 결과를 남기지 않고 실패한다", async () => {
    const environment = fakeEnvironment({ width: 800, height: 1_000 });
    const source = await prepareArtDirectorSource(pngFile(800, 1_000), environment.deps);
    environment.encode.mockImplementationOnce(async () => {
      source.dispose();
      return new Blob([new Uint8Array(10)]);
    });

    expect(await codeOf(source.render(0))).toBe("unreadable");
    expect(environment.deps.createObjectUrl).not.toHaveBeenCalled();
  });
});

describe("브라우저 base64 인코딩", () => {
  it("32KB 조각 경계를 넘는 바이트도 그대로 base64가 된다", async () => {
    const bytes = new Uint8Array(0x8000 * 2 + 123);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31 + 7) % 256;

    const encoded = await BROWSER_ART_DIRECTOR_IMAGE_DEPS.toBase64(new Blob([bytes]));

    expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
  });
});

describe("클립보드 이미지 읽기", () => {
  function clipboardWith(items: Array<{ types: string[]; blob?: Blob }>): Pick<Clipboard, "read"> {
    return {
      read: async () => items.map((item) => ({
        types: item.types,
        presentationStyle: "unspecified" as const,
        getType: async (type: string) => {
          if (!item.types.includes(type) || !item.blob) throw new DOMException("no such type", "NotFoundError");
          return item.blob;
        },
      })) as unknown as ClipboardItems,
    };
  }

  it("지원하는 형식의 이미지를 파일로 돌려준다", async () => {
    const blob = new Blob([new Uint8Array(10)], { type: "image/png" });

    const result = await readClipboardImage(clipboardWith([{ types: ["text/plain"] }, { types: ["image/png"], blob }]));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.name).toBe("clipboard.png");
      expect(result.file.type).toBe("image/png");
      expect(result.file.size).toBe(10);
    }
  });

  it("이미지가 없으면 비었다고 알린다", async () => {
    expect(await readClipboardImage(clipboardWith([{ types: ["text/plain"] }]))).toEqual({ ok: false, reason: "empty" });
    expect(await readClipboardImage(clipboardWith([]))).toEqual({ ok: false, reason: "empty" });
  });

  it("GIF 같은 지원하지 않는 형식은 이미지로 치지 않는다", async () => {
    const gif = new Blob([new Uint8Array(4)], { type: "image/gif" });
    expect(await readClipboardImage(clipboardWith([{ types: ["image/gif"], blob: gif }]))).toEqual({ ok: false, reason: "empty" });
  });

  it("권한이 없거나 막히면 거절로, API가 없으면 지원하지 않음으로 알린다", async () => {
    const denied: Pick<Clipboard, "read"> = { read: async () => { throw new DOMException("denied", "NotAllowedError"); } };
    const missing: Pick<Clipboard, "read"> = { read: async () => { throw new DOMException("none", "DataError"); } };

    expect(await readClipboardImage(denied)).toEqual({ ok: false, reason: "denied" });
    expect(await readClipboardImage(missing)).toEqual({ ok: false, reason: "empty" });
    expect(await readClipboardImage(undefined)).toEqual({ ok: false, reason: "unsupported" });
    expect(await readClipboardImage({} as Pick<Clipboard, "read">)).toEqual({ ok: false, reason: "unsupported" });
  });
});
