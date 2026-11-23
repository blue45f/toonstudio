/**
 * 외부 PD/출판사 블라인드 검수 패키지 생성기 + 외부 피드백 귀속 + 검수 라운드(v1->v2->v3) 회귀 추적 & SLA 병목 분석 엔진.
 *
 * - 100% 순수 로컬 생성 및 분석 (외부 서버/CDN/가짜 응답 0건).
 * - 블라인드 모드(`hideInternalNotes: true`)에서는 스튜디오 내부 잡담·어시 메모·내부 담당자명·내부 코멘트를 100% 제거한다.
 * - 모든 사용자 문자열은 엄격한 HTML 이스케이프 및 인라인 JSON 직렬화 이스케이프를 거쳐 XSS를 차단한다.
 * - 정적 HTML 스타일 색상은 OKLCH 토큰만 사용한다(원시 hex/rgb/hsl 0건).
 */

import {
  REJECTION_REASON_META,
  REJECTION_REASON_TAGS,
  SIGNOFF_STAGE_META,
  SIGNOFF_STAGE_ORDER,
  recordCutSignoffDecision,
  sanitizeRejectionReasonTags,
  type EpisodeSignoffBoard,
  type RejectionReasonTag,
  type SignoffStageId,
} from "./multi-role-signoff-engine";

export interface ExternalBlindReviewOptions {
  readonly board: EpisodeSignoffBoard;
  readonly targetStageId?: SignoffStageId;
  readonly viewerName: string;
  readonly viewerOrganization: string;
  readonly expiresAtIso: string;
  readonly issuedAtIso?: string;
  readonly hideInternalNotes: boolean;
  readonly language?: "ko" | "en";
  readonly watermarkOpacity?: number;
}

export interface ExternalReviewTokenSpec {
  readonly schemaVersion: "toonstudio.blind-review.v1";
  readonly storageMode: "local-static-html-only";
  readonly tokenId: string;
  readonly episodeId: string;
  readonly workTitle: string;
  readonly episodeTitle: string;
  readonly stageId: SignoffStageId;
  readonly viewerName: string;
  readonly viewerOrganization: string;
  readonly issuedAtIso: string;
  readonly expiresAtIso: string;
  readonly hideInternalNotes: boolean;
  readonly strippedInternalNoteCount: number;
  readonly watermarkText: string;
  readonly cutIds: readonly string[];
  readonly honestyNoticeKo: string;
  readonly honestyNoticeEn: string;
}

export interface ExternalBlindReviewPackage {
  readonly tokenSpec: ExternalReviewTokenSpec;
  readonly tokenSpecJson: string;
  readonly html: string;
  readonly htmlFilename: string;
  readonly jsonFilename: string;
  readonly byteSize: number;
  readonly sampleFeedbackJson: string;
}

export interface ExternalReviewFeedbackItem {
  readonly cutId: string;
  readonly stageId?: SignoffStageId;
  readonly decision: "approved" | "changes-requested";
  readonly reasonTags?: readonly RejectionReasonTag[];
  readonly comment: string;
  readonly reviewerName: string;
  readonly reviewerOrganization?: string;
  readonly submittedAtIso?: string;
  readonly tokenId?: string;
}

export interface ImportExternalFeedbackOptions {
  readonly defaultStageId?: SignoffStageId;
  readonly defaultReviewerName?: string;
  readonly expiresAtIso?: string;
  readonly rejectExpired?: boolean;
  readonly autoAdvance?: boolean;
}

export interface ExternalFeedbackImportResult {
  readonly board: EpisodeSignoffBoard;
  readonly appliedCount: number;
  readonly approvedCount: number;
  readonly changesRequestedCount: number;
  readonly appliedCutIds: readonly string[];
  readonly ignoredCutIds: readonly string[];
  readonly autoAdvancedToStageIds: readonly SignoffStageId[];
  readonly warnings: readonly string[];
}

export interface ParsedExternalFeedbackPayload {
  readonly items: readonly ExternalReviewFeedbackItem[];
  readonly errorMessageKo?: string;
  readonly errorMessageEn?: string;
}

export type ReviewPinInputStatus = "open" | "resolved";
export type ReviewPinAnalyzedStatus = "open" | "resolved" | "regressed";

export interface ReviewRoundPinRecord {
  readonly pinId: string;
  readonly cutId: string;
  readonly stageId: SignoffStageId;
  readonly reasonTag: RejectionReasonTag;
  readonly status: ReviewPinInputStatus;
  readonly summaryKo: string;
  readonly summaryEn?: string;
  readonly reviewDurationMinutes?: number;
}

export interface StageRoundReviewEntry {
  readonly stageId: SignoffStageId;
  readonly reviewedCutCount: number;
  readonly approvedFirstPassCutCount: number;
  readonly reworkCutCount: number;
  readonly reviewDurationMinutes: number;
  readonly slaTargetMinutes?: number;
}

export interface ReviewRoundSnapshot {
  readonly roundNumber: number;
  readonly roundLabel: string;
  readonly reviewedAtIso: string;
  readonly pins: readonly ReviewRoundPinRecord[];
  readonly stageReviews?: readonly StageRoundReviewEntry[];
}

export interface RegressedPinLifecyclePoint {
  readonly roundNumber: number;
  readonly roundLabel: string;
  readonly status: ReviewPinAnalyzedStatus;
}

export interface RegressedPinAlert {
  readonly pinId: string;
  readonly cutId: string;
  readonly stageId: SignoffStageId;
  readonly reasonTag: RejectionReasonTag;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly resolvedInRound: string;
  readonly reopenedInRound: string;
  readonly regressionCount: number;
  readonly lifecycle: readonly RegressedPinLifecyclePoint[];
}

