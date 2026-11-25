import { auditEpisodeModelSheetDrift, getAccessoryMeta, getHairPartMeta, DRIFT_METRIC_KEYS,
  type DriftCoachSessionState, type EpisodeModelSheetAuditReport } from "./modelsheet-drift-engine";
import { assertDriftSession, validateDriftSpec } from "./drift-input-contract";

/** 수신한 결과를 현재 숫자 모델로 다시 계산하며 원본·외부 메타데이터는 수정하지 않는다. */
function canonicalReport(audit: EpisodeModelSheetAuditReport, session: DriftCoachSessionState): EpisodeModelSheetAuditReport {
  assertDriftSession(session);
  const spec = validateDriftSpec(audit.spec);
  if (spec.id !== session.archetypeId) throw new RangeError("리포트와 세션의 설정집 기준이 다릅니다.");
  const expected = auditEpisodeModelSheetDrift({ spec, cuts: session.workingCuts });
  const same = audit.totalCuts === expected.totalCuts && audit.consistencyScore === expected.consistencyScore
    && audit.grade === expected.grade && audit.worstCutNumber === expected.worstCutNumber
    && audit.counts.ok === expected.counts.ok && audit.counts.notice === expected.counts.notice && audit.counts.drift === expected.counts.drift
    && Array.isArray(audit.cutAudits) && audit.cutAudits.length === expected.cutAudits.length
    && audit.cutAudits.every((cut, index) => {
      const current = expected.cutAudits[index];
      return current && cut.cutId === current.cutId && cut.cutNumber === current.cutNumber && cut.cutScore === current.cutScore
        && cut.severity === current.severity && cut.maxDeviationPct === current.maxDeviationPct && cut.weightedDriftPct === current.weightedDriftPct
        && cut.hairPartMismatch === current.hairPartMismatch && DRIFT_METRIC_KEYS.every(key =>
          cut.metrics[key].baseline === current.metrics[key].baseline && cut.metrics[key].measured === current.metrics[key].measured
          && cut.metrics[key].signedPct === current.metrics[key].signedPct && cut.metrics[key].severity === current.metrics[key].severity);
    });
  if (!same) throw new RangeError("리포트가 현재 숫자 모델과 다릅니다. 다시 계산해 주세요.");
  return expected;
}

