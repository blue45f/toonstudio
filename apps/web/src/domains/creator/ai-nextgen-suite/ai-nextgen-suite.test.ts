import { describe, expect, it, vi } from "vitest";

import {
  AccessibleSceneNarratorOutputSchema,
  CharacterVoiceHonorificAuditOutputSchema,
  CulturalTranscreationOutputSchema,
  EpisodeArcShowrunnerOutputSchema,
  FIVE_LOCALE_CODES,
  OKLCH_CANONICAL_PATTERN,
  PanelCameraLightingDirectorOutputSchema,
  buildLocalAccessibleSceneNarration,
  buildLocalCharacterVoiceHonorificAudit,
  buildLocalCulturalTranscreation,
  buildLocalEpisodeArcShowrunnerReport,
  buildLocalPanelCameraLightingShotList,
  classifyKoreanHonorificRegister,
  computeHorizontalFovDegFromFocalLengthMm,
  detectKoreanTranslationese,
  extractJsonBodySafely,
  fitTextToBalloonBudget,
  normalizeToOklchColor,
  polishKoreanTranslationese,
  redactNextGenSensitiveText,
  runAccessibleSceneNarrator,
  runCharacterVoiceHonorificAuditor,
  runCrossModelQualityJudge,
  runCulturalTranscreationEngine,
  runEpisodeArcShowrunner,
  runPanelCameraLightingDirector,
  scoreAssistOutputQuality,
  toGeminiResponseSchema,
} from "./index";

// Round-4 라이브 검증에서 증류(Distilled)한 실제 모델 골든 픽스처
const LIVE_DISTILLED_EPISODE_ARC_FIXTURE = {
  arcDiagnosisKo:
    "1화 회귀 선언의 진입 몰입도는 높으나 2~3화 도서관·응접실 설명 구간에서 긴장도가 급감합니다. 4화 금고 반전은 강력하므로 중반 압축이 핵심입니다.",
  overallHookScore: 78,
  tensionCurve: [
    {
      episodeNumber: 1,
      openingTension: 90,
      midpointTension: 80,
      climaxTension: 85,
      cliffhangerPull: 74,
      dominantEmotionKo: "결단과 역공",
      pacingStatus: "optimal" as const,
    },
    {
      episodeNumber: 2,
      openingTension: 62,
      midpointTension: 48,
      climaxTension: 55,
      cliffhangerPull: 50,
      dominantEmotionKo: "정적인 탐색",
      pacingStatus: "valley-risk" as const,
    },
    {
      episodeNumber: 4,
      openingTension: 82,
      midpointTension: 78,
      climaxTension: 92,
      cliffhangerPull: 89,
      dominantEmotionKo: "배신감과 충격",
      pacingStatus: "optimal" as const,
    },
  ],
  pacingValleys: [
    {
      episodeRange: "2~3화 중반",
      severity: "warn" as const,
      causeKo: "세법과 물류 경로를 정적인 대화로만 풀어내 독자 스크롤 탄력이 떨어집니다.",
      compressionFixKo: "장부 설명을 북부 밀정 추격 컷 속 짧은 대사로 합쳐 1개 회차 분량으로 압축하세요.",
      scrollRhythmTipKo: "반전 인장 클로즈업 직전에 여백 컷을 두어 시선 체류를 늘리세요.",
    },
  ],
  cliffhangerRewrites: [
    {
      episodeNumber: 2,
      originalWeaknessKo: "일과 마무리로 끝나 다음 화 클릭 동기가 약합니다.",
      rewrittenLastCutVisualKo: "촛불 역광 아래 찢긴 세금 장부 틈에서 황태자비의 밀서가 드러나는 클로즈업",
      rewrittenFinalLineKo: "이 필체… 전생에 내 사형 집행서를 쓴 바로 그 손이야.",
      curiosityQuestionKo: "도서관 내부에 숨어 아델을 감시하던 밀정의 정체는 누구일까?",
      expectedNextClickLift: "high" as const,
    },
  ],
  nextEpisodeBridgeKo:
    "5화 첫 컷은 금고 문이 닫히는 소리와 함께 카시안이 아델에게 동맹 조건을 내미는 대면으로 바로 여세요.",
};

