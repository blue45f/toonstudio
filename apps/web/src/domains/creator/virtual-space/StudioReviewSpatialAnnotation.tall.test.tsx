// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioReviewSpatialAnchor, deriveStudioReviewPageMapping } from "@toonstudio/studio-project-model";
import { StudioReviewSpatialAnnotation, type StudioReviewAnnotationSelection } from "./StudioReviewSpatialAnnotation";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup(withSavedNote = false) {
  const mapping = deriveStudioReviewPageMapping({ width: 800, pagesList: [{ id: "long-page", canvasH: 16000, elements: [] }] },
    { sourceServerRevision: 7, sourceContentDigest: "a".repeat(64), ordinal: 0, renderWidth: 1600, renderHeight: 32000 });
  if (mapping.status !== "mapped") throw new Error("긴 원고의 고정 mapping fixture가 없습니다.");
  const mapped = mapping;
  const anchor = createStudioReviewSpatialAnchor(mapping, { kind: "coordinate", x: 160, y: 12000 });
  if (!anchor) throw new Error("하단 의견의 고정 anchor fixture가 없습니다.");
  const notes = withSavedNote ? [{ id: "bottom-note", body: "하단 표정 확인",
    anchor: { ...anchor, artifactId: "artifact", revisionId: "snapshot", scope: { projectId: "project" } } }] : [];
  const choose = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState<StudioReviewAnnotationSelection | null>(null);
    return <StudioReviewSpatialAnnotation mapping={mapped} sha256={"b".repeat(64)} expiresAt={Date.now() + 30_000} notes={notes}
      control={{ selected, disabled: false, onSelect: (value) => { choose(value); setSelected(value); } }}>
      <img alt="긴 고정 원고" src="/long.png" />
    </StudioReviewSpatialAnnotation>;
  }
  const rendered = render(<Harness />), image = screen.getByRole("img"), surface = image.parentElement;
  if (!surface) throw new Error("원고 pointer stage가 없습니다.");
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 1600 }, naturalHeight: { value: 32000 } });
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({ left: 20, top: -5600, right: 420, bottom: 2400,
    width: 400, height: 8000, x: 20, y: -5600, toJSON: () => ({}) });
  const pointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 1 }); fireEvent(surface, event);
  };
  const mode = (value: string) => {
    fireEvent.change(screen.getByLabelText("위치 방식"), { target: { value } });
    // 기존 방식 전환의 선택 해제와 이후 표시 이동의 부수 효과를 구분한다.
    choose.mockClear();
  };
  return { choose, pointer, mode, surface, ...rendered };
}

