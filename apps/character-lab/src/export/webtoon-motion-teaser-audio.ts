/** 모션 티저 PCM 데이터와 결정적 RIFF/WAVE 인코딩을 담당하는 순수 오디오 helper. */
export interface MotionTeaserAudioTrackPcm {
  readonly sampleRate: number;
  readonly durationMs: number;
  readonly eventCount: number;
  readonly ambientBgm: boolean;
  readonly samples: Float32Array;
}

/** RIFF/WAVE 컨테이너 매직 헤더 검증 */
export function isWavRiff(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 44 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

/**
 * 결정적 모노 `Float32Array` 오디오 트랙을 무손실 16-bit Little-Endian PCM `RIFF WAVE (.wav)` 바이너리로 인코딩한다.
 */
export function encodeMonoPcm16Wav(pcm: MotionTeaserAudioTrackPcm): Uint8Array {
  const numSamples = pcm.samples.length;
  const dataByteLen = numSamples * 2;
  const totalLen = 44 + dataByteLen;
  const buf = new ArrayBuffer(totalLen);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);

  const writeAscii = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i += 1) {
      out[offset + i] = str.charCodeAt(i);
    }
  };

  const sampleRate = Math.max(8_000, Math.min(48_000, Math.floor(pcm.sampleRate)));
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataByteLen, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataByteLen, true);

  let bytePos = 44;
  for (let i = 0; i < numSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, pcm.samples[i] ?? 0));
    const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    view.setInt16(bytePos, int16, true);
    bytePos += 2;
  }
  return out;
}
