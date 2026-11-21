// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import {
  addFanCheerNote,
  EMPTY_FAN_PULSE_STATE,
  loadFanPulseState,
  removeFanCheerNote,
  saveFanPulseState,
  toggleFanPulseMood,
} from "./community-fan-pulse-model";
import { CommunityFanPulseStrip } from "./community-fan-pulse-strip";

beforeEach(() => {
  localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("community-fan-pulse-model 순수 상태 & 영속", () => {
  it("응원 토글, 한 줄 스티커 추가·삭제와 localStorage 복원을 처리한다", () => {
    const toggled = toggleFanPulseMood(EMPTY_FAN_PULSE_STATE, "art-peak");
    expect(toggled.added).toBe(true);
    expect(toggled.state.counts["art-peak"]).toBe(1);

    const withNote = addFanCheerNote(toggled.state, "art-peak", "오늘 15화 연출 진짜 최고였어요");
    expect(withNote).not.toBeNull();
    if (!withNote) return;
    saveFanPulseState(withNote);

    const loaded = loadFanPulseState();
    expect(loaded.counts["art-peak"]).toBe(1);
    expect(loaded.notes).toHaveLength(1);
    expect(loaded.notes[0]?.text).toBe("오늘 15화 연출 진짜 최고였어요");

    const removed = removeFanCheerNote(loaded, loaded.notes[0]!.id);
    expect(removed.notes).toHaveLength(0);
  });
});

describe("CommunityFanPulseStrip UI", () => {
  it("1탭 응원 시 파티클 버스트·카운트 갱신·한 줄 스티커 영속 복원이 동작한다", () => {
    const { unmount } = render(<CommunityFanPulseStrip />);

    const peakBtn = screen.getByTestId("community-pulse-btn-art-peak");
    fireEvent.click(peakBtn);
    expect(peakBtn.getAttribute("aria-pressed")).toBe("true");
    expect(peakBtn.querySelectorAll(".community-burst-dot")).toHaveLength(6);
    expect(screen.getByTestId("community-fan-pulse-total").textContent).toContain("1회");

    const submit = screen.getByTestId("community-pulse-note-submit") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("community-pulse-note-input"), {
      target: { value: "마감 힘내세요!" },
    });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    expect(screen.getByTestId("community-pulse-notes-list").textContent).toContain("마감 힘내세요!");

    unmount();
    render(<CommunityFanPulseStrip />);
    expect(screen.getByTestId("community-pulse-btn-art-peak").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("community-pulse-notes-list").textContent).toContain("마감 힘내세요!");
  });

  it("영문 로케일(en)에서 한글 문자가 누출되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(<CommunityFanPulseStrip />);
    expect(screen.getByTestId("community-fan-pulse-strip").textContent).not.toMatch(/[가-힣]/u);
  });
});
