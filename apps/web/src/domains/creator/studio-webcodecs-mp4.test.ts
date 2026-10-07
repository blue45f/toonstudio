import { describe, expect, it } from "vitest";

import { mp4MimeType, muxMp4, type Mp4SampleInput } from "./studio-webcodecs-mp4";

// ── 최소 박스 리더 (검증 전용) ────────────────────────────────────────

interface BoxInfo {
  type: string;
  start: number;
  size: number;
  bodyStart: number;
}

function readBoxes(bytes: Uint8Array, start: number, end: number): BoxInfo[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: BoxInfo[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    boxes.push({ type, start: offset, size, bodyStart: offset + 8 });
    offset += size;
  }
  return boxes;
}

function findChild(bytes: Uint8Array, parent: BoxInfo, type: string): BoxInfo {
  const found = readBoxes(bytes, parent.bodyStart, parent.start + parent.size).find((b) => b.type === type);
  if (!found) throw new Error(`box ${type} not found in ${parent.type}`);
  return found;
}

function u32At(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

const AVC_C = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 1, 0x67, 0x64, 0, 0x28, 1, 0, 1, 0x68]);

function sample(marker: number, timestampUs: number, durationUs: number, keyFrame: boolean): Mp4SampleInput {
  return { data: new Uint8Array([marker, marker, marker]), timestampUs, durationUs, keyFrame };
}

function threeSamples(): Mp4SampleInput[] {
  return [sample(1, 0, 100_000, true), sample(2, 100_000, 100_000, false), sample(3, 200_000, 100_000, false)];
}

