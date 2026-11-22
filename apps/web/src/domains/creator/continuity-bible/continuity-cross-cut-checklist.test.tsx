// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStarterContinuityBible,
  createStarterCutObservations,
  evaluateCrossCutContinuity,
  formatCrossCutJumpSummaryText,
  markCrossCutCheckResolved,
  type CutCharacterObservation,
} from "./continuity-bible-model";
import { StudioContinuityBiblePanel } from "./StudioContinuityBiblePanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("continuity-cross-cut-checklist — 컷 간 복장·소품·상처 대조 및 수정 컷 점프 요약 (#074)", () => {
  it("1. 복장 불일치·소품 누락/방향 반전·상처 누락/좌우 반전·미확인 컷을 정확히 분류하고 직전 컷 이탈을 표시한다", () => {
    const bible = createStarterContinuityBible("proj-xcut-1");
    const lead = bible.characters[0];
    const winterOutfit = lead?.outfits[0];
    const summerOutfit = lead?.outfits[1];
    const watchProp = lead?.signatureProps[0];
    const cheekScar = lead?.scarsAndMarks[0];
    if (!lead || !winterOutfit || !summerOutfit || !watchProp || !cheekScar) {
      throw new Error("시드 캐릭터 스펙이 필요합니다.");
    }

    const observations: readonly CutCharacterObservation[] = [
      {
        cutId: "ep13-cut-02",
        cutNumber: 2,
        sceneLabelKo: "교실 오프닝",
        characterId: lead.characterId,
        observedOutfitId: winterOutfit.id,
        observedPropIds: [watchProp.id],
        observedScarIds: [cheekScar.id],
      },
      {
        cutId: "ep13-cut-11",
        cutNumber: 11,
        sceneLabelKo: "옥상 반전 클로즈업",
        characterId: lead.characterId,
        observedOutfitId: summerOutfit.id,
        observedPropIds: [watchProp.id],
        propHandOverrides: { [watchProp.id]: "right" },
        observedScarIds: [cheekScar.id],
        mirroredScarIds: [cheekScar.id],
      },
      {
        cutId: "ep13-cut-18",
        cutNumber: 18,
        sceneLabelKo: "복도 대치 샷",
        characterId: lead.characterId,
        observedOutfitId: winterOutfit.id,
        observedPropIds: [],
        observedScarIds: [],
      },
      {
        cutId: "ep13-cut-25",
        cutNumber: 25,
        sceneLabelKo: "엔딩 리액션",
        characterId: lead.characterId,
      },
    ];

    const report = evaluateCrossCutContinuity(bible, observations);

    expect(report.episodeNumber).toBe(13);
    expect(report.inspectedCutCount).toBe(4);
    // 컷 2: 3 matched, 컷 11: 3 mismatch, 컷 18: 1 matched + 2 mismatch, 컷 25: 3 unverified
    expect(report.matchedCount).toBe(4);
    expect(report.mismatchCount).toBe(5);
    expect(report.unverifiedCount).toBe(3);

    const mirroredScar = report.actionableItems.find(
      (i) => i.cutNumber === 11 && i.category === "scar",
    );
    expect(mirroredScar?.status).toBe("mismatch");
    expect(mirroredScar?.severity).toBe("error");
    expect(mirroredScar?.divergesFromPreviousCut).toBe(true);
    expect(mirroredScar?.previousCutNumber).toBe(2);
    expect(mirroredScar?.reasonKo).toContain("좌우 반전");
    expect(mirroredScar?.reasonKo).toContain("컷 #2");

    const handMismatch = report.actionableItems.find(
      (i) => i.cutNumber === 11 && i.category === "prop",
    );
    expect(handMismatch?.status).toBe("mismatch");
    expect(handMismatch?.reasonKo).toContain("착용 방향 불일치");

    const outfitMismatch = report.actionableItems.find(
      (i) => i.cutNumber === 11 && i.category === "outfit",
    );
    expect(outfitMismatch?.status).toBe("mismatch");
    expect(outfitMismatch?.severity).toBe("error");

    const missingScar = report.actionableItems.find(
      (i) => i.cutNumber === 18 && i.category === "scar",
    );
    expect(missingScar?.status).toBe("mismatch");
    expect(missingScar?.reasonKo).toContain("누락");

    // 수정 컷 점프 요약은 정상 컷(#2)을 제외하고 컷 번호 오름차순(11, 18, 25)으로 반환된다.
    expect(report.jumpTargets.map((t) => t.cutNumber)).toEqual([11, 18, 25]);
    expect(report.jumpTargets[0]?.mismatchCount).toBe(3);
    expect(report.jumpTargets[0]?.highestSeverity).toBe("error");
    expect(report.jumpTargets[2]?.unverifiedCount).toBe(3);

    const text = formatCrossCutJumpSummaryText(report);
    expect(text).toContain("컷 #11");
    expect(text).toContain("컷 #18");
    expect(text).toContain("컷 #25");
    expect(text).not.toContain("컷 #2 (");
  });

  it("2. 원경·후면 가림(occludedCategories)은 오탐 없이 제외하고, 화수 전환(17화 붕대 완치·20화 하복 전환)을 반영한다", () => {
    const base = createStarterContinuityBible("proj-xcut-2");
    const lead = base.characters[0];
    const partner = base.characters[1];
    const partnerOutfit = partner?.outfits[0];
    const partnerProp = partner?.signatureProps[0];
    const leadSummerOutfit = lead?.outfits[1];
    if (!lead || !partner || !partnerOutfit || !partnerProp || !leadSummerOutfit) {
      throw new Error("시드 캐릭터 스펙이 필요합니다.");
    }

    // 17화: 윤서아 임시 손목 붕대(9~16화)가 종료되어 상처 미관측이어도 불일치가 아니어야 한다.
    const ep17Bible = { ...base, currentEpisodeNumber: 17 };
    const ep17Report = evaluateCrossCutContinuity(ep17Bible, [
      {
        cutId: "ep17-cut-05",
        cutNumber: 5,
        characterId: partner.characterId,
        observedOutfitId: partnerOutfit.id,
        observedPropIds: [partnerProp.id],
        observedScarIds: [],
      },
    ]);
    expect(ep17Report.mismatchCount).toBe(0);
    expect(ep17Report.jumpTargets).toHaveLength(0);

    // 20화: 서하진 하복 전환 + 원경 컷 소품/상처 가림 처리
    const ep20Bible = { ...base, currentEpisodeNumber: 20 };
    const ep20Report = evaluateCrossCutContinuity(ep20Bible, [
      {
        cutId: "ep20-cut-01",
        cutNumber: 1,
        characterId: lead.characterId,
        observedOutfitId: leadSummerOutfit.id,
        occludedCategories: ["prop", "scar"],
      },
    ]);
    expect(ep20Report.totalCheckCount).toBe(1);
    expect(ep20Report.matchedCount).toBe(1);
    expect(ep20Report.mismatchCount).toBe(0);
  });

  it("3. markCrossCutCheckResolved는 대상 항목을 불변으로 일치 처리하고, 컷의 모든 이슈 해소 시 점프 목록에서 제거한다", () => {
    const bible = createStarterContinuityBible("proj-xcut-3");
    const starterObs = createStarterCutObservations(bible);
    const before = evaluateCrossCutContinuity(bible, starterObs);

    const cut22Items = before.actionableItems.filter((i) => i.cutNumber === 22);
    expect(cut22Items.length).toBeGreaterThan(0);

    let nextObs = starterObs;
    for (const item of cut22Items) {
      nextObs = markCrossCutCheckResolved(nextObs, item);
    }

    const after = evaluateCrossCutContinuity(bible, nextObs);
    expect(after.jumpTargets.some((t) => t.cutNumber === 22)).toBe(false);
    expect(after.mismatchCount).toBeLessThan(before.mismatchCount);
  });
});

