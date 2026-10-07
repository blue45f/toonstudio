/**
 * Studio WebCodecs — 순수 TypeScript MP4(ISO BMFF) muxer.
 *
 * WebCodecs VideoEncoder가 뱉은 H.264(avc) 청크를 재생 가능한 단일 파일 MP4로
 * 조립한다. studio-webcodecs-webm과 같은 원칙을 따른다:
 *  · 외부 의존성 없음 — 박스 구조를 직접 쓴다.
 *  · 결정적 — 생성/수정 시각을 0으로 고정해 같은 입력이면 같은 바이트가 나온다.
 *  · 단일 비디오 트랙, 단일 청크(mdat 하나), moov는 mdat 뒤(프로그레시브).
 *
 * 전제: 청크는 AVCC 길이 접두 포맷이어야 하고(VideoEncoderConfig의
 * avc.format="avc"), codecPrivate는 인코더가 준 AVCDecoderConfigurationRecord
 * (decoderConfig.description) 원본 바이트다. Annex B 청크는 받지 않는다.
 */

/** muxer에 넣는 인코딩 완료 샘플 1개. */
export interface Mp4SampleInput {
  readonly data: Uint8Array;
  /** 표시 시작 시각(µs). 단조 증가해야 한다. */
  readonly timestampUs: number;
  /** 표시 길이(µs). 0이면 앞 샘플 간격으로 추정한다. */
  readonly durationUs: number;
  readonly keyFrame: boolean;
}

export interface MuxMp4Request {
  readonly width: number;
  readonly height: number;
  /** AVCDecoderConfigurationRecord 원본 바이트. */
  readonly codecPrivate: Uint8Array;
  readonly samples: readonly Mp4SampleInput[];
  /** 미디어 타임스케일(초당 틱). 기본 1_000_000 — µs 타임스탬프를 정확히 담는다. */
  readonly timescale?: number;
}

export interface MuxMp4Result {
  readonly bytes: Uint8Array;
  readonly sampleCount: number;
  readonly durationUs: number;
}

const DEFAULT_TIMESCALE = 1_000_000;
const MOVIE_TIMESCALE = 1000;

// ── 바이트 빌더 ───────────────────────────────────────────────────────

class ByteBuilder {
  private parts: Uint8Array[] = [];
  private length = 0;

  push(bytes: Uint8Array): this {
    this.parts.push(bytes);
    this.length += bytes.byteLength;
    return this;
  }

  u8(value: number): this {
    return this.push(new Uint8Array([value & 0xff]));
  }

  u16(value: number): this {
    const buffer = new Uint8Array(2);
    new DataView(buffer.buffer).setUint16(0, value & 0xffff);
    return this.push(buffer);
  }

  u32(value: number): this {
    const buffer = new Uint8Array(4);
    new DataView(buffer.buffer).setUint32(0, value >>> 0);
    return this.push(buffer);
  }

  fixed16(value: number): this {
    // 16.16 고정소수점
    return this.u32(Math.round(value * 65_536) >>> 0);
  }

  ascii(text: string): this {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0x7f;
    return this.push(bytes);
  }

  zeros(count: number): this {
    return this.push(new Uint8Array(count));
  }

  get byteLength(): number {
    return this.length;
  }

  build(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.byteLength;
    }
    return out;
  }
}

function box(type: string, body: ByteBuilder): ByteBuilder {
  const out = new ByteBuilder();
  out.u32(body.byteLength + 8);
  out.ascii(type);
  out.push(body.build());
  return out;
}

function fullBox(type: string, version: number, flags: number, body: ByteBuilder): ByteBuilder {
  const inner = new ByteBuilder();
  inner.u8(version);
  inner.u8((flags >> 16) & 0xff).u8((flags >> 8) & 0xff).u8(flags & 0xff);
  inner.push(body.build());
  return box(type, inner);
}

// ── 샘플 테이블 계산 ──────────────────────────────────────────────────

interface SampleTiming {
  /** 미디어 타임스케일 단위 표시 길이. */
  readonly deltaTicks: number;
  readonly durationUs: number;
}

function computeSampleTimings(samples: readonly Mp4SampleInput[], timescale: number): SampleTiming[] {
  const timings: SampleTiming[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]!;
    let durationUs = sample.durationUs;
    if (!(durationUs > 0)) {
      const next = samples[i + 1];
      if (next) durationUs = next.timestampUs - sample.timestampUs;
      else if (i > 0) durationUs = timings[i - 1]!.durationUs;
      else durationUs = Math.round(1_000_000 / 30);
    }
    if (!(durationUs > 0)) durationUs = 1;
    timings.push({
      durationUs,
      deltaTicks: Math.max(1, Math.round((durationUs * timescale) / 1_000_000)),
    });
  }
  return timings;
}