describe("ai-nextgen-suite 공용 가드레일·PII 정밀 보호·번역투 교정", () => {
  it("일반 영어 어휘(high-angle, lighting, nightmare, linear)는 보존하고 실제 개인정보·SNS 계정만 정확히 마스킹한다", () => {
    expect(redactNextGenSensitiveText("high-angle shot with dramatic lighting")).toEqual({
      sanitizedText: "high-angle shot with dramatic lighting",
      redactedCount: 0,
    });
    expect(redactNextGenSensitiveText("fighting nightmare ignore linear guidelines")).toEqual({
      sanitizedText: "fighting nightmare ignore linear guidelines",
      redactedCount: 0,
    });

    const piiSample =
      "문의 010-9876-5432, 이메일 writer@toonstudio.kr, 주민번호 940815-2345678, IG: nightowl_art, 카톡: lighting_pd, 키 sk-liveSecretKey998877665544332211";
    const redacted = redactNextGenSensitiveText(piiSample);
    expect(redacted.redactedCount).toBeGreaterThanOrEqual(6);
    expect(redacted.sanitizedText).not.toContain("010-9876-5432");
    expect(redacted.sanitizedText).not.toContain("writer@toonstudio.kr");
    expect(redacted.sanitizedText).not.toContain("940815-2345678");
    expect(redacted.sanitizedText).not.toContain("nightowl_art");
    expect(redacted.sanitizedText).not.toContain("lighting_pd");
    expect(redacted.sanitizedText).not.toContain("sk-liveSecretKey");
  });

  it("기계 번역투와 과도한 '통해'/'및' 연쇄를 검출하고 자연스러운 한국어로 교정한다", () => {
    const stiff =
      "이 도구는 직관적인 경험을 제공합니다. 원활한 워크플로우를 보장합니다. 연출에 있어서 빠른 수정을 하는 것을 가능하게 합니다.";
    const hits = detectKoreanTranslationese(stiff);
    expect(hits.length).toBeGreaterThanOrEqual(3);

    const polished = polishKoreanTranslationese(stiff);
    expect(detectKoreanTranslationese(polished)).toEqual([]);

    const chain = "구성을 통해 배치를 통해 조명을 통해 장면을 완성합니다.";
    expect(detectKoreanTranslationese(chain)).toContain("통해 과다 연쇄");
  });

  it("코드 펜스가 섞인 응답에서 JSON을 추출하고 Gemini 호환 스키마에서 additionalProperties를 제거한다", () => {
    const fenced = "안내 문구\n```json\n{\"ok\":true,\"count\":3}\n```\n후행 문구";
    expect(JSON.parse(extractJsonBodySafely(fenced))).toEqual({ ok: true, count: 3 });

    const geminiSchema = toGeminiResponseSchema({
      type: "object",
      additionalProperties: false,
      required: ["title"],
      properties: {
        title: { type: "string" },
        nested: {
          type: "object",
          additionalProperties: false,
          properties: { count: { type: "integer" } },
        },
      },
    });
    expect("additionalProperties" in geminiSchema).toBe(false);
    expect(
      "additionalProperties" in
        ((geminiSchema.properties as Record<string, Record<string, unknown>>).nested ?? {}),
    ).toBe(false);
  });
});