describe("muxMp4 — 박스 구조", () => {
  it("ftyp → mdat → moov 순서이고 전체 크기가 박스 합과 같다", () => {
    const { bytes } = muxMp4({ width: 720, height: 960, codecPrivate: AVC_C, samples: threeSamples() });
    const top = readBoxes(bytes, 0, bytes.byteLength);
    expect(top.map((b) => b.type)).toEqual(["ftyp", "mdat", "moov"]);
    expect(top.reduce((sum, b) => sum + b.size, 0)).toBe(bytes.byteLength);
    const ftypBody = bytes.subarray(top[0]!.bodyStart, top[0]!.start + top[0]!.size);
    expect(String.fromCharCode(...ftypBody.subarray(0, 4))).toBe("isom");
  });

  it("stsz가 샘플 수·크기를 정확히 기록하고 stco가 첫 샘플을 가리킨다", () => {
    const samples = threeSamples();
    const { bytes } = muxMp4({ width: 720, height: 960, codecPrivate: AVC_C, samples });
    const top = readBoxes(bytes, 0, bytes.byteLength);
    const stbl = findChild(
      bytes,
      findChild(bytes, findChild(bytes, findChild(bytes, top[2]!, "trak"), "mdia"), "minf"),
      "stbl",
    );
    const stsz = findChild(bytes, stbl, "stsz");
    // fullbox(4) 뒤 sample_size(0=개별) · sample_count · 엔트리 순
    expect(u32At(bytes, stsz.bodyStart + 4)).toBe(0);
    expect(u32At(bytes, stsz.bodyStart + 8)).toBe(3);
    expect(u32At(bytes, stsz.bodyStart + 12)).toBe(3);
    expect(u32At(bytes, stsz.bodyStart + 16)).toBe(3);
    const stco = findChild(bytes, stbl, "stco");
    const chunkOffset = u32At(bytes, stco.bodyStart + 8);
    expect(bytes[chunkOffset]).toBe(1); // 첫 샘플의 마커 바이트
    expect(chunkOffset).toBe(top[0]!.size + 8); // ftyp + mdat 헤더
  });

  it("키프레임이 섞이면 stss가 키프레임 인덱스(1-base)를 기록하고, 전부 키프레임이면 생략한다", () => {
    const mixed = muxMp4({ width: 64, height: 64, codecPrivate: AVC_C, samples: threeSamples() });
    const topMixed = readBoxes(mixed.bytes, 0, mixed.bytes.byteLength);
    const stblMixed = findChild(
      mixed.bytes,
      findChild(mixed.bytes, findChild(mixed.bytes, findChild(mixed.bytes, topMixed[2]!, "trak"), "mdia"), "minf"),
      "stbl",
    );
    const stss = findChild(mixed.bytes, stblMixed, "stss");
    expect(u32At(mixed.bytes, stss.bodyStart + 4)).toBe(1);
    expect(u32At(mixed.bytes, stss.bodyStart + 8)).toBe(1);

    const allKey = muxMp4({
      width: 64,
      height: 64,
      codecPrivate: AVC_C,
      samples: [sample(1, 0, 100_000, true), sample(2, 100_000, 100_000, true)],
    });
    const topAll = readBoxes(allKey.bytes, 0, allKey.bytes.byteLength);
    const stblAll = findChild(
      allKey.bytes,
      findChild(allKey.bytes, findChild(allKey.bytes, findChild(allKey.bytes, topAll[2]!, "trak"), "mdia"), "minf"),
      "stbl",
    );
    const children = readBoxes(allKey.bytes, stblAll.bodyStart, stblAll.start + stblAll.size).map((b) => b.type);
    expect(children).not.toContain("stss");
    expect(children).toEqual(["stsd", "stts", "stsc", "stsz", "stco"]);
  });

  it("avcC 박스에 codecPrivate가 그대로 들어간다", () => {
    const { bytes } = muxMp4({ width: 64, height: 64, codecPrivate: AVC_C, samples: threeSamples() });
    const top = readBoxes(bytes, 0, bytes.byteLength);
    const stbl = findChild(
      bytes,
      findChild(bytes, findChild(bytes, findChild(bytes, top[2]!, "trak"), "mdia"), "minf"),
      "stbl",
    );
    const stsd = findChild(bytes, stbl, "stsd");
    // stsd 본문에서 "avcC" 타입 위치를 찾는다
    const typeBytes = [0x61, 0x76, 0x63, 0x43];
    let avcCBodyStart = -1;
    for (let i = stsd.bodyStart; i + 4 <= stsd.start + stsd.size; i += 1) {
      if (typeBytes.every((b, j) => bytes[i + j] === b)) {
        avcCBodyStart = i + 4;
        break;
      }
    }
    expect(avcCBodyStart).toBeGreaterThan(0);
    expect(bytes.subarray(avcCBodyStart, avcCBodyStart + AVC_C.byteLength)).toEqual(AVC_C);
  });

  it("stts 총합이 전체 길이와 같고 mvhd 길이는 ms 단위다", () => {
    const { bytes, durationUs } = muxMp4({ width: 64, height: 64, codecPrivate: AVC_C, samples: threeSamples() });
    expect(durationUs).toBe(300_000);
    const top = readBoxes(bytes, 0, bytes.byteLength);
    const mvhd = findChild(bytes, top[2]!, "mvhd");
    // fullbox(4) + created(4) + modified(4) 뒤 timescale, duration
    expect(u32At(bytes, mvhd.bodyStart + 12)).toBe(1000);
    expect(u32At(bytes, mvhd.bodyStart + 16)).toBe(300);
  });

  it("같은 입력이면 같은 바이트다 (결정적)", () => {
    const a = muxMp4({ width: 64, height: 64, codecPrivate: AVC_C, samples: threeSamples() });
    const b = muxMp4({ width: 64, height: 64, codecPrivate: AVC_C, samples: threeSamples() });
    expect(a.bytes).toEqual(b.bytes);
  });

  it("입력 순서가 섞여 있어도 타임스탬프 순으로 정렬된다", () => {
    const samples = threeSamples();
    const shuffled = [samples[2]!, samples[0]!, samples[1]!];
    const { bytes } = muxMp4({ width: 64, height: 64, codecPrivate: AVC_C, samples: shuffled });
    const top = readBoxes(bytes, 0, bytes.byteLength);
    const mdat = top[1]!;
    expect(bytes[mdat.bodyStart]).toBe(1); // 가장 이른 샘플이 먼저
  });

  it("샘플이 없거나 avcC가 없으면 던진다", () => {
    expect(() => muxMp4({ width: 64, height: 64, codecPrivate: AVC_C, samples: [] })).toThrow();
    expect(() =>
      muxMp4({ width: 64, height: 64, codecPrivate: new Uint8Array(0), samples: threeSamples() }),
    ).toThrow();
  });
});

describe("mp4MimeType", () => {
  it("코덱 문자열 유무로 표기가 갈린다", () => {
    expect(mp4MimeType()).toBe("video/mp4");
    expect(mp4MimeType("avc1.640028")).toBe('video/mp4; codecs="avc1.640028"');
  });
});
