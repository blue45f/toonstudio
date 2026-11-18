import { describe, expect, it } from "vitest";

import {
  muxAnimatedWebpFrames,
  parseAnimatedWebpSummary,
} from "./studio-webp-anim-muxer";

function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

function u24le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
}

function makeChunkBytes(fourCC: string, payload: number[]): number[] {
  const cc = [...fourCC].map((c) => c.charCodeAt(0));
  const pad = payload.length % 2 === 1 ? [0] : [];
  return [...cc, ...u32le(payload.length), ...payload, ...pad];
}

/** VP8L 무손실 단일 프레임 WebP 합성 헬퍼 (홀수 바이트 페이로드 패딩 검증 포함). */
function makeSyntheticVp8lWebp(
  width: number,
  height: number,
  alphaIsUsed: boolean,
  extraOddByte = false,
): Uint8Array {
  const packed =
    ((width - 1) & 0x3fff) |
    (((height - 1) & 0x3fff) << 14) |
    ((alphaIsUsed ? 1 : 0) << 28);
  // 5바이트 헤더(이미 홀수!) + extraOddByte=false면 그대로 5바이트 홀수 길이 테스트
  const vp8lPayload = [0x2f, ...u32le(packed), ...(extraOddByte ? [0xaa, 0xbb] : [])];
  const chunk = makeChunkBytes("VP8L", vp8lPayload);
  const riffSize = 4 + chunk.length;
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46,
    ...u32le(riffSize),
    0x57, 0x45, 0x42, 0x50,
    ...chunk,
  ]);
}

/** VP8X + ALPH(홀수 길이) + VP8 (손실 키프레임) 단일 프레임 WebP 합성 헬퍼. */
function makeSyntheticVp8WithAlphWebp(width: number, height: number): Uint8Array {
  const vp8x = makeChunkBytes("VP8X", [0x10, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)]);
  // 홀수 3바이트 ALPH 데이터
  const alph = makeChunkBytes("ALPH", [0x00, 0xff, 0x80]);
  // VP8 키프레임 헤더 (11바이트 홀수 길이)
  const vp8Payload = [
    0x10, 0x00, 0x00,
    0x9d, 0x01, 0x2a,
    width & 0xff, (width >>> 8) & 0x3f,
    height & 0xff, (height >>> 8) & 0x3f,
    0x77,
  ];
  const vp8 = makeChunkBytes("VP8 ", vp8Payload);
  const body = [...vp8x, ...alph, ...vp8];
  return Uint8Array.from([
    0x52, 0x49, 0x46, 0x46,
    ...u32le(4 + body.length),
    0x57, 0x45, 0x42, 0x50,
    ...body,
  ]);
}

describe("studio-webp-anim-muxer — RIFF/WEBP 애니메이션 컨테이너 조립 및 검증", () => {
  it("VP8X, ANIM(BGRA + 루프), ANMF 서브청크(ALPH + VP8/VP8L, 홀수 바이트 RIFF 패딩)를 정확히 조립한다", () => {
    const f1 = makeSyntheticVp8WithAlphWebp(320, 240);
    const f2 = makeSyntheticVp8lWebp(160, 120, false);

    const muxed = muxAnimatedWebpFrames(
      [
        {
          webpBytes: f1,
          durationMs: 83,
          x: 0,
          y: 0,
          blend: "do-not-blend",
          dispose: "background",
        },
        {
          webpBytes: f2,
          durationMs: 125,
          x: 40,
          y: 20,
          blend: "alpha-blend",
          dispose: "none",
        },
      ],
      {
        canvasWidth: 320,
        canvasHeight: 240,
        loopCount: 3,
        backgroundBgra: [10, 20, 30, 255],
      },
    );

    // 전체 RIFF 컨테이너는 항상 짝수 바이트 길이를 만족한다.
    expect(muxed.byteLength % 2).toBe(0);

    const summary = parseAnimatedWebpSummary(muxed);
    expect(summary.canvasWidth).toBe(320);
    expect(summary.canvasHeight).toBe(240);
    expect(summary.hasAnimationFlag).toBe(true);
    expect(summary.hasAlphaFlag).toBe(true);
    expect(summary.backgroundBgra).toEqual([10, 20, 30, 255]);
    expect(summary.loopCount).toBe(3);
    expect(summary.frameCount).toBe(2);
    expect(summary.totalDurationMs).toBe(208);

    expect(summary.frames[0]).toEqual({
      index: 0,
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      durationMs: 83,
      blend: "do-not-blend",
      dispose: "background",
      hasAlphChunk: true,
      bitstreamFourCC: "VP8 ",
      bitstreamByteLength: 11,
    });
    expect(summary.frames[1]).toEqual({
      index: 1,
      x: 40,
      y: 20,
      width: 160,
      height: 120,
      durationMs: 125,
      blend: "alpha-blend",
      dispose: "none",
      hasAlphChunk: false,
      bitstreamFourCC: "VP8L",
      bitstreamByteLength: 5,
    });
  });

  it("홀수 픽셀 오프셋, 빈 프레임 배열, 캔버스 범위 초과 입력을 거부한다", () => {
    const sample = makeSyntheticVp8lWebp(64, 64, false);
    expect(() => muxAnimatedWebpFrames([])).toThrow("최소 1개");
    expect(() => muxAnimatedWebpFrames([{ webpBytes: sample, durationMs: 100, x: 3 }])).toThrow(
      "짝수",
    );
    expect(() =>
      muxAnimatedWebpFrames([{ webpBytes: sample, durationMs: 100 }], {
        canvasWidth: 32,
        canvasHeight: 32,
      }),
    ).toThrow("작습니다");
  });
});
