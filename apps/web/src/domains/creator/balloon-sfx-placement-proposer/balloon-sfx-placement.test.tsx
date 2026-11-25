// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CUT_COMPOSITION_PRESETS,
  DEFAULT_CUT_HEIGHT,
  DEFAULT_CUT_WIDTH,
  DEFAULT_SAFE_MARGIN,
  MAX_DIALOGUE_BALLOONS,
  PROPOSER_SCHEMA_VERSION,
  StudioBalloonSfxProposerPanel,
  applyLayoutProposal,
  buildBalloonOutlinePath,
  clampSafeMargin,
  computeNegativeSpaceGrid,
  createPlacementSessionState,
  exportLayoutProposalJson,
  exportLayoutProposalSvg,
  getCutPreset,
  previewLayoutProposal,
  proposeBalloonSfxLayoutsTop3,
  rectIntersectionArea,
  revertLayoutProposal,
  validateReadingOrder,
  type BalloonStyle,
  type CutPresetId,
  type DialogueItem,
  type EmotionTone,
  type PlacedBalloon,
} from "./index";

afterEach(cleanup);

function assertZeroVioletOklch(source: string): void {
  const matches = source.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu);
  for (const match of matches) {
    const hue = Number(match[1]);
    expect(Number.isFinite(hue)).toBe(true);
    expect(hue < 270 || hue > 320).toBe(true);
  }
}

describe("1. 2D 네거티브 스페이스 점수 그리드 (computeNegativeSpaceGrid)", () => {
  it("800×1200 기본 컷에서 16×24(384개) 셀과 요약 지표를 생성한다", () => {
    const preset = getCutPreset("closeup-monologue");
    const grid = computeNegativeSpaceGrid({ protectedZones: preset.protectedZones });
    expect(grid.canvasWidth).toBe(DEFAULT_CUT_WIDTH);
    expect(grid.canvasHeight).toBe(DEFAULT_CUT_HEIGHT);
    expect(grid.cells).toHaveLength(16 * 24);
    expect(grid.bestCells).toHaveLength(12);
    expect(grid.openCellRatio).toBeGreaterThan(0.4);
  });

  it("얼굴·눈 보호 영역을 덮는 셀은 faceOcclusionRatio > 0 및 낮은 점수를 받는다", () => {
    const preset = getCutPreset("closeup-monologue");
    const grid = computeNegativeSpaceGrid({ protectedZones: preset.protectedZones });
    const eyeCell = grid.cells.find((c) => c.centerX >= 350 && c.centerX <= 420 && c.centerY >= 525 && c.centerY <= 585);
    const openTopCell = grid.cells.find((c) => c.centerX >= 100 && c.centerX <= 200 && c.centerY >= 70 && c.centerY <= 150);
    expect(eyeCell).toBeDefined();
    expect(openTopCell).toBeDefined();
    expect(eyeCell?.faceOcclusionRatio).toBeGreaterThan(0);
    expect(openTopCell?.faceOcclusionRatio).toBe(0);
    expect((openTopCell?.score ?? 0)).toBeGreaterThan((eyeCell?.score ?? 100) + 45);
  });

  it("보호 영역 밖 안전 여백 내부 셀은 occlusionRatio 0과 높은 안전 여백 점수를 얻는다", () => {
    const preset = getCutPreset("action-impact");
    const grid = computeNegativeSpaceGrid({ protectedZones: preset.protectedZones, safeMargin: 40 });
    const topBest = grid.bestCells[0];
    expect(topBest?.occlusionRatio).toBe(0);
    expect(topBest?.safeMarginScore).toBe(1);
    expect(topBest?.score).toBeGreaterThanOrEqual(75);
  });

  it("safeMargin을 키우면 가장자리 셀 점수와 열린 여백 비율이 줄어든다", () => {
    const preset = getCutPreset("closeup-monologue");
    const tight = computeNegativeSpaceGrid({ protectedZones: preset.protectedZones, safeMargin: 20 });
    const wide = computeNegativeSpaceGrid({ protectedZones: preset.protectedZones, safeMargin: 80 });
    expect(wide.openCellRatio).toBeLessThan(tight.openCellRatio);
    const cornerTight = tight.cells[0];
    const cornerWide = wide.cells[0];
    expect((cornerWide?.safeMarginScore ?? 1)).toBeLessThan((cornerTight?.safeMarginScore ?? 0));
  });

  it("focusMouth를 지정하면 이상적 거리(약 250px) 셀이 극단 원거리 셀보다 높게 평가된다", () => {
    const grid = computeNegativeSpaceGrid({
      protectedZones: [],
      focusMouth: { x: 400, y: 600 },
    });
    const idealCell = grid.cells.find((c) => Math.abs(c.centerX - 400) <= 30 && Math.abs(c.centerY - 350) <= 30);
    const farCell = grid.cells.find((c) => c.row === 23 && c.col === 0);
    expect((idealCell?.mouthProximityScore ?? 0)).toBeGreaterThan((farCell?.mouthProximityScore ?? 1));
  });

  it("preferredBand를 지정하면 해당 세로 대역 셀의 readingFlowScore가 1이 된다", () => {
    const grid = computeNegativeSpaceGrid({
      protectedZones: [],
      preferredBand: { minY: 100, maxY: 320 },
    });
    const inBand = grid.cells.find((c) => c.centerY >= 120 && c.centerY <= 300);
    const outBand = grid.cells.find((c) => c.centerY >= 1000);
    expect(inBand?.readingFlowScore).toBe(1);
    expect((outBand?.readingFlowScore ?? 1)).toBeLessThan(0.5);
  });

  it("동일 입력으로 두 번 호출하면 바이트 단위로 동일한 결정론적 그리드를 반환한다", () => {
    const preset = getCutPreset("two-person-standoff");
    const g1 = computeNegativeSpaceGrid({ protectedZones: preset.protectedZones, safeMargin: 44, focusMouth: { x: 215, y: 486 } });
    const g2 = computeNegativeSpaceGrid({ protectedZones: preset.protectedZones, safeMargin: 44, focusMouth: { x: 215, y: 486 } });
    expect(g1).toEqual(g2);
  });
});