function buildSttsBody(timings: readonly SampleTiming[]): ByteBuilder {
  const runs: { count: number; delta: number }[] = [];
  for (const timing of timings) {
    const last = runs[runs.length - 1];
    if (last && last.delta === timing.deltaTicks) last.count += 1;
    else runs.push({ count: 1, delta: timing.deltaTicks });
  }
  const body = new ByteBuilder();
  body.u32(runs.length);
  for (const run of runs) {
    body.u32(run.count);
    body.u32(run.delta);
  }
  return body;
}

// ── 트랙 박스들 ───────────────────────────────────────────────────────

const IDENTITY_MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000] as const;

function writeMatrix(body: ByteBuilder): void {
  for (const value of IDENTITY_MATRIX) body.u32(value);
}

function buildMvhd(durationMs: number): ByteBuilder {
  const body = new ByteBuilder();
  body.u32(0); // creation_time — 결정성 위해 0
  body.u32(0); // modification_time
  body.u32(MOVIE_TIMESCALE);
  body.u32(durationMs);
  body.u32(0x00010000); // rate 1.0
  body.u16(0x0100); // volume 1.0
  body.u16(0); // reserved
  body.zeros(8); // reserved
  writeMatrix(body);
  body.zeros(24); // pre_defined
  body.u32(2); // next_track_ID
  return fullBox("mvhd", 0, 0, body);
}

function buildTkhd(width: number, height: number, durationMs: number): ByteBuilder {
  const body = new ByteBuilder();
  body.u32(0); // creation_time
  body.u32(0); // modification_time
  body.u32(1); // track_ID
  body.u32(0); // reserved
  body.u32(durationMs);
  body.zeros(8); // reserved
  body.u16(0); // layer
  body.u16(0); // alternate_group
  body.u16(0); // volume (비디오는 0)
  body.u16(0); // reserved
  writeMatrix(body);
  body.fixed16(width);
  body.fixed16(height);
  // flags 0x7 = enabled | in_movie | in_preview
  return fullBox("tkhd", 0, 0x7, body);
}

function buildMdhd(timescale: number, durationTicks: number): ByteBuilder {
  const body = new ByteBuilder();
  body.u32(0); // creation_time
  body.u32(0); // modification_time
  body.u32(timescale);
  body.u32(durationTicks);
  body.u16(0x55c4); // language 'und'
  body.u16(0); // pre_defined
  return fullBox("mdhd", 0, 0, body);
}

function buildHdlr(): ByteBuilder {
  const body = new ByteBuilder();
  body.u32(0); // pre_defined
  body.ascii("vide");
  body.zeros(12); // reserved
  body.ascii("VideoHandler");
  body.u8(0);
  return fullBox("hdlr", 0, 0, body);
}

function buildVmhd(): ByteBuilder {
  const body = new ByteBuilder();
  body.u16(0); // graphicsmode
  body.u16(0).u16(0).u16(0); // opcolor
  return fullBox("vmhd", 0, 1, body);
}

function buildDinf(): ByteBuilder {
  const url = fullBox("url ", 0, 1, new ByteBuilder());
  const drefBody = new ByteBuilder();
  drefBody.u32(1); // entry_count
  drefBody.push(url.build());
  const dref = fullBox("dref", 0, 0, drefBody);
  const body = new ByteBuilder();
  body.push(dref.build());
  return box("dinf", body);
}

function buildAvc1Entry(width: number, height: number, codecPrivate: Uint8Array): ByteBuilder {
  const avcC = box("avcC", new ByteBuilder().push(codecPrivate));
  const body = new ByteBuilder();
  body.zeros(6); // reserved
  body.u16(1); // data_reference_index
  body.zeros(16); // pre_defined + reserved
  body.u16(width);
  body.u16(height);
  body.u32(0x00480000); // horizresolution 72dpi
  body.u32(0x00480000); // vertresolution 72dpi
  body.u32(0); // reserved
  body.u16(1); // frame_count
  body.u8(0); // compressorname length (빈 이름)
  body.zeros(31);
  body.u16(0x0018); // depth
  body.u16(0xffff); // pre_defined
  body.push(avcC.build());

  const entry = new ByteBuilder();
  entry.u32(body.byteLength + 8);
  entry.ascii("avc1");
  entry.push(body.build());
  return entry;
}

