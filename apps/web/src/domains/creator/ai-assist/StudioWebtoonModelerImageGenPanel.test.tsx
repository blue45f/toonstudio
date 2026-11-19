// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioWebtoonModelerImageGenPanel } from "./StudioWebtoonModelerImageGenPanel";

afterEach(cleanup);

describe("StudioWebtoonModelerImageGenPanel", () => {
  it("캐릭터를 추가하고 웹툰 컷 생성 콜백을 실행한다", () => {
    const onGenerate = vi.fn();
    render(<StudioWebtoonModelerImageGenPanel onGenerateCutImage={onGenerate} />);

    fireEvent.click(screen.getByRole("button", { name: "캐릭터 추가" }));
    fireEvent.click(screen.getByRole("button", { name: /웹툰 컷 생성/u }));

    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate.mock.calls[0]?.[0]?.characterConsistencyTokens.length).toBe(2);
    expect(screen.getByRole("status").textContent).toContain("생성 요청 1건");
  });
});
