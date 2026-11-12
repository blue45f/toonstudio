// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSavedBrushShelf } from "../StudioSavedBrushShelf";

import { studioBrushDynamicsPresetSettings } from "./studio-brush-dynamics";
import { buildStudioCompetitorFavoriteSlotBrushes } from "./studio-competitor-favorite-slots";

import type { StudioSavedBrush } from "./studio-brush-library";

afterEach(() => {
  cleanup();
});

function savedBrush(index: number): StudioSavedBrush {
  return {
    id: `brush-${index}`,
    name: `작업 펜 ${index}`,
    createdAt: index,
    updatedAt: index,
    pinned: index === 1 || index === 3,
    lastUsedAt: index * 10,
    brushId: "gpen",
    strokeWidth: 4 + index,
    brushOpacity: 0.8,
    color: "#ff6600",
    stabilizer: 4,
    stabilizerMode: "adaptive",
    postCorrection: 3,
    preserveCorners: true,
    pressureCurve: 1,
    pressureMinSize: 0,
    useVelocityPressure: true,
    velocitySensitivity: 0.5,
    tiltEnabled: true,
    tipAngle: -30,
    tipRoundness: 0.24,
    brushDynamics: studioBrushDynamicsPresetSettings("ink-particle"),
    stampTuning: null,
    enginePrograms: null,
  };
}

describe("StudioSavedBrushShelf", () => {
  it("고정·최근 브러시를 최대 8개, 44px 이상 터치 버튼으로 렌더한다", () => {
    const html = renderToStaticMarkup(
      <StudioSavedBrushShelf
        brushes={Array.from({ length: 10 }, (_, index) => savedBrush(index))}
        activeBrushId="brush-3"
        onApply={() => undefined}
        onManage={() => undefined}
      />
    );
    expect(html).toContain("고정·최근");
    expect(html).toContain("8/8");
    expect(html.match(/브러시 적용/g)).toHaveLength(8);
    expect(html.match(/min-h-14/g)).toHaveLength(8);
    expect(html).toContain("min-h-11");
    expect(html).toContain(
      'aria-label="작업 펜 3 브러시 적용, 7px, 80퍼센트"'
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("저장·관리");
  });

  it("활성 체크와 밝고 어두운 배경의 투명 색상 미리보기를 렌더한다", () => {
    const html = renderToStaticMarkup(
      <StudioSavedBrushShelf
        brushes={[savedBrush(3)]}
        activeBrushId="brush-3"
        onApply={() => undefined}
        onManage={() => undefined}
      />
    );
    expect(html).toContain("lucide-check");
    expect(html).toContain("bg-accent text-on-accent");
    expect(html).toContain(
      "bg-[linear-gradient(90deg,#f8fafc_0_50%,#242936_50%_100%)]"
    );
    expect(html).toContain("background-color:#ff6600");
    expect(html).toContain("opacity:0.8");
  });

  it("고정·최근 기록이 없어도 저장·관리 CTA가 있는 빈 선반을 유지한다", () => {
    const neverUsed = { ...savedBrush(0), pinned: false, lastUsedAt: null };
    const html = renderToStaticMarkup(
      <StudioSavedBrushShelf
        brushes={[neverUsed]}
        onApply={() => undefined}
        onManage={() => undefined}
      />
    );
    expect(html).toContain('aria-label="고정 및 최근 브러시"');
    expect(html).toContain("0/8");
    expect(html).toContain("저장·관리");
    expect(html).toContain("브러시를 저장하거나 고정하면 이 선반에서 바로 꺼내 쓸 수 있어요.");
    expect(html).toContain("min-h-14");
    expect(html).not.toContain("브러시 적용");
  });

  it("방향키·Home/End 로빙 포커스와 숫자키(1~6) 즉시 적용 키보드 접근성을 지원한다", () => {
    const flagships = buildStudioCompetitorFavoriteSlotBrushes();
    const onApply = vi.fn();
    render(
      <StudioSavedBrushShelf
        brushes={flagships}
        activeBrushId={flagships[0]!.id}
        onApply={onApply}
      />
    );

    const toolbar = screen.getByRole("toolbar", { name: "고정 및 최근 빠른 브러시 목록" });
    const buttons = toolbar.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons).toHaveLength(6);
    expect(buttons[0]?.tabIndex).toBe(0);
    expect(buttons[1]?.tabIndex).toBe(-1);

    fireEvent.keyDown(buttons[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1]?.tabIndex).toBe(0);

    fireEvent.keyDown(buttons[1]!, { key: "End" });
    expect(document.activeElement).toBe(buttons[5]);

    fireEvent.keyDown(buttons[5]!, { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);

    // 숫자 3 키 입력 시 3번 슬롯(배럴 트위스트 납작 닙)으로 포커스 이동 및 즉시 적용
    fireEvent.keyDown(buttons[0]!, { key: "3" });
    expect(document.activeElement).toBe(buttons[2]);
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "favorite-slot:v6:calligraphy-barrel-twist-nib" }),
    );
  });

  it("손상된 V6 영수증 브러시나 캔버스 적용 예외 발생 시 안전 복구하고 상태를 알린다", () => {
    const brokenSlot: StudioSavedBrush = {
      ...buildStudioCompetitorFavoriteSlotBrushes()[0]!,
      enginePrograms: null,
    };
    const onApply = vi
      .fn<(brush: StudioSavedBrush) => void>()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("canvas runtime fault");
      })
      .mockImplementationOnce(() => undefined);

    render(<StudioSavedBrushShelf brushes={[brokenSlot]} onApply={onApply} />);
    const button = screen.getByRole("button", { name: /브러시 적용/u });

    // 1) 영수증 손상 브러시 클릭 -> 무폴백 V6 영수증 자동 복구 후 onApply 전달
    fireEvent.click(button);
    expect(onApply.mock.calls[0]?.[0]?.enginePrograms?.material?.runtime?.fallbackPolicy).toBe(
      "none",
    );
    expect(screen.getByTestId("saved-brush-shelf-recovery-status").textContent).toContain(
      "자동 복구",
    );

    // 2) onApply 예외 발생 시 기본 안전 펜으로 2차 폴백
    fireEvent.click(button);
    expect(onApply).toHaveBeenCalledTimes(3);
    expect(onApply.mock.calls[2]?.[0]?.brushId).toBe("pen");
    expect(screen.getByTestId("saved-brush-shelf-recovery-status").textContent).toContain(
      "기본 안전 펜",
    );
  });
});
