/**
 * SketchUp(.skp) 가져오기 계약 — 한도 상수, 진행 단계, 오류 분류.
 *
 * three.js 와 openskp 어느 쪽에도 의존하지 않는 최하위 층이다. 변환 Worker, 메인 스레드 폴백,
 * 가져오기 파이프라인, 결과 패널이 같은 값을 읽도록 한곳에 모았다(순환 import 방지).
 *
 * 사실 근거(node_modules/openskp 1.3.0 README·타입·소스에서 확인):
 * - SketchUp 은 형상을 인치·Z-up 으로 저장하고, buildScene() 이 미터·Y-up((x, y, z) -> (x, z, -y))으로 바꾼다.
 * - 파일 첫 4바이트는 모든 컨테이너(VFF 2021+, 레거시 MFC 2013–2020) 공통으로 FF FE FF 0E 다.
 * - 대형 파일은 힙을 크게 쓴다(README: 113MB 파일이 Node 힙 8–16GB). 브라우저 탭에서는 더 작은 한도가 필요하다.
 */

/** 모든 .skp 컨테이너가 공유하는 첫 4바이트 시그니처. */
export const STUDIO_BG3D_SKP_SIGNATURE = [0xff, 0xfe, 0xff, 0x0e] as const;

/** 데스크톱·기본 원본 상한. 일반 변환 원본 상한(32MiB)과 같다. */
export const STUDIO_BG3D_SKP_MAX_SOURCE_BYTES = 32 * 1024 * 1024;
/** 모바일 원본 상한. 탭 힙이 작아 데스크톱의 절반으로 둔다. */
export const STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES = 16 * 1024 * 1024;
/** Worker 를 쓸 수 없어 메인 스레드에서 변환할 때의 상한. 화면이 멈추는 시간을 수백 ms 안으로 묶는다. */
export const STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES = 2 * 1024 * 1024;
/** 이 크기를 넘으면 이름·단위 보고용 2차 파싱(parseSkp)을 건너뛰어 시간과 힙을 아낀다. */
export const STUDIO_BG3D_SKP_METADATA_PASS_MAX_BYTES = 24 * 1024 * 1024;
/** Worker 변환 시간 상한. 넘으면 Worker 를 종료하고 skp-timeout 으로 실패한다. */
export const STUDIO_BG3D_SKP_CONVERSION_TIMEOUT_MS = 90_000;
/** OpenSKP 가 지원한다고 밝힌 가장 오래된 버전(SketchUp 2013 = 파일 버전 13). */
export const STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION = 13;

/** 텍스처 이미지를 GLB 에 넣는 상한. 넘으면 평균 색으로 가져오고 보고서에 경고를 남긴다. */
export const STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_BYTES = 24 * 1024 * 1024;
export const STUDIO_BG3D_SKP_TEXTURE_EMBED_MAX_COUNT = 64;

/** 면 방향 점검에 쓰는 삼각형 상한. 넘으면 점검을 건너뛰고 그 사실을 보고한다. */
export const STUDIO_BG3D_SKP_ORIENTATION_CHECK_MAX_TRIANGLES = 150_000;
/** 삼각형이 이 수를 넘으면 폴리곤 과다 경고를 낸다(모바일 예산 500,000의 절반). */
export const STUDIO_BG3D_SKP_HIGH_TRIANGLE_COUNT = 250_000;

/** 보고서 이름 목록 한도. 초과분은 total 과 truncated 로만 남긴다. */
export const STUDIO_BG3D_SKP_REPORT_MAX_NAMES = 64;
export const STUDIO_BG3D_SKP_REPORT_MAX_NAME_CODE_POINTS = 80;
export const STUDIO_BG3D_SKP_REPORT_MAX_WARNINGS = 24;

/** 가장 긴 변이 이보다 작으면 "수 mm", 이 이상이면 "수 km" 로 보고 단위 확인을 요청한다. */
export const STUDIO_BG3D_SKP_SIZE_TOO_SMALL_METERS = 0.01;
export const STUDIO_BG3D_SKP_SIZE_TOO_LARGE_METERS = 1000;
/** 단위 후보가 "그럴듯한 크기"인지 가르는 범위(웹툰 배경 소품~거리 규모). */
export const STUDIO_BG3D_SKP_PLAUSIBLE_MIN_METERS = 0.05;
export const STUDIO_BG3D_SKP_PLAUSIBLE_MAX_METERS = 500;

export type StudioBg3dSkpDeviceProfile = "mobile" | "desktop";

/** 프로필별 원본 크기 상한. 프로필을 모르면 데스크톱 상한을 쓴다. */
export function resolveStudioBg3dSkpMaxSourceBytes(
  profile: StudioBg3dSkpDeviceProfile | undefined,
): number {
  return profile === "mobile"
    ? STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES
    : STUDIO_BG3D_SKP_MAX_SOURCE_BYTES;
}

/** 변환 실행 위치. 폴백은 Worker 가 없는 환경에서만 쓰며 보고서에 그대로 남는다. */
export type StudioBg3dSkpExecution = "worker" | "main-thread";

export const STUDIO_BG3D_SKP_STAGES = [
  "validating",
  "loading-converter",
  "reading-metadata",
  "building-scene",
  "optimizing",
  "writing-glb",
] as const;

