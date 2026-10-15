import { describe, expect, it } from "vitest";

import {
  cssUrlTargets,
  hasEventHandlerAttribute,
  hasForbiddenSvgElement,
  imageElementTags,
} from "./studio-svg-source-scan";

// 원문 예산(2 MiB)을 가득 채운 최악 입력. 제곱 시간이면 수십 분이 걸리고 선형이면 수십 ms 안에 끝난다.
const BUDGET_CODE_UNITS = 2 * 1024 * 1024;
const LINEAR_TIME_BUDGET_MS = 1_000;

function elapsedMs(run: () => void): number {
  const startedAt = performance.now();
  run();
  return performance.now() - startedAt;
}

describe("hasForbiddenSvgElement", () => {
  it.each([
    "<script>",
    "</script>",
    "< script >",
    "<  /  script>",
    "</ foreignObject>",
    "<IFRAME src=x>",
    "<frameset>",
    "<portal>",
    "<video/>",
    "<rect/>\n<\t/\tembed>",
  ])("%j 는 금지 요소로 본다", (text) => {
    expect(hasForbiddenSvgElement(text)).toBe(true);
  });

  it.each([
    "<rect/>",
    "<scripted>",
    "<frames>",
    "<objectify>",
    "script",
    "<",
    "< /",
    "<  \n  ",
    "a < b",
  ])("%j 는 금지 요소가 아니다", (text) => {
    expect(hasForbiddenSvgElement(text)).toBe(false);
  });

  it("예산 크기의 공백 열도 선형 시간에 판정한다", () => {
    const text = `<${" ".repeat(BUDGET_CODE_UNITS)}`;
    expect(elapsedMs(() => expect(hasForbiddenSvgElement(text)).toBe(false))).toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});

describe("hasEventHandlerAttribute", () => {
  it.each([
    '<rect onload="x"/>',
    '<rect onclick = "x"/>',
    "ONCLICK=1",
    '<a xlink:onactivate="x"/>',
    '<g data-onclick="x"/>',
    "a-on-b=1",
    `${"on-".repeat(1_000)}=1`,
  ])("%j 는 이벤트 핸들러 속성으로 본다", (text) => {
    expect(hasEventHandlerAttribute(text)).toBe(true);
  });

  it.each([
    '<button type="x"/>',
    "common=1",
    "font-size=12",
    "on=1",
    "onclick",
    '<desc id="on"/>',
    "<rect/>",
    "",
  ])("%j 는 이벤트 핸들러 속성이 아니다", (text) => {
    expect(hasEventHandlerAttribute(text)).toBe(false);
  });

  it("예산 크기의 하이픈 열도 선형 시간에 판정한다", () => {
    const text = `${"on-".repeat(BUDGET_CODE_UNITS / 3)}x`;
    const trailing = `${"a-".repeat(BUDGET_CODE_UNITS / 2)}on-x=1`;
    expect(elapsedMs(() => {
      expect(hasEventHandlerAttribute(text)).toBe(false);
      expect(hasEventHandlerAttribute(trailing)).toBe(true);
    })).toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});

describe("cssUrlTargets", () => {
  it("따옴표·공백·대소문자와 상관없이 대상 문자열을 꺼낸다", () => {
    const targets = cssUrlTargets(
      '<rect fill="url(#a)"/><rect fill="URL( \'#b\' )"/><rect fill="url( &quot;#c )"/>'
      + '<rect stroke="url(  #d  )"/><rect filter=\'url("#e")\'/>',
    );
    expect(targets.map((target) => target.trim())).toEqual(["#a", "#b", "&quot;#c", "#d", "#e"]);
  });

  it("외부 주소와 빈 호출도 그대로 돌려줘 호출자가 거부할 수 있게 한다", () => {
    expect(cssUrlTargets("url(https://example.com/p.svg#x) url() url(\"\")").map((target) => target.trim())).toEqual([
      "https://example.com/p.svg#x",
      "",
      "",
    ]);
  });

  it("닫히지 않은 url( 은 돌려주지 않는다", () => {
    expect(cssUrlTargets("url(#a")).toEqual([]);
    expect(cssUrlTargets("url(#a) url(#b")).toEqual(["#a"]);
    expect(cssUrlTargets("no calls")).toEqual([]);
  });

  it("짝이 어긋난 따옴표는 따옴표째 대상이 돼 거부 쪽으로 읽힌다", () => {
    const [target] = cssUrlTargets('url("#a"x")');
    expect(target?.startsWith('"')).toBe(true);
  });

  it("예산 크기의 닫히지 않은 호출 열도 선형 시간에 훑는다", () => {
    const unclosed = "url(".repeat(BUDGET_CODE_UNITS / 4);
    const quoted = `${"url(\"a)".repeat(BUDGET_CODE_UNITS / 7)}`;
    expect(elapsedMs(() => {
      expect(cssUrlTargets(unclosed)).toEqual([]);
      expect(cssUrlTargets(quoted).length).toBeGreaterThan(0);
    })).toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});

describe("imageElementTags", () => {
  it("여는 태그 원문을 앞에서부터 돌려준다", () => {
    expect(imageElementTags('<svg><image href="#a"/><g/><feImage x="1"></feImage>< IMAGE y="2">')).toEqual([
      '<image href="#a"/>',
      '<feImage x="1">',
      '< IMAGE y="2">',
    ]);
  });

  it("image 로 시작하는 다른 이름이나 닫히지 않은 태그는 돌려주지 않는다", () => {
    expect(imageElementTags("<imagery/><svg><image href=\"#a\"")).toEqual([]);
    expect(imageElementTags("no tags")).toEqual([]);
  });

  it("예산 크기의 끝나지 않는 태그 열도 선형 시간에 훑는다", () => {
    const text = `<svg>${"<image".repeat(BUDGET_CODE_UNITS / 6)}`;
    expect(elapsedMs(() => expect(imageElementTags(text)).toEqual([]))).toBeLessThan(LINEAR_TIME_BUDGET_MS);
  });
});
