import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseEpisodeCutsheet, serializeEpisodeCutsheet } from "./webtoon-episode-cutsheet";
import {
  EPISODE_CUTSHEET_TEMPLATES,
  buildEpisodeCutsheetDocumentFromTemplate,
  findEpisodeCutsheetTemplate,
} from "./webtoon-episode-templates";

const EXPECTED_DIRECTOR_IDS = [
  "director-rofan-coronation",
  "director-noir-interrogation",
  "director-campus-cafe",
  "director-murim-awakening",
  "director-rooftop-twilight",
  "director-phantom-heist",
  "director-legal-medical-tribunal",
  "director-idol-encore-stage",
  "director-varsity-court-rival",
  "director-apocalypse-outpost",
  "director-healing-barista-atelier",
  "director-sanctuary-oracle",
] as const;

describe("webtoon-episode-templates", () => {
  it("12대 장르 48컷 옴니버스·3막 12컷·일본어 세로쓰기 8컷 내장 템플릿이 모두 유효한 큐시트 문서로 변환된다", () => {
    expect(EPISODE_CUTSHEET_TEMPLATES).toHaveLength(3);
    expect(findEpisodeCutsheetTemplate("unknown-template")).toBeNull();

    const omnibus = buildEpisodeCutsheetDocumentFromTemplate("template-12genre-omnibus-48cuts");
    expect(omnibus.beats).toHaveLength(12);
    expect(omnibus.beats.map((b) => b.snapshot.activeDirectorId)).toEqual(EXPECTED_DIRECTOR_IDS);
    expect(omnibus.beats[0]?.cutRangeLabel).toBe("1~4컷");
    expect(omnibus.beats[11]?.cutRangeLabel).toBe("45~48컷");

    const serialized = serializeEpisodeCutsheet(omnibus.episodeTitleKo, omnibus.beats, 1_700_000_000_000);
    const reparsed = parseEpisodeCutsheet(serialized, 1_700_000_000_000);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.document.beats).toHaveLength(12);
    }

    const trilogy = buildEpisodeCutsheetDocumentFromTemplate("template-trilogy-climax-12cuts");
    expect(trilogy.beats).toHaveLength(3);

    const jaDoc = buildEpisodeCutsheetDocumentFromTemplate("template-ja-tankobon-8cuts");
    expect(jaDoc.beats).toHaveLength(2);
    expect(jaDoc.beats.every((b) => b.snapshot.locale === "ja" && b.snapshot.jaWritingMode === "vertical-tategaki")).toBe(true);
  });

  it("public/assets/samples/flagship-12genre-48cuts.cutsheet.json 정적 샘플 파일이 12비트·48컷 스키마와 정확히 일치한다", () => {
    const samplePath = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../../public/assets/samples/flagship-12genre-48cuts.cutsheet.json",
    );
    const raw = readFileSync(samplePath, "utf8");
    const parsed = parseEpisodeCutsheet(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.beats).toHaveLength(12);
    expect(parsed.document.beats.map((b) => b.snapshot.activeDirectorId)).toEqual(EXPECTED_DIRECTOR_IDS);
    expect(parsed.document.beats[11]?.cutRangeLabel).toBe("45~48컷");
  });
});