describe("긴 원고 확대·이동과 정본 좌표", () => {
  it("스크롤로 stage top이 음수가 되어도 정본의 하단 좌표를 보정 중복 없이 고정한다", () => {
    const h = setup(); h.mode("coordinate");
    screen.getByRole("region", { name: "1페이지 원고 이동 영역" }).scrollTop = 5600;
    h.pointer("pointerdown", 100, 400); h.pointer("pointerup", 100, 400);
    expect(h.choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "coordinate", x: 160, y: 12000,
      source: { pageId: "long-page", pageOrdinal: 0, sourceServerRevision: 7, sourceContentDigest: "a".repeat(64) } });
    fireEvent.change(screen.getByRole("combobox", { name: "원고 배율" }), { target: { value: "200" } });
    expect(h.choose).toHaveBeenCalledTimes(1);
    expect(h.container.querySelector("circle")?.getAttribute("cy")).toBe("12000");
    expect(h.container.querySelector("circle")?.getAttribute("r")).toBe("6.4");
    vi.mocked(h.surface.getBoundingClientRect).mockReturnValue({ left: 20, top: -11800, right: 820, bottom: 4200,
      width: 800, height: 16000, x: 20, y: -11800, toJSON: () => ({}) });
    h.pointer("pointerdown", 180, 200); h.pointer("pointerup", 180, 200);
    expect(h.choose).toHaveBeenCalledTimes(2);
    expect(h.choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "coordinate", x: 160, y: 12000 });
  });

  it("키보드의 세로 75%는 표시 높이 대신 정본 16000px의 75%로 저장한다", () => {
    const h = setup(); h.mode("coordinate");
    fireEvent.change(screen.getByLabelText("세로 위치 (%)"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "이 위치에 의견 연결" }));
    expect(h.choose.mock.lastCall?.[0].anchor).toMatchObject({ kind: "coordinate", x: 400, y: 12000 });
  });

  it("75점 획을 유지한 채 이동·확대하고 같은 정본 획으로 의견을 연결한다", () => {
    const h = setup(); h.mode("pen");
    h.pointer("pointerdown", 100, 400);
    for (let index = 1; index < 75; index++) h.pointer("pointermove", 100 + index, 400 + index);
    h.pointer("pointerup", 174, 474);
    const original = h.container.querySelector("polyline")?.getAttribute("points");
    fireEvent.click(screen.getByRole("button", { name: "원고 이동" }));
    expect(h.surface.style.touchAction).toBe("auto");
    h.pointer("pointerdown", 200, 500); h.pointer("pointerup", 300, 600);
    expect(h.choose).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "원고 배율" }), { target: { value: "200" } });
    expect(h.container.querySelector("polyline")?.getAttribute("points")).toBe(original);
    fireEvent.click(screen.getByRole("button", { name: "펜·위치 입력으로 돌아가기" }));
    expect(h.surface.style.touchAction).toBe("none");
    expect((screen.getByLabelText("위치 방식") as HTMLSelectElement).value).toBe("pen");
    fireEvent.click(screen.getByRole("button", { name: "이 위치에 의견 연결" }));
    const selection: StudioReviewAnnotationSelection | undefined = h.choose.mock.lastCall?.[0];
    expect(selection?.strokes).toHaveLength(1);
    expect(selection?.strokes?.[0]).toMatchObject({ width: 3.2, color: "#e5484d" });
    expect(selection?.strokes?.[0]?.points).toHaveLength(75);
    expect(selection?.anchor).toMatchObject({ x: 160, y: 12000, width: 148, height: 148 });
  });

  it.each(["scale", "scroll", "resize", "pan"])("%s 중인 미완성 획은 취소하여 서로 다른 표시 위치의 점을 섞지 않는다", (change) => {
    const h = setup(); h.mode("pen");
    h.pointer("pointerdown", 100, 400); h.pointer("pointermove", 110, 410);
    if (change === "scale") fireEvent.change(screen.getByRole("combobox", { name: "원고 배율" }), { target: { value: "200" } });
    if (change === "scroll") fireEvent.scroll(screen.getByRole("region", { name: "1페이지 원고 이동 영역" }));
    if (change === "resize") fireEvent.resize(window);
    if (change === "pan") fireEvent.click(screen.getByRole("button", { name: "원고 이동" }));
    h.pointer("pointerup", 120, 420);
    expect(screen.getByRole("button", { name: "이 위치에 의견 연결" }).hasAttribute("disabled")).toBe(true);
    expect(h.choose).not.toHaveBeenCalled();
  });

  it("하단에 저장된 의견의 위치 보기는 viewport만 이동하고 새 anchor를 저장하지 않는다", () => {
    const h = setup(true);
    const region = screen.getByRole("region", { name: "1페이지 원고 이동 영역" }), scroll = vi.fn();
    Object.defineProperties(region, { scrollTo: { configurable: true, value: scroll },
      clientWidth: { configurable: true, value: 400 }, clientHeight: { configurable: true, value: 600 } });
    const stage = region.firstElementChild;
    if (!stage) throw new Error("원고 표시 stage가 없습니다.");
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 400, bottom: 8000,
      width: 400, height: 8000, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(screen.getByRole("button", { name: /의견 1 위치 보기/ }));
    expect(scroll).toHaveBeenCalledWith({ left: 0, top: 5700 });
    expect(h.choose).not.toHaveBeenCalled();
    expect(h.container.querySelector("circle")?.getAttribute("cy")).toBe("12000");
  });
});
