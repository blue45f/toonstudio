/**
 * 프로젝트 아카이브 첨부 바이트의 MIME 판정 (studio-project-archive에서 분리).
 * 선언된 값이 아니라 실제 바이트 서명으로만 래스터·오디오 형식을 판정한다.
 */

export function normalizeMimeType(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().split(";", 1)[0] ?? "";
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

export function rasterMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (bytes.length >= 3 && hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytes.length >= 6) {
    const signature = String.fromCharCode(...bytes.slice(0, 6));
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function audioMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE"
  ) return "audio/wav";
  if (bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "OggS") return "audio/ogg";
  if (bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "fLaC") return "audio/flac";
  if (bytes.length >= 3 && String.fromCharCode(...bytes.slice(0, 3)) === "ID3") return "audio/mpeg";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return "audio/aac";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") return "audio/mp4";
  if (bytes.length >= 4 && hasBytes(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  return null;
}
