import { describe, expect, it, vi } from "vitest";
import { applyStudioLtToManuscript, createStudioLtImagePair } from "./studio-lt-image-insert";
import type { StudioLtPngPair } from "./studio-lt-raster-output";

const pair: StudioLtPngPair = [
  { name: "LT 선화", src: "data:image/png;base64,bGluZQ==", width: 250, height: 400 },
  { name: "LT 톤", src: "data:image/png;base64,dG9uZQ==", width: 250, height: 400 },
];
function canvas() {
  let seq = 0;
  return { canvasWidth: 1000, canvasHeight: 1300, placement: { anchor: { x: 200, y: 280 } }, uid: () => String(++seq) };
}
describe("LT 원고 이미지 삽입", () => {
  it("하나의 배치에 톤을 먼저 두고 선화를 위에 쌓는다", () => {
    const result = createStudioLtImagePair(pair, canvas());
    expect(result?.map(({ name, id }) => [name, id])).toEqual([["LT 톤", "1"], ["LT 선화", "2"]]);
    const rect = result?.map(({ x, y, width, height }) => [x, y, width, height]);
    expect(rect?.[0]).toEqual(rect?.[1]);
  });
  it("크기가 다르거나 PNG가 없으면 어느 레이어도 만들지 않는다", () => {
    expect(createStudioLtImagePair([pair[0], { ...pair[1], width: 500 }], canvas())).toBeNull();
    expect(createStudioLtImagePair([{ ...pair[0], src: "" }, pair[1]], canvas())).toBeNull();
  });
});

it("열었던 원고, 권한과 검수 잠금을 검사한 후에만 두 레이어를 함께 커밋한다", () => {
  const commit = vi.fn(() => true);
  const context = { layers: pair, openedPageId: "a", currentPageId: "a", locked: false, canvas, commit,
    ticket: { authScopeKey: "user", workId: "work", accessGeneration: 1, documentGeneration: 2 }, admit: () => true };
  for (const rejected of [{ openedPageId: "b" }, { locked: true }, { ticket: null }, { admit: () => false }]) {
    expect(applyStudioLtToManuscript({ ...context, ...rejected })).toBe(false);
  }
  expect(commit).not.toHaveBeenCalled();
  expect(applyStudioLtToManuscript(context)).toBe(true);
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.lastCall).toEqual([createStudioLtImagePair(pair, canvas()), "a"]);
});
