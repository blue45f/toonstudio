import { PITCH_BIBLE_SCHEMA_VERSION, PITCH_DATA_SOURCE_KIND, ESTIMATE_DISCLAIMER_KO, ESTIMATE_DISCLAIMER_EN, auditPitchBibleReadiness, formatEstimateRangeLabel, type PitchBibleDeck, type PitchBibleReadinessAudit, type PitchExportOptions } from "./global-ip-pitch-engine";
import { assertPitchExport } from "./pitch-input-contract";

export function exportPitchBibleMarkdown(deck: PitchBibleDeck, auditInput?: PitchBibleReadinessAudit, options?: PitchExportOptions): string {
  assertPitchExport(deck, auditInput);
  const audit = auditInput ?? auditPitchBibleReadiness(deck);
  const isEn = options?.locale === "en";
  const { input, loglineValidation, seasonTotals } = deck;
  const loc = isEn ? "en" : "ko";
  return [
    `# ${isEn ? input.cover.titleEn : input.cover.titleKo} — ${isEn ? "Global IP Pitch Bible (12 Slides)" : "글로벌 IP 피칭 바이블 (12장)"}`, "",
    `> dataSourceKind: \`${deck.dataSourceKind}\` (${isEn ? "Estimate" : "추정"}) — ${isEn ? deck.estimateDisclaimerEn : deck.estimateDisclaimerKo}`, "",
    `## 01. ${isEn ? "Cover" : "표지"}`,
    `- **${isEn ? "Title" : "작품명"}**: ${input.cover.titleKo} / ${input.cover.titleEn}`,
    `- **${isEn ? "Tagline" : "태그라인"}**: ${input.cover.taglineKo}`,
    `- **${isEn ? "Genre & Format" : "장르·포맷"}**: ${input.cover.genreBadgeKo} | ${input.cover.formatTargetKo}`,
    `- **${isEn ? "Studio & Status" : "스튜디오·현황"}**: ${input.cover.studioName} (${input.cover.serializationStatusKo})`,
    `- **${isEn ? "Version" : "버전"}**: ${input.cover.versionLabel} (${input.cover.updatedDateIso})`, "",
    `## 02. ${isEn ? "Logline (25-45 Char Check)" : "로그라인 (25~45자 검증)"}`,
    `- **${isEn ? "Logline" : "핵심 로그라인"}**: ${input.logline.loglineKo}`,
    `- **${isEn ? "Length Audit" : "글자수 검증"}**: ${loglineValidation.charCount}${isEn ? " chars" : "자"} (${isEn ? loglineValidation.messageEn : loglineValidation.messageKo})`,
    `- **${isEn ? "High-Concept Hook" : "하이컨셉 후크"}**: ${input.logline.highConceptHookKo}`, "",
    `## 03. ${isEn ? "Creative Intent" : "기획 의도"}`,
    `- **${isEn ? "Origin" : "창작 출발점"}**: ${input.creativeIntent.originMotifKo}`,
    `- **${isEn ? "Universal Theme" : "글로벌 보편 정서"}**: ${input.creativeIntent.universalThemeKo}`,
    `- **${isEn ? "Timeliness" : "시의성"}**: ${input.creativeIntent.globalTimelinessKo}`,
    `- **${isEn ? "Director Promise" : "연출 약속"}**: ${input.creativeIntent.directorPromiseKo}`, "",
    `## 04. ${isEn ? "World Rules" : "세계관 규칙"}`,
    `- **${isEn ? "Setting" : "공간·시대 배경"}**: ${input.worldRules.settingSummaryKo}`,
    `- **${isEn ? "Conflict Engine" : "갈등 메커니즘"}**: ${input.worldRules.conflictMechanismKo}`,
    ...input.worldRules.rules.map((r, idx) => `- **${idx + 1}. ${r.titleKo}**: ${r.ruleKo} _(${isEn ? "Cost" : "대가"}: ${r.costLimitKo})_`), "",
    `## 05. ${isEn ? "4 Core Characters" : "핵심 캐릭터 4인"}`,
    `| ${isEn ? "Name" : "이름"} | ${isEn ? "Role" : "역할"} | ${isEn ? "Desire" : "핵심 욕망"} | ${isEn ? "Flaw" : "치명적 결함"} | ${isEn ? "Season 1 Arc" : "시즌 1 변화 아크"} |`,
    "| --- | --- | --- | --- | --- |",
    ...input.coreCharacters.map((c) => `| ${c.nameKo} | ${c.roleKo} | ${c.desireKo} | ${c.fatalFlawKo} | ${c.seasonArcKo} |`), "",
    `## 06. ${isEn ? "Season 1 Arc (12 Episodes / 60 Chapters)" : "시즌 1 에피소드 아크 (12부작 / 60화)"}`,
    `- **${isEn ? "Season Title" : "시즌 부제"}**: ${input.seasonArc.seasonTitleKo} (${seasonTotals.totalEpisodes}${isEn ? " ep" : "부작"} / ${seasonTotals.totalChapters}${isEn ? " ch" : "화"})`,
    `- **${isEn ? "Mapping" : "변환 구조"}**: ${input.seasonArc.formatNoteKo}`,
    `| ${isEn ? "Act" : "막"} | ${isEn ? "Episodes" : "부작"} | ${isEn ? "Chapters" : "웹툰 화수"} | ${isEn ? "Summary" : "핵심 사건"} | ${isEn ? "Cliffhanger" : "클리프행어"} |`,
    "| --- | --- | --- | --- | --- |",
    ...input.seasonArc.blocks.map((b) => `| ${b.actLabelKo} | ${b.episodeRangeLabel} (${b.episodeCount}) | ${b.chapterStart}~${b.chapterEnd}화 | ${b.summaryKo} | ${b.cliffhangerKo} |`),
    `- **${isEn ? "Season 2 Hook" : "시즌 2 확장 훅"}**: ${input.seasonArc.season2HookKo}`, "",
    `## 07. ${isEn ? "Visual Tone & Manner" : "비주얼 톤앤매너"}`,
    `- **${isEn ? "Art Style" : "작화 스타일"}**: ${input.visualTone.artStyleKo}`,
    `- **${isEn ? "Lighting" : "조명·명암 기조"}**: ${input.visualTone.lightingMoodKo}`,
    `- **${isEn ? "Camera Grammar" : "카메라 연출"}**: ${input.visualTone.cameraGrammarKo}`,
    `- **OKLCH Palette**: ${input.visualTone.paletteNotes.map((p) => `${p.roleKo} \`${p.oklchSpec}\` (${p.usageKo})`).join(" / ")}`, "",
    `## 08. ${isEn ? "Target Audience & OTT Positioning [Estimate]" : "타깃 독자·OTT 포지셔닝 [추정]"}`,
    `- **${isEn ? "Primary Audience" : "코어 타깃"}**: ${input.targetPositioning.primaryAudienceKo}`,
    `- **${isEn ? "Secondary Audience" : "확장 타깃"}**: ${input.targetPositioning.secondaryAudienceKo}`,
    `- **OTT/Platforms**: ${input.targetPositioning.ottChannels.join(", ")}`,
    `- **${isEn ? "Publishing Markets" : "출판 권역"}**: ${input.targetPositioning.publishingMarkets.join(", ")}`,
    `- **${isEn ? "Estimated Pool" : "타깃 풀 범위 [추정]"}**: ${formatEstimateRangeLabel(input.targetPositioning.addressableRangeEstimate, loc)} — ${isEn ? input.targetPositioning.addressableRangeEstimate.assumptionEn : input.targetPositioning.addressableRangeEstimate.assumptionKo}`, "",
    `## 09. ${isEn ? "Comparable Positioning" : "유사 흥행 비교 구도"}`,
    `- **${isEn ? "Formula" : "비교 공식"}**: ${input.compPositioning.positioningFormulaKo}`,
    `| ${isEn ? "Reference Axis" : "레퍼런스 축"} | ${isEn ? "Medium" : "매체"} | ${isEn ? "Shared DNA" : "공통 문법"} | ${isEn ? "Differentiation" : "차별화 포인트"} |`,
    "| --- | --- | --- | --- |",
    ...input.compPositioning.entries.map((e) => `| ${e.referenceTitleKo} | ${e.mediumKo} | ${e.sharedAxisKo} | ${e.differentiationKo} |`), "",
    `## 10. ${isEn ? "Secondary Rights Expansion Map [Estimate]" : "2차 판권 확장 맵 (단행본·굿즈·애니·게임) [추정]"}`,
    `- **${isEn ? "Expansion Thesis" : "확장 전략"}**: ${input.secondaryRights.expansionThesisKo}`,
    `| ${isEn ? "Track" : "판권 축"} | ${isEn ? "Window" : "전개 시점"} | ${isEn ? "Partner" : "권장 파트너"} | ${isEn ? "Deliverable" : "핵심 산출물"} | ${isEn ? "Budget Band [Estimate]" : "추정 예산 범위 [추정]"} |`,
    "| --- | --- | --- | --- | --- |",
    ...input.secondaryRights.tracks.map((t) => `| ${isEn ? t.labelEn : t.labelKo} | ${t.windowLabelKo} | ${t.partnerTypeKo} | ${t.deliverableKo} | ${formatEstimateRangeLabel(t.budgetRangeEstimate, loc)} |`), "",
    `## 11. ${isEn ? "Production Schedule [Estimate]" : "제작 일정 [추정]"}`,
    `- **${isEn ? "Cadence" : "제작 리듬"}**: ${input.productionSchedule.cadenceSummaryKo}`,
    `- **${isEn ? "Total Budget Band [Estimate]" : "총 제작 예산 범위 [추정]"}**: ${formatEstimateRangeLabel(input.productionSchedule.totalBudgetEstimate, loc)} — ${isEn ? input.productionSchedule.totalBudgetEstimate.assumptionEn : input.productionSchedule.totalBudgetEstimate.assumptionKo}`,
    ...input.productionSchedule.milestones.map((m) => `- **${m.timeframeKo} · ${m.phaseKo}**: ${m.deliverableGateKo} (${m.ownerKo})`), "",
    `## 12. ${isEn ? "Collaboration & Contact" : "협업 문의"}`,
    `- **${isEn ? "Rights Holder" : "권리 보유"}**: ${input.contact.rightsHolderKo}`,
    `- **${isEn ? "Representative" : "담당자"}**: ${input.contact.representativeKo} (${input.contact.contactEmail})`,
    `- **${isEn ? "Available Rights" : "협의 가능 판권"}**: ${input.contact.availableRights.join(", ")}`,
    `- **${isEn ? "Ready Materials" : "열람 가능 자료"}**: ${input.contact.materialsReadyKo}`, "",
    `## ${isEn ? "Readiness Audit Summary [Estimate]" : "피칭 완성도 감사 요약 [추정]"}`,
    `- **${isEn ? "Score" : "완성도 점수"}**: ${audit.score}/100 (${audit.grade}) · dataSourceKind: \`${audit.dataSourceKind}\``,
    `- **${isEn ? "Findings" : "진단 결과"}**: ${isEn ? "Blockers" : "차단"} ${audit.blockerCount} / ${isEn ? "Warnings" : "경고"} ${audit.warningCount} / ${isEn ? "Exaggeration flags" : "과장 감지"} ${audit.exaggerationIssues.length}`,
    ...(audit.issues.length > 0
      ? audit.issues.map((i) => `- [${i.severity.toUpperCase()}] (${i.slideId}) ${isEn ? i.titleEn : i.titleKo} — ${isEn ? i.fixHintEn : i.fixHintKo}`)
      : [`- ${isEn ? "No blocking or exaggeration issues detected." : "누락 및 과장 경고 없이 피칭 준비 기준을 충족합니다."}`]),
  ].join("\n");
}

export function exportPitchBibleJson(deck: PitchBibleDeck, auditInput?: PitchBibleReadinessAudit, options?: PitchExportOptions): string {
  assertPitchExport(deck, auditInput);
  const audit = auditInput ?? auditPitchBibleReadiness(deck);
  return JSON.stringify({
    schemaVersion: PITCH_BIBLE_SCHEMA_VERSION, locale: options?.locale ?? "ko",
    dataSourceKind: PITCH_DATA_SOURCE_KIND, badgeLabelKo: "추정", badgeLabelEn: "Estimate",
    estimateDisclaimerKo: ESTIMATE_DISCLAIMER_KO, estimateDisclaimerEn: ESTIMATE_DISCLAIMER_EN,
    deck, audit,
  }, null, 2);
}
