import { describe, expect, it } from "vitest";

import {
  DECK_BODY,
  DECK_MODULE_MAX_CHIPS,
  DECK_USAGE_MAX_FACTS,
  atlasBlockHeight,
  fitExplainScale,
  fitKeyPointsSize,
  fitModulesScale,
  footerExtraHeight,
  modulesBodyHeight,
  planSideColumn,
  planUsageLayout,
} from "./engineering-deck-atlas-fit";
import { visualWidth, wrappedLineCount } from "./engineering-deck-fit";

/**
 * 계획 함수는 "최악의 입력도 읽히게 줄이되, 보통의 입력은 줄이지 않는다"를 지킨다.
 * 실제 화면에서 넘치지 않는지는 브라우저 측정(임시 하네스)으로 따로 확인했다.
 */

describe("줄 수 어림", () => {
  it("한글은 영문보다 두 배 폭을 차지하고, 폭이 좁을수록 줄이 늘어난다", () => {
    expect(wrappedLineCount("가나다라마바사", 1.5, 40)).toBe(1);
    expect(wrappedLineCount("가".repeat(60), 1.5, 30)).toBeGreaterThan(wrappedLineCount("a".repeat(60), 1.5, 30));
    expect(wrappedLineCount("가".repeat(60), 1.5, 15)).toBeGreaterThan(wrappedLineCount("가".repeat(60), 1.5, 30));
    expect(wrappedLineCount("", 1.5, 30)).toBe(1);
    // 고정폭은 한 단위가 0.6em 이라 비례 글꼴보다 넓다.
    expect(wrappedLineCount("x".repeat(100), 1, 30, "mono")).toBeGreaterThan(wrappedLineCount("x".repeat(100), 1, 30, "prop"));
  });

  it("낱말은 중간에서 끊기지 않으므로 줄 끝에 남는 폭까지 센다", () => {
    // 낱말 셋(각 3단위)의 전체 폭은 두 줄이면 충분해 보이지만, 두 낱말이 한 줄에 안 들어가면 한 줄에 한 낱말씩 놓인다.
    const text = "abc abc abc";
    expect(Math.ceil((visualWidth(text) * 2 * 0.5 * 1.04) / 7)).toBe(2);
    expect(wrappedLineCount(text, 2, 7)).toBe(3);
    // 한 줄보다 긴 낱말은 중간에서 끊는다.
    expect(wrappedLineCount("a".repeat(40), 2, 10)).toBe(Math.ceil((40 * 2 * 0.5 * 1.04) / 10));
  });
});

describe("본문 높이", () => {
  it("제목·리드가 짧으면 거의 전체 높이를 쓰고, 길어져 접히면 줄어든다", () => {
    const short = atlasBlockHeight({ title: "OPFS", lead: "한 줄 정의", gaps: 2 });
    const long = atlasBlockHeight({ title: "가".repeat(70), lead: "가".repeat(120), gaps: 2 });
    expect(short).toBeGreaterThan(30);
    expect(short).toBeLessThanOrEqual(DECK_BODY.height);
    expect(long).toBeLessThan(short - 4);
  });

  it("꼬리의 기술 칩이 여러 줄로 접히면 그만큼 본문이 줄어든다", () => {
    expect(footerExtraHeight(undefined)).toBe(0);
    expect(footerExtraHeight(["OPFS", "Worker"])).toBe(0);
    const many = ["Durable Objects", "WebSocket", "Hibernation API", "Cloudflare Workers", "TypeScript", "Vitest", "Playwright", "Yjs", "WebRTC", "Socket.IO signaling"];
    expect(footerExtraHeight(many)).toBeGreaterThan(2);
    const base = atlasBlockHeight({ title: "제목", lead: "리드", gaps: 2 });
    expect(atlasBlockHeight({ title: "제목", lead: "리드", gaps: 2, stack: many })).toBeLessThan(base);
  });
});

