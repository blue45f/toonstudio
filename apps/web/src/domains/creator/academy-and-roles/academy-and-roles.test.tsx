// @vitest-environment jsdom

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionAdoptionCenter } from "../production-hub/ProductionAdoptionCenter";

import {
  ACADEMY_AND_ROLES_HUB_SUMMARY,
  ACADEMY_ROLES_SPRITE_PATHS,
  ACADEMY_SKILL_TRACKS,
  CALM_TOOL_RAIL_BUDGET,
  GOAL_FIRST_RECIPES,
  GOVERNANCE_TIER_ORDER,
  MIGRATION_SHORTCUT_PRESETS,
  PIPELINE_STAGE_ORDER,
  SAMPLE_CUT_PAYOUT_ENTRIES,
  SAMPLE_SLA_WORKLOAD_CUTS,
  SHORTCUT_RHYTHM_DRILLS,
  STUDIO_CREATOR_ROLE_ORDER,
  STUDIO_CREATOR_ROLES,
  STUDIO_GOVERNANCE_TIERS,
  STUDIO_RBAC_ROLES,
  StudioAcademyAndRoleCraftHub,
  WEBTOON_8_STAGE_PIPELINE,
  WORKSPACE_HIERARCHY_LEVELS,
  XRAY_MANUSCRIPT_LAYERS,
  calculateCutPayoutLedger,
  composeMultiRoleWorkspace,
  computeAcademySkillTreeProgress,
  createOutsourceSandboxPackage,
  detectPipelineBottlenecks,
  evaluateRbacPermission,
  evaluateShortcutRhythmDrill,
  evaluateStageHandoffGate,
  executeCutBatonHandoff,
  normalizeCreatorRoleIds,
  searchGoalFirstRecipes,
  summarizeXrayLayerStack,
  verifyOutsourceReturnBundle,
  type CutPipelineRuntimeState,
} from "./index";

const REPO_ROOT = process.cwd();
const MODULE_DIR = resolve(REPO_ROOT, "apps/web/src/domains/creator/academy-and-roles");
const PUBLIC_DIR = resolve(REPO_ROOT, "apps/web/public");

afterEach(() => {
  cleanup();
});

describe("1. 12대 멀티 직군 작업 특화 합집합 조합기", () => {
  it("12종 풀 직군을 정본으로 제공하고 레거시 coloring 약칭을 밑색+명암으로 정규화한다", () => {
    expect(STUDIO_CREATOR_ROLE_ORDER).toEqual([
      "story",
      "storyboard",
      "stage3d",
      "character3d",
      "lineart",
      "flatting",
      "shading",
      "vfx",
      "lettering",
      "localization",
      "video",
      "producer",
    ]);
    expect(Object.keys(STUDIO_CREATOR_ROLES)).toHaveLength(12);
    expect(normalizeCreatorRoleIds(["storyboard", "coloring", "lineart"])).toEqual([
      "storyboard",
      "lineart",
      "flatting",
      "shading",
    ]);
  });

  it("멀티 선택 시 Calm 8슬롯 도구 레일 예산, 레이어 스택, 빈 직군 AI 보완, 체크리스트·이주 단축키를 합성한다", () => {
    const composed = composeMultiRoleWorkspace(
      ["story", "storyboard", "stage3d", "character3d", "lineart", "flatting", "shading", "vfx"],
      { shortcutPresetId: "procreate" },
    );

    expect(composed.fallbackApplied).toBe(false);
    expect(composed.primaryToolRailSlots.length).toBeLessThanOrEqual(CALM_TOOL_RAIL_BUDGET);
    expect(composed.primaryToolRailSlots.length).toBe(8);
    expect(composed.overflowToolSlots.length).toBeGreaterThan(0);

    // 선택된 8직군 외 나머지 4직군(lettering, localization, video, producer)은 AI 팀원이 자동 보완
    expect(composed.aiBackfillAssignments.map((a) => a.roleId)).toEqual([
      "lettering",
      "localization",
      "video",
      "producer",
    ]);
    expect(composed.totalEstimatedWeeklySavedHours).toBeGreaterThan(0);

    // 선택된 직군 레이어는 editable, 미선택 직군 레이어는 ai-assisted
    expect(
      composed.synthesizedLayerStack.some(
        (layer) => layer.ownerRoleId === "lineart" && layer.accessMode === "editable",
      ),
    ).toBe(true);
    expect(
      composed.synthesizedLayerStack.some(
        (layer) => layer.ownerRoleId === "lettering" && layer.accessMode === "ai-assisted",
      ),
    ).toBe(true);

    expect(composed.shortcutPreset.id).toBe("procreate");
    expect(composed.preExportChecklist.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(MIGRATION_SHORTCUT_PRESETS)).toEqual([
      "csp",
      "procreate",
      "photoshop",
      "beginner",
    ]);
  });

  it("빈 선택 입력에서도 안전 폴백을 적용해 오류 없이 작업대를 합성한다", () => {
    const fallback = composeMultiRoleWorkspace([], { enableAiBackfill: false });
    expect(fallback.fallbackApplied).toBe(true);
    expect(fallback.selectedRoles).toEqual(["storyboard", "lineart"]);
    expect(fallback.aiBackfillAssignments).toHaveLength(0);
  });
});

