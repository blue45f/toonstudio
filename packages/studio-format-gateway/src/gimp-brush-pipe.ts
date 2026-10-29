/**
 * @file gimp-brush-pipe.ts
 * @description GIMP 이미지 파이프(`.gih`, 애니메이션·다중 팁 브러시) 읽기 코덱.
 *
 * 파일은 텍스트 헤더 두 줄(파이프 이름, `브러시 수 + 매개변수 문자열`)과 이어 붙인 `.gbr` 브러시들로 이루어진다.
 * 브러시는 크기가 서로 달라도 되고 구분자가 없어서, 앞 브러시의 헤더 크기와 픽셀 크기로 다음 위치를 정한다.
 * 출처와 이용 조건은 `gimp-brush-core.ts` 머리말과 같다. 공개 문서의 매개변수 예(`selection:incremental`)와 실제
 * 파일(`sel0:random` 등)이 다르다. 문서에 없는 키를 버리지 않고 `entries`에 전부 남긴다.
 */

import {
  GimpBrushError,
  issue,
  parseBrushAt,
  readSourceBytes,
  resolveLimits,
  sourceInfo,
  throwIfAborted,
  type GimpBrush,
  type GimpBrushImportOptions,
} from "./gimp-brush-core";

import type { FormatIssue } from "./format-common";

const STRICT_LINE_DECODER = new TextDecoder("utf-8", { fatal: true });
const LENIENT_LINE_DECODER = new TextDecoder("utf-8");

export interface GimpBrushPipeParameters {
  /** 둘째 줄에서 브러시 수 뒤에 이어지는 매개변수 문자열 그대로. */
  readonly raw: string;
  /** `키:값` 쌍 전부(문서에 없는 키 포함). 같은 키가 반복되면 마지막 값을 쓴다. */
  readonly entries: Readonly<Record<string, string>>;
  readonly cellCount: number | null;
  readonly cellWidth: number | null;
  readonly cellHeight: number | null;
  readonly step: number | null;
  /** 차원 수. */
  readonly dim: number | null;
  readonly cols: number | null;
  readonly rows: number | null;
  readonly placement: string | null;
  /** 차원별 길이(`rank0`, `rank1`, ...). */
  readonly ranks: readonly number[];
  /** 차원별 선택 방식(`sel0`, `sel1`, ...). 공개 문서의 예에 있는 단일 키 `selection`도 첫 항목으로 받는다. */
  readonly selections: readonly string[];
}

export interface GimpBrushPipeImportResult {
  readonly format: "gimp-brush-pipe";
  readonly specProfile: "gimp-brush-public-spec";
  readonly name: string;
  /** 둘째 줄이 선언한 브러시 수. */
  readonly declaredBrushCount: number;
  readonly parameters: GimpBrushPipeParameters;
  readonly brushes: readonly GimpBrush[];
  /** 선언한 수만큼 브러시를 읽지 못했다. */
  readonly truncated: boolean;
  readonly warnings: readonly FormatIssue[];
  readonly unsupported: readonly FormatIssue[];
  readonly source: { readonly byteLength: number; readonly sha256: string };
}

interface TextLine {
  readonly text: string;
  /** 줄 끝에 캐리지 리턴이 있어 떼어 냈다. */
  readonly hadCarriageReturn: boolean;
  /** UTF-8로 해석되지 않는 바이트가 있어 대체 문자로 바꿨다. */
  readonly invalidUtf8: boolean;
  /** 줄바꿈 다음 위치. */
  readonly next: number;
}

