import { describe, expect, it } from "vitest";

import {
  deconstructFreshIdeasThesis,
  ingestFreshIdeasSources,
} from "./fresh-ideas-ingest-deconstruct";
import { generateFiveOrthogonalLenses } from "./fresh-ideas-lenses-engine";
import { runFreshIdeasModeCWorkflow } from "./fresh-ideas-quality-ecosystem";
import {
  buildFreshIdeasStorySeedPayload,
  buildLivingSpecSeedFromFreshIdeas,
  buildStoryCutSeedFromFreshIdeas,
  formatKoreanRegisterSentence,
} from "./fresh-ideas-story-seed-bridge";
import {
  createStoryLivingSpecState,
  draftAiProposal,
} from "../planning/studio-story-living-spec-store";

const SAMPLE_URL_1 = "https://example.com/episodes/sunken-library-notes";
const SAMPLE_URL_2 = "https://example.com/episodes/guild-ledger-ref";

function createFixture() {
  const bundle = ingestFreshIdeasSources([
    {
      id: "src-story-1",
      title: "침수 도서관 1화 리믹스",
      kind: "article",
      content:
        "서연이 침수 도서관 문턱에서 은인장 편지를 줍지만, 등불지기 길드의 통제 규칙 때문에 진실을 바로 말하지 못한다.",
      url: SAMPLE_URL_1,
    },
    {
      id: "src-story-2",
      title: "독자 댓글 메모",
      kind: "community-comments",
      content: "첫 3컷에서 공간 긴장감과 인물의 망설임을 동시에 보여 주면 이탈률이 줄어든다.",
      url: SAMPLE_URL_2,
    },
  ]);
  const decon = deconstructFreshIdeasThesis(bundle);
  const lenses = generateFiveOrthogonalLenses(bundle, decon);
  const modeC = runFreshIdeasModeCWorkflow({
    sourceTitle: bundle.primaryTopic,
    sourceUrl: bundle.preservedUrls[0],
    targetPersonaKo: bundle.targetPersonaKo,
    lenses,
    preferredChannel: "linkedin-kr",
  });
  return { bundle, lenses, modeC };
}

