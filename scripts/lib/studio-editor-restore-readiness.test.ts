// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  buildStudioLayerNavigatorNodes,
  DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS,
  filterStudioLayerNavigatorItems,
  summarizeStudioLayerNavigator,
} from "../../apps/web/src/domains/creator/layer/studio-layer-navigator";
import { windowStudioLayerNavigatorNodes } from "../../apps/web/src/domains/creator/layer/studio-layer-navigator-window";
import {
  readStudioPageReadiness,
  readStudioRecoveryStatus,
  studioPageIsApplied,
  studioPageReadinessExpectation,
  studioRecoveryStep,
} from "../../e2e/helpers/studio-editor-restore-readiness";

const converted = {
  id: "document:legacy:page",
  elements: [
    { id: "archive", type: "draw", groupId: "archive-group", hidden: true },
    { id: "underlay", type: "draw", groupId: "paint-group" },
    { id: "converted", type: "draw", groupId: "paint-group" },
  ],
  groups: [
    { id: "archive-group", name: "이전 Mixbox 원본", hidden: true, locked: true, collapsed: true },
    { id: "paint-group", name: "합성 원본 그룹" },
  ],
};
const expected = studioPageReadinessExpectation(converted);

function layerPanel(pageKey = `${converted.id}:layers`, count = 3, ids = ["converted", "underlay"]) {
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "전문 레이어 내비게이터");
  panel.setAttribute("data-page-key", pageKey);
  const header = document.createElement("div");
  header.setAttribute("data-studio-layer-list-header", "true");
  const heading = document.createElement("h3");
  heading.textContent = `레이어 ${count.toLocaleString("ko-KR")}`;
  header.append(heading);
  panel.append(header);
  for (const id of ids) {
    const row = document.createElement("div");
    row.setAttribute("data-studio-layer-row", "true");
    row.id = `studio-layer-${id}`;
    panel.append(row);
  }
  document.body.append(panel);
  return panel;
}

function recovery(buttonLabel: string | null, busy = false, error?: string) {
  const notice = document.createElement("section");
  notice.setAttribute("data-studio-recovery-notice", "");
  notice.setAttribute("aria-busy", String(busy));
  if (buttonLabel !== null) {
    const button = document.createElement("button");
    button.textContent = buttonLabel;
    notice.append(button);
  }
  if (error) {
    const alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    alert.textContent = error;
    notice.append(alert);
  }
  document.body.append(notice);
  return notice;
}

afterEach(() => document.body.replaceChildren());