describe("2. 8단계 분업 파이프라인 · 바통 터치 게이트 · 7단계 거버넌스 · 정산 · SLA 병목", () => {
  it("8단계 표준 파이프라인과 5대 자동 검수 게이트 및 이전 공정 Read-Only 잠금을 검증한다", () => {
    expect(WEBTOON_8_STAGE_PIPELINE).toHaveLength(8);
    expect(PIPELINE_STAGE_ORDER).toEqual([
      "conti",
      "bg3d-vrm",
      "lineart",
      "flatting",
      "shading",
      "post-fx",
      "lettering-loc",
      "final-bom",
    ]);

    const blocked = evaluateStageHandoffGate({
      cutId: "CUT-12-014",
      currentStageId: "lineart",
      layerNames: ["레이어 1"],
      widthPx: 1080,
      dpi: 150,
      openLineGapCount: 4,
      biblePaletteMatchPercent: 98,
      missingRightsBomCount: 2,
    });
    expect(blocked.passed).toBe(false);
    expect(blocked.canOneClickHandoff).toBe(false);
    expect(blocked.blockingReasonsKo.length).toBe(4);
    expect(blocked.previousStageLayerLock.locked).toBe(false);

    const passedInput = {
      cutId: "CUT-12-014",
      currentStageId: "lineart" as const,
      layerNames: ["04_LINEART_MAIN", "04_LINEART_HAIR"],
      widthPx: 1600,
      dpi: 350,
      openLineGapCount: 0,
      biblePaletteMatchPercent: 99,
      missingRightsBomCount: 0,
      nextAssigneeNameKo: "민수(밑색)",
    };
    const passed = evaluateStageHandoffGate(passedInput);
    expect(passed.passed).toBe(true);
    expect(passed.nextStageId).toBe("flatting");
    expect(passed.previousStageLayerLock).toMatchObject({
      locked: true,
      mode: "read-only",
      stageId: "lineart",
    });
    expect(passed.downstreamStageUnlocked).toMatchObject({
      unlocked: true,
      stageId: "flatting",
      notifiedAssigneeKo: "민수(밑색)",
    });

    const initialCut: CutPipelineRuntimeState = {
      cutId: "CUT-12-014",
      currentStageId: "lineart",
      lockedReadOnlyStageIds: ["conti", "bg3d-vrm"],
      unlockedStageId: "lineart",
      handoffHistory: [],
    };
    const handoff = executeCutBatonHandoff(initialCut, passedInput, "2026-11-23T12:00:00Z");
    expect(handoff.transitioned).toBe(true);
    expect(handoff.nextState.currentStageId).toBe("flatting");
    expect(handoff.nextState.lockedReadOnlyStageIds).toContain("lineart");
    expect(handoff.nextState.handoffHistory).toHaveLength(1);
  });

  it("7단계 거버넌스(동아리·교육 클래스·연합 룸 포함), 5계층, 6역할 RBAC 경계를 검증한다", () => {
    expect(GOVERNANCE_TIER_ORDER).toEqual([
      "solo",
      "amateur-club",
      "classroom-edu",
      "duo-trio",
      "studio-8",
      "agency-30plus",
      "cross-studio-federation",
    ]);
    expect(STUDIO_GOVERNANCE_TIERS["solo"].approvalChromeMode).toBe("hidden");
    expect(STUDIO_GOVERNANCE_TIERS["classroom-edu"].approvalChromeMode).toBe("instructor-rubric");
    expect(STUDIO_GOVERNANCE_TIERS["cross-studio-federation"].approvalChromeMode).toBe(
      "federated-council",
    );
    expect(WORKSPACE_HIERARCHY_LEVELS.map((l) => l.id)).toEqual([
      "organization",
      "brand-label",
      "series",
      "episode",
      "cut",
    ]);
    expect(Object.keys(STUDIO_RBAC_ROLES)).toHaveLength(6);

    expect(evaluateRbacPermission("ep-pd", "manage-billing-payout").allowed).toBe(true);
    expect(evaluateRbacPermission("ep-pd", "edit-all-layers").allowed).toBe(false);
    expect(evaluateRbacPermission("ad-lead", "edit-all-layers").allowed).toBe(true);
    expect(evaluateRbacPermission("outsource-guest", "view-full-episode").allowed).toBe(false);
    expect(evaluateRbacPermission("outsource-guest", "view-sandbox-cuts-only").allowed).toBe(true);
    expect(
      evaluateRbacPermission("outsource-guest", "edit-assigned-stage-only", {
        isAssignedCutInSandbox: false,
      }).allowed,
    ).toBe(false);
    expect(evaluateRbacPermission("client-reviewer", "leave-pin-review").allowed).toBe(true);
    expect(evaluateRbacPermission("client-reviewer", "export-commercial-master").allowed).toBe(
      false,
    );
  });

  it("외주 샌드박스 5컷 제한 격리·워터마크·반입 BOM/해상도 검증을 수행한다", () => {
    const pkg = createOutsourceSandboxPackage({
      episodeId: "episode-12",
      totalEpisodeCuts: 60,
      requestedCutIds: ["C1", "C2", "C3", "C4", "C5", "C6", "C7"],
      stageId: "flatting",
      contractorHandle: "guest_color",
      sessionCode: "S2026",
    });
    expect(pkg.exposedCutIds).toHaveLength(5);
    expect(pkg.truncatedOverflowCount).toBe(2);
    expect(pkg.hiddenOtherCutCount).toBe(55);
    expect(pkg.upstreamLayersReadOnlyLocked).toBe(true);
    expect(pkg.sessionWatermarkSignature).toBe("WM-SBX-S2026-GUEST_COLOR");

    const accepted = verifyOutsourceReturnBundle(pkg, {
      returnedCutIds: ["C1", "C2", "C3"],
      watermarkSignature: pkg.sessionWatermarkSignature,
      minDetectedWidthPx: 1600,
      missingRightsBomCount: 0,
      layerNamingCompliant: true,
    });
    expect(accepted.accepted).toBe(true);

    const rejected = verifyOutsourceReturnBundle(pkg, {
      returnedCutIds: ["C1", "C99"],
      watermarkSignature: "WM-TAMPERED",
      minDetectedWidthPx: 800,
      missingRightsBomCount: 2,
      layerNamingCompliant: false,
    });
    expect(rejected.accepted).toBe(false);
    expect(rejected.violationsKo.length).toBe(5);
  });

  it("컷당·공정당 원고료 정산 원장과 마감 SLA 병목 감지기를 정확히 계산한다", () => {
    const ledger = calculateCutPayoutLedger(SAMPLE_CUT_PAYOUT_ENTRIES);
    expect(ledger.totalEntries).toBe(SAMPLE_CUT_PAYOUT_ENTRIES.length);
    expect(ledger.totalApprovedPayableKrw + ledger.totalPendingReviewKrw).toBe(
      ledger.grandTotalKrw,
    );
    expect(ledger.totalApprovedPayableKrw).toBeGreaterThan(0);
    expect(ledger.totalPendingReviewKrw).toBeGreaterThan(0);
    expect(ledger.byAssignee.length).toBeGreaterThanOrEqual(4);

    const bottlenecks = detectPipelineBottlenecks(SAMPLE_SLA_WORKLOAD_CUTS, {
      stageWipCapacity: 2,
    });
    expect(bottlenecks.overallSeverity).toBe("critical");
    expect(bottlenecks.totalOverdueCuts).toBeGreaterThanOrEqual(4);
    expect(bottlenecks.stageAlerts[0]?.severity).toBe("critical");
    expect(bottlenecks.stageAlerts[0]?.prescriptionKo).toContain("외주");
  });
});