describe("핵심 요점 글자 크기", () => {
  const box = { width: 24, height: 28 };

  it("짧은 요점 2~3개는 기본 크기(1.4cqw)를 쓴다", () => {
    expect(fitKeyPointsSize(["파일처럼 읽고 씁니다", "Worker에서 동기 접근"], box)).toBe(1.4);
  });

  it("64자짜리 요점 4개는 글자를 줄여 칸 안에 담는다", () => {
    const four = Array.from({ length: 4 }, (_, index) => `${"가".repeat(30)}${index}`);
    const size = fitKeyPointsSize(four, box);
    expect(size).toBeLessThan(1.4);
    expect(size).toBeGreaterThanOrEqual(0.95);
    // 칸이 더 낮으면 더 줄어들되 최소 크기 아래로는 내려가지 않는다.
    expect(fitKeyPointsSize(four, { width: 24, height: 12 })).toBe(0.95);
  });
});

describe("사용처 카드 배치", () => {
  const item = (paths: number, role = "역할을 설명하는 한 줄입니다.") => ({
    feature: "가상 스튜디오 · 접속 상태 안내",
    role,
    paths: Array.from({ length: paths }, (_, index) => `…/creator/virtual-space/studio-virtual-space-presence-${index}.ts`),
    hasRoute: true,
  });
  const height = 33;

  it("카드가 적고 짧으면 글자를 줄이지 않고 경로도 모두 보여 준다", () => {
    expect(planUsageLayout([item(1), item(1)], { hasSide: true, height })).toEqual({ scale: 1, maxPaths: Number.POSITIVE_INFINITY });
    expect(planUsageLayout([item(2)], { hasSide: false, height })).toEqual({ scale: 1, maxPaths: Number.POSITIVE_INFINITY });
    expect(planUsageLayout([], { hasSide: false, height })).toEqual({ scale: 1, maxPaths: Number.POSITIVE_INFINITY });
  });

  it("카드 4개에 경로가 많으면 배율을 먼저 줄이고, 그래도 안 되면 경로 수를 줄인다", () => {
    const rich = planUsageLayout([item(3), item(3), item(3), item(3)], { hasSide: true, height });
    expect(rich.scale).toBeLessThan(1);
    expect(rich.scale).toBeGreaterThanOrEqual(0.74);
    const cramped = planUsageLayout([item(6), item(6), item(6), item(6)], { hasSide: true, height });
    expect(cramped.maxPaths).toBeLessThan(6);
    expect(cramped.maxPaths).toBeGreaterThanOrEqual(1);
    expect(cramped.scale).toBeGreaterThanOrEqual(0.74);
  });

  it("높이가 더 낮으면 더 많이 줄인다(단조)", () => {
    const items = [item(3), item(3), item(3)];
    const roomy = planUsageLayout(items, { hasSide: true, height: 40 });
    const tight = planUsageLayout(items, { hasSide: true, height: 22 });
    expect(tight.scale).toBeLessThanOrEqual(roomy.scale);
    expect(tight.maxPaths).toBeLessThanOrEqual(roomy.maxPaths);
  });
});

