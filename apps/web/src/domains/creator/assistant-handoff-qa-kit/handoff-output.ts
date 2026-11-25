import { formatKrwAmount, getHandoffStageSpec, type AssistantPayoutInput, type AssistantPayoutEstimate, type StagePayoutLineEstimate, type HandoffBriefContext } from "./assistant-handoff-engine";
import { assertExportSnapshot, MAX_HANDOFF_ALLOCATIONS } from "./handoff-input-contract";

function clampFinite(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** 컷당 단가 × 공정별 담당 컷 수 + 한국 가정 세액 참고 계산 기반 어시스턴트 정산 프리뷰(추정)를 산출한다. */
export function estimateAssistantPayout(input: AssistantPayoutInput): AssistantPayoutEstimate {
  if (input.allocations.length > MAX_HANDOFF_ALLOCATIONS) throw new RangeError("정산 항목 상한은 64개입니다.");
  const includeWithholdingTax = input.includeWithholdingTax ?? true;
  const nationalRate = clampFinite(input.nationalIncomeTaxRatePct ?? 3, 3, 0, 100);
  const localRate = clampFinite(input.localIncomeTaxRatePct ?? 0.3, 0.3, 0, 100 - nationalRate);
  const lines: StagePayoutLineEstimate[] = input.allocations.map((item) => {
    const stage = getHandoffStageSpec(item.stageId);
    const cutCount = Math.round(clampFinite(item.cutCount, 0, 0, 1000));
    const ratePerCutKrw = Math.round(clampFinite(item.ratePerCutKrw, 0, 0, 5_000_000));
    const rushMultiplierPct = Math.round(clampFinite(item.rushMultiplierPct ?? 100, 100, 100, 250));
    const baseSubtotalKrw = cutCount * ratePerCutKrw;
    const rushSurchargeKrw = Math.round(baseSubtotalKrw * ((rushMultiplierPct - 100) / 100));
    const grossAmountKrw = baseSubtotalKrw + rushSurchargeKrw;
    const nationalIncomeTaxKrw = includeWithholdingTax ? Math.round(grossAmountKrw * nationalRate / 100) : 0;
    const localIncomeTaxKrw = includeWithholdingTax ? Math.min(grossAmountKrw - nationalIncomeTaxKrw, Math.round(grossAmountKrw * localRate / 100)) : 0;
    const withholdingTaxKrw = nationalIncomeTaxKrw + localIncomeTaxKrw;
    return {
      stageId: stage.id, labelKo: stage.labelKo, labelEn: stage.labelEn,
      assigneeName: item.assigneeName?.trim() || `${stage.shortLabelKo} 담당`,
      cutCount, ratePerCutKrw, rushMultiplierPct, baseSubtotalKrw, rushSurchargeKrw,
      grossAmountKrw, nationalIncomeTaxKrw, localIncomeTaxKrw, withholdingTaxKrw,
      netPayoutKrw: Math.max(0, grossAmountKrw - withholdingTaxKrw),
    };
  });

  const totalCuts = lines.reduce((s, l) => s + l.cutCount, 0);
  const activeStageCount = lines.filter((l) => l.cutCount > 0 && l.grossAmountKrw > 0).length;
  const totalBaseSubtotalKrw = lines.reduce((s, l) => s + l.baseSubtotalKrw, 0);
  const totalRushSurchargeKrw = lines.reduce((s, l) => s + l.rushSurchargeKrw, 0);
  const totalGrossAmountKrw = lines.reduce((s, l) => s + l.grossAmountKrw, 0);
  const totalNationalIncomeTaxKrw = lines.reduce((s, l) => s + l.nationalIncomeTaxKrw, 0);
  const totalLocalIncomeTaxKrw = lines.reduce((s, l) => s + l.localIncomeTaxKrw, 0);
  const totalWithholdingTaxKrw = totalNationalIncomeTaxKrw + totalLocalIncomeTaxKrw;
  const totalNetPayoutKrw = Math.max(0, totalGrossAmountKrw - totalWithholdingTaxKrw);

  return {
    dataSourceKind: "estimate", badgeLabelKo: "추정", badgeLabelEn: "Estimate", includeWithholdingTax,
    withholdingRatePct: includeWithholdingTax ? Math.round((nationalRate + localRate) * 1000) / 1000 : 0,
    nationalIncomeTaxRatePct: includeWithholdingTax ? nationalRate : 0,
    localIncomeTaxRatePct: includeWithholdingTax ? localRate : 0,
    lines, totalCuts, activeStageCount, totalBaseSubtotalKrw, totalRushSurchargeKrw, totalGrossAmountKrw,
    totalNationalIncomeTaxKrw, totalLocalIncomeTaxKrw, totalWithholdingTaxKrw, totalNetPayoutKrw,
    averageGrossPerCutKrw: totalCuts > 0 ? Math.round(totalGrossAmountKrw / totalCuts) : 0,
    estimateNoticeKo: "입력된 공정별 컷 수·컷당 단가 가정 기반 추정 정산표입니다. 실제 계약 단가와 수정비 조항에 따라 달라질 수 있습니다.",
    estimateNoticeEn: "Estimated payout preview from entered cut counts and per-cut rates. Verify against signed terms.",
    taxDisclaimerKo: `입력 가정 세율(국세 ${nationalRate}% + 지방세 ${localRate}%)로 계산한 예시입니다. 현행 세율·과세 대상·신고 또는 실제 지급을 확인하지 않습니다.`,
    taxDisclaimerEn: `Example using assumed rates (national ${nationalRate}% + local ${localRate}%). Current tax rules, applicability, filing and payment are not verified.`,
  };
}

/** 원클릭 인수인계 브리프(Markdown)를 생성한다. */
export function buildHandoffBriefMarkdown(context: HandoffBriefContext): string {
  assertExportSnapshot(context);
  const isEn = context.locale === "en";
  const t = (ko: string, en: string): string => (isEn ? en : ko);
  const { readiness, payout } = context;
  const verdictText = readiness.verdict === "ready"
    ? t("출고 가능", "READY FOR HANDOFF")
    : readiness.verdict === "ready-with-warnings" ? t("경고 확인 후 출고", "READY WITH WARNINGS") : t("출고 차단 (보완 필요)", "BLOCKED (FIX REQUIRED)");
  const changed = readiness.layerAudit.renamePreview.filter((item) => item.changed);

  const lines: string[] = [
    t(`# 어시스턴트 인수인계 브리프 — ${context.projectTitle} (${context.episodeLabel})`, `# Assistant Handoff Brief — ${context.projectTitle} (${context.episodeLabel})`),
    "",
    t(`- **대상 공정**: ${readiness.stage.labelKo}`, `- **Stage**: ${readiness.stage.labelEn}`),
    t(`- **발신 / 수신**: ${context.senderName} → ${context.receiverName}`, `- **From / To**: ${context.senderName} -> ${context.receiverName}`),
    t(`- **마감일 / 전달 포맷**: ${context.dueDateIso} / ${context.deliverableFormat}`, `- **Due Date / Format**: ${context.dueDateIso} / ${context.deliverableFormat}`),
    t(`- **원고 규격**: ${readiness.layerAudit.dpi} DPI · ${readiness.layerAudit.colorSpace}`, `- **Document Spec**: ${readiness.layerAudit.dpi} DPI · ${readiness.layerAudit.colorSpace}`),
    t(`- **검수 판정**: ${verdictText} (준비도 ${readiness.readinessScore}/100 · 차단 ${readiness.blockerCount}건 · 경고 ${readiness.warningCount}건)`, `- **QA Verdict**: ${verdictText} (Score ${readiness.readinessScore}/100 · Blockers ${readiness.blockerCount} · Warnings ${readiness.warningCount})`),
    "", t("## 1. 차단 이슈 (출고 전 필수 보완)", "## 1. Blocking Issues"),
    ...(readiness.blockers.length === 0
      ? [t("- 없음 (차단 이슈 0건).", "- None (0 blockers).")]
      : readiness.blockers.map((b) => t(`- **[차단]** ${b.titleKo} — ${b.actionKo}`, `- **[BLOCKER]** ${b.titleEn} — ${b.actionEn}`))),
    "", t("## 2. 7대 표준 레이어 감사 & 자동 보정 미리보기", "## 2. Standard Layer Audit & Auto-Rename Preview"),
    ...(changed.length === 0
      ? [t("- 모든 레이어가 `01_LINE`~`07_TEXT` 표준 규약과 일치합니다.", "- All layers follow `01_LINE`..`07_TEXT` convention.")]
      : changed.map((c) => t(`- \`${c.beforeName}\` → \`${c.afterName}\` (${c.reasonKo})`, `- \`${c.beforeName}\` -> \`${c.afterName}\` (${c.reasonEn})`))),
    "", t("## 3. 공정 QA 체크리스트", "## 3. Stage QA Checklist"),
    ...readiness.checklistItems.map((i) => `- ${i.checked ? "[x]" : "[ ]"} ${i.isBlocker ? t("[필수 차단]", "[BLOCKER]") : t("[권장]", "[RECOMMENDED]")} ${t(i.titleKo, i.titleEn)}`),
    "", t(`## 4. 어시스턴트 정산 프리뷰 [${payout.badgeLabelKo}]`, `## 4. Assistant Payout Preview [${payout.badgeLabelEn}]`),
    t("| 공정 | 담당 | 컷 수 | 컷당 단가 | 세전 합계(추정) | 가정 세액 | 실지급액(추정) |", "| Stage | Assignee | Cuts | Rate | Gross (Est.) | Assumed Tax | Net Payout (Est.) |"),
    "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...payout.lines.filter((r) => r.cutCount > 0 || r.grossAmountKrw > 0).map((r) =>
      `| ${t(r.labelKo, r.labelEn)} | ${r.assigneeName} | ${r.cutCount} | ${formatKrwAmount(r.ratePerCutKrw, context.locale)} | ${formatKrwAmount(r.grossAmountKrw, context.locale)} | ${formatKrwAmount(r.withholdingTaxKrw, context.locale)} | ${formatKrwAmount(r.netPayoutKrw, context.locale)} |`),
    "",
    t(
      `- **총 합계(추정)**: ${payout.totalCuts}컷 · 세전 ${formatKrwAmount(payout.totalGrossAmountKrw)} · 원천징수(${payout.withholdingRatePct}%) ${formatKrwAmount(payout.totalWithholdingTaxKrw)} · 예상 실지급 ${formatKrwAmount(payout.totalNetPayoutKrw)}`,
      `- **Total Cuts**: ${payout.totalCuts} cuts · **Gross**: ${formatKrwAmount(payout.totalGrossAmountKrw, "en")} · **Withholding (${payout.withholdingRatePct}%)**: ${formatKrwAmount(payout.totalWithholdingTaxKrw, "en")} · **Estimated Net**: ${formatKrwAmount(payout.totalNetPayoutKrw, "en")}`,
    ),
    `> ${t(payout.taxDisclaimerKo, payout.taxDisclaimerEn)}`,
  ];

  if (context.notes && context.notes.trim().length > 0) {
    lines.push("", t("## 5. 메인 작가 전달 메모", "## 5. Director Notes"), context.notes);
  }
  return lines.join("\n");
}

