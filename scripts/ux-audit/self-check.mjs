/**
 * 측정 도구 자체 점검(--self-check). 알려진 결함을 심은 내장 HTML 을 실제 Chromium 으로 열어 측정 코드가 그 결함을 찾는지 확인한다.
 * 스택이 필요 없다. 브라우저 측정부는 DOM 레이아웃에 의존해 jsdom 으로는 시험할 수 없어서 이 방식으로 보증한다.
 * 고정물은 코드로 만든 문자열이며 바이너리 파일을 두지 않는다.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runAxe } from "./axe-audit.mjs";
import { parseCustomClassNames, parseDeclaredColorTokens } from "./design-tokens.mjs";
import { auditFocus } from "./focus-audit.mjs";
import { buildCellFacts, contextOptions } from "./measure.mjs";
import { collectPageFacts } from "./page-facts.mjs";
import { VIEWPORTS } from "./routes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEFECT_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>자체 점검</title>
<style>
  body{margin:0;font:16px sans-serif;background:#fff;color:#111}
  .wide{width:700px;height:20px;background:#ddd}
  .clip{width:600px;margin:0}
  .tiny{width:20px;height:20px;padding:0}
  .ok{display:inline-block;min-width:48px;min-height:48px;box-sizing:border-box}
  .ring:focus-visible{outline:3px solid #06f}
  .nofocus,.nofocus:focus,.nofocus:focus-visible{outline:none}
  .overlay{position:absolute;left:0;top:510px;width:240px;height:90px;background:rgba(0,0,0,.1)}

  .scroller{overflow-x:auto;width:200px}
  .scroller .inner{width:600px}
</style></head><body>
<header>배너</header>
<main>
  <h2>첫 제목은 h2</h2>
  <h4>단계를 건너뛴 제목</h4>
  <button class="tiny ring">a</button>
  <button class="tiny nofocus"></button>
  <a href="#x" class="ok ring">링크</a>
  <div class="wide"></div>
  <p class="clip">뷰포트보다 넓은 문단입니다. 이 문단은 가로로 잘립니다.</p>
  <div class="scroller"><div class="inner"><a href="#y">스크롤 영역 안 링크</a></div></div>
  <p>route.studioNew</p>
  <p>{value0} 화면입니다</p>
  <p>This sentence is clearly English text</p>
  <div class="bg-red-500 bg-white text-fg-4 text-fg-3" style="color:#ff0000">클래스와 인라인 색</div>
  <span style="color:var(--x)">변수는 허용</span>
  <button id="covered" class="ok" style="position:absolute;left:10px;top:520px">가려진 버튼</button>
  <div class="overlay"></div>
  <details><summary>닫힌 상세</summary><button class="tiny">닫힌 안의 작은 버튼</button><button></button></details>
  <div style="height:0;overflow:hidden"><button class="tiny">잘려 보이지 않는 버튼</button></div>
</main>
<nav aria-label="주 메뉴"></nav><nav aria-label="주 메뉴"></nav>
</body></html>`;

const FIXED_BAR_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>고정 바</title>
<style>body{margin:0}.ok{display:inline-block;min-width:48px;min-height:48px;box-sizing:border-box}
.fixedbar{position:fixed;left:0;right:0;bottom:0;height:120px;background:#eee}.tall{height:1600px}</style></head><body>
<main><h1>고정 바</h1><a id="under" href="#u" class="ok" style="position:absolute;left:10px;top:820px">고정 바 아래 링크</a><div class="tall"></div></main>
<footer class="fixedbar"><a href="#f" class="ok">고정 바 안 링크</a></footer></body></html>`;

const SCROLL_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>스크롤 순회</title>
<style>body{margin:0;font:16px sans-serif}a{display:block;height:56px;line-height:56px;padding:0 12px;border-bottom:1px solid #ccc}
a:focus-visible{outline:3px solid #06f;outline-offset:-3px}</style></head><body><main><h1>긴 목록</h1>
${Array.from({ length: 30 }, (_, index) => `<a href="#i${index}">항목 ${index + 1}</a>`).join("")}</main></body></html>`;

const TRAP_PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>키보드 함정</title></head><body><main><h1>함정</h1>
<button id="trap" onkeydown="if(event.key==='Tab'){event.preventDefault()}">Tab 을 삼키는 버튼</button>
${Array.from({ length: 10 }, (_, index) => `<a href="#t${index}">링크 ${index + 1}</a>`).join(" ")}</main></body></html>`;

/**
 * @param {import("playwright").Browser} browser
 * @param {(line: string) => void} log
 * @returns {Promise<boolean>} 모든 점검이 통과하면 true
 */
