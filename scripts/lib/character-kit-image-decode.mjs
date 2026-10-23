/**
 * 캐릭터 키트 검증기 — 이미지 해독(PNG/JPEG 헤더 + 평균 휘도). `scripts/verify-character-kit.mjs`에서 옮겼다(2026-10-23, 파일 크기 래칫 헤드룸 확보).
 *
 * 평균 휘도: 0..1로 정규화한 sRGB 인코딩 값의 휘도. PNG는 0.2126 R + 0.7152 G + 0.0722 B를 알파 가중 평균하고,
 * JPEG는 Y 성분 8×8 블록 DC 계수의 평균(블록 평균, 가장자리 패딩 블록 포함)이다. 프로그레시브 JPEG·인터레이스 PNG는 측정하지 않는다.
 * 동작은 옮기기 전과 같다(`scripts/verify-character-kit.test.mjs`의 PNG/JPEG 시험이 그대로 지킨다).
 */
import { inflateSync } from "node:zlib";

// ---------------------------------------------------------------- 이미지 해독(PNG/JPEG 헤더 + 평균 휘도)

function isPng(bytes) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function isJpeg(bytes) {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodePng(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (position + 8 <= bytes.length) {
    const length = view.getUint32(position);
    const type = String.fromCharCode(bytes[position + 4], bytes[position + 5], bytes[position + 6], bytes[position + 7]);
    const data = bytes.subarray(position + 8, position + 8 + length);
    if (type === "IHDR" && data.length >= 13) {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      header = { width: dv.getUint32(0), height: dv.getUint32(4), depth: data[8], colorType: data[9], interlace: data[12] };
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") idat.push(data);
    position += 12 + length;
    if (type === "IEND") break;
  }
  if (header === null) return { format: "png", width: 0, height: 0, hasAlpha: false, meanLuminance: null, note: "PNG IHDR 청크를 읽지 못했습니다." };
  const { width, height, depth, colorType, interlace } = header;
  const hasAlpha = colorType === 4 || colorType === 6 || transparency !== null;
  const info = { format: "png", width, height, hasAlpha, meanLuminance: null, note: null, colorType, bitDepth: depth };
  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByType[colorType];
  const depthOk = colorType === 3 || colorType === 0 ? [1, 2, 4, 8, 16].includes(depth) : depth === 8 || depth === 16;
  if (channels === undefined || !depthOk) return { ...info, note: `지원하지 않는 PNG 색 유형/비트 깊이(${colorType}/${depth})라 휘도를 측정하지 않았습니다.` };
  if (interlace !== 0) return { ...info, note: "인터레이스 PNG라 휘도를 측정하지 않았습니다." };
  if (colorType === 3 && palette === null) return { ...info, note: "팔레트 PNG에 PLTE가 없습니다." };

  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch (error) {
    return { ...info, note: `PNG 데이터를 풀지 못했습니다: ${error instanceof Error ? error.message : String(error)}` };
  }
  const bitsPerPixel = channels * depth;
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);
  const bytesPerPixel = Math.max(1, bitsPerPixel >> 3);
  if (raw.length < (rowBytes + 1) * height) return { ...info, note: "PNG 데이터 길이가 부족합니다." };
  const pixels = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (rowBytes + 1)];
    const source = y * (rowBytes + 1) + 1;
    const target = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bytesPerPixel ? pixels[target + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[target - rowBytes + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[target - rowBytes + x - bytesPerPixel] : 0;
      let value = raw[source + x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paethPredictor(left, up, upLeft);
      else if (filter !== 0) return { ...info, note: `알 수 없는 PNG 필터 유형 ${filter}` };
      pixels[target + x] = value & 255;
    }
  }
  const max = 2 ** depth - 1;
  const sample = (rowStart, index) => {
    if (depth === 8) return pixels[rowStart + index];
    if (depth === 16) return (pixels[rowStart + 2 * index] << 8) | pixels[rowStart + 2 * index + 1];
    const bit = index * depth;
    const byte = pixels[rowStart + (bit >> 3)];
    return (byte >> (8 - depth - (bit & 7))) & max;
  };
  let weighted = 0;
  let weight = 0;
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowBytes;
    for (let x = 0; x < width; x += 1) {
      let r;
      let g;
      let b;
      let a = 1;
      if (colorType === 3) {
        const entry = sample(rowStart, x);
        r = (palette[entry * 3] ?? 0) / 255;
        g = (palette[entry * 3 + 1] ?? 0) / 255;
        b = (palette[entry * 3 + 2] ?? 0) / 255;
        if (transparency !== null) a = (transparency[entry] ?? 255) / 255;
      } else if (colorType === 0 || colorType === 4) {
        r = sample(rowStart, x * channels) / max;
        g = r;
        b = r;
        if (colorType === 4) a = sample(rowStart, x * channels + 1) / max;
      } else {
        r = sample(rowStart, x * channels) / max;
        g = sample(rowStart, x * channels + 1) / max;
        b = sample(rowStart, x * channels + 2) / max;
        if (colorType === 6) a = sample(rowStart, x * channels + 3) / max;
      }
      weighted += (0.2126 * r + 0.7152 * g + 0.0722 * b) * a;
      weight += a;
    }
  }
  if (weight === 0) return { ...info, note: "모든 픽셀이 투명해 휘도를 측정할 수 없습니다." };
  return { ...info, meanLuminance: weighted / weight };
}

