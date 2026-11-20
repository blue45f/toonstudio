import { describe, expect, it } from "vitest";

import {
  collectStoryDialogueMatches,
  parseWebtoonScript,
  reconcileScriptWithCanvasEdits,
  replaceSingleStoryMatch,
  runStoryBatchFindReplace,
  seedPanelsFromScript,
  syncCanvasDialoguesBackToScript,
} from "./studio-script-to-panels-seed";

const SAMPLE_SCRIPT = [
  "[컷 1 - 로우 앵글] 빗속 골목길",
  "민수: \"오늘 많이 늦었네.\"",
  "민수(생각): 역시 먼저 가 버렸을까.",
  "효과음: 쏴아아",
  "",
  "[컷 2 - 클로즈업]",
  "서연(외침): 민수야! 여기야!",
  "나레이션: 그날 밤, 모든 약속이 다시 시작됐다.",
].join("\n");

describe("studio-script-to-panels-seed", () => {
  it("[컷 N] 마커와 화자·감정·나레이션·효과음을 파싱하고 컷·말풍선으로 시드한다", () => {
    const parsed = parseWebtoonScript(SAMPLE_SCRIPT);
    expect(parsed.hasExplicitMarkers).toBe(true);
    expect(parsed.cuts).toHaveLength(2);
    expect(parsed.cuts[0]?.cutNumber).toBe(1);
    expect(parsed.cuts[0]?.directionNote).toContain("로우 앵글");
    expect(parsed.cuts[0]?.dialogues.map((d) => [d.speaker, d.kind, d.text])).toEqual([
      ["민수", "speech", "오늘 많이 늦었네."],
      ["민수", "thought", "역시 먼저 가 버렸을까."],
      [null, "sfx", "쏴아아"],
    ]);

    const seeded = seedPanelsFromScript(SAMPLE_SCRIPT, {
      viewportHeightPx: 1_280,
      cutsPerPage: 2,
    });
    expect(seeded.totalCutCount).toBe(2);
    expect(seeded.totalDialogueCount).toBe(5);
    expect(seeded.pages).toHaveLength(1);
    const frames = seeded.pages[0]!.elements.filter((el) => el.type === "frame");
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect((frame.height ?? 0) / 1_280).toBeLessThanOrEqual(1.4);
    }
  });

  it("캔버스 대사 수정을 원본 대본으로 역동기화하고, 대본 재시드 시 수동 수정 대사를 보존한다", () => {
    const seeded = seedPanelsFromScript(SAMPLE_SCRIPT);
    const targetBinding = seeded.bindings[0]!.dialogueBindings[0]!;

    // 캔버스에서 첫 대사 수정
    const editedPages = seeded.pages.map((page) => ({
      ...page,
      elements: page.elements.map((el) =>
        el.id === targetBinding.elementId
          ? { ...el, text: "많이 기다렸지? 미안해." }
          : el,
      ),
    }));

    const syncedBack = syncCanvasDialoguesBackToScript(
      SAMPLE_SCRIPT,
      editedPages,
      seeded.bindings,
    );
    expect(syncedBack.updatedLineCount).toBe(1);
    expect(syncedBack.updatedScript).toContain("[컷 1 - 로우 앵글] 빗속 골목길");
    expect(syncedBack.updatedScript).toContain("민수: 많이 기다렸지? 미안해.");

    // 대본에 3컷을 추가해 재시드해도 캔버스에서 고친 1컷 대사는 보존된다.
    const expandedScript = `${SAMPLE_SCRIPT}\n\n[컷 3]\n민수: 뛰어갈게!`;
    const reconciled = reconcileScriptWithCanvasEdits(seeded, expandedScript, editedPages);
    expect(reconciled.preservedCanvasEditIds).toContain(targetBinding.elementId);
    const firstBubble = reconciled.pages[0]!.elements.find(
      (el) => el.id === targetBinding.elementId,
    );
    expect(firstBubble?.text).toBe("많이 기다렸지? 미안해.");
    expect(reconciled.addedElementIds.length).toBe(1);
  });

  it("전 페이지 대사 검색·단건 치환·일괄 치환을 수행하며 잠긴 대사를 보호한다", () => {
    const pages = [
      {
        id: "p1",
        elements: [
          { id: "d1", type: "bubble", text: "민수야, 민수 어디 갔어?", x: 40, y: 40 },
          { id: "d2", type: "bubble", text: "민수 잠김 대사", x: 40, y: 200, locked: true },
        ],
      },
      {
        id: "p2",
        elements: [{ id: "d3", type: "text", text: "민수가 돌아왔다.", x: 40, y: 40 }],
      },
    ];

    const matches = collectStoryDialogueMatches(pages, "민수");
    expect(matches).toHaveLength(4);

    // 단건 치환: 첫 번째 매치만 바뀐다.
    const afterSingle = replaceSingleStoryMatch(pages, matches[0]!, "지훈");
    expect(afterSingle[0]?.elements[0]?.text).toBe("지훈야, 민수 어디 갔어?");

    // 일괄 치환: 잠긴 d2는 제외되고 d1(2건) + d3(1건) 총 3건이 치환된다.
    const batch = runStoryBatchFindReplace(pages, "민수", "지훈");
    expect(batch.plan.totalCount).toBe(3);
    expect(batch.plan.lockedSkipped).toBe(1);
    expect(batch.pages[0]?.elements[0]?.text).toBe("지훈야, 지훈 어디 갔어?");
    expect(batch.pages[0]?.elements[1]?.text).toBe("민수 잠김 대사");
    expect(batch.pages[1]?.elements[0]?.text).toBe("지훈가 돌아왔다.");
  });
});
