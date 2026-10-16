/**
 * 독자 피드백 파일 입출력 — 악의적일 수 있는 JSON을 안전하게 읽고, 응답 파일을 만들어 내보낸다.
 *
 * 읽기 순서(앞 단계에서 걸러질수록 뒤 단계의 비용이 들지 않는다):
 *   크기 → 중첩 깊이(문자열 검사) → JSON.parse → 금지 키·노드 수 검사 → kind/version 확인 → zod strict 검증
 * 이 모듈은 네트워크·저장소를 쓰지 않는다. 파일 읽기는 호출자가 넘긴 File(또는 같은 모양의 객체)만 사용한다.
 */
import {
  LEGACY_BETA_FEEDBACK_KIND,
  READER_FEEDBACK_KIND,
  READER_FEEDBACK_LIMITS,
  READER_FEEDBACK_VERSION,
  readerFeedbackFileSchema,
  type ReaderFeedbackFile,
  type ReaderFeedbackResponse,
} from "./reader-feedback-schema";

const LIMITS = READER_FEEDBACK_LIMITS;

export type ReaderFeedbackParseErrorCode =
  | "empty"
  | "too-large"
  | "too-deep"
  | "not-json"
  | "forbidden-key"
  | "too-many-nodes"
  | "not-object"
  | "legacy-beta-feedback"
  | "wrong-kind"
  | "newer-version"
  | "unsupported-version"
  | "invalid";

/** 검증 실패 위치. path 는 스키마가 아는 키와 배열 번호만 담고 입력의 키 이름은 되풀이하지 않는다. */
export interface ReaderFeedbackIssue {
  readonly path: string;
  readonly code: string;
}

export type ReaderFeedbackParseResult =
  | { readonly ok: true; readonly file: ReaderFeedbackFile }
  | { readonly ok: false; readonly code: ReaderFeedbackParseErrorCode; readonly issues: readonly ReaderFeedbackIssue[] };

function fail(code: ReaderFeedbackParseErrorCode, issues: readonly ReaderFeedbackIssue[] = []): ReaderFeedbackParseResult {
  return { ok: false, code, issues };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * JSON 텍스트의 괄호 중첩이 한도를 넘는지 본다. 문자열 안의 괄호와 이스케이프는 무시한다.
 * JSON.parse 와 이후 순회가 아주 깊은 구조에서 호출 스택을 쓰기 전에 거절하기 위한 값싼 선검사다.
 */
export function exceedsJsonDepth(text: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (inString) {
      if (escaped) escaped = false;
      else if (code === 0x5c) escaped = true;
      else if (code === 0x22) inString = false;
    } else if (code === 0x22) {
      inString = true;
    } else if (code === 0x5b || code === 0x7b) {
      depth += 1;
      if (depth > maxDepth) return true;
    } else if ((code === 0x5d || code === 0x7d) && depth > 0) {
      depth -= 1;
    }
  }
  return false;
}

/** 프로토타입 오염에 쓰이는 키. 이 이름의 키가 하나라도 있으면 파일 전체를 받지 않는다. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** 반복문으로 순회하므로 재귀 깊이와 무관하다. 노드 수 상한은 데이터 부풀리기를 막는다. */
export function inspectJsonValue(root: unknown, maxNodes: number): "ok" | "forbidden-key" | "too-many-nodes" {
  const stack: unknown[] = [root];
  let visited = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    visited += 1;
    if (visited > maxNodes) return "too-many-nodes";
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
    } else if (isRecord(current)) {
      for (const key of Object.keys(current)) {
        if (FORBIDDEN_KEYS.has(key)) return "forbidden-key";
        stack.push(current[key]);
      }
    }
  }
  return "ok";
}

const SAFE_PATH_KEY = /^[A-Za-z][A-Za-z0-9]{0,23}$/u;

function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.map((part) => {
    if (typeof part === "number") return `[${part}]`;
    return typeof part === "string" && SAFE_PATH_KEY.test(part) ? `.${part}` : ".?";
  }).join("").replace(/^\./u, "");
}

/** 한 파일 내용(문자열)을 검증된 응답 파일로 바꾼다. 어떤 입력에도 예외를 던지지 않는다. */
export function parseReaderFeedbackText(input: string): ReaderFeedbackParseResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.trim() === "") return fail("empty");
  if (text.length > LIMITS.maxFileBytes) return fail("too-large");
  if (exceedsJsonDepth(text, LIMITS.maxJsonDepth)) return fail("too-deep");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("not-json");
  }
  const inspected = inspectJsonValue(raw, LIMITS.maxJsonNodes);
  if (inspected !== "ok") return fail(inspected);
  if (!isRecord(raw)) return fail("not-object");
  if (raw.kind === LEGACY_BETA_FEEDBACK_KIND) return fail("legacy-beta-feedback");
  if (raw.kind !== READER_FEEDBACK_KIND) return fail("wrong-kind");
  if (typeof raw.version === "number" && raw.version > READER_FEEDBACK_VERSION) return fail("newer-version");
  if (raw.version !== READER_FEEDBACK_VERSION) return fail("unsupported-version");
  const parsed = readerFeedbackFileSchema.safeParse(raw);
  if (parsed.success) return { ok: true, file: parsed.data };
  return fail("invalid", parsed.error.issues.slice(0, 5).map((issue) => ({ path: formatIssuePath(issue.path), code: issue.code })));
}

