/**
 * Adobe Custom Shapes (`.csh`) 버전 2 바이너리 코덱 및 SVG `<path>` 변환기.
 *
 * REA 정적 분석 증거 (`node_modules/ag-psd/dist/csh.js`,
 * `ev_baf7e9b90ef7d44256e3d11a8711223f9089249aaa818f98933df3bbe98bdd66`)를 기반으로
 * 클린룸 자체 구현했다.
 */

export interface CshBezierKnot {
  readonly linked: boolean;
  /** 이전 제어점 `[x, y]` (픽셀 좌표) */
  readonly before: readonly [number, number];
  /** 앵커 포인트 `[x, y]` (픽셀 좌표) */
  readonly anchor: readonly [number, number];
  /** 다음 제어점 `[x, y]` (픽셀 좌표) */
  readonly after: readonly [number, number];
}

export interface CshVectorSubpath {
  readonly open: boolean;
  readonly operation: "exclude" | "combine" | "subtract" | "intersect";
  readonly knots: readonly CshBezierKnot[];
}

export interface CshShapeEntry {
  readonly name: string;
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly fillStartsWithAllPixels: boolean;
  readonly paths: readonly CshVectorSubpath[];
}

export interface CshImportResult {
  readonly version: 2;
  readonly shapes: readonly CshShapeEntry[];
  readonly warnings: readonly string[];
}

export class CshParseError extends Error {
  constructor(
    message: string,
    readonly code:
      | "truncated"
      | "invalid-signature"
      | "unsupported-version"
      | "invalid-shape-version"
      | "invalid-path-record",
  ) {
    super(message);
    this.name = "CshParseError";
  }
}

const CSH_BOOLEAN_OPS: readonly CshVectorSubpath["operation"][] = [
  "exclude",
  "combine",
  "subtract",
  "intersect",
];

function stripTrailingNuls(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0) {
    end -= 1;
  }
  return value.slice(0, end);
}

