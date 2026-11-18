import { describe, expect, it } from "vitest";

import {
  DEFAULT_EPISODE_CUTSHEET_SNAPSHOT,
  EPISODE_CUTSHEET_STORAGE_KEY,
  createEpisodeCutsheetStore,
  episodeCutsheetFileName,
  parseEpisodeCutsheet,
  serializeEpisodeCutsheet,
} from "./webtoon-episode-cutsheet";

import type { MinimalStorageLike } from "./webtoon-episode-cutsheet";

function createMemoryStorage(): MinimalStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => {
      map.set(key, val);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("webtoon-episode-cutsheet", () => {
  it("4컷 씬 비트를 추가·순서 이동·삭제하며 localStorage 초안 자동 보존 및 JSON 왕복 직렬화를 보장한다", () => {
    const storage = createMemoryStorage();
    const store = createEpisodeCutsheetStore({ storage });
    store.setEpisodeTitle("12화 법정 반전");
    const baseSnap = {
      ...DEFAULT_EPISODE_CUTSHEET_SNAPSHOT,
      activeDirectorId: "director-legal-medical-tribunal",
      bakeStripFx: true,
      screentones: ["classic-ink-45", "none", "cyan-noir-dots", "none"] as const,
    };

    const beat1 = store.addBeat("개정 모두진술", baseSnap);
    const beat2 = store.addBeat("심전도 증거 제시", {
      ...baseSnap,
      locale: "ja",
      jaWritingMode: "vertical-tategaki",
    });
    expect(beat1?.cutRangeLabel).toBe("1~4컷");
    expect(beat2?.cutRangeLabel).toBe("5~8컷");
    expect(storage.getItem(EPISODE_CUTSHEET_STORAGE_KEY)).not.toBeNull();

    // 새로고침 후 새 스토어 인스턴스가 동일한 storage에서 자동 복원한다
    const reloadedStore = createEpisodeCutsheetStore({ storage });
    expect(reloadedStore.getState().episodeTitleKo).toBe("12화 법정 반전");
    expect(reloadedStore.getState().beats).toHaveLength(2);

    store.moveBeat(beat2!.beatId, "up");
    expect(store.getState().beats[0]?.titleKo).toBe("심전도 증거 제시");
    expect(store.getState().beats[0]?.cutRangeLabel).toBe("1~4컷");
    expect(store.getState().beats[1]?.cutRangeLabel).toBe("5~8컷");

    const jsonText = serializeEpisodeCutsheet(store.getState().episodeTitleKo, store.getState().beats, 1_700_000_000_000);
    expect(episodeCutsheetFileName("12화 법정 반전", 2)).toBe("12화-법정-반전-8cuts.cutsheet.json");

    const parsed = parseEpisodeCutsheet(jsonText, 1_700_000_000_000);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.episodeTitleKo).toBe("12화 법정 반전");
    expect(parsed.document.beats).toHaveLength(2);
    expect(parsed.document.beats[0]?.snapshot.jaWritingMode).toBe("vertical-tategaki");

    store.removeBeat(beat2!.beatId);
    expect(store.getState().beats).toHaveLength(1);
    expect(store.getState().beats[0]?.cutRangeLabel).toBe("1~4컷");

    store.reset();
    expect(storage.getItem(EPISODE_CUTSHEET_STORAGE_KEY)).toBeNull();
  });

  it("빈 파일·구문 오류·잘못된 스키마에 대해 명시적 LabFailure 코드를 반환한다", () => {
    const empty = parseEpisodeCutsheet("   ");
    expect(!empty.ok && empty.failure.code).toBe("cutsheet-file-empty");

    const badJson = parseEpisodeCutsheet("{ broken");
    expect(!badJson.ok && badJson.failure.code).toBe("cutsheet-json-syntax");

    const wrongSchema = parseEpisodeCutsheet(JSON.stringify({ schema: "wrong/1", beats: [] }));
    expect(!wrongSchema.ok && wrongSchema.failure.code).toBe("cutsheet-schema-invalid");

    const noBeats = parseEpisodeCutsheet(JSON.stringify({ schema: "toonstudio.character-lab.episode-cutsheet/1", beats: [] }));
    expect(!noBeats.ok && noBeats.failure.code).toBe("cutsheet-beats-empty");
  });
});