function createBitReader(data, start) {
  let position = start;
  let current = 0;
  let remaining = 0;
  return {
    get position() {
      return position;
    },
    readBit() {
      if (remaining === 0) {
        if (position >= data.length) throw new Error("JPEG 데이터가 중간에 끝났습니다.");
        let byte = data[position];
        position += 1;
        if (byte === 0xff) {
          const next = data[position];
          if (next === 0x00) position += 1;
          else throw new Error("JPEG 엔트로피 데이터 안에서 예상치 못한 마커를 만났습니다.");
          byte = 0xff;
        }
        current = byte;
        remaining = 8;
      }
      remaining -= 1;
      return (current >> remaining) & 1;
    },
    receive(count) {
      let value = 0;
      for (let i = 0; i < count; i += 1) value = (value << 1) | this.readBit();
      return value;
    },
    /** 다음 RSTn 마커까지 건너뛰고 비트 버퍼를 비운다. */
    restart() {
      remaining = 0;
      while (position + 1 < data.length && !(data[position] === 0xff && data[position + 1] >= 0xd0 && data[position + 1] <= 0xd7)) position += 1;
      position += 2;
    },
  };
}

function buildHuffmanTable(counts, symbols) {
  const maxcode = new Int32Array(17).fill(-1);
  const valptr = new Int32Array(17);
  const mincode = new Int32Array(17);
  let code = 0;
  let k = 0;
  for (let length = 1; length <= 16; length += 1) {
    const count = counts[length - 1] ?? 0;
    valptr[length] = k;
    mincode[length] = code;
    code += count;
    k += count;
    maxcode[length] = count > 0 ? code - 1 : -1;
    code <<= 1;
  }
  return { maxcode, valptr, mincode, symbols };
}

function decodeHuffmanSymbol(reader, table) {
  let code = 0;
  for (let length = 1; length <= 16; length += 1) {
    code = (code << 1) | reader.readBit();
    const max = table.maxcode[length];
    if (max >= 0 && code <= max) return table.symbols[table.valptr[length] + code - table.mincode[length]];
  }
  throw new Error("잘못된 허프만 코드입니다.");
}

function extendDifference(value, size) {
  return value < 1 << (size - 1) ? value - (1 << size) + 1 : value;
}

