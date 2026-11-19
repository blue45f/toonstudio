// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, it, expect } from "vitest";
import type { ImageEl } from "../studio-element-model";
import { imageFilterCacheKey } from "../render/studio-konva-filter-fields";
import { StudioAppliedFilterPresentation } from "./StudioAppliedFilterPresentation";
import { useStudioAppliedFilterDraw, useStudioAppliedFilterIntent } from "./studio-applied-filter-context";

const filtered: ImageEl = {
  id: "image", src: "local.png", type: "image", width: 20, height: 20,
  x: 0, y: 0, rotation: 0, brightness: 0.4,
};
const original: ImageEl = { ...filtered, brightness: 0 };
afterEach(cleanup);

function CanvasProbe({ image, request = "first", eligible = true }: {
  image: ImageEl; request?: string; eligible?: boolean;
}) {
  const apply = useStudioAppliedFilterIntent();
  const draw = useStudioAppliedFilterDraw(image, imageFilterCacheKey(image), request, eligible);
  return <><button onClick={() => apply?.(filtered)}>apply</button><button onClick={draw}>draw</button></>;
}
function scene(selected = filtered, image = selected, request = "first", eligible = true, scope = "page1") {
  return <StudioAppliedFilterPresentation scope={scope} selected={selected}>
    <CanvasProbe image={image} request={request} eligible={eligible} />
  </StudioAppliedFilterPresentation>;
}

it("적용한 정본 레이어의 실제 draw만 진행 표시를 끝낸다", () => {
  const page = render(scene());
  expect(screen.queryByRole("progressbar")).toBeNull();
  fireEvent.click(screen.getByText("apply"));
  expect(screen.getByRole("progressbar").getAttribute("aria-busy")).toBe("true");
  const firstDraw = screen.getByText("draw");
  page.rerender(scene(filtered, original));
  expect(screen.queryByRole("progressbar")).toBeNull();
  fireEvent.click(firstDraw);
  page.rerender(scene(filtered, filtered, "second"));
  expect(screen.getByRole("progressbar")).toBeTruthy();
  fireEvent.click(screen.getByText("draw"));
  expect(screen.queryByRole("progressbar")).toBeNull();
});

it("실행 취소·재실행, 선택·문서 변경, 실패·언마운트에서 이전 작업 안내를 정리한다", () => {
  const page = render(scene());
  fireEvent.click(screen.getByText("apply"));
  for (const changed of [
    scene(original), scene({ ...filtered, id: "another" }),
    scene(filtered, filtered, "first", true, "page2"), scene(filtered, filtered, "first", false),
  ]) {
    page.rerender(changed);
    expect(screen.queryByRole("progressbar")).toBeNull();
    page.rerender(scene());
    expect(screen.getByRole("progressbar")).toBeTruthy();
  }
  act(() => page.unmount());
  expect(screen.queryByRole("progressbar")).toBeNull();
});