/** 검수 리포트 Markdown 직렬화. */
export function exportDriftReportMarkdown(params: {
  readonly audit: EpisodeModelSheetAuditReport;
  readonly session: DriftCoachSessionState;
  readonly locale?: "ko" | "en";
}): string {
  const { session, locale = "ko" } = params;
  const audit = canonicalReport(params.audit, session);
  const isEn = locale === "en";
  const spec = audit.spec;
  const hairLabel = isEn ? getHairPartMeta(spec.hairPartSide).labelEn : getHairPartMeta(spec.hairPartSide).labelKo;
  const reqAcc = spec.requiredAccessories.map((id) => (isEn ? getAccessoryMeta(id).labelEn : getAccessoryMeta(id).labelKo)).join(", ");
  const lines: string[] = [
    isEn ? "# Cross-Cut Model Sheet Drift Audit Report" : "# 회차 캐릭터 작화·비율 흔들림 검수 리포트", "",
    isEn ? `- **Character Archetype**: ${spec.nameEn} (${spec.headToBodyRatio.toFixed(1)}H)` : `- **설정집 기준 캐릭터**: ${spec.nameKo} (${spec.headToBodyRatio.toFixed(1)}등신)`,
    isEn
      ? `- **Baseline Spec**: Eye Spacing ${spec.eyeSpacingRatio.toFixed(2)}x · Eye Height ${spec.eyeHeightRatio.toFixed(2)} · Jaw Width ${spec.jawWidthRatio.toFixed(2)} · Hair Part ${hairLabel}`
      : `- **기준 지표**: 눈 간격 ${spec.eyeSpacingRatio.toFixed(2)}배 · 눈 높이 ${spec.eyeHeightRatio.toFixed(2)} · 턱선 폭 ${spec.jawWidthRatio.toFixed(2)} · 가르마 ${hairLabel}`,
    isEn ? `- **Required Props**: ${reqAcc}` : `- **필수 의상·장신구**: ${reqAcc}`,
    isEn
      ? `- **Episode Consistency Score**: **${audit.consistencyScore}/100** (OK ${audit.counts.ok} / Notice ${audit.counts.notice} / Drift ${audit.counts.drift} of ${audit.totalCuts} cuts)`
      : `- **회차 일관성 점수**: **${audit.consistencyScore} / 100점** (총 ${audit.totalCuts}컷 · 정상 ${audit.counts.ok} / 주의 ${audit.counts.notice} / 흔들림 ${audit.counts.drift})`,
    isEn ? "- CPU metric example; no image analysis, artwork edits or storage were verified." : "- CPU 숫자 비교 예제입니다. 실제 이미지 분석·원고 수정·저장은 확인하지 않습니다.",
    "", isEn ? "## Flagged Cuts" : "## 검수 대상 컷 목록", "",
    isEn ? "| Cut | Severity | Score | Max Drift | Red-Pen Notes | Fix Status |" : "| 컷 | 등급 | 점수 | 최대 편차 | 붉은 펜 검수 메모 | 보정 상태 |",
    "| --- | --- | ---: | ---: | --- | --- |",
  ];
  const flagged = audit.cutAudits.filter((item) => item.severity !== "ok" || Boolean(session.appliedFixByCut[item.cutNumber]));
  if (flagged.length === 0) {
    lines.push(isEn ? "| - | ok | 100 | 0.0% | All cuts within baseline tolerance | Clean |" : "| - | 정상 | 100점 | 0.0% | 전 컷 설정집 허용 오차 안 | 완료 |");
  } else {
    for (const item of flagged) {
      const fix = session.appliedFixByCut[item.cutNumber];
      const notes = (isEn ? item.redPenCalloutsEn : item.redPenCalloutsKo).join(" / ");
      const statusText = fix ? (isEn ? `Applied (${fix.titleEn})` : `적용됨 (${fix.titleKo})`) : (isEn ? "Pending review" : "검수 대기");
      const sev = isEn ? item.severity : item.severity === "drift" ? "흔들림" : item.severity === "notice" ? "주의" : "정상";
      lines.push(`| #${item.cutNumber} | ${sev} | ${item.cutScore} | ${item.maxDeviationPct.toFixed(1)}% | ${notes} | ${statusText} |`);
    }
  }
  lines.push("", isEn ? "## Approval History" : "## 컷별 승인·원복 이력", "");
  if (session.approvalHistory.length === 0) lines.push(isEn ? "- No author approvals recorded yet." : "- 아직 작가 승인 이력이 없습니다.");
  else for (const entry of session.approvalHistory) lines.push(`- [r${entry.revision}] ${isEn ? entry.summaryEn : entry.summaryKo}`);
  return lines.join("\n");
}

/** 검수 리포트 JSON 직렬화. */
export function exportDriftReportJson(params: {
  readonly audit: EpisodeModelSheetAuditReport;
  readonly session: DriftCoachSessionState;
}): string {
  const { session } = params;
  const audit = canonicalReport(params.audit, session);
  const appliedList = Object.values(session.appliedFixByCut).sort((a, b) => a.cutNumber - b.cutNumber);
  return JSON.stringify(
    {
      schema: "toonstudio.crosscut-modelsheet-drift-coach.v1",
      sourceKind: "cpu-metric-example", artworkModified: false, imageAnalysisPerformed: false, persisted: false,
      spec: audit.spec,
      summary: {
        totalCuts: audit.totalCuts, consistencyScore: audit.consistencyScore, grade: audit.grade,
        counts: audit.counts, worstCutNumber: audit.worstCutNumber, missingAccessoryTotals: audit.missingAccessoryTotals,
      },
      flaggedCuts: audit.cutAudits.filter((item) => item.severity !== "ok").map((item) => ({
        cutNumber: item.cutNumber, severity: item.severity, cutScore: item.cutScore,
        maxDeviationPct: item.maxDeviationPct, weightedDriftPct: item.weightedDriftPct,
        hairPartMismatch: item.hairPartMismatch, missingAccessories: item.missingAccessories,
        redPenCalloutsKo: item.redPenCalloutsKo, redPenCalloutsEn: item.redPenCalloutsEn,
      })),
      appliedFixes: appliedList.map((fix) => ({
        cutNumber: fix.cutNumber, strategy: fix.strategy, titleKo: fix.titleKo,
        scoreBefore: fix.scoreBefore, scoreAfter: fix.scoreAfter, revision: fix.revision,
      })),
      approvalHistory: session.approvalHistory.map(entry => ({
        entryId: entry.entryId, revision: entry.revision, action: entry.action, cutNumber: entry.cutNumber, strategy: entry.strategy,
        scoreBefore: entry.scoreBefore, scoreAfter: entry.scoreAfter, summaryKo: entry.summaryKo, summaryEn: entry.summaryEn,
      })),
    },
    null,
    2,
  );
}
