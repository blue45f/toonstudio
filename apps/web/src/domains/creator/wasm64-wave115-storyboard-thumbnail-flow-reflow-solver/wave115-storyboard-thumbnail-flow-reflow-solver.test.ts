import { describe, expect, it } from "vitest";
import {
  analyzeStoryboardFlowAndTensionArc,
  applyStoryboardReflowOperation,
  applySuggestion,
  buildStoryboardFlowProjection,
  computeStoryboardStateSha256Hex,
  createStoryboardReflowSession,
  escapeStoryboardXml,
  renderStoryboardFlowBoardSvg,
  sha256Utf8Hex,
  summarizeStoryboardFlowAuditKo,
  type StoryboardAct,
  type StoryboardCutInput,
} from "./index";

function makeCut(
  cutId: string,
  sceneId: string,
  sceneTitleKo: string,
  titleKo: string,
  act: StoryboardAct,
  tension: number,
  dialogueCharCount: number,
  visualComplexity: number,
  heightPx: number,
  gutterBeforePx: number,
  extra?: Pick<StoryboardCutInput, "lockedAnchor" | "continuityTargetCutIds">,
): StoryboardCutInput {
  return {
    cutId,
    sceneId,
    sceneTitleKo,
    titleKo,
    act,
    tension,
    dialogueCharCount,
    visualComplexity,
    heightPx,
    gutterBeforePx,
    ...extra,
  };
}

function createBalancedEpisodeCuts(): StoryboardCutInput[] {
  return [
    makeCut("cut-01", "sc-01", "비 오는 골목 도입", "네온 간판 아래 발걸음", "intro", 0.22, 18, 0.45, 680, 60, {
      continuityTargetCutIds: ["cut-09"],
    }),
    makeCut("cut-02", "sc-01", "비 오는 골목 도입", "떨어진 은색 열쇠 클로즈업", "intro", 0.34, 24, 0.52, 540, 70, {
      continuityTargetCutIds: ["cut-11"],
    }),
    makeCut("cut-03", "sc-01", "비 오는 골목 도입", "주인공 뒤돌아봄", "intro", 0.28, 32, 0.4, 600, 65),
    makeCut("cut-04", "sc-02", "지하 서고 탐색", "철문 개방 롱샷", "development", 0.45, 26, 0.62, 760, 140),
    makeCut("cut-05", "sc-02", "지하 서고 탐색", "낡은 일지 발견", "development", 0.56, 48, 0.55, 620, 72),
    makeCut("cut-06", "sc-02", "지하 서고 탐색", "찢겨 나간 마지막 장", "development", 0.48, 40, 0.5, 580, 68),
    makeCut("cut-07", "sc-03", "추격자 조우와 반전", "등 뒤에서 들린 구두 소리", "twist", 0.68, 22, 0.66, 700, 150),
    makeCut("cut-08", "sc-03", "추격자 조우와 반전", "손전등 빛 속 그림자", "twist", 0.78, 30, 0.72, 660, 96),
    makeCut("cut-09", "sc-03", "추격자 조우와 반전", "골목 발자국 정체 드러남", "twist", 0.64, 42, 0.6, 640, 88),
    makeCut("cut-10", "sc-04", "옥상 대치와 엔딩 훅", "빗속 옥상 대면", "climax", 0.84, 34, 0.78, 820, 155),
    makeCut("cut-11", "sc-04", "옥상 대치와 엔딩 훅", "은색 열쇠로 봉인 해제", "climax", 0.94, 16, 0.86, 980, 170, {
      lockedAnchor: true,
    }),
    makeCut("cut-12", "sc-04", "옥상 대치와 엔딩 훅", "열린 문 너머 붉은 눈빛", "climax", 0.96, 12, 0.88, 920, 165),
  ];
}

function createFlatlineCuts(): StoryboardCutInput[] {
  return [
    makeCut("f1", "s1", "평탄 씬", "도입", "intro", 0.2, 20, 0.4, 600, 60),
    makeCut("f2", "s1", "평탄 씬", "정체1", "development", 0.4, 18, 0.4, 540, 60),
    makeCut("f3", "s1", "평탄 씬", "정체2", "development", 0.43, 16, 0.42, 540, 60),
    makeCut("f4", "s1", "평탄 씬", "정체3", "development", 0.41, 20, 0.44, 540, 60),
    makeCut("f5", "s1", "평탄 씬", "정체4", "development", 0.45, 22, 0.41, 540, 60),
    makeCut("f6", "s2", "절정 씬", "클라이맥스", "climax", 0.92, 14, 0.82, 880, 150),
  ];
}

