// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MockLabProvider } from "../../testing/mock-store";

import { InspectorTabs, panelForTab } from "./InspectorTabs";
import { createUiStateStore, INSPECTOR_TAB_IDS } from "./ui-state";

afterEach(cleanup);

function PosePanelStub() {
  return <p>포즈 패널 스텁</p>;
}

describe("app/shell/InspectorTabs", () => {
  it("탭 9개를 그리고 없는 패널은 미조립 안내를 보여준다", () => {
    const ui = createUiStateStore();
    render(
      <MockLabProvider shell={{ ui }}>
        <InspectorTabs panels={{ PosePanel: PosePanelStub }} />
      </MockLabProvider>,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(INSPECTOR_TAB_IDS.length);
    expect(screen.getByRole("tabpanel").textContent).toContain("ParamPanel");
    expect(screen.getByRole("tabpanel").textContent).toContain("조립되지 않았습니다");
    fireEvent.click(screen.getByRole("tab", { name: "포즈" }));
    expect(ui.getState().inspectorTab).toBe("pose");
    expect(screen.getByText("포즈 패널 스텁")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "포즈" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "포즈" }).getAttribute("data-missing")).toBeNull();
    expect(screen.getByRole("tab", { name: "렌더" }).getAttribute("data-missing")).toBe("true");
  });

  it("panelForTab은 탭과 패널 키를 1:1로 잇는다", () => {
    expect(panelForTab({ ExportPanel: PosePanelStub }, "export")).toBe(PosePanelStub);
    expect(panelForTab({}, "vision")).toBeUndefined();
  });

  it("roving tabIndex(선택 탭만 0, 나머지 -1)와 방향키·Home·End 키보드 이동을 지원한다", () => {
    const ui = createUiStateStore();
    render(
      <MockLabProvider shell={{ ui }}>
        <InspectorTabs panels={{ PosePanel: PosePanelStub }} />
      </MockLabProvider>,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]?.getAttribute("tabindex")).toBe("0");
    expect(tabs.slice(1).every((t) => t.getAttribute("tabindex") === "-1")).toBe(true);

    tabs[0]?.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(ui.getState().inspectorTab).toBe("expression");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "표정" }));
    expect(screen.getByRole("tab", { name: "표정" }).getAttribute("tabindex")).toBe("0");
    expect(tabs[0]?.getAttribute("tabindex")).toBe("-1");

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(ui.getState().inspectorTab).toBe("export");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "내보내기" }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(ui.getState().inspectorTab).toBe("param");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "파라미터" }));

    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(ui.getState().inspectorTab).toBe("export");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "내보내기" }));

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(ui.getState().inspectorTab).toBe("param");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "파라미터" }));
  });
});