export interface StageSlaBottleneckReport {
  readonly stageId: SignoffStageId;
  readonly sampleCount: number;
  readonly avgReviewDurationMinutes: number;
  readonly slaTargetMinutes: number;
  readonly slaDeltaMinutes: number;
  readonly isOverSla: boolean;
  readonly firstPassApprovalRatePct: number;
  readonly reworkRatePct: number;
  readonly totalReworkCuts: number;
  readonly regressedPinCount: number;
  readonly openPinCount: number;
  readonly bottleneckScore: number;
}

export interface RejectionReasonBreakdownItem {
  readonly reasonTag: RejectionReasonTag;
  readonly count: number;
  readonly sharePct: number;
}

export interface ReviewRoundSummary {
  readonly roundNumber: number;
  readonly roundLabel: string;
  readonly reviewedAtIso: string;
  readonly openCount: number;
  readonly resolvedCount: number;
  readonly regressedCount: number;
  readonly totalPinCount: number;
}

export interface ReviewRoundsAndSlaReport {
  readonly totalRounds: number;
  readonly totalUniquePins: number;
  readonly regressedPins: readonly RegressedPinAlert[];
  readonly regressedPinCount: number;
  readonly overallAvgReviewDurationMinutes: number;
  readonly overallFirstPassApprovalRatePct: number;
  readonly topRejectionReason: RejectionReasonBreakdownItem | null;
  readonly rejectionReasonBreakdown: readonly RejectionReasonBreakdownItem[];
  readonly topBottleneckStage: StageSlaBottleneckReport | null;
  readonly slowestStage: StageSlaBottleneckReport | null;
  readonly stageSlaReports: readonly StageSlaBottleneckReport[];
  readonly roundSummaries: readonly ReviewRoundSummary[];
}

const VALID_STAGE_SET: ReadonlySet<string> = new Set(SIGNOFF_STAGE_ORDER);

