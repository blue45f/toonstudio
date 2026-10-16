// 작품 홈 로비의 좁은 화면(320/390px)과 노트북 폭(901~1439px) 레이아웃 계약.
// jsdom 은 레이아웃을 계산하지 못하므로, 브라우저 검증(e2e/creator-flagship.spec.ts)이 실제 치수로 잡는
// 결함의 원인 규칙이 CSS 에서 사라지지 않게 소스 수준으로 고정한다.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./studio-creator-lobby.css", import.meta.url), "utf8");

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** 선택자가 정확히 일치하는 최상위 규칙(미디어 쿼리 밖)의 선언부를 돌려준다. */
function ruleBody(selector: string): string {
  const match = css.match(new RegExp(`(?:^|\\n)${escapeRegExp(selector)} \\{([^}]*)\\}`, "u"));
  if (!match?.[1]) throw new Error(`규칙을 찾지 못했습니다: ${selector}`);
  return match[1];
}

/** `@media <query> { … }` 블록의 안쪽을 중괄호 균형으로 잘라 돌려준다. */
function mediaBlock(query: string): string {
  const head = `@media ${query} {`;
  const start = css.indexOf(head);
  if (start < 0) throw new Error(`미디어 쿼리를 찾지 못했습니다: ${query}`);
  let depth = 1;
  let index = start + head.length;
  while (index < css.length && depth > 0) {
    if (css[index] === "{") depth += 1;
    else if (css[index] === "}") depth -= 1;
    index += 1;
  }
  return css.slice(start + head.length, index - 1);
}

/** 미디어 블록 안에서 선택자가 정확히 일치하는 규칙의 선언부를 돌려준다. */
function ruleBodyIn(block: string, selector: string): string {
  const match = block.match(new RegExp(`(?:^|\\n)\\s*${escapeRegExp(selector)} \\{([^}]*)\\}`, "u"));
  if (!match?.[1]) throw new Error(`블록 안에서 규칙을 찾지 못했습니다: ${selector}`);
  return match[1];
}

const COMPACT_QUICK_LIST = '.studio-lobby[data-density="compact"] .studio-lobby-quick ul';
const COMPACT_QUICK_LAST = '.studio-lobby[data-density="compact"] .studio-lobby-quick li:last-child';

describe("작품 홈 로비 반응형 레이아웃", () => {
  // 암묵 grid 열(auto)은 자식의 min-content 폭까지 커진다. 한 줄 아이디어 입력칸(input 의 고유 폭 포함)의
  // min-content 는 약 375px 라, 열을 묶지 않으면 휴대폰 폭에서 히어로 오른쪽(입력 제출·작업 가져오기)이
  // overflow:hidden 에 잘렸다.
  it.each([".studio-lobby-hero__copy", ".studio-lobby-idea-field"])(
    "%s 의 암묵 열을 컨테이너 폭에 묶어 입력칸의 고유 폭이 열을 넓히지 못하게 한다",
    (selector) => {
      expect(ruleBody(selector)).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/u);
    },
  );

  it("히어로 복사 블록은 여전히 shrink 가능한 grid 항목이다", () => {
    const hero = ruleBody(".studio-lobby-hero__copy");
    expect(hero).toMatch(/display:\s*grid\s*;/u);
    expect(hero).toMatch(/min-width:\s*0\s*;/u);
  });

  // 재방문(compact) 카드는 썸네일 3.5rem · 글 · 화살표를 한 줄에 둔다. 2열이면 휴대폰 폭에서 글 열이
  // 한두 글자로 좁아져 제목이 세로로 쪼개졌다.
  it("재방문 빠른 시작은 479px 이하에서 한 열로 접고 첫 방문(full) 카드는 건드리지 않는다", () => {
    const rule = css.match(
      /@media \(max-width:\s*479px\)\s*\{\s*(\.studio-lobby\[data-density="compact"\] \.studio-lobby-quick ul)\s*\{([^}]*)\}\s*\}/u,
    );
    expect(rule?.[1]).toBe('.studio-lobby[data-density="compact"] .studio-lobby-quick ul');
    expect(rule?.[2]).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/u);
    // 600px 이하의 2열 규칙은 그대로라 full 밀도의 세로 카드(글 열이 충분함)는 영향받지 않는다.
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.studio-lobby-quick ul\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/u);
  });

  // 같은 카드가 901px 이상에서는 7열이라 100~170px 폭에 놓였다. 썸네일·화살표·여백이 글 열을 한두 글자(1280px 에서
  // 14px)로 줄여 제목과 부제가 글자 단위로 쪼개졌다. 열을 4개로 접고(4+3) 마지막 카드가 남은 두 열을 채운다.
  it("재방문 빠른 시작은 901px 이상에서 4열로 접고 마지막 카드가 두 열을 채운다", () => {
    const block = mediaBlock("(min-width: 901px)");
    expect(ruleBodyIn(block, COMPACT_QUICK_LIST)).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*;/u);
    expect(ruleBodyIn(block, COMPACT_QUICK_LAST)).toMatch(/grid-column:\s*span 2\s*;/u);
    // 첫 방문(full) 카드와 기본 7열 규칙은 건드리지 않는다(full 카드는 글이 썸네일 아래에 놓여 글 열이 충분하다).
    expect(block).not.toContain('data-density="full"');
    expect(ruleBody(".studio-lobby-quick ul")).toMatch(/grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)\s*;/u);
  });

  it("901~960px 는 3열(3+3+1)로 한 번 더 접고 4열 규칙보다 뒤에 둬 같은 특이도에서 이긴다", () => {
    const narrow = "(min-width: 901px) and (max-width: 960px)";
    const block = mediaBlock(narrow);
    expect(ruleBodyIn(block, COMPACT_QUICK_LIST)).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*;/u);
    expect(ruleBodyIn(block, COMPACT_QUICK_LAST)).toMatch(/grid-column:\s*1 \/ -1\s*;/u);
    expect(css.indexOf(`@media ${narrow} {`)).toBeGreaterThan(css.indexOf("@media (min-width: 901px) {"));
  });

  it("AI 디렉터 열기 버튼은 44px 터치 영역을 보장한다", () => {
    expect(ruleBody(".studio-lobby-director__cta")).toMatch(/min-height:\s*44px\s*;/u);
  });
});
