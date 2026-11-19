// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { listDeliveryPanels, panelScriptText, type PanelPage } from "./studio-panel-delivery";

const pages: PanelPage[] = [
  { id: "plain", elements: [{ type: "text", id: "opening", text: "해가 지기 시작한다." }] },
  { id: "layered", elements: [
    { type: "frame", id: "right", x: 100, y: 0, width: 100, height: 100, order: 2, storyBeat: { summary: "편지를 내려놓는다." } },
    { type: "frame", id: "left", x: 0, y: 0, width: 100, height: 100, order: 1, storyBeat: { summary: "두 사람이 만난다." } },
    { type: "text", id: "margin", text: "다음 날", x: 110, y: 250 },
    { type: "bubble", id: "long", text: "늦어서 미안해. ".repeat(200), x: 12, y: 15 },
    { type: "bubble", id: "hidden", text: "퇴고 전 대사", hidden: true, x: 10, y: 10 },
  ] },
];

describe("컷 순서에 맞춘 작가용 글콘티", () => {
  it("선택한 페이지 안에서 컷 순서·장면 설명·수정된 대사 전문·컷 밖 자막을 보존한다", () => {
    const plan = listDeliveryPanels(pages, [1]);
    expect(plan.panels.map(p => p.frame?.id)).toEqual(["left", "right"]);
    const text = panelScriptText("저녁 우체국", plan);
    expect(text.indexOf("두 사람이 만난다.")).toBeLessThan(text.indexOf("편지를 내려놓는다."));
    expect(text).toContain("늦어서 미안해. ".repeat(200));
    expect(text).toContain("2페이지 · 컷 밖의 글\n다음 날");
    expect(text).not.toContain("퇴고 전 대사");
    expect(text).not.toContain("해가 지기 시작한다.");
  });

  it("컷선이나 그림이 없는 페이지의 문장도 한 컷으로 저장한다", () => {
    const plan = listDeliveryPanels(pages, [0]);
    expect(plan.panels).toHaveLength(1);
    expect(panelScriptText("", plan)).toContain("1페이지 · 1컷\n해가 지기 시작한다.");
    expect(() => listDeliveryPanels(pages, [2])).toThrow("선택한 페이지");
  });

  it("컷 밖 자막은 다음 페이지가 시작되기 전에 해당 쪽의 끝에 둔다", () => {
    const text = panelScriptText("", listDeliveryPanels(pages, [1, 0]));
    expect(text.indexOf("다음 날")).toBeGreaterThan(text.indexOf("편지를 내려놓는다."));
    expect(text.indexOf("다음 날")).toBeLessThan(text.indexOf("해가 지기 시작한다."));
  });
});
