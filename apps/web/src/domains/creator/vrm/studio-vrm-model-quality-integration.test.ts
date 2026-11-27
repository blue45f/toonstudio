import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SAMPLE_VRM_ENTRIES, SAMPLE_VRMS, savedLegacySampleVrmEntry, selectableSampleVrmUrl } from "./vrm-library";
import {
  isStudioVrmTechnicallyAdmittedModel,
  STUDIO_VRM_TECHNICAL_MODEL_REJECTIONS,
} from "./studio-vrm-model-technical-denylist.generated";
import { isStudioVrmProductionModelUrl } from "./studio-vrm-model-quality";

const librarySource = readFileSync(new URL("./vrm-library.ts", import.meta.url), "utf8");

describe("VRM technical model quality integration", () => {
  it("exposes only technically admitted deployment-owned models", () => {
    const rejected = new Set(Object.keys(STUDIO_VRM_TECHNICAL_MODEL_REJECTIONS));
    const visibleIds = new Set(SAMPLE_VRM_ENTRIES.map((entry) => entry.id));
    const samples = new Map(SAMPLE_VRMS.map((sample) => [sample.id, sample]));
    expect(visibleIds.size).toBe(17);

    for (const entry of SAMPLE_VRM_ENTRIES) {
      const sample = samples.get(entry.id);
      expect(sample, entry.id).toBeDefined();
      expect(rejected.has(entry.id), entry.id).toBe(false);
      expect(isStudioVrmProductionModelUrl(sample?.url), entry.id).toBe(true);
    }

    for (const sample of SAMPLE_VRMS) {
      if (sample.visibility === "legacy" || rejected.has(sample.id) || !isStudioVrmProductionModelUrl(sample.url)) {
        expect(visibleIds.has(sample.id), sample.id).toBe(false);
      }
    }
  });

  it("기술 복원된 캐릭터의 원본을 열고 원고용으로 선별한 캐릭터만 신규 목록에 표시한다", () => {
    const visibleIds = new Set(SAMPLE_VRM_ENTRIES.map((entry) => entry.id));
    expect(STUDIO_VRM_TECHNICAL_MODEL_REJECTIONS).toEqual({});
    for (const id of ["kage", "rubin", "shino", "shion", "vita"]) {
      expect(isStudioVrmTechnicallyAdmittedModel(id), id).toBe(true);
      expect(visibleIds.has(id), id).toBe(true);
    }
    expect(isStudioVrmTechnicallyAdmittedModel("mega-angel")).toBe(true);
    expect(visibleIds.has("mega-angel")).toBe(false);
    expect(savedLegacySampleVrmEntry("mega-angel")?.id).toBe("mega-angel");
    expect(selectableSampleVrmUrl("mega-angel")).toBe("/vrm/MegaAngel.vrm");
  });

  it("keeps model admission in the source discovery pipeline", () => {
    expect(librarySource).toContain("isStudioVrmProductionModelUrl(sample.url)");
    expect(librarySource).toContain("isStudioVrmTechnicallyAdmittedModel(sample.id)");
  });
});
