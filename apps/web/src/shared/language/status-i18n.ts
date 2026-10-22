/**
 * 로딩·실패·에러 문자열의 키 기반 강제 — 정적 탐지기.
 *
 * 배경 (inclusion 발견 1(a)): 로딩·실패·에러 문구가 호출부에 한국어로
 * 하드코딩되면 en 사용자의 동선이 가장 도움이 필요한 순간에 끊긴다.
 * 신규 표면은 이 문구들을 (1) useT() 키, (2) useBilingual 쌍,
 * (3) defineBilingualText 등록 중 하나로만 표시해야 하며, 한국어 원문은
 * 키의 폴백 인자나 *_KEYS 맵과 짝을 이루는 폴백 데이터로만 남을 수 있다.
 *
 * 이 모듈은 순수 함수만 제공한다. 실제 차단은
 * domains/creator/creator-status-i18n-contract.test.ts (creator-a11y-contract
 * 패턴 확장)가 등록 표면 파일들에 이 탐지기를 적용해 수행한다.
 *
 * T0 확장 (AI 에러 문구 이관 설계, 2026-10-22): 비UI 생산자 채널도 잡는다 —
 * `throw new …Error("…")`·`new …Error("…")` 리터럴, Result `{ error: "…" }`
 * 필드 리터럴, `failure("…")` 호출 리터럴. 이 채널들은 검증·입력 안내처럼
 * 실패 키워드가 없는 문구도 사용자 화면에 그대로 닿으므로, 한글 리터럴은
 * 키워드와 무관하게 위반으로 본다(kind는 failure로 고정). 영문 리터럴은
 * 기존과 같이 로딩·실패 키워드가 있을 때만 잡는다 — `new Error("The …
 * operation was aborted.")` 같은 이름 판정용 내부 불변식까지 잡으면
 * 도달하지 않는 문구에 소음이 되기 때문이다. 동적 패스스루(`error:
 * error.message`·`error: parsed.error`)는 리터럴이 아니라 위반이 아니다.
 * 생산자 채널 검사는 `includeProducerChannels` 옵션을 켠 호출에서만 돈다.
 * 기본값이 꺼짐인 이유: 기존 가드 파일군(creator-status 계약)에는 호스트
 * throw 9건 등 타 트랜치 소유의 생산자 채널 리터럴이 아직 남아 있어,
 * 기본으로 켜면 그 트랜치들이 이관하기 전에 서 있는 계약이 깨진다.
 * AI 생산자 파일군의 가드는 전용 배치 테스트가 옵션을 켜고 적용한다.
 */

export type StatusStringKind = "loading" | "failure";

export interface StatusI18nViolation {
  /** 1-based 줄 번호 */
  readonly line: number;
  readonly kind: StatusStringKind;
  /** 어떤 표시 위치 규칙에 걸렸는지 */
  readonly rule: string;
  /** 위반 문자열 (진단용 발췌) */
  readonly snippet: string;
}

/** 로딩 계열 상태 문구 — 진행 중임을 알리는 표현만 잡는다. ("불러오기" 같은 동사형 버튼 라벨은 제외) */
export const LOADING_TEXT_PATTERN =
  /(?:로딩|불러오는 중|불러오기 중|가져오는 중|읽어오는 중|여는 중|로드 중|처리 중|저장 중|전송 중|업로드 중|다운로드 중)/;
export const LOADING_TEXT_PATTERN_EN = /\bloading\b/i;

/** 실패·에러 계열 상태 문구 */
export const FAILURE_TEXT_PATTERN =
  /(?:실패|오류|에러|못했|못했습니다|불러오지 못|가져오지 못|저장하지 못|다시 시도|문제가 발생|문제가 생겼|읽을 수 없|열 수 없|찾을 수 없)/;