describe("1. ai-episode-arc-showrunner (다회차 긴장 곡선·처짐 구간·클리프행어 쇼러너)", () => {
  it("라이브 증류 골든 픽스처가 엄격 스키마와 품질 심사 100점을 통과한다", () => {
    const parsed = EpisodeArcShowrunnerOutputSchema.safeParse(LIVE_DISTILLED_EPISODE_ARC_FIXTURE);
    expect(parsed.success).toBe(true);

    const quality = scoreAssistOutputQuality({
      output: LIVE_DISTILLED_EPISODE_ARC_FIXTURE,
      schema: EpisodeArcShowrunnerOutputSchema,
    });
    expect(quality.passed).toBe(true);
    expect(quality.totalScore).toBe(100);
    expect(quality.piiLeakCount).toBe(0);
  });

  it("로컬 결정론 분석기가 중반 설명 처짐(valley-risk)과 과밀 비트(overpacked)를 식별하고 엔딩을 리라이트한다", async () => {
    const localReport = buildLocalEpisodeArcShowrunnerReport({
      seriesTitle: "검은 항구의 파수꾼",
      genre: "현대 느와르",
      episodes: [
        {
          episodeNumber: 1,
          title: "밀항선의 총성",
          summary: "배신자의 습격과 폭발 속에서 주인공이 유일한 단서를 확보한다.",
          beats: ["습격", "추격", "단서 확보"],
          cutCount: 60,
          cliffhangerDraft: "컨테이너 안에서 정체불명의 생존자가 눈을 뜬다?",
        },
        {
          episodeNumber: 2,
          title: "안전가옥 브리핑",
          summary: "하루 종일 서류 정리와 과거 회상, 식사, 휴식, 이동 설명만 이어진다.",
          beats: ["정리", "회상", "식사"],
          cutCount: 52,
          cliffhangerDraft: "모두 잠자리에 들었다.",
        },
        {
          episodeNumber: 3,
          title: "9개 부두 동시 잠입",
          summary: "아홉 구역의 설정 설명이 한 회차에 몰린다.",
          beats: ["1구역", "2구역", "3구역", "4구역", "5구역", "6구역", "7구역", "8구역"],
          cutCount: 92,
        },
      ],
    });

    expect(localReport.tensionCurve[1]?.pacingStatus).toBe("valley-risk");
    expect(localReport.tensionCurve[2]?.pacingStatus).toBe("overpacked");
    expect(localReport.pacingValleys.length).toBeGreaterThanOrEqual(2);
    expect(localReport.cliffhangerRewrites.length).toBeGreaterThanOrEqual(1);

    const cascadeRes = await runEpisodeArcShowrunner(
      {
        seriesTitle: "황궁의 시계탑",
        genre: "로판",
        directionNote: "작가 연락처 010-1234-5678 비공개",
        episodes: [{ episodeNumber: 1, title: "1화", summary: "계약 파혼 선언과 반전 위기" }],
      },
      { localOnly: true },
    );
    expect(cascadeRes.providerUsed).toBe("local-fallback");
    expect(cascadeRes.storeData).toBe(false);
    expect(cascadeRes.piiInputRedactedCount).toBe(1);
    expect(JSON.stringify(cascadeRes.data)).not.toContain("010-1234-5678");
  });
});

