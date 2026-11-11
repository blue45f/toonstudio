// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SpaceLocationChip } from "./SpaceLocationChip";

const css = readFileSync("apps/web/src/domains/creator/virtual-space/hud/space-hud.css", "utf8");
const mobile = Array.from(css.matchAll(/@media \(max-width: 1023\.98px\) \{[\s\S]*?\n\}/gu), ([block]) => block).join("\n");

afterEach(cleanup);

describe("모바일 위치 칩의 공간 전환 입구", () => {
  it("고정 최소 폭 대신 구역명만 줄여 전환 버튼 자리를 남기고 44px 높이를 보장한다", () => {
    expect(mobile).toMatch(/\.space-location\[data-compact\] \.space-location__text \{[^}]*min-width:\s*0\s*;/u);
    expect(mobile).toMatch(/\.space-location\[data-compact\] \.space-location__engine-toggle \{[^}]*min-height:\s*44px\s*;/u);
    expect(css).toMatch(/\.space-location__zone-name \{[^}]*text-overflow:\s*ellipsis\s*;/u);
  });

  it.each(["2d", "3d"] as const)("긴 프라이빗 구역명에서도 %s 전환 상태와 기존 콜백을 유지한다", (engineMode) => {
    const onToggleEngineMode = vi.fn();
    const onExit = vi.fn();
    const zoneLabel = "모바일에서도 현재 구역을 읽을 수 있는 긴 프라이빗 작화 오픈 데스크";
    render(<SpaceLocationChip
      compact
      spaceName="나의 스튜디오"
      zone={{ roomId: null, labelKo: zoneLabel, labelEn: "A long private drawing desk", privateZone: true }}
      engineMode={engineMode}
      onExit={onExit}
      onToggleEngineMode={onToggleEngineMode}
    />);

    const toggle = screen.getByRole("button", { name: engineMode === "3d"
      ? "현재 3D 스튜디오 공간 · 클릭하여 2D 캠퍼스로 전환"
      : "현재 2D 캠퍼스 · 클릭하여 3D 스튜디오 공간으로 전환" });
    expect(toggle.getAttribute("aria-pressed")).toBe(String(engineMode === "3d"));
    expect(toggle.getAttribute("type")).toBe("button");
    expect(screen.getByText(zoneLabel)).toBeTruthy();
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(onToggleEngineMode).toHaveBeenCalledOnce();
    expect(onExit).not.toHaveBeenCalled();
  });
});
