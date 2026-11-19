// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MmorpgRecruitmentPlazaPanel } from "./MmorpgRecruitmentPlazaPanel";

afterEach(cleanup);

describe("MmorpgRecruitmentPlazaPanel", () => {
  it("추천 어시스턴트를 즉시 파티 슬롯에 매칭한다", () => {
    const onInvite = vi.fn();
    render(<MmorpgRecruitmentPlazaPanel onInviteMatchedAvatar={onInvite} />);

    const inviteButtons = screen.getAllByRole("button", { name: "즉시 파티 초대" });
    const enabledInvite = inviteButtons.find((btn) => !(btn as HTMLButtonElement).disabled);
    expect(enabledInvite).toBeTruthy();
    if (enabledInvite) fireEvent.click(enabledInvite);

    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("실시간 매칭했습니다");
  });
});