function readAscii4(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function readUtf16BeStringWithLength(
  view: DataView,
  offset: number,
  unitCount: number,
  onTruncated: (msg: string) => Error,
): { text: string; nextOffset: number } {
  if (unitCount > 65_536) {
    throw onTruncated(`UTF-16 string length ${unitCount} exceeds ceiling`);
  }
  const byteSpan = unitCount * 2;
  if (offset + byteSpan > view.byteLength) {
    throw onTruncated("UTF-16 string extends past end of file");
  }
  const codeUnits: number[] = [];
  for (let i = 0; i < unitCount; i += 1) {
    codeUnits.push(view.getUint16(offset + i * 2, false));
  }
  const raw = String.fromCharCode(...codeUnits);
  return {
    text: stripTrailingNuls(raw),
    nextOffset: offset + byteSpan,
  };
}

function readPathFixedPoint32(view: DataView, offset: number): number {
  return view.getInt32(offset, false) / 0x01000000;
}

function writePathFixedPoint32(view: DataView, offset: number, value: number): void {
  const safe = Number.isFinite(value) ? value : 0;
  view.setInt32(offset, Math.round(safe * 0x01000000), false);
}

/**
 * Adobe Custom Shapes (`.csh`) 바이너리를 파싱한다.
 */
export function importCsh(bytes: Uint8Array): CshImportResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12) {
    throw new CshParseError("file shorter than the 12-byte CSH header", "truncated");
  }
  const signature = readAscii4(view, 0);
  if (signature !== "cush") {
    throw new CshParseError(`invalid CSH signature: ${signature}`, "invalid-signature");
  }
  const version = view.getUint32(4, false);
  if (version !== 2) {
    throw new CshParseError(`unsupported CSH version ${version}`, "unsupported-version");
  }
  const count = view.getUint32(8, false);
  if (count > 50_000) {
    throw new CshParseError(`CSH shape count ${count} exceeds safety ceiling`, "truncated");
  }

  let offset = 12;
  const shapes: CshShapeEntry[] = [];
  const warnings: string[] = [];

  for (let shapeIndex = 0; shapeIndex < count; shapeIndex += 1) {
    if (offset + 4 > bytes.byteLength) {
      throw new CshParseError(`shape ${shapeIndex}: missing name length`, "truncated");
    }
    const nameUnits = view.getUint32(offset, false);
    const parsedName = readUtf16BeStringWithLength(
      view,
      offset + 4,
      nameUnits,
      (msg) => new CshParseError(msg, "truncated"),
    );
    offset = parsedName.nextOffset;
    while (offset % 4 !== 0) {
      offset += 1;
    }

    if (offset + 8 > bytes.byteLength) {
      throw new CshParseError(`shape ${shapeIndex}: missing shape header`, "truncated");
    }
    const shapeVersion = view.getUint32(offset, false);
    if (shapeVersion !== 1) {
      throw new CshParseError(
        `shape ${shapeIndex}: invalid shape version ${shapeVersion}`,
        "invalid-shape-version",
      );
    }
    const shapeSize = view.getUint32(offset + 4, false);
    offset += 8;
    const shapeEnd = offset + shapeSize;
    if (shapeEnd > bytes.byteLength) {
      throw new CshParseError(`shape ${shapeIndex}: shape body exceeds file length`, "truncated");
    }

    if (offset + 1 > shapeEnd) {
      throw new CshParseError(`shape ${shapeIndex}: missing Pascal ID string`, "truncated");
    }
    const idLen = view.getUint8(offset);
    offset += 1;
    if (offset + idLen > shapeEnd) {
      throw new CshParseError(`shape ${shapeIndex}: Pascal ID exceeds shape body`, "truncated");
    }
    let id = "";
    for (let i = 0; i < idLen; i += 1) {
      id += String.fromCharCode(view.getUint8(offset + i));
    }
    offset += idLen;

    if (offset + 16 > shapeEnd) {
      throw new CshParseError(`shape ${shapeIndex}: missing bounds header`, "truncated");
    }
    const y1 = view.getInt32(offset, false);
    const x1 = view.getInt32(offset + 4, false);
    const y2 = view.getInt32(offset + 8, false);
    const x2 = view.getInt32(offset + 12, false);
    offset += 16;

    const width = Math.max(1, x2 - x1);
    const height = Math.max(1, y2 - y1);

    const paths: Array<{
      open: boolean;
      operation: CshVectorSubpath["operation"];
      knots: CshBezierKnot[];
    }> = [];
    let currentSubpath: {
      open: boolean;
      operation: CshVectorSubpath["operation"];
      knots: CshBezierKnot[];
    } | null = null;
    let fillStartsWithAllPixels = false;

    const remainingBytes = shapeEnd - offset;
    const recordCount = Math.floor(remainingBytes / 26);
    for (let r = 0; r < recordCount; r += 1) {
      const recOffset = offset + r * 26;
      const recType = view.getUint16(recOffset, false);
      switch (recType) {
        case 0:
        case 3: {
          const opIndex = view.getInt16(recOffset + 4, false);
          const operation = CSH_BOOLEAN_OPS[opIndex] ?? "combine";
          currentSubpath = {
            open: recType === 3,
            operation,
            knots: [],
          };
          paths.push(currentSubpath);
          break;
        }
        case 1:
        case 2:
        case 4:
        case 5: {
          if (!currentSubpath) {
            throw new CshParseError(
              `shape ${shapeIndex}: knot record ${recType} without active subpath`,
              "invalid-path-record",
            );
          }
          const by = readPathFixedPoint32(view, recOffset + 2) * height;
          const bx = readPathFixedPoint32(view, recOffset + 6) * width;
          const ay = readPathFixedPoint32(view, recOffset + 10) * height;
          const ax = readPathFixedPoint32(view, recOffset + 14) * width;
          const fy = readPathFixedPoint32(view, recOffset + 18) * height;
          const fx = readPathFixedPoint32(view, recOffset + 22) * width;
          currentSubpath.knots.push({
            linked: recType === 1 || recType === 4,
            before: [bx, by],
            anchor: [ax, ay],
            after: [fx, fy],
          });
          break;
        }
        case 6:
        case 7:
          break;
        case 8:
          fillStartsWithAllPixels = view.getUint16(recOffset + 2, false) === 1;
          break;
        default:
          warnings.push(`shape ${shapeIndex}: unknown vector record type ${recType}`);
          break;
      }
    }

    shapes.push({
      name: parsedName.text,
      id,
      width,
      height,
      fillStartsWithAllPixels,
      paths,
    });
    offset = shapeEnd;
  }

  return {
    version: 2,
    shapes,
    warnings,
  };
}

/**
 * 파싱된 `.csh` 커스텀 셰이프 엔트리를 SVG `<path d="...">` 문자열로 변환한다.
 */
export function cshShapeToSvgPath(shape: CshShapeEntry): string {
  const fmt = (value: number): string => {
    const safe = Number.isFinite(value) ? value : 0;
    return Number(safe.toFixed(3)).toString();
  };
  const commands: string[] = [];

  for (const subpath of shape.paths) {
    const knots = subpath.knots;
    if (knots.length === 0) continue;
    const first = knots[0]!;
    commands.push(`M ${fmt(first.anchor[0])} ${fmt(first.anchor[1])}`);
    for (let i = 1; i < knots.length; i += 1) {
      const prev = knots[i - 1]!;
      const curr = knots[i]!;
      commands.push(
        `C ${fmt(prev.after[0])} ${fmt(prev.after[1])}, ${fmt(curr.before[0])} ${fmt(curr.before[1])}, ${fmt(curr.anchor[0])} ${fmt(curr.anchor[1])}`,
      );
    }
    if (!subpath.open && knots.length > 1) {
      const last = knots[knots.length - 1]!;
      commands.push(
        `C ${fmt(last.after[0])} ${fmt(last.after[1])}, ${fmt(first.before[0])} ${fmt(first.before[1])}, ${fmt(first.anchor[0])} ${fmt(first.anchor[1])} Z`,
      );
    }
  }

  return commands.join(" ");
}

