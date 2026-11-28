import type { OpenAiAssistStructuredResult } from "@toonstudio/contracts/studio-openai-assist-result";

const exportSeverity = { pass: "통과", tip: "참고", fix: "수정" } as const;
const continuitySeverity = { critical: "필수 수정", warn: "주의", tip: "제안" } as const;

export function summarizeFreeAiEditorialReview(result: OpenAiAssistStructuredResult, isCloudReview: boolean) {
  switch (result.mode) {
    case "idea-remix":
      return {
        headlineKo: result.data.summary,
        bulletsKo: result.data.angles.map(({ lensLabelKo, headline, pitch, firstCutHint }) =>
          `[${lensLabelKo}] ${headline} — ${pitch} · 첫 컷: ${firstCutHint}`),
      };
    case "export-preflight-coach": {
      const { readinessSummary, episodeBlurbSuggestion, checks } = result.data;
      return {
        headlineKo: readinessSummary || "마감·소개글 점검 결과",
        bulletsKo: [
          ...(episodeBlurbSuggestion ? [`회차 소개 · ${episodeBlurbSuggestion}`] : []),
          ...checks.map(({ category, severity, detail }) => `[${exportSeverity[severity]}] ${category} — ${detail}`),
        ],
      };
    }
    case "character-bible-forge": {
      const data = result.data;
      return {
        headlineKo: data.characterName,
        bulletsKo: [
          `인물 유형 · ${data.archetypeKo}`, `말투 · ${data.speechTone}`, `외형과 색상 · ${data.appearancePalette}`,
          `행동 동기 · ${data.coreMotivation}`, ...data.forbiddenLines.map(line => `금기 대사 · ${line}`),
          ...data.relationshipHooks.map(({ target, dynamic }) => `인물 관계 · ${target} — ${dynamic}`),
          `작화 일관성 · ${data.visualConsistencyCue}`,
        ],
      };
    }
    case "continuity-plot-audit": {
      const { summary, overallConsistencyScore, issues } = result.data;
      return {
        headlineKo: summary,
        bulletsKo: [
          ...(isCloudReview ? [`일관성 ${overallConsistencyScore}/100`] : []),
          ...issues.map(({ severity, category, locationHint, conflictDetail, fixSuggestion }) =>
            `[${continuitySeverity[severity]}] ${category} · ${locationHint} — ${conflictDetail} · 수정안 · ${fixSuggestion}`),
        ],
      };
    }
    case "color-mood-director": {
      const { emotionLabel, moodSummary, palette, lightingGuide, contrastWarning } = result.data;
      return {
        headlineKo: moodSummary,
        bulletsKo: [
          ...palette.map(({ role, nameKo, oklch, usageTip }) => `[${role}] ${nameKo} · ${oklch} — ${usageTip}`),
          `장면 감정 · ${emotionLabel}`, `조명 · ${lightingGuide}`, `대비 · ${contrastWarning}`,
        ],
      };
    }
    case "scroll-pacing-auditor": {
      const { rhythmVerdict, averageGapPx, beatPacing, cliffhangerScore, cliffhangerTip } = result.data;
      return {
        headlineKo: rhythmVerdict,
        bulletsKo: [
          `구간 평균 ${averageGapPx}px`,
          ...beatPacing.map(({ section, pacing, recommendedGapPx, readerRetentionNote }) =>
            `${section} · ${recommendedGapPx}px — ${readerRetentionNote} · ${pacing}`),
          isCloudReview && cliffhangerScore !== null
            ? `엔딩 흡인력 AI 추정 ${cliffhangerScore}/100 · ${cliffhangerTip}`
            : `엔딩 점수 미평가 · ${cliffhangerTip}`,
        ],
      };
    }
    case "localization-glossary-check": {
      const { targetLocales, glossary, culturalNotes } = result.data;
      return {
        headlineKo: `다국어 번역 용어집 · 대상 언어 ${targetLocales.join(", ")}`,
        bulletsKo: [
          ...glossary.map(({ termKo, en, ja, ruleNote }) =>
            `${termKo} · EN: ${en} · JA: ${ja} — ${ruleNote}`),
          ...culturalNotes.map(({ severity, topic, adaptationTip }) =>
            `[${severity === "warn" ? "주의" : "참고"}] ${topic} — ${adaptationTip}`),
        ],
      };
    }
    default:
      return undefined;
  }
}