/** 엄격한 HTML 이스케이프 (XSS 방어). */
export function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** `<script>` 내부 안전 JSON 직렬화 이스케이프 (`</script>` 탈출 차단). */
export function serializeSafeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function clampFinite(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function round1(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function buildSlug(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized.length > 0 ? normalized.slice(0, 40) : "episode-review";
}

function computeTokenId(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `blind-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

function buildWatermarkTiles(watermarkLine: string, orgLine: string): string {
  const escapedMain = escapeHtml(watermarkLine);
  const escapedOrg = escapeHtml(orgLine);
  return Array.from(
    { length: 18 },
    () => `<span class="wm-tile"><strong>${escapedMain}</strong><span>${escapedOrg}</span></span>`,
  ).join("");
}

/**
 * 워터마크·만료 시각·블라인드 모드가 적용된 단일 파일 정적 HTML 패키지 및 JSON 토큰 스펙 생성.
 * - `hideInternalNotes: true` 시 내부 스튜디오 잡담·어시 메모·내부 담당자명·내부 코멘트를 100% 제거한다.
 */
export function buildExternalBlindReviewPackage(
  options: ExternalBlindReviewOptions,
): ExternalBlindReviewPackage {
  const { board, hideInternalNotes } = options;
  const stageId: SignoffStageId = options.targetStageId ?? board.activeStageIds[0] ?? "pd-final";
  const stageMeta = SIGNOFF_STAGE_META[stageId];
  const viewerName = options.viewerName.trim() || "외부 검수 PD";
  const viewerOrganization = options.viewerOrganization.trim() || "협력 출판사";
  const issuedAtIso = options.issuedAtIso?.trim() || board.updatedAtIso;
  const expiresAtIso = options.expiresAtIso.trim() || "2026-11-26T18:00:00+09:00";
  const isEn = options.language === "en";
  const watermarkOpacity = clampFinite(options.watermarkOpacity, 0.06, 0.24, 0.12);

  let internalCommentCount = 0;
  for (const cut of board.cuts) {
    const s = cut.stageStates[stageId];
    if (s.decisionSource === "studio-internal" && s.comment.trim().length > 0) internalCommentCount += 1;
  }
  const strippedInternalNoteCount = hideInternalNotes
    ? board.internalNotes.length +
      board.cuts.reduce((sum, cut) => sum + cut.internalStudioNotes.length, 0) +
      internalCommentCount
    : 0;

  const tokenId = computeTokenId(
    `${board.episodeId}|${stageId}|${viewerName}|${viewerOrganization}|${expiresAtIso}|${String(hideInternalNotes)}`,
  );
  const watermarkText = `${viewerName} · ${expiresAtIso}`;

  const tokenSpec: ExternalReviewTokenSpec = {
    schemaVersion: "toonstudio.blind-review.v1",
    storageMode: "local-static-html-only",
    tokenId,
    episodeId: board.episodeId,
    workTitle: board.workTitle,
    episodeTitle: board.episodeTitle,
    stageId,
    viewerName,
    viewerOrganization,
    issuedAtIso,
    expiresAtIso,
    hideInternalNotes,
    strippedInternalNoteCount,
    watermarkText,
    cutIds: board.cuts.map((cut) => cut.cutId),
    honestyNoticeKo:
      "로컬에서 생성된 단일 정적 HTML·JSON 검수 패키지입니다. 외부 서버 전송 없이 열람자가 내보낸 피드백 JSON을 결재 보드에 귀속합니다.",
    honestyNoticeEn:
      "Locally generated standalone static HTML/JSON review package. Zero server transmission; import the exported feedback JSON back into the board.",
  };

  const internalNotesSectionHtml =
    !hideInternalNotes && board.internalNotes.length > 0
      ? `<section class="internal-notes"><h2>${isEn ? "Internal Studio Notes" : "스튜디오 내부 메모"}</h2><ul>${board.internalNotes
          .map((note) => `<li><strong>${escapeHtml(note.authorName)} (${escapeHtml(note.authorRole)})</strong>: ${escapeHtml(note.body)}</li>`)
          .join("")}</ul></section>`
      : "";

  const cutCardsHtml = board.cuts
    .map((cut) => {
      const state = cut.stageStates[stageId];
      const cutTitle = isEn ? cut.sceneTitleEn : cut.sceneTitleKo;
      const preview = isEn ? cut.externalPreviewNoteEn : cut.externalPreviewNoteKo;
      const visibleComment = state.decisionSource === "external-pd" || !hideInternalNotes ? state.comment : "";
      const cutInternalHtml =
        !hideInternalNotes && cut.internalStudioNotes.length > 0
          ? `<div class="cut-internal">${cut.internalStudioNotes
              .map((n) => `<p><strong>${escapeHtml(n.authorName)}</strong>: ${escapeHtml(n.body)}</p>`)
              .join("")}</div>`
          : "";
      const tagInputs = REJECTION_REASON_TAGS.map((tag) => {
        const label = isEn ? REJECTION_REASON_META[tag].labelEn : REJECTION_REASON_META[tag].labelKo;
        const checked = state.reasonTags.includes(tag) ? " checked" : "";
        return `<label class="tag-pill"><input type="checkbox" name="tags-${escapeHtml(cut.cutId)}" value="${tag}"${checked} /><span>${escapeHtml(label)}</span></label>`;
      }).join("");
      const escapedCutId = escapeHtml(cut.cutId);
      return `<article class="cut-card" data-cut-id="${escapedCutId}"><div class="cut-head"><span class="cut-badge">CUT ${String(cut.cutNumber).padStart(2, "0")}</span><h3>${escapeHtml(cutTitle)}</h3><span class="cut-status">${escapeHtml(state.status)}</span></div><p class="cut-preview">${escapeHtml(preview)}</p>${cutInternalHtml}<div class="cut-controls"><label class="field-label" for="dec-${escapedCutId}">${isEn ? "Decision" : "검수 판정"}</label><select id="dec-${escapedCutId}" class="decision-select" data-field="decision"><option value="approved"${state.status === "approved" ? " selected" : ""}>${isEn ? "Approve Cut" : "컷 승인"}</option><option value="changes-requested"${state.status === "changes-requested" ? " selected" : ""}>${isEn ? "Request Changes" : "수정 반려"}</option></select><fieldset class="tag-group"><legend>${isEn ? "Rejection Reason Tags" : "반려 사유 태그"}</legend><div class="tag-list">${tagInputs}</div></fieldset><label class="field-label" for="cmt-${escapedCutId}">${isEn ? "Comment" : "검수 코멘트"}</label><textarea id="cmt-${escapedCutId}" class="comment-input" data-field="comment" rows="2">${escapeHtml(visibleComment)}</textarea></div></article>`;
    })
    .join("\n");

  const inlineConfig = serializeSafeInlineJson({ tokenId, episodeId: board.episodeId, stageId, viewerName, viewerOrganization, expiresAtIso });
  const html = `<!DOCTYPE html>
<html lang="${isEn ? "en" : "ko"}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(board.workTitle)} · ${escapeHtml(board.episodeTitle)} — ${escapeHtml(isEn ? "External Blind Review" : "외부 블라인드 검수")}</title>
<style>
:root{--bg:oklch(0.968 0.01 82);--surface:oklch(0.992 0.006 82);--raised:oklch(0.94 0.012 80);--line:oklch(0.84 0.015 76);--ink:oklch(0.22 0.018 60);--ink-muted:oklch(0.46 0.016 64);--accent:oklch(0.55 0.175 38);--on-accent:oklch(0.99 0.005 82);--warn-bg:oklch(0.93 0.05 80);--warn-ink:oklch(0.42 0.12 72);--wm-ink:oklch(0.32 0.04 38 / ${watermarkOpacity.toFixed(2)});}
*{box-sizing:border-box;} body{margin:0;font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5;word-break:keep-all;}
.watermark-layer{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:50;display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:48px;padding:24px;align-content:space-around;}
.wm-tile{display:flex;flex-direction:column;align-items:center;transform:rotate(-28deg);color:var(--wm-ink);font-size:13px;font-weight:700;letter-spacing:0.04em;user-select:none;text-align:center;} .wm-tile span{font-size:11px;font-weight:500;}
main{position:relative;z-index:10;max-width:920px;margin:0 auto;padding:28px 20px 64px;} header,.cut-card,.export-bar{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;} header{margin-bottom:20px;} header h1{margin:0 0 6px;font-size:20px;}
.meta-row{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--ink-muted);margin-top:8px;} .pill{background:var(--raised);border:1px solid var(--line);border-radius:999px;padding:4px 10px;font-weight:600;color:var(--ink);}
.expired-banner{display:none;margin-top:12px;background:var(--warn-bg);color:var(--warn-ink);border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;} .expired-banner.visible{display:block;} .internal-notes{background:var(--warn-bg);color:var(--warn-ink);border-radius:12px;padding:14px 16px;margin-bottom:20px;font-size:13px;}
.cut-grid{display:grid;gap:14px;} .cut-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;} .cut-head h3{margin:0;font-size:15px;flex:1;} .cut-badge{background:var(--accent);color:var(--on-accent);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;} .cut-status{font-size:11px;color:var(--ink-muted);background:var(--raised);border-radius:999px;padding:2px 8px;} .cut-preview{margin:0 0 12px;font-size:13px;color:var(--ink-muted);}
.cut-controls{display:grid;gap:8px;} .field-label{font-size:12px;font-weight:700;color:var(--ink-muted);} .decision-select,.comment-input{width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--bg);color:var(--ink);font:inherit;font-size:13px;}
.tag-group{border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:0;} .tag-group legend{font-size:11px;font-weight:700;color:var(--ink-muted);padding:0 4px;} .tag-list{display:flex;flex-wrap:wrap;gap:8px;} .tag-pill{display:inline-flex;align-items:center;gap:4px;font-size:12px;background:var(--raised);padding:4px 8px;border-radius:6px;cursor:pointer;}
.export-bar{position:sticky;bottom:16px;margin-top:24px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;} .btn-primary{background:var(--accent);color:var(--on-accent);border:0;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px;} .btn-primary:disabled{opacity:0.45;cursor:not-allowed;} .export-status{font-size:12px;color:var(--ink-muted);}
</style>
</head>
<body>
<div class="watermark-layer" aria-hidden="true">${buildWatermarkTiles(watermarkText, viewerOrganization)}</div>
<main>
  <header>
    <h1>${escapeHtml(board.workTitle)} · ${escapeHtml(board.episodeTitle)}</h1>
    <p class="cut-preview">${escapeHtml(isEn ? tokenSpec.honestyNoticeEn : tokenSpec.honestyNoticeKo)}</p>
    <div class="meta-row">
      <span class="pill">${escapeHtml(isEn ? "Reviewer" : "열람자")}: ${escapeHtml(viewerName)} (${escapeHtml(viewerOrganization)})</span>
      <span class="pill">${escapeHtml(isEn ? "Stage" : "검수 단계")}: ${escapeHtml(isEn ? stageMeta.labelEn : stageMeta.labelKo)}</span>
      <span class="pill">${escapeHtml(isEn ? "Expires" : "만료 시각")}: ${escapeHtml(expiresAtIso)}</span>
      <span class="pill">${escapeHtml(hideInternalNotes ? (isEn ? "Blind Mode: Internal Notes Stripped" : "블라인드 모드: 내부 메모 100% 차단") : (isEn ? "Internal Notes Included" : "내부 메모 포함"))}</span>
    </div>
    <div id="expired-banner" class="expired-banner" role="alert">${escapeHtml(isEn ? "This review package has expired." : "검수 링크 만료 시각이 경과했습니다.")}</div>
  </header>
  ${internalNotesSectionHtml}
  <section class="cut-grid">${cutCardsHtml}</section>
  <div class="export-bar">
    <span id="export-status" class="export-status">${escapeHtml(isEn ? "Export feedback JSON and send back to studio." : "검수 후 피드백 JSON을 내보내 스튜디오에 전달하세요.")}</span>
    <button id="export-feedback-btn" type="button" class="btn-primary">${escapeHtml(isEn ? "Download Feedback JSON" : "피드백 JSON 내보내기")}</button>
  </div>