/**
 * 커스텀 셰이프 목록을 Adobe Custom Shapes (`.csh`) 버전 2 바이너리로 직렬화한다.
 */
export function exportCsh(shapes: readonly CshShapeEntry[]): Uint8Array {
  const shapeChunks: Uint8Array[] = [];

  for (const shape of shapes) {
    const cleanName = stripTrailingNuls(shape.name);
    const nameUnits = cleanName.length + 1;
    const nameHeaderBytes = 4 + nameUnits * 2;
    const paddedNameBytes =
      nameHeaderBytes % 4 === 0 ? nameHeaderBytes : nameHeaderBytes + (4 - (nameHeaderBytes % 4));

    const asciiId = shape.id.slice(0, 255);
    const idBytes = 1 + asciiId.length;

    let recordCount = 2; // type 6 (path fill rule) + type 8 (initial fill)
    for (const subpath of shape.paths) {
      recordCount += 1 + subpath.knots.length;
    }

    const bodySize = idBytes + 16 + recordCount * 26;
    const totalShapeBytes = paddedNameBytes + 8 + bodySize;
    const chunk = new Uint8Array(totalShapeBytes);
    const view = new DataView(chunk.buffer);

    view.setUint32(0, nameUnits, false);
    for (let i = 0; i < cleanName.length; i += 1) {
      view.setUint16(4 + i * 2, cleanName.charCodeAt(i), false);
    }
    view.setUint16(4 + cleanName.length * 2, 0, false);

    let cursor = paddedNameBytes;
    view.setUint32(cursor, 1, false); // shape version 1
    view.setUint32(cursor + 4, bodySize, false);
    cursor += 8;

    view.setUint8(cursor, asciiId.length);
    cursor += 1;
    for (let i = 0; i < asciiId.length; i += 1) {
      view.setUint8(cursor + i, asciiId.charCodeAt(i) & 0xff);
    }
    cursor += asciiId.length;

    const width = Math.max(1, Math.round(shape.width));
    const height = Math.max(1, Math.round(shape.height));
    view.setInt32(cursor, 0, false);
    view.setInt32(cursor + 4, 0, false);
    view.setInt32(cursor + 8, height, false);
    view.setInt32(cursor + 12, width, false);
    cursor += 16;

    // Record 0: type 6 (path fill rule)
    view.setUint16(cursor, 6, false);
    cursor += 26;
    // Record 1: type 8 (initial fill rule)
    view.setUint16(cursor, 8, false);
    view.setUint16(cursor + 2, shape.fillStartsWithAllPixels ? 1 : 0, false);
    cursor += 26;

    for (const subpath of shape.paths) {
      view.setUint16(cursor, subpath.open ? 3 : 0, false);
      view.setUint16(cursor + 2, subpath.knots.length, false);
      const opIdx = Math.max(0, CSH_BOOLEAN_OPS.indexOf(subpath.operation));
      view.setInt16(cursor + 4, opIdx, false);
      view.setUint16(cursor + 6, 1, false);
      cursor += 26;

      for (const knot of subpath.knots) {
        const knotType = subpath.open ? (knot.linked ? 4 : 5) : knot.linked ? 1 : 2;
        view.setUint16(cursor, knotType, false);
        writePathFixedPoint32(view, cursor + 2, knot.before[1] / height);
        writePathFixedPoint32(view, cursor + 6, knot.before[0] / width);
        writePathFixedPoint32(view, cursor + 10, knot.anchor[1] / height);
        writePathFixedPoint32(view, cursor + 14, knot.anchor[0] / width);
        writePathFixedPoint32(view, cursor + 18, knot.after[1] / height);
        writePathFixedPoint32(view, cursor + 22, knot.after[0] / width);
        cursor += 26;
      }
    }

    shapeChunks.push(chunk);
  }

  const totalBody = shapeChunks.reduce((acc, c) => acc + c.byteLength, 0);
  const out = new Uint8Array(12 + totalBody);
  const view = new DataView(out.buffer);
  out[0] = "c".charCodeAt(0);
  out[1] = "u".charCodeAt(0);
  out[2] = "s".charCodeAt(0);
  out[3] = "h".charCodeAt(0);
  view.setUint32(4, 2, false);
  view.setUint32(8, shapes.length, false);

  let offset = 12;
  for (const chunk of shapeChunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