/** 베이스라인 JPEG 한 스캔을 해독해 Y 성분 DC 블록 평균을 누적한다. */
function decodeJpegScan(bytes, start, frame, scanComponents, tables, restartInterval, quantTables, accumulator) {
  const reader = createBitReader(bytes, start);
  const predictors = new Map(scanComponents.map((component) => [component.index, 0]));
  const horizontalMax = Math.max(...frame.components.map((component) => component.h));
  const verticalMax = Math.max(...frame.components.map((component) => component.v));
  const decodeBlock = (component) => {
    const dcTable = tables.dc.get(component.dcTable);
    const acTable = tables.ac.get(component.acTable);
    if (dcTable === undefined || acTable === undefined) throw new Error("허프만 테이블이 정의되지 않았습니다.");
    const size = decodeHuffmanSymbol(reader, dcTable);
    const difference = size === 0 ? 0 : extendDifference(reader.receive(size), size);
    const dc = (predictors.get(component.index) ?? 0) + difference;
    predictors.set(component.index, dc);
    let k = 1;
    while (k < 64) {
      const symbol = decodeHuffmanSymbol(reader, acTable);
      const run = symbol >> 4;
      const bits = symbol & 15;
      if (bits === 0) {
        if (run === 15) {
          k += 16;
          continue;
        }
        break;
      }
      k += run;
      reader.receive(bits);
      k += 1;
    }
    if (component.index === 0) {
      const quant = quantTables.get(component.quantTable) ?? 1;
      accumulator.sum += (dc * quant) / 8 + 128;
      accumulator.count += 1;
    }
  };
  let mcu = 0;
  const afterMcu = () => {
    mcu += 1;
  };
  const beforeMcu = (total) => {
    if (restartInterval > 0 && mcu > 0 && mcu % restartInterval === 0 && mcu < total) {
      reader.restart();
      for (const key of predictors.keys()) predictors.set(key, 0);
    }
  };
  if (scanComponents.length === 1) {
    const component = scanComponents[0];
    const componentWidth = Math.ceil((frame.width * component.h) / horizontalMax);
    const componentHeight = Math.ceil((frame.height * component.v) / verticalMax);
    const blocksX = Math.ceil(componentWidth / 8);
    const blocksY = Math.ceil(componentHeight / 8);
    const total = blocksX * blocksY;
    for (let i = 0; i < total; i += 1) {
      beforeMcu(total);
      decodeBlock(component);
      afterMcu();
    }
  } else {
    const mcusX = Math.ceil(frame.width / (8 * horizontalMax));
    const mcusY = Math.ceil(frame.height / (8 * verticalMax));
    const total = mcusX * mcusY;
    for (let i = 0; i < total; i += 1) {
      beforeMcu(total);
      for (const component of scanComponents) {
        for (let b = 0; b < component.h * component.v; b += 1) decodeBlock(component);
      }
      afterMcu();
    }
  }
  return reader.position;
}