describe("Wave 115 — 스토리보드 이중 투영 (2D 썸네일 보드 + 세로 마스터 스트립)", () => {
  it("12컷 4씬 회차를 2D 4열 보드와 세로 스크롤 스트립 양쪽으로 결정론적 투영한다", () => {
    const projection = buildStoryboardFlowProjection(createBalancedEpisodeCuts(), {
      episodeTitleKo: "제14화 은색 열쇠의 비밀",
      columns: 4,
    });

    expect(projection.episodeTitleKo).toBe("제14화 은색 열쇠의 비밀");
    expect(projection.columns).toBe(4);
    expect(projection.cuts).toHaveLength(12);
    expect(projection.scenes).toHaveLength(4);
    expect(projection.continuityLinks).toHaveLength(2);
    expect(projection.continuityViolations).toHaveLength(0);
    expect(projection.scenes[0]?.startCutIndex).toBe(0);
    expect(projection.scenes[0]?.endCutIndex).toBe(2);
    expect(projection.scenes[3]?.endCutIndex).toBe(11);

    let expectedEndY = 0;
    let prevReadingSec = 0;
    for (let i = 0; i < projection.cuts.length; i += 1) {
      const cut = projection.cuts[i];
      if (!cut) continue;
      expect(cut.yPx).toBe(expectedEndY + cut.gutterBeforePx);
      expect(cut.endYPx).toBe(cut.yPx + cut.heightPx);
      expect(cut.vertical.yPx).toBe(cut.yPx);
      expect(cut.vertical.cumulativeReadingSec).toBeGreaterThan(prevReadingSec);
      expectedEndY = cut.endYPx;
      prevReadingSec = cut.cumulativeReadingSec;
    }
    expect(projection.stripTotalHeightPx).toBe(expectedEndY);
    expect(projection.totalReadingSec).toBe(prevReadingSec);
  });

  it("열 수(columns) 변경 시 2D 보드 배치는 갱신되지만 세로 스트립 좌표와 SHA-256 상태 지문은 불변이다", () => {
    const cuts = createBalancedEpisodeCuts();
    const proj3 = buildStoryboardFlowProjection(cuts, { columns: 3 });
    const proj6 = buildStoryboardFlowProjection(cuts, { columns: 6 });

    expect(proj3.boardWidthPx).toBeLessThan(proj6.boardWidthPx);
    expect(proj3.stripTotalHeightPx).toBe(proj6.stripTotalHeightPx);
    expect(proj3.totalReadingSec).toBe(proj6.totalReadingSec);
    expect(proj3.stateSha256Hex).toBe(proj6.stateSha256Hex);
    expect(proj3.cuts.map((c) => c.yPx)).toEqual(proj6.cuts.map((c) => c.yPx));
  });

  it("80컷 장편 웹툰 에피소드에서도 모든 2D 카드가 겹치지 않고 유한 좌표를 유지한다", () => {
    const cuts: StoryboardCutInput[] = Array.from({ length: 80 }, (_, idx) => {
      const sceneNum = Math.floor(idx / 10) + 1;
      const act: StoryboardAct =
        idx < 16 ? "intro" : idx < 44 ? "development" : idx < 64 ? "twist" : idx < 76 ? "climax" : "epilogue";
      return makeCut(
        `ep80-c${String(idx + 1).padStart(2, "0")}`,
        `sc-${String(sceneNum).padStart(2, "0")}`,
        `씬 ${sceneNum}`,
        `컷 ${idx + 1}`,
        act,
        Math.min(0.98, 0.2 + (idx / 80) * 0.72 + ((idx % 3) - 1) * 0.06),
        20 + (idx % 5) * 10,
        0.4 + (idx % 4) * 0.12,
        540 + (idx % 4) * 90,
        idx % 10 === 0 ? 140 : 65,
      );
    });

    const projection = buildStoryboardFlowProjection(cuts, { columns: 5 });
    expect(projection.cuts).toHaveLength(80);
    expect(projection.scenes).toHaveLength(8);
    expect(Number.isFinite(projection.boardHeightPx)).toBe(true);
    expect(Number.isFinite(projection.stripTotalHeightPx)).toBe(true);

    for (let i = 0; i < projection.cuts.length; i += 1) {
      const a = projection.cuts[i]?.boardCell;
      if (!a) continue;
      for (let j = i + 1; j < projection.cuts.length; j += 1) {
        const b = projection.cuts[j]?.boardCell;
        if (!b) continue;
        const overlapX = a.xPx < b.xPx + b.widthPx && b.xPx < a.xPx + a.widthPx;
        const overlapY = a.yPx < b.yPx + b.heightPx && b.yPx < a.yPx + a.heightPx;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it("빈 컷 목록과 비정상 수치(NaN/음수/범위 초과) 입력을 안전하게 정규화한다", () => {
    const emptyProj = buildStoryboardFlowProjection([]);
    expect(emptyProj.cuts).toHaveLength(0);
    expect(emptyProj.stripTotalHeightPx).toBe(0);
    expect(emptyProj.totalReadingSec).toBe(0);

    const weirdProj = buildStoryboardFlowProjection([
      makeCut("cut-weird", "sc-1", "씬1", "이상치 컷", "intro", Number.NaN, -30, 9.5, Number.POSITIVE_INFINITY, -50),
    ]);
    const cut = weirdProj.cuts[0];
    expect(cut?.tension).toBe(0);
    expect(cut?.dialogueCharCount).toBe(0);
    expect(cut?.visualComplexity).toBe(1);
    expect(cut?.heightPx).toBe(640);
    expect(cut?.gutterBeforePx).toBe(0);
  });
});

describe("Wave 115 — 5종 원자 리플로우 연산, 잠금 보호, 복선 역전 검출", () => {
  it("reorder-cut으로 컷을 드래그 이동하면 2D 보드와 세로 스트립이 동기 갱신된다", () => {
    const res = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "reorder-cut",
      cutId: "cut-06",
      targetIndex: 3,
    });
    expect(res.applied).toBe(true);
    expect(res.rejected).toBe(false);
    expect(res.cuts[3]?.cutId).toBe("cut-06");
    expect(res.cuts[4]?.cutId).toBe("cut-04");
    expect(res.nextSha256Hex).not.toBe(res.previousSha256Hex);
  });

  it("reorder-cut에서 없는 컷·비유한 인덱스·동일 위치 이동을 정확히 거부한다", () => {
    const cuts = createBalancedEpisodeCuts();
    expect(applyStoryboardReflowOperation(cuts, { kind: "reorder-cut", cutId: "cut-999", targetIndex: 1 }).rejectionCode).toBe("CUT_NOT_FOUND");
    expect(applyStoryboardReflowOperation(cuts, { kind: "reorder-cut", cutId: "cut-01", targetIndex: Number.NaN }).rejectionCode).toBe("INVALID_OPERATION");
    expect(applyStoryboardReflowOperation(cuts, { kind: "reorder-cut", cutId: "cut-01", targetIndex: 0 }).rejectionCode).toBe("NO_OP");
  });

  it("move-scene-group으로 씬 단위 일괄 이동 시 내부 컷 순서를 유지한다", () => {
    const res = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "move-scene-group",
      sceneId: "sc-02",
      targetBeforeSceneId: "sc-01",
    });
    expect(res.applied).toBe(true);
    expect(res.cuts.slice(0, 3).map((c) => c.cutId)).toEqual(["cut-04", "cut-05", "cut-06"]);
    expect(res.cuts.slice(3, 6).map((c) => c.cutId)).toEqual(["cut-01", "cut-02", "cut-03"]);
  });

  it("move-scene-group에서 targetBeforeSceneId가 null이면 씬을 에피소드 끝으로 이동한다", () => {
    const res = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "move-scene-group",
      sceneId: "sc-02",
      targetBeforeSceneId: null,
    });
    expect(res.applied).toBe(true);
    expect(res.cuts.slice(-3).map((c) => c.cutId)).toEqual(["cut-04", "cut-05", "cut-06"]);
  });

  it("move-scene-group에서 없는 씬과 자기 자신 이동을 정확히 거부한다", () => {
    const cuts = createBalancedEpisodeCuts();
    expect(
      applyStoryboardReflowOperation(cuts, { kind: "move-scene-group", sceneId: "sc-99", targetBeforeSceneId: "sc-01" }).rejectionCode,
    ).toBe("SCENE_NOT_FOUND");
    expect(
      applyStoryboardReflowOperation(cuts, { kind: "move-scene-group", sceneId: "sc-01", targetBeforeSceneId: "sc-01" }).rejectionCode,
    ).toBe("NO_OP");
  });

  it("split-cut이 대사·높이·시각 밀도를 분배하고 고유 ID 부여 및 연속성 링크를 리매핑한다", () => {
    const res = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "split-cut",
      cutId: "cut-09",
      splitRatio: 0.4,
    });
    expect(res.applied).toBe(true);
    expect(res.cuts).toHaveLength(13);
    const first = res.cuts[8];
    const second = res.cuts[9];
    expect(first?.cutId).toBe("cut-09__a");
    expect(second?.cutId).toBe("cut-09__b");
    expect((first?.dialogueCharCount ?? 0) + (second?.dialogueCharCount ?? 0)).toBe(42);
    expect((first?.heightPx ?? 0) + (second?.heightPx ?? 0)).toBe(640);
    expect(first?.visualComplexity ?? 1).toBeLessThan(0.6);
    expect(res.cuts[0]?.continuityTargetCutIds).toContain("cut-09__a");
    expect(res.continuityViolations).toHaveLength(0);
  });

  it("동일 컷 ID 충돌 시 split-cut이 결정론적으로 접미사를 붙여 충돌을 회피한다", () => {
    const cuts = [
      makeCut("c1", "s1", "씬1", "원본", "intro", 0.3, 100, 0.6, 600, 50),
      makeCut("c1__a", "s1", "씬1", "기존 ID", "development", 0.5, 20, 0.4, 500, 60),
    ];
    const res = applyStoryboardReflowOperation(cuts, { kind: "split-cut", cutId: "c1" });
    expect(res.applied).toBe(true);
    const ids = res.cuts.map((c) => c.cutId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("c1__a_2");
    expect(ids).toContain("c1__b");
  });

  it("merge-adjacent-cuts가 인접 2컷의 대사·높이를 합산하고 텐션 최대치 및 참조 리매핑을 수행한다", () => {
    const res = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "merge-adjacent-cuts",
      firstCutId: "cut-08",
      secondCutId: "cut-09",
      mergedCutId: "cut-08-09",
    });
    expect(res.applied).toBe(true);
    expect(res.cuts).toHaveLength(11);
    const merged = res.cuts.find((c) => c.cutId === "cut-08-09");
    expect(merged?.dialogueCharCount).toBe(72);
    expect(merged?.heightPx).toBe(1300);
    expect(merged?.tension).toBe(0.78);
    expect(merged?.gutterBeforePx).toBe(96);
    expect(res.cuts[0]?.continuityTargetCutIds).toContain("cut-08-09");
    expect(res.continuityViolations).toHaveLength(0);
  });

  it("merge-adjacent-cuts는 비인접 컷 병합 시도를 NOT_ADJACENT로 거부한다", () => {
    const res = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "merge-adjacent-cuts",
      firstCutId: "cut-01",
      secondCutId: "cut-03",
    });
    expect(res.rejected).toBe(true);
    expect(res.rejectionCode).toBe("NOT_ADJACENT");
    expect(res.rejectionReasonKo).toContain("인접");
  });

  it("insert-breathing-gutter가 지정 컷 앞 여백을 보강하고 하류 세로 좌표를 정확히 이동한다", () => {
    const cuts = createBalancedEpisodeCuts();
    const before = buildStoryboardFlowProjection(cuts);
    const res = applyStoryboardReflowOperation(cuts, {
      kind: "insert-breathing-gutter",
      cutId: "cut-11",
      extraGutterPx: 100,
    });
    expect(res.applied).toBe(true);
    expect(res.cuts[10]?.gutterBeforePx).toBe(270);
    expect(res.projection.stripTotalHeightPx).toBe(before.stripTotalHeightPx + 100);
    expect(res.projection.cuts[11]?.yPx).toBe((before.cuts[11]?.yPx ?? 0) + 100);
  });

  it("insert-breathing-gutter가 0 이하 값 및 상한 도달(NO_OP)을 거부한다", () => {
    const cuts = createBalancedEpisodeCuts();
    expect(
      applyStoryboardReflowOperation(cuts, { kind: "insert-breathing-gutter", cutId: "cut-01", extraGutterPx: 0 }).rejectionCode,
    ).toBe("INVALID_OPERATION");
    expect(
      applyStoryboardReflowOperation(cuts, { kind: "insert-breathing-gutter", cutId: "cut-11", extraGutterPx: 50, maxGutterPx: 170 }).rejectionCode,
    ).toBe("NO_OP");
  });

  it("lockedAnchor: true 컷 이동·분할·병합·소속 씬 이동을 forceOverrideLock 없이 거부한다", () => {
    const cuts = createBalancedEpisodeCuts();
    const initialSha = computeStoryboardStateSha256Hex(cuts);

    const reorderBlocked = applyStoryboardReflowOperation(cuts, { kind: "reorder-cut", cutId: "cut-11", targetIndex: 2 });
    expect(reorderBlocked.rejected).toBe(true);
    expect(reorderBlocked.rejectionCode).toBe("LOCKED_ANCHOR");
    expect(reorderBlocked.rejectionReasonKo).toContain("잠금");
    expect(reorderBlocked.nextSha256Hex).toBe(initialSha);

    expect(
      applyStoryboardReflowOperation(cuts, { kind: "move-scene-group", sceneId: "sc-04", targetBeforeSceneId: "sc-01" }).rejectionCode,
    ).toBe("LOCKED_ANCHOR");
    expect(applyStoryboardReflowOperation(cuts, { kind: "split-cut", cutId: "cut-11" }).rejectionCode).toBe("LOCKED_ANCHOR");
    expect(
      applyStoryboardReflowOperation(cuts, { kind: "merge-adjacent-cuts", firstCutId: "cut-10", secondCutId: "cut-11" }).rejectionCode,
    ).toBe("LOCKED_ANCHOR");
  });

  it("forceOverrideLock: true를 명시하면 잠금 앵커 컷 이동을 허용한다", () => {
    const res = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "reorder-cut",
      cutId: "cut-11",
      targetIndex: 9,
      forceOverrideLock: true,
    });
    expect(res.applied).toBe(true);
    expect(res.cuts[9]?.cutId).toBe("cut-11");
  });

  it("드래그 이동으로 복선→회수 인과가 역전되면 continuityViolations에 정확한 컷 쌍을 적발한다", () => {
    const res = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "reorder-cut",
      cutId: "cut-01",
      targetIndex: 10,
    });
    expect(res.applied).toBe(true);
    expect(res.continuityViolations).toHaveLength(1);
    expect(res.continuityViolations[0]?.sourceCutId).toBe("cut-01");
    expect(res.continuityViolations[0]?.targetCutId).toBe("cut-09");
    expect(res.continuityViolations[0]?.sourceIndex).toBe(10);
    expect(res.continuityViolations[0]?.targetIndex).toBe(7);
  });

  it("씬 일괄 이동으로 회수 씬이 복선 씬 앞으로 가면 연속성 위반을 즉시 적발한다", () => {
    const res = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "move-scene-group",
      sceneId: "sc-03",
      targetBeforeSceneId: "sc-01",
    });
    expect(res.applied).toBe(true);
    expect(res.continuityViolations).toHaveLength(1);
    expect(res.continuityViolations[0]?.sourceCutId).toBe("cut-01");
    expect(res.continuityViolations[0]?.targetCutId).toBe("cut-09");
  });
});