describe("실제 메모리 DOM을 이용한 원고 복원 준비", () => {
  it("캔버스만 보이거나 내구 저장에 원고가 있어도 통과하지 않는다", () => {
    document.body.innerHTML = '<div data-studio-canvas-viewport><canvas></canvas></div>';
    localStorage.setItem("qa-durable-document", JSON.stringify(converted));
    expect(studioPageIsApplied(readStudioPageReadiness(), expected)).toBe(false);
    localStorage.removeItem("qa-durable-document");
  });

  it("':'가 있는 정확한 페이지 ID와 두 실제 레이어 패널 suffix를 허용한다", () => {
    const panel = layerPanel();
    expect(studioPageIsApplied(readStudioPageReadiness(), expected)).toBe(true);
    panel.setAttribute("data-page-key", `${converted.id}:split`);
    expect(studioPageIsApplied(readStudioPageReadiness(), expected)).toBe(true);
    panel.setAttribute("data-page-key", "document:layers");
    expect(studioPageIsApplied(readStudioPageReadiness(), expected)).toBe(false);
  });

  it.each([
    ["bootstrap:layers", 0, []],
    [`${converted.id}:layers`, 2, ["converted", "underlay"]],
    [`${converted.id}:layers`, 3, ["other", "underlay"]],
    [`${converted.id}:layers`, 3, ["converted"]],
    [`${converted.id}:other`, 3, ["converted", "underlay"]],
  ] as const)("잘못된 메모리 identity/count/행은 준비 완료가 아니다: %s / %s", (key, count, ids) => {
    layerPanel(key, count, [...ids]);
    expect(studioPageIsApplied(readStudioPageReadiness(), expected)).toBe(false);
  });

  it("접힌 원본의 미마운트 행과 전체 요소 수를 구분하고 원고를 바꾸지 않는다", () => {
    const before = JSON.stringify(converted);
    const items = converted.elements.map((element) => ({ ...element, label: element.id }));
    const stats = summarizeStudioLayerNavigator(items, converted.groups);
    const results = filterStudioLayerNavigatorItems(items, converted.groups, "", DEFAULT_STUDIO_LAYER_NAVIGATOR_FILTERS);
    const nodes = buildStudioLayerNavigatorNodes(results, converted.groups, { filterActive: false });
    const window = windowStudioLayerNavigatorNodes(nodes, 160);
    expect(stats.total).toBe(converted.elements.length);
    expect(stats.total).toBe(3);
    expect(stats.hidden).toBe(1);
    expect(window.renderedItemCount).toBe(2);
    expect(expected).toEqual({ pageId: converted.id, elementCount: 3, renderedElementIds: ["converted", "underlay"] });
    layerPanel(`${converted.id}:layers`, stats.total);
    expect(studioPageIsApplied(readStudioPageReadiness(), expected)).toBe(true);
    expect(JSON.stringify(converted)).toBe(before);
  });

  it("관측 패널이 둘이면 임의의 첫 패널을 성공으로 고르지 않는다", () => {
    layerPanel(); layerPanel();
    expect(studioPageIsApplied(readStudioPageReadiness(), expected)).toBe(false);
  });

  it("기대 페이지/요소 identity가 없거나 중복되면 검사를 중단한다", () => {
    expect(() => studioPageReadinessExpectation({ elements: [] })).toThrow();
    expect(() => studioPageReadinessExpectation({ id: "page", elements: [{}] })).toThrow();
    expect(() => studioPageReadinessExpectation({ id: "page", elements: [{ id: "same" }, { id: "same" }] })).toThrow();
  });
});

describe("자동 복원과 실제 수동 fallback 구분", () => {
  it("자동 완료 후 버튼/안내가 없어도 메모리 검사를 계속할 수 있다", () => {
    expect(studioRecoveryStep(readStudioRecoveryStatus(), false)).toBe("absent");
  });

  it("메모리 DOM이 맞아도 pending 자동 복원을 완료로 보지 않는다", () => {
    layerPanel(); recovery(null, true);
    expect(studioPageIsApplied(readStudioPageReadiness(), expected)).toBe(false);
    expect(studioRecoveryStep(readStudioRecoveryStatus(), false)).toBe("pending");
  });

  it.each(["이어서 그리기", "다시 이어 열기"])("'%s'는 최초 요청만 허용하고 미적용/취소를 성공으로 보지 않는다", (label) => {
    recovery(label);
    expect(studioRecoveryStep(readStudioRecoveryStatus(), false)).toBe("request-manual");
    expect(studioRecoveryStep(readStudioRecoveryStatus(), true)).toBe("manual-not-applied");
  });

  it("자동 오류 후 명시 요청은 허용하지만 그 요청의 오류를 재클릭하지 않는다", () => {
    recovery("다시 이어 열기", false, "요청을 마치지 못했어요.");
    expect(studioRecoveryStep(readStudioRecoveryStatus(), false)).toBe("request-manual");
    expect(studioRecoveryStep(readStudioRecoveryStatus(), true)).toBe("manual-failed");
  });

  it("백업 전용 또는 비활성 복원 버튼은 복원 성공/요청으로 간주하지 않는다", () => {
    const notice = recovery("백업 파일 받기");
    expect(studioRecoveryStep(readStudioRecoveryStatus(), false)).toBe("blocked");
    const button = notice.querySelector("button");
    if (!button) throw new Error("fixture 복원 버튼이 없습니다.");
    button.textContent = "다시 이어 열기";
    button.disabled = true;
    expect(studioRecoveryStep(readStudioRecoveryStatus(), false)).toBe("blocked");
  });
});
