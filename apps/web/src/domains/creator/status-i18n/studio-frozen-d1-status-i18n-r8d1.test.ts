import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
/**
 * 절단편 문장 설계 D1 모듈 계약 (A4 D1 — frozenD1, 설계 r8-design-d1-final
 * §2.5 T-L7).
 *
 * 배경: Community 공개 재검증 문장(완결 키)과 LiveCanvasOverlay 접근성
 * 라벨 절단편·title(완결 키)이 호출부에 한국어로 하드코딩돼 en 사용자의
 * 동선이 끊겼다. 표시 정본은 studio-frozen-d1-status-i18n 등록 모듈의
 * `studio.frozenD1.*` 키이며, 코드 안의 한국어 원문은
 * `frozenD1Text(키, …, 한국어 폴백)`의 폴백 인자로만 남아야 한다.
 * frozen1~6 모듈은 각 테스트가 전 키의 소비 파일을 단언해 확장할 수 없어
 * D1 전용 형제 모듈로 분리했다. Community 소비(StudioCommunityMarketplace
 * Panel)는 W2, Live 소비(StudioLiveCanvasOverlay)는 W3 단위이며, 전 키
 * 소비 단언은 두 단위가 모두 랜딩한 트리에서 성립하는 완료 계약이다.
 *
 * 키 수 실측 정정: 설계 §4는 절단편 9종·총 19키로 적었으나 §2.1 표의
 * 절단편은 10종이라 총 키는 20개다(모듈 헤더 주석 참조). 이 테스트는
 * 20키 전집합을 명시 목록으로 고정한다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf-8");
}

/** 등록 모듈(registerI18nLocaleEntries)의 locale 블록을 전부 병합해 파싱한다. */
function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = (entry[2] ?? "").replace(/\\"/g, '"');
    }
    blocks[match[1] ?? ""] = { ...(blocks[match[1] ?? ""] ?? {}), ...entries };
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

/**
 * frozenD1Text 호출을 균형 괄호 스캔으로 전부 추출한다. 반환값은
 * [키, 폴백] 쌍이며, 폴백은 최상위 인자 중 마지막 문자열 리터럴이다.
 */
function extractFrozenCalls(source: string): Array<[string, string]> {
  const results: Array<[string, string]> = [];
  const needle = "frozenD1Text(";
  let idx = 0;
  for (;;) {
    const at = source.indexOf(needle, idx);
    if (at < 0) break;
    idx = at + needle.length;
    let pos = idx;
    let paren = 1;
    let brace = 0;
    let bracket = 0;
    let state: string | null = null;
    let escaped = false;
    let current = "";
    const parts: string[] = [];
    while (pos < source.length) {
      const c = source[pos] ?? "";
      if (state !== null) {
        current += c;
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === state) state = null;
        pos += 1;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        state = c;
        current += c;
        pos += 1;
        continue;
      }
      if (c === "(") paren += 1;
      else if (c === ")") {
        paren -= 1;
        if (paren === 0) {
          parts.push(current);
          break;
        }
      } else if (c === "{") brace += 1;
      else if (c === "}") brace -= 1;
      else if (c === "[") bracket += 1;
      else if (c === "]") bracket -= 1;
      else if (c === "," && paren === 1 && brace === 0 && bracket === 0) {
        parts.push(current);
        current = "";
        pos += 1;
        continue;
      }
      current += c;
      pos += 1;
    }
    const unquote = (raw: string): string | null => {
      const match = /^"((?:[^"\\]|\\[\s\S])*)"$/.exec(raw.trim());
      return match ? (match[1] ?? "").replace(/\\"/g, '"') : null;
    };
    const key = parts.length > 0 ? unquote(parts[0] ?? "") : null;
    const fallback = parts.length > 0 ? unquote(parts[parts.length - 1] ?? "") : null;
    if (key !== null && fallback !== null) results.push([key, fallback]);
  }
  return results;
}

const MODULE_FILE = "status-i18n/studio-frozen-d1-status-i18n.ts";
const PREFIX = "studio.frozenD1.";
const CONSUMERS = [
  "StudioCommunityMarketplacePanel.tsx",
  "live/StudioLiveCanvasOverlay.tsx",
] as const;

/** 래칫 기준선 — 소비 파일은 이 줄 수를 넘을 수 없다(기존 frozen 테스트와 동일 값). */
const BASELINE_LINES: Record<(typeof CONSUMERS)[number], number> = {
  "StudioCommunityMarketplacePanel.tsx": 2602,
  "live/StudioLiveCanvasOverlay.tsx": 1579,
};

