// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BRUSH_PRESETS } from "../studio-brush";
import { StudioActiveBrushSummary } from "../StudioActiveBrushSummary";
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
    expect(html).toContain("현재 적용: 작업 펜 3");
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

  it("정상 상태에서 선택한 빠른 선반 프리셋과 실제 캔버스 현재 브러시 표시가 1:1로 일치한다", () => {
    const flagships = buildStudioCompetitorFavoriteSlotBrushes();
    const renamedCustom: StudioSavedBrush = {
      ...savedBrush(1),
      id: "custom-renamed-gpen",
      name: "내 주력 콘티 G펜",
      sourcePresetName: "G펜",
      pinned: true,
      lastUsedAt: 9_999_999_999_999,
    };
    const shelfItems = [renamedCustom, flagships[0]!, flagships[4]!];

    function CanvasQuickShelfHarness() {
      const [applied, setApplied] = useState<StudioSavedBrush>(flagships[0]!);
      // StudioCuttoonEditorHost.applySavedBrush의 실제 표시 이름 결정식과 동일하게 검증한다.
      const hostCatalogName =
        applied.sourcePresetName
        ?? BRUSH_PRESETS.find((preset) => preset.id === applied.brushId)?.name
        ?? applied.name;

      return (
        <div>
          <StudioSavedBrushShelf
            brushes={shelfItems}
            activeBrushId={applied.id}
            activeCatalogBrushId={applied.sourcePresetId ?? applied.brushId}
            activeBrushName={hostCatalogName}
            onApply={(next) => setApplied(next)}
          />
          <StudioActiveBrushSummary
            brushId={applied.sourcePresetId ?? applied.brushId}
            brushName={hostCatalogName}
            color={applied.color}
            opacity={applied.brushOpacity}
            stabilizer={applied.stabilizer}
            stabilizerMode={applied.stabilizerMode}
            strokeWidth={applied.strokeWidth}
          />
        </div>
      );
    }

    render(<CanvasQuickShelfHarness />);

    expect(screen.getByTestId("saved-brush-shelf-active-preset").textContent).toBe(
      `현재 적용: ${flagships[0]!.name}`,
    );

    // 사용자 이름 변경 브러시("내 주력 콘티 G펜") 선택 시 "G펜"으로 덮어쓰이지 않고 양쪽 표시가 정확히 일치해야 한다.
    const customButton = screen.getByRole("button", { name: /내 주력 콘티 G펜 브러시 적용/u });
    fireEvent.click(customButton);

    expect(customButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("saved-brush-shelf-active-preset").textContent).toBe(
      "현재 적용: 내 주력 콘티 G펜",
    );
    const summaryRoot = document.querySelector("[data-studio-active-brush-summary]");
    expect(summaryRoot?.textContent).toContain("내 주력 콘티 G펜");
  });

  it("provider 불가(private-grant) 상태에서 무폴백 차단·기존 브러시 보존·정확한 오류 안내·키보드 포커스 복원을 보장한다", () => {
    const activeValid = buildStudioCompetitorFavoriteSlotBrushes()[0]!;
    const blockedPrivateGrant: StudioSavedBrush = {
      ...activeValid,
      id: "blocked:v6:mineral-bloom",
      name: "미네랄 수묵 번짐",
      sourcePresetId: "v6:mineral-bloom",
      enginePrograms: null,
      lastUsedAt: activeValid.lastUsedAt! - 500,
    };
    const onApply = vi.fn();

    render(
      <StudioSavedBrushShelf
        brushes={[activeValid, blockedPrivateGrant]}
        activeBrushId={activeValid.id}
        onApply={onApply}
      />,
    );

    const activeChip = screen.getByRole("button", {
      name: new RegExp(`${activeValid.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} 브러시 적용`, "u"),
    });
    const blockedChip = screen.getByRole("button", {
      name: /미네랄 수묵 번짐 브러시 적용/u,
    });

    fireEvent.click(blockedChip);

    // 무폴백 정책: 기본 펜("pen") 포함 어떤 onApply 호출도 발생하지 않고 기존 브러시가 그대로 유지된다.
    expect(onApply).not.toHaveBeenCalled();
    expect(activeChip.getAttribute("aria-pressed")).toBe("true");
    expect(blockedChip.getAttribute("aria-pressed")).toBe("false");
    expect(blockedChip.getAttribute("data-studio-quick-shelf-apply-state")).toBe(
      "provider-unavailable",
    );
    expect(screen.getByTestId("saved-brush-shelf-active-preset").textContent).toBe(
      `현재 적용: ${activeValid.name}`,
    );

    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-error-status")).toBe("provider-unavailable");
    expect(alert.getAttribute("data-blocked-nodes")).toContain("deposit-wet");
    expect(alert.textContent).toContain("deposit-wet");
    expect(alert.textContent).toContain("현재 브러시를 그대로 유지합니다");

    // 다시 시도 클릭 시 여전히 차단되더라도 키보드 포커스는 선택한 프리셋 칩으로 복원된다.
    const retryBtn = screen.getByTestId("saved-brush-shelf-retry-button");
    retryBtn.focus();
    fireEvent.click(retryBtn);
    expect(onApply).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(blockedChip);

    // 닫기(또는 Escape) 시 알림이 닫히고 키보드 포커스가 프리셋 칩으로 복원된다.
    const dismissBtn = screen.getByTestId("saved-brush-shelf-dismiss-error");
    dismissBtn.focus();
    fireEvent.keyDown(screen.getByTestId("saved-brush-shelf-dismiss-error"), { key: "Escape" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(blockedChip);
  });

  it("일시적 캔버스 onApply 실패 시 기존 브러시를 보존하고 다시 시도로 복구 및 포커스를 복원한다", () => {
    const flagships = buildStudioCompetitorFavoriteSlotBrushes();
    const initialBrush = flagships[0]!;
    const brokenThenRecoveredTarget: StudioSavedBrush = {
      ...flagships[4]!,
      enginePrograms: null, // 허용형 V6 영수증 손상도 함께 자가 복구 검증
    };
    let shouldFail = true;

    function TransientFailureHarness() {
      const [current, setCurrent] = useState<StudioSavedBrush>(initialBrush);
      return (
        <StudioSavedBrushShelf
          brushes={[initialBrush, brokenThenRecoveredTarget]}
          activeBrushId={current.id}
          onApply={(resolved) => {
            if (shouldFail) {
              throw new Error("일시적 캔버스 파이프라인 잠금");
            }
            setCurrent(resolved);
          }}
        />
      );
    }

    render(<TransientFailureHarness />);
    const targetChip = screen.getByRole("button", {
      name: new RegExp(
        `${brokenThenRecoveredTarget.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} 브러시 적용`,
        "u",
      ),
    });

    // 1차 시도 실패: 기존 브러시(initialBrush)가 유지되고 정확한 오류 안내가 표시된다.
    fireEvent.click(targetChip);
    expect(screen.getByTestId("saved-brush-shelf-active-preset").textContent).toBe(
      `현재 적용: ${initialBrush.name}`,
    );
    expect(targetChip.getAttribute("aria-pressed")).toBe("false");
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-error-status")).toBe("apply-failed");
    expect(alert.textContent).toContain("일시적 캔버스 파이프라인 잠금");

    // 2차 다시 시도 성공: 무폴백 영수증 복구와 함께 대상 프리셋이 적용되고 포커스가 칩으로 돌아온다.
    shouldFail = false;
    const retryBtn = screen.getByTestId("saved-brush-shelf-retry-button");
    retryBtn.focus();
    fireEvent.click(retryBtn);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(targetChip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("saved-brush-shelf-active-preset").textContent).toBe(
      `현재 적용: ${brokenThenRecoveredTarget.name}`,
    );
    expect(screen.getByTestId("saved-brush-shelf-recovery-status").textContent).toContain(
      "자동 복구",
    );
    expect(document.activeElement).toBe(targetChip);
  });
});