function readLine(bytes: Uint8Array, start: number, maxBytes: number, what: string): TextLine {
  const window = bytes.subarray(start, Math.min(bytes.byteLength, start + maxBytes + 1));
  const newline = window.indexOf(0x0a);
  if (newline === -1) {
    throw new GimpBrushError(
      window.byteLength > maxBytes ? `${what} 줄이 한도 ${maxBytes}바이트를 넘는다` : `${what} 줄이 줄바꿈 없이 끝났다`,
      window.byteLength > maxBytes ? "limit-exceeded" : "header-invalid",
    );
  }
  let raw = window.subarray(0, newline);
  const hadCarriageReturn = raw.byteLength > 0 && raw[raw.byteLength - 1] === 0x0d;
  if (hadCarriageReturn) raw = raw.subarray(0, raw.byteLength - 1);
  let text: string;
  let invalidUtf8 = false;
  try {
    text = STRICT_LINE_DECODER.decode(raw);
  } catch {
    invalidUtf8 = true;
    text = LENIENT_LINE_DECODER.decode(raw);
  }
  return { text, hadCarriageReturn, invalidUtf8, next: start + newline + 1 };
}

function wholeNumber(value: string | undefined): number | null {
  return value !== undefined && /^\d+$/u.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

function parseParameters(raw: string, warnings: FormatIssue[]): GimpBrushPipeParameters {
  const entries: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const token of raw.split(/[ \t]+/u).filter((part) => part.length > 0)) {
    const colon = token.indexOf(":");
    if (colon <= 0) {
      warnings.push(issue("metadata", "gimp-pipe-parameter-malformed", `매개변수 "${token}"가 키:값 형식이 아니라 무시했다`, "pipe.parameters"));
      continue;
    }
    const key = token.slice(0, colon);
    if (key in entries) {
      warnings.push(issue("metadata", "gimp-pipe-parameter-duplicate", `매개변수 "${key}"가 반복되어 마지막 값을 썼다`, "pipe.parameters"));
    }
    entries[key] = token.slice(colon + 1);
  }
  const numeric = (key: string): number | null => {
    const value = entries[key];
    if (value === undefined) return null;
    const parsed = wholeNumber(value);
    if (parsed === null) warnings.push(issue("metadata", "gimp-pipe-parameter-not-integer", `매개변수 "${key}"의 값 "${value}"가 0 이상의 정수가 아니다`, "pipe.parameters"));
    return parsed;
  };
  const cellCount = numeric("ncells");
  const cellWidth = numeric("cellwidth");
  const cellHeight = numeric("cellheight");
  const step = numeric("step");
  const dim = numeric("dim");
  const cols = numeric("cols");
  const rows = numeric("rows");
  const ranks: number[] = [];
  const selections: string[] = [];
  const dimensions = dim ?? 0;
  for (let index = 0; index < dimensions && index < 16; index += 1) {
    const rank = numeric(`rank${index}`);
    if (rank !== null) ranks.push(rank);
    const selection = entries[`sel${index}`] ?? (index === 0 ? entries["selection"] : undefined);
    if (selection !== undefined) selections.push(selection);
  }
  return { raw, entries: Object.freeze(entries), cellCount, cellWidth, cellHeight, step, dim, cols, rows, placement: entries["placement"] ?? null, ranks, selections };
}