</main>
<script>
(function(){
  var cfg=${inlineConfig};
  var btn=document.getElementById("export-feedback-btn"),st=document.getElementById("export-status"),exp=document.getElementById("expired-banner");
  var expMs=Date.parse(cfg.expiresAtIso);
  if(Number.isFinite(expMs)&&Date.now()>expMs){if(exp)exp.classList.add("visible");if(btn)btn.disabled=true;}
  if(!btn)return;
  btn.addEventListener("click",function(){
    var cards=document.querySelectorAll("[data-cut-id]"),items=[];
    for(var i=0;i<cards.length;i+=1){
      var c=cards[i],sel=c.querySelector("[data-field='decision']"),cm=c.querySelector("[data-field='comment']"),ch=c.querySelectorAll("input[type='checkbox']:checked"),tags=[];
      for(var j=0;j<ch.length;j+=1)tags.push(ch[j].value);
      items.push({cutId:c.getAttribute("data-cut-id")||"",stageId:cfg.stageId,decision:sel?sel.value:"approved",reasonTags:tags,comment:cm?cm.value.trim():"",reviewerName:cfg.viewerName,reviewerOrganization:cfg.viewerOrganization,submittedAtIso:new Date().toISOString(),tokenId:cfg.tokenId});
    }
    var payload={schemaVersion:"toonstudio.external-review-feedback.v1",tokenId:cfg.tokenId,episodeId:cfg.episodeId,stageId:cfg.stageId,viewerName:cfg.viewerName,viewerOrganization:cfg.viewerOrganization,items:items};
    var blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=cfg.episodeId+"-external-feedback.json";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    if(st)st.textContent="JSON exported ("+items.length+" cuts).";
  });
})();
</script>
</body>
</html>`;

  const sampleRejectCut = board.cuts[6]?.cutId ?? board.cuts[0]?.cutId ?? "cut-01";
  const sampleApproveCut = board.cuts[7]?.cutId ?? board.cuts[1]?.cutId ?? sampleRejectCut;
  const sampleFeedbackJson = JSON.stringify(
    {
      schemaVersion: "toonstudio.external-review-feedback.v1",
      tokenId,
      episodeId: board.episodeId,
      stageId,
      viewerName,
      viewerOrganization,
      items: [
        { cutId: sampleRejectCut, stageId, decision: "changes-requested", reasonTags: ["lettering", "pacing"], comment: isEn ? "Tighten dialogue balloon margin and widen vertical gutter before climax cut." : "클라이맥스 직전 말풍선 여백을 줄이고 세로 스크롤 간격을 넓혀 주세요.", reviewerName: viewerName, reviewerOrganization: viewerOrganization, submittedAtIso: issuedAtIso, tokenId },
        { cutId: sampleApproveCut, stageId, decision: "approved", reasonTags: [], comment: isEn ? "Staging and legibility approved." : "연출과 가독성 이상 없어 승인합니다.", reviewerName: viewerName, reviewerOrganization: viewerOrganization, submittedAtIso: issuedAtIso, tokenId },
      ],
    },
    null,
    2,
  );

  const slug = buildSlug(`${board.episodeId}-${stageId}`);
  return {
    tokenSpec,
    tokenSpecJson: JSON.stringify(tokenSpec, null, 2),
    html,
    htmlFilename: `${slug}-blind-review-${tokenId}.html`,
    jsonFilename: `${slug}-blind-token-${tokenId}.json`,
    byteSize: new TextEncoder().encode(html).length,
    sampleFeedbackJson,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 외부 PD 피드백 JSON 문자열을 검증하며 파싱한다. */
export function parseExternalReviewFeedbackJson(rawJson: string): ParsedExternalFeedbackPayload {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    return { items: [], errorMessageKo: "가져올 외부 피드백 JSON이 비어 있습니다.", errorMessageEn: "External feedback JSON input is empty." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      items: [],
      errorMessageKo: "유효한 JSON 형식이 아닙니다. 외부 검수 HTML에서 내보낸 JSON을 붙여넣으세요.",
      errorMessageEn: "Invalid JSON syntax. Paste JSON exported from the external review HTML.",
    };
  }

  const envelopeReviewer = isRecord(parsed) && typeof parsed.viewerName === "string" ? parsed.viewerName : "외부 PD";
  const envelopeOrg = isRecord(parsed) && typeof parsed.viewerOrganization === "string" ? parsed.viewerOrganization : undefined;
  const envelopeStage =
    isRecord(parsed) && typeof parsed.stageId === "string" && VALID_STAGE_SET.has(parsed.stageId)
      ? (parsed.stageId as SignoffStageId)
      : undefined;
  const envelopeTokenId = isRecord(parsed) && typeof parsed.tokenId === "string" ? parsed.tokenId : undefined;
  const rawList: unknown[] | null = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.items)
      ? parsed.items
      : null;

  if (!rawList) {
    return {
      items: [],
      errorMessageKo: "JSON 최상위에 피드백 배열 또는 `items` 배열이 필요합니다.",
      errorMessageEn: "Expected a feedback array or an object containing an `items` array.",
    };
  }

  const items: ExternalReviewFeedbackItem[] = [];
  for (const entry of rawList) {
    if (!isRecord(entry)) continue;
    const cutId = typeof entry.cutId === "string" ? entry.cutId.trim() : "";
    const decision = entry.decision;
    if (!cutId || (decision !== "approved" && decision !== "changes-requested")) continue;
    const stageId = typeof entry.stageId === "string" && VALID_STAGE_SET.has(entry.stageId) ? (entry.stageId as SignoffStageId) : envelopeStage;
    const rawTags = Array.isArray(entry.reasonTags) ? entry.reasonTags.filter((tag): tag is string => typeof tag === "string") : undefined;
    items.push({
      cutId, stageId, decision, reasonTags: sanitizeRejectionReasonTags(rawTags),
      comment: typeof entry.comment === "string" ? entry.comment : "",
      reviewerName: typeof entry.reviewerName === "string" && entry.reviewerName.trim().length > 0 ? entry.reviewerName.trim() : envelopeReviewer,
      reviewerOrganization: typeof entry.reviewerOrganization === "string" ? entry.reviewerOrganization : envelopeOrg,
      submittedAtIso: typeof entry.submittedAtIso === "string" ? entry.submittedAtIso : undefined,
      tokenId: typeof entry.tokenId === "string" ? entry.tokenId : envelopeTokenId,
    });
  }
  if (items.length === 0) {
    return { items: [], errorMessageKo: "적용 가능한 유효 피드백 항목(`cutId`, `decision`)을 찾지 못했습니다.", errorMessageEn: "No valid feedback items (`cutId`, `decision`) were found." };
  }
  return { items };
}

/** 외부 PD 피드백 JSON 항목을 작업자 결재 보드 해당 컷에 자동 귀속한다(타 컷 승인 보존). */
export function importExternalReviewFeedback(
  board: EpisodeSignoffBoard,
  feedbackItems: readonly ExternalReviewFeedbackItem[],
  options: ImportExternalFeedbackOptions = {},
): ExternalFeedbackImportResult {
  const validCutIds = new Set(board.cuts.map((cut) => cut.cutId));
  const expiresMs = options.expiresAtIso ? Date.parse(options.expiresAtIso) : Number.NaN;
  const beforeActiveKey = board.activeStageIds.join(",");
  let nextBoard = board;
  const appliedCutIds: string[] = [];
  const ignoredCutIds: string[] = [];
  const warnings: string[] = [];
  let approvedCount = 0;
  let changesRequestedCount = 0;

  for (const item of feedbackItems) {
    if (!validCutIds.has(item.cutId)) {
      ignoredCutIds.push(item.cutId);
      warnings.push(`존재하지 않는 컷(${item.cutId}) 피드백을 건너뛰었습니다.`);
      continue;
    }
    if (options.rejectExpired && Number.isFinite(expiresMs) && item.submittedAtIso) {
      const submittedMs = Date.parse(item.submittedAtIso);
      if (Number.isFinite(submittedMs) && submittedMs > expiresMs) {
        ignoredCutIds.push(item.cutId);
        warnings.push(`만료 시각 이후 제출된 컷(${item.cutId}) 피드백을 차단했습니다.`);
        continue;
      }
    }
    const targetStageId: SignoffStageId = item.stageId ?? options.defaultStageId ?? nextBoard.activeStageIds[0] ?? "pd-final";
    const orgSuffix = item.reviewerOrganization?.trim() ? ` (${item.reviewerOrganization.trim()})` : "";
    const reviewerLabel = `${item.reviewerName.trim() || options.defaultReviewerName || "외부 PD"}${orgSuffix}`;
    nextBoard = recordCutSignoffDecision(nextBoard, {
      cutId: item.cutId, stageId: targetStageId, status: item.decision, reviewerName: reviewerLabel,
      reasonTags: item.decision === "changes-requested" ? item.reasonTags : [],
      comment: item.comment, decisionSource: "external-pd",
      decidedAtIso: item.submittedAtIso ?? nextBoard.updatedAtIso, autoAdvance: options.autoAdvance ?? true,
    });
    appliedCutIds.push(item.cutId);
    if (item.decision === "approved") approvedCount += 1;
    else changesRequestedCount += 1;
  }

  return {
    board: nextBoard, appliedCount: appliedCutIds.length, approvedCount, changesRequestedCount,
    appliedCutIds, ignoredCutIds, warnings,
    autoAdvancedToStageIds: nextBoard.activeStageIds.join(",") !== beforeActiveKey ? nextBoard.activeStageIds : [],
  };
}

interface PinTrackState {
  pinId: string;
  cutId: string;
  stageId: SignoffStageId;
  reasonTag: RejectionReasonTag;
  summaryKo: string;
  summaryEn: string;
  everResolved: boolean;
  lastResolvedRoundLabel: string;
  lastReopenedRoundLabel: string;
  regressionCount: number;
  lifecycle: RegressedPinLifecyclePoint[];
}

/** 검수 라운드(v1->v2->v3) 회귀 핀(`regressed`) 자동 적발 및 공정별 SLA·병목 집계를 수행한다. */
export function analyzeReviewRoundsAndSla(
  rounds: readonly ReviewRoundSnapshot[],
): ReviewRoundsAndSlaReport {
  const sortedRounds = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const pinTracker = new Map<string, PinTrackState>();
  const roundSummaries: ReviewRoundSummary[] = [];
  const reasonCounts = new Map<RejectionReasonTag, number>(REJECTION_REASON_TAGS.map((tag) => [tag, 0]));
  const reviewDurations = new Map<SignoffStageId, number[]>(SIGNOFF_STAGE_ORDER.map((id) => [id, []]));
  const pinDurations = new Map<SignoffStageId, number[]>(SIGNOFF_STAGE_ORDER.map((id) => [id, []]));
  const firstRoundMetrics = new Map<SignoffStageId, { reviewed: number; firstPassApproved: number }>();
  const totalRework = new Map<SignoffStageId, number>(SIGNOFF_STAGE_ORDER.map((id) => [id, 0]));
  const slaOverrides = new Map<SignoffStageId, number>();
  const stageRegressed = new Map<SignoffStageId, Set<string>>(SIGNOFF_STAGE_ORDER.map((id) => [id, new Set()]));
  const stageOpen = new Map<SignoffStageId, Set<string>>(SIGNOFF_STAGE_ORDER.map((id) => [id, new Set()]));
  const stageAllPins = new Map<SignoffStageId, Set<string>>(SIGNOFF_STAGE_ORDER.map((id) => [id, new Set()]));

  for (const round of sortedRounds) {
    let roundOpen = 0;
    let roundResolved = 0;
    let roundRegressed = 0;

    for (const pin of round.pins) {
      const existing = pinTracker.get(pin.pinId);
      const summaryEn = pin.summaryEn?.trim() || pin.summaryKo;
      let analyzedStatus: ReviewPinAnalyzedStatus = pin.status;

      if (existing) {
        if (pin.status === "open" && existing.everResolved) {
          analyzedStatus = "regressed";
          existing.regressionCount += 1;
          existing.lastReopenedRoundLabel = round.roundLabel;
          stageRegressed.get(pin.stageId)?.add(pin.pinId);
        } else if (pin.status === "resolved") {
          existing.everResolved = true;
          existing.lastResolvedRoundLabel = round.roundLabel;
        }
        Object.assign(existing, { cutId: pin.cutId, stageId: pin.stageId, reasonTag: pin.reasonTag, summaryKo: pin.summaryKo, summaryEn });
        existing.lifecycle.push({ roundNumber: round.roundNumber, roundLabel: round.roundLabel, status: analyzedStatus });
      } else {
        pinTracker.set(pin.pinId, {
          pinId: pin.pinId, cutId: pin.cutId, stageId: pin.stageId, reasonTag: pin.reasonTag, summaryKo: pin.summaryKo, summaryEn,
          everResolved: pin.status === "resolved", lastResolvedRoundLabel: pin.status === "resolved" ? round.roundLabel : "",
          lastReopenedRoundLabel: "", regressionCount: 0,
          lifecycle: [{ roundNumber: round.roundNumber, roundLabel: round.roundLabel, status: analyzedStatus }],
        });
      }

      stageAllPins.get(pin.stageId)?.add(pin.pinId);
      if (analyzedStatus === "resolved") {
        roundResolved += 1;
        stageOpen.get(pin.stageId)?.delete(pin.pinId);
      } else {
        if (analyzedStatus === "regressed") roundRegressed += 1;
        else roundOpen += 1;
        reasonCounts.set(pin.reasonTag, (reasonCounts.get(pin.reasonTag) ?? 0) + 1);
        stageOpen.get(pin.stageId)?.add(pin.pinId);
      }
      if (typeof pin.reviewDurationMinutes === "number" && Number.isFinite(pin.reviewDurationMinutes)) {
        pinDurations.get(pin.stageId)?.push(Math.max(0, pin.reviewDurationMinutes));
      }
    }

    for (const review of round.stageReviews ?? []) {
      const safeDur = Math.max(0, Number.isFinite(review.reviewDurationMinutes) ? review.reviewDurationMinutes : 0);
      const safeRev = Math.max(0, Number.isFinite(review.reviewedCutCount) ? review.reviewedCutCount : 0);
      const safeFirst = clampFinite(review.approvedFirstPassCutCount, 0, safeRev, 0);
      const safeRework = Math.max(0, Number.isFinite(review.reworkCutCount) ? review.reworkCutCount : 0);
      reviewDurations.get(review.stageId)?.push(safeDur);
      totalRework.set(review.stageId, (totalRework.get(review.stageId) ?? 0) + safeRework);
      if (typeof review.slaTargetMinutes === "number" && Number.isFinite(review.slaTargetMinutes)) {
        slaOverrides.set(review.stageId, Math.max(1, review.slaTargetMinutes));
      }
      if (!firstRoundMetrics.has(review.stageId) && safeRev > 0) {
        firstRoundMetrics.set(review.stageId, { reviewed: safeRev, firstPassApproved: safeFirst });
      }
    }

    roundSummaries.push({ roundNumber: round.roundNumber, roundLabel: round.roundLabel, reviewedAtIso: round.reviewedAtIso, openCount: roundOpen, resolvedCount: roundResolved, regressedCount: roundRegressed, totalPinCount: round.pins.length });
  }

  const regressedPins: RegressedPinAlert[] = Array.from(pinTracker.values())
    .filter((t) => t.regressionCount > 0)
    .map((t) => ({ pinId: t.pinId, cutId: t.cutId, stageId: t.stageId, reasonTag: t.reasonTag, summaryKo: t.summaryKo, summaryEn: t.summaryEn, resolvedInRound: t.lastResolvedRoundLabel, reopenedInRound: t.lastReopenedRoundLabel, regressionCount: t.regressionCount, lifecycle: t.lifecycle }));

  const stageSlaReports: StageSlaBottleneckReport[] = [];
  let durationSum = 0;
  let durationSamples = 0;
  let firstPassReviewedTotal = 0;
  let firstPassApprovedTotal = 0;

  for (const stageId of SIGNOFF_STAGE_ORDER) {
    const rDur = reviewDurations.get(stageId) ?? [];
    const pDur = pinDurations.get(stageId) ?? [];
    const durations = rDur.length > 0 ? rDur : pDur;
    const sampleCount = durations.length;
    const avgReviewDurationMinutes = sampleCount > 0 ? round1(durations.reduce((a, b) => a + b, 0) / sampleCount) : 0;
    durationSum += durations.reduce((a, b) => a + b, 0);
    durationSamples += sampleCount;

    const firstRound = firstRoundMetrics.get(stageId);
    const totalPinsInStage = stageAllPins.get(stageId)?.size ?? 0;
    const regressedCount = stageRegressed.get(stageId)?.size ?? 0;
    const openCount = stageOpen.get(stageId)?.size ?? 0;

    let firstPassApprovalRatePct = 0;
    if (firstRound && firstRound.reviewed > 0) {
      firstPassApprovalRatePct = round1((firstRound.firstPassApproved / firstRound.reviewed) * 100);
      firstPassReviewedTotal += firstRound.reviewed;
      firstPassApprovedTotal += firstRound.firstPassApproved;
    } else if (totalPinsInStage > 0) {
      firstPassApprovalRatePct = round1((Math.max(0, totalPinsInStage - regressedCount - openCount) / totalPinsInStage) * 100);
    } else if (sampleCount > 0) {
      firstPassApprovalRatePct = 100;
    }

    const hasActivity = sampleCount > 0 || Boolean(firstRound) || totalPinsInStage > 0;
    const reworkRatePct = hasActivity ? round1(Math.max(0, 100 - firstPassApprovalRatePct)) : 0;
    const slaTargetMinutes = slaOverrides.get(stageId) ?? SIGNOFF_STAGE_META[stageId].defaultSlaMinutes;
    const slaDeltaMinutes = sampleCount > 0 ? round1(avgReviewDurationMinutes - slaTargetMinutes) : 0;
    const bottleneckScore = hasActivity ? round1(avgReviewDurationMinutes + reworkRatePct * 1.5 + regressedCount * 25) : 0;

    stageSlaReports.push({
      stageId, sampleCount, avgReviewDurationMinutes, slaTargetMinutes, slaDeltaMinutes,
      isOverSla: sampleCount > 0 && avgReviewDurationMinutes > slaTargetMinutes,
      firstPassApprovalRatePct, reworkRatePct, totalReworkCuts: totalRework.get(stageId) ?? openCount + regressedCount,
      regressedPinCount: regressedCount, openPinCount: openCount, bottleneckScore,
    });
  }

  const activeReports = stageSlaReports.filter((r) => r.bottleneckScore > 0);
  const topBottleneckStage = activeReports.length > 0 ? [...activeReports].sort((a, b) => b.bottleneckScore - a.bottleneckScore)[0] : null;
  const timedReports = stageSlaReports.filter((r) => r.sampleCount > 0);
  const slowestStage = timedReports.length > 0 ? [...timedReports].sort((a, b) => b.avgReviewDurationMinutes - a.avgReviewDurationMinutes)[0] : null;

  const totalReasons = Array.from(reasonCounts.values()).reduce((a, b) => a + b, 0);
  const rejectionReasonBreakdown: RejectionReasonBreakdownItem[] = REJECTION_REASON_TAGS.map((tag) => {
    const count = reasonCounts.get(tag) ?? 0;
    return { reasonTag: tag, count, sharePct: totalReasons > 0 ? round1((count / totalReasons) * 100) : 0 };
  }).sort((a, b) => b.count - a.count);

  const overallFirstPassApprovalRatePct =
    firstPassReviewedTotal > 0
      ? round1((firstPassApprovedTotal / firstPassReviewedTotal) * 100)
      : activeReports.length > 0
        ? round1(activeReports.reduce((acc, r) => acc + r.firstPassApprovalRatePct, 0) / activeReports.length)
        : 0;

  return {
    totalRounds: sortedRounds.length,
    totalUniquePins: pinTracker.size,
    regressedPins,
    regressedPinCount: regressedPins.length,
    overallAvgReviewDurationMinutes: durationSamples > 0 ? round1(durationSum / durationSamples) : 0,
    overallFirstPassApprovalRatePct,
    topRejectionReason: rejectionReasonBreakdown[0]?.count ? rejectionReasonBreakdown[0] : null,
    rejectionReasonBreakdown,
    topBottleneckStage,
    slowestStage,
    stageSlaReports,
    roundSummaries,
  };
}

/** 기본 검수 라운드 샘플(v1 -> v2 -> v3): v2 해결 핀 2건이 v3에서 회귀 재오픈된 스튜디오 실무 시나리오. */
export const DEFAULT_REVIEW_ROUNDS: readonly ReviewRoundSnapshot[] = [
  {
    roundNumber: 1,
    roundLabel: "v1",
    reviewedAtIso: "2026-11-20T14:00:00+09:00",
    pins: [
      { pinId: "pin-cut07-hand", cutId: "cut-07", stageId: "lineart", reasonTag: "art", status: "open", summaryKo: "검집 발도 오른손 손가락 비율·손목 꺾임 수정", summaryEn: "Fix sword-draw right hand finger proportion and wrist angle" },
      { pinId: "pin-cut04-balloon", cutId: "cut-04", stageId: "lettering", reasonTag: "lettering", status: "open", summaryKo: "복도 대치 컷 말풍선 꼬리가 인물 눈선에 겹침", summaryEn: "Dialogue balloon tail overlaps character eye-line" },
      { pinId: "pin-cut08-bg-persp", cutId: "cut-08", stageId: "bg3d", reasonTag: "art", status: "open", summaryKo: "3D 파편 원근 소실점이 인물 지면선과 불일치", summaryEn: "3D debris perspective vanishing point mismatches ground plane" },
      { pinId: "pin-cut10-tone", cutId: "cut-10", stageId: "shading", reasonTag: "color", status: "open", summaryKo: "역광 림라이트 명도가 어두워 실루엣 판독 저하", summaryEn: "Backlight rim value too dark for silhouette readability" },
    ],
    stageReviews: [
      { stageId: "conti", reviewedCutCount: 12, approvedFirstPassCutCount: 11, reworkCutCount: 1, reviewDurationMinutes: 38 },
      { stageId: "lineart", reviewedCutCount: 12, approvedFirstPassCutCount: 8, reworkCutCount: 4, reviewDurationMinutes: 112 },
      { stageId: "bg3d", reviewedCutCount: 12, approvedFirstPassCutCount: 9, reworkCutCount: 3, reviewDurationMinutes: 88 },
      { stageId: "flatting", reviewedCutCount: 12, approvedFirstPassCutCount: 11, reworkCutCount: 1, reviewDurationMinutes: 52 },
      { stageId: "shading", reviewedCutCount: 12, approvedFirstPassCutCount: 7, reworkCutCount: 5, reviewDurationMinutes: 128 },
      { stageId: "lettering", reviewedCutCount: 12, approvedFirstPassCutCount: 10, reworkCutCount: 2, reviewDurationMinutes: 36 },
      { stageId: "pd-final", reviewedCutCount: 12, approvedFirstPassCutCount: 10, reworkCutCount: 2, reviewDurationMinutes: 48 },
    ],
  },
  {
    roundNumber: 2,
    roundLabel: "v2",
    reviewedAtIso: "2026-11-21T16:30:00+09:00",
    pins: [
      { pinId: "pin-cut07-hand", cutId: "cut-07", stageId: "lineart", reasonTag: "art", status: "resolved", summaryKo: "검집 발도 오른손 손가락 비율 수정 완료", summaryEn: "Sword-draw right hand proportion corrected" },
      { pinId: "pin-cut04-balloon", cutId: "cut-04", stageId: "lettering", reasonTag: "lettering", status: "resolved", summaryKo: "말풍선 위치 상향 조정 완료", summaryEn: "Dialogue balloon repositioned upward" },
      { pinId: "pin-cut08-bg-persp", cutId: "cut-08", stageId: "bg3d", reasonTag: "art", status: "resolved", summaryKo: "3D 카메라 화각 재렌더 완료", summaryEn: "3D camera FOV re-rendered" },
      { pinId: "pin-cut10-tone", cutId: "cut-10", stageId: "shading", reasonTag: "color", status: "open", summaryKo: "역광 명도 2차 보정 추가 요청", summaryEn: "Second pass requested for rim-light value" },
    ],
    stageReviews: [
      { stageId: "lineart", reviewedCutCount: 4, approvedFirstPassCutCount: 3, reworkCutCount: 1, reviewDurationMinutes: 96 },
      { stageId: "bg3d", reviewedCutCount: 3, approvedFirstPassCutCount: 3, reworkCutCount: 0, reviewDurationMinutes: 72 },
      { stageId: "shading", reviewedCutCount: 5, approvedFirstPassCutCount: 3, reworkCutCount: 2, reviewDurationMinutes: 118 },
      { stageId: "lettering", reviewedCutCount: 2, approvedFirstPassCutCount: 2, reworkCutCount: 0, reviewDurationMinutes: 32 },
    ],
  },
  {
    roundNumber: 3,
    roundLabel: "v3",
    reviewedAtIso: "2026-11-22T18:15:00+09:00",
    pins: [
      { pinId: "pin-cut07-hand", cutId: "cut-07", stageId: "lineart", reasonTag: "art", status: "open", summaryKo: "후보정 머지 과정에서 v1 구선화 레이어가 복원되어 손가락 오류 재발", summaryEn: "Legacy v1 lineart layer merged back during FX pass; hand error returned" },
      { pinId: "pin-cut10-tone", cutId: "cut-10", stageId: "shading", reasonTag: "color", status: "resolved", summaryKo: "역광 림라이트 대비 보정 통과", summaryEn: "Rim-light contrast correction passed" },
      { pinId: "pin-cut04-balloon", cutId: "cut-04", stageId: "lettering", reasonTag: "lettering", status: "open", summaryKo: "최종 식자 폰트 교체 후 줄바꿈이 다시 얼굴 영역 침범", summaryEn: "Font swap caused dialogue line wrap to intrude into face area again" },
      { pinId: "pin-cut12-pacing", cutId: "cut-12", stageId: "pd-final", reasonTag: "pacing", status: "open", summaryKo: "엔딩 훅 컷 직전 스크롤 여백 200px 추가 권장", summaryEn: "Add 200px vertical gutter before ending hook cut" },
    ],
    stageReviews: [
      { stageId: "lineart", reviewedCutCount: 2, approvedFirstPassCutCount: 1, reworkCutCount: 1, reviewDurationMinutes: 104 },
      { stageId: "shading", reviewedCutCount: 2, approvedFirstPassCutCount: 2, reworkCutCount: 0, reviewDurationMinutes: 110 },
      { stageId: "lettering", reviewedCutCount: 2, approvedFirstPassCutCount: 1, reworkCutCount: 1, reviewDurationMinutes: 44 },
      { stageId: "pd-final", reviewedCutCount: 12, approvedFirstPassCutCount: 10, reworkCutCount: 2, reviewDurationMinutes: 54 },
    ],
  },
];