export type StudioBg3dSkpStage = (typeof STUDIO_BG3D_SKP_STAGES)[number];

export interface StudioBg3dSkpStageProgress {
  readonly stage: StudioBg3dSkpStage;
  /** 단계 안의 진행률(0..1). 알 수 없으면 null. */
  readonly fraction: number | null;
  readonly execution: StudioBg3dSkpExecution;
}

/** 단계의 1-based 순번. 진행 표시("3/6")에 쓴다. */
export function studioBg3dSkpStageNumber(stage: StudioBg3dSkpStage): number {
  return STUDIO_BG3D_SKP_STAGES.indexOf(stage) + 1;
}

export const STUDIO_BG3D_SKP_FAILURE_CODES = [
  "skp-converter-unavailable",
  "skp-parse-failed",
  "skp-too-large",
  "skp-timeout",
  "skp-unsupported-version",
  "skp-empty-scene",
  "skp-cancelled",
] as const;

export type StudioBg3dSkpFailureCode = (typeof STUDIO_BG3D_SKP_FAILURE_CODES)[number];

const FAILURE_CODE_SET: ReadonlySet<string> = new Set(STUDIO_BG3D_SKP_FAILURE_CODES);

export function isStudioBg3dSkpFailureCode(value: unknown): value is StudioBg3dSkpFailureCode {
  return typeof value === "string" && FAILURE_CODE_SET.has(value);
}

/** 같은 코드 안에서 원인을 구분하는 진단 값. 사용자 문구가 아니라 로그·테스트용이다. */
const FAILURE_REASONS = [
  "aborted",
  "converter-api-mismatch",
  "invalid-geometry",
  "invalid-output",
  "invalid-signature",
  "loader-failed",
  "main-thread-limit",
  "model-data-limit",
  "no-geometry",
  "out-of-memory",
  "parse-error",
  "source-limit",
  "timeout",
  "unsupported-version",
  "worker-failed",
  "worker-protocol",
] as const;

export type StudioBg3dSkpFailureReason = (typeof FAILURE_REASONS)[number];

export function isStudioBg3dSkpFailureReason(value: unknown): value is StudioBg3dSkpFailureReason {
  return typeof value === "string" && (FAILURE_REASONS as readonly string[]).includes(value);
}

export interface StudioBg3dSkpFailureOptions {
  readonly reason?: StudioBg3dSkpFailureReason;
  /** 사용자에게 보여도 안전한 숫자·짧은 문자열만 담는다. */
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
  /** 빈 장면처럼 보고서를 만들 수 있었던 실패에서 원인 설명용으로 붙인다(구조는 보고서 계약). */
  readonly report?: unknown;
  readonly cause?: unknown;
}

/** 변환 단계의 모든 실패. code 는 가져오기 오류 코드와 같은 문자열이라 그대로 매핑된다. */
export class StudioBg3dSkpConversionError extends Error {
  readonly code: StudioBg3dSkpFailureCode;
  readonly reason: StudioBg3dSkpFailureReason | undefined;
  readonly detail: Readonly<Record<string, string | number | boolean>> | undefined;
  readonly report: unknown;

  constructor(
    code: StudioBg3dSkpFailureCode,
    message: string,
    options: StudioBg3dSkpFailureOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = code === "skp-cancelled" ? "AbortError" : "StudioBg3dSkpConversionError";
    this.code = code;
    this.reason = options.reason;
    this.detail = options.detail;
    this.report = options.report;
  }
}

/** 변환기(openskp) 청크를 불러오거나 실행하지 못했다. 기존 공개 이름을 유지한다. */
export class StudioBg3dSkpConverterUnavailableError extends StudioBg3dSkpConversionError {
  constructor(
    message = "openskp 패키지를 불러오지 못해 .skp 변환을 사용할 수 없습니다.",
    options: StudioBg3dSkpFailureOptions = {},
  ) {
    super("skp-converter-unavailable", message, { reason: "loader-failed", ...options });
    this.name = "StudioBg3dSkpConverterUnavailableError";
  }
}

/** 파서가 파일을 거부했거나 변환 결과가 올바르지 않다. 기존 공개 이름을 유지한다. */
export class StudioBg3dSkpParseError extends StudioBg3dSkpConversionError {
  constructor(
    message = ".skp 파일 구조를 해석하지 못했습니다.",
    options: StudioBg3dSkpFailureOptions = {},
  ) {
    super("skp-parse-failed", message, { reason: "parse-error", ...options });
    this.name = "StudioBg3dSkpParseError";
  }
}

/**
 * 코드에 맞는 오류 클래스로 만든다. 기존 공개 이름(StudioBg3dSkpParseError, StudioBg3dSkpConverterUnavailableError)을
 * 쓰는 호출자의 instanceof 판정이 Worker 경계를 넘어서도 유지되도록 Worker 응답을 되살릴 때 쓴다.
 */
export function createStudioBg3dSkpConversionError(
  code: StudioBg3dSkpFailureCode,
  message: string,
  options: StudioBg3dSkpFailureOptions = {},
): StudioBg3dSkpConversionError {
  if (code === "skp-parse-failed") return new StudioBg3dSkpParseError(message, options);
  if (code === "skp-converter-unavailable") return new StudioBg3dSkpConverterUnavailableError(message, options);
  return new StudioBg3dSkpConversionError(code, message, options);
}
