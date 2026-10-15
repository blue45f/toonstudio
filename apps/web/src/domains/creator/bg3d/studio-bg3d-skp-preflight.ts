/**
 * .skp 사전 검사 — 파서를 부르기 전에 크기·바이트 시그니처·버전·압축 해제 모델 데이터 크기를 확인한다.
 *
 * 순수 함수만 두어 Worker 안과 밖(가져오기 계획 단계, Worker 를 만들기 전의 클라이언트 포함)에서 같은 규칙을
 * 쓴다. 규칙이 하나라도 어기면 변환기를 불러오기 전에 즉시 실패해, 깨진 파일이 무거운 파서 경로까지 가지 않는다.
 *
 * 헤더 형식은 openskp 1.3.0 소스(src/vff.ts, src/index.ts)에서 확인했다.
 *   FF FE FF 0E | "SketchUp Model"(UTF-16LE) | FF FE FF <길이 1바이트> | "{메이저.마이너.빌드}"(UTF-16LE) ...
 * 레거시(MFC, SketchUp 2013–2020)는 앞 512바이트 안에 ASCII "CVersionMap" 이 있고, VFF(2021+)는
 * 앞부분에 ZIP 로컬 헤더(PK 03 04)가 이어진다.
 */

import {
  STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES,
  STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION,
  STUDIO_BG3D_SKP_SIGNATURE,
  StudioBg3dSkpConversionError,
  StudioBg3dSkpParseError,
} from "./studio-bg3d-skp-contract";
import { readStudioBg3dSkpModelDataSize } from "./studio-bg3d-skp-zip-index";

export type StudioBg3dSkpContainerKind = "vff" | "legacy" | "unknown";

export interface StudioBg3dSkpVersionInfo {
  /** 중괄호를 뺀 파일 버전 원문. 예: "21.0.339". 읽지 못하면 null. */
  readonly raw: string | null;
  readonly major: number | null;
  /** 사용자에게 보여 줄 제품 이름. 예: "SketchUp 2021". 읽지 못하면 null. */
  readonly label: string | null;
}

export interface StudioBg3dSkpHeaderInfo {
  readonly container: StudioBg3dSkpContainerKind;
  readonly version: StudioBg3dSkpVersionInfo;
}

const VERSION_SEARCH_LIMIT = 512;
const VERSION_DECODE_BYTES = 128;
const CONTAINER_SEARCH_LIMIT = 4_096;
const LEGACY_ZIP_SEARCH_LIMIT = 256;
const LEGACY_MARKER = "CVersionMap";
const VERSION_PATTERN = /\{(\d{1,4})\.(\d{1,4})(?:\.(\d{1,9}))?\}/u;