describe("3. 툰스튜디오 아카데미 6트랙 · 8층 X-Ray · 8종 역색인 처방전 · 리듬 트레이너", () => {
  it("6단계 스킬 트리 진도·해금, 8층 X-Ray 단면 요약, 8종 목적별 역색인 검색, 단축키 리듬 평가를 검증한다", () => {
    expect(ACADEMY_SKILL_TRACKS).toHaveLength(6);
    const progress = computeAcademySkillTreeProgress(["track-1-first-cut", "track-2-line-and-form"]);
    expect(progress.completedCount).toBe(2);
    expect(progress.completionPercent).toBe(33);
    expect(progress.unlockedTrackIds).toContain("track-3-color-and-light");
    expect(progress.unlockedTrackIds).toContain("track-4-bg3d-vrm-stage");
    expect(progress.unlockedTrackIds).not.toContain("track-6-studio-pipeline");

    expect(XRAY_MANUSCRIPT_LAYERS).toHaveLength(8);
    const xray = summarizeXrayLayerStack(["xray-1-bg3d", "xray-3-vrm-guide", "xray-4-char-line"]);
    expect(xray.visibleCount).toBe(3);
    expect(xray.exportableVisibleCount).toBe(2);
    expect(xray.nonExportGuideVisibleCount).toBe(1);

    expect(GOAL_FIRST_RECIPES).toHaveLength(8);
    expect(searchGoalFirstRecipes("외주").length).toBeGreaterThanOrEqual(1);
    expect(searchGoalFirstRecipes("숏폼", "video")).toHaveLength(1);
    expect(searchGoalFirstRecipes("존재하지않는키워드")).toHaveLength(0);

    expect(SHORTCUT_RHYTHM_DRILLS).toHaveLength(4);
    const masterEval = evaluateShortcutRhythmDrill("drill-ink-loop", 4, 2000);
    expect(masterEval.gradeKo).toBe("리듬 마스터");
    expect(masterEval.measuredBpm).toBeGreaterThanOrEqual(masterEval.targetBpm);
  });
});

