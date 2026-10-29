/**
 * @file gimp-generated-brush.ts
 * @description GIMP 생성 브러시(`.vbr`, 매개변수로 모양을 만드는 브러시) 읽기 코덱.
 *
 * 파일은 줄마다 값 하나인 텍스트다. 모양이 없는 구형(1.0)은 8줄, 모양이 있는 1.5는 10줄이며 1.5에서는 모양과
 * 가시 수(spikes) 줄이 끼어 뒤의 필드 위치가 밀린다. 출처와 이용 조건은 `gimp-brush-core.ts` 머리말과 같다
 * (`developer.gimp.org/core/standards/vbr/`, CC BY-SA 4.0). 단위는 문서에 반지름(픽셀)만 적혀 있어 나머지는 파일 값 그대로 돌려준다.
 */

import { GimpBrushError, issue, readSourceBytes, resolveLimits, sourceInfo, throwIfAborted, type GimpBrushImportOptions } from "./gimp-brush-core";

import type { FormatIssue } from "./format-common";

const STRICT_DECODER = new TextDecoder("utf-8", { fatal: true });
const LENIENT_DECODER = new TextDecoder("utf-8");
const MAGIC_LINE = "GIMP-VBR";
/** 이름은 최대 255바이트(문서). */
const MAX_NAME_BYTES = 255;
const FLOAT_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;
const KNOWN_SHAPES: ReadonlySet<string> = new Set(["circle", "square", "diamond"]);

export type GimpGeneratedBrushShape = "circle" | "square" | "diamond";

export interface GimpGeneratedBrushImportResult {
  readonly format: "gimp-generated-brush";
  readonly specProfile: "gimp-brush-public-spec";
  readonly version: "1.0" | "1.5";
  readonly name: string;
  /** 1.5의 모양 문자열. 문서가 정한 값이 아니면 그대로 두고 경고한다. 1.0에는 줄이 없어 null이다. */
  readonly shape: GimpGeneratedBrushShape | string | null;
  /** 기본 간격. 단위는 문서에 없다(실표본 값은 브러시 너비의 백분율로 보인다). */
  readonly spacing: number;
  /** 반지름(픽셀). */
  readonly radius: number;
  /** 가시 수. 1.0에는 줄이 없어 null이다. */
  readonly spikes: number | null;
  readonly hardness: number;
  readonly aspectRatio: number;
  readonly angle: number;
  readonly warnings: readonly FormatIssue[];
  readonly unsupported: readonly FormatIssue[];
  readonly source: { readonly byteLength: number; readonly sha256: string };
}

function parseFloatLine(text: string, field: string, line: number): number {
  const trimmed = text.trim();
  if (!FLOAT_PATTERN.test(trimmed)) {
    throw new GimpBrushError(`${line}번째 줄(${field}) "${trimmed.slice(0, 40)}"가 소수가 아니다`, "header-invalid");
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    throw new GimpBrushError(`${line}번째 줄(${field}) 값이 유한하지 않다`, "header-invalid");
  }
  return value;
}