describe("Wave 115 — FIPS 180-4 SHA-256 & 가역 명령 세션 (Undo/Redo 비트 동일성)", () => {
  it("순수 ES2017 동기 SHA-256이 NIST 표준 테스트 벡터 4종과 UTF-8 한글·이모지 해시와 정확히 일치한다", () => {
    expect(sha256Utf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Utf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Utf8Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(
      sha256Utf8Hex(
        "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
      ),
    ).toBe("cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1");
    expect(sha256Utf8Hex("웹툰 스토리보드 컷 흐름 리플로우 지문 검증 🎬")).toBe(
      "b0b24d23fc1a7d4b26548ce519b9121d0764d37d43884b34f7bcbbc659fea2f4",
    );
  });

  it("객체 속성 삽입 순서가 달라도 정규 JSON 직렬화로 동일한 SHA-256 지문을 산출한다", () => {
    const cutA: StoryboardCutInput = makeCut("c1", "s1", "s1", "오프닝", "intro", 0.3, 15, 0.4, 600, 50);
    const cutB: StoryboardCutInput = {
      gutterBeforePx: 50,
      heightPx: 600,
      visualComplexity: 0.4,
      dialogueCharCount: 15,
      tension: 0.3,
      act: "intro",
      titleKo: "오프닝",
      sceneTitleKo: "s1",
      sceneId: "s1",
      cutId: "c1",
    };
    expect(computeStoryboardStateSha256Hex([cutA])).toBe(computeStoryboardStateSha256Hex([cutB]));
  });

  it("세션에서 5종 연산 연속 apply → 전량 undo → 전량 redo 시 SHA-256이 비트 단위로 복원된다", () => {
    const session = createStoryboardReflowSession(createBalancedEpisodeCuts(), { columns: 4 });
    const initialSha = session.getStateSha256Hex();

    expect(session.apply({ kind: "reorder-cut", cutId: "cut-06", targetIndex: 4 }).applied).toBe(true);
    const sha1 = session.getStateSha256Hex();
    expect(session.apply({ kind: "split-cut", cutId: "cut-05", splitRatio: 0.5 }).applied).toBe(true);
    const sha2 = session.getStateSha256Hex();
    expect(session.apply({ kind: "merge-adjacent-cuts", firstCutId: "cut-05__a", secondCutId: "cut-05__b" }).applied).toBe(true);
    const sha3 = session.getStateSha256Hex();
    expect(session.apply({ kind: "insert-breathing-gutter", cutId: "cut-12", extraGutterPx: 80 }).applied).toBe(true);
    const sha4 = session.getStateSha256Hex();
    expect(session.apply({ kind: "move-scene-group", sceneId: "sc-02", targetBeforeSceneId: "sc-01" }).applied).toBe(true);
    const sha5 = session.getStateSha256Hex();
    expect(session.getUndoDepth()).toBe(5);

    for (const expected of [sha4, sha3, sha2, sha1, initialSha]) {
      const step = session.undo();
      expect(step.ok).toBe(true);
      expect(step.exactRoundTrip).toBe(true);
      expect(step.stateSha256Hex).toBe(expected);
    }
    expect(session.canUndo()).toBe(false);
    expect(session.getRedoDepth()).toBe(5);

    for (const expected of [sha1, sha2, sha3, sha4, sha5]) {
      const step = session.redo();
      expect(step.ok).toBe(true);
      expect(step.exactRoundTrip).toBe(true);
      expect(step.stateSha256Hex).toBe(expected);
    }
    expect(session.canRedo()).toBe(false);
  });

  it("거부된 연산은 Undo/Redo 스택을 오염시키지 않으며 undo 후 새 apply는 redo 스택을 비운다", () => {
    const session = createStoryboardReflowSession(createBalancedEpisodeCuts());
    const initialSha = session.getStateSha256Hex();

    expect(session.apply({ kind: "reorder-cut", cutId: "cut-11", targetIndex: 0 }).rejected).toBe(true);
    expect(session.canUndo()).toBe(false);
    expect(session.getStateSha256Hex()).toBe(initialSha);

    session.apply({ kind: "insert-breathing-gutter", cutId: "cut-04", extraGutterPx: 40 });
    session.undo();
    expect(session.canRedo()).toBe(true);

    session.apply({ kind: "insert-breathing-gutter", cutId: "cut-07", extraGutterPx: 40 });
    expect(session.canRedo()).toBe(false);
    expect(session.redo().ok).toBe(false);
  });
});

describe("Wave 115 — 4막 감정 텐션·페이싱 감사기 및 자동 개선 제안기", () => {
  it("균형 잡힌 4막 회차는 높은 종합 페이싱 점수와 올바른 피크 위치를 기록한다", () => {
    const audit = analyzeStoryboardFlowAndTensionArc(buildStoryboardFlowProjection(createBalancedEpisodeCuts()));
    expect(audit.peakTensionCutId).toBe("cut-12");
    expect(audit.peakPositionRatio).toBe(1);
    expect(audit.flatlineSpans).toHaveLength(0);
    expect(audit.dialogueFatigueSpans).toHaveLength(0);
    expect(audit.continuityViolations).toHaveLength(0);
    expect(audit.endingHookScore).toBeGreaterThanOrEqual(80);
    expect(audit.sceneTransitionRhythmScore).toBeGreaterThanOrEqual(80);
    expect(audit.overallFlowHealthScore).toBeGreaterThanOrEqual(82);

    const intro = audit.actDistribution.find((s) => s.act === "intro");
    const climax = audit.actDistribution.find((s) => s.act === "climax");
    expect(climax?.averageTension ?? 0).toBeGreaterThan(intro?.averageTension ?? 1);
  });

  it("연속 4컷 이상 |Δtension| < 0.07 정체 구간을 정확히 적발하고 3컷은 오탐하지 않는다", () => {
    const flatCuts = createFlatlineCuts();
    const audit = analyzeStoryboardFlowAndTensionArc(buildStoryboardFlowProjection(flatCuts));
    expect(audit.flatlineSpans).toHaveLength(1);
    expect(audit.flatlineSpans[0]?.cutIds).toEqual(["f2", "f3", "f4", "f5"]);

    const audit3 = analyzeStoryboardFlowAndTensionArc(
      buildStoryboardFlowProjection(flatCuts.filter((c) => c.cutId !== "f5")),
    );
    expect(audit3.flatlineSpans).toHaveLength(0);
  });

  it("정체 구간 자동 제안(merge-adjacent-cuts)을 applySuggestion으로 적용하면 정체가 해소되고 점수가 오른다", () => {
    const flatCuts = createFlatlineCuts();
    const audit = analyzeStoryboardFlowAndTensionArc(buildStoryboardFlowProjection(flatCuts));
    const sug = audit.suggestions.find((s) => s.category === "flatline");
    expect(sug?.operation.kind).toBe("merge-adjacent-cuts");
    if (sug) {
      const outcome = applySuggestion(flatCuts, sug);
      expect(outcome.reflow.applied).toBe(true);
      expect(outcome.afterAudit.flatlineSpans).toHaveLength(0);
      expect(outcome.scoreDelta).toBeGreaterThan(0);
    }
  });

  it("과밀 대사 구간을 적발하고 split-cut 제안 적용 후 대사 과밀 해소 및 점수 상승을 검증한다", () => {
    const cuts = createBalancedEpisodeCuts().map((cut) =>
      cut.cutId === "cut-05" ? { ...cut, dialogueCharCount: 164, visualComplexity: 0.78 } : cut,
    );
    const audit = analyzeStoryboardFlowAndTensionArc(buildStoryboardFlowProjection(cuts));
    expect(audit.dialogueFatigueSpans).toHaveLength(1);
    expect(audit.dialogueFatigueSpans[0]?.severity).toBe("critical");

    const sug = audit.suggestions.find((s) => s.category === "dialogue-fatigue");
    expect(sug?.operation.kind).toBe("split-cut");
    if (sug) {
      const outcome = applySuggestion(cuts, sug);
      expect(outcome.reflow.applied).toBe(true);
      expect(outcome.afterAudit.dialogueFatigueSpans).toHaveLength(0);
      expect(outcome.scoreDelta).toBeGreaterThan(0);
    }
  });

  it("연속 2컷 과밀 대사(85자 이상)를 대사 과밀 구간으로 감지한다", () => {
    const cuts = createBalancedEpisodeCuts().map((cut) =>
      cut.cutId === "cut-05" || cut.cutId === "cut-06" ? { ...cut, dialogueCharCount: 96 } : cut,
    );
    const audit = analyzeStoryboardFlowAndTensionArc(buildStoryboardFlowProjection(cuts));
    expect(audit.dialogueFatigueSpans).toHaveLength(1);
    expect(audit.dialogueFatigueSpans[0]?.cutIds).toEqual(["cut-05", "cut-06"]);
    expect(audit.dialogueFatigueSpans[0]?.totalDialogueChars).toBe(192);
  });

  it("복선 역전 위반에 대한 reorder-cut 제안 적용 시 연속성 위반이 0건이 되고 점수가 크게 오른다", () => {
    const broken = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "reorder-cut",
      cutId: "cut-01",
      targetIndex: 10,
    });
    const audit = analyzeStoryboardFlowAndTensionArc(broken.projection);
    const sug = audit.suggestions.find((s) => s.category === "continuity");
    expect(sug?.operation.kind).toBe("reorder-cut");
    if (sug) {
      const outcome = applySuggestion(broken.cuts, sug);
      expect(outcome.reflow.applied).toBe(true);
      expect(outcome.afterAudit.continuityViolations).toHaveLength(0);
      expect(outcome.scoreDelta).toBeGreaterThanOrEqual(10);
    }
  });

  it("잠금 컷이 연속성 위반의 복선 쪽일 때 회수 컷을 뒤로 미는 대체 reorder-cut 제안을 생성한다", () => {
    const cuts = [
      makeCut("payoff-01", "sc-01", "씬1", "회수 컷", "intro", 0.4, 20, 0.5, 600, 60),
      makeCut("mid-02", "sc-01", "씬1", "중간 컷", "development", 0.55, 25, 0.5, 620, 70),
      makeCut("foreshadow-locked", "sc-02", "씬2", "잠긴 복선", "twist", 0.85, 20, 0.7, 720, 140, {
        lockedAnchor: true,
        continuityTargetCutIds: ["payoff-01"],
      }),
    ];
    const audit = analyzeStoryboardFlowAndTensionArc(buildStoryboardFlowProjection(cuts));
    const sug = audit.suggestions.find((s) => s.category === "continuity");
    expect(sug?.operation.kind).toBe("reorder-cut");
    if (sug && sug.operation.kind === "reorder-cut") {
      expect(sug.operation.cutId).toBe("payoff-01");
      const outcome = applySuggestion(cuts, sug);
      expect(outcome.afterAudit.continuityViolations).toHaveLength(0);
    }
  });

  it("엔딩 컷 앞 여백이 좁으면 endingHookScore가 하락하고 insert-breathing-gutter 제안으로 개선된다", () => {
    const cuts = createBalancedEpisodeCuts().map((cut) =>
      cut.cutId === "cut-12" ? { ...cut, gutterBeforePx: 24 } : cut,
    );
    const audit = analyzeStoryboardFlowAndTensionArc(buildStoryboardFlowProjection(cuts));
    const sug = audit.suggestions.find((s) => s.category === "ending-hook");
    expect(sug?.operation.kind).toBe("insert-breathing-gutter");
    if (sug) {
      const outcome = applySuggestion(cuts, sug);
      expect(outcome.afterAudit.endingHookScore).toBeGreaterThan(outcome.beforeAudit.endingHookScore);
      expect(outcome.scoreDelta).toBeGreaterThan(0);
    }
  });

  it("씬 전환 경계 여백이 좁으면 sceneTransitionRhythmScore가 낮아지고 여백 보강 제안 적용 시 개선된다", () => {
    const cuts = createBalancedEpisodeCuts().map((cut) =>
      cut.cutId === "cut-04" || cut.cutId === "cut-07" || cut.cutId === "cut-10"
        ? { ...cut, gutterBeforePx: 30 }
        : cut,
    );
    const crampedAudit = analyzeStoryboardFlowAndTensionArc(buildStoryboardFlowProjection(cuts));
    const healthyAudit = analyzeStoryboardFlowAndTensionArc(
      buildStoryboardFlowProjection(createBalancedEpisodeCuts()),
    );
    expect(crampedAudit.sceneTransitionRhythmScore).toBeLessThan(healthyAudit.sceneTransitionRhythmScore);
    const sug = crampedAudit.suggestions.find((s) => s.category === "scene-rhythm");
    expect(sug).toBeDefined();
    if (sug) {
      const outcome = applySuggestion(cuts, sug);
      expect(outcome.afterAudit.sceneTransitionRhythmScore).toBeGreaterThan(
        outcome.beforeAudit.sceneTransitionRhythmScore,
      );
    }
  });
});