/** 읽기에 필요한 File 의 최소 모양. 테스트에서는 같은 모양의 객체를 넘긴다. */
export interface ReaderFeedbackFileLike {
  readonly size: number;
  text(): Promise<string>;
}

export type ReaderFeedbackReadResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: "empty" | "too-large" | "read-failed" };

/** 크기를 먼저 확인한 뒤에만 내용을 읽는다. 읽기 실패는 다시 시도할 수 있는 오류로 따로 알린다. */
export async function readReaderFeedbackFile(file: ReaderFeedbackFileLike): Promise<ReaderFeedbackReadResult> {
  if (!(file.size > 0)) return { ok: false, code: "empty" };
  if (file.size > LIMITS.maxFileBytes) return { ok: false, code: "too-large" };
  try {
    return { ok: true, text: await file.text() };
  } catch {
    return { ok: false, code: "read-failed" };
  }
}

/** 검증을 통과한 응답 하나를 내보낼 파일로 감싼다. 스키마를 다시 통과하므로 내보낸 파일은 항상 다시 가져올 수 있다. */
export function createReaderFeedbackFile(response: ReaderFeedbackResponse, exportedAt: string): ReaderFeedbackFile {
  return readerFeedbackFileSchema.parse({
    kind: READER_FEEDBACK_KIND,
    version: READER_FEEDBACK_VERSION,
    exportedAt,
    responses: [response],
  });
}

export function serializeReaderFeedbackFile(file: ReaderFeedbackFile): string {
  return JSON.stringify(file, null, 2);
}

/** 사람이 파일 목록에서 구분할 수 있는 영문·숫자 이름. 제목은 담지 않아 파일 이름으로 내용이 새지 않는다. */
export function readerFeedbackFilename(response: ReaderFeedbackResponse): string {
  const episode = response.target.episode === null ? "" : `ep${response.target.episode}-`;
  const short = response.id.replace(/[^A-Za-z0-9]/gu, "").slice(0, 8) || "response";
  return `toonstudio-reader-feedback-${episode}${short}.json`;
}

/** navigator 중 공유에 쓰는 부분. 기능이 없는 브라우저는 속성이 비어 있다. */
export interface ReaderFeedbackShareNavigator {
  readonly share?: (data: ShareData) => Promise<void>;
  readonly canShare?: (data?: ShareData) => boolean;
}

export type ReaderFeedbackShareOutcome = "shared" | "cancelled" | "unsupported" | "failed";

function buildShareData(json: string, filename: string, title: string): ShareData {
  return { files: [new File([json], filename, { type: "application/json" })], title };
}

/** 파일을 공유할 수 있는 브라우저인지. 지원하지 않으면 화면에서 공유 버튼을 감춘다. */
export function canShareReaderFeedback(navigatorLike: ReaderFeedbackShareNavigator | undefined, filename: string): boolean {
  if (!navigatorLike || typeof navigatorLike.share !== "function" || typeof navigatorLike.canShare !== "function") return false;
  try {
    return navigatorLike.canShare(buildShareData("{}", filename, "ToonStudio"));
  } catch {
    return false;
  }
}

/** 공유 시트를 연다. 사용자가 닫은 것(AbortError)은 실패로 알리지 않는다. */
export async function shareReaderFeedback(
  navigatorLike: ReaderFeedbackShareNavigator | undefined,
  json: string,
  filename: string,
  title: string,
): Promise<ReaderFeedbackShareOutcome> {
  if (!navigatorLike || typeof navigatorLike.share !== "function") return "unsupported";
  try {
    await navigatorLike.share(buildShareData(json, filename, title));
    return "shared";
  } catch (cause) {
    return cause instanceof DOMException && cause.name === "AbortError" ? "cancelled" : "failed";
  }
}

export type ReaderFeedbackCopyOutcome = "copied" | "unsupported" | "failed";

/** 클립보드에 JSON 글을 복사한다. 권한이 없거나 지원하지 않으면 결과로 알려 화면이 대안을 안내하게 한다. */
export async function copyReaderFeedback(
  clipboard: { readonly writeText?: (text: string) => Promise<void> } | undefined,
  json: string,
): Promise<ReaderFeedbackCopyOutcome> {
  if (!clipboard || typeof clipboard.writeText !== "function") return "unsupported";
  try {
    await clipboard.writeText(json);
    return "copied";
  } catch {
    return "failed";
  }
}
