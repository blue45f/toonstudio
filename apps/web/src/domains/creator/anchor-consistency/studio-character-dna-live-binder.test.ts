import { describe, expect, it } from "vitest";

import {
  auditCharacterDnaConsistency,
  autoTypesetScriptIntoVerticalCut,
  bindCharacterDnaToCutActors,
  type CutBoundCharacterActor,
  type StudioCharacterDnaPack,
} from "./studio-character-dna-live-binder";

describe("studio-character-dna-live-binder", () => {
  const dnaPack: StudioCharacterDnaPack = {
    dnaId: "dna-aria",
    version: 3,
    characterNameKo: "아리아 공녀",
    baseHeadStyleId: "rofan-noble",
    bodyArchetypeId: "rofan-heroine",
    hairFrontId: "front-curtain",
    hairSideId: "side-hime",
    hairBackId: "back-long-wave",
    defaultOutfitId: "rofan-ballgown-v1",
    palette: {
      skinToneToken: "skin-porcelain",
      hairMainToken: "champagne-blonde",
      eyeIrisToken: "sage-emerald",
      outfitPrimaryToken: "royal-ivory",
      outfitAccentToken: "antique-gold",
    },
    expressionKeys: ["neutral", "happy", "angry", "surprised"],
  };

  it("propagates DNA appearance live across cuts while preserving each cut's pose and expression", () => {
    const staleActors: CutBoundCharacterActor[] = [
      {
        cutId: "cut-01",
        actorId: "actor-a",
        dnaId: "dna-aria",
        boundDnaVersion: 1,
        poseId: "pose-walk-turn",
        activeExpression: "surprised",
        expressionWeight: 0.8,
        appearance: {
          baseHeadStyleId: "modern-drama",
          bodyArchetypeId: "modern-balanced",
          hairFrontId: "front-full-bang",
          hairSideId: "side-layered",
          hairBackId: "back-bob",
          outfitId: "casual-01",
          palette: { ...dnaPack.palette, hairMainToken: "ink-black" },
        },
      },
    ];

    expect(auditCharacterDnaConsistency(dnaPack, staleActors).consistencyRatio).toBe(0);

    const synced = bindCharacterDnaToCutActors(dnaPack, staleActors);
    expect(synced[0].poseId).toBe("pose-walk-turn");
    expect(synced[0].activeExpression).toBe("surprised");
    expect(synced[0].expressionWeight).toBe(0.8);
    expect(synced[0].appearance.hairSideId).toBe("side-hime");
    expect(synced[0].appearance.palette.hairMainToken).toBe("champagne-blonde");
    expect(auditCharacterDnaConsistency(dnaPack, synced).consistencyRatio).toBe(1);
  });

  it("auto-typesets dialogue bubbles in vertical scroll cuts with zero face overlap and top-to-bottom reading order", () => {
    const layout = autoTypesetScriptIntoVerticalCut({
      cutWidthPx: 800,
      cutHeightPx: 1400,
      faces: [
        { actorId: "heroine", x: 300, y: 260, width: 200, height: 220, mouthX: 400, mouthY: 420 },
        { actorId: "duke", x: 280, y: 840, width: 220, height: 240, mouthX: 390, mouthY: 1010 },
      ],
      lines: [
        { id: "l1", speakerActorId: "heroine", textKo: "이 연회장에서 빠져나가야 해.", bubbleKind: "thought" },
        { id: "l2", speakerActorId: "duke", textKo: "어디로 가시는 겁니까, 공녀님?", bubbleKind: "speech" },
        { id: "l3", speakerActorId: null, textKo: "달빛이 발코니 난간에 내려앉았다.", bubbleKind: "narration" },
      ],
    });

    expect(layout.bubbles).toHaveLength(3);
    expect(layout.totalFaceOverlapAreaPx).toBe(0);
    expect(layout.readingOrderPreserved).toBe(true);
    expect(layout.bubbles[0].tailTip).toEqual([400, 420]);
    expect(layout.bubbles[2].tailTip).toBeNull();
  });
});