export const FAILURE_TEXT_PATTERN_EN =
  /\b(?:failed|failure|error|went wrong|could not|couldn't|unable to)\b/i;

export function statusStringKind(text: string): StatusStringKind | null {
  if (FAILURE_TEXT_PATTERN.test(text) || FAILURE_TEXT_PATTERN_EN.test(text)) return "failure";
  if (LOADING_TEXT_PATTERN.test(text) || LOADING_TEXT_PATTERN_EN.test(text)) return "loading";
  return null;
}

/** useT() 키 호출 — t("a.b.c", "한국어 폴백") 형태. 폴백 인자는 허용된다. */
const KEY_CALL_PATTERN = /\bt\(\s*"[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){2,}"/;
/** useBilingual 쌍 호출 — t("한국어", "English") 형태. */
const BILINGUAL_PAIR_PATTERN = /\bt\(\s*"[^"]*[가-힣][^"]*"\s*,\s*"[^"]*[A-Za-z][^"]*"\s*\)/;
/** 정적 쌍 등록 호출 — 이 줄의 문자열은 키로 등록되는 원문이다. */
const REGISTER_CALL_PATTERN = /(?:defineBilingualText|translateCurrentStaticSourceText)\s*\(/;
/** AI 에러 헬퍼 호출 — aiErrorText("studio.aiError.…", …, "한국어 폴백") 형태. 폴백 인자는 허용된다. */
const AI_ERROR_CALL_PATTERN = /\baiErrorText\s*\(\s*"[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){2,}"/;
/** 파일이 *_KEYS 맵(점 표기 키)으로 폴백 데이터 맵과 짝을 이루는지 */
const KEY_MAP_PATTERN = /[A-Z0-9_]*_KEYS\s*(?::[^=]*)?=\s*\{/;
const DOTTED_KEY_LITERAL_PATTERN = /"[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){2,}"/;

function hasPairedKeyMap(source: string): boolean {
  return KEY_MAP_PATTERN.test(source) && DOTTED_KEY_LITERAL_PATTERN.test(source);
}

function isAllowedLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return true;
  if (line.includes("i18n-exempt")) return true;
  if (line.includes("console.")) return true;
  if (KEY_CALL_PATTERN.test(line)) return true;
  if (BILINGUAL_PAIR_PATTERN.test(line)) return true;
  if (REGISTER_CALL_PATTERN.test(line)) return true;
  if (AI_ERROR_CALL_PATTERN.test(line)) return true;
  return false;
}

/** 표시 위치로 간주하는 prop/필드 이름들 (loadingLabel은 A4 2차 이관에서 추가) */
const DISPLAY_PROP_PATTERN =
  /(?:loadingLabel|label|aria-label|title|placeholder|message|description|heading|errorText|emptyText)\s*(?:=|:)\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\})/g;
/** JSX 텍스트 노드 */
const JSX_TEXT_PATTERN = />\s*([^<>{}]+?)\s*</g;
/** 상태 상수 이름 (REVIEWS_FETCH_ERROR 같은 패턴) */
const NAMED_STATUS_CONST_PATTERN =
  /\bconst\s+[A-Za-z0-9_]*(?:ERROR|FAIL|LOADING)[A-Za-z0-9_]*\s*(?::[^=]*)?=\s*"([^"]*)"/;
/** 객체 리터럴 항목 값 */
const OBJECT_ENTRY_PATTERN = /:\s*"([^"]*)"/g;
/** 에러 채널 호출 */
const ERROR_CHANNEL_PATTERN =
  /(?:setError|setLoadError|setFailureMessage|notifyError|showError)\s*\(\s*"([^"]*)"/g;