function indexOfSequence(
  bytes: Uint8Array,
  sequence: readonly number[],
  start: number,
  limit: number,
): number {
  const end = Math.min(bytes.byteLength, limit) - sequence.length;
  for (let index = start; index <= end; index += 1) {
    let matched = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (bytes[index + offset] !== sequence[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

/** 첫 4바이트가 SketchUp 시그니처인지 본다. 빈 입력·짧은 입력은 false. */
export function hasStudioBg3dSkpSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < STUDIO_BG3D_SKP_SIGNATURE.length) return false;
  return STUDIO_BG3D_SKP_SIGNATURE.every((value, index) => bytes[index] === value);
}

/** 파일 버전 메이저 번호를 제품 이름으로 바꾼다. 2013 이후는 연도 표기를 쓴다. */
export function formatStudioBg3dSkpProductLabel(major: number): string {
  return major >= STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION
    ? `SketchUp ${2000 + major}`
    : `SketchUp ${major}`;
}

function readVersion(bytes: Uint8Array): StudioBg3dSkpVersionInfo {
  const unknown: StudioBg3dSkpVersionInfo = { raw: null, major: null, label: null };
  // 두 번째 FF FE FF 마커 뒤 1바이트(문자열 길이)를 건너뛰고 UTF-16LE 로 해석한다.
  const marker = indexOfSequence(bytes, [0xff, 0xfe, 0xff], 4, VERSION_SEARCH_LIMIT);
  if (marker < 0) return unknown;
  const start = marker + 4;
  const slice = bytes.subarray(start, Math.min(bytes.byteLength, start + VERSION_DECODE_BYTES));
  const evenLength = slice.byteLength - (slice.byteLength % 2);
  if (evenLength <= 0) return unknown;
  let text: string;
  try {
    text = new TextDecoder("utf-16le").decode(slice.subarray(0, evenLength));
  } catch {
    return unknown;
  }
  const match = VERSION_PATTERN.exec(text);
  if (!match) return unknown;
  const major = Number(match[1]);
  if (!Number.isSafeInteger(major)) return unknown;
  const raw = match[3] === undefined ? `${match[1]}.${match[2]}` : `${match[1]}.${match[2]}.${match[3]}`;
  return { raw, major, label: formatStudioBg3dSkpProductLabel(major) };
}

/** openskp 의 isLegacy() 와 같은 판정: 앞 256바이트에 ZIP 헤더가 없고 앞 512바이트에 CVersionMap 이 있으면 레거시. */
function detectContainer(bytes: Uint8Array): StudioBg3dSkpContainerKind {
  const zipHeader = [0x50, 0x4b, 0x03, 0x04] as const;
  const legacyMarker = Array.from(LEGACY_MARKER, (character) => character.charCodeAt(0));
  const zipNearStart = indexOfSequence(bytes, zipHeader, 0, LEGACY_ZIP_SEARCH_LIMIT) >= 0;
  if (!zipNearStart && indexOfSequence(bytes, legacyMarker, 0, VERSION_SEARCH_LIMIT) >= 0) {
    return "legacy";
  }
  return indexOfSequence(bytes, zipHeader, 0, CONTAINER_SEARCH_LIMIT) >= 0 ? "vff" : "unknown";
}

/**
 * 시그니처를 확인하고 컨테이너 종류와 파일 버전을 읽는다. 시그니처가 다르면 skp-parse-failed 로
 * 즉시 실패한다(원인: invalid-signature). 버전 지원 여부는 assertStudioBg3dSkpSupportedVersion 이 판정한다.
 */
export function inspectStudioBg3dSkpHeader(bytes: Uint8Array): StudioBg3dSkpHeaderInfo {
  if (!hasStudioBg3dSkpSignature(bytes)) {
    throw new StudioBg3dSkpParseError(
      "SketchUp(.skp) 파일 시그니처가 아닙니다. 확장자만 바뀐 다른 파일이거나 손상된 파일일 수 있습니다.",
      { reason: "invalid-signature" },
    );
  }
  return { container: detectContainer(bytes), version: readVersion(bytes) };
}

/** OpenSKP 가 지원을 밝힌 최저 버전(SketchUp 2013) 미만이면 skp-unsupported-version 으로 실패한다. */
export function assertStudioBg3dSkpSupportedVersion(version: StudioBg3dSkpVersionInfo): void {
  if (version.major !== null && version.major < STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION) {
    throw new StudioBg3dSkpConversionError(
      "skp-unsupported-version",
      `${version.label ?? "이전 버전"} 파일은 지원하지 않습니다(SketchUp 2013 이상만 변환할 수 있습니다).`,
      {
        reason: "unsupported-version",
        detail: { major: version.major, minimumMajor: STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION },
      },
    );
  }
}

export interface StudioBg3dSkpSizePolicy {
  /** 프로필·환경에서 허용하는 원본 상한(바이트). */
  readonly maxBytes: number;
  /** true 면 Worker 없이 메인 스레드에서 변환하므로 더 작은 상한을 함께 적용한다. */
  readonly mainThread?: boolean;
}

/** 원본 바이트 수가 비었거나 한도를 넘으면 실패한다. 파일을 읽기 전에 File.size 로도 호출할 수 있다. */
export function assertStudioBg3dSkpSourceSize(byteLength: number, policy: StudioBg3dSkpSizePolicy): void {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new StudioBg3dSkpParseError(
      "비어 있는 .skp 파일은 변환할 수 없습니다.",
      { reason: "invalid-signature" },
    );
  }
  if (policy.mainThread && byteLength > STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES) {
    throw new StudioBg3dSkpConversionError(
      "skp-too-large",
      "이 브라우저는 Worker 를 쓸 수 없어 작은 .skp 파일만 변환할 수 있습니다.",
      {
        reason: "main-thread-limit",
        detail: { byteLength, limitBytes: STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES },
      },
    );
  }
  if (byteLength > policy.maxBytes) {
    throw new StudioBg3dSkpConversionError(
      "skp-too-large",
      ".skp 파일이 변환 가능한 크기 한도를 넘었습니다.",
      { reason: "source-limit", detail: { byteLength, limitBytes: policy.maxBytes } },
    );
  }
}

/** 시그니처·버전을 한 번에 확인하고 헤더 정보를 돌려준다(크기 검사는 호출 위치에서 따로 한다). */
export function preflightStudioBg3dSkpBytes(bytes: Uint8Array): StudioBg3dSkpHeaderInfo {
  const header = inspectStudioBg3dSkpHeader(bytes);
  assertStudioBg3dSkpSupportedVersion(header.version);
  return header;
}

/**
 * 파서가 실제로 처리할 모델 데이터가 상한을 넘는지 본다. 메모리는 압축 파일이 아니라 압축을 푼 레코드 수에 비례하므로
 * (OpenSKP README "Known limitation: large files"), 2021 이후 형식은 ZIP 중앙 디렉터리가 선언한 model.dat 의
 * 압축 해제 크기를, 레거시는 파일 전체(= 이미 원본 상한으로 확인됨)를 같은 상한과 견준다. 크기를 확실히 읽지 못하면
 * 거절하지 않고 파서에 맡긴다.
 */
export function assertStudioBg3dSkpModelDataSize(
  bytes: Uint8Array,
  header: StudioBg3dSkpHeaderInfo,
  policy: StudioBg3dSkpSizePolicy,
): void {
  if (header.container !== "vff") return;
  const modelDataBytes = readStudioBg3dSkpModelDataSize(bytes);
  if (modelDataBytes === null) return;
  const limitBytes = policy.mainThread
    ? Math.min(policy.maxBytes, STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES)
    : policy.maxBytes;
  if (modelDataBytes > limitBytes) {
    throw new StudioBg3dSkpConversionError(
      "skp-too-large",
      "압축을 푼 .skp 모델 데이터가 변환 가능한 크기 한도를 넘었습니다.",
      { reason: "model-data-limit", detail: { modelDataBytes, limitBytes } },
    );
  }
}

/**
 * 파서를 부르기 전에 거는 사전 검사 전체: 원본 크기 → 시그니처 → 버전 → 압축 해제 모델 데이터 크기.
 * 어느 하나라도 어기면 변환기를 불러오거나 Worker 를 만들기 전에 즉시 실패한다.
 */
export function preflightStudioBg3dSkpSource(
  bytes: Uint8Array,
  policy: StudioBg3dSkpSizePolicy,
): StudioBg3dSkpHeaderInfo {
  assertStudioBg3dSkpSourceSize(bytes.byteLength, policy);
  const header = preflightStudioBg3dSkpBytes(bytes);
  assertStudioBg3dSkpModelDataSize(bytes, header, policy);
  return header;
}
