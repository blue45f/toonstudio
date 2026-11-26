import { zlibSync } from "fflate";

import { calculateStudioCrc32 } from "../studio-crc32";

import { isValidPublishRaster } from "./publish-raster-validation";

function pngChunk(type: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(payload.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, payload.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(payload, 8);
  view.setUint32(bytes.length - 4, calculateStudioCrc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}

/** 원고의 실제 크기와 RGBA 샘플을 PNG 컨테이너로 인코딩한다. */
export function encodePublishRasterPng(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  if (!isValidPublishRaster(rgba, width, height)) {
    throw new RangeError("출판 원고의 픽셀 크기 또는 RGBA 데이터가 올바르지 않습니다.");
  }
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4;
  const rows = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) rows.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const chunks = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("IDAT", zlibSync(rows)), pngChunk("IEND", new Uint8Array()),
  ];
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
