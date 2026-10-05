// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  NEXTGEN_LAB_DEFAULTS,
  getNextgenLabSettingsSnapshot,
  updateNextgenLabSettings,
} from "@/shared/lib/nextgen-lab-settings";

import { NextgenLabSettingsSection } from "./NextgenLabSettingsSection";

beforeEach(() => {
  localStorage.clear();
  updateNextgenLabSettings({ ...NEXTGEN_LAB_DEFAULTS });
  localStorage.clear();
});

describe("NextgenLabSettingsSection", () => {
  it("실험 배지·능력 목록·압력 안내를 렌더한다", () => {
    render(<NextgenLabSettingsSection />);
    expect(screen.getByRole("heading", { name: /실험 기능/ })).toBeTruthy();
    expect(screen.getByText("화면 꺼짐 방지")).toBeTruthy();
    expect(screen.getByText("브라우저 내장 AI")).toBeTruthy();
    // jsdom에는 PressureObserver가 없어 정직하게 "읽을 수 없음"으로 표시된다.
    expect(screen.getByText(/기기 압력을 읽을 수 없습니다/)).toBeTruthy();
  });

  it("토글을 누르면 실험 설정이 실제로 바뀐다", () => {
    render(<NextgenLabSettingsSection />);
    const toggle = screen.getByRole("switch", { name: /읽는 동안 화면 켜 두기/ });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(getNextgenLabSettingsSnapshot().readerWakeLock).toBe(false);
  });

  it("지원 여부는 감지 결과를 그대로 보여 준다 (전부 지원으로 위장하지 않는다)", () => {
    render(<NextgenLabSettingsSection />);
    const unsupportedChips = screen.getAllByText("미지원");
    expect(unsupportedChips.length).toBeGreaterThan(10);
  });
});
