import { describe, expect, it } from "vitest";

import {
  FACS_ACTION_UNIT_IDS,
  FACS_AU_METADATA,
  WEBTOON_EMOTION_PRESETS,
  WEBTOON_EMOTION_PRESET_IDS,
  applyRecommendedExpressionCorrections,
  auditEpisodeExpressionAlignment,
  blendFacialExpressions,
  classifySmileAuthenticity,
  computeAuEuclideanDistance,
  createNeutralAuVector,
  detectAnatomicalAuConflicts,
  escapeExpressionXml,
  getWebtoonEmotionPreset,
  recommendAlignedExpressionAu,
  renderFacialExpressionSheetSvg,
  resolveAnatomicalAuConflicts,
  sanitizeAuVector,
  sha256Utf8Hex,
  summarizeExpressionAuditKo,
  synthesizeFaceLandmarksFromAu,
  type EpisodePanelExpressionInput,
  type FacsActionUnitId,
} from "./index";

describe("Wave 153 — FACS 18-AU 표정 프리셋 & 해부학 제약", () => {
  it("1. 18종 FACS 액션유닛 표준과 한국어 메타데이터를 모두 포함한다", () => {
    expect(FACS_ACTION_UNIT_IDS).toHaveLength(18);
    for (let i = 0; i < FACS_ACTION_UNIT_IDS.length; i += 1) {
      const id = FACS_ACTION_UNIT_IDS[i];
      expect(id).toBeDefined();
      if (id === undefined) continue;
      const meta = FACS_AU_METADATA[id];
      expect(meta.id).toBe(id);
      expect(meta.code.startsWith("AU")).toBe(true);
      expect(meta.labelKo.length).toBeGreaterThan(0);
    }
  });

  it("2. 8종 정본 웹툰 감정 프리셋이 [0, 1] 범위의 완전한 18-AU 벡터를 가진다", () => {
    expect(WEBTOON_EMOTION_PRESET_IDS).toHaveLength(8);
    for (let i = 0; i < WEBTOON_EMOTION_PRESET_IDS.length; i += 1) {
      const presetId = WEBTOON_EMOTION_PRESET_IDS[i];
      if (presetId === undefined) continue;
      const preset = getWebtoonEmotionPreset(presetId);
      expect(preset.id).toBe(presetId);
      expect(preset.labelKo.length).toBeGreaterThan(0);
      for (let j = 0; j < FACS_ACTION_UNIT_IDS.length; j += 1) {
        const auId = FACS_ACTION_UNIT_IDS[j];
        if (auId === undefined) continue;
        const val = preset.au[auId];
        expect(Number.isFinite(val)).toBe(true);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });

  it("3. 모든 8종 정본 프리셋은 해부학적 상호 배타 AU 충돌이 0건이다", () => {
    for (let i = 0; i < WEBTOON_EMOTION_PRESET_IDS.length; i += 1) {
      const presetId = WEBTOON_EMOTION_PRESET_IDS[i];
      if (presetId === undefined) continue;
      const conflicts = detectAnatomicalAuConflicts(WEBTOON_EMOTION_PRESETS[presetId].au);
      expect(conflicts).toHaveLength(0);
    }
  });

  it("4. 서로 다른 8종 프리셋은 충분히 변별되는 유클리드 거리를 가진다", () => {
    for (let i = 0; i < WEBTOON_EMOTION_PRESET_IDS.length; i += 1) {
      for (let j = i + 1; j < WEBTOON_EMOTION_PRESET_IDS.length; j += 1) {
        const idA = WEBTOON_EMOTION_PRESET_IDS[i];
        const idB = WEBTOON_EMOTION_PRESET_IDS[j];
        if (idA === undefined || idB === undefined) continue;
        const dist = computeAuEuclideanDistance(
          WEBTOON_EMOTION_PRESETS[idA].au,
          WEBTOON_EMOTION_PRESETS[idB].au,
        );
        expect(dist).toBeGreaterThan(0.5);
      }
    }
  });

  it("5. sanitizeAuVector는 음수·초과값·NaN·Infinity를 [0, 1]로 안전하게 정규화한다", () => {
    const clean = sanitizeAuVector({
      AU01_innerBrowRaise: -0.4,
      AU05_upperLidRaiser: 2.5,
      AU12_lipCornerPuller: Number.NaN,
      AU26_jawDrop: Number.POSITIVE_INFINITY,
      AU43_eyesClosed: 0.42,
    });
    expect(clean.AU01_innerBrowRaise).toBe(0);
    expect(clean.AU05_upperLidRaiser).toBe(1);
    expect(clean.AU12_lipCornerPuller).toBe(0);
    expect(clean.AU26_jawDrop).toBe(0);
    expect(clean.AU43_eyesClosed).toBe(0.42);
  });

  it("6. AU05(최대 개안)와 AU43(완전 폐안) 동시 1.0 조합을 해부학 충돌로 탐지한다", () => {
    const broken = sanitizeAuVector({
      AU05_upperLidRaiser: 1,
      AU43_eyesClosed: 1,
    });
    const conflicts = detectAnatomicalAuConflicts(broken);
    expect(conflicts.some((c) => c.ruleId === "lid-raiser-vs-eyes-closed")).toBe(true);
  });

  it("7. AU12+AU15 및 AU23+AU27 충돌을 적발하되 슬픔 팔자 눈썹(AU01+AU04)은 정상 허용한다", () => {
    const mouthConflict = detectAnatomicalAuConflicts(
      sanitizeAuVector({
        AU12_lipCornerPuller: 0.9,
        AU15_lipCornerDepressor: 0.85,
        AU23_lipTightener: 0.9,
        AU27_mouthStretch: 0.88,
      }),
    );
    expect(mouthConflict.some((c) => c.ruleId === "lip-corner-pull-vs-depress")).toBe(true);
    expect(mouthConflict.some((c) => c.ruleId === "lip-tighten-vs-mouth-stretch")).toBe(true);

    const validSorrowBrow = detectAnatomicalAuConflicts(
      sanitizeAuVector({
        AU01_innerBrowRaise: 0.92,
        AU04_browLowerer: 0.78,
      }),
    );
    expect(validSorrowBrow).toHaveLength(0);
  });
});

describe("Wave 153 — 비파괴 감정 강도 블렌더 & Duchenne 판별 & 2D 랜드마크", () => {
  it("8. anger-shout(0.7) + sorrow-cry(0.3) 혼합으로 '울분/분노의 눈물' 표정을 합성한다", () => {
    const result = blendFacialExpressions([
      { presetId: "anger-shout", weight: 0.7 },
      { presetId: "sorrow-cry", weight: 0.3 },
    ]);
    expect(result.remainingConflicts).toHaveLength(0);
    expect(result.au.AU04_browLowerer).toBeGreaterThan(0.75);
    expect(result.au.AU01_innerBrowRaise).toBeGreaterThan(0.22);
    expect(result.au.AU25_lipsPart).toBeGreaterThan(0.7);
    expect(result.fx.angerVein).toBe(true);
    expect(result.fx.tearPool).toBeGreaterThan(0.2);
    expect(result.blendLabelKo).toContain("70%");
    expect(result.blendLabelKo).toContain("30%");
  });

  it("9. intensity=0 지정 시 모든 18-AU가 0인 순수 중립 상태로 복귀한다", () => {
    const result = blendFacialExpressions([{ presetId: "shock-terror", weight: 1 }], {
      intensity: 0,
    });
    expect(computeAuEuclideanDistance(result.au, createNeutralAuVector())).toBe(0);
    expect(result.fx.sweatDrop).toBe(false);
    expect(result.fx.shadowOverEyes).toBe(0);
  });

  it("10. intensity=1.45 만화 과장 스케일이 활성 AU를 증폭하면서 [0, 1]로 안전 클램핑한다", () => {
    const normal = blendFacialExpressions([{ presetId: "joy-warm", weight: 1 }], {
      intensity: 1,
    });
    const exaggerated = blendFacialExpressions([{ presetId: "joy-warm", weight: 1 }], {
      intensity: 1.45,
    });
    expect(exaggerated.appliedIntensity).toBe(1.45);
    expect(exaggerated.rawUnclampedPeak).toBeGreaterThan(1);
    expect(exaggerated.au.AU06_cheekRaiser).toBeGreaterThan(normal.au.AU06_cheekRaiser);
    expect(exaggerated.au.AU06_cheekRaiser).toBeLessThanOrEqual(1);
    expect(exaggerated.au.AU12_lipCornerPuller).toBe(1);
    expect(exaggerated.au.AU04_browLowerer).toBe(0);
  });

  it("11. 빈 레이어 또는 0 이하 가중치 입력 시 안전하게 중립 표정을 반환한다", () => {
    const emptyRes = blendFacialExpressions([]);
    const zeroRes = blendFacialExpressions([{ presetId: "anger-shout", weight: 0 }]);
    expect(computeAuEuclideanDistance(emptyRes.au, createNeutralAuVector())).toBe(0);
    expect(computeAuEuclideanDistance(zeroRes.au, createNeutralAuVector())).toBe(0);
  });

  it("12. 블렌더는 상충 커스텀 AU(AU05=0.95, AU43=0.88)를 자동 해소해 충돌 0건을 보장한다", () => {
    const res = blendFacialExpressions([
      {
        customAu: {
          AU05_upperLidRaiser: 0.95,
          AU43_eyesClosed: 0.88,
        },
        weight: 1,
      },
    ]);
    expect(res.remainingConflicts).toHaveLength(0);
    expect(res.resolvedConflicts.length).toBeGreaterThan(0);
    expect(res.au.AU05_upperLidRaiser).toBe(0.95);
    expect(res.au.AU43_eyesClosed).toBeLessThan(0.15);
  });

  it("13. resolveConflicts: false 옵션으로 미해소 해부학 충돌을 원형 그대로 검사할 수 있다", () => {
    const raw = blendFacialExpressions(
      [
        {
          customAu: {
            AU05_upperLidRaiser: 0.92,
            AU43_eyesClosed: 0.9,
          },
          weight: 1,
        },
      ],
      { resolveConflicts: false },
    );
    expect(raw.resolvedConflicts).toHaveLength(0);
    expect(raw.remainingConflicts).toHaveLength(1);
  });

  it("14. fxOverrides와 asymmetry 덮어쓰기가 블렌딩 결과에 정확히 반영된다", () => {
    const res = blendFacialExpressions([{ presetId: "joy-warm", weight: 1 }], {
      asymmetry: 0.55,
      fxOverrides: { blushIntensity: 0.9, sweatDrop: true },
    });
    expect(res.asymmetry).toBe(0.55);
    expect(res.fx.blushIntensity).toBe(0.9);
    expect(res.fx.sweatDrop).toBe(true);
    expect(res.fx.sparkleEyes).toBe(true);
  });

  it("15. resolveAnatomicalAuConflicts는 동일 값 동점 충돌을 결정론적으로 해소한다", () => {
    const tied = sanitizeAuVector({
      AU05_upperLidRaiser: 0.8,
      AU43_eyesClosed: 0.8,
    });
    const first = resolveAnatomicalAuConflicts(tied);
    const second = resolveAnatomicalAuConflicts(tied);
    expect(first.au).toEqual(second.au);
    expect(detectAnatomicalAuConflicts(first.au)).toHaveLength(0);
  });

  it("16. joy-warm 프리셋을 진짜 Duchenne 미소(AU06+AU12)로 판별한다", () => {
    const analysis = classifySmileAuthenticity(WEBTOON_EMOTION_PRESETS["joy-warm"].au, 0);
    expect(analysis.classification).toBe("duchenne-genuine");
    expect(analysis.isDuchenneSmile).toBe(true);
    expect(analysis.isInsincereOrColdSmile).toBe(false);
    expect(analysis.duchenneScore).toBeGreaterThan(0.7);
  });

  it("17. AU12 단독 활성(AU06 < 0.2)을 가식·냉소적 미소로 판별한다", () => {
    const fakeSmile = sanitizeAuVector({
      AU12_lipCornerPuller: 0.78,
      AU06_cheekRaiser: 0.08,
    });
    const analysis = classifySmileAuthenticity(fakeSmile, 0);
    expect(analysis.classification).toBe("non-duchenne-social-or-cold");
    expect(analysis.isDuchenneSmile).toBe(false);
    expect(analysis.isInsincereOrColdSmile).toBe(true);
  });

  it("18. smug-scheming 프리셋을 좌우 비대칭 비웃음(smirk-asymmetric)으로 판별한다", () => {
    const preset = WEBTOON_EMOTION_PRESETS["smug-scheming"];
    const analysis = classifySmileAuthenticity(preset.au, preset.defaultAsymmetry);
    expect(analysis.classification).toBe("smirk-asymmetric");
    expect(analysis.isAsymmetricSmirk).toBe(true);
    expect(analysis.isInsincereOrColdSmile).toBe(true);
  });

  it("19. anger-shout 및 neutral 표정은 비미소(non-smiling)로 판별한다", () => {
    const anger = classifySmileAuthenticity(WEBTOON_EMOTION_PRESETS["anger-shout"].au);
    const neutral = classifySmileAuthenticity(createNeutralAuVector());
    expect(anger.classification).toBe("non-smiling");
    expect(neutral.classification).toBe("non-smiling");
    expect(anger.duchenneScore).toBe(0);
  });

  it("20. 2D 랜드마크 생성기는 눈썹 3점·눈꺼풀 3점·입술 외곽 6점을 정규화 좌표로 산출한다", () => {
    const lm = synthesizeFaceLandmarksFromAu(WEBTOON_EMOTION_PRESETS["joy-warm"].au);
    expect(lm.leftBrow).toHaveLength(3);
    expect(lm.rightBrow).toHaveLength(3);
    expect(lm.leftEye.upperLid).toHaveLength(3);
    expect(lm.leftEye.lowerLid).toHaveLength(3);
    expect(lm.mouthOuter).toHaveLength(6);
    expect(lm.mouthOpenArea).toBeGreaterThan(0);
  });

  it("21. 기하 단조성: 입 벌림 AU26 증가 시 입 개구 면적과 개구 높이가 엄격히 단조 증가한다", () => {
    const steps = [0, 0.25, 0.5, 0.75, 1];
    const areas: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < steps.length; i += 1) {
      const val = steps[i] ?? 0;
      const lm = synthesizeFaceLandmarksFromAu(
        sanitizeAuVector({ AU25_lipsPart: 0.3, AU26_jawDrop: val }),
      );
      areas.push(lm.mouthOpenArea);
      heights.push(lm.mouthInnerOpeningHeight);
    }
    for (let i = 1; i < steps.length; i += 1) {
      expect(areas[i]).toBeGreaterThan(areas[i - 1] ?? 0);
      expect(heights[i]).toBeGreaterThan(heights[i - 1] ?? 0);
    }
  });

  it("22. 기하 단조성: 눈 감음 AU43 증가 시 눈 개방 높이가 엄격히 단조 감소한다", () => {
    const steps = [0, 0.25, 0.5, 0.75, 1];
    const opens: number[] = [];
    for (let i = 0; i < steps.length; i += 1) {
      const val = steps[i] ?? 0;
      const lm = synthesizeFaceLandmarksFromAu(sanitizeAuVector({ AU43_eyesClosed: val }));
      opens.push(lm.averageEyeOpenHeight);
    }
    for (let i = 1; i < steps.length; i += 1) {
      expect(opens[i]).toBeLessThan(opens[i - 1] ?? 1);
    }
  });

  it("23. AU05는 눈 개방 높이를 늘리고 AU04는 안쪽 눈썹을 내리며 AU01은 올린다", () => {
    const base = synthesizeFaceLandmarksFromAu(createNeutralAuVector());
    const wide = synthesizeFaceLandmarksFromAu(sanitizeAuVector({ AU05_upperLidRaiser: 0.9 }));
    const angry = synthesizeFaceLandmarksFromAu(sanitizeAuVector({ AU04_browLowerer: 0.9 }));
    const sad = synthesizeFaceLandmarksFromAu(sanitizeAuVector({ AU01_innerBrowRaise: 0.9 }));

    expect(wide.averageEyeOpenHeight).toBeGreaterThan(base.averageEyeOpenHeight);
    expect(angry.leftBrow[0].y).toBeGreaterThan(base.leftBrow[0].y);
    expect(sad.leftBrow[0].y).toBeLessThan(base.leftBrow[0].y);
  });

  it("24. 좌우 비대칭(Smirk) 설정 시 양수·음수에 따라 반대 부호의 입꼬리 기울기가 생긴다", () => {
    const smileAu = sanitizeAuVector({ AU12_lipCornerPuller: 0.75, AU02_outerBrowRaise: 0.5 });
    const rightSmirk = synthesizeFaceLandmarksFromAu(smileAu, { asymmetry: 0.7 });
    const symmetric = synthesizeFaceLandmarksFromAu(smileAu, { asymmetry: 0 });
    const leftSmirk = synthesizeFaceLandmarksFromAu(smileAu, { asymmetry: -0.7 });

    expect(symmetric.mouthCornerLiftDelta).toBe(0);
    expect(rightSmirk.mouthCornerLiftDelta).toBeGreaterThan(0.01);
    expect(leftSmirk.mouthCornerLiftDelta).toBeLessThan(-0.01);
  });

  it("25. 충격·공포(shock-terror)는 기쁨(joy-warm) 대비 동공 반지름이 수축한다", () => {
    const shockLm = synthesizeFaceLandmarksFromAu(WEBTOON_EMOTION_PRESETS["shock-terror"].au, {
      fx: WEBTOON_EMOTION_PRESETS["shock-terror"].fx,
    });
    const joyLm = synthesizeFaceLandmarksFromAu(WEBTOON_EMOTION_PRESETS["joy-warm"].au, {
      fx: WEBTOON_EMOTION_PRESETS["joy-warm"].fx,
    });
    expect(shockLm.leftEye.pupilRadius).toBeLessThan(joyLm.leftEye.pupilRadius);
  });
});

function makePanel(
  panelId: string,
  characterId: string,
  dialogueEmotionIntent: EpisodePanelExpressionInput["dialogueEmotionIntent"],
  bubbleStyle: EpisodePanelExpressionInput["bubbleStyle"],
  au: EpisodePanelExpressionInput["au"],
  extra?: Partial<EpisodePanelExpressionInput>,
): EpisodePanelExpressionInput {
  return {
    panelId,
    characterId,
    dialogueText: extra?.dialogueText ?? "대사 테스트",
    dialogueEmotionIntent,
    bubbleStyle,
    au,
    ...extra,
  };
}

describe("Wave 153 — 대사-표정 감정 톤 불일치 감사기 & 자동 교정 솔버", () => {
  it("26. 대사 의도와 표정이 일치하는 정상 에피소드는 결함 0건으로 통과한다", () => {
    const panels: EpisodePanelExpressionInput[] = [
      makePanel("cut-01", "hero", "joy-warm", "oval-normal", WEBTOON_EMOTION_PRESETS["joy-warm"].au, {
        characterNameKo: "서준",
        dialogueText: "드디어 해냈어!",
        fx: WEBTOON_EMOTION_PRESETS["joy-warm"].fx,
      }),
      makePanel("cut-02", "hero", "anger-shout", "shout-jagged", WEBTOON_EMOTION_PRESETS["anger-shout"].au, {
        characterNameKo: "서준",
        dialogueText: "당장 그 손 치워!",
        fx: WEBTOON_EMOTION_PRESETS["anger-shout"].fx,
      }),
      makePanel("cut-03", "hero", "sorrow-cry", "whisper-dashed", WEBTOON_EMOTION_PRESETS["sorrow-cry"].au, {
        characterNameKo: "서준",
        dialogueText: "미안해... 내가 늦었어.",
        fx: WEBTOON_EMOTION_PRESETS["sorrow-cry"].fx,
      }),
    ];
    const audit = auditEpisodeExpressionAlignment(panels, { episodeTitleKo: "제12화 결전" });
    expect(audit.passed).toBe(true);
    expect(audit.blockerCount).toBe(0);
    expect(audit.warningCount).toBe(0);
    expect(audit.overallAlignmentScore).toBeGreaterThanOrEqual(95);
  });

  it("27. 분노·슬픔·공포 대사에 미소 표정이 그려지면 expression-dialogue-polarity-clash(blocker)를 적발한다", () => {
    const audit = auditEpisodeExpressionAlignment([
      makePanel("cut-angry-smile", "mina", "anger-shout", "oval-normal", WEBTOON_EMOTION_PRESETS["joy-warm"].au, {
        dialogueText: "다시는 내 앞에 나타나지 마!",
      }),
      makePanel("cut-cry-smile", "mina", "sorrow-cry", "oval-normal", WEBTOON_EMOTION_PRESETS["joy-warm"].au, {
        dialogueText: "제발 가지 마...",
      }),
    ]);
    expect(audit.passed).toBe(false);
    expect(audit.blockerCount).toBe(2);
    expect(
      audit.defects.every((d) => d.code === "expression-dialogue-polarity-clash" && d.severity === "blocker"),
    ).toBe(true);
  });

  it("28. 따뜻한 기쁨 대사에 분노·울음 표정이 그려진 역방향 충돌도 blocker로 적발한다", () => {
    const audit = auditEpisodeExpressionAlignment([
      makePanel("cut-joy-angry", "sora", "joy-warm", "oval-normal", WEBTOON_EMOTION_PRESETS["anger-shout"].au, {
        dialogueText: "오늘 정말 고마웠어!",
      }),
    ]);
    expect(audit.blockerCount).toBe(1);
    expect(audit.defects[0]?.code).toBe("expression-dialogue-polarity-clash");
  });

  it("29. intentionalIronyOrDeadpan: true 플래그는 쿨데레·반어적 미소 연출을 정상 허용한다", () => {
    const audit = auditEpisodeExpressionAlignment([
      makePanel("cut-kuudere", "villain", "anger-shout", "shout-jagged", WEBTOON_EMOTION_PRESETS["joy-warm"].au, {
        characterNameKo: "유진",
        dialogueText: "한 걸음만 더 오면 끝장이야.",
        intentionalIronyOrDeadpan: true,
      }),
    ]);
    expect(audit.passed).toBe(true);
    expect(audit.blockerCount).toBe(0);
    expect(audit.intentionalIronyExemptionCount).toBe(1);
    expect(audit.panelReports[0]?.intentionalIronyApplied).toBe(true);
  });

  it("30. 외침 톱니 말풍선(shout-jagged)에 무표정·닫힌 입이 오면 deadpan-underacting-on-climax를 적발한다", () => {
    const audit = auditEpisodeExpressionAlignment([
      makePanel("cut-flat-shout", "hero", "anger-shout", "shout-jagged", sanitizeAuVector({ AU04_browLowerer: 0.08, AU25_lipsPart: 0.05 }), {
        dialogueText: "거기 서라!!",
      }),
      makePanel("cut-mild-shout", "hero", "anger-shout", "shout-jagged", sanitizeAuVector({ AU04_browLowerer: 0.55, AU25_lipsPart: 0.15 }), {
        dialogueText: "안 돼!!",
      }),
    ]);
    expect(audit.defects.map((d) => d.code)).toEqual([
      "deadpan-underacting-on-climax",
      "deadpan-underacting-on-climax",
    ]);
    expect(audit.defects[0]?.severity).toBe("blocker");
    expect(audit.defects[1]?.severity).toBe("warning");
  });

  it("31. 해부학적 모순 AU는 intentionalIronyOrDeadpan: true여도 blocker로 반드시 적발한다", () => {
    const audit = auditEpisodeExpressionAlignment([
      makePanel("cut-broken-anatomy", "hero", "neutral", "thought-cloud", { AU05_upperLidRaiser: 0.96, AU43_eyesClosed: 0.92 }, {
        dialogueText: "...",
        intentionalIronyOrDeadpan: true,
      }),
    ]);
    expect(audit.blockerCount).toBe(1);
    expect(audit.defects[0]?.code).toBe("conflicting-anatomical-au");
  });

  it("32. 연속 4컷 이상 감정이 크게 바뀌는데 표정 AU 변화가 < 0.12면 same-face-stagnation을 경고한다", () => {
    const frozen = sanitizeAuVector({ AU01_innerBrowRaise: 0.12, AU25_lipsPart: 0.08 });
    const audit = auditEpisodeExpressionAlignment([
      makePanel("cut-1", "ch1", "neutral", "oval-normal", frozen, { dialogueText: "안녕." }),
      makePanel("cut-2", "ch1", "anger-shout", "oval-normal", { ...frozen, AU04_browLowerer: 0.04 }, { dialogueText: "정말 화가 나." }),
      makePanel("cut-3", "ch1", "sorrow-cry", "whisper-dashed", { ...frozen, AU15_lipCornerDepressor: 0.03 }, { dialogueText: "너무 슬퍼." }),
      makePanel("cut-4", "ch1", "shock-terror", "oval-normal", { ...frozen, AU05_upperLidRaiser: 0.04 }, { dialogueText: "세상에, 말도 안 돼!" }),
    ]);
    const stagnation = audit.defects.find((d) => d.code === "same-face-stagnation");
    expect(stagnation).toBeDefined();
    expect(stagnation?.severity).toBe("warning");
    expect(stagnation?.relatedPanelIds).toEqual(["cut-1", "cut-2", "cut-3", "cut-4"]);
  });

  it("33. 감정이 일정한 4컷이나 다른 캐릭터 컷에는 same-face-stagnation 오탐이 발생하지 않는다", () => {
    const neutralFace = createNeutralAuVector();
    const sameMood = auditEpisodeExpressionAlignment([
      makePanel("n1", "ch1", "neutral", "oval-normal", neutralFace, { dialogueText: "응." }),
      makePanel("n2", "ch1", "neutral", "oval-normal", neutralFace, { dialogueText: "알았어." }),
      makePanel("n3", "ch1", "neutral", "oval-normal", neutralFace, { dialogueText: "그래." }),
      makePanel("n4", "ch1", "neutral", "oval-normal", neutralFace, { dialogueText: "가자." }),
    ]);
    expect(sameMood.defects.some((d) => d.code === "same-face-stagnation")).toBe(false);
  });

  it("34. recommendAlignedExpressionAu는 이미 정상인 컷에 불필요한 변형(delta=0)을 가하지 않는다", () => {
    const cleanPanel = makePanel("cut-clean", "hero", "joy-warm", "oval-normal", WEBTOON_EMOTION_PRESETS["joy-warm"].au, {
      dialogueText: "좋았어!",
    });
    const rec = recommendAlignedExpressionAu(cleanPanel);
    expect(rec.auDeltaL2).toBe(0);
    expect(rec.changedUnits).toHaveLength(0);
  });

  it("35. 4종 복합 결함 에피소드에 자동 교정을 적용 후 재감사하면 위반 0건(passed=true)을 달성한다", () => {
    const brokenEpisode: EpisodePanelExpressionInput[] = [
      makePanel("p1", "lead", "anger-shout", "shout-jagged", WEBTOON_EMOTION_PRESETS["joy-warm"].au, { dialogueText: "지금 뭐라고 했어?!" }),
      makePanel("p2", "lead", "shock-terror", "shout-jagged", { AU05_upperLidRaiser: 0.95, AU43_eyesClosed: 0.92 }, { dialogueText: "멈춰!!" }),
      makePanel("p3", "side", "neutral", "oval-normal", createNeutralAuVector(), { dialogueText: "괜찮아." }),
      makePanel("p4", "side", "anger-shout", "oval-normal", createNeutralAuVector(), { dialogueText: "용서 못 해." }),
      makePanel("p5", "side", "sorrow-cry", "whisper-dashed", createNeutralAuVector(), { dialogueText: "너무 아파..." }),
      makePanel("p6", "side", "shock-terror", "oval-normal", createNeutralAuVector(), { dialogueText: "설마 거짓말이지?" }),
    ];

    const beforeAudit = auditEpisodeExpressionAlignment(brokenEpisode);
    expect(beforeAudit.passed).toBe(false);
    expect(beforeAudit.blockerCount).toBeGreaterThanOrEqual(2);
    expect(beforeAudit.warningCount).toBeGreaterThanOrEqual(1);

    const { correctedPanels, corrections } = applyRecommendedExpressionCorrections(brokenEpisode);
    expect(corrections).toHaveLength(brokenEpisode.length);
    const afterAudit = auditEpisodeExpressionAlignment(correctedPanels);
    expect(afterAudit.passed).toBe(true);
    expect(afterAudit.blockerCount).toBe(0);
    expect(afterAudit.warningCount).toBe(0);
    expect(afterAudit.defects).toHaveLength(0);
  });
});

describe("Wave 153 — SHA-256 결정론, 순수 OKLCH SVG & 한국어 QA 브리프", () => {
  it("36. 순수 ES2017 SHA-256이 NIST FIPS 180-4 표준 테스트 벡터와 일치한다", () => {
    expect(sha256Utf8Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Utf8Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Utf8Hex("웹툰 표정 FACS-18")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("37. AU 키 삽입 순서가 달라도 동일한 SHA-256 지문을 산출하고 AU 변경 시 해시가 바뀐다", () => {
    const auOrderA: Partial<Record<FacsActionUnitId, number>> = {
      AU04_browLowerer: 0.9,
      AU25_lipsPart: 0.85,
      AU26_jawDrop: 0.72,
    };
    const auOrderB: Partial<Record<FacsActionUnitId, number>> = {
      AU26_jawDrop: 0.72,
      AU04_browLowerer: 0.9,
      AU25_lipsPart: 0.85,
    };
    const basePanel: EpisodePanelExpressionInput = {
      panelId: "det-1",
      characterId: "hero",
      dialogueText: "결정론 검증",
      dialogueEmotionIntent: "anger-shout",
      bubbleStyle: "shout-jagged",
      au: auOrderA,
    };

    const auditA = auditEpisodeExpressionAlignment([basePanel]);
    const auditB = auditEpisodeExpressionAlignment([{ ...basePanel, au: auOrderB }]);
    const auditC = auditEpisodeExpressionAlignment([
      { ...basePanel, au: { ...auOrderA, AU26_jawDrop: 0.73 } },
    ]);

    expect(auditA.expressionSheetSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(auditA.expressionSheetSha256Hex).toBe(auditB.expressionSheetSha256Hex);
    expect(auditA.expressionSheetSha256Hex).not.toBe(auditC.expressionSheetSha256Hex);
  });

  it("38. 순수 OKLCH SVG만 출력하며 원시 hex/rgb/hsl 금지 및 모든 만화 FX 마커를 렌더링한다", () => {
    const audit = auditEpisodeExpressionAlignment([
      {
        panelId: "fx-panel-1",
        characterId: "hero",
        characterNameKo: "지호",
        dialogueText: "부끄럽지만 화도 나!",
        dialogueEmotionIntent: "embarrassed-fluster",
        bubbleStyle: "oval-normal",
        au: WEBTOON_EMOTION_PRESETS["embarrassed-fluster"].au,
        fx: {
          blushIntensity: 0.85,
          sweatDrop: true,
          angerVein: true,
          tearPool: 0.7,
          shadowOverEyes: 0.6,
          sparkleEyes: true,
        },
      },
    ]);

    const svg = renderFacialExpressionSheetSvg(audit, { columns: 1 });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");

    const rawHexPattern = new RegExp(`#[0-9a-f]{3,8}\\b`, "i");
    const rawRgbHslPattern = new RegExp(`(?:r` + `gb|h` + `sl)\\s*\\(`, "i");
    expect(rawHexPattern.test(svg)).toBe(false);
    expect(rawRgbHslPattern.test(svg)).toBe(false);

    expect(svg).toContain('data-fx="blush-left"');
    expect(svg).toContain('data-fx="sweat-drop"');
    expect(svg).toContain('data-fx="anger-vein"');
    expect(svg).toContain('data-fx="tear-left"');
    expect(svg).toContain('data-fx="shadow-over-eyes"');
    expect(svg).toContain('data-fx="sparkle-left"');
  });

  it("39. SVG 렌더링과 escapeExpressionXml이 XSS 페이로드와 XML 특수문자를 완전히 이스케이프한다", () => {
    const xssPayload = `<script>alert("xss")</script> & 'quote'`;
    expect(escapeExpressionXml(xssPayload)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;quote&apos;",
    );

    const audit = auditEpisodeExpressionAlignment(
      [
        {
          panelId: `p-<1>`,
          characterId: "c1",
          characterNameKo: `<img src=x onerror=1>`,
          dialogueText: xssPayload,
          dialogueEmotionIntent: "joy-warm",
          bubbleStyle: "oval-normal",
          au: WEBTOON_EMOTION_PRESETS["joy-warm"].au,
        },
      ],
      { episodeTitleKo: `테스트 <script>제목</script>` },
    );
    const svg = renderFacialExpressionSheetSvg(audit);
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("40. 한국어 QA 브리프는 통과·실패 상태를 자연스러운 실무 한국어로 요약한다", () => {
    const passAudit = auditEpisodeExpressionAlignment([
      {
        panelId: "ok-1",
        characterId: "lead",
        dialogueText: "정말 다행이야.",
        dialogueEmotionIntent: "joy-warm",
        bubbleStyle: "oval-normal",
        au: WEBTOON_EMOTION_PRESETS["joy-warm"].au,
      },
    ]);
    const failAudit = auditEpisodeExpressionAlignment([
      {
        panelId: "bad-1",
        characterId: "lead",
        dialogueText: "용서 못 해!!",
        dialogueEmotionIntent: "anger-shout",
        bubbleStyle: "shout-jagged",
        au: WEBTOON_EMOTION_PRESETS["joy-warm"].au,
      },
    ]);

    const passSummary = summarizeExpressionAuditKo(passAudit);
    const failSummary = summarizeExpressionAuditKo(failAudit);

    expect(passSummary).toContain("□");
    expect(passSummary).toContain("통과 (결함 0건)");
    expect(failSummary).toContain("수정 필요");
    expect(failSummary).toContain("[차단]");
    expect(failSummary).toContain("bad-1");
    expect(failSummary).not.toContain("가능하게 합니다");
  });
});
