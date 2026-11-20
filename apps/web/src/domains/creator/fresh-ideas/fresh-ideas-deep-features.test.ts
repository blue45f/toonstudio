import { describe, expect, it } from "vitest";

import {
  deconstructFreshIdeasThesis,
  ingestFreshIdeasSources,
} from "./fresh-ideas-ingest-deconstruct";
import { generateFiveOrthogonalLenses } from "./fresh-ideas-lenses-engine";
import { runFreshIdeasModeCWorkflow } from "./fresh-ideas-quality-ecosystem";
import { streamFreshIdeasRemixDraft } from "./fresh-ideas-streaming-cloud-bridge";
import {
  appendIdeaBankRows,
  buildStructuredGoogleDocMarkdown,
  loadIdeaBankSnapshot,
  serializeIdeaBankCsv,
  updateIdeaBankRecordStatus,
  type StorageLike,
} from "./fresh-ideas-workspace-export-bridge";
import {
  parseCrossLabFreshIdeasEnvelope,
  synthesizeCrossLabsUnifiedRemix,
} from "./fresh-ideas-cross-labs-adapter";

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("Fresh Ideas v2.2 Deep Features (Streaming, Export/IdeaBank, Cross-Labs DTO)", () => {
  it("streams progressive Mode B chunks cleanly and respects AbortSignal cancellation", async () => {
    const bundle = ingestFreshIdeasSources([
      {
        id: "stream-src",
        title: "웹툰 3D 배경 룩데브 표준화",
        kind: "article",
        content: "장르 락인과 비파괴 마감으로 주간 70컷 마감 시간을 줄인다.",
      },
    ]);
    const lenses = generateFiveOrthogonalLenses(bundle, deconstructFreshIdeasThesis(bundle));

    const stages: string[] = [];
    const gen = streamFreshIdeasRemixDraft({
      lens: lenses[0]!,
      channelId: "linkedin-kr",
      chunkDelayMs: 0,
    });
    let finalOutput: string;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        expect(next.value.completed).toBe(true);
        expect(next.value.cancelled).toBe(false);
        finalOutput = next.value.finalText;
        break;
      }
      stages.push(next.value.stage);
    }
    expect(stages).toEqual(["hook", "body", "objection", "cta"]);
    expect(finalOutput).not.toContain("!");

    const controller = new AbortController();
    controller.abort();
    const abortedGen = streamFreshIdeasRemixDraft({
      lens: lenses[0]!,
      channelId: "linkedin-kr",
      signal: controller.signal,
    });
    const abortedRes = await abortedGen.next();
    expect(abortedRes.done).toBe(true);
    if (abortedRes.done) {
      expect(abortedRes.value.cancelled).toBe(true);
    }
  });

  it("serializes RFC-4180 Sheets CSV, Docs 4-seed Markdown, and persists Idea Bank rows", () => {
    const bundle = ingestFreshIdeasSources([
      {
        id: "exp-src",
        title: "로판 연회, 3D 배경 룩데브",
        kind: "sheet-csv",
        content: "주간 70컷 기준 19.9시간 절감",
      },
    ]);
    const lenses = generateFiveOrthogonalLenses(bundle, deconstructFreshIdeasThesis(bundle));
    const modeC = runFreshIdeasModeCWorkflow({
      sourceTitle: bundle.primaryTopic,
      targetPersonaKo: bundle.targetPersonaKo,
      lenses,
      dateIso: "2026-11-20",
    });

    const csv = serializeIdeaBankCsv(modeC.ideaBankRows);
    expect(csv.split("\n")).toHaveLength(6);
    expect(csv).toContain('"로판 연회, 3D 배경 룩데브"');

    const docMd = buildStructuredGoogleDocMarkdown(modeC);
    expect(docMd).toContain("부록 1 · 잔여 4개 아이디어 씨앗");
    expect(docMd).toContain("부록 2 · 5부작 연재 커리큘럼");

    const storage = createMemoryStorage();
    const saved = appendIdeaBankRows(modeC.ideaBankRows, { storage, nowIso: "2026-11-20T12:00:00Z" });
    expect(saved).toHaveLength(5);
    expect(loadIdeaBankSnapshot(storage)).toHaveLength(5);

    const updated = updateIdeaBankRecordStatus(saved[0]!.id, "Published", storage);
    expect(updated[0]!.draftStatus).toBe("Published");
  });

  it("validates Cross-Labs DTO strictly and synthesizes unified BG3D + Brush + Character remix", () => {
    expect(parseCrossLabFreshIdeasEnvelope({ schemaVersion: 1 })).toBeNull();

    const parsed = parseCrossLabFreshIdeasEnvelope({
      schemaVersion: 2,
      episodeTitleKo: "황궁 연회 × 던전 귀환 통합 에피소드",
      bg3d: { overallScore100: 94.2, weeklyHoursSaved: 24.5, contrastRatio: 2.45, lineThicknessPx: 1.35 },
      brushLab: { overallScore100: 97.3, taperSharpness100: 97.4, averageStrokePx: 4.48, presetNameKo: "칼선 G펜" },
      characterLab: { overallScore100: 96.9, turnaroundScore100: 96.4, faceSdfScore100: 99.5, outlineWidthMm: 3.5 },
    });
    expect(parsed).not.toBeNull();

    const synthesis = synthesizeCrossLabsUnifiedRemix(parsed!);
    expect(synthesis.coherenceScore100).toBeGreaterThanOrEqual(95);
    expect(synthesis.lenses).toHaveLength(5);
    expect(synthesis.audit.passed).toBe(true);
    expect(synthesis.audit.score100).toBe(100);
    expect(synthesis.summaryBadgeKo).toContain("3대 랩스 통합 리믹스");
  });
});
