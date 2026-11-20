import { describe, expect, it } from "vitest";

import {
  applyScriveningsCompositeEdit,
  buildScriveningsCompositeStream,
  compileCodexMatcher,
  computeWordDiff,
  createSceneSnapshot,
  mergeAdjacentScenes,
  restoreSceneFromSnapshot,
  scanTextForCodexMatches,
  splitSceneAtOffset,
  type CodexEntityEntry,
  type ScriptSceneCard,
} from "./studio-scrivenings-snapshot-codex";

function buildScenes(): readonly ScriptSceneCard[] {
  return [
    {
      id: "sc-01",
      episodeId: "ep-01",
      title: "비 내리는 역 앞",
      body: "강유나가 우산을 접으며 옛 도서관 쪽을 바라본다.",
      cutNotes: "광각 24mm, 빗방울 포그",
      orderIndex: 0,
    },
    {
      id: "sc-02",
      episodeId: "ep-01",
      title: "지하 서고 진입",
      body: "은빛 검사는 낡은 봉인문을 밀어 열었다.",
      cutNotes: "로우앵글, 역광 림라이트",
      orderIndex: 1,
    },
    {
      id: "sc-03",
      episodeId: "ep-01",
      title: "결말 독백",
      body: "그날의 약속은 끝나지 않았다.",
      cutNotes: "클로즈업",
      orderIndex: 2,
    },
  ];
}

describe("studio-scrivenings-snapshot-codex", () => {
  it("스크리브닝 연속 스트림 편집 시 수정된 씬만 원자 갱신하고 미수정 씬 참조를 유지한다", () => {
    const scenes = buildScenes();
    const composite = buildScriveningsCompositeStream(scenes);
    expect(composite.ranges).toHaveLength(3);

    const editedText = composite.text.replace(
      "은빛 검사는 낡은 봉인문을 밀어 열었다.",
      "은빛 검사는 무거운 봉인문을 단숨에 열어젖혔다.",
    );
    const applied = applyScriveningsCompositeEdit(scenes, editedText);
    expect(applied.ok).toBe(true);
    expect(applied.changedSceneIds).toEqual(["sc-02"]);
    // 수정하지 않은 sc-01과 sc-03은 원본 객체 그대로 보존된다.
    expect(applied.scenes[0]).toBe(scenes[0]);
    expect(applied.scenes[2]).toBe(scenes[2]);
    expect(applied.scenes[1]?.body).toContain("단숨에 열어젖혔다.");

    // 구분자가 삭제되면 원본을 망가뜨리지 않고 안전하게 거부한다.
    const corrupted = applied.ok ? composite.text.replace("=== [SCENE:sc-02] 지하 서고 진입 ===", "") : "";
    const rejected = applyScriveningsCompositeEdit(scenes, corrupted);
    expect(rejected.ok).toBe(false);
    expect(rejected.scenes).toBe(scenes);
  });

  it("씬 커서 분할(Split)과 인접 병합(Merge)이 순서를 유지하고 Undo 스냅샷을 제공한다", () => {
    const scenes = buildScenes();
    const split = splitSceneAtOffset(
      scenes,
      "sc-01",
      12,
      "sc-01b",
      "역 앞 시선 전환",
    );
    expect(split.nextScenes).toHaveLength(4);
    expect(split.nextScenes.map((s) => s.id)).toEqual(["sc-01", "sc-01b", "sc-02", "sc-03"]);
    expect(split.nextScenes.map((s) => s.orderIndex)).toEqual([0, 1, 2, 3]);

    const merged = mergeAdjacentScenes(split.nextScenes, "sc-01", "sc-01b");
    expect(merged.nextScenes).toHaveLength(3);
    expect(merged.nextScenes.map((s) => s.id)).toEqual(["sc-01", "sc-02", "sc-03"]);
    expect(merged.nextScenes[0]?.body).toContain("강유나");
    expect(merged.nextScenes[0]?.body).toContain("도서관");
  });

  it("비파괴 스냅샷 생성, LCS 단어 단위 Diff 계산, 복원 직전 자동 백업을 보장한다", () => {
    const original = buildScenes()[0]!;
    const snap = createSceneSnapshot(original, "1차 초고", "2026-11-20T10:00:00Z");

    const revised: ScriptSceneCard = {
      ...original,
      body: "강유나가 검은 우산을 접으며 침수된 옛 도서관 쪽을 응시한다.",
    };
    const diff = computeWordDiff(snap.body, revised.body);
    expect(diff.addedTokens).toBeGreaterThanOrEqual(3);
    expect(diff.removedTokens).toBeGreaterThanOrEqual(1);
    expect(diff.unchangedTokens).toBeGreaterThanOrEqual(3);
    expect(diff.chunks.some((c) => c.op === "insert" && c.text.includes("검은"))).toBe(true);

    const restored = restoreSceneFromSnapshot(revised, snap, "2026-11-20T10:30:00Z");
    expect(restored.restoredScene.body).toBe(original.body);
    expect(restored.autoBackupSnapshot.body).toBe(revised.body);
    expect(restored.autoBackupSnapshot.label).toContain("자동 백업");
  });

  it("Aho-Corasick 실시간 Codex 스캐너가 별칭·최장일치·영문 경계·폐기 설정 경고를 정확히 탐지한다", () => {
    const codex: readonly CodexEntityEntry[] = [
      {
        id: "ent-yuna",
        kind: "character",
        canonical: "강유나",
        aliases: ["은빛 검사", "유나"],
        status: "confirmed",
        summary: "제국 북부 출신 수습 기사",
        voiceTone: "담담하고 짧은 단문",
        paletteOklch: ["oklch(0.78 0.03 245)"],
        lastSeenEpisode: "ep-01",
      },
      {
        id: "ent-old-magic",
        kind: "lore",
        canonical: "혈마법",
        aliases: ["금지된 혈술"],
        status: "deprecated",
        summary: "시즌 1 기획에서 폐기된 마법 체계",
      },
      {
        id: "ent-ark",
        kind: "location",
        canonical: "Ark",
        aliases: [],
        status: "confirmed",
        summary: "고대 방주 기지",
      },
    ];

    const matcher = compileCodexMatcher(codex);
    const script =
      "은빛 검사는 강유나라는 이름을 숨긴 채 금지된 혈술을 언급했다. Ark에서 spark는 제외된다.";
    const matches = scanTextForCodexMatches(script, matcher);

    expect(matches.map((m) => m.matchedSurface)).toEqual([
      "은빛 검사",
      "강유나",
      "금지된 혈술",
      "Ark",
    ]);
    // 영문 단어 'spark' 내부의 'ark'는 오탐되지 않아야 한다.
    expect(matches.some((m) => m.matchedSurface.toLowerCase() === "ark" && m.startOffset > 45)).toBe(
      false,
    );
    const retired = matches.find((m) => m.entityId === "ent-old-magic");
    expect(retired?.severity).toBe("warning");
    expect(retired?.warningKo).toContain("폐기된 설정");
  });
});
