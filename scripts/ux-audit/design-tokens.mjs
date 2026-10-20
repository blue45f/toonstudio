/**
 * 시각 일관성 측정용 디자인 토큰 분류기(순수 함수).
 *
 * 렌더된 DOM 의 클래스 이름을 보고 다음을 가려낸다.
 * - 원시 Tailwind 팔레트(`bg-red-500`), 이름 있는 흑백(`bg-white`), 색 리터럴 임의값(`bg-[#fff]`)
 * - 선언되지 않은 테마 색 토큰(`bg-accent-hover`, `text-fg-4` 처럼 @theme 에 없어 CSS 가 생성되지 않는 클래스)
 *
 * 규칙의 출처는 ESLint `shadcn/no-raw-colors`(@shadcn/lint 0.2.1)다. 그 플러그인은 내부 상수를 내보내지 않아
 * 접두어 정규식과 팔레트 이름을 여기에 옮겼고, design-tokens.test.mjs 가 설치된 플러그인 파일과 같은지 대조한다.
 * "선언 목록"은 린트 규칙과 같은 정본인 globals.css 의 `@theme` 블록(`--color-*`)이다.
 *
 * 한계(보고서에도 명시한다): 클래스 문자열만 보는 휴리스틱이다. Tailwind 컴파일러로 유틸리티를 해석하지 않으므로
 * 색이 아닌 값 이름은 아래 허용 목록으로만 걸러낸다. 허용 목록에 없는 새 비색상 값은 "미선언"으로 오탐할 수 있다.
 */

/** @shadcn/lint 0.2.0 dist/similar.js 의 COLOR_PREFIX 와 같다(테스트가 대조). */
export const COLOR_PREFIX = /^(?:text-shadow|inset-shadow|inset-ring|drop-shadow|scrollbar-(?:thumb|track)|ring-offset|border(?:-[trblxyse]|-[bi][se])?|divide(?:-[xy])?|mask-(?:linear|radial|conic|[trblxy])-(?:from|to)|bg|text|ring|outline|fill|stroke|from|via|to|accent|caret|decoration|placeholder|shadow)-/;

/** @shadcn/lint 0.2.1 의 PALETTE 와 같다(테스트가 대조). */
export const PALETTE_NAMES = Object.freeze([
  "slate", "gray", "zinc", "neutral", "stone", "mauve", "olive", "mist", "taupe",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan",
  "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
]);

const OPACITY_MODIFIER = /\/(?:[\w.%]+|\[[^\]]*\]|\([^)]*\))$/;
const PALETTE_VALUE = new RegExp(`^(?:${PALETTE_NAMES.join("|")})-\\d{2,3}$`);
const NAMED_RAW = new Set(["white", "black"]);
const NAMED_ALLOWED = new Set(["transparent", "current", "inherit", "initial", "unset", "none"]);
// DESIGN.md 는 rgb()/hex 대신 OKLCH 로 색을 쓰라고 하므로, 클래스 속 OKLCH 리터럴은 위반이 아니라 "토큰을 쓰지 않은 하드코딩(참고)"으로 따로 센다.
const RAW_COLOR_LITERAL = /^(?:#[0-9a-fA-F]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|color)\(.*\))$/;
const OKLCH_LITERAL = /^(?:oklch|oklab|color-mix)\(.*\)$/;
const WORD_VALUE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * 접두어별로 "색이 아닌" 값의 시작 단어. Tailwind v4 유틸리티 이름 기준이며 값 전체가 아니라 첫 단어로 판정한다.
 * 키는 COLOR_PREFIX 가 돌려주는 접두어에서 끝의 `-` 를 뗀 것이다.
 */
const NON_COLOR_VALUE_WORDS = Object.freeze({
  text: ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl",
    "left", "center", "right", "justify", "start", "end", "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip"],
  bg: ["auto", "cover", "contain", "center", "fixed", "local", "scroll", "top", "bottom", "left", "right",
    "repeat", "no", "clip", "origin", "blend", "gradient", "linear", "radial", "conic", "none", "size", "position"],
  // border-t · border-b 처럼 방향만 있는 클래스는 폭 유틸리티다(색이 아니다).
  border: ["solid", "dashed", "dotted", "double", "hidden", "none", "collapse", "separate", "spacing",
    "t", "r", "b", "l", "x", "y", "s", "e", "bs", "be", "is", "ie"],
  divide: ["solid", "dashed", "dotted", "double", "hidden", "none", "reverse", "x", "y"],
  ring: ["inset"],
  outline: ["none", "solid", "dashed", "dotted", "double", "hidden", "offset"],
  fill: ["none"],
  stroke: ["none"],
  shadow: ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "inner", "none"],
  "drop-shadow": ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "none"],
  "text-shadow": ["2xs", "xs", "sm", "md", "lg", "none"],
  "inset-shadow": ["2xs", "xs", "sm", "md", "lg", "none"],
  decoration: ["auto", "from", "solid", "double", "dotted", "dashed", "wavy", "slice", "clone"],
  accent: ["auto"],
});