export async function runSelfCheck(browser, log) {
  const css = readFileSync(join(ROOT, "apps/web/src/app/styles/globals.css"), "utf8");
  const designContext = { declaredColors: parseDeclaredColorTokens(css), customClasses: parseCustomClassNames("") };
  const results = [];
  const check = (name, ok, detail = "") => {
    results.push(ok);
    log(`  ${ok ? "통과" : "실패"} — ${name}${ok ? "" : ` (${detail})`}`);
  };
  const open = async (viewport, html) => {
    const context = await browser.newContext(contextOptions(viewport));
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return { context, page };
  };

  const mobile = VIEWPORTS.find((viewport) => viewport.id === "mobile");
  const defect = await open(mobile, DEFECT_PAGE);
  try {
    const size = { width: mobile.width, height: mobile.height };
    const facts = await defect.page.evaluate(collectPageFacts, size);
    const axe = await runAxe(defect.page, { timeoutMs: 60_000 });
    const focus = await auditFocus(defect.page, { presses: 8, viewport: size });
    const built = buildCellFacts({ facts, axe, focus, performance: { measured: true }, designContext });
    log("결함 고정물(모바일 390×844)");
    check("가로 스크롤을 찾는다", built.responsive.scroll.overflowPx > 100, `넘친 폭 ${built.responsive.scroll.overflowPx}`);
    check("잘린 문단을 찾고 스크롤 영역 안 링크는 세지 않는다",
      built.responsive.clipped.count >= 1 && !JSON.stringify(built.responsive.clipped.samples).includes("스크롤 영역 안 링크"),
      JSON.stringify(built.responsive.clipped));
    check("겹쳐 가려진 버튼 1개를 찾는다", built.responsive.obscured.count === 1, JSON.stringify(built.responsive.obscured));
    check("44px 미만 탭 대상: 보이는 것 4개만(닫힌 details 안·overflow 에 잘린 버튼은 제외)", built.responsive.tapTargets.small44 === 4, JSON.stringify(built.responsive.tapTargets));
    check("제목 계층: h1 없음과 단계 건너뜀", built.a11y.headings.h1Count === 0 && built.a11y.headings.skippedLevels === 1, JSON.stringify(built.a11y.headings));
    check("랜드마크: main 1개, 같은 이름의 nav 중복 1그룹", built.a11y.landmarks.mainCount === 1 && built.a11y.landmarks.duplicateGroups === 1, JSON.stringify(built.a11y.landmarks));
    check("axe 가 이름 없는 버튼을 찾는다", built.a11y.unnamed.buttons >= 1, JSON.stringify(built.a11y.unnamed));
    check("원시 팔레트·흑백 클래스 2종", built.visual.rawColorClasses.distinct === 2, `${built.visual.rawColorClasses.distinct}`);
    check("미선언 토큰 text-fg-4 만 찾는다(text-fg-3 은 선언됨)", built.visual.undeclaredTokens.distinct === 1, JSON.stringify(built.visual.undeclaredTokens.samples));
    check("인라인 색은 리터럴 1곳만(var() 는 허용)", built.visual.inlineColors.elements === 1, `${built.visual.inlineColors.elements}`);
    check("카피: 번역 키 1·자리표시자 1·영어 문장 1·빈 버튼 1",
      built.copy.rawKeys === 1 && built.copy.placeholderLeaks === 1 && built.copy.englishSentences === 1 && built.copy.emptyButtons === 1,
      JSON.stringify({ k: built.copy.rawKeys, p: built.copy.placeholderLeaks, e: built.copy.englishSentences, b: built.copy.emptyButtons }));
    check("포커스 순회: 표시 없는 버튼을 찾는다", built.a11y.focus.noIndicator >= 1 && built.a11y.focus.tabStops >= 3, JSON.stringify(built.a11y.focus));
  } finally {
    await defect.context.close();
  }

  const desktop = VIEWPORTS.find((viewport) => viewport.id === "desktop");
  const scroll = await open({ ...desktop, width: 390, height: 500 }, SCROLL_PAGE);
  try {
    const audit = await auditFocus(scroll.page, { presses: 20, viewport: { width: 390, height: 500 } });
    log("긴 목록 고정물(스크롤하며 Tab 20회)");
    check("스크롤된 뒤에도 포커스 표시를 올바른 좌표에서 비교한다", audit.focus.tabStops === 20 && audit.focus.noIndicator === 0, JSON.stringify(audit.focus));
    check("정상 목록은 키보드 함정이 아니다", audit.trap.suspected === false, JSON.stringify(audit.trap));
  } finally {
    await scroll.context.close();
  }

  const fixedBar = await open(desktop, FIXED_BAR_PAGE);
  try {
    const facts = await fixedBar.page.evaluate(collectPageFacts, { width: desktop.width, height: desktop.height });
    log("고정 바 고정물(데스크톱)");
    check("고정 바가 스크롤하는 본문 링크를 덮은 것은 점수에서 빼고 일시적 가림으로 센다",
      facts.obscured.count === 0 && facts.obscured.temporaryCount === 1, JSON.stringify(facts.obscured));
  } finally {
    await fixedBar.context.close();
  }

  const trap = await open(desktop, TRAP_PAGE);
  try {
    const audit = await auditFocus(trap.page, { presses: 12, viewport: { width: desktop.width, height: desktop.height } });
    log("키보드 함정 고정물");
    check("Tab 을 삼키는 버튼을 함정으로 판정한다", audit.trap.suspected === true, JSON.stringify(audit.trap));
  } finally {
    await trap.context.close();
  }

  const passed = results.filter(Boolean).length;
  log(`자체 점검 ${passed}/${results.length} 통과`);
  return passed === results.length;
}
