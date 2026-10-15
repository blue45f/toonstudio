// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioLoreNameCheckPanel } from "./StudioLoreNameCheckPanel";
import * as loreNameCheck from "./studio-lore-name-check";
import type { LoreNameDictionary } from "./studio-lore-name-check";

vi.mock("./studio-lore-name-check", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-lore-name-check")>();
  return { ...actual, checkLoreNames: vi.fn(actual.checkLoreNames) };
});

const checkLoreNames = vi.mocked(loreNameCheck.checkLoreNames);

const dictionaryBefore: LoreNameDictionary = [
  { sourceKind: "character", sourceId: "mina", loreKind: null, canonical: "미나", aliases: [] },
];
const dictionaryAfter: LoreNameDictionary = [
  ...dictionaryBefore,
  { sourceKind: "character", sourceId: "doyun", loreKind: null, canonical: "도윤", aliases: [] },
];

function typeText(value: string) {
  fireEvent.change(screen.getByLabelText(/검사할 글/u), { target: { value } });
}

describe("StudioLoreNameCheckPanel 사전 변경 재검사", () => {
  beforeEach(() => {
    checkLoreNames.mockClear();
  });
  afterEach(cleanup);

  it("이미 검사한 글은 사전이 바뀌면 그 순간의 최신 글로 다시 검사한다", () => {
    const { rerender } = render(<StudioLoreNameCheckPanel dictionary={dictionaryBefore} />);
    typeText("미나가 도윤을 불렀다");
    fireEvent.click(screen.getByRole("button", { name: "검사하기" }));
    expect(checkLoreNames).toHaveBeenCalledTimes(1);

    // 검사 뒤에 글을 고쳐도 사전이 그대로면 다시 검사하지 않는다.
    typeText("미나가 도윤을 크게 불렀다");
    expect(checkLoreNames).toHaveBeenCalledTimes(1);

    rerender(<StudioLoreNameCheckPanel dictionary={dictionaryAfter} />);

    expect(checkLoreNames).toHaveBeenCalledTimes(2);
    expect(checkLoreNames).toHaveBeenLastCalledWith("미나가 도윤을 크게 불렀다", dictionaryAfter);
  });

  it("아직 검사하지 않았다면 사전이 바뀌어도 검사하지 않는다", () => {
    const { rerender } = render(<StudioLoreNameCheckPanel dictionary={dictionaryBefore} />);
    typeText("미나가 도윤을 불렀다");

    rerender(<StudioLoreNameCheckPanel dictionary={dictionaryAfter} />);

    expect(checkLoreNames).not.toHaveBeenCalled();
  });
});
