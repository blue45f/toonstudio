import { describe, expect, it } from "vitest";
import {
  ACCESSIBILITY_COMPLIANCE_STANDARDS,
  DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS,
  DEFAULT_CONCISE_ALT_TARGET_CHARS,
  SUPPORTED_ACCESSIBLE_LOCALES,
  auditEpisodeAccessibilityCompliance,
  compileAccessibleEpisodeDescriptions,
  detectRedundantAltPrefix,
  escapeAccessibilityXml,
  exportScreenReaderTranscriptText,
  renderAccessibilityComplianceSvg,
  sha256AccessibleAltHex,
  stripRedundantAltPrefixes,
  summarizeAccessibilityAuditKo,
  type AccessibleEpisodeInput,
  type AccessiblePanelInput,
  type CompiledAccessibleEpisode,
  type DialogueDeliveryStyle,
  type PanelShotScale,
} from "./index";

function createSampleEpisode(): AccessibleEpisodeInput {
  return {
    episodeId: "ep-wave154-01",
    seriesTitleKo: "비 오는 옥상의 기억",
    seriesTitleEn: "Memories on the Rainy Rooftop",
    seriesTitleJa: "雨の屋上の記憶",
    episodeTitleKo: "1화. 끊어진 신호",
    episodeTitleEn: "Ep 1. Broken Signal",
    episodeTitleJa: "第1話 途切れた信号",
    panels: [
      {
        panelId: "p-01",
        panelIndex: 1,
        shotScale: "wide-establishing",
        settingKo: "비 내리는 학교 옥상",
        settingEn: "rain-soaked school rooftop",
        settingJa: "雨の降る学校の屋上",
        lightingMood: "neon-rain",
        characters: [
          {
            characterId: "char-seoyeon", nameKo: "서연", nameEn: "Seoyeon", nameJa: "ソヨン",
            horizontalPosition: "left",
            expressionLabel: "긴장한", expressionLabelEn: "tense", expressionLabelJa: "緊張した",
            actionDescription: "젖은 우산을 쥔 채 철조망 너머를 살핀다",
            actionDescriptionEn: "grips a wet umbrella and scans past the fence",
            actionDescriptionJa: "濡れた傘を握り金網の向こうを見つめる",
          },
          {
            characterId: "char-minsu", nameKo: "민수", nameEn: "Minsu", nameJa: "ミンス",
            horizontalPosition: "right",
            expressionLabel: "다급한", expressionLabelEn: "urgent", expressionLabelJa: "焦った",
            actionDescription: "옥상 문을 밀치고 뛰어든다",
            actionDescriptionEn: "pushes open the rooftop door and rushes in",
            actionDescriptionJa: "屋上のドアを押し開けて駆け込む",
          },
        ],
        dialogues: [
          {
            dialogueId: "dlg-01-b", order: 2, speakerId: "char-seoyeon",
            speakerName: "서연", speakerNameEn: "Seoyeon", speakerNameJa: "ソヨン",
            deliveryStyle: "whisper",
            text: "조용히 해, 아직 저쪽에 있어.",
            textEn: "Keep quiet, it is still over there.",
            textJa: "静かにして、まだあっちにいる。",
          },
          {
            dialogueId: "dlg-01-a", order: 1, speakerId: "char-minsu",
            speakerName: "민수", speakerNameEn: "Minsu", speakerNameJa: "ミンス",
            deliveryStyle: "shout",
            text: "서연아, 당장 내려와!",
            textEn: "Seoyeon, come down right now!",
            textJa: "ソヨン、今すぐ降りて！",
          },
        ],
        sfxItems: [{
          sfxId: "sfx-01", visualGlyph: "콰앙!",
          semanticMeaning: "철문이 강하게 닫히는 굉음",
          semanticMeaningEn: "heavy iron door slamming shut",
          semanticMeaningJa: "鉄の扉が激しく閉まる轟音",
        }],
      },
      {
        panelId: "p-02",
        panelIndex: 2,
        shotScale: "closeup",
        settingKo: "비 내리는 학교 옥상",
        settingEn: "rain-soaked school rooftop",
        settingJa: "雨の降る学校の屋上",
        lightingMood: "neon-rain",
        characters: [{
          characterId: "char-seoyeon", nameKo: "서연", nameEn: "Seoyeon", nameJa: "ソヨン",
          horizontalPosition: "left",
          expressionLabel: "결연한", expressionLabelEn: "determined", expressionLabelJa: "決然とした",
          actionDescription: "무전기 전원을 켜고 주파수를 맞춘다",
          actionDescriptionEn: "turns on the radio and tunes the frequency",
          actionDescriptionJa: "無線機の電源を入れ周波数を合わせる",
        }],
        dialogues: [{
          dialogueId: "dlg-02-a", order: 1, speakerId: "char-seoyeon",
          speakerName: "서연", speakerNameEn: "Seoyeon", speakerNameJa: "ソヨン",
          deliveryStyle: "internal",
          text: "이번 신호마저 놓치면 끝이야.",
          textEn: "If I miss this signal too, it is over.",
          textJa: "この信号まで逃したら終わりだ。",
        }],
        sfxItems: [{
          sfxId: "sfx-02", visualGlyph: "치지직",
          semanticMeaning: "무전기 잡음이 튀는 소리",
          semanticMeaningEn: "radio static crackling",
          semanticMeaningJa: "無線機のノイズが走る音",
        }],
      },
      {
        panelId: "p-03",
        panelIndex: 3,
        shotScale: "insert-detail",
        settingKo: "어두운 계단실",
        settingEn: "dim stairwell",
        settingJa: "薄暗い階段室",
        lightingMood: "dim-interior",
        characters: [],
        dialogues: [{
          dialogueId: "dlg-03-a", order: 1, speakerId: "narrator",
          speakerName: "해설", speakerNameEn: "Narrator", speakerNameJa: "ナレーター",
          deliveryStyle: "narration",
          text: "열쇠 꾸러미가 차가운 바닥에 떨어졌다.",
          textEn: "A ring of keys dropped onto the cold floor.",
          textJa: "鍵束が冷たい床に落ちた。",
        }],
        sfxItems: [{
          sfxId: "sfx-03", visualGlyph: "짤랑",
          semanticMeaning: "금속 열쇠가 바닥에 부딪히는 소리",
          semanticMeaningEn: "metal keys clinking on the floor",
          semanticMeaningJa: "金属の鍵が床に当たる音",
        }],
      },
    ],
  };
}

