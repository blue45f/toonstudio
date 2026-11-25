import { BEAT_ROLE_LABELS, auditScrollTensionCurve, getShotScaleMeta,
  type ScrollPacingCut, type ScrollPacingPreset, type ScrollPacingSessionState, type ScrollTensionAuditReport } from "./scroll-pacing-composer-engine";
import { assertPacingSession, normalizePacingCuts, pacingCutsKey, pacingText } from "./pacing-input-contract";

function exportModel(params: { readonly preset: ScrollPacingPreset; readonly cuts: readonly ScrollPacingCut[]; readonly audit: ScrollTensionAuditReport; readonly session?: ScrollPacingSessionState }) {
  const cuts = normalizePacingCuts(params.cuts); const audit = auditScrollTensionCurve(cuts);
  pacingText(params.preset.titleKo); pacingText(params.preset.titleEn);
  if (params.session) {
    assertPacingSession(params.session);
    if (params.session.presetId !== params.preset.id || pacingCutsKey(params.session.workingCuts) !== pacingCutsKey(cuts)) throw new RangeError("리포트와 세션의 원문·설정이 다릅니다.");
  }
  for (const key of Object.keys(audit) as (keyof ScrollTensionAuditReport)[]) {
    const value = audit[key];
    if ((typeof value === "number" || typeof value === "string") && params.audit[key] !== value) throw new RangeError("감사 결과가 현재 컷 모델과 다릅니다. 다시 계산해 주세요.");
  }
  const inputNormalizationApplied = cuts.some((cut, index) => {
    const raw = params.cuts[index];
    return !raw || cut.gutterPx !== raw.gutterPx || cut.panelHeightPx !== raw.panelHeightPx || cut.dialogueChars !== raw.dialogueChars || cut.tensionScore !== raw.tensionScore;
  });
  return { cuts, audit, inputNormalizationApplied };
}

export function exportScrollPacingMarkdown(params: {
  readonly preset: ScrollPacingPreset; readonly cuts: readonly ScrollPacingCut[];
  readonly audit: ScrollTensionAuditReport; readonly session?: ScrollPacingSessionState;
  readonly locale?: "ko" | "en";
}): string {
  const { preset, session, locale = "ko" } = params;
  const { cuts, audit } = exportModel(params);
  const isEn = locale === "en";
  const lines: string[] = [
    isEn ? `# Scroll Pacing & Tension Sheet — ${preset.titleEn}` : `# 세로 스크롤 감정 곡선 · 컷 호흡 리듬 시트 — ${preset.titleKo}`,
    "",
    isEn ? `- **Immersion Rhythm Score**: ${audit.immersionScore}/100 (Grade ${audit.grade})` : `- **스크롤 몰입 리듬 점수**: ${audit.immersionScore}/100 (${audit.grade}등급)`,
    isEn ? `- **Cliffhanger Strength**: ${audit.cliffhangerStrength}/100` : `- **엔딩 클리프행어 강도**: ${audit.cliffhangerStrength}/100`,
    isEn ? `- **Scroll Length & Est. Read Time**: ${audit.totalScrollHeightPx}px · ${audit.estimatedTotalReadSec}s (${audit.cutCount} cuts)` : `- **총 세로 길이 · 예상 정독 시간**: ${audit.totalScrollHeightPx}px · ${audit.estimatedTotalReadSec}초 (${audit.cutCount}컷)`,
    isEn ? `- **Revision**: r${session?.revision ?? 0} | **Open Warnings**: ${audit.issues.length}` : `- **리비전**: r${session?.revision ?? 0} | **감지 경고**: ${audit.issues.length}건`,
    isEn ? "- CPU metric example; reading time is a fixed-rate estimate. Artwork changes, reader responses and storage were not verified." : "- CPU 수치 예제입니다. 읽기 시간은 고정 속도 가정이며 실제 원고 변경·독자 반응·저장은 확인하지 않습니다.",
    "",
    isEn ? "## Cut-by-Cut Rhythm Sheet" : "## 컷별 여백·긴장도 리듬표",
    isEn ? "| Cut | Scene | Beat | Shot | Gutter(px) | Height(px) | Dialogue | Tension | Status |" : "| 컷 | 장면 | 역할 | 샷 | 여백(px) | 컷높이(px) | 대사(자) | 긴장도 | 진단 |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |",
  ];
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    const role = isEn ? BEAT_ROLE_LABELS[cut.beatRole].en : BEAT_ROLE_LABELS[cut.beatRole].ko;
    const shot = isEn ? getShotScaleMeta(cut.shotScale).shortEn : getShotScaleMeta(cut.shotScale).shortKo;
    lines.push(`| #${cut.cutNumber} | ${isEn ? cut.sceneLabelEn : cut.sceneLabelKo} | ${role} | ${shot} | ${cut.gutterPx} | ${cut.panelHeightPx} | ${cut.dialogueChars} | ${cut.tensionScore} | ${audit.cutDiagnostics[i]?.status ?? "ok"} |`);
  }
  if (audit.issues.length > 0) {
    lines.push("", isEn ? "## Detected Pacing Warnings" : "## 감지된 호흡 정체·이탈 경고");
    for (const issue of audit.issues) {
      lines.push(`- [${issue.severity.toUpperCase()}] ${isEn ? issue.titleEn : issue.titleKo}: ${isEn ? issue.detailEn : issue.detailKo}`);
    }
  }
  return lines.join("\n");
}

export function exportScrollPacingJson(params: {
  readonly preset: ScrollPacingPreset; readonly cuts: readonly ScrollPacingCut[];
  readonly audit: ScrollTensionAuditReport; readonly session?: ScrollPacingSessionState;
}): string {
  const { preset, session } = params;
  const { cuts, audit, inputNormalizationApplied } = exportModel(params);
  return JSON.stringify({
    schema: "toonstudio.scroll-pacing-tension-composer.v1",
    sourceKind: "cpu-pacing-example", artworkModified: false, persisted: false, inputNormalizationApplied,
    readingTimeBasis: "fixed-540px-per-second-and-12-characters-per-second", strategyIdsMeaning: "selection-history-not-current-cuts",
    presetId: preset.id, presetTitleKo: preset.titleKo, presetTitleEn: preset.titleEn,
    revision: session?.revision ?? 0, appliedStrategyIds: session?.appliedStrategyIds ?? [],
    summary: {
      cutCount: audit.cutCount, immersionScore: audit.immersionScore, grade: audit.grade,
      cliffhangerStrength: audit.cliffhangerStrength, totalScrollHeightPx: audit.totalScrollHeightPx,
      estimatedTotalReadSec: audit.estimatedTotalReadSec, averageGutterPx: audit.averageGutterPx,
      averageDialogueChars: audit.averageDialogueChars, peakTensionCutNumber: audit.peakTensionCutNumber,
      peakTensionScore: audit.peakTensionScore, issueCount: audit.issues.length,
    },
    issues: audit.issues.map((i) => ({ id: i.id, code: i.code, severity: i.severity, cutNumbers: i.cutNumbers, titleKo: i.titleKo, titleEn: i.titleEn })),
    cuts: cuts.map((c, idx) => ({
      cutId: c.cutId, cutNumber: c.cutNumber, sceneLabelKo: c.sceneLabelKo, sceneLabelEn: c.sceneLabelEn,
      beatRole: c.beatRole, shotScale: c.shotScale, gutterPx: c.gutterPx, panelHeightPx: c.panelHeightPx,
      dialogueChars: c.dialogueChars, tensionScore: c.tensionScore, status: audit.cutDiagnostics[idx]?.status ?? "ok",
    })),
  }, null, 2);
}