/**
 * 토큰 문자열에서 Tailwind 변형(`hover:`, `md:`, `data-[state=open]:`)을 뗀다. 대괄호·괄호 안의 `:` 는 변형 구분자가 아니다.
 * @param {string} token
 * @returns {{ variants: string[], base: string }}
 */
export function splitVariants(token) {
  if (!token.includes(":")) return { variants: [], base: token };
  const segments = [];
  let bracketDepth = 0;
  let parenDepth = 0;
  let current = "";
  for (const char of token) {
    if (char === "[") bracketDepth += 1;
    else if (char === "]") bracketDepth -= 1;
    else if (bracketDepth === 0) {
      if (char === "(") parenDepth += 1;
      else if (char === ")") parenDepth -= 1;
    }
    if (char === ":" && bracketDepth === 0 && parenDepth === 0) {
      segments.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  segments.push(current);
  return { variants: segments.slice(0, -1), base: segments[segments.length - 1] };
}

/** 변형·중요도(`!`)·음수 접두(`-`)를 뗀 기본 클래스 이름. */
export function normalizeClass(token) {
  const { base } = splitVariants(token);
  return base.replace(/^!/, "").replace(/!$/, "").replace(/^-/, "");
}

/** `--color-*` 이름 집합을 @theme 블록에서만 읽는다(Tailwind v4 는 @theme 선언만 유틸리티로 만든다). */
export function parseDeclaredColorTokens(cssText) {
  const tokens = new Set();
  let searchFrom = 0;
  for (;;) {
    const start = cssText.indexOf("@theme", searchFrom);
    if (start === -1) break;
    const open = cssText.indexOf("{", start);
    if (open === -1) break;
    let depth = 0;
    let index = open;
    for (; index < cssText.length; index += 1) {
      if (cssText[index] === "{") depth += 1;
      else if (cssText[index] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = cssText.slice(open + 1, index);
    for (const match of body.matchAll(/--color-([a-zA-Z0-9-]+)\s*:/gu)) tokens.add(match[1]);
    searchFrom = index + 1;
  }
  return tokens;
}

/**
 * CSS 에서 직접 정의한 클래스(`.foo`)와 `@utility foo` 를 모은다. 이 이름들은 Tailwind 색 토큰이 아니므로 "미선언"으로 세지 않는다.
 */
export function parseCustomClassNames(cssText) {
  const names = new Set();
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//gu, "");
  for (const match of withoutComments.matchAll(/(?:^|[^\w-])\.((?:\\.|[A-Za-z_][\w-]*)(?:\\.|[\w-])*)/gu)) {
    names.add(match[1].replace(/\\(.)/gu, "$1"));
  }
  for (const match of withoutComments.matchAll(/@utility\s+([\w-]+)/gu)) names.add(match[1]);
  return names;
}

function isNonColorValue(prefixKey, value) {
  if (/^\d+(?:\.\d+)?%?$/u.test(value)) return true;
  const words = NON_COLOR_VALUE_WORDS[prefixKey];
  if (!words) return false;
  const first = value.split("-", 1)[0];
  return words.includes(first) || words.includes(value);
}

/**
 * 한 클래스 토큰을 분류한다. 색 유틸리티가 아니거나 선언된 토큰이면 null.
 * @param {string} token DOM class 속성의 한 토큰
 * @param {{ declaredColors: ReadonlySet<string>, customClasses?: ReadonlySet<string> }} context
 * @returns {null | { kind: "palette" | "named" | "arbitrary" | "oklch" | "undeclared", className: string, value: string }}
 */
export function classifyColorClass(token, context) {
  const { declaredColors, customClasses } = context;
  const className = normalizeClass(token);
  if (!className || customClasses?.has(className)) return null;
  const prefixMatch = className.match(COLOR_PREFIX);
  if (!prefixMatch) return null;
  const prefix = prefixMatch[0];
  const prefixKey = prefix.replace(/-$/u, "").replace(/^(border|divide)-(?:[trblxyse]|[bi][se])$/u, "$1");
  const rest = className.slice(prefix.length);
  const opacity = rest.match(OPACITY_MODIFIER)?.[0] ?? "";
  const value = rest.slice(0, rest.length - opacity.length);
  if (!value) return null;

  if (value.startsWith("[")) {
    const inner = value.slice(1, -1).replace(/^(?:color|string):/u, "").trim();
    if (RAW_COLOR_LITERAL.test(inner)) return { kind: "arbitrary", className, value: inner };
    return OKLCH_LITERAL.test(inner) ? { kind: "oklch", className, value: inner } : null;
  }
  if (value.startsWith("(")) return null;
  if (PALETTE_VALUE.test(value)) return { kind: "palette", className, value };
  if (NAMED_RAW.has(value)) return { kind: "named", className, value };
  if (NAMED_ALLOWED.has(value) || declaredColors.has(value)) return null;
  if (!WORD_VALUE.test(value) || isNonColorValue(prefixKey, value)) return null;
  // ring-offset-2 · stroke-2 같은 폭 값은 위 숫자 판정에서 이미 제외됐다. 남은 단어는 색 이름으로 쓰였지만 선언이 없다.
  return { kind: "undeclared", className, value };
}

/**
 * 클래스별 요소 수 목록을 위반 요약으로 바꾼다.
 * @param {ReadonlyArray<{ name: string, elements: number, sample?: string }>} classUsage
 * @param {{ declaredColors: ReadonlySet<string>, customClasses?: ReadonlySet<string> }} context
 */
export function summarizeClassUsage(classUsage, context) {
  const buckets = { palette: [], named: [], arbitrary: [], oklch: [], undeclared: [] };
  const seen = new Map();
  for (const usage of classUsage) {
    const hit = classifyColorClass(usage.name, context);
    if (!hit) continue;
    const merged = seen.get(hit.className);
    if (merged) {
      merged.elements += usage.elements;
      continue;
    }
    const entry = { className: hit.className, kind: hit.kind, elements: usage.elements, sample: usage.sample ?? "" };
    seen.set(hit.className, entry);
    buckets[hit.kind].push(entry);
  }
  const finish = (list) => {
    const sorted = [...list].sort((left, right) => right.elements - left.elements || left.className.localeCompare(right.className, "en"));
    return {
      distinct: sorted.length,
      elements: sorted.reduce((sum, entry) => sum + entry.elements, 0),
      samples: sorted.slice(0, 12),
    };
  };
  const palette = finish(buckets.palette);
  const named = finish(buckets.named);
  const arbitrary = finish(buckets.arbitrary);
  const undeclared = finish(buckets.undeclared);
  const oklch = finish(buckets.oklch);
  const rawList = [...buckets.palette, ...buckets.named, ...buckets.arbitrary];
  return {
    palette,
    named,
    arbitrary,
    undeclared,
    oklch,
    raw: finish(rawList),
  };
}