describe("2. ai-character-voice-honorific-auditor (한국어 4대 화법 매트릭스·보이스 이탈 검수)", () => {
  it("하십시오체·해요체·반말·사극체 및 한 말풍선 내 뒷문장 화법 이탈 함정을 정확히 분류한다", () => {
    expect(classifyKoreanHonorificRegister("사부님, 비급을 찾았사옵니다.")).toBe("sageuk");
    expect(classifyKoreanHonorificRegister("네 검 끝만 보거라.")).toBe("sageuk");
    expect(classifyKoreanHonorificRegister("출항 기록을 모두 확보했습니다.")).toBe("hasipsio");
    expect(classifyKoreanHonorificRegister("오늘 마감은 무사히 끝났어요.")).toBe("haeyo");
    expect(classifyKoreanHonorificRegister("창고 열쇠는 내가 먼저 챙겼어!")).toBe("banmal");
    expect(classifyKoreanHonorificRegister("헉...!")).toBe("neutral");

    // 첫 문장은 사극체이나 뒷문장에서 현대 해요체가 섞인 복합 말풍선 함정
    expect(
      classifyKoreanHonorificRegister(
        "사부님, 적들이 산문을 포위했사옵니다. 근데 우리 이제 어떡해요?",
        "sageuk",
      ),
    ).toBe("haeyo");
  });

  it("정통 무협·느와르 대사에서 화법 위반, 금기어 노출, 단문 캐릭터 말투 붕괴를 모두 잡아내고 중복 없이 교정한다", async () => {
    const audit = buildLocalCharacterVoiceHonorificAudit({
      workTitle: "천마귀환록",
      genre: "정통 무협",
      characters: [
        {
          id: "disciple",
          name: "청풍",
          voiceSignatureKo: "사부에게 극존칭 사극체를 쓰는 제자",
          defaultRegister: "sageuk",
          forbiddenPhrases: ["헐 대박"],
        },
        {
          id: "master",
          name: "백운",
          voiceSignatureKo: "과묵한 단문 사극체 스승",
          defaultRegister: "sageuk",
          sentenceLengthTarget: "short",
        },
      ],
      relationMatrix: [
        {
          speakerId: "disciple",
          listenerId: "master",
          expectedRegister: "sageuk",
          relationLabelKo: "제자 -> 사부",
        },
        {
          speakerId: "master",
          listenerId: "disciple",
          expectedRegister: "sageuk",
          relationLabelKo: "사부 -> 제자",
        },
      ],
      dialogueCuts: [
        {
          cutNumber: 1,
          speakerId: "disciple",
          listenerId: "master",
          line: "헐 대박 사부님, 저 숫자면 돌파는 무리야!",
        },
        {
          cutNumber: 2,
          speakerId: "master",
          listenerId: "disciple",
          line: "청풍아, 저들의 진법은 삼십 년 전 북해빙궁에서 시작된 변형 육합진의 일종으로 좌측 날개의 보법이 반 박자 늦는 빈틈을 노려야만 살길이 열린단다 거라.",
        },
      ],
    });

    expect(CharacterVoiceHonorificAuditOutputSchema.safeParse(audit).success).toBe(true);
    const cut1Issues = audit.violations.filter((v) => v.cutNumber === 1);
    expect(cut1Issues.some((v) => v.issueKind === "honorific-mismatch")).toBe(true);
    expect(cut1Issues.some((v) => v.issueKind === "forbidden-phrase")).toBe(true);
    for (const v of cut1Issues) {
      expect(v.rewrittenLineKo).not.toContain("헐 대박");
    }
    expect(audit.violations.some((v) => v.cutNumber === 2 && v.issueKind === "voice-drift")).toBe(
      true,
    );

    const cascadeAudit = await runCharacterVoiceHonorificAuditor(
      {
        workTitle: "항구의 그림자",
        genre: "현대 느와르",
        characters: [
          { id: "sub", name: "태석", voiceSignatureKo: "격식 높임", defaultRegister: "hasipsio" },
          { id: "boss", name: "무진", voiceSignatureKo: "짧은 반말", defaultRegister: "banmal" },
        ],
        relationMatrix: [
          {
            speakerId: "sub",
            listenerId: "boss",
            expectedRegister: "hasipsio",
            relationLabelKo: "부하 -> 보스",
          },
        ],
        dialogueCuts: [{ cutNumber: 1, speakerId: "sub", listenerId: "boss", line: "회장님, 열쇠 챙겼어." }],
      },
      { localOnly: true },
    );
    expect(cascadeAudit.data.violations[0]?.expectedRegister).toBe("hasipsio");
    expect(cascadeAudit.data.violations[0]?.detectedRegister).toBe("banmal");
  });
});