function decodeJpeg(bytes) {
  const info = { format: "jpeg", width: 0, height: 0, hasAlpha: false, meanLuminance: null, note: null };
  let position = 2;
  let frame = null;
  let progressive = false;
  let unsupportedFrame = false;
  let restartInterval = 0;
  const quantTables = new Map();
  const tables = { dc: new Map(), ac: new Map() };
  const accumulator = { sum: 0, count: 0 };
  let decodeError = null;
  while (position + 3 < bytes.length) {
    if (bytes[position] !== 0xff) {
      position += 1;
      continue;
    }
    const marker = bytes[position + 1];
    if (marker === 0xff) {
      position += 1;
      continue;
    }
    position += 2;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (marker === 0xd9) break;
    const length = (bytes[position] << 8) | bytes[position + 1];
    const body = position + 2;
    const end = position + length;
    if (marker === 0xdb) {
      let p = body;
      while (p < end) {
        const precision = bytes[p] >> 4;
        const id = bytes[p] & 15;
        p += 1;
        quantTables.set(id, precision === 0 ? bytes[p] : (bytes[p] << 8) | bytes[p + 1]);
        p += 64 * (precision === 0 ? 1 : 2);
      }
    } else if (marker === 0xc4) {
      let p = body;
      while (p < end) {
        const type = bytes[p] >> 4;
        const id = bytes[p] & 15;
        p += 1;
        const counts = Array.from(bytes.subarray(p, p + 16));
        p += 16;
        const total = counts.reduce((sum, value) => sum + value, 0);
        const symbols = Array.from(bytes.subarray(p, p + total));
        p += total;
        (type === 0 ? tables.dc : tables.ac).set(id, buildHuffmanTable(counts, symbols));
      }
    } else if (marker === 0xdd) {
      restartInterval = (bytes[body] << 8) | bytes[body + 1];
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const precision = bytes[body];
      const height = (bytes[body + 1] << 8) | bytes[body + 2];
      const width = (bytes[body + 3] << 8) | bytes[body + 4];
      const count = bytes[body + 5];
      const components = [];
      for (let i = 0; i < count; i += 1) {
        const base = body + 6 + i * 3;
        components.push({ index: i, id: bytes[base], h: bytes[base + 1] >> 4, v: bytes[base + 1] & 15, quantTable: bytes[base + 2], dcTable: 0, acTable: 0 });
      }
      info.width = width;
      info.height = height;
      if (marker === 0xc2) progressive = true;
      else if (marker !== 0xc0 && marker !== 0xc1) unsupportedFrame = true;
      if (precision !== 8) unsupportedFrame = true;
      frame = { width, height, components };
    } else if (marker === 0xda) {
      if (frame === null) {
        decodeError = "SOF보다 먼저 SOS가 나왔습니다.";
        break;
      }
      const count = bytes[body];
      const scanComponents = [];
      for (let i = 0; i < count; i += 1) {
        const id = bytes[body + 1 + i * 2];
        const selectors = bytes[body + 2 + i * 2];
        const component = frame.components.find((candidate) => candidate.id === id);
        if (component !== undefined) scanComponents.push({ ...component, dcTable: selectors >> 4, acTable: selectors & 15 });
      }
      if (progressive || unsupportedFrame) break;
      if (!scanComponents.some((component) => component.index === 0)) {
        position = end;
        continue;
      }
      try {
        position = decodeJpegScan(bytes, end, frame, scanComponents, tables, restartInterval, quantTables, accumulator);
      } catch (error) {
        decodeError = error instanceof Error ? error.message : String(error);
        break;
      }
      continue;
    }
    position = end;
  }
  if (frame === null) return { ...info, note: "JPEG SOF 마커를 찾지 못했습니다." };
  if (frame.components.length !== 1 && frame.components.length !== 3) return { ...info, note: `성분 ${frame.components.length}개 JPEG라 휘도를 측정하지 않았습니다.` };
  if (progressive) return { ...info, note: "프로그레시브 JPEG라 휘도를 측정하지 않았습니다(베이스라인으로 저장하세요)." };
  if (unsupportedFrame) return { ...info, note: "지원하지 않는 JPEG 방식(8비트 베이스라인만 해독)이라 휘도를 측정하지 않았습니다." };
  if (decodeError !== null) return { ...info, note: `JPEG 해독 실패: ${decodeError}` };
  if (accumulator.count === 0) return { ...info, note: "JPEG에서 Y 성분 블록을 읽지 못했습니다." };
  return { ...info, meanLuminance: Math.min(1, Math.max(0, accumulator.sum / accumulator.count / 255)) };
}

/**
 * 이미지 바이트에서 형식·크기·알파 여부·평균 휘도를 읽는다. 형식은 확장자나 선언이 아니라 매직 바이트로 판정한다.
 * @returns {{format: "png" | "jpeg" | null, width: number, height: number, hasAlpha: boolean, meanLuminance: number | null, note: string | null}}
 */
export function decodeImageInfo(bytes) {
  if (isPng(bytes)) return decodePng(bytes);
  if (isJpeg(bytes)) return decodeJpeg(bytes);
  return { format: null, width: 0, height: 0, hasAlpha: false, meanLuminance: null, note: "PNG/JPEG가 아닌 이미지 형식입니다." };
}
