/**
 * creator-bundle-pack-rights-form.mjs
 *
 * 권리 원장 값의 형식 점검 모음 — 문자열·경로·날짜·주소·보관 위치·라이선스 이름. 전부 순수 함수이고 파일을 읽지 않는다.
 * 이 점검들은 진위 판정이 아니라 "아무 값이나 채운" 항목과 복사·붙여넣기 잔여물을 거르는 형식·일관성 검사다
 * (그럴듯한 문장으로 쓴 거짓 값은 형식만으로 가려낼 수 없다). 거부 사유는 소유자가 고칠 수 있게 구체적인 문장으로 돌려준다.
 *
 * 소비자: creator-bundle-pack-rights.mjs(원장 검증·서빙 판정), creator-bundle-pack-rights-library.mjs(실물 재대조).
 */

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * grant.licenseName에 웹 로더(bg3d-model-library.ts의 safeText)가 적용하는 규칙. 로더는 이 패턴에 걸리거나 160자를
 * 넘는 이름을 조용히 버리고 권리를 unknown·비상업으로 낮추므로, 게이트가 먼저 같은 규칙으로 거른다.
 * 두 패턴과 상한은 웹 소스와 같아야 하며 테스트가 소스 텍스트와 대조한다.
 */
export const WEB_RIGHTS_TEXT_MAX_LENGTH = 160;
export const WEB_EXTERNAL_REFERENCE_PATTERN = /(?:\b(?:blob|data|file|https?):|:\/\/|\bwww\.)/iu;
export const WEB_SENSITIVE_REFERENCE_PATTERN =
  /(?:\b(?:api[-_ ]?key|access[-_ ]?token|secret|password)\b|(?:^|\s)sk-[A-Za-z0-9_-]{8,})/iu;

/**
 * 보관 위치(ref)에서 낱말 하나만 있어도 자리표시로 보는 단어. 진짜 보관 위치에는 이 낱말이 들어갈 이유가 없다.
 * `null`·`undefined`는 값을 문자열로 바꾸다 새어 나온 흔적이다.
 */
const STRONG_PLACEHOLDER_TOKENS = Object.freeze(new Set([
  "tbd", "tba", "tbc", "todo", "fixme", "placeholder", "lorem", "ipsum", "dummy", "xxx", "yyy", "zzz", "null", "undefined",
]));
/**
 * 낱말이 전부 이 목록에 들 때만 자리표시로 보는 약한 단어(영문·한글). 문자열을 문자·숫자 단위 낱말로 쪼갠 뒤 낱말이
 * 전부 여기 들면 거부한다 — 진짜 보관 위치는 폴더·파일명·번호 같은 다른 낱말을 하나는 가진다. 확장자 낱말(REF_EXTENSIONS)은
 * 먼저 뗀다. "n/a"는 n·a로, "http://"는 http로 쪼개지므로 함께 넣는다.
 */
