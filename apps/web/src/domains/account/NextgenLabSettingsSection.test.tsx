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

  it("Compute Pressure 설명은 관측만 한다고 말하고 품질 조절에 쓴다고 주장하지 않는다", () => {
    render(<NextgenLabSettingsSection />);
    const row = screen.getByText("기기 압력 감지").closest("li");
    expect(row).not.toBeNull();
    const text = row?.textContent ?? "";
    // 값을 읽어 품질을 조절하는 소비처가 없다(compute-pressure.test.ts 의 소비처 가드와 짝).
    expect(text).toContain("관측용");
    expect(text).toContain("아직 연결돼 있지 않습니다");
    expect(text).not.toContain("품질 조절에 씁니다");
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
