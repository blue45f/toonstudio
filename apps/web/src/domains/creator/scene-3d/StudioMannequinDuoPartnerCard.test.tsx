// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { solveStudioMannequinDuoPlacement } from "./studio-mannequin-duo-composition";
import { STUDIO_MANNEQUIN_DUO_I18N_EN, STUDIO_MANNEQUIN_DUO_I18N_KO } from "./studio-mannequin-duo-i18n";
import { STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS } from "./studio-mannequin-model";
import { findStudioMannequinPosePreset } from "./studio-mannequin-poses";
import { StudioMannequinDuoFigureSwitch, StudioMannequinDuoPartnerCard } from "./StudioMannequinDuoPartnerCard";
import {
  createStudioMannequinDuoPartner,
  type StudioMannequinDuoPartnerController,
} from "./use-studio-mannequin-duo-partner";

afterEach(cleanup);

function duoView(overrides: Partial<StudioMannequinDuoPartnerController> = {}) {
  const preset = findStudioMannequinPosePreset("couple-arm-link");
  if (!preset) throw new Error("couple-arm-link 프리셋이 없다");
  const placement = solveStudioMannequinDuoPlacement({
    presetId: preset.id,
    leadPose: preset.pose,
    leadBodyParams: STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  });
  return {
    partner: createStudioMannequinDuoPartner(placement, STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS),
    placement,
    activeFigure: "lead" as const,
    history: { canUndo: false, canRedo: false, undoCount: 0, redoCount: 0 },
    setActiveFigure: vi.fn(),
    undoPartner: vi.fn(),
    redoPartner: vi.fn(),
    frameBoth: vi.fn(),
    removePartner: vi.fn(),
    ...overrides,
  };
}

describe("StudioMannequinDuoPartnerCard", () => {
  it("상대가 없으면 카드와 뷰포트 전환 칩을 그리지 않는다", () => {
    const view = duoView({ partner: null, placement: null });
    const { container } = render(
      <>
        <StudioMannequinDuoPartnerCard duo={view} />
        <StudioMannequinDuoFigureSwitch duo={view} />
      </>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("배치 요약·조작 대상 전환·상대 동작 버튼을 제공한다", () => {
    const view = duoView();
    render(<StudioMannequinDuoPartnerCard duo={view} />);
    expect(screen.getByRole("heading", { name: "2인 구도 — 상대 인형" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("팔짱 끼고 서기");

    const group = screen.getByRole("group", { name: "조작할 인형" });
    const lead = screen.getByRole("button", { name: "주인공" });
    const partner = screen.getByRole("button", { name: "상대" });
    expect(group.contains(lead) && group.contains(partner)).toBe(true);
    expect(lead.getAttribute("aria-pressed")).toBe("true");
    expect(partner.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(partner);
    expect(view.setActiveFigure).toHaveBeenCalledWith("partner");

    const undo = screen.getByRole("button", { name: "상대 되돌리기" });
    expect(undo).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "두 인형 모두 보기" }));
    expect(view.frameBoth).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "상대 제거" }));
    expect(view.removePartner).toHaveBeenCalledTimes(1);
  });

  it("불러온 상대(배치 정보 없음)는 저장된 2인 구도로 안내하고, 히스토리가 있으면 되돌릴 수 있다", () => {
    const view = duoView({
      placement: null,
      activeFigure: "partner",
      history: { canUndo: true, canRedo: false, undoCount: 1, redoCount: 0 },
    });
    render(<StudioMannequinDuoPartnerCard duo={view} />);
    expect(screen.getByRole("status").textContent).toContain("저장된 2인 구도");
    expect(screen.getByRole("button", { name: "상대" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "상대 되돌리기" }));
    expect(view.undoPartner).toHaveBeenCalledTimes(1);
  });

  it("뷰포트 전환 칩도 같은 그룹 이름으로 조작 대상을 바꾼다", () => {
    const view = duoView();
    render(<StudioMannequinDuoFigureSwitch duo={view} />);
    expect(screen.getByRole("group", { name: "조작할 인형" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "상대" }));
    expect(view.setActiveFigure).toHaveBeenCalledWith("partner");
  });
});

describe("2인 구도 문구 사전", () => {
  it("ko/en 키 집합이 같고 카드가 쓰는 키가 모두 등록돼 있다", () => {
    const koKeys = Object.keys(STUDIO_MANNEQUIN_DUO_I18N_KO).sort();
    expect(Object.keys(STUDIO_MANNEQUIN_DUO_I18N_EN).sort()).toEqual(koKeys);
    const source = readFileSync(
      path.resolve(process.cwd(), "apps/web/src/domains/creator/scene-3d/StudioMannequinDuoPartnerCard.tsx"),
      "utf8",
    );
    const used = [...source.matchAll(/t\(\s*"(studio\.mannequinDuo\.[A-Za-z.]+)"/gu)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(5);
    for (const key of used) expect(koKeys).toContain(key);
  });
});