describe("Wave 115 — 인쇄 안전 순수 OKLCH SVG & 자연스러운 한국어 PD 리포트", () => {
  it("SVG가 순수 oklch(...)만 사용하고 원시 hex/rgb/rgba/hsl 및 NaN/Infinity가 0건이다", () => {
    const projection = buildStoryboardFlowProjection(createBalancedEpisodeCuts(), {
      episodeTitleKo: "제14화 은색 열쇠",
      columns: 4,
    });
    const audit = analyzeStoryboardFlowAndTensionArc(projection);
    const svg = renderStoryboardFlowBoardSvg(projection, audit);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("감정 텐션 곡선");
    expect(svg).toContain("w115-arrow-ok");

    const rawHexPattern = new RegExp("#[0-9a-f]{3,8}\\b", "i");
    const rawFnPattern = new RegExp("\\b(?:rgba?|hsla?)\\(", "i");
    expect(rawHexPattern.test(svg)).toBe(false);
    expect(rawFnPattern.test(svg)).toBe(false);
    expect(svg.includes("NaN")).toBe(false);
    expect(svg.includes("Infinity")).toBe(false);
  });

  it("복선 역전이 발생한 보드 SVG에서 역전 화살표와 경고 배지를 렌더링한다", () => {
    const broken = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "reorder-cut",
      cutId: "cut-01",
      targetIndex: 10,
    });
    const svg = renderStoryboardFlowBoardSvg(
      broken.projection,
      analyzeStoryboardFlowAndTensionArc(broken.projection),
    );
    expect(svg).toContain("w115-arrow-violation");
    expect(svg).toContain(">역전<");
    expect(svg).toContain("복선 역전 1건");
  });

  it("SVG 내 XML 특수문자(<, >, &, \", ')를 모두 안전하게 이스케이프해 XSS 주입을 차단한다", () => {
    const payload = `<script>alert("xss")</script> & 'quote' > test`;
    const cuts = createBalancedEpisodeCuts().map((cut, idx) =>
      idx === 0 ? { ...cut, titleKo: payload, sceneTitleKo: `씬 <1> & "A"` } : cut,
    );
    const projection = buildStoryboardFlowProjection(cuts, {
      episodeTitleKo: `에피소드 <script> & "검증"`,
    });
    const svg = renderStoryboardFlowBoardSvg(
      projection,
      analyzeStoryboardFlowAndTensionArc(projection),
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(escapeStoryboardXml(`a<b>c&"d"'e'`)).toBe("a&lt;b&gt;c&amp;&quot;d&quot;&apos;e&apos;");
  });

  it("빈 스토리보드에서도 SVG와 한국어 보고서가 오류나 NaN 없이 렌더링된다", () => {
    const emptyProj = buildStoryboardFlowProjection([], { episodeTitleKo: "빈 회차" });
    const emptyAudit = analyzeStoryboardFlowAndTensionArc(emptyProj);
    const svg = renderStoryboardFlowBoardSvg(emptyProj, emptyAudit);
    const report = summarizeStoryboardFlowAuditKo(emptyProj, emptyAudit);

    expect(svg).toContain("등록된 컷 없음");
    expect(svg.includes("NaN")).toBe(false);
    expect(report).toContain("빈 회차");
    expect(report).toContain("총 0컷");
  });

  it("한국어 PD 검수 리포트가 번역투 없이 핵심 지표·위반·모델 추정 고지를 간결하게 출력한다", () => {
    const broken = applyStoryboardReflowOperation(createBalancedEpisodeCuts(), {
      kind: "reorder-cut",
      cutId: "cut-01",
      targetIndex: 10,
    });
    const audit = analyzeStoryboardFlowAndTensionArc(broken.projection);
    const report = summarizeStoryboardFlowAuditKo(broken.projection, audit);

    expect(report).toContain("[스토리보드 PD 검수 브리프]");
    expect(report).toContain("실측 독자 데이터 아님");
    expect(report).toContain("종합 페이싱 점수");
    expect(report).toContain("복선·회수 연속성: 역전 1건 발견");
    expect(report).toContain("우선 권장 리플로우 조치");
    expect(report).toContain(broken.nextSha256Hex);

    const bannedPhrases = [
      "하는 것을 가능하게 합니다",
      "직관적인 경험을 제공합니다",
      "원활한 워크플로우를 보장합니다",
      "혁신적인 솔루션",
    ];
    for (let i = 0; i < bannedPhrases.length; i += 1) {
      const phrase = bannedPhrases[i];
      if (phrase) expect(report).not.toContain(phrase);
    }
  });
});