const HANGUL_LITERAL_PATTERN = /"([^"]*[가-힣][^"]*)"/g;
const HANGUL_PRESENT_PATTERN = /[가-힣]/;
/** throw 리터럴 — throw new XError("…"|`…`) */
const THROW_LITERAL_PATTERNS = [
  /throw\s+new\s+[\w$.]*\(\s*"([^"]*)"/g,
  /throw\s+new\s+[\w$.]*\(\s*'([^']*)'/g,
  /throw\s+new\s+[\w$.]*\(\s*`([^`]*)`/g,
] as const;
/** Error 생성자 리터럴 — const e = new XError("…") (throw 없는 생성·reject 전달 포함) */
const ERROR_CONSTRUCTOR_PATTERNS = [
  /(?<!throw\s)new\s+[\w$.]*Error\s*\(\s*"([^"]*)"/g,
  /(?<!throw\s)new\s+[\w$.]*Error\s*\(\s*'([^']*)'/g,
  /(?<!throw\s)new\s+[\w$.]*Error\s*\(\s*`([^`]*)`/g,
] as const;
/** Result error 필드 리터럴 — error: "…" / error: `…` (타입 표기 error: string 은 리터럴이 없어 제외) */
const RESULT_ERROR_PATTERNS = [
  /(?<![\w$.])error\s*:\s*"([^"]*)"/g,
  /(?<![\w$.])error\s*:\s*'([^']*)'/g,
  /(?<![\w$.])error\s*:\s*`([^`]*)`/g,
] as const;
/** failure() 헬퍼 리터럴 — studio-lora-fal.failure("…") 채널. 메시지는 1번째 또는 (코드 다음) 2번째 인자다. */
const FAILURE_CALL_PATTERNS = [
  /\bfailure\s*\(\s*"([^"]*)"\s*,\s*"([^"]*)"/g,
  /\bfailure\s*\(\s*"([^"]*)"\s*,\s*`([^`]*)`/g,
  /\bfailure\s*\(\s*"([^"]*)"/g,
  /\bfailure\s*\(\s*'([^']*)'/g,
  /\bfailure\s*\(\s*`([^`]*)`/g,
] as const;

export interface ScanHardcodedStatusStringsOptions {
  /** throw·Result error·failure 생산자 채널까지 검사한다 (T0 확장, 기본 꺼짐 — 파일 머리말 참조). */
  readonly includeProducerChannels?: boolean;
}

export function scanHardcodedStatusStrings(
  source: string,
  options?: ScanHardcodedStatusStringsOptions,
): StatusI18nViolation[] {
  const includeProducerChannels = options?.includeProducerChannels === true;
  const violations: StatusI18nViolation[] = [];
  const seen = new Set<string>();
  const pairedKeyMap = hasPairedKeyMap(source);

  const push = (line: number, rule: string, text: string) => {
    const kind = statusStringKind(text);
    if (!kind) return;
    const key = `${line}:${rule}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ line, kind, rule, snippet: text });
  };

  // 생산자 채널(throw·Result error·failure) 전용 — 한글 리터럴은 키워드 없이도
  // 위반이고, throw/생성자 규칙이 같은 리터럴을 겹쳐 잡지 않게 줄+문구로 중복 제거한다.
  const channelSeen = new Set<string>();
  const pushChannel = (line: number, rule: string, text: string) => {
    if (!text) return;
    const kind = statusStringKind(text) ?? (HANGUL_PRESENT_PATTERN.test(text) ? "failure" : null);
    if (!kind) return;
    const dedupeKey = `${line}:${text}`;
    if (channelSeen.has(dedupeKey)) return;
    channelSeen.add(dedupeKey);
    const key = `${line}:${rule}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ line, kind, rule, snippet: text });
  };

  let namedMapName: string | null = null;
  let namedMapDepth = 0;

  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNo = index + 1;

    // 객체 맵 컨텍스트 추적 (const NAME = { ... } 의 중괄호 깊이)
    const mapStart = line.match(/\bconst\s+([A-Za-z0-9_]+)\s*(?::[^=]*)?=\s*\{/);
    if (mapStart && namedMapName === null) {
      namedMapName = mapStart[1] ?? null;
      namedMapDepth = 0;
    }
    if (namedMapName !== null) {
      namedMapDepth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    }

    if (!isAllowedLine(line)) {
      for (const match of line.matchAll(DISPLAY_PROP_PATTERN)) {
        push(lineNo, "display-prop-literal", match[1] ?? match[2] ?? match[3] ?? "");
      }
      for (const match of line.matchAll(JSX_TEXT_PATTERN)) {
        push(lineNo, "jsx-text", (match[1] ?? "").trim());
      }
      for (const match of line.matchAll(ERROR_CHANNEL_PATTERN)) {
        push(lineNo, "error-channel-call", match[1] ?? "");
      }
      if (includeProducerChannels) {
        for (const pattern of THROW_LITERAL_PATTERNS) {
          for (const match of line.matchAll(pattern)) {
            pushChannel(lineNo, "throw-literal", match[1] ?? "");
          }
        }
        for (const pattern of ERROR_CONSTRUCTOR_PATTERNS) {
          for (const match of line.matchAll(pattern)) {
            pushChannel(lineNo, "error-constructor-literal", match[1] ?? "");
          }
        }
        for (const pattern of RESULT_ERROR_PATTERNS) {
          for (const match of line.matchAll(pattern)) {
            pushChannel(lineNo, "result-error-literal", match[1] ?? "");
          }
        }
        for (const pattern of FAILURE_CALL_PATTERNS) {
          for (const match of line.matchAll(pattern)) {
            // 2인자형(코드, 메시지)은 메시지인 마지막 캡처를, 1인자형은 첫 캡처를 쓴다.
            pushChannel(lineNo, "failure-call-literal", match[2] ?? match[1] ?? "");
          }
        }
      }
      const namedConst = line.match(NAMED_STATUS_CONST_PATTERN);
      if (namedConst) push(lineNo, "named-status-const", namedConst[1] ?? "");
      if (line.includes("useApiResource")) {
        for (const match of line.matchAll(HANGUL_LITERAL_PATTERN)) {
          push(lineNo, "api-error-literal", match[1] ?? "");
        }
      }
      // 상태 이름 맵의 항목 값 — 단, *_KEYS 맵과 짝을 이룬 폴백 데이터 맵은 허용한다.
      if (
        namedMapName !== null &&
        /(?:ERROR|FAIL|LOADING)/.test(namedMapName) &&
        !pairedKeyMap &&
        !mapStart
      ) {
        for (const match of line.matchAll(OBJECT_ENTRY_PATTERN)) {
          push(lineNo, "named-status-map-entry", match[1] ?? "");
        }
      }
    }

    if (namedMapName !== null && namedMapDepth <= 0) namedMapName = null;
  }
  return violations;
}