/** `.gih` 파이프를 읽는다. 브러시 하나가 깨져도 그 앞까지 읽은 브러시는 돌려주고 `truncated`로 표시한다. */
export async function importGimpBrushPipe(
  source: Blob | Uint8Array | ArrayBuffer,
  options: GimpBrushImportOptions = {},
): Promise<GimpBrushPipeImportResult> {
  const limits = resolveLimits(options.limits);
  const bytes = await readSourceBytes(source, limits, options.signal);
  const warnings: FormatIssue[] = [];
  const unsupported: FormatIssue[] = [];

  const first = readLine(bytes, 0, limits.maxLineBytes, "파이프 이름");
  const second = readLine(bytes, first.next, limits.maxLineBytes, "파이프 매개변수");
  const name = first.text;
  const countMatch = /^(\d+)(?:[ \t]+([\s\S]*))?$/u.exec(second.text);
  if (countMatch === null) {
    throw new GimpBrushError("둘째 줄이 브러시 수로 시작하지 않는다", "header-invalid");
  }
  const declared = Number(countMatch[1]);
  if (!Number.isSafeInteger(declared) || declared === 0) {
    throw new GimpBrushError(`브러시 수 ${countMatch[1]}가 올바르지 않다`, "header-invalid");
  }
  if (declared > limits.maxPipeBrushes) {
    throw new GimpBrushError(`브러시 ${declared}개가 한도 ${limits.maxPipeBrushes}를 넘는다`, "limit-exceeded");
  }
  if (first.hadCarriageReturn || second.hadCarriageReturn) {
    warnings.push(issue("container", "gimp-pipe-carriage-return", "텍스트 헤더 줄이 캐리지 리턴으로 끝나 떼어 냈다", "pipe.header"));
  }
  if (first.invalidUtf8 || second.invalidUtf8) {
    warnings.push(issue("metadata", "gimp-pipe-header-utf8-invalid", "텍스트 헤더에 UTF-8로 해석되지 않는 바이트가 있어 대체 문자로 바꿨다", "pipe.header"));
  }
  const parameters = parseParameters(countMatch[2] ?? "", warnings);

  const brushes: GimpBrush[] = [];
  let truncated = false;
  let offset = second.next;
  for (let index = 0; index < declared; index += 1) {
    throwIfAborted(options.signal);
    const where = `brush[${index}]@${offset}`;
    if (offset >= bytes.byteLength) {
      truncated = true;
      break;
    }
    try {
      const brush = parseBrushAt(bytes, offset, limits, warnings, unsupported, where);
      brushes.push(brush);
      if (brush.pixels === null) {
        // 본문 크기를 모르는 브러시(v3)는 다음 위치를 정할 수 없다.
        unsupported.push(issue("container", "gimp-pipe-brush-body-unknown", `브러시 ${index}의 본문 크기를 알 수 없어 뒤의 브러시를 읽지 않았다`, where));
        truncated = index + 1 < declared;
        offset = bytes.byteLength;
        break;
      }
      offset += brush.byteLength;
    } catch (error) {
      if (!(error instanceof GimpBrushError) || error.code === "aborted") throw error;
      unsupported.push(issue("container", "gimp-pipe-brush-invalid", `브러시 ${index}를 읽지 못해 뒤의 브러시를 읽지 않았다: ${error.message}`, where));
      truncated = true;
      break;
    }
  }
  if (brushes.length < declared) {
    truncated = true;
    warnings.push(issue("container", "gimp-pipe-brush-count-mismatch", `둘째 줄은 브러시 ${declared}개를 선언하지만 ${brushes.length}개만 읽었다`, "pipe"));
  }
  if (parameters.cellCount !== null && parameters.cellCount !== declared) {
    warnings.push(issue("metadata", "gimp-pipe-ncells-mismatch", `ncells ${parameters.cellCount}가 선언한 브러시 수 ${declared}와 다르다`, "pipe.parameters"));
  }
  if (parameters.dim !== null && parameters.ranks.length === parameters.dim && parameters.dim > 0) {
    const product = parameters.ranks.reduce((total, rank) => total * rank, 1);
    if (product !== declared) {
      warnings.push(issue("metadata", "gimp-pipe-rank-product-mismatch", `차원별 길이의 곱 ${product}가 선언한 브러시 수 ${declared}와 다르다`, "pipe.parameters"));
    }
  }
  if (!truncated && offset < bytes.byteLength) {
    warnings.push(issue("container", "gimp-pipe-trailing-bytes", `마지막 브러시 뒤에 ${bytes.byteLength - offset}바이트가 더 있다`, "pipe"));
  }
  return {
    format: "gimp-brush-pipe",
    specProfile: "gimp-brush-public-spec",
    name,
    declaredBrushCount: declared,
    parameters,
    brushes,
    truncated,
    warnings,
    unsupported,
    source: sourceInfo(bytes),
  };
}
