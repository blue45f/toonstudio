import { describe, expect, it } from "vitest";
import { createInitialStudioProjectPlanning } from "../studio-planning-store";
import {
  buildEpisodePlanPatchFromPlotr,
  cancelBatchCutQueue,
  createBatchCutQueue,
  exportPlotrTextConti,
  findArtStylePreset,
  mergeImportedConsistencyAssets,
  removeOrClearConsistencyAsset,
  resolveContextPromptMode,
  stepBatchCutQueue,
} from "./plotr-consistency-and-batch";
import { createPlotrDocumentFromTemplate } from "./plotr-device-store";
import {
  PLOTR_GENRE_TEMPLATES,
  extractConsistencyAssetsFromScript,
  generatePlotrScriptDraft,
  revisePlotrScriptByDirective,
} from "./plotr-genre-templates";
import {
  auditReverseShotAxis,
  batchToggleCutBubbles,
  fixReverseShotAxisOnCut,
  mergePlotrCutWithNext,
  movePlotrCut,
  parseScriptToPlotrCuts,
  splitPlotrCut,
  toggleCutAssetReference,
  updateCutDialoguePreservingSource,
} from "./plotr-script-cut-engine";

describe("Plotr 클린룸 스토리·컷·소재·배치 엔진", () => {
  it("4종 초보자 장르 템플릿이 대본·컷·소재·타임라인·공간 보드를 완전하게 구성한다", () => {
    expect(PLOTR_GENRE_TEMPLATES.map((t) => t.id)).toEqual([
      "rofan",
      "regression-hunter",
      "campus-romance",
      "thriller",
    ]);
    for (const tpl of PLOTR_GENRE_TEMPLATES) {
      const doc = createPlotrDocumentFromTemplate("proj-tpl", tpl.id);
      expect(doc.cuts.length).toBeGreaterThanOrEqual(4);
      expect(doc.assets.length).toBeGreaterThanOrEqual(3);
      expect(doc.scenes.length).toBeGreaterThanOrEqual(2);
      expect(doc.subwayTimeline.events.length).toBeGreaterThanOrEqual(2);
      expect(doc.spatialBoard.nodes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("대본 도우미 초안 생성, 지시문 수정, 인물·배경·소품 자동 추출이 동작한다", () => {
    const draft = generatePlotrScriptDraft({
      genre: "로판",
      targetReader: "20대 독자",
      mood: "긴장감 있게",
      scope: "series-ep1",
      length: "long",
      trendTags: ["계약결혼", "회귀각성"],
      logline: "주인공이 은빛 시계를 들고 연회장으로 들어선다.",
      worldSettingNote: "유리온실 연회장",
    });
    expect(draft).toContain("[컷 6]");
    const revised = revisePlotrScriptByDirective(draft, "주인공을 더 냉소적으로");
    expect(revised).toContain("감상은 필요 없어");
    const assets = extractConsistencyAssetsFromScript(draft);
    expect(assets.some((a) => a.category === "character" && a.name === "주인공")).toBe(true);
    expect(assets.some((a) => a.category === "location" && a.name.includes("연회장"))).toBe(true);
  });

  it("대본([컷 N])과 웹소설 산문(스토리 모드)을 4종 형식(웹툰·컷만화·출판만화·영상)으로 분해한다", () => {
    const prose = `자정의 도서관에 비가 쏟아졌다.\n\n"그 편지를 아직 가지고 있나?"\n\n서연은 대답 대신 은빛 반지를 꺼냈다.`;
    const webtoon = parseScriptToPlotrCuts({
      script: prose,
      format: "webtoon",
      inputMode: "webnovel-story",
      worldSettingNote: "비 오는 현대 판타지",
    });
    expect(webtoon).toHaveLength(3);
    expect(webtoon[0]!.compositionBrief).toContain("비 오는 현대 판타지");

    const video = parseScriptToPlotrCuts({
      script: prose,
      format: "video-storyboard",
      inputMode: "webnovel-story",
    });
    expect(video.every((c) => typeof c.durationSec === "number" && c.durationSec >= 3)).toBe(true);

    const manga = parseScriptToPlotrCuts({
      script: prose,
      format: "print-manga",
      inputMode: "webnovel-story",
    });
    expect(manga[0]!.cameraShot).toContain("1쪽 1칸");
  });

  it("180° 리버스 샷 축 위반을 감지하고 원클릭 교정하며, 말풍선 삭제 후 재적용에도 수정 대사를 보존한다", () => {
    const doc = createPlotrDocumentFromTemplate("proj-axis", "rofan");
    const forcedViolation = doc.cuts.map((cut, idx) =>
      idx === 1 || idx === 2
        ? { ...cut, locationName: "유리온실 연회장", cameraSide: "left" as const }
        : cut,
    );
    const warnings = auditReverseShotAxis(forcedViolation);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    const fixed = fixReverseShotAxisOnCut(forcedViolation, warnings[0]!.cutId);
    expect(auditReverseShotAxis(fixed)).toHaveLength(0);

    const cut1 = doc.cuts[0]!;
    const dlg1 = cut1.dialogues[0]!;
    let nextCuts = batchToggleCutBubbles(doc.cuts, true);
    nextCuts = updateCutDialoguePreservingSource(nextCuts, cut1.id, dlg1.id, "내가 직접 고친 대사");
    nextCuts = batchToggleCutBubbles(nextCuts, false);
    nextCuts = batchToggleCutBubbles(nextCuts, true);
    expect(nextCuts[0]!.bubblesApplied).toBe(true);
    expect(nextCuts[0]!.dialogues[0]!.text).toBe("내가 직접 고친 대사");
  });

  it("컷 분할·병합·이동 및 소재 참조 토글이 순번과 참조를 정확히 유지한다", () => {
    const doc = createPlotrDocumentFromTemplate("proj-ops", "campus-romance");
    const split = splitPlotrCut(doc.cuts, doc.cuts[0]!.id);
    expect(split).toHaveLength(doc.cuts.length + 1);
    const merged = mergePlotrCutWithNext(split, split[0]!.id);
    expect(merged).toHaveLength(doc.cuts.length);
    const moved = movePlotrCut(merged, merged[1]!.id, -1);
    expect(moved[0]!.id).toBe(merged[1]!.id);
    expect(moved[0]!.sceneTitle).toBe("1컷");

    const toggled = toggleCutAssetReference(moved, moved[0]!.id, doc.assets[0]!.id);
    const hadBefore = moved[0]!.referencedAssetIds.includes(doc.assets[0]!.id);
    expect(toggled[0]!.referencedAssetIds.includes(doc.assets[0]!.id)).toBe(!hadBefore);
  });

  it("소재 이중 의미 ✕(비우기→삭제)와 타 프로젝트 이름 병합 가져오기 규칙을 준수한다", () => {
    const doc = createPlotrDocumentFromTemplate("proj-assets", "rofan");
    const filled = doc.assets.find((a) => a.visualNote.trim().length > 0)!;

    // 1차 클릭: 외형만 비우고 슬롯 유지
    const step1 = removeOrClearConsistencyAsset(doc.assets, filled.id);
    expect(step1.action).toBe("cleared-visual");
    expect(step1.nextAssets).toHaveLength(doc.assets.length);
    expect(step1.nextAssets.find((a) => a.id === filled.id)?.visualNote).toBe("");

    // 2차 클릭: 빈 슬롯 완전 삭제
    const step2 = removeOrClearConsistencyAsset(step1.nextAssets, filled.id);
    expect(step2.action).toBe("deleted-asset");
    expect(step2.nextAssets).toHaveLength(doc.assets.length - 1);

    // 이름 병합 가져오기: 빈 슬롯(은빛 회중시계)만 채우고 이미 채워진 카시안은 건너뛴다
    const mergeResult = mergeImportedConsistencyAssets(
      doc.assets,
      [
        {
          id: "ext-1",
          category: "prop",
          name: "은빛 회중시계",
          visualNote: "외부 프로젝트에서 불러온 시계 설명",
          swatchOklch: "oklch(0.69 0.15 215)",
          costumeOrMaterial: "은장",
        },
        {
          id: "ext-2",
          category: "character",
          name: "카시안",
          visualNote: "덮어쓰면 안 되는 설명",
          swatchOklch: "oklch(0.58 0.15 255)",
          costumeOrMaterial: "망토",
        },
      ],
      "이전 시즌",
    );
    expect(mergeResult.filledExistingCount).toBe(1);
    expect(mergeResult.skippedFilledCount).toBe(1);
    expect(
      mergeResult.nextAssets.find((a) => a.name === "은빛 회중시계")?.visualNote,
    ).toBe("외부 프로젝트에서 불러온 시계 설명");
    expect(
      mergeResult.nextAssets.find((a) => a.name === "카시안")?.visualNote,
    ).not.toBe("덮어쓰면 안 되는 설명");
  });

  it("빈 컷 일괄 조립 큐(소재 선행→3컷 배치→Esc 중단), 상황별 프롬프트 바, TXT 내보내기 및 회차 패치가 동작한다", () => {
    const doc = createPlotrDocumentFromTemplate("proj-batch", "rofan");
    const q0 = createBatchCutQueue(doc.assets, doc.cuts);
    expect(q0.phase).toBe("resolving-assets");
    expect(q0.pendingAssetIds.length).toBeGreaterThan(0);

    // 1단계: 빈 소재 선행 확정
    const s1 = stepBatchCutQueue(q0, doc.assets, doc.cuts, findArtStylePreset("watercolor"));
    expect(s1.nextAssets.every((a) => a.visualNote.trim().length > 0)).toBe(true);
    expect(s1.nextQueue.phase).toBe("building-cuts");

    // 2단계: 동시 3컷 조립 후 중단
    const s2 = stepBatchCutQueue(s1.nextQueue, s1.nextAssets, s1.nextCuts, findArtStylePreset("watercolor"));
    expect(s2.nextQueue.completedCutIds).toHaveLength(3);
    const cancelled = cancelBatchCutQueue(s2.nextQueue);
    expect(cancelled.active).toBe(false);
    expect(cancelled.phase).toBe("cancelled");

    expect(resolveContextPromptMode([]).mode).toBe("create");
    expect(resolveContextPromptMode(["c1"]).mode).toBe("edit");
    expect(resolveContextPromptMode(["c1", "c2"]).mode).toBe("compose-ref");

    const txt = exportPlotrTextConti(doc);
    expect(txt).toContain(doc.title);
    expect(txt).toContain("[1컷]");

    const initialPlanning = createInitialStudioProjectPlanning("proj-batch");
    const patched = buildEpisodePlanPatchFromPlotr(initialPlanning.plans[0]!, doc);
    expect(patched.title).toBe(doc.title);
    expect(patched.turningPoints).toHaveLength(doc.cuts.length);
  });
});
