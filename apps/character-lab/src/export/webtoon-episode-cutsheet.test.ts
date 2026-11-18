import { describe, expect, it } from "vitest";

import {
  DEFAULT_EPISODE_CUTSHEET_SNAPSHOT,
  createEpisodeCutsheetStore,
  episodeCutsheetFileName,
  parseEpisodeCutsheet,
  serializeEpisodeCutsheet,
} from "./webtoon-episode-cutsheet";

describe("webtoon-episode-cutsheet", () => {
  it("4컷 씬 비트를 추가·순서 이동·삭제하며 컷 범위(1~4컷, 5~8컷)를 자동 재계산하고 JSON 왕복 직렬화를 보장한다", () => {
    const store = createEpisodeCutsheetStore({ episodeTitleKo: "12화 법정 반전" });
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