describe("StudioContinuityBiblePanel — 컷 간 연속성 대조 UI 및 수정 컷 점프 인터랙션", () => {
  it("4. 컷 간 대조 체크리스트·수정 컷 점프 요약 렌더링, 점프 콜백, 필터, 수정 확인 반영이 동작한다", () => {
    const onJumpToCut = vi.fn();
    render(<StudioContinuityBiblePanel projectId="proj-xcut-ui" onJumpToCut={onJumpToCut} />);

    const crossCutPanel = screen.getByTestId("continuity-cross-cut-panel");
    expect(within(crossCutPanel).getByTestId("continuity-cross-cut-summary").textContent).toContain(
      "불일치",
    );

    // 컷 #14 점프 버튼 클릭 시 onJumpToCut 콜백 호출 및 44px 터치 타겟 확인
    const jumpCut14Btn = within(crossCutPanel).getByTestId("continuity-jump-cut-14");
    expect(jumpCut14Btn.className).toContain("min-h-11");
    fireEvent.click(jumpCut14Btn);

    expect(onJumpToCut).toHaveBeenCalledTimes(1);
    expect(onJumpToCut.mock.calls[0]?.[0]?.cutNumber).toBe(14);
    expect(screen.getByTestId("continuity-bible-status").textContent).toContain("컷 #14");

    // 컷 #14 필터 적용 상태에서 리스트에 컷 #22 항목이 숨겨지고 전체 컷 보기로 복원
    expect(within(crossCutPanel).queryByTestId("continuity-cross-cut-item-22-outfit")).toBeNull();
    fireEvent.click(within(crossCutPanel).getByTestId("continuity-clear-jump-filter-btn"));
    expect(within(crossCutPanel).getByTestId("continuity-cross-cut-item-22-outfit")).toBeTruthy();

    // 카테고리 필터(상처) 동작 확인
    fireEvent.click(within(crossCutPanel).getByTestId("continuity-filter-scar"));
    expect(within(crossCutPanel).queryByTestId("continuity-cross-cut-item-22-outfit")).toBeNull();

    // 전체 확인 필요로 복원 후 컷 #22 복장 항목 수정 확인 처리 → 컷 #22 점프 카드 소멸
    fireEvent.click(within(crossCutPanel).getByTestId("continuity-filter-actionable"));
    const cut22Row = within(crossCutPanel).getByTestId("continuity-cross-cut-item-22-outfit");
    fireEvent.click(within(cut22Row).getByRole("button", { name: "수정 확인" }));
    expect(within(crossCutPanel).queryByTestId("continuity-jump-cut-22")).toBeNull();

    // 수정 컷 요약 복사 버튼 피드백
    fireEvent.click(within(crossCutPanel).getByTestId("continuity-copy-jump-summary-btn"));
    expect(screen.getByTestId("continuity-bible-status").textContent).toContain("점프 요약");
  });
});