describe("3. ai-panel-camera-lighting-director (18..135mm 광학·OKLCH 3점 조명·AudioToon 큐)", () => {
  it("35mm 풀프레임 초점거리 시야각 계산과 변형 OKLCH 문자열 정규화가 정확히 동작한다", () => {
    expect(computeHorizontalFovDegFromFocalLengthMm(18)).toBe(90);
    expect(computeHorizontalFovDegFromFocalLengthMm(50)).toBe(39.6);
    expect(computeHorizontalFovDegFromFocalLengthMm(135)).toBe(15.2);

    const normalized = normalizeToOklchColor("oklch(82% 0.09 75deg / 0.9)", "oklch(0.8 0.05 80)");
    expect(normalized).toBe("oklch(0.82 0.09 75)");
    expect(OKLCH_CANONICAL_PATTERN.test(normalized)).toBe(true);

    const fallbackUsed = normalizeToOklchColor("invalid-color-token", "oklch(0.75 0.08 235)");
    expect(fallbackUsed).toBe("oklch(0.75 0.08 235)");
  });

  it("모델이 범위 밖 렌즈(8mm, 300mm)나 음수 바닥 좌표를 반환해도 18..135mm 및 Y>=0, 정규 OKLCH로 보정한다", async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  directorSummaryKo: "폭우 부두 대치 3D 숏 설계입니다.",
                  continuityAxisNoteKo: "180도 시선축을 유지합니다.",
                  shots: [
                    {
                      cutNumber: 1,
                      shotSizeLabelKo: "초광각 로우숏",
                      lensFocalLengthMm: 8,
                      horizontalFovDeg: 140,
                      elevationPreset: "high-angle",
                      elevationDeg: 20,
                      dutchTiltDeg: 50,
                      cameraPositionM: [1.2, -3.5, 4.0],
                      lookAtTargetM: [0, -1.0, 0],
                      blockingNoteKo: "컨테이너 그림자 대비를 강조합니다.",
                      lightingRig: {
                        moodNameKo: "심야 네온",
                        keyLight: {
                          colorOklch: "oklch(78% 0.11 230deg)",
                          intensityRatio: 1.4,
                          azimuthDeg: 45,
                          elevationDeg: 40,
                          roleNoteKo: "차가운 주광",
                        },
                        fillLight: {
                          colorOklch: "oklch(0.36 0.04 250)",
                          intensityRatio: 0.3,
                          azimuthDeg: -50,
                          elevationDeg: 15,
                          roleNoteKo: "암부 보조광",
                        },
                        rimLight: {
                          colorOklch: "oklch(0.84 0.16 195)",
                          intensityRatio: 1.2,
                          azimuthDeg: -150,
                          elevationDeg: 35,
                          roleNoteKo: "실루엣 분리광",
                        },
                      },
                      audioToonCue: {
                        visualSfxKo: "콰아앙",
                        foleyCategory: "impact",
                        sfxCueDescriptionKo: "컨테이너 금속 타격 저음",
                        gainDb: -6,
                        pan: -0.2,
                        entryOffsetMs: 120,
                      },
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 300, completion_tokens: 220, total_tokens: 520 },
        }),
        { status: 200 },
      ),
    );

    const res = await runPanelCameraLightingDirector(
      {
        sceneTitleKo: "제3부두 격돌 ![참고](https://example.invalid/scene.webp)",
        genre: "현대 느와르",
        panels: [{ cutNumber: 1, actionDescriptionKo: "빗속에서 쇠파이프가 부딪친다." }],
      },
      {
        env: { OPENAI_API_KEY: "test-ephemeral-key", OPENAI_MODEL: "gpt-4o-mini" },
        fetchImpl: mockFetch,
      },
    );

    expect(res.providerUsed).toBe("openai");
    const request = JSON.parse(String(mockFetch.mock.calls[0]?.[1]?.body)) as {
      messages: { role: string; content: string }[];
    };
    const manuscript = request.messages.find((message) => message.role === "user")?.content;
    expect(manuscript).toContain('<creator_manuscript data-trusted="false">');
    expect(manuscript).toContain("[외부 이미지 비콘 차단됨]");
    expect(manuscript).not.toContain("example.invalid");
    const shot = res.data.shots[0]!;
    expect(shot.lensFocalLengthMm).toBe(18);
    expect(shot.horizontalFovDeg).toBe(90);
    expect(shot.elevationPreset).toBe("high-angle");
    expect(shot.dutchTiltDeg).toBe(35);
    expect(shot.cameraPositionM[1]).toBeGreaterThanOrEqual(0);
    expect(shot.lookAtTargetM[1]).toBeGreaterThanOrEqual(0);
    expect(OKLCH_CANONICAL_PATTERN.test(shot.lightingRig.keyLight.colorOklch)).toBe(true);

    const localShots = buildLocalPanelCameraLightingShotList({
      sceneTitleKo: "온실 서약",
      genre: "로판",
      panels: [{ cutNumber: 1, actionDescriptionKo: "눈동자가 흔들리며 속삭인다." }],
    });
    expect(PanelCameraLightingDirectorOutputSchema.safeParse(localShots).success).toBe(true);
  });
});