/** `.vbr` 생성 브러시를 읽는다. 필드가 모자라거나 숫자가 아니면 `GimpBrushError`를 던진다. */
export async function importGimpGeneratedBrush(
  source: Blob | Uint8Array | ArrayBuffer,
  options: GimpBrushImportOptions = {},
): Promise<GimpGeneratedBrushImportResult> {
  const limits = resolveLimits(options.limits);
  const bytes = await readSourceBytes(source, limits, options.signal);
  // 올바른 파일은 10줄 안팎의 수백 바이트다. 줄 수가 입력 크기에 비례해 늘어나지 않게 텍스트 크기를 줄 한도의 16배로 막는다.
  const maxTextBytes = limits.maxLineBytes * 16;
  if (bytes.byteLength > maxTextBytes) {
    throw new GimpBrushError(`생성 브러시 텍스트 ${bytes.byteLength}바이트가 한도 ${maxTextBytes}를 넘는다`, "limit-exceeded");
  }
  const warnings: FormatIssue[] = [];
  let invalidUtf8 = false;
  let text: string;
  try {
    text = STRICT_DECODER.decode(bytes);
  } catch {
    invalidUtf8 = true;
    text = LENIENT_DECODER.decode(bytes);
  }
  if (invalidUtf8) {
    warnings.push(issue("metadata", "gimp-vbr-utf8-invalid", "UTF-8로 해석되지 않는 바이트가 있어 대체 문자로 바꿨다"));
  }
  if (text.includes("\r")) {
    warnings.push(issue("container", "gimp-vbr-carriage-return", "줄이 캐리지 리턴으로 끝나 떼어 냈다"));
  }
  const lines = text.split(/\r?\n/u);
  // 마지막 줄바꿈 뒤의 빈 조각은 줄이 아니다.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  if (lines[0] !== MAGIC_LINE) {
    throw new GimpBrushError(`첫 줄이 ${MAGIC_LINE}가 아니다`, "magic-invalid");
  }
  const versionText = lines[1]?.trim();
  if (versionText !== "1.0" && versionText !== "1.5") {
    throw new GimpBrushError(`버전 "${versionText ?? ""}"를 지원하지 않는다 (1.0, 1.5만 안다)`, "version-unsupported");
  }
  const version = versionText;
  const expectedLines = version === "1.0" ? 8 : 10;
  if (lines.length < expectedLines) {
    throw new GimpBrushError(`버전 ${version}은 ${expectedLines}줄이어야 하는데 ${lines.length}줄뿐이다`, "truncated");
  }
  const name = lines[2] ?? "";
  if (new TextEncoder().encode(name).byteLength > MAX_NAME_BYTES) {
    warnings.push(issue("metadata", "gimp-vbr-name-too-long", `이름이 문서가 정한 최대 ${MAX_NAME_BYTES}바이트를 넘는다`, "line 3"));
  }

  let shape: string | null = null;
  let spikes: number | null = null;
  let cursor = 3;
  if (version === "1.5") {
    shape = (lines[cursor] ?? "").trim();
    cursor += 1;
    if (!KNOWN_SHAPES.has(shape)) {
      warnings.push(issue("semantic", "gimp-vbr-shape-unknown", `모양 "${shape.slice(0, 40)}"는 문서가 정한 circle·square·diamond가 아니다`, "line 4"));
    }
  }
  const spacing = parseFloatLine(lines[cursor] ?? "", "spacing", cursor + 1);
  cursor += 1;
  const radius = parseFloatLine(lines[cursor] ?? "", "radius", cursor + 1);
  cursor += 1;
  if (version === "1.5") {
    const spikesValue = parseFloatLine(lines[cursor] ?? "", "spikes", cursor + 1);
    if (!Number.isInteger(spikesValue) || spikesValue < 0) {
      throw new GimpBrushError(`${cursor + 1}번째 줄(spikes) 값 ${spikesValue}가 0 이상의 정수가 아니다`, "header-invalid");
    }
    spikes = spikesValue;
    cursor += 1;
  }
  const hardness = parseFloatLine(lines[cursor] ?? "", "hardness", cursor + 1);
  cursor += 1;
  const aspectRatio = parseFloatLine(lines[cursor] ?? "", "aspect ratio", cursor + 1);
  cursor += 1;
  const angle = parseFloatLine(lines[cursor] ?? "", "angle", cursor + 1);
  cursor += 1;

  throwIfAborted(options.signal);
  if (lines.length > cursor) {
    warnings.push(issue("container", "gimp-vbr-trailing-lines", `마지막 필드 뒤에 ${lines.length - cursor}줄이 더 있어 무시했다`));
  }
  return {
    format: "gimp-generated-brush",
    specProfile: "gimp-brush-public-spec",
    version,
    name,
    shape,
    spacing,
    radius,
    spikes,
    hardness,
    aspectRatio,
    angle,
    warnings,
    unsupported: [],
    source: sourceInfo(bytes),
  };
}