function mkMinimalEpisode(episodeId: string, panels: readonly AccessiblePanelInput[]): AccessibleEpisodeInput {
  return { episodeId, seriesTitleKo: "테스트 시리즈", episodeTitleKo: "1화", panels };
}

describe("Wave 154 — 웹툰 3개국어 접근성 Alt-Text·장면 해설 및 KWCAG/WCAG 감사기", () => {
  it("T01: 한국어(ko-KR) 장면 해설에 샷·배경·조명·인물 위치·표정·행동·효과음·대사를 컴파일한다", () => {
    const compiled = compileAccessibleEpisodeDescriptions(createSampleEpisode());
    const p1Ko = compiled.panels[0].byLocale["ko-KR"];
    expect(p1Ko.conciseAlt).toContain("비 내리는 학교 옥상");
    expect(p1Ko.conciseAlt).toContain("전경 샷");
    expect(p1Ko.conciseAlt).toContain("왼쪽 서연");
    expect(p1Ko.extendedLongdesc).toContain("철문이 강하게 닫히는 굉음");
    expect(p1Ko.extendedLongdesc).toContain("서연아, 당장 내려와!");
    expect(SUPPORTED_ACCESSIBLE_LOCALES).toEqual(["ko-KR", "en-US", "ja-JP"]);
    expect(ACCESSIBILITY_COMPLIANCE_STANDARDS.length).toBe(3);
  });

  it("T02: 영어(en-US) 장면 해설과 인물·대사·효과음 의미를 자연스럽게 컴파일한다", () => {
    const p1En = compileAccessibleEpisodeDescriptions(createSampleEpisode()).panels[0].byLocale["en-US"];
    expect(p1En.conciseAlt).toContain("Wide establishing shot of rain-soaked school rooftop");
    expect(p1En.conciseAlt).toContain("Seoyeon on the left");
    expect(p1En.extendedLongdesc).toContain("SFX: heavy iron door slamming shut");
    expect(p1En.extendedLongdesc).toContain('Minsu (shouting): "Seoyeon, come down right now!"');
  });

  it("T03: 일본어(ja-JP) 장면 해설과 효과음·일본어 인용 대사를 컴파일한다", () => {
    const p1Ja = compileAccessibleEpisodeDescriptions(createSampleEpisode()).panels[0].byLocale["ja-JP"];
    expect(p1Ja.conciseAlt).toContain("雨の降る学校の屋上");
    expect(p1Ja.conciseAlt).toContain("全景ショット");
    expect(p1Ja.conciseAlt).toContain("左側にソヨン");
    expect(p1Ja.extendedLongdesc).toContain("効果音: 鉄の扉が激しく閉まる轟音");
    expect(p1Ja.extendedLongdesc).toContain("ミンス（叫び）「ソヨン、今すぐ降りて！」");
  });

  it("T04: 5종 샷 스케일이 3개국어 모두 정확히 매핑된다", () => {
    const scales: readonly PanelShotScale[] = [
      "extreme-closeup", "closeup", "medium-shot", "wide-establishing", "insert-detail",
    ];
    const panels: AccessiblePanelInput[] = scales.map((shotScale, i) => ({
      panelId: `shot-${String(i + 1)}`, panelIndex: i + 1, shotScale,
      settingKo: `장소 ${String(i + 1)}`, settingEn: `Place ${String(i + 1)}`, settingJa: `場所${String(i + 1)}`,
      lightingMood: "bright-daylight", characters: [], dialogues: [], sfxItems: [],
    }));
    const compiled = compileAccessibleEpisodeDescriptions(mkMinimalEpisode("ep-shots", panels));
    expect(compiled.panels[0].byLocale["ko-KR"].conciseAlt).toContain("초근접 클로즈업");
    expect(compiled.panels[1].byLocale["en-US"].conciseAlt).toContain("Close-up");
    expect(compiled.panels[2].byLocale["ja-JP"].conciseAlt).toContain("ミディアムショット");
    expect(compiled.panels[3].byLocale["ko-KR"].conciseAlt).toContain("전경 샷");
    expect(compiled.panels[4].byLocale["en-US"].conciseAlt).toContain("Detail insert");
  });

  it("T05: 6종 대사 전달 스타일이 한/영/일 화자 표기에 모두 보존된다", () => {
    const styles: readonly DialogueDeliveryStyle[] = [
      "normal", "shout", "whisper", "internal", "narration", "offscreen",
    ];
    const ep = mkMinimalEpisode("ep-styles", [{
      panelId: "p-styles", panelIndex: 1, shotScale: "medium-shot",
      settingKo: "복도", settingEn: "hallway", settingJa: "廊下", lightingMood: "overcast-soft",
      characters: [], sfxItems: [],
      dialogues: styles.map((deliveryStyle, idx) => ({
        dialogueId: `d-${deliveryStyle}`, order: idx + 1, speakerId: "sp-1",
        speakerName: "지수", speakerNameEn: "Jisu", speakerNameJa: "ジス",
        deliveryStyle, text: `대사-${deliveryStyle}`, textEn: `Line-${deliveryStyle}`, textJa: `セリフ-${deliveryStyle}`,
      })),
    }]);
    const compiled = compileAccessibleEpisodeDescriptions(ep);
    const koLong = compiled.panels[0].byLocale["ko-KR"].extendedLongdesc;
    expect(koLong).toContain('지수: "대사-normal"');
    expect(koLong).toContain('지수(외침): "대사-shout"');
    expect(koLong).toContain('지수(속삭임): "대사-whisper"');
    expect(koLong).toContain('지수(속마음): "대사-internal"');
    expect(koLong).toContain('지수(내레이션): "대사-narration"');
    expect(koLong).toContain('지수(화면 밖 목소리): "대사-offscreen"');
    expect(compiled.panels[0].byLocale["en-US"].extendedLongdesc).toContain("Jisu (inner thought)");
    expect(compiled.panels[0].byLocale["ja-JP"].extendedLongdesc).toContain("ジス（画面外の声）");
  });

  it("T06: 자동 생성 conciseAlt는 기본 권장 상한(220자) 이하로 간결하게 압축된다", () => {
    const compiled = compileAccessibleEpisodeDescriptions(createSampleEpisode());
    for (const panel of compiled.panels) {
      for (const locale of SUPPORTED_ACCESSIBLE_LOCALES) {
        expect(panel.byLocale[locale].conciseAltCharCount).toBeLessThanOrEqual(DEFAULT_CONCISE_ALT_TARGET_CHARS);
      }
    }
  });

  it("T07: locales 옵션으로 일부 로케일만 지정하고 중복 로케일 입력을 정규화한다", () => {
    const compiled = compileAccessibleEpisodeDescriptions(createSampleEpisode(), { locales: ["ko-KR", "en-US", "ko-KR"] });
    expect(compiled.locales).toEqual(["ko-KR", "en-US"]);
  });

  it("T08: 연속 컷 동일 배경 시 Anti-Redundancy Delta가 배경 반복을 생략한다", () => {
    const compiled = compileAccessibleEpisodeDescriptions(createSampleEpisode());
    expect(compiled.antiRedundancySkippedSettingsCount).toBe(1);
    expect(compiled.panels[1].byLocale["ko-KR"].reusedPreviousSetting).toBe(true);
    expect(compiled.panels[1].byLocale["ko-KR"].conciseAlt).not.toContain("비 내리는 학교 옥상");
    expect(compiled.panels[1].byLocale["en-US"].conciseAlt).not.toContain("rain-soaked school rooftop");
    expect(compiled.panels[1].byLocale["ja-JP"].conciseAlt).not.toContain("雨の降る学校の屋上");
    expect(compiled.panels[2].byLocale["ko-KR"].reusedPreviousSetting).toBe(false);
  });

  it("T09: 연속 컷에서 동일 인물이 같은 위치에 머물면 위치 반복을 생략하고 이동하면 다시 서술한다", () => {
    const ep = createSampleEpisode();
    const p3Moved: AccessiblePanelInput = {
      ...ep.panels[1], panelId: "p-03-moved", panelIndex: 3,
      characters: [{ ...ep.panels[1].characters[0], horizontalPosition: "right" }],
    };
    const compiled = compileAccessibleEpisodeDescriptions({ ...ep, panels: [ep.panels[0], ep.panels[1], p3Moved] });
    expect(compiled.panels[1].byLocale["ko-KR"].reusedCharacterIds).toEqual(["char-seoyeon"]);
    expect(compiled.panels[1].byLocale["ko-KR"].conciseAlt).not.toContain("왼쪽 서연");
    expect(compiled.panels[2].byLocale["ko-KR"].reusedCharacterIds).toEqual([]);
    expect(compiled.panels[2].byLocale["ko-KR"].conciseAlt).toContain("오른쪽 서연");
  });

  it("T10: 동일 배경이지만 조명이 바뀐 연속 컷은 배경은 생략하고 조명 전환만 알린다", () => {
    const ep = createSampleEpisode();
    const compiled = compileAccessibleEpisodeDescriptions({
      ...ep, panels: [ep.panels[0], { ...ep.panels[1], lightingMood: "dramatic-backlit" }],
    });
    expect(compiled.panels[1].byLocale["ko-KR"].reusedPreviousSetting).toBe(true);
    expect(compiled.panels[1].byLocale["ko-KR"].conciseAlt).toContain("강한 역광으로 바뀐 클로즈업");
    expect(compiled.panels[1].byLocale["en-US"].conciseAlt).toContain("shifting to dramatic backlighting");
  });

  it("T11: enableAntiRedundancyDelta가 false이면 연속 컷에도 배경과 위치를 모두 다시 서술한다", () => {
    const compiled = compileAccessibleEpisodeDescriptions(createSampleEpisode(), { enableAntiRedundancyDelta: false });
    expect(compiled.antiRedundancySkippedSettingsCount).toBe(0);
    expect(compiled.panels[1].byLocale["ko-KR"].reusedPreviousSetting).toBe(false);
    expect(compiled.panels[1].byLocale["ko-KR"].conciseAlt).toContain("비 내리는 학교 옥상");
    expect(compiled.panels[1].byLocale["ko-KR"].conciseAlt).toContain("왼쪽 서연");
  });

  it("T12: 비순차 입력 대사를 order 오름차순으로 정렬해 누락 없이 직렬화한다", () => {
    const p1Ko = compileAccessibleEpisodeDescriptions(createSampleEpisode()).panels[0].byLocale["ko-KR"];
    const dlgNodes = p1Ko.ariaReadingNodes.filter((n) => n.kind === "dialogue-line");
    expect(dlgNodes.map((n) => n.sourceRefId)).toEqual(["dlg-01-a", "dlg-01-b"]);
    const firstPos = p1Ko.extendedLongdesc.indexOf("서연아, 당장 내려와!");
    const secondPos = p1Ko.extendedLongdesc.indexOf("조용히 해, 아직 저쪽에 있어.");
    expect(firstPos).toBeGreaterThan(-1);
    expect(secondPos).toBeGreaterThan(firstPos);
  });

  it("T13: ARIA 대사 노드에 화자 ID와 전달 스타일 메타데이터가 보존된다", () => {
    const dlgNodes = compileAccessibleEpisodeDescriptions(createSampleEpisode()).panels[0].byLocale["ko-KR"]
      .ariaReadingNodes.filter((n) => n.kind === "dialogue-line");
    expect(dlgNodes[0].speakerId).toBe("char-minsu");
    expect(dlgNodes[0].deliveryStyle).toBe("shout");
    expect(dlgNodes[1].speakerId).toBe("char-seoyeon");
    expect(dlgNodes[1].deliveryStyle).toBe("whisper");
  });

  it("T14: 대사가 많은 컷에서 conciseAlt가 축약되더라도 extendedLongdesc와 ARIA 노드에는 누락 0건이다", () => {
    const manyDialogues = [1, 2, 3, 4, 5, 6].map((n) => ({
      dialogueId: `many-${String(n)}`, order: n, speakerId: `sp-${String(n)}`, speakerName: `인물${String(n)}`,
      deliveryStyle: "normal" as const, text: `아주 길고 구체적인 중요 대사 문장 번호 ${String(n)}번입니다.`,
    }));
    const ep = mkMinimalEpisode("ep-many-dlg", [{
      panelId: "p-dense", panelIndex: 1, shotScale: "medium-shot",
      settingKo: "회의실", settingEn: "meeting room", settingJa: "会議室",
      lightingMood: "bright-daylight", characters: [], dialogues: manyDialogues, sfxItems: [],
    }]);
    const compiled = compileAccessibleEpisodeDescriptions(ep);
    const ko = compiled.panels[0].byLocale["ko-KR"];
    expect(ko.conciseAltCharCount).toBeLessThanOrEqual(DEFAULT_CONCISE_ALT_TARGET_CHARS);
    expect(ko.transcribedDialogueIds.length).toBe(6);
    for (const dlg of manyDialogues) expect(ko.extendedLongdesc).toContain(dlg.text);
    const audit = auditEpisodeAccessibilityCompliance(ep, compiled);
    expect(audit.dialogueTranscriptionCoveragePercent).toBe(100);
    expect(audit.blockerCount).toBe(0);
  });

  it("T15: 의성어·의태어 효과음을 단순 문자가 아닌 청각 의미 해설로 3개국어 전사한다", () => {
    const p2 = compileAccessibleEpisodeDescriptions(createSampleEpisode()).panels[1].byLocale;
    expect(p2["ko-KR"].extendedLongdesc).toContain("효과음 무전기 잡음이 튀는 소리(치지직)");
    expect(p2["en-US"].extendedLongdesc).toContain("SFX: radio static crackling (치지직)");
    expect(p2["ja-JP"].extendedLongdesc).toContain("効果音: 無線機のノイズが走る音（치지직）");
    expect(p2["ko-KR"].explainedSfxIds).toEqual(["sfx-02"]);
  });

  it("T16: 시각 글리프가 비어 있어도 청각 의미가 있으면 효과음 해설 노드가 정상 생성된다", () => {
    const ep = mkMinimalEpisode("ep-sfx-meaning-only", [{
      panelId: "p-1", panelIndex: 1, shotScale: "closeup",
      settingKo: "어두운 방", settingEn: "dark room", settingJa: "暗い部屋",
      lightingMood: "dim-interior", characters: [], dialogues: [],
      sfxItems: [{
        sfxId: "sfx-only-meaning", visualGlyph: "",
        semanticMeaning: "멀리서 울리는 사이렌 소리", semanticMeaningEn: "distant siren wailing",
        semanticMeaningJa: "遠くで鳴るサイレンの音",
      }],
    }]);
    const ko = compileAccessibleEpisodeDescriptions(ep).panels[0].byLocale["ko-KR"];
    expect(ko.explainedSfxIds).toEqual(["sfx-only-meaning"]);
    expect(ko.extendedLongdesc).toContain("효과음 멀리서 울리는 사이렌 소리");
  });

  it("T17: 한국어 스크린리더 중복 접두사('이미지:', '사진:', '웹툰 컷 그림:')를 자동 제거한다", () => {
    expect(detectRedundantAltPrefix("이미지: 창밖을 보는 소녀")).toBe("이미지:");
    expect(detectRedundantAltPrefix("웹툰 컷 그림 - 교실 앞문")).toBe("웹툰 컷 그림 -");
    const stripped = stripRedundantAltPrefixes("사진: 비 오는 버스 정류장");
    expect(stripped.cleaned).toBe("비 오는 버스 정류장");
    expect(stripped.strippedPrefix).toBe("사진:");
  });

  it("T18: 영어·일본어 스크린리더 중복 접두사('Picture of', '画像:')를 자동 제거한다", () => {
    const en = stripRedundantAltPrefixes("Picture of a runner crossing the finish line");
    expect(en.cleaned).toBe("a runner crossing the finish line");
    expect(en.strippedPrefix).not.toBeNull();
    const ja = stripRedundantAltPrefixes("画像: 夕焼けのホームで待つ少年");
    expect(ja.cleaned).toBe("夕焼けのホームで待つ少年");
    expect(ja.strippedPrefix).toBe("画像:");
  });

  it("T19: 다중 중첩된 중복 접두사를 반복 정리한다", () => {
    expect(stripRedundantAltPrefixes("이미지: 사진: 붉은 우산을 쓴 행인").cleaned).toBe("붉은 우산을 쓴 행인");
  });

  it("T20: '그림자'처럼 일반 명사로 시작하는 한국어 문장은 중복 접두사로 오탐하지 않는다", () => {
    expect(detectRedundantAltPrefix("그림자가 길게 드리운 복도에서 두 사람이 마주 선다")).toBeNull();
    const res = stripRedundantAltPrefixes("그림자가 길게 드리운 복도");
    expect(res.cleaned).toBe("그림자가 길게 드리운 복도");
    expect(res.strippedPrefix).toBeNull();
  });

  it("T21: 정상 에피소드는 KWCAG 2.2 · WCAG 2.2 AA · EAA 적합(pass)과 100% 커버리지를 받는다", () => {
    const ep = createSampleEpisode();
    const report = auditEpisodeAccessibilityCompliance(ep, compileAccessibleEpisodeDescriptions(ep));
    expect(report.verdict).toBe("pass");
    expect(report.readyForRelease).toBe(true);
    expect(report.kwcag22Compliant).toBe(true);
    expect(report.wcag22AaCompliant).toBe(true);
    expect(report.eaaCompliant).toBe(true);
    expect(report.blockerCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.altCoveragePercent).toBe(100);
    expect(report.dialogueTranscriptionCoveragePercent).toBe(100);
    expect(report.sfxSemanticCoveragePercent).toBe(100);
  });

  it("T22: 결함 1(missing-panel-alt, blocker) — 공백 수동 Alt 또는 메타 없는 빈 컷을 fail-closed 차단한다", () => {
    const ep = createSampleEpisode();
    const broken: AccessibleEpisodeInput = {
      ...ep,
      panels: [
        { ...ep.panels[0], manualAltOverride: "   " },
        {
          panelId: "p-empty", panelIndex: 2, shotScale: "medium-shot",
          settingKo: "", settingEn: "", settingJa: "", lightingMood: "",
          characters: [], dialogues: [], sfxItems: [],
        },
      ],
    };
    const report = auditEpisodeAccessibilityCompliance(
      broken, compileAccessibleEpisodeDescriptions(broken, { locales: ["ko-KR"] }), { locales: ["ko-KR"] },
    );
    expect(report.verdict).toBe("fail-closed");
    expect(report.readyForRelease).toBe(false);
    expect(report.defectCountsByCode["missing-panel-alt"]).toBe(2);
    expect(report.defects.every((d) => d.severity === "blocker")).toBe(true);
  });

  it("T23: 결함 2(untranscribed-dialogue, blocker) — 컴파일 누락 대사를 fail-closed 탐지한다", () => {
    const ep = createSampleEpisode();
    const compiled = compileAccessibleEpisodeDescriptions(ep, { locales: ["ko-KR"] });
    const orig = compiled.panels[0].byLocale["ko-KR"];
    const tampered: CompiledAccessibleEpisode = {
      ...compiled,
      panels: [
        {
          ...compiled.panels[0],
          byLocale: {
            ...compiled.panels[0].byLocale,
            "ko-KR": {
              ...orig,
              extendedLongdesc: orig.extendedLongdesc.replace("조용히 해, 아직 저쪽에 있어.", ""),
              ariaReadingNodes: orig.ariaReadingNodes.filter((n) => n.sourceRefId !== "dlg-01-b"),
            },
          },
        },
        ...compiled.panels.slice(1),
      ],
    };
    const report = auditEpisodeAccessibilityCompliance(ep, tampered, { locales: ["ko-KR"] });
    expect(report.verdict).toBe("fail-closed");
    expect(report.defectCountsByCode["untranscribed-dialogue"]).toBe(1);
    expect(report.dialogueTranscriptionCoveragePercent).toBeLessThan(100);
  });

  it("T24: 결함 3(unexplained-visual-sfx, warning) — 의미 설명이 비어 있는 효과음을 경고로 탐지한다", () => {
    const ep = createSampleEpisode();
    const withUnexplained: AccessibleEpisodeInput = {
      ...ep,
      panels: [{ ...ep.panels[0], sfxItems: [{ sfxId: "sfx-raw", visualGlyph: "두둥!", semanticMeaning: "   " }] }],
    };
    const report = auditEpisodeAccessibilityCompliance(
      withUnexplained,
      compileAccessibleEpisodeDescriptions(withUnexplained, { locales: ["ko-KR"] }),
      { locales: ["ko-KR"] },
    );
    expect(report.verdict).toBe("pass-with-warnings");
    expect(report.readyForRelease).toBe(true);
    expect(report.defectCountsByCode["unexplained-visual-sfx"]).toBe(1);
    expect(report.sfxSemanticCoveragePercent).toBe(0);
  });

  it("T25: 결함 4(redundant-alt-prefix, warning) — 중복 접두사 제거 비활성 시 접두사 위반을 경고한다", () => {
    const ep = createSampleEpisode();
    const prefixed: AccessibleEpisodeInput = {
      ...ep,
      panels: [{
        ...ep.panels[0],
        manualAltOverride: {
          "ko-KR": "이미지: 비 오는 옥상에서 두 사람이 마주 선다",
          "en-US": "Picture of two students standing on a rainy rooftop",
          "ja-JP": "画像: 雨の屋上で向き合う二人",
        },
      }],
    };
    const report = auditEpisodeAccessibilityCompliance(
      prefixed, compileAccessibleEpisodeDescriptions(prefixed, { stripRedundantAltPrefix: false }),
    );
    expect(report.verdict).toBe("pass-with-warnings");
    expect(report.defectCountsByCode["redundant-alt-prefix"]).toBe(3);
  });

  it("T26: 결함 5(alt-length-bloat, warning) — 260자 초과 과장된 간결 Alt-Text를 경고로 탐지한다", () => {
    const ep = createSampleEpisode();
    const longAlt = "비 오는 옥상 장면 상세 묘사가 끝나지 않고 계속 이어집니다. ".repeat(12);
    expect(longAlt.length).toBeGreaterThan(DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS);
    const bloated: AccessibleEpisodeInput = { ...ep, panels: [{ ...ep.panels[0], manualAltOverride: longAlt }] };
    const report = auditEpisodeAccessibilityCompliance(
      bloated, compileAccessibleEpisodeDescriptions(bloated, { locales: ["ko-KR"] }), { locales: ["ko-KR"] },
    );
    expect(report.verdict).toBe("pass-with-warnings");
    expect(report.defectCountsByCode["alt-length-bloat"]).toBe(1);
    expect(report.maxConciseAltChars).toBeGreaterThan(DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS);
  });

  it("T27: 결함 6a(reading-order-gap-or-duplicate, blocker) — ARIA 노드 읽기 순서 중복·역전을 차단한다", () => {
    const ep = createSampleEpisode();
    const compiled = compileAccessibleEpisodeDescriptions(ep, { locales: ["ko-KR"] });
    const orig = compiled.panels[0].byLocale["ko-KR"];
    const tampered: CompiledAccessibleEpisode = {
      ...compiled,
      panels: [
        {
          ...compiled.panels[0],
          byLocale: {
            ...compiled.panels[0].byLocale,
            "ko-KR": {
              ...orig,
              ariaReadingNodes: orig.ariaReadingNodes.map((n, idx) => (idx === 1 ? { ...n, readingOrder: 1 } : n)),
            },
          },
        },
        ...compiled.panels.slice(1),
      ],
    };
    const report = auditEpisodeAccessibilityCompliance(ep, tampered, { locales: ["ko-KR"] });
    expect(report.verdict).toBe("fail-closed");
    expect(report.defectCountsByCode["reading-order-gap-or-duplicate"]).toBeGreaterThanOrEqual(1);
    expect(report.panelMetrics[0].hasReadingOrderDefect).toBe(true);
  });

  it("T28: 결함 6b(reading-order-gap-or-duplicate, blocker) — 소스 컷 순번 공백 및 대사 order 중복을 차단한다", () => {
    const ep = createSampleEpisode();
    const brokenOrderEp: AccessibleEpisodeInput = {
      ...ep,
      panels: [
        {
          ...ep.panels[0],
          dialogues: [{ ...ep.panels[0].dialogues[0], order: 1 }, { ...ep.panels[0].dialogues[1], order: 1 }],
        },
        { ...ep.panels[1], panelIndex: 4 },
      ],
    };
    const report = auditEpisodeAccessibilityCompliance(
      brokenOrderEp, compileAccessibleEpisodeDescriptions(brokenOrderEp, { locales: ["ko-KR"] }), { locales: ["ko-KR"] },
    );
    expect(report.verdict).toBe("fail-closed");
    expect(report.defectCountsByCode["reading-order-gap-or-duplicate"]).toBeGreaterThanOrEqual(2);
  });

  it("T29: 점자·TTS 대본 익스포터가 한/영/일 순수 텍스트 대본을 HTML 없이 생성한다", () => {
    const compiled = compileAccessibleEpisodeDescriptions(createSampleEpisode());
    const koScript = exportScreenReaderTranscriptText(compiled, { locale: "ko-KR" });
    const enScript = exportScreenReaderTranscriptText(compiled, { locale: "en-US" });
    const jaScript = exportScreenReaderTranscriptText(compiled, { locale: "ja-JP" });
    expect(koScript).toContain("[비 오는 옥상의 기억] 1화. 끊어진 신호");
    expect(koScript).toContain("컷 1.");
    expect(koScript).toContain('민수(외침): "서연아, 당장 내려와!"');
    expect(koScript).not.toMatch(/<[a-z][^>]*>/i);
    expect(enScript).toContain("[Memories on the Rainy Rooftop] Ep 1. Broken Signal");
    expect(enScript).toContain("SFX: heavy iron door slamming shut");
    expect(jaScript).toContain("[雨の屋上の記憶] 第1話 途切れた信号");
    expect(jaScript).toContain("ミンス（叫び）「ソヨン、今すぐ降りて！」");
  });

  it("T30: brailleSafeAsciiPunctuation 옵션이 일본어 괄호·특수 인용부호를 ASCII로 정규화한다", () => {
    const jaBraille = exportScreenReaderTranscriptText(compileAccessibleEpisodeDescriptions(createSampleEpisode()), {
      locale: "ja-JP", brailleSafeAsciiPunctuation: true,
    });
    expect(jaBraille).not.toContain("「");
    expect(jaBraille).not.toContain("（");
    expect(jaBraille).toContain('ミンス(叫び)"ソヨン、今すぐ降りて！"');
  });

  it("T31: 대본 익스포터의 헤더·효과음·장면 노트 토글 옵션이 정확히 동작한다", () => {
    const dialogueOnly = exportScreenReaderTranscriptText(compileAccessibleEpisodeDescriptions(createSampleEpisode()), {
      locale: "ko-KR", includePanelHeaders: false, includeSfxCues: false, includeShotNotes: false,
    });
    expect(dialogueOnly).not.toContain("컷 1.");
    expect(dialogueOnly).not.toContain("효과음 철문이 강하게 닫히는 굉음");
    expect(dialogueOnly).toContain('민수(외침): "서연아, 당장 내려와!"');
  });

  it("T32: 빈 컷 배열 에피소드에서도 컴파일·감사·대본·SVG가 NaN/예외 없이 안전하게 동작한다", () => {
    const emptyEp = mkMinimalEpisode("ep-empty", []);
    const compiled = compileAccessibleEpisodeDescriptions(emptyEp);
    const report = auditEpisodeAccessibilityCompliance(emptyEp, compiled);
    const svg = renderAccessibilityComplianceSvg(report);
    expect(compiled.totalPanelCount).toBe(0);
    expect(compiled.accessibilityManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(report.altCoveragePercent).toBe(100);
    expect(Number.isNaN(report.averageConciseAltChars)).toBe(false);
    expect(exportScreenReaderTranscriptText(compiled)).toContain("등록된 컷이 없습니다.");
    expect(svg).toContain("표시할 컷 데이터가 없습니다.");
    expect(svg).not.toContain("NaN");
  });

  it("T33: 로케일별 수동 Alt 덮어쓰기와 탭/줄바꿈/연속 공백 입력을 깔끔하게 정규화한다", () => {
    const ep = createSampleEpisode();
    const compiled = compileAccessibleEpisodeDescriptions({
      ...ep, panels: [{ ...ep.panels[0], manualAltOverride: { "ko-KR": "  이미지:\t옥상 철조망\n앞에 선   서연  " } }],
    });
    expect(compiled.panels[0].byLocale["ko-KR"].usedManualAltOverride).toBe(true);
    expect(compiled.panels[0].byLocale["ko-KR"].strippedRedundantPrefix).toBe(true);
    expect(compiled.panels[0].byLocale["ko-KR"].conciseAlt).toBe("옥상 철조망 앞에 선 서연");
    expect(compiled.panels[0].byLocale["en-US"].usedManualAltOverride).toBe(false);
  });

  it("T34: 순수 OKLCH SVG는 원시 hex/rgb/hsl 색상이 0건이며 게이지·커버리지·타임라인·배지를 포함한다", () => {
    const ep = createSampleEpisode();
    const svg = renderAccessibilityComplianceSvg(
      auditEpisodeAccessibilityCompliance(ep, compileAccessibleEpisodeDescriptions(ep)),
    );
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).toContain('id="panel-alt-length-gauge"');
    expect(svg).toContain('id="panel-coverage-metrics"');
    expect(svg).toContain('id="panel-aria-reading-timeline"');
    expect(svg).toContain("KWCAG 2.2 · WCAG 2.2 AA · EAA 적합");
  });

  it("T35: SVG 렌더러와 escapeAccessibilityXml은 XSS/XML 특수문자를 완전히 이스케이프한다", () => {
    expect(escapeAccessibilityXml(`<script>"a"&'b'</script>`)).toBe(
      "&lt;script&gt;&quot;a&quot;&amp;&apos;b&apos;&lt;/script&gt;",
    );
    const ep = createSampleEpisode();
    const xssEp: AccessibleEpisodeInput = { ...ep, episodeTitleKo: `1화 <script>alert("xss")</script> & "test"` };
    const report = auditEpisodeAccessibilityCompliance(xssEp, compileAccessibleEpisodeDescriptions(xssEp));
    const svg = renderAccessibilityComplianceSvg(report, { titleOverrideKo: `<img src=x onerror="alert(1)"> & '제목'` });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("T36: 한국어 접근성 QA 브리프는 번역투 없이 판정·지표·결함 목록을 정확히 보고한다", () => {
    const ep = createSampleEpisode();
    const passBrief = summarizeAccessibilityAuditKo(
      auditEpisodeAccessibilityCompliance(ep, compileAccessibleEpisodeDescriptions(ep)),
      { inspectedDateIso: "2026-11-28" },
    );
    expect(passBrief).toContain("출고 가능 (KWCAG 2.2 · WCAG 2.2 AA · EAA 충족)");
    expect(passBrief).toContain("2026-11-28");
    expect(passBrief).toContain("출고 차단 및 주의 결함 없음");
    expect(passBrief).not.toContain("하는 것을 가능하게");
    expect(passBrief).not.toContain("원활한 워크플로우");

    const failedEp: AccessibleEpisodeInput = { ...ep, panels: [{ ...ep.panels[0], manualAltOverride: "" }] };
    const failedBrief = summarizeAccessibilityAuditKo(
      auditEpisodeAccessibilityCompliance(
        failedEp, compileAccessibleEpisodeDescriptions(failedEp, { locales: ["ko-KR"] }), { locales: ["ko-KR"] },
      ),
    );
    expect(failedBrief).toContain("출고 차단 (Fail-Closed");
    expect(failedBrief).toContain("[차단] (missing-panel-alt)");
  });

  it("T37: 순수 ES2017 동기 FIPS 180-4 SHA-256이 NIST 공식 테스트 벡터와 일치한다", () => {
    expect(sha256AccessibleAltHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256AccessibleAltHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256AccessibleAltHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("T38: 동일 입력 반복 컴파일 시 accessibilityManifestSha256Hex가 비트-동일하다", () => {
    const a = compileAccessibleEpisodeDescriptions(createSampleEpisode());
    const b = compileAccessibleEpisodeDescriptions(createSampleEpisode());
    expect(a.accessibilityManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(a.accessibilityManifestSha256Hex).toBe(b.accessibilityManifestSha256Hex);
  });

  it("T39: 대사 1글자만 바뀌어도 accessibilityManifestSha256Hex가 즉시 변경된다", () => {
    const epA = createSampleEpisode();
    const epB: AccessibleEpisodeInput = {
      ...epA,
      panels: [
        {
          ...epA.panels[0],
          dialogues: [epA.panels[0].dialogues[0], { ...epA.panels[0].dialogues[1], text: "서연아, 당장 내려와!!" }],
        },
        ...epA.panels.slice(1),
      ],
    };
    expect(compileAccessibleEpisodeDescriptions(epA).accessibilityManifestSha256Hex).not.toBe(
      compileAccessibleEpisodeDescriptions(epB).accessibilityManifestSha256Hex,
    );
  });
});
