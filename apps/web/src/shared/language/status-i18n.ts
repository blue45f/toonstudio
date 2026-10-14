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
  return false;
}

/** 표시 위치로 간주하는 prop/필드 이름들 */
const DISPLAY_PROP_PATTERN =
  /(?:label|aria-label|title|placeholder|message|description|heading|errorText|emptyText)\s*(?:=|:)\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\})/g;
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

export function scanHardcodedStatusStrings(source: string): StatusI18nViolation[] {
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