describe("4. ai-cultural-transcreation-engine (5개국 관용구·효과음 초월번역 및 말풍선 예산 강제)", () => {
  it("긴 다국어 대사도 지정된 줄 수·줄당 글자 수 예산 안으로 정확히 줄바꿈·압축한다", () => {
    const wrappedEn = fitTextToBalloonBudget(
      "Don't count your chickens before the team lead signs off on this sprint!",
      2,
      20,
      "en",
    );
    expect(wrappedEn.budgetCompliant).toBe(true);
    expect(wrappedEn.lineCount).toBeLessThanOrEqual(2);
    expect(wrappedEn.maxLineChars).toBeLessThanOrEqual(20);
    expect(wrappedEn.condensedToFit).toBe(true);

    const wrappedJa = fitTextToBalloonBudget(
      "まだぬか喜びするな！部長の最終承認が残っているぞ！",
      2,
      12,
      "ja",
    );
    expect(wrappedJa.lineCount).toBeLessThanOrEqual(2);
    expect(wrappedJa.maxLineChars).toBeLessThanOrEqual(12);
  });

  it("KO -> EN/JA/ES/FR 5개 로케일 관용구·용어집·효과음을 직역이나 한글 잔류 없이 변환한다", async () => {
    const localTrans = buildLocalCulturalTranscreation({
      workTitleKo: "판교 야근 수호대",
      genre: "일상 개그",
      glossary: [
        {
          termKo: "매화검법",
          en: "Plum Sword",
          ja: "梅花剣法",
          es: "Espada Ciruelo",
          fr: "Épée Prunier",
        },
      ],
      items: [
        {
          id: "b-1",
          cutNumber: 1,
          kind: "dialogue",
          sourceKo: "김칫국부터 마시지 마!",
          maxLines: 2,
          maxCharsPerLine: 22,
        },
        {
          id: "b-2",
          cutNumber: 2,
          kind: "sfx",
          sourceKo: "콰아앙",
          maxLines: 1,
          maxCharsPerLine: 12,
        },
      ],
    });

    expect(CulturalTranscreationOutputSchema.safeParse(localTrans).success).toBe(true);
    expect(localTrans.supportedLocales).toEqual(FIVE_LOCALE_CODES);
    expect(localTrans.zeroTranslationesePassed).toBe(true);
    expect(localTrans.items[0]!.translations.en.text.toLowerCase()).not.toContain("kimchi");

    // LLM이 실수로 직역('drink kimchi soup')이나 한글 잔류를 섞었을 때 자동 치환 검증
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  localizationSummaryKo: "4개 언어권 말풍선 길이에 맞춰 현지화했습니다.",
                  items: [
                    {
                      id: "b-1",
                      cutNumber: 1,
                      kind: "dialogue",
                      enText: "Don't drink kimchi soup 한글잔류!",
                      jaText: "まだぬか喜びするな！",
                      esText: "¡No cantes victoria!",
                      frText: "Ne vends pas la peau de l'ours !",
                      culturalAdaptationNoteKo: "설레발 경계 관용구로 치환했습니다.",
                      sfxTypographyTipKo: "말풍선 여백을 균형 있게 유지하세요.",
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 180, completion_tokens: 120, total_tokens: 300 },
        }),
        { status: 200 },
      ),
    );

    const liveNormalized = await runCulturalTranscreationEngine(
      {
        workTitleKo: "칼퇴 수호대",
        genre: "일상 개그",
        items: [
          {
            id: "b-1",
            cutNumber: 1,
            kind: "dialogue",
            sourceKo: "김칫국부터 마시지 마!",
            maxLines: 2,
            maxCharsPerLine: 22,
          },
        ],
      },
      {
        env: { OPENAI_API_KEY: "test-ephemeral-key" },
        fetchImpl: mockFetch,
      },
    );

    const enOut = liveNormalized.data.items[0]!.translations.en.text;
    expect(enOut.toLowerCase()).not.toContain("kimchi");
    expect(/[가-힣]/u.test(enOut)).toBe(false);
  });
});

