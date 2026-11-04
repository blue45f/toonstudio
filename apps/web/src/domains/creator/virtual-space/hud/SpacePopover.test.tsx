// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SpacePopover } from "./SpacePopover";

describe("SpacePopover 모달 초점 복원 계약", () => {
  it("모달 팔레트를 닫을 때 onClose 안의 focusWorld가 동작하도록 dialog.close()를 먼저 호출한다", () => {
    const events: string[] = [];
    const origShowModal = HTMLDialogElement.prototype.showModal;
    const origClose = HTMLDialogElement.prototype.close;
    HTMLDialogElement.prototype.showModal = function showModalStub() {
      this.setAttribute("open", "");
      events.push("showModal");
    };
    HTMLDialogElement.prototype.close = function closeStub() {
      this.removeAttribute("open");
      events.push("dialog.close");
    };

    try {
      const onClose = vi.fn(() => {
        const dialog = document.querySelector("dialog");
        events.push(`onClose(open=${dialog?.hasAttribute("open")})`);
      });
      render(
        <SpacePopover open sheet={false} palette title="방·팀원 찾기" onClose={onClose}>
          <input aria-label="검색 입력" />
        </SpacePopover>,
      );

      fireEvent.keyDown(screen.getByLabelText("검색 입력"), { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(events).toEqual(["showModal", "dialog.close", "onClose(open=false)"]);
    } finally {
      HTMLDialogElement.prototype.showModal = origShowModal;
      HTMLDialogElement.prototype.close = origClose;
    }
  });
});
