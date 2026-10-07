import { describe, expect, it } from "vitest";

import { planConstantRateTimeline } from "../studio-webcodecs-timeline";
import { isWebCodecsExportCancelled, type WebCodecsVideoExportDeps } from "./studio-webcodecs-video-export";
import {
  buildAvc1VideoEncoderConfig,
  evenDimension,
  probeAvc1EncoderConfig,
  recommendAvc1Bitrate,
  startWebCodecsMp4Export,
  type Avc1VideoEncoderConfig,
} from "./studio-webcodecs-mp4-export";

const AVC_C = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 1, 0x67, 0x64, 0, 0x28, 1, 0, 1, 0x68]);

interface FakeEncoderOptions {
  /** false면 output 메타데이터에 avcC를 싣지 않는다. */
  withAvcC?: boolean;
}

function createFakeDeps(options: FakeEncoderOptions = {}): {
  deps: WebCodecsVideoExportDeps;
  encodedIndices: number[];
} {
  const encodedIndices: number[] = [];
  const deps: WebCodecsVideoExportDeps = {
    createEncoder: (handlers) => {
      let first = true;
      return {
        encodeQueueSize: 0,
        configure: () => {},
        encode: (_frame, encodeOptions) => {
          const key = encodeOptions?.keyFrame === true;
          const data = new Uint8Array([key ? 0x65 : 0x41, 0x9a]);
          handlers.output(
            {
              type: key ? "key" : "delta",
              timestamp: encodedIndices.length * 100_000,
              duration: 100_000,
              byteLength: data.byteLength,
              copyTo: (dest) => {
                if (dest instanceof Uint8Array) dest.set(data);
                else if (ArrayBuffer.isView(dest)) new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength).set(data);
                else new Uint8Array(dest as ArrayBuffer).set(data);
              },
            },
            first && options.withAvcC !== false
              ? { decoderConfig: { description: AVC_C } }
              : undefined,
          );
          first = false;
        },
        flush: async () => {},
        close: () => {},
      };
    },
    createFrame: (spec) => {
      encodedIndices.push(spec.index);
      return { close: () => {} };
    },
    yieldToUi: async () => {},
  };
  return { deps, encodedIndices };
}

function avcConfig(): Avc1VideoEncoderConfig {
  return buildAvc1VideoEncoderConfig({ width: 64, height: 64, fps: 10, codecString: "avc1.640028" });
}

describe("buildAvc1VideoEncoderConfig", () => {
  it("avc.format='avc'를 달고 크기를 짝수로 내린다", () => {
    const config = buildAvc1VideoEncoderConfig({ width: 721, height: 961, fps: 24, codecString: "avc1.640033" });
    expect(config.avc).toEqual({ format: "avc" });
    expect(config.width).toBe(720);
    expect(config.height).toBe(960);
    expect(config.codec).toBe("avc1.640033");
    expect(config.framerate).toBe(24);
  });

  it("evenDimension은 최소 2를 보장한다", () => {
    expect(evenDimension(2)).toBe(2);
    expect(evenDimension(3)).toBe(2);
    expect(evenDimension(101)).toBe(100);
    expect(evenDimension(0)).toBe(2);
  });

  it("recommendAvc1Bitrate는 클램프 범위 안이다", () => {
    expect(recommendAvc1Bitrate(64, 64, 10)).toBe(2_500_000);
    expect(recommendAvc1Bitrate(3840, 2160, 60)).toBe(16_000_000);
    const mid = recommendAvc1Bitrate(720, 960, 24);
    expect(mid).toBeGreaterThan(2_500_000);
    expect(mid).toBeLessThan(16_000_000);
  });
});

describe("probeAvc1EncoderConfig", () => {
  it("지원되는 후보를 찾아 설정을 돌려준다", async () => {
    const probe = {
      isConfigSupported: async (config: VideoEncoderConfig) => ({
        supported: config.codec === "avc1.640028",
      }),
    };
    const result = await probeAvc1EncoderConfig({ width: 64, height: 64, fps: 10 }, probe);
    expect(result?.codecString).toBe("avc1.640028");
    expect(result?.config.avc.format).toBe("avc");
  });

  it("전부 미지원이면 null이다", async () => {
    const probe = { isConfigSupported: async () => ({ supported: false }) };
    expect(await probeAvc1EncoderConfig({ width: 64, height: 64, fps: 10 }, probe)).toBeNull();
  });

  it("probe가 throw해도 미지원으로 취급한다", async () => {
    const probe = {
      isConfigSupported: async (): Promise<{ supported?: boolean }> => {
        throw new Error("bad codec string");
      },
    };
    expect(await probeAvc1EncoderConfig({ width: 64, height: 64, fps: 10 }, probe)).toBeNull();
  });
});

describe("startWebCodecsMp4Export", () => {
  it("가짜 인코더 청크를 MP4 바이트로 조립한다", async () => {
    const { deps, encodedIndices } = createFakeDeps();
    const timeline = planConstantRateTimeline({ frameCount: 3, fps: 10 });
    const handle = startWebCodecsMp4Export({ timeline, config: avcConfig(), deps });
    const result = await handle.done;
    expect(encodedIndices).toEqual([0, 1, 2]);
    expect(result.frameCount).toBe(3);
    expect(result.keyFrameCount).toBe(1);
    expect(result.mimeType).toContain("video/mp4");
    // ftyp 박스로 시작한다
    expect(String.fromCharCode(...result.bytes.subarray(4, 8))).toBe("ftyp");
  });

  it("avcC가 오지 않으면 MP4를 만들 수 없다고 실패한다", async () => {
    const { deps } = createFakeDeps({ withAvcC: false });
    const timeline = planConstantRateTimeline({ frameCount: 2, fps: 10 });
    const handle = startWebCodecsMp4Export({ timeline, config: avcConfig(), deps });
    await expect(handle.done).rejects.toThrow(/avcC/);
  });

  it("취소하면 WebCodecsExportCancelledError로 reject된다", async () => {
    const { deps } = createFakeDeps();
    const timeline = planConstantRateTimeline({ frameCount: 5, fps: 10 });
    const handle = startWebCodecsMp4Export({ timeline, config: avcConfig(), deps });
    handle.cancel();
    const error: unknown = await handle.done.catch((caught: unknown) => caught);
    expect(isWebCodecsExportCancelled(error)).toBe(true);
  });
});