describe("4. UI 4탭 통합 렌더링 & 정적 품질 계약(실물 스프라이트·원시색 0·저장소 0·600줄 이하)", () => {
  it("4개 탭 전환과 멀티 직군·바통 터치·거버넌스·아카데미 X-Ray 인터랙션이 정상 동작한다", () => {
    render(<StudioAcademyAndRoleCraftHub />);

    expect(screen.getByTestId("studio-academy-and-role-craft-hub")).toBeTruthy();
    expect(screen.getByTestId("arc-panel-roles")).toBeTruthy();
    expect(ACADEMY_AND_ROLES_HUB_SUMMARY.roleCount).toBe(12);

    // 탭 1: 직군 추가 토글 + 단축키 프리셋 전환
    fireEvent.click(screen.getByTestId("role-toggle-stage3d"));
    fireEvent.click(screen.getByTestId("shortcut-preset-photoshop"));
    expect(screen.getByTestId("role-rail-budget-badge").textContent).toContain("/ 8 슬롯");

    // 탭 2: 8단계 분업·바통터치 → 원클릭 인계 실행
    fireEvent.click(screen.getByTestId("arc-tab-pipeline"));
    expect(screen.getByTestId("academy-pipeline-board")).toBeTruthy();
    const handoffBtn = screen.getByTestId("pipeline-oneclick-handoff-btn") as HTMLButtonElement;
    expect(handoffBtn.disabled).toBe(false);
    fireEvent.click(handoffBtn);
    expect(screen.getByTestId("pipeline-stage-flatting").getAttribute("data-stage-state")).toBe(
      "active",
    );

    // 탭 3: 스튜디오 거버넌스·정산 (연합 룸·클래스·외주 샌드박스·원장·SLA)
    fireEvent.click(screen.getByTestId("arc-tab-governance"));
    expect(screen.getByTestId("academy-governance-board")).toBeTruthy();
    fireEvent.click(screen.getByTestId("gov-tier-cross-studio-federation"));
    expect(screen.getAllByText(/Canon Hub/u).length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByTestId("gov-tier-classroom-edu"));
    expect(screen.getByText(/강사 전용 라이브 첨삭/u)).toBeTruthy();
    expect(screen.getByTestId("payout-ledger-panel")).toBeTruthy();
    expect(screen.getByTestId("sla-bottleneck-panel")).toBeTruthy();

    // 탭 4: 아카데미 스킬트리 · X-Ray · 역색인 처방전 · 리듬 트레이너
    fireEvent.click(screen.getByTestId("arc-tab-academy"));
    expect(screen.getByTestId("arc-panel-academy")).toBeTruthy();
    expect(screen.getByTestId("academy-xray-lab")).toBeTruthy();
    fireEvent.click(screen.getByTestId("xray-toggle-xray-3-vrm-guide"));
    expect(screen.getByText(/표시 7 \/ 8층/u)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("해결하고 싶은 작업 고민 검색"), {
      target: { value: "야경" },
    });
    expect(screen.getByText(/야경 · 역광 장면을 3분 안에/u)).toBeTruthy();
  });

  it("ProductionAdoptionCenter의 기본 접힘 disclosure를 열면 아카데미·직군·거버넌스 허브가 지연 마운트된다", async () => {
    render(
      <MemoryRouter>
        <ProductionAdoptionCenter
          isDemo
          process={null}
          candidate={null}
          editorHref="/studio/comic"
          externalReviewHref={null}
          onOpen={() => undefined}
        />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId(
      "production-academy-role-craft-disclosure",
    ) as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-academy-and-role-craft-hub")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-academy-and-role-craft-hub")).toBeTruthy();
    });
  });

  it("참조된 모든 vibrant-sprites WebP 실물 파일이 존재하고 원시색·스토리지 직접 호출·600줄 초과가 0건이다", () => {
    for (const spritePath of Object.values(ACADEMY_ROLES_SPRITE_PATHS)) {
      const fullPath = resolve(PUBLIC_DIR, spritePath.replace(/^\//u, ""));
      expect(existsSync(fullPath), `missing sprite: ${spritePath}`).toBe(true);
    }

    const files = readdirSync(MODULE_DIR).filter((name) => /\.(?:ts|tsx|css)$/u.test(name));
    expect(files.length).toBeGreaterThanOrEqual(8);

    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/u;
    const forbiddenStorageRegex = /\b(?:localStorage|sessionStorage|indexedDB)\b/u;

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} exceeds 600 lines (${lineCount})`).toBeLessThanOrEqual(600);
      if (file !== "academy-and-roles.test.tsx") {
        expect(rawColorRegex.test(content), `raw hex/rgb/hsl in ${file}`).toBe(false);
        expect(forbiddenStorageRegex.test(content), `direct browser storage in ${file}`).toBe(
          false,
        );
      }
    }
  });
});
