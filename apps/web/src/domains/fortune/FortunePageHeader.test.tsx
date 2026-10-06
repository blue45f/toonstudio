// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FortunePageHeader } from "./FortunePageHeader";
import { FORTUNE_TAB_META, FORTUNE_TAB_ORDER, type FortuneTab } from "./fortune-page-data";

const tx = (source: string) => source;

afterEach(() => {
  cleanup();
});

describe("FortunePageHeader", () => {
  it.each(FORTUNE_TAB_ORDER)("%s 도구에서는 본문 헤더가 그 도구의 이름·맥락을 보여준다", (tab: FortuneTab) => {
    render(<FortunePageHeader tx={tx} activeTab={tab} />);
    const meta = FORTUNE_TAB_META[tab];
    expect(screen.getByRole("heading", { level: 1, name: meta.labelKo })).not.toBeNull();
    expect(screen.getByText(meta.taglineKo)).not.toBeNull();
    // 레이어 배지는 도구와 무관하게 유지된다.
    expect(screen.getByText("페르소나 캐릭터 운세 레이어")).not.toBeNull();
  });

  it("도구가 바뀌면 헤더의 이름·맥락이 따라 바뀐다", () => {
    const { rerender } = render(<FortunePageHeader tx={tx} activeTab="today" />);
    expect(screen.getByRole("heading", { level: 1, name: FORTUNE_TAB_META.today.labelKo })).not.toBeNull();
    rerender(<FortunePageHeader tx={tx} activeTab="tarot" />);
    expect(screen.getByRole("heading", { level: 1, name: FORTUNE_TAB_META.tarot.labelKo })).not.toBeNull();
    expect(screen.getByText(FORTUNE_TAB_META.tarot.taglineKo)).not.toBeNull();
    expect(screen.queryByText(FORTUNE_TAB_META.today.taglineKo)).toBeNull();
  });
});