describe("5. ai-accessible-scene-narrator + 이중 공급자 페일오버 + scoreAssistOutputQuality 심사기", () => {
  it("중복 '이미지:' 접두어를 제거하고 시각장애인용 짧은 대체텍스트와 생생한 공간 해설을 생성한다", () => {
    const narration = buildLocalAccessibleSceneNarration({
      workTitleKo: "심해 기지 어비스",
      episodeTitleKo: "7화",
      genre: "SF 스릴러",
      cuts: [
        {
          cutNumber: 1,
          visualSceneKo: "이미지: 비상 적색등 아래 잠수복 헬멧 유리에 성에가 낀 해린이 숨을 죽인다.",
          dialogues: [{ speakerKo: "해린", lineKo: "소나 꺼.", toneKo: "속삭임" }],
          sfxKo: ["쿵… 쿵…"],
        },
      ],
    });

    expect(AccessibleSceneNarratorOutputSchema.safeParse(narration).success).toBe(true);
    expect(narration.cuts[0]!.altTextShortKo.startsWith("이미지:")).toBe(false);
    expect(narration.cuts[0]!.readingOrderSteps.length).toBeGreaterThanOrEqual(3);
  });

  it("OpenAI 실패(429) 시 Gemini 무료 티어로 즉시 페일오버하며, 유료 Gemini 모델과 은퇴 OpenAI 모델은 호출 전 차단한다", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const isOpenAiHost = (raw: string): boolean => {
      try {
        const host = new URL(raw).hostname;
        return host === "api.openai.com" || host.endsWith(".api.openai.com");
      } catch {
        return false;
      }
    };
    const mockFetch = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const parsedBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, body: parsedBody });

      if (isOpenAiHost(url)) {
        return new Response(JSON.stringify({ error: { code: "rate_limit_exceeded" } }), {
          status: 429,
        });
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      episodeOrientationKo: "조용한 고양이 서점의 오후 풍경을 컷 순서대로 안내합니다.",
                      screenReaderGuideKo: "좌우 스와이프로 컷별 대체텍스트와 대사를 순서대로 탐색하세요.",
                      cuts: [
                        {
                          cutNumber: 1,
                          altTextShortKo: "계산대 위 치즈태비 고양이가 영수증 뭉치를 베고 잠들어 있다.",
                          vividNarrationKo:
                            "따스한 오후 햇살이 내려앉은 나무 계산대 위에서 치즈태비 고양이가 둥글게 몸을 말고 고르게 숨을 내쉽니다.",
                          dialogueTranscriptKo: "손님(작은 웃음): \"계산은 점장님 깨우면 안 되죠?\"",
                          audioCueKo: "낮고 포근하게 울리는 고양이 골골거림",
                          recommendedPauseMs: 600,
                          readingOrderSteps: ["계산대 전경", "잠든 고양이 표정", "손님의 속삭임"],
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 210, candidatesTokenCount: 150, totalTokenCount: 360 },
        }),
        { status: 200 },
      );
    });

    const failoverRes = await runAccessibleSceneNarrator(
      {
        workTitleKo: "고양이 서점",
        episodeTitleKo: "1화",
        genre: "일상 개그",
        cuts: [{ cutNumber: 1, visualSceneKo: "계산대 위 고양이가 잠든 장면" }],
      },
      {
        env: {
          OPENAI_API_KEY: "ephemeral-openai-test",
          OPENAI_MODEL: "gpt-4o-mini",
          GEMINI_API_KEY: "ephemeral-gemini-test",
          GEMINI_MODEL: "gemini-flash-lite-latest",
        },
        fetchImpl: mockFetch,
      },
    );

    expect(calls[0]?.body.store).toBe(false);
    expect(failoverRes.providerUsed).toBe("gemini");
    expect(failoverRes.modelUsed).toBe("gemini-flash-lite-latest");
    expect(failoverRes.attempts.map((a) => `${a.provider}:${a.outcome}`)).toEqual([
      "openai:failed-over",
      "gemini:succeeded",
    ]);

    // 은퇴한 OpenAI 모델(gpt-4.1-nano) 및 유료 전용 Gemini 모델(gemini-2.5-pro) 사전 차단 확인
    const blockedFetch = vi.fn<typeof fetch>();
    const blockedRes = await runAccessibleSceneNarrator(
      {
        workTitleKo: "차단 검증",
        episodeTitleKo: "1화",
        genre: "SF 스릴러",
        cuts: [{ cutNumber: 1, visualSceneKo: "복도 비상등이 켜진다." }],
      },
      {
        env: {
          OPENAI_API_KEY: "ephemeral-openai-test",
          OPENAI_MODEL: "gpt-4.1-nano",
          GEMINI_API_KEY: "ephemeral-gemini-test",
          GEMINI_MODEL: "gemini-2.5-pro",
        },
        fetchImpl: blockedFetch,
      },
    );

    expect(blockedFetch).not.toHaveBeenCalled();
    expect(blockedRes.providerUsed).toBe("local-fallback");
    expect(blockedRes.attempts.map((a) => a.reason)).toEqual([
      "retired_model_blocked",
      "gemini_paid_or_unknown_model_blocked",
    ]);
  });

  it("scoreAssistOutputQuality 및 runCrossModelQualityJudge가 PII 유출·번역투·스키마 오류를 즉시 차단한다", async () => {
    const badReport = scoreAssistOutputQuality({
      output: {
        episodeOrientationKo:
          "이 해설은 직관적인 경험을 제공합니다. 담당자 010-5555-7777 또는 leak_canary_token_99",
        screenReaderGuideKo: "짧은 안내",
        cuts: [],
      },
      schema: AccessibleSceneNarratorOutputSchema,
      rawCanarySecrets: ["leak_canary_token_99"],
    });

    expect(badReport.passed).toBe(false);
    expect(badReport.schemaValid).toBe(false);
    expect(badReport.piiSafe).toBe(false);
    expect(badReport.piiLeakCount).toBeGreaterThanOrEqual(2);
    expect(badReport.translationeseHits).toContain("직관적인 경험을 제공");

    const cleanNarration = buildLocalAccessibleSceneNarration({
      workTitleKo: "별빛 정거장",
      episodeTitleKo: "2화",
      genre: "로판",
      cuts: [{ cutNumber: 1, visualSceneKo: "플랫폼 시계탑 아래 두 인물이 우산을 나눠 쓴다." }],
    });

    const crossVerdict = await runCrossModelQualityJudge(
      {
        moduleNameKo: "시각장애인 화면해설 생성기",
        output: cleanNarration,
        schema: AccessibleSceneNarratorOutputSchema,
        producedByProvider: "openai",
      },
      { localOnly: true },
    );
    expect(crossVerdict.passed).toBe(true);
    expect(crossVerdict.blendedScore).toBe(100);
  });
});