describe("옆 열(facts·링크)", () => {
  const fact = (label = "허들 원격 참가자 상한", value = "3") => ({ label, value, source: "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts" });
  const link = (title = "MDN · Signaling and video calling") => ({ title, kind: "공식 문서" });
  const height = 33;

  it("내용이 없으면 계획도 비어 있다", () => {
    expect(planSideColumn([], [], height)).toEqual({ scale: 1, facts: 0, links: 0 });
  });

  it("짧으면 글자를 줄이지 않고 모두 보여 준다", () => {
    expect(planSideColumn([fact()], [link(), link("W3C · WebRTC 1.0")], height)).toEqual({ scale: 1, facts: 1, links: 2 });
  });

  it("수치 이름이 길어 여러 줄로 접히면 글자를 더 줄이거나 덜 보여 준다", () => {
    const short = planSideColumn([fact(), fact(), fact()], [link(), link()], height);
    const long = planSideColumn(
      [fact("가".repeat(50)), fact("가".repeat(50)), fact("가".repeat(50))],
      [link("A".repeat(80)), link("A".repeat(80))],
      height,
    );
    expect(long.scale < short.scale || long.facts + long.links < short.facts + short.links).toBe(true);
  });

  it("최소 배율로도 안 들어가면 링크부터, 그다음 수치를 줄이고 그 사실을 계획에 담는다", () => {
    const facts = Array.from({ length: 4 }, () => fact("가".repeat(50), "250,000 / 500,000"));
    const links = [link("가".repeat(40)), link("가".repeat(40))];
    const plan = planSideColumn(facts, links, 24);
    expect(plan.links).toBeLessThan(2);
    expect(plan.scale).toBeGreaterThanOrEqual(0.7);
    // 더 낮은 칸이면 수치도 줄인다.
    const cramped = planSideColumn(facts, links, 12);
    expect(cramped.links).toBe(0);
    expect(cramped.facts).toBeLessThan(4);
    expect(cramped.facts).toBeGreaterThanOrEqual(1);
  });

  it("수치가 상한(4개)을 넘으면 넘는 만큼은 항상 숨긴다", () => {
    const plan = planSideColumn(Array.from({ length: DECK_USAGE_MAX_FACTS + 3 }, () => fact()), [], 60);
    expect(plan.facts).toBeLessThanOrEqual(DECK_USAGE_MAX_FACTS);
  });

  it("높이가 낮을수록 더 많이 줄인다(단조)", () => {
    const facts = [fact("가".repeat(24)), fact("가".repeat(24)), fact("가".repeat(24))];
    const links = [link("가".repeat(30)), link("가".repeat(30))];
    const roomy = planSideColumn(facts, links, 44);
    const tight = planSideColumn(facts, links, 26);
    expect(tight.scale).toBeLessThanOrEqual(roomy.scale);
    expect(tight.facts + tight.links).toBeLessThanOrEqual(roomy.facts + roomy.links);
  });
});

describe("코드 면의 설명 열", () => {
  it("짧은 설명은 그대로, 긴 제목·설명·원본 경로가 겹치면 줄인다", () => {
    expect(fitExplainScale({ title: "OPFS에 바이트 쓰기", explain: "짧은 설명입니다.", extra: [] })).toBe(1);
    const scale = fitExplainScale({
      title: "Durable Objects hibernation WebSockets · 서른 줄짜리 긴 예제 제목입니다",
      explain: "가".repeat(220),
      extra: ["가".repeat(60), "가".repeat(60), "가".repeat(60)],
      source: "apps/web/src/domains/creator/virtual-space/studio-virtual-space-proximity.ts",
    });
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(0.7);
  });
});

describe("모듈 타일", () => {
  const tile = (chips: number, body = "작업 공간이 하는 일을 한두 줄로 설명합니다.") => ({
    title: "캔버스 편집기",
    body,
    stack: Array.from({ length: chips }, (_, index) => `Tech ${index}`),
    hasHref: true,
  });
  const six = (chips: number, body?: string) => Array.from({ length: 6 }, () => tile(chips, body));
  const height = modulesBodyHeight("여섯 개 작업 공간", "각 공간을 떠받치는 기술 칩을 함께 보여 줍니다.");

  it("칩이 없거나 적으면 줄이지 않는다", () => {
    expect(fitModulesScale(six(0), height)).toBe(1);
    expect(fitModulesScale(six(3), height)).toBe(1);
    expect(fitModulesScale([], height)).toBe(1);
  });

  it("본문과 칩이 길어 타일이 높아지면 글자·여백을 줄인다", () => {
    const body = "이 공간이 하는 일을 세 줄 가까이 설명하는 본문입니다. 브러시와 레이어, 합성과 내보내기까지 이어지는 흐름을 담습니다.";
    const scale = fitModulesScale(six(DECK_MODULE_MAX_CHIPS + 3, body), height);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(0.7);
  });

  it("꼬리 칩이 접히면 타일 격자 높이도 줄어든다", () => {
    expect(modulesBodyHeight("제목", "리드", ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x"].map((name) => `${name}${"x".repeat(8)}`))).toBeLessThan(modulesBodyHeight("제목", "리드"));
  });
});