const WEAK_PLACEHOLDER_TOKENS = Object.freeze(new Set([
  "wip", "n", "a", "na", "none", "unknown", "pending", "later", "soon", "test", "sample", "example", "foo", "bar", "baz",
  "http", "https", "ftp", "file", "to", "be", "determined", "not", "available", "applicable", "yet", "will", "upload",
  "uploaded", "add", "added", "here", "goes", "no", "need", "needed", "attach", "attached", "insert", "fill", "coming",
  "submit", "submitted", "provide", "provided", "in", "progress", "the", "an", "is", "are",
  "추후", "제출", "예정", "미정", "해당", "없음", "미확인", "임시", "예시", "샘플", "테스트", "나중", "확인", "필요",
  "준비", "중", "대기",
]));
/** 파일 확장자 낱말: `todo.pdf`·`TBD.eml`처럼 확장자만 붙여 자리표시 판정을 피하지 못하게 먼저 뗀다. */
const REF_EXTENSIONS = Object.freeze(new Set([
  "pdf", "png", "jpg", "jpeg", "gif", "webp", "heic", "eml", "msg", "txt", "md", "html", "htm", "mht", "doc", "docx",
  "odt", "zip", "csv", "json",
]));
/** 형태소 분석 없이 어간만 보는 한글 자리표시 문구(`준비중입니다`·`추후 제출할 예정`처럼 조사가 붙어도 걸리게). */
const KOREAN_PLACEHOLDER_STEM = /(?:추후|미정|미확인|나중에|없음|(?:준비|확인|대기)\s*중|제출\s*예정|해당\s*사항)/u;
/** 값을 문자열로 바꾸다 새어 나온 흔적(`[object Object]`)과 예약 도메인 `example.com` 자체(하위 도메인은 제외). */
const PLACEHOLDER_ARTIFACT = /\[object [a-z]+\]|^(?:https?:\/\/)?(?:www\.)?example\.(?:com|org|net)(?:[/?#]|$)/u;
const MIN_REF_LENGTH = 6;
const MIN_REF_DISTINCT_CHARACTERS = 4;
/** 한글·한자·가나는 글자 하나의 정보량이 커서 길이를 두 배로 센다 — `영수증 파일`처럼 짧아도 실제 위치일 수 있다. */
const WIDE_SCRIPT_CHARACTER = /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** 가장 앞선 시간대(UTC+14)의 오늘까지는 허용한다 — 어느 나라에서 적었든 정상 날짜가 미래로 오판되지 않게. */
const EVIDENCE_DATE_SLACK_MS = 14 * 60 * 60 * 1000;
/** itch.io 서비스 시작(2013) 이전 날짜는 증빙일 수 없다. */
const EVIDENCE_DATE_FLOOR = "2013-01-01";
/**
 * 화면에 보이지 않거나 빈 칸을 흉내 내는 문자: 제어·서식(영폭 공백 등)·구분(공백류)·결합/변이 표시(변이 선택자 등)·
 * 사설 영역·미할당·짝 없는 서로게이트와 한글 채움 문자. 이 문자만으로 이뤄진 값은 비었다고 본다.
 */
const INVISIBLE_OR_FILLER = /[\p{Cc}\p{Cf}\p{Z}\p{M}\p{Co}\p{Cn}\p{Cs}\u115F\u1160\u2800\u3164\uFFA0]/gu;
/** 값에 들어 있으면 거부하는 문자: 제어·서식 문자와 줄·문단 구분자(U+2028·U+2029). */
const HIDDEN_CHARACTER = /[\p{Cc}\p{Cf}\u2028\u2029]/u;
const ITCH_HANDLE = /^[a-z0-9][a-z0-9_-]*$/u;
/** 제작자 페이지가 아닌 itch.io 서비스 하위 도메인. */
const ITCH_RESERVED_SUBDOMAINS = Object.freeze(new Set([
  "www", "docs", "api", "static", "img", "img2", "img3", "help", "blog", "itch", "cdn", "assets", "dl", "download", "downloads",
]));
const MAX_URL_LENGTH = 400;

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 형 변환 없이 64자리 소문자 16진수 문자열인지. 배열 같은 값이 문자열로 강제 변환돼 통과하지 못하게 한다. */
export function isSha256(value) {
  return typeof value === "string" && SHA256_HEX.test(value);
}

/** 보이지 않는 문자와 공백을 걷어낸 글자만 남긴다. */
export function visibleText(value) {
  return typeof value === "string" ? value.replace(INVISIBLE_OR_FILLER, "") : "";
}

function codePointLabel(character) {
  return `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * 값이 `nonEmptyText`를 통과하지 못하는 이유(소유자가 고칠 수 있게 구체적으로). 통과하면 null.
 * 영폭 공백·한글 채움 문자·변이 선택자만으로 이뤄진 값은 비었다고 보고, 제어 문자(줄바꿈 포함)와 서식 문자
 * (영폭 공백·방향 지정 문자 등)·줄/문단 구분자는 거부한다 — 웹 로더가 제어 문자를 거부하므로 한 줄이 theme-packs
 * 전체를 깨뜨릴 수 있고, 방향 지정 문자는 화면에서 글자 순서를 속인다.
 */
export function textProblem(value, maximum = 600) {
  if (typeof value !== "string") return "문자열이 아닙니다";
  if (value.length > maximum) return `${maximum}자를 넘습니다`;
  const hidden = HIDDEN_CHARACTER.exec(value);
  if (hidden) {
    return `보이지 않는 제어·서식 문자(${codePointLabel(hidden[0])})가 ${hidden.index}번째에 있습니다 — 복사하면서 섞인 문자나 앞뒤 줄바꿈이면 지워 주세요`;
  }
  if (visibleText(value).length === 0) return "보이는 글자가 없습니다";
  return null;
}

export function nonEmptyText(value, maximum = 600) {
  return textProblem(value, maximum) === null;
}

/**
 * 라이브러리 루트 아래의 상대 경로로 쓸 수 있는지 점검한 이유. 문제가 없으면 null.
 * 빈·`.`·`..` 조각, 역슬래시, 선행 `/`, 드라이브 문자를 거부한다 — 이런 조각은 `libraryPack`과 경로의 일관성 규칙을
 * 속이고(`a/../b`) 검증 CLI가 라이브러리 밖을 읽게 한다. 배포 플래너의 에셋 경로 검사(assetPathCheck)와 같은 규칙이다.
 */
export function relativePathProblem(value, maximum = 400) {
  const textIssue = textProblem(value, maximum);
  if (textIssue) return textIssue;
  if (value.includes("\\")) return "역슬래시가 있습니다 (슬래시로 적어 주세요)";
  if (value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return "절대 경로입니다";
  if (value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "빈 조각·`.`·`..` 조각이 있습니다";
  }
  return null;
}

/** 달력에 실제로 있는 YYYY-MM-DD인지. 2026-02-31처럼 형식만 맞는 날짜는 거부한다. */
export function isCalendarDate(value) {
  const match = typeof value === "string" ? ISO_DATE.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** 증빙 날짜가 넘을 수 없는 상한(YYYY-MM-DD). `now`는 테스트 주입용 Date다 — 유효한 Date가 아니면 조용히 넘기지 않고 던진다. */
export function latestEvidenceDate(now) {
  if (now !== undefined && !(now instanceof Date && !Number.isNaN(now.getTime()))) {
    throw new TypeError("now는 유효한 Date여야 합니다.");
  }
  return new Date((now ?? new Date()).getTime() + EVIDENCE_DATE_SLACK_MS).toISOString().slice(0, 10);
}

/** 날짜 필드 점검. 문제가 없으면 null. */
export function dateProblem(where, field, value, today) {
  if (!isCalendarDate(value)) return `${where}: ${field}(YYYY-MM-DD)이 없거나 달력에 없는 날짜입니다.`;
  if (value > today) return `${where}: ${field}가 미래 날짜입니다 (${value}).`;
  if (value < EVIDENCE_DATE_FLOOR) return `${where}: ${field}가 ${EVIDENCE_DATE_FLOOR} 이전입니다 (${value}).`;
  return null;
}

/**
 * 보관 위치(ref)로 쓸 수 없는 이유. 문제가 없으면 null.
 * 보이는 글자가 너무 적거나 단조롭거나 같은 조각의 반복이거나 글자가 하나도 없는 값, 자리표시 낱말(영문·한글)이 든 값을
 * 거부한다. 진위 판정이 아니라 "아무 값이나 채운" 항목을 거르는 검사다 — 그럴듯한 문장으로 쓴 거짓 값("no receipt")은
 * 형식만으로 가려낼 수 없다. 숫자만 있는 값은 번호가 보관 위치를 말해 주지 않으므로 파일명·폴더 이름을 함께 적게 한다.
 */
export function refProblem(value) {
  const textIssue = textProblem(value, 400);
  if (textIssue) return textIssue;
  const characters = Array.from(visibleText(value));
  const visible = characters.join("");
  const width = characters.reduce((sum, character) => sum + (WIDE_SCRIPT_CHARACTER.test(character) ? 2 : 1), 0);
  if (width < MIN_REF_LENGTH) return `너무 짧습니다 (보이는 글자 ${characters.length}자)`;
  if (new Set(characters).size < MIN_REF_DISTINCT_CHARACTERS) return "서로 다른 글자가 너무 적습니다";
  if (!/\p{L}/u.test(visible)) {
    return "글자(설명)가 하나도 없습니다 — 숫자·기호만으로는 보관 위치를 알 수 없으니 파일명이나 폴더 이름을 함께 적어 주세요";
  }
  if ((visible.match(/[\p{L}\p{N}]/gu) ?? []).length < 4) return "글자·숫자가 4개 미만입니다";
  if (/^(.+)\1+$/su.test(visible)) return "같은 조각을 반복한 값입니다";
  const normalized = value.normalize("NFKC").toLowerCase();
  if (KOREAN_PLACEHOLDER_STEM.test(normalized) || PLACEHOLDER_ARTIFACT.test(normalized)) return "자리표시 문구입니다";
  const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter((token) => token && !REF_EXTENSIONS.has(token));
  if (tokens.some((token) => STRONG_PLACEHOLDER_TOKENS.has(token))) return "자리표시 낱말(TBD·TODO 등)이 들어 있습니다";
  if (tokens.every((token) => WEAK_PLACEHOLDER_TOKENS.has(token))) return "자리표시 낱말로만 이뤄져 있습니다";
  return null;
}

/**
 * itch.io의 팩 페이지(`<제작자>.itch.io/<팩>`)나 번들 페이지(`itch.io/b/<번호>/…`) 주소가 아닌 이유. 문제가 없으면 null.
 * zitch.io·itch.io@evil.com 같은 닮은꼴, 공백·제어 문자·역슬래시가 낀 문자열, 포트·빈 호스트 라벨, 로그인·번들 번호 없는
 * 주소, www·docs·api 같은 서비스 하위 도메인을 거부하고, 원문이 URL 정규형과 다른 표기(기본 포트·빈 사용자 정보·전각 점·
 * % 인코딩 호스트)도 거부한다. 끝 점 하나(FQDN 표기)와 호스트 대문자는 허용한다. 제작자 하위 도메인이 원장 항목의 제작사와
 * 같은지는 보지 않는다(핸들 표기를 코드가 알지 못한다 — 소유자 확인 사항).
 */
export function itchUrlProblem(value) {
  if (typeof value !== "string") return "문자열이 아닙니다";
  if (value.length > MAX_URL_LENGTH) return `${MAX_URL_LENGTH}자를 넘습니다`;
  const blank = /[\p{Cc}\p{Cf}\p{Z}\\]/u.exec(value);
  if (blank) {
    return `공백·제어 문자나 역슬래시(${codePointLabel(blank[0])})가 ${blank.index}번째에 있습니다 — 앞뒤 공백·줄바꿈 같은 복사 잔여물을 지워 주세요`;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return "URL로 해석되지 않습니다";
  }
  if (url.protocol !== "https:") return "https 주소여야 합니다";
  if (url.username !== "" || url.password !== "" || url.port !== "") return "사용자 정보·포트가 있으면 안 됩니다";
  const canonicalPrefix = `https://${url.host}`;
  if (!value.toLowerCase().startsWith(canonicalPrefix) || !["", "/", "?", "#"].includes(value.charAt(canonicalPrefix.length))) {
    return "주소 표기가 정규형과 다릅니다 (기본 포트·빈 사용자 정보·전각 문자·% 인코딩 호스트 등)";
  }
  const host = url.host.replace(/\.$/u, "");
  const labels = host.split(".");
  if (labels.some((label) => label === "")) return "호스트에 빈 라벨이 있습니다";
  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "itch.io") {
    return segments[0] === "b" && /^\d+$/u.test(segments[1] ?? "") ? null : "itch.io 번들 페이지(/b/<번호>/…)가 아닙니다";
  }
  if (labels.length !== 3 || labels[1] !== "itch" || labels[2] !== "io") return "itch.io 제작자 페이지(<제작자>.itch.io)가 아닙니다";
  if (!ITCH_HANDLE.test(labels[0]) || ITCH_RESERVED_SUBDOMAINS.has(labels[0])) {
    return `${labels[0]}은 제작자 페이지 하위 도메인이 아닙니다`;
  }
  if (segments.length < 1) return "팩 경로(/<팩>)가 없습니다";
  return null;
}

/**
 * grant.licenseName이 쓸 수 없는 이유. 문제가 없으면 null.
 * 웹 로더가 안 받는 이름은 로더가 조용히 버리고 권리를 unknown·비상업으로 낮추므로(공개 JSON에는 이름이 실린 채),
 * 게이트가 같은 규칙으로 먼저 거른다: 160자 상한, 주소·비밀 낱말 패턴, NFKC·공백 정규형(로더는 정규화한 값을 쓴다).
 */
export function licenseNameProblem(value) {
  const textIssue = textProblem(value, WEB_RIGHTS_TEXT_MAX_LENGTH * 4);
  if (textIssue) return textIssue;
  if (Array.from(value).length > WEB_RIGHTS_TEXT_MAX_LENGTH) return `${WEB_RIGHTS_TEXT_MAX_LENGTH}자를 넘습니다`;
  if (value.normalize("NFKC").trim().replace(/\s+/gu, " ") !== value) {
    return "NFKC 정규형이 아니거나 앞뒤·연속 공백이 있습니다 (웹은 정규화한 값을 씁니다)";
  }
  if (!/[\p{L}\p{N}]/u.test(value)) return "글자나 숫자가 없습니다";
  if (WEB_EXTERNAL_REFERENCE_PATTERN.test(value) || WEB_SENSITIVE_REFERENCE_PATTERN.test(value)) {
    return "주소(blob:·data:·file:·http(s):·://·www.)나 비밀 낱말(secret·password·api key·access token)이 있어 웹 로더가 버립니다";
  }
  return null;
}