/** D1 전 키 명시 목록 — Community 6 + Live 절단편 10 + title 4 = 20키. */
const EXPECTED_KEYS = [
  "studio.frozenD1.community.actionAssetInsert",
  "studio.frozenD1.community.actionLocalInstall",
  "studio.frozenD1.community.revalidationDetailFallback",
  "studio.frozenD1.community.revalidationEvidenceChanged",
  "studio.frozenD1.community.revalidationNotFound",
  "studio.frozenD1.community.revalidationUnconfirmed",
  "studio.frozenD1.live.allRead",
  "studio.frozenD1.live.latestAuthor",
  "studio.frozenD1.live.latestComment",
  "studio.frozenD1.live.openWithEnter",
  "studio.frozenD1.live.pinPosition",
  "studio.frozenD1.live.pinTitleBlocked",
  "studio.frozenD1.live.pinTitleOpened",
  "studio.frozenD1.live.pinTitleOpenedUnread",
  "studio.frozenD1.live.pinTitleReanchorable",
  "studio.frozenD1.live.reanchorBlocked",
  "studio.frozenD1.live.reanchorHint",
  "studio.frozenD1.live.reanchoring",
  "studio.frozenD1.live.unreadThreads",
  "studio.frozenD1.live.unresolvedThreads",
].sort();

/** 설계 §2.2 C1 순서 — Live 절단편이 소비 파일에 등장하는 순서. */
const FRAGMENT_ORDER = [
  "studio.frozenD1.live.pinPosition",
  "studio.frozenD1.live.latestAuthor",
  "studio.frozenD1.live.latestComment",
  "studio.frozenD1.live.unresolvedThreads",
  "studio.frozenD1.live.unreadThreads",
  "studio.frozenD1.live.allRead",
  "studio.frozenD1.live.reanchoring",
  "studio.frozenD1.live.reanchorHint",
  "studio.frozenD1.live.reanchorBlocked",
  "studio.frozenD1.live.openWithEnter",
];

const blocks = parseRegisterModule(readSource(MODULE_FILE));
const ALL_KEYS = Object.keys(blocks.ko).sort();

describe("frozen D1 status i18n r8d1", () => {
  it("등록 모듈의 키 집합이 D1 명시 목록과 정확히 일치한다", () => {
    expect(ALL_KEYS).toEqual(EXPECTED_KEYS);
  });

  it("등록 모듈의 ko/en 키가 패리티를 이루고 en에 한글이 없다", () => {
    expect(Object.keys(blocks.en).sort()).toEqual(ALL_KEYS);
    for (const key of ALL_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBeTruthy();
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
    }
  });

  it("플레이스홀더가 ko/en에서 정확히 일치한다", () => {
    for (const key of ALL_KEYS) {
      const koPh = [...(blocks.ko[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      const enPh = [...(blocks.en[key] ?? "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
      expect(enPh, `placeholder mismatch: ${key}`).toEqual(koPh);
    }
  });

  it("전 키가 소비 파일에서 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of ALL_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(new RegExp(`"(${PREFIX.replace(/\./g, "\\.")}[A-Za-z0-9.]+)"`, "g"))].map((m) => m[1] ?? ""),
    );
    for (const key of referenced) {
      expect(ALL_KEYS.includes(key), `dangling key reference: ${key}`).toBe(true);
    }
  });

  it("소비 파일의 폴백 인자가 등록된 ko 원문과 일치한다", () => {
    for (const file of CONSUMERS) {
      for (const [key, fallback] of extractFrozenCalls(readSource(file))) {
        expect(fallback, `${file}: fallback mismatch for ${key}`).toBe(blocks.ko[key]);
      }
    }
  });

  it("Live 절단편이 C1 순서대로 소비 파일에 등장한다 (로케일 무관 순서 계약)", () => {
    const liveSource = readSource("live/StudioLiveCanvasOverlay.tsx");
    const positions = FRAGMENT_ORDER.map((key) => liveSource.indexOf(`"${key}"`));
    for (const [index, key] of FRAGMENT_ORDER.entries()) {
      expect(positions[index], `fragment missing in Live consumer: ${key}`).toBeGreaterThanOrEqual(0);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("소비 파일 줄 수가 래칫 기준선을 넘지 않는다 (줄중립)", () => {
    for (const file of CONSUMERS) {
      const source = readSource(file);
      const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lines, `${file} lines ${lines} > baseline ${BASELINE_LINES[file]}`).toBeLessThanOrEqual(BASELINE_LINES[file]);
    }
  });

  it("등록 모듈이 800줄 상한을 넘지 않는다", () => {
    const source = readSource(MODULE_FILE);
    const lines = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
    expect(lines, `module lines ${lines} > 800`).toBeLessThanOrEqual(800);
  });
});