describe("fresh-ideas-story-seed-bridge", () => {
  it("FreshIdeaLensCardV2를 [컷 N] 표준 대본·컷 시드 초안으로 변환하고 출처 URL과 캔버스 파싱 호환성을 지킨다", () => {
    const { lenses } = createFixture();
    const playbookLens = lenses.find((l) => l.id === "practical-playbook") ?? lenses[0]!;

    const cutSeed = buildStoryCutSeedFromFreshIdeas(playbookLens, {
      sourceTitle: "1화 · 비밀의 시작",
      register: "haeyo",
      episodeNumber: 1,
    });

    expect(cutSeed.cuts).toHaveLength(4);
    expect(cutSeed.parsedScript.hasExplicitMarkers).toBe(true);
    expect(cutSeed.parsedScript.cuts).toHaveLength(4);
    expect(cutSeed.canvasSeed.totalCutCount).toBe(4);
    expect(cutSeed.canvasSeed.totalDialogueCount).toBe(4);
    expect(cutSeed.preservedUrls).toEqual([SAMPLE_URL_1, SAMPLE_URL_2]);
    expect(cutSeed.clipboardMarkdownKo).toContain(SAMPLE_URL_1);
    expect(cutSeed.clipboardMarkdownKo).toContain(SAMPLE_URL_2);
    expect(cutSeed.scriptText).not.toContain("!");
    for (const cut of cutSeed.cuts) {
      expect(cut.directionNoteKo.length).toBeGreaterThan(4);
      expect(cut.dialogueLineKo.length).toBeGreaterThan(6);
    }
  });

  it("한국어 종결어미(haeyo/haera/hapsyo)를 대본 컷 대사 전 구간에 일관되게 유지한다", () => {
    const { lenses } = createFixture();
    const lens = lenses[0]!;

    const haeyoSeed = buildStoryCutSeedFromFreshIdeas(lens, { register: "haeyo" });
    const haeraSeed = buildStoryCutSeedFromFreshIdeas(lens, { register: "haera" });
    const hapsyoSeed = buildStoryCutSeedFromFreshIdeas(lens, { register: "hapsyo" });

    expect(haeyoSeed.register).toBe("haeyo");
    expect(haeraSeed.register).toBe("haera");
    expect(hapsyoSeed.register).toBe("hapsyo");

    expect(formatKoreanRegisterSentence("기준선을 잠그면 재작업이 줄어듭니다.", "haeyo")).toBe(
      "기준선을 잠그면 재작업이 줄어들어요.",
    );
    expect(formatKoreanRegisterSentence("기준선을 고정합니다.", "haeyo")).toBe("기준선을 고정해요.");
    expect(formatKoreanRegisterSentence("기준선을 고정해요.", "haera")).toBe("기준선을 고정한다.");
    expect(formatKoreanRegisterSentence("기준선을 고정한다.", "hapsyo")).toBe("기준선을 고정합니다.");

    expect(haeyoSeed.scriptText).not.toMatch(/합니다\.|됩니다\.|입니다\.|멈춘다\.|둔다\./u);
    expect(haeraSeed.scriptText).not.toMatch(/합니다\.|해요\.|돼요\.|멈춰요\.|둬요\./u);
    expect(hapsyoSeed.scriptText).not.toMatch(/해요\.|돼요\.|한다\.|멈춘다\.|둔다\./u);
  });

  it("ModeCEcosystemBundle 단독 입력을 연재 컷 시드와 Story Living Spec 패치로 변환한다", () => {
    const { modeC } = createFixture();

    const cutSeed = buildStoryCutSeedFromFreshIdeas(modeC, {
      sourceTitle: "침수 도서관 시즌 1",
      register: "haera",
    });
    expect(cutSeed.cuts.length).toBe(5);
    expect(cutSeed.preservedUrls).toContain(SAMPLE_URL_1);
    expect(cutSeed.parsedScript.cuts).toHaveLength(5);

    const specPatch = buildLivingSpecSeedFromFreshIdeas(modeC, {
      sourceTitle: "침수 도서관 시즌 1",
      register: "haera",
      episodeNumber: 2,
    });
    expect(specPatch.targetNodeKey).toBe("EP:EP-02");
    expect(specPatch.goalKo.length).toBeGreaterThan(8);
    expect(specPatch.coreConflictKo.length).toBeGreaterThan(8);
    expect(specPatch.checklist.length).toBeGreaterThanOrEqual(3);
    expect(specPatch.sourceLinks.map((link) => link.url)).toContain(SAMPLE_URL_1);
    expect(specPatch.cutNodeSnapshots).toHaveLength(5);
    expect(specPatch.episodePlanPatch.turningPoints).toHaveLength(5);
  });

  it("buildLivingSpecSeedFromFreshIdeas 결과가 Story Living Spec draftAiProposal과 그대로 호환된다", () => {
    const { lenses, modeC, bundle } = createFixture();
    const specPatch = buildLivingSpecSeedFromFreshIdeas({
      sourceTitle: "1화 · 비밀의 시작",
      lens: lenses[3],
      modeC,
      preservedUrls: bundle.preservedUrls,
      episodeNumber: 1,
      createdAt: "2026-11-21T00:00:00.000Z",
    });

    const initialState = createStoryLivingSpecState({ projectId: "proj-fresh-ideas-bridge" });
    const draftedState = draftAiProposal(initialState, specPatch.proposalInput);

    expect(draftedState.projectId).toBe("proj-fresh-ideas-bridge");

    expect(draftedState.proposals).toHaveLength(1);
    const proposal = draftedState.proposals[0]!;
    expect(proposal.targetEntityId).toBe("EP:EP-01");
    expect(proposal.source).toBe("cross_doc_sync");
    expect(proposal.status).toBe("draft");
    expect(proposal.evidenceCitations.map((c) => c.sourceDocId)).toEqual([
      SAMPLE_URL_1,
      SAMPLE_URL_2,
    ]);
    expect(proposal.proposedSnapshot?.summary).toContain("목표:");
    expect(proposal.proposedSnapshot?.summary).toContain("핵심 갈등:");
    expect(proposal.proposedSnapshot?.rightsAssets).toHaveLength(2);
  });

  it("buildFreshIdeasStorySeedPayload가 컷 시드·기획 명세·클립보드 문서를 한 번에 반환한다", () => {
    const { lenses, modeC, bundle } = createFixture();
    const payload = buildFreshIdeasStorySeedPayload({
      sourceTitle: "1화 · 비밀의 시작",
      lens: lenses[0],
      modeC,
      lenses,
      register: "hapsyo",
      preservedUrls: bundle.preservedUrls,
    });

    expect(payload.register).toBe("hapsyo");
    expect(payload.cutSeed.cuts).toHaveLength(4);
    expect(payload.livingSpecSeed.sourceLinks).toHaveLength(2);
    expect(payload.clipboardTextKo).toContain("[컷 1 - 도입 훅");
    expect(payload.clipboardTextKo).toContain("## 출처 링크");
    expect(payload.clipboardTextKo).toContain("## 스토리 기획 명세 초안");
    expect(payload.summaryKo).toContain("4컷");
  });
});