/** 인수인계 패키지 전체 스냅샷을 스키마 버전이 포함된 JSON 문자열로 직렬화한다. */
export function exportHandoffPackageJson(context: HandoffBriefContext): string {
  assertExportSnapshot(context);
  const { readiness, payout } = context;
  return JSON.stringify({
    schemaVersion: "toonstudio.assistant-handoff-kit.v1",
    dataSourceKind: payout.dataSourceKind,
    metadata: {
      projectTitle: context.projectTitle, episodeLabel: context.episodeLabel,
      senderName: context.senderName, receiverName: context.receiverName,
      dueDateIso: context.dueDateIso, deliverableFormat: context.deliverableFormat,
      notes: context.notes ?? "",
    },
    stage: { id: readiness.stage.id, labelKo: readiness.stage.labelKo, labelEn: readiness.stage.labelEn, requiredLayers: readiness.stage.requiredLayers },
    documentSpec: {
      dpi: readiness.layerAudit.dpi, expectedDpi: readiness.layerAudit.expectedDpi, dpiValid: readiness.layerAudit.dpiValid,
      colorSpace: readiness.layerAudit.colorSpace, expectedColorSpace: readiness.layerAudit.expectedColorSpace, colorSpaceValid: readiness.layerAudit.colorSpaceValid,
    },
    readiness: {
      verdict: readiness.verdict, readinessScore: readiness.readinessScore,
      blockerCount: readiness.blockerCount, warningCount: readiness.warningCount,
      standardCompliancePct: readiness.layerAudit.standardCompliancePct, checklistCompletionPct: readiness.checklistCompletionPct,
      missingRequiredCodes: readiness.layerAudit.missingRequiredCodes, blockers: readiness.blockers, warnings: readiness.warnings,
      checklist: readiness.checklistItems.map((item) => ({ id: item.id, checked: item.checked, isBlocker: item.isBlocker, blocksHandoff: item.blocksHandoff })),
    },
    layerRenamePlan: readiness.layerAudit.renamePreview,
    payoutEstimate: payout,
  }, null, 2);
}