describe("2. 5종 웹툰 컷 구도 프리셋 Top-3 배치 및 얼굴 가림률 0% 검증", () => {
  it("5종 웹툰 컷 구도 프리셋이 모두 800×1200 규격으로 정의된다", () => {
    expect(CUT_COMPOSITION_PRESETS).toHaveLength(5);
    const ids = CUT_COMPOSITION_PRESETS.map((p) => p.id);
    expect(ids).toEqual([
      "closeup-monologue",
      "two-person-standoff",
      "action-impact",
      "romance-twoshot",
      "corridor-chase",
    ]);
    for (const preset of CUT_COMPOSITION_PRESETS) {
      expect(preset.canvasWidth).toBe(800);
      expect(preset.canvasHeight).toBe(1200);
      expect(preset.protectedZones.some((z) => z.kind === "face")).toBe(true);
    }
  });

  const presetCases: readonly CutPresetId[] = [
    "closeup-monologue",
    "two-person-standoff",
    "action-impact",
    "romance-twoshot",
    "corridor-chase",
  ];

  for (const presetId of presetCases) {
    it(`'${presetId}' 프리셋 Top-3 전원 얼굴 가림률 0%·읽기 순서 일관·말풍선 겹침 0건을 달성한다`, () => {
      const preset = getCutPreset(presetId);
      const bundle = proposeBalloonSfxLayoutsTop3({
        protectedZones: preset.protectedZones,
        dialogues: preset.dialogues,
        safeMargin: DEFAULT_SAFE_MARGIN,
      });

      expect(bundle.proposals).toHaveLength(3);
      for (const proposal of bundle.proposals) {
        expect(proposal.metrics.faceOcclusionPct).toBe(0);
        expect(proposal.metrics.readingOrderValid).toBe(true);
        expect(proposal.metrics.balloonOverlapCount).toBe(0);
        expect(proposal.balloons).toHaveLength(preset.dialogues.length);
        expect(proposal.sfx.faceOcclusionPct).toBe(0);
        for (const b of proposal.balloons) {
          expect(rectIntersectionArea(b.box, proposal.sfx.box)).toBe(0);
        }
      }
    });
  }

  it("모든 5종 프리셋의 배치된 말풍선과 SFX가 안전 여백 경계 안쪽에 유지된다", () => {
    const safeMargin = 44;
    for (const preset of CUT_COMPOSITION_PRESETS) {
      const bundle = proposeBalloonSfxLayoutsTop3({
        protectedZones: preset.protectedZones,
        dialogues: preset.dialogues,
        safeMargin,
      });
      for (const proposal of bundle.proposals) {
        for (const b of proposal.balloons) {
          expect(b.box.x).toBeGreaterThanOrEqual(safeMargin);
          expect(b.box.y).toBeGreaterThanOrEqual(safeMargin);
          expect(b.box.x + b.box.width).toBeLessThanOrEqual(800 - safeMargin);
          expect(b.box.y + b.box.height).toBeLessThanOrEqual(1200 - safeMargin);
        }
        const s = proposal.sfx.box;
        expect(s.x).toBeGreaterThanOrEqual(safeMargin);
        expect(s.y).toBeGreaterThanOrEqual(safeMargin);
        expect(s.x + s.width).toBeLessThanOrEqual(800 - safeMargin);
        expect(s.y + s.height).toBeLessThanOrEqual(1200 - safeMargin);
      }
    }
  });

  it("Top-3 제안은 서로 다른 전략 ID와 1·2·3 순위를 가지며 점수 기준으로 정렬된다", () => {
    const preset = getCutPreset("two-person-standoff");
    const bundle = proposeBalloonSfxLayoutsTop3({
      protectedZones: preset.protectedZones,
      dialogues: preset.dialogues,
    });
    expect(bundle.proposals.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(new Set(bundle.proposals.map((p) => p.strategyId)).size).toBe(3);
    expect(bundle.proposals[0].metrics.overallScore).toBeGreaterThanOrEqual(bundle.proposals[1].metrics.overallScore);
    expect(bundle.proposals[1].metrics.overallScore).toBeGreaterThanOrEqual(bundle.proposals[2].metrics.overallScore);
  });
});

describe("3. 말풍선 스타일·꼬리·한글 SFX 및 경계 조건", () => {
  it("5종 감정 톤이 각각 전용 말풍선 스타일과 꼬리 스타일에 매핑된다", () => {
    const tones: readonly [EmotionTone, BalloonStyle][] = [
      ["normal", "oval"],
      ["whisper", "whisper-dashed"],
      ["shout", "shout-burst"],
      ["thought", "thought-cloud"],
      ["tension", "tension-jagged"],
    ];
    for (const [tone, expectedStyle] of tones) {
      const bundle = proposeBalloonSfxLayoutsTop3({
        protectedZones: getCutPreset("closeup-monologue").protectedZones,
        dialogues: [{ id: "d1", speakerNameKo: "지안", speakerNameEn: "Jian", text: "테스트 대사", mouthX: 400, mouthY: 682, emotion: tone }],
      });
      expect(bundle.proposals[0].balloons[0]?.style).toBe(expectedStyle);
    }
  });

  it("6종 대표 한글 SFX(두근·콰앙!·스윽…·버럭!·정적·쿵—)가 감정·대사 조합에서 모두 추천된다", () => {
    const collected = new Set<string>();
    for (const preset of CUT_COMPOSITION_PRESETS) {
      const bundle = proposeBalloonSfxLayoutsTop3({
        protectedZones: preset.protectedZones,
        dialogues: preset.dialogues,
      });
      for (const p of bundle.proposals) collected.add(p.sfx.text);
    }
    for (const expected of ["두근", "콰앙!", "스윽…", "버럭!", "정적", "쿵—"]) {
      expect(collected.has(expected)).toBe(true);
    }
  });

  it("말풍선 꼬리 끝점은 눈 보호 영역을 침범하지 않고 유효한 8방향을 계산한다", () => {
    const preset = getCutPreset("closeup-monologue");
    const eyesZones = preset.protectedZones.filter((z) => z.kind === "eyes");
    const bundle = proposeBalloonSfxLayoutsTop3({
      protectedZones: preset.protectedZones,
      dialogues: preset.dialogues,
    });
    const validDirs = new Set(["top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"]);
    for (const b of bundle.proposals[0].balloons) {
      expect(validDirs.has(b.tailDirection)).toBe(true);
      for (const eye of eyesZones) {
        const insideEye =
          b.tailTipX >= eye.box.x &&
          b.tailTipX <= eye.box.x + eye.box.width &&
          b.tailTipY >= eye.box.y &&
          b.tailTipY <= eye.box.y + eye.box.height;
        expect(insideEye).toBe(false);
      }
    }
  });

  it("validateReadingOrder는 정상 세로·Z-패턴은 true, 역전된 배치는 false를 반환한다", () => {
    const preset = getCutPreset("two-person-standoff");
    const validBalloons = proposeBalloonSfxLayoutsTop3({
      protectedZones: preset.protectedZones,
      dialogues: preset.dialogues,
    }).proposals[0].balloons;
    expect(validateReadingOrder(validBalloons)).toBe(true);

    const reversed: readonly PlacedBalloon[] = [...validBalloons].reverse();
    expect(validateReadingOrder(reversed)).toBe(false);
  });

  it("대사 4개 이상 입력 시 최대 3개로 제한하고 빈 대사 목록도 안전하게 처리한다", () => {
    const preset = getCutPreset("closeup-monologue");
    const fourDialogues: readonly DialogueItem[] = [
      { id: "d1", speakerNameKo: "A", speakerNameEn: "A", text: "첫 번째", mouthX: 400, mouthY: 680, emotion: "normal" },
      { id: "d2", speakerNameKo: "A", speakerNameEn: "A", text: "두 번째", mouthX: 400, mouthY: 680, emotion: "whisper" },
      { id: "d3", speakerNameKo: "A", speakerNameEn: "A", text: "세 번째", mouthX: 400, mouthY: 680, emotion: "shout" },
      { id: "d4", speakerNameKo: "A", speakerNameEn: "A", text: "네 번째 초과", mouthX: 400, mouthY: 680, emotion: "tension" },
    ];
    const capped = proposeBalloonSfxLayoutsTop3({ protectedZones: preset.protectedZones, dialogues: fourDialogues });
    expect(capped.proposals[0].balloons).toHaveLength(MAX_DIALOGUE_BALLOONS);

    const empty = proposeBalloonSfxLayoutsTop3({ protectedZones: preset.protectedZones, dialogues: [] });
    expect(empty.proposals[0].balloons).toHaveLength(0);
    expect(empty.proposals[0].metrics.faceOcclusionPct).toBe(0);
    expect(empty.proposals[0].metrics.readingOrderValid).toBe(true);
  });

  it("clampSafeMargin은 범위 밖·NaN 값을 안전하게 클램프한다", () => {
    expect(clampSafeMargin(4)).toBe(16);
    expect(clampSafeMargin(200)).toBe(84);
    expect(clampSafeMargin(Number.NaN)).toBe(DEFAULT_SAFE_MARGIN);
    expect(clampSafeMargin(48)).toBe(48);
  });

  it("buildBalloonOutlinePath는 5종 말풍선 스타일 모두 닫힌 SVG 경로(M ... Z)를 반환한다", () => {
    const box = { x: 80, y: 120, width: 240, height: 100 };
    const styles: readonly BalloonStyle[] = ["oval", "shout-burst", "whisper-dashed", "thought-cloud", "tension-jagged"];
    for (const style of styles) {
      const d = buildBalloonOutlinePath(box, style);
      expect(d.startsWith("M ")).toBe(true);
      expect(d.endsWith(" Z")).toBe(true);
    }
  });
});

describe("4. 비파괴 미리보기·적용·되돌리기 상태 머신 및 JSON/SVG 내보내기", () => {
  it("초기 상태는 baseline이며 canRevert는 false다", () => {
    const s = createPlacementSessionState();
    expect(s.status).toBe("baseline");
    expect(s.canRevert).toBe(false);
    expect(s.revision).toBe(0);
    expect(s.current.balloons).toHaveLength(0);
  });

  it("previewLayoutProposal은 토글 동작하며 baseline·current를 변경하지 않는다", () => {
    const preset = getCutPreset("closeup-monologue");
    const p1 = proposeBalloonSfxLayoutsTop3({ protectedZones: preset.protectedZones, dialogues: preset.dialogues }).proposals[0];
    const s0 = createPlacementSessionState();
    const s1 = previewLayoutProposal(s0, p1.id);
    expect(s1.status).toBe("previewing");
    expect(s1.previewingProposalId).toBe(p1.id);
    expect(s1.current).toEqual(s0.baseline);

    const s2 = previewLayoutProposal(s1, p1.id);
    expect(s2.status).toBe("baseline");
    expect(s2.previewingProposalId).toBeNull();
  });

  it("applyLayoutProposal 후 revertLayoutProposal이 원본 baseline을 완벽히 복원한다", () => {
    const preset = getCutPreset("action-impact");
    const p1 = proposeBalloonSfxLayoutsTop3({ protectedZones: preset.protectedZones, dialogues: preset.dialogues }).proposals[0];
    const s0 = createPlacementSessionState();
    const applied = applyLayoutProposal(s0, p1);
    expect(applied.status).toBe("applied");
    expect(applied.canRevert).toBe(true);
    expect(applied.appliedProposalId).toBe(p1.id);
    expect(applied.current.balloons).toEqual(p1.balloons);
    expect(applied.baseline).toEqual(s0.baseline);

    const reverted = revertLayoutProposal(applied);
    expect(reverted.status).toBe("reverted");
    expect(reverted.canRevert).toBe(false);
    expect(reverted.appliedProposalId).toBeNull();
    expect(reverted.current).toEqual(s0.baseline);
  });

  it("이미 원본 상태일 때 revertLayoutProposal은 상태를 불필요하게 변형하지 않는다", () => {
    const s0 = createPlacementSessionState();
    expect(revertLayoutProposal(s0)).toBe(s0);
  });

  it("exportLayoutProposalJson은 스키마·네거티브 스페이스 요약·Top-3를 유효한 JSON으로 직렬화한다", () => {
    const preset = getCutPreset("romance-twoshot");
    const bundle = proposeBalloonSfxLayoutsTop3({ protectedZones: preset.protectedZones, dialogues: preset.dialogues });
    const session = createPlacementSessionState();
    const raw = exportLayoutProposalJson({
      presetId: preset.id,
      safeMargin: DEFAULT_SAFE_MARGIN,
      protectedZones: preset.protectedZones,
      bundle,
      session,
    });
    const parsed = JSON.parse(raw) as { schema: string; presetId: string; topProposals: unknown[] };
    expect(parsed.schema).toBe(PROPOSER_SCHEMA_VERSION);
    expect(parsed.presetId).toBe("romance-twoshot");
    expect(parsed.topProposals).toHaveLength(3);
  });

  it("exportLayoutProposalSvg는 XML 이스케이프·800×1200 viewBox·oklch 전용 및 탈-바이올렛 규율을 지킨다", () => {
    const preset = getCutPreset("closeup-monologue");
    const bundle = proposeBalloonSfxLayoutsTop3({
      protectedZones: preset.protectedZones,
      dialogues: [{ id: "d1", speakerNameKo: "지안", speakerNameEn: "Jian", text: "A < B & \"C\"", mouthX: 400, mouthY: 682, emotion: "thought" }],
    });
    const svg = exportLayoutProposalSvg({
      safeMargin: DEFAULT_SAFE_MARGIN,
      protectedZones: preset.protectedZones,
      proposal: bundle.proposals[0],
      showProtectedZones: true,
    });
    expect(svg).toContain('viewBox="0 0 800 1200"');
    expect(svg).toContain("A &lt; B &amp; &quot;C&quot;");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(svg).not.toMatch(/\brgba?\s*\(/iu);
    expect(svg).not.toMatch(/\bhsla?\s*\(/iu);
    assertZeroVioletOklch(svg);
  });
});

describe("5. StudioBalloonSfxProposerPanel UI 상호작용", () => {
  it("props 없이 기본 렌더 시 한글 제목·작가 승인 배지·5종 프리셋·800×1200 SVG·가림률 0%·Top-3 카드가 표시된다", () => {
    render(<StudioBalloonSfxProposerPanel />);
    expect(screen.getByTestId("studio-balloon-sfx-proposer-panel")).toBeTruthy();
    expect(screen.getByTestId("proposer-approval-badge").textContent).toContain("작가 승인 후 적용");
    expect(screen.getByTestId("proposer-face-occlusion-badge").textContent).toContain("0%");
    expect(screen.getByTestId("proposer-cut-preview-svg").getAttribute("viewBox")).toBe("0 0 800 1200");
    expect(screen.getByTestId("proposer-card-1")).toBeTruthy();
    expect(screen.getByTestId("proposer-card-2")).toBeTruthy();
    expect(screen.getByTestId("proposer-card-3")).toBeTruthy();
    for (const preset of CUT_COMPOSITION_PRESETS) {
      expect(screen.getByTestId(`proposer-preset-${preset.id}`)).toBeTruthy();
    }
  });

  it("5종 컷 구도 프리셋 전환 시 대사 행과 SVG 말풍선 수가 즉시 바뀐다", () => {
    render(<StudioBalloonSfxProposerPanel />);
    expect(screen.getByTestId("proposer-cut-preview-svg").getAttribute("data-balloon-count")).toBe("2");

    fireEvent.click(screen.getByTestId("proposer-preset-two-person-standoff"));
    expect(screen.getByTestId("proposer-cut-preview-svg").getAttribute("data-balloon-count")).toBe("3");
    expect(screen.getByTestId("proposer-face-occlusion-badge").textContent).toContain("0%");

    fireEvent.click(screen.getByTestId("proposer-preset-romance-twoshot"));
    expect(screen.getByTestId("proposer-svg-sfx").getAttribute("data-sfx-text")).toBe("두근");
  });

  it("대사 텍스트 편집과 감정 톤 변경이 SVG 말풍선 스타일·한글 SFX에 즉시 반영된다", () => {
    render(<StudioBalloonSfxProposerPanel />);
    fireEvent.change(screen.getByTestId("proposer-dialogue-input-1"), { target: { value: "지금 정면 돌파!!" } });
    fireEvent.change(screen.getByTestId("proposer-emotion-select-1"), { target: { value: "shout" } });
    expect(screen.getByTestId("proposer-svg-balloon-1").getAttribute("data-style")).toBe("shout-burst");
    expect(screen.getByTestId("proposer-svg-sfx").getAttribute("data-sfx-text")).toBe("콰앙!");
  });

  it("대사 추가/삭제 버튼이 최대 3개·최소 1개 제약을 지킨다", () => {
    render(<StudioBalloonSfxProposerPanel initialCutPresetId="action-impact" />);
    const addBtn = screen.getByTestId("proposer-add-dialogue-btn") as HTMLButtonElement;
    expect(addBtn.disabled).toBe(false);

    fireEvent.click(addBtn);
    expect(screen.getByTestId("proposer-dialogue-row-3")).toBeTruthy();
    expect(addBtn.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("proposer-remove-dialogue-3"));
    fireEvent.click(screen.getByTestId("proposer-remove-dialogue-2"));
    expect((screen.getByTestId("proposer-remove-dialogue-1") as HTMLButtonElement).disabled).toBe(true);
  });

  it("보호 영역 토글·여백 격자 토글·여백 안전거리 슬라이더가 실시간으로 동작한다", () => {
    render(<StudioBalloonSfxProposerPanel />);
    expect(screen.getByTestId("proposer-protected-zones-layer")).toBeTruthy();
    expect(screen.queryByTestId("proposer-negative-grid-layer")).toBeNull();

    fireEvent.click(screen.getByTestId("proposer-toggle-zones-btn"));
    expect(screen.queryByTestId("proposer-protected-zones-layer")).toBeNull();

    fireEvent.click(screen.getByTestId("proposer-toggle-grid-btn"));
    expect(screen.getByTestId("proposer-negative-grid-layer")).toBeTruthy();

    fireEvent.change(screen.getByTestId("proposer-safe-margin-slider"), { target: { value: "64" } });
    expect(screen.getByTestId("proposer-safe-margin-value").textContent).toBe("64px");
  });

  it("미리보기 → 적용(onApply) → 되돌리기(onRevert) 흐름이 비파괴적으로 동작한다", () => {
    const onApply = vi.fn();
    const onRevert = vi.fn();
    render(<StudioBalloonSfxProposerPanel onApply={onApply} onRevert={onRevert} />);

    const revertBtn = screen.getByTestId("proposer-revert-btn") as HTMLButtonElement;
    expect(revertBtn.disabled).toBe(true);

    fireEvent.click(screen.getByTestId("proposer-preview-btn-2"));
    expect(screen.getByTestId("proposer-session-status-badge").textContent).toContain("미리보기");
    expect(screen.getByTestId("proposer-cut-preview-svg").getAttribute("data-display-mode")).toBe("previewing");
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("proposer-apply-btn-2"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("proposer-session-status-badge").textContent).toContain("적용됨");
    expect(revertBtn.disabled).toBe(false);

    fireEvent.click(screen.getByTestId("proposer-card-revert-btn-2"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("proposer-session-status-badge").textContent).toContain("되돌림");
    expect(screen.getByTestId("proposer-cut-preview-svg").getAttribute("data-display-mode")).toBe("reverted");
    expect(revertBtn.disabled).toBe(true);
  });

  it("JSON 내보내기·SVG 코드 토글 및 영문 로케일(locale='en') 렌더가 정상 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioBalloonSfxProposerPanel initialCutPresetId="corridor-chase" locale="en" onExportJson={onExportJson} />);
    expect(screen.getByTestId("proposer-approval-badge").textContent).toContain("Author Approval Required");
    expect(screen.queryByTestId("proposer-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("proposer-export-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain(PROPOSER_SCHEMA_VERSION);
    expect(screen.getByTestId("proposer-json-preview").textContent).toContain('"corridor-chase"');

    fireEvent.click(screen.getByTestId("proposer-toggle-svg-btn"));
    expect(screen.getByTestId("proposer-svg-preview").textContent).toContain('viewBox="0 0 800 1200"');
  });
});

describe("6. 코드 위생·탈-바이올렛·Calm Atelier 자가 검증", () => {
  it("소유 4개 파일 전원 800줄 이하 및 금지 패턴 0건을 유지한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "balloon-sfx-placement-engine.ts",
      "StudioBalloonSfxProposerPanel.tsx",
      "index.ts",
      "balloon-sfx-placement.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const files = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(files.sort()).toEqual(["CutPlacementPreviewSvg.tsx", "PlacementOperationStatus.tsx", "StudioBalloonSfxProposerPanel.tsx", "balloon-sfx-placement-engine.ts", "balloon-sfx-placement.test.tsx", "index.ts", "placement-boundaries.test.tsx", "placement-input-contract.ts", "placement-output.ts", "use-placement-notification.ts"]);
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "balloon-sfx-placement.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        assertZeroVioletOklch(src);
      }

      if (file === "StudioBalloonSfxProposerPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("min-h-11");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("motion-reduce:transition-none");
        expect(src).toContain("작가 승인 후 적용");
      }
    }
  });

  it("패널·엔진 내 모든 oklch 색상이 바이올렛 휴(270~320°)를 0% 사용한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const engineSrc = readFileSync(path.join(dir, "placement-output.ts"), "utf8");
    const panelSrc = readFileSync(path.join(dir, "CutPlacementPreviewSvg.tsx"), "utf8");
    expect(engineSrc).toContain("oklch(");
    expect(panelSrc).toContain("oklch(");
    assertZeroVioletOklch(engineSrc);
    assertZeroVioletOklch(panelSrc);
  });
});
