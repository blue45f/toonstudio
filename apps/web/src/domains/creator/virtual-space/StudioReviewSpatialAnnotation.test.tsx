// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioReviewSpatialAnchor, deriveStudioReviewPageMapping, type StudioReviewMappedPage } from "@toonstudio/studio-project-model";
import { StudioReviewSpatialAnnotation, type StudioReviewAnnotationSelection } from "./StudioReviewSpatialAnnotation";

const mapping = deriveStudioReviewPageMapping({ width: 800, pagesList: [{ id: "page-a", canvasH: 1200,
  elements: [{ id: "frame-a", type: "frame", x: 100, y: 100, width: 300, height: 400 }, { id: "text-a", type: "text" }] }] },
{ sourceServerRevision: 7, sourceContentDigest: "a".repeat(64), ordinal: 0, renderWidth: 1600, renderHeight: 2400 }) as StudioReviewMappedPage;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup(disabled = false) {
  const choose = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState<StudioReviewAnnotationSelection | null>(null);
    return <StudioReviewSpatialAnnotation mapping={mapping} sha256={"b".repeat(64)} expiresAt={Date.now() + 30_000}
      control={{ selected, disabled, onSelect: (value) => { choose(value); setSelected(value); } }}><img alt="Page pixels" src="/test.png" /></StudioReviewSpatialAnnotation>;
  }
  const rendered = render(<Harness />);
  return { choose, ...rendered };
}
const mode = (value: string) => fireEvent.change(screen.getByLabelText("위치 방식"), { target: { value } });
const apply = () => fireEvent.click(screen.getByRole("button", { name: "이 위치에 의견 연결" }));
describe("source-mapped spatial placement", () => {
  it.each(["pen", "coordinate", "region"])("%s 배치 중 원고 이미지의 기본 드래그가 포인터 입력을 취소하지 않게 한다", (placement) => {
    setup(); mode(placement);
    const event = new MouseEvent("dragstart", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("img"), event);
    expect(event.defaultPrevented).toBe(true);
  });
  it("위치 배치를 사용하지 않을 때는 원고 이미지의 기본 드래그를 유지한다", () => {
    setup();
    const event = new MouseEvent("dragstart", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("img"), event);
    expect(event.defaultPrevented).toBe(false);
  });
  it("requires explicit page, cut and object selection and preserves their authoring IDs", () => {
    const { choose } = setup(); expect(choose).not.toHaveBeenCalled(); apply();
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "page", source: { pageId: "page-a", pageOrdinal: 0 } });
    mode("panel"); expect((screen.getByRole("button", { name: "이 위치에 의견 연결" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("연결할 컷"), { target: { value: "frame-a" } }); apply();
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "panel", source: { frameId: "frame-a" } });
    mode("object"); fireEvent.change(screen.getByLabelText("연결할 요소"), { target: { value: "text-a" } }); apply();
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "object", objectId: "text-a", source: { elementId: "text-a" } });
    expect(choose.mock.lastCall?.[0].anchor.source).not.toHaveProperty("frameId");
  });
  it("offers keyboard percentages for points and regions and rejects out-of-page selections", () => {
    const { choose } = setup(); mode("region");
    for (const [label, value] of [["가로 위치 (%)", "10"], ["세로 위치 (%)", "20"], ["너비 (%)", "30"], ["높이 (%)", "40"]]) {
      fireEvent.change(screen.getByLabelText(label!), { target: { value } });
    }
    apply(); expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "region", x: 80, y: 240, width: 240, height: 480 });
    fireEvent.change(screen.getByLabelText("가로 위치 (%)"), { target: { value: "90" } }); apply();
    expect(choose.mock.lastCall?.[0]).toBeNull(); expect(screen.getByRole("alert")).toBeTruthy();
    mode("coordinate"); fireEvent.change(screen.getByLabelText("가로 위치 (%)"), { target: { value: "25" } }); apply();
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "coordinate", x: 200, y: 240 });
  });
  it("uses the displayed image bounds for pointer drag without confusing export pixels with source pixels", () => {
    const { choose } = setup(); mode("region");
    const image = screen.getByRole("img"), surface = image.parentElement!;
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1600 }, naturalHeight: { value: 2400 } });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, right: 500, bottom: 650, width: 400, height: 600, x: 100, y: 50, toJSON: () => ({}) });
    const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, "pointerId", { value: 1 }); fireEvent(surface, event); };
    pointer("pointerdown", 140, 110); pointer("pointerup", 220, 230);
    expect(choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "region", x: 80, y: 120, width: 160, height: 240 });
  });
  it("keeps saved note highlighting independent from new comment placement", () => {
    const choose = vi.fn(), spatial = createStudioReviewSpatialAnchor(mapping, { kind: "panel", frameId: "frame-a" })!;
    const note = { id: "note", body: "Saved cut note", anchor: { ...spatial, artifactId: "artifact", revisionId: "snapshot", scope: { projectId: "project" } } };
    const mounted = render(<StudioReviewSpatialAnnotation mapping={mapping} sha256={"b".repeat(64)} expiresAt={Date.now() + 30_000}
      control={{ selected: null, disabled: true, onSelect: choose }} editable={false} notes={[note]}><img alt="Page" src="/test.png" /></StudioReviewSpatialAnnotation>);
    expect(screen.queryByLabelText("위치 방식")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /의견 1 위치 보기/u }));
    expect(mounted.container.querySelector("svg rect")?.getAttribute("x")).toBe("100");
    expect(screen.getByRole("status").textContent).toContain("컷 1"); expect(choose).not.toHaveBeenCalled();
  });
  it("disables placement while a note is saving", () => { const { choose } = setup(true); apply(); expect(choose).not.toHaveBeenCalled(); });
  it("draws pen strokes and attaches them with a region anchor", () => {
    const { choose } = setup(); mode("pen");
    const image = screen.getByRole("img"), surface = image.parentElement!;
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1600 }, naturalHeight: { value: 2400 } });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, right: 500, bottom: 650, width: 400, height: 600, x: 100, y: 50, toJSON: () => ({}) });
    const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, "pointerId", { value: 1 }); fireEvent(surface, event); };
    expect((screen.getByRole("button", { name: "이 위치에 의견 연결" }) as HTMLButtonElement).disabled).toBe(true);
    pointer("pointerdown", 140, 110); pointer("pointermove", 180, 170); pointer("pointermove", 220, 230); pointer("pointerup", 220, 230);
    expect(screen.getByRole("status").textContent).toContain("1개");
    apply();
    const selection = choose.mock.lastCall?.[0] as StudioReviewAnnotationSelection;
    expect(selection.anchor).toMatchObject({ kind: "region", x: 80, y: 120, width: 160, height: 240 });
    expect(selection.strokes).toHaveLength(1);
    expect(selection.strokes?.[0].points.length).toBeGreaterThanOrEqual(2);
    expect(selection.strokes?.[0].color).toBe("#e5484d");
  });
  it("컷에서 펜으로 전환하면 현재 컷 범위를 표시하고 명시적으로 해제한 뒤 다른 위치의 획을 연결한다", () => {
    const { choose } = setup(); mode("panel");
    fireEvent.change(screen.getByLabelText("연결할 컷"), { target: { value: "frame-a" } });
    apply();
    expect(choose.mock.lastCall?.[0].anchor.source.frameId).toBe("frame-a");
    mode("pen");
    const cut = screen.getByLabelText("연결할 컷");
    expect(cut).toHaveProperty("value", "frame-a");
    expect(screen.getByRole("option", { name: "페이지 전체 범위" }).getAttribute("value")).toBe("");
    const image = screen.getByRole("img"), surface = image.parentElement;
    if (!surface) throw new Error("원고 pointer stage가 없습니다.");
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1600 }, naturalHeight: { value: 2400 } });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, right: 500, bottom: 650, width: 400, height: 600, x: 100, y: 50, toJSON: () => ({}) });
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
      Object.defineProperty(event, "pointerId", { value: 1 }); fireEvent(surface, event);
    };
    const drawOutsideCut = () => { pointer("pointerdown", 350, 350); pointer("pointermove", 400, 425); pointer("pointerup", 400, 425); };
    drawOutsideCut(); choose.mockClear(); apply();
    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose.mock.lastCall?.[0]).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("펜 획의 위치를 페이지 안에 맞게");
    fireEvent.change(cut, { target: { value: "" } });
    expect(cut).toHaveProperty("value", "");
    expect(screen.queryByRole("alert")).toBeNull();
    drawOutsideCut(); apply();
    const selection: StudioReviewAnnotationSelection | null | undefined = choose.mock.lastCall?.[0];
    if (!selection) throw new Error("페이지 전체 범위의 펜 의견이 연결되지 않았습니다.");
    expect(selection.anchor).toMatchObject({ kind: "region", x: 500, y: 600, width: 100, height: 150,
      source: { pageId: "page-a", pageOrdinal: 0, sourceServerRevision: 7, sourceContentDigest: "a".repeat(64) } });
    expect(selection.anchor.source).not.toHaveProperty("frameId");
    expect(selection.strokes).toHaveLength(1);
    expect(selection.strokes?.[0]?.points).toEqual([{ x: 500, y: 600 }, { x: 600, y: 750 }]);
  });
  it("undoes pen strokes one at a time", () => {
    setup(); mode("pen");
    const image = screen.getByRole("img"), surface = image.parentElement!;
    Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1600 }, naturalHeight: { value: 2400 } });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 100, top: 50, right: 500, bottom: 650, width: 400, height: 600, x: 100, y: 50, toJSON: () => ({}) });
    const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, "pointerId", { value: 1 }); fireEvent(surface, event); };
    const draw = () => { pointer("pointerdown", 140, 110); pointer("pointermove", 220, 230); pointer("pointerup", 220, 230); };
    draw(); draw();
    expect(screen.getByRole("status").textContent).toContain("2개");
    fireEvent.click(screen.getByRole("button", { name: "마지막 획 지우기" }));
    expect(screen.getByRole("status").textContent).toContain("1개");
    fireEvent.click(screen.getByRole("button", { name: "펜 획 모두 지우기" }));
    expect((screen.getByRole("button", { name: "이 위치에 의견 연결" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("renders saved pen strokes when a note location is shown", () => {
    const choose = vi.fn(), spatial = createStudioReviewSpatialAnchor(mapping, { kind: "region", x: 10, y: 10, width: 20, height: 20 })!;
    const note = { id: "note", body: "Pen note", anchor: { ...spatial, artifactId: "artifact", revisionId: "snapshot", scope: { projectId: "project" } },
      strokes: [{ id: "s1", points: [{ x: 10, y: 10 }, { x: 30, y: 30 }], color: "#e5484d", width: 4 }] };
    const mounted = render(<StudioReviewSpatialAnnotation mapping={mapping} sha256={"b".repeat(64)} expiresAt={Date.now() + 30_000}
      control={{ selected: null, disabled: true, onSelect: choose }} editable={false} notes={[note]}><img alt="Page" src="/test.png" /></StudioReviewSpatialAnnotation>);
    expect(screen.getByRole("button", { name: /의견 1 위치 보기/u }).textContent).toContain("1개");
    fireEvent.click(screen.getByRole("button", { name: /의견 1 위치 보기/u }));
    expect(mounted.container.querySelector("svg polyline")).toBeTruthy();
    expect(choose).not.toHaveBeenCalled();
  });
});