function buildStbl(
  width: number,
  height: number,
  codecPrivate: Uint8Array,
  samples: readonly Mp4SampleInput[],
  timings: readonly SampleTiming[],
  chunkOffset: number,
): ByteBuilder {
  const stsdBody = new ByteBuilder();
  stsdBody.u32(1); // entry_count
  stsdBody.push(buildAvc1Entry(width, height, codecPrivate).build());
  const stsd = fullBox("stsd", 0, 0, stsdBody);

  const stts = fullBox("stts", 0, 0, buildSttsBody(timings));

  const stscBody = new ByteBuilder();
  stscBody.u32(1); // entry_count
  stscBody.u32(1); // first_chunk
  stscBody.u32(samples.length); // samples_per_chunk — 전체를 청크 하나에
  stscBody.u32(1); // sample_description_index
  const stsc = fullBox("stsc", 0, 0, stscBody);

  const stszBody = new ByteBuilder();
  stszBody.u32(0); // sample_size (0 = 샘플마다 다름)
  stszBody.u32(samples.length);
  for (const sample of samples) stszBody.u32(sample.data.byteLength);
  const stsz = fullBox("stsz", 0, 0, stszBody);

  const stcoBody = new ByteBuilder();
  stcoBody.u32(1); // entry_count
  stcoBody.u32(chunkOffset);
  const stco = fullBox("stco", 0, 0, stcoBody);

  const body = new ByteBuilder();
  body.push(stsd.build());
  body.push(stts.build());
  // 키프레임이 아닌 샘플이 있을 때만 stss를 쓴다(전부 키프레임이면 생략이 규격).
  if (samples.some((sample) => !sample.keyFrame)) {
    const stssBody = new ByteBuilder();
    const keyIndices = samples
      .map((sample, index) => (sample.keyFrame ? index + 1 : 0))
      .filter((index) => index > 0);
    stssBody.u32(keyIndices.length);
    for (const index of keyIndices) stssBody.u32(index);
    body.push(fullBox("stss", 0, 0, stssBody).build());
  }
  body.push(stsc.build());
  body.push(stsz.build());
  body.push(stco.build());
  return box("stbl", body);
}

// ── 본체 ──────────────────────────────────────────────────────────────

/** ftyp — isom 브랜드, avc1 호환 선언. */
function buildFtyp(): ByteBuilder {
  const body = new ByteBuilder();
  body.ascii("isom");
  body.u32(0x200);
  body.ascii("isom").ascii("iso2").ascii("avc1").ascii("mp41");
  return box("ftyp", body);
}

/**
 * H.264 샘플들을 MP4 파일 바이트로 조립한다.
 * 샘플은 timestampUs 오름차순으로 정렬해 넣는다(입력 순서 비의존).
 */
export function muxMp4(request: MuxMp4Request): MuxMp4Result {
  const timescale =
    request.timescale && request.timescale > 0 ? Math.floor(request.timescale) : DEFAULT_TIMESCALE;
  const samples = [...request.samples].sort((a, b) => a.timestampUs - b.timestampUs);
  if (samples.length === 0) throw new Error("MP4로 만들 샘플이 없어요.");
  if (request.codecPrivate.byteLength === 0) throw new Error("MP4에 필요한 avcC 코덱 정보가 없어요.");
  if (!(request.width > 0) || !(request.height > 0)) throw new Error("MP4 프레임 크기가 올바르지 않아요.");

  const timings = computeSampleTimings(samples, timescale);
  const durationUs = timings.reduce((sum, timing) => sum + timing.durationUs, 0);
  const durationTicks = timings.reduce((sum, timing) => sum + timing.deltaTicks, 0);
  const durationMs = Math.round(durationUs / 1000);

  const ftyp = buildFtyp();
  const chunkOffset = ftyp.byteLength + 8; // ftyp + mdat 헤더

  const stbl = buildStbl(request.width, request.height, request.codecPrivate, samples, timings, chunkOffset);
  const minfBody = new ByteBuilder();
  minfBody.push(buildVmhd().build());
  minfBody.push(buildDinf().build());
  minfBody.push(stbl.build());
  const minf = box("minf", minfBody);

  const mdiaBody = new ByteBuilder();
  mdiaBody.push(buildMdhd(timescale, durationTicks).build());
  mdiaBody.push(buildHdlr().build());
  mdiaBody.push(minf.build());
  const mdia = box("mdia", mdiaBody);

  const trakBody = new ByteBuilder();
  trakBody.push(buildTkhd(request.width, request.height, durationMs).build());
  trakBody.push(mdia.build());
  const trak = box("trak", trakBody);

  const moovBody = new ByteBuilder();
  moovBody.push(buildMvhd(durationMs).build());
  moovBody.push(trak.build());
  const moov = box("moov", moovBody);

  const mdatBody = new ByteBuilder();
  for (const sample of samples) mdatBody.push(sample.data);
  const mdat = box("mdat", mdatBody);

  const file = new ByteBuilder();
  file.push(ftyp.build());
  file.push(mdat.build());
  file.push(moov.build());

  return { bytes: file.build(), sampleCount: samples.length, durationUs };
}

/** 결과 MIME — 코덱 문자열이 있으면 함께 표기한다. */
export function mp4MimeType(codecString?: string): string {
  return codecString ? `video/mp4; codecs="${codecString}"` : "video/mp4";
}
