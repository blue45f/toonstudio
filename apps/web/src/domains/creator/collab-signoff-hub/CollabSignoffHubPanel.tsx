/**
 * 사람 협업 검수 허브 패널: 다중 직무 결재선·컷별 부분 승인 · 외부 PD 블라인드 링크 · 라운드 회귀 & SLA 병목.
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 미사용 · 명시적 transition 속성만 사용 · 순수 로컬 상태/정적 HTML 생성).
 */

import { AlertTriangle, Check, Code2, Download, EyeOff, FileUp, GitBranch, Layers, ShieldCheck, Timer } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_REVIEW_ROUNDS, analyzeReviewRoundsAndSla, buildExternalBlindReviewPackage,
  importExternalReviewFeedback, parseExternalReviewFeedbackJson, type ReviewRoundSnapshot,
} from "./blind-review-and-sla-engine";
import {
  REJECTION_REASON_META, REJECTION_REASON_TAGS, SIGNOFF_STAGE_META, SIGNOFF_STAGE_ORDER,
  approveRemainingCutsInStage, canAdvanceEpisodeToNextGate, createInitialEpisodeSignoffBoard,
  recordCutSignoffDecision, summarizeBoardOverview, summarizeStageProgress, toggleParallelBgLineartMode,
  type CutSignoffStatus, type EpisodeSignoffBoard, type RejectionReasonTag, type SignoffStageId,
} from "./multi-role-signoff-engine";

export interface CollabSignoffHubPanelProps {
  readonly initialWorkTitle?: string;
  readonly initialEpisodeTitle?: string;
  readonly initialBoard?: EpisodeSignoffBoard;
  readonly initialReviewRounds?: readonly ReviewRoundSnapshot[];
}

type HubTabId = "signoff-gates" | "blind-review" | "round-sla";

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-fg-3 ${FOCUS_RING}`;
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_BAD = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-bad bg-bad-soft px-3 py-2 text-xs font-semibold text-bad transition-colors motion-reduce:transition-none hover:bg-raised ${FOCUS_RING}`;

function triggerLocalDownload(filename: string, content: string, mimeType: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function statusBadge(status: CutSignoffStatus, isEn: boolean): { readonly label: string; readonly cls: string } {
  if (status === "approved") return { label: isEn ? "Approved" : "승인", cls: "bg-good-soft text-good" };
  if (status === "changes-requested") return { label: isEn ? "Changes Req." : "반려", cls: "bg-bad-soft text-bad" };
  if (status === "in-review") return { label: isEn ? "In Review" : "검수중", cls: "bg-warning-soft text-warn" };
  return { label: isEn ? "Pending" : "대기", cls: "bg-raised text-fg-2" };
}

export function CollabSignoffHubPanel({
  initialWorkTitle,
  initialEpisodeTitle,
  initialBoard,
  initialReviewRounds,
}: CollabSignoffHubPanelProps = {}): ReactElement {
  const uid = useId();
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<HubTabId>("signoff-gates");
  const [board, setBoard] = useState<EpisodeSignoffBoard>(
    () => initialBoard ?? createInitialEpisodeSignoffBoard({ workTitle: initialWorkTitle, episodeTitle: initialEpisodeTitle, preset: "in-progress" }),
  );
  const [selectedStageId, setSelectedStageId] = useState<SignoffStageId>(() => board.activeStageIds[0] ?? "lineart");
  const [selectedReasonTags, setSelectedReasonTags] = useState<readonly RejectionReasonTag[]>(["art"]);
  const [rejectComment, setRejectComment] = useState("");
  const [statusNotice, setStatusNotice] = useState("");

  const [viewerNameDraft, setViewerNameDraft] = useState<string | null>(null);
  const [viewerOrgDraft, setViewerOrgDraft] = useState<string | null>(null);
  const [expiresAtIso, setExpiresAtIso] = useState("2026-11-26T18:00:00+09:00");
  const [blindStageId, setBlindStageId] = useState<SignoffStageId>("lineart");
  const [hideInternalNotes, setHideInternalNotes] = useState(true);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [feedbackJsonInput, setFeedbackJsonInput] = useState("");
  const [importError, setImportError] = useState("");

  const viewerName = viewerNameDraft ?? pick("김서연 PD", "Seoyeon Kim PD");
  const viewerOrg = viewerOrgDraft ?? pick("문라이트 웹툰 출판사", "Moonlight Webtoon Press");
  const reviewRounds = initialReviewRounds ?? DEFAULT_REVIEW_ROUNDS;

  const overview = useMemo(() => summarizeBoardOverview(board), [board]);
  const gateCheck = useMemo(() => canAdvanceEpisodeToNextGate(board), [board]);
  const isParallelEnabled = useMemo(() => board.gates.some((g) => g.stageId === "bg3d" && g.mode === "parallel"), [board.gates]);
  const blindPackage = useMemo(
    () => buildExternalBlindReviewPackage({ board, targetStageId: blindStageId, viewerName, viewerOrganization: viewerOrg, expiresAtIso, hideInternalNotes, language: isEn ? "en" : "ko" }),
    [blindStageId, board, expiresAtIso, hideInternalNotes, isEn, viewerName, viewerOrg],
  );
  const slaReport = useMemo(() => analyzeReviewRoundsAndSla(reviewRounds), [reviewRounds]);

  const toggleReasonTag = (tag: RejectionReasonTag): void => {
    setSelectedReasonTags((prev) => (prev.includes(tag) ? (prev.length > 1 ? prev.filter((item) => item !== tag) : prev) : [...prev, tag]));
  };

  const handleCutDecision = (cutId: string, status: "approved" | "changes-requested"): void => {
    const beforeStages = board.activeStageIds.join(",");
    const nextBoard = recordCutSignoffDecision(board, {
      cutId,
      stageId: selectedStageId,
      status,
      reviewerName: pick("정하윤 작가", "Hayun Jeong"),
      reasonTags: status === "changes-requested" ? selectedReasonTags : [],
      comment: status === "changes-requested" ? rejectComment.trim() || pick("컷 부분 수정 요청", "Partial cut revision requested") : pick("컷 부분 승인 완료", "Cut approved"),
    });
    setBoard(nextBoard);
    if (nextBoard.activeStageIds.join(",") !== beforeStages && nextBoard.activeStageIds.length > 0) {
      setSelectedStageId(nextBoard.activeStageIds[0]);
      const promoted = nextBoard.activeStageIds.map((id) => pick(SIGNOFF_STAGE_META[id].labelKo, SIGNOFF_STAGE_META[id].labelEn)).join(" + ");
      setStatusNotice(pick(`${cutId} 승인 완료 — 미해결 반려 0건 확인, ${promoted} 결재선으로 자동 승격했습니다.`, `${cutId} approved — 0 unresolved rejections; auto-advanced to ${promoted}.`));
      return;
    }
    setStatusNotice(
      status === "approved"
        ? pick(`${cutId} 컷을 승인했습니다.`, `Approved ${cutId}.`)
        : pick(`${cutId} 컷만 부분 반려했습니다. 기존 승인 컷은 그대로 유지됩니다.`, `Requested changes on ${cutId} only; previously approved cuts remain intact.`),
    );
  };

  const handleApproveRemaining = (): void => {
    const beforeStages = board.activeStageIds.join(",");
    const nextBoard = approveRemainingCutsInStage(board, selectedStageId, pick("정하윤 작가", "Hayun Jeong"), false);
    setBoard(nextBoard);
    if (nextBoard.activeStageIds.join(",") !== beforeStages && nextBoard.activeStageIds.length > 0) setSelectedStageId(nextBoard.activeStageIds[0]);
    setStatusNotice(pick("현재 단계의 대기·검수중 컷을 일괄 승인했습니다.", "Approved remaining pending cuts in this stage."));
  };

  const handleToggleParallel = (): void => {
    const nextParallel = !isParallelEnabled;
    const nextBoard = toggleParallelBgLineartMode(board, nextParallel);
    setBoard(nextBoard);
    if (nextBoard.activeStageIds[0]) setSelectedStageId(nextBoard.activeStageIds[0]);
    setStatusNotice(nextParallel ? pick("선화 + 3D 배경 병렬 게이트 모드로 전환했습니다.", "Switched to parallel Lineart + 3D BG gate mode.") : pick("7단계 완전 순차 결재선 모드로 전환했습니다.", "Switched to strict 7-stage sequential gate mode."));
  };

  const applyExternalFeedback = (rawJson: string): void => {
    setImportError("");
    const parsed = parseExternalReviewFeedbackJson(rawJson);
    if (parsed.items.length === 0) {
      setImportError(pick(parsed.errorMessageKo ?? "유효한 피드백이 없습니다.", parsed.errorMessageEn ?? "No valid feedback found."));
      return;
    }
    const res = importExternalReviewFeedback(board, parsed.items, { defaultStageId: blindStageId });
    setBoard(res.board);
    setStatusNotice(pick(`외부 PD 피드백 ${res.appliedCount}건(${res.appliedCutIds.join(", ")})을 결재 보드에 귀속했습니다 (승인 ${res.approvedCount} · 반려 ${res.changesRequestedCount}).`, `Imported ${res.appliedCount} external PD feedback item(s) (${res.appliedCutIds.join(", ")}) — ${res.approvedCount} approved, ${res.changesRequestedCount} changes requested.`));
  };

  const tabs: readonly { readonly id: HubTabId; readonly label: string }[] = [
    { id: "signoff-gates", label: pick("다중 결재선·컷별 부분 승인", "Multi-Role Gates & Cut Sign-off") },
    { id: "blind-review", label: pick("외부 PD 블라인드 링크", "External PD Blind Link") },
    { id: "round-sla", label: pick("라운드 회귀·SLA 병목", "Round Regressions & SLA") },
  ];

  const activeStageLabel =
    board.activeStageIds.length > 0
      ? board.activeStageIds.map((id) => pick(SIGNOFF_STAGE_META[id].labelKo, SIGNOFF_STAGE_META[id].labelEn)).join(" + ")
      : pick("최종 승인 완료", "Final Approved");

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 text-fg [word-break:keep-all]" aria-label={pick("사람 협업 검수 허브", "Human Collab Sign-off Hub")}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">{pick("사람 협업 검수 허브", "Human Collab Sign-off Hub")}</h2>
            <span className="rounded-full bg-raised px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
              {initialWorkTitle?.trim() || pick(board.workTitle, "Moonlight Atelier Contract")} · {initialEpisodeTitle?.trim() || pick(board.episodeTitle, "EP.14 Seal Fracture")}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick("7단계 다중 직무 결재선, 컷별 부분 승인·반려, 워터마크 외부 블라인드 HTML 패키지, v1→v3 회귀 핀 및 공정 SLA를 로컬에서 투명하게 관리합니다.", "Manage 7-stage multi-role sign-off gates, partial cut approvals, watermarked blind review HTML packages, and v1-v3 regression SLA metrics locally.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">{pick(`활성 단계: ${activeStageLabel}`, `Active: ${activeStageLabel}`)}</span>
          <span className="rounded-full bg-good-soft px-3 py-1 font-semibold text-good">{pick(`전체 진척 ${overview.overallCompletionPct}%`, `Overall ${overview.overallCompletionPct}%`)}</span>
        </div>
      </header>

      <div role="tablist" aria-label={pick("협업 검수 허브 탭", "Collab sign-off hub tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_SOLID : BTN_OUTLINE}>
            {tab.label}
          </button>
        ))}
      </div>

      {statusNotice ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{statusNotice}</span>
        </div>
      ) : null}

      {activeTab === "signoff-gates" ? (
        <div id={`${uid}-panel-signoff-gates`} role="tabpanel" aria-labelledby={`${uid}-tab-signoff-gates`} className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card p-3.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <GitBranch className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="font-bold text-fg">{isParallelEnabled ? pick("병렬 게이트 활성 (선화 + 3D 배경 동시 진행)", "Parallel Gate Active (Lineart + 3D BG)") : pick("7단계 순차 게이트 활성", "Strict 7-Stage Sequential Gate")}</span>
              <span className="text-fg-2 tabular-nums">{pick(`완료 단계 ${overview.completedStageCount}/${overview.totalStages}`, `Completed ${overview.completedStageCount}/${overview.totalStages}`)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleToggleParallel} className={BTN_OUTLINE}>{isParallelEnabled ? pick("순차 결재선으로 전환", "Switch to Sequential") : pick("선화+3D 병렬 전환", "Enable Parallel Gate")}</button>
              <button type="button" onClick={handleApproveRemaining} className={BTN_SOLID}><Check className="h-3.5 w-3.5" aria-hidden="true" />{pick("현재 단계 잔여 컷 승인", "Approve Remaining Cuts")}</button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {SIGNOFF_STAGE_ORDER.map((stageId) => {
              const meta = SIGNOFF_STAGE_META[stageId];
              const p = summarizeStageProgress(board, stageId);
              const selected = selectedStageId === stageId;
              const badgeCls = p.isComplete ? "bg-good-soft text-good" : p.rejectedCount > 0 ? "bg-bad-soft text-bad" : p.isActive ? "bg-accent-soft text-accent" : "bg-raised text-fg-3";
              return (
                <button key={stageId} type="button" aria-pressed={selected} onClick={() => setSelectedStageId(stageId)} className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-2.5 text-left text-xs transition-colors motion-reduce:transition-none ${FOCUS_RING} ${selected ? "border-accent bg-accent-soft" : "border-line bg-card hover:bg-raised"}`}>
                  <div className="flex w-full items-center justify-between gap-1">
                    <span className="font-bold text-fg">{pick(meta.labelKo, meta.labelEn)}</span>
                    <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] font-semibold text-fg-2">{p.mode === "parallel" ? pick("병렬", "PAR") : pick("순차", "SEQ")}</span>
                  </div>
                  <span className="text-[11px] text-fg-3">{pick(meta.roleKo, meta.roleEn)}</span>
                  <span className={`mt-auto rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${badgeCls}`}>
                    {p.approvedCount}/{p.totalCuts}{p.rejectedCount > 0 ? pick(` · 반려 ${p.rejectedCount}`, ` · ${p.rejectedCount} Rej`) : ""}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-xs">
            <span className="font-semibold text-fg-2">
              {gateCheck.isEpisodeFullyApproved ? pick("전 공정 7단계 최종 승인 완료", "All 7 stages final-approved") : gateCheck.blockingReasonsKo.length > 0 ? pick(`승격 대기 사유: ${gateCheck.blockingReasonsKo[0]}`, `Gate hold: ${gateCheck.blockingReasonsEn[0]}`) : pick("선행 필수 단계 및 반려 0건 확인 완료", "Predecessors satisfied & 0 unresolved rejections")}
            </span>
            <span className="font-semibold text-fg-3 tabular-nums">{pick(`미해결 반려 ${gateCheck.unresolvedRejectionCount}건 · 대기 ${gateCheck.pendingCutCount}컷`, `${gateCheck.unresolvedRejectionCount} rejected · ${gateCheck.pendingCutCount} pending`)}</span>
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><Layers className="h-4 w-4 text-accent" aria-hidden="true" />{pick(`${SIGNOFF_STAGE_META[selectedStageId].labelKo} 컷별 부분 승인·반려`, `${SIGNOFF_STAGE_META[selectedStageId].labelEn} Partial Cut Sign-off`)}</h3>
                <p className="text-xs text-fg-2">{pick("특정 컷만 반려해도 이미 승인된 타 컷의 승인은 무효화되지 않습니다.", "Rejecting one cut preserves approvals on all other cuts.")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("반려 사유 태그 선택", "Rejection reason tags")}>
                {REJECTION_REASON_TAGS.map((tag) => {
                  const active = selectedReasonTags.includes(tag);
                  return (
                    <button key={tag} type="button" aria-pressed={active} onClick={() => toggleReasonTag(tag)} className={`min-h-11 cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING} ${active ? "border-bad bg-bad-soft text-bad" : "border-line bg-card text-fg-2 hover:bg-raised"}`}>
                      {pick(REJECTION_REASON_META[tag].labelKo, REJECTION_REASON_META[tag].labelEn)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor={`${uid}-reject-comment`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("반려 시 남길 수정 메모 (선택)", "Revision Note for Rejection (Optional)")}</label>
              <input id={`${uid}-reject-comment`} type="text" value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} placeholder={pick("예: 손가락 파지 각도 보정 후 재업로드 요청", "e.g., Adjust hand grip angle and re-upload")} className={INPUT_CLS} />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {board.cuts.map((cut) => {
                const state = cut.stageStates[selectedStageId];
                const badge = statusBadge(state.status, isEn);
                return (
                  <article key={cut.cutId} data-cut-card={cut.cutId} className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-fg tabular-nums">{cut.cutId.toUpperCase()} · {pick(cut.sceneTitleKo, cut.sceneTitleEn)}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-fg-2">
                      {state.decisionSource === "external-pd" ? <span className="rounded bg-warning-soft px-1.5 py-0.5 font-semibold text-warn">{pick("외부 PD", "External PD")}</span> : null}
                      {state.reasonTags.map((tag) => <span key={tag} className="rounded bg-bad-soft px-1.5 py-0.5 font-semibold text-bad">{pick(REJECTION_REASON_META[tag].labelKo, REJECTION_REASON_META[tag].labelEn)}</span>)}
                      {state.comment ? <span className="line-clamp-1 text-fg-3">{isEn && state.decisionSource === "studio-internal" ? "Studio review note" : state.comment}</span> : null}
                    </div>
                    <div className="mt-auto flex gap-2 pt-1">
                      <button type="button" onClick={() => handleCutDecision(cut.cutId, "approved")} className={`flex-1 ${BTN_OUTLINE}`}>{pick(`${cut.cutId} 승인`, `Approve ${cut.cutId}`)}</button>
                      <button type="button" onClick={() => handleCutDecision(cut.cutId, "changes-requested")} className={`flex-1 ${BTN_BAD}`}>{pick(`${cut.cutId} 반려`, `Reject ${cut.cutId}`)}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "blind-review" ? (
        <div id={`${uid}-panel-blind-review`} role="tabpanel" aria-labelledby={`${uid}-tab-blind-review`} className="flex flex-col gap-5">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor={`${uid}-viewer-name`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("열람자 이름", "Viewer Name")}</label>
              <input id={`${uid}-viewer-name`} type="text" value={viewerName} onChange={(e) => setViewerNameDraft(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label htmlFor={`${uid}-viewer-org`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("소속 출판사·플랫폼", "Organization")}</label>
              <input id={`${uid}-viewer-org`} type="text" value={viewerOrg} onChange={(e) => setViewerOrgDraft(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label htmlFor={`${uid}-expires`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("링크 만료 시각 (ISO)", "Expires At (ISO)")}</label>
              <input id={`${uid}-expires`} type="text" value={expiresAtIso} onChange={(e) => setExpiresAtIso(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label htmlFor={`${uid}-blind-stage`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("검수 대상 공정", "Target Stage")}</label>
              <select id={`${uid}-blind-stage`} value={blindStageId} onChange={(e) => setBlindStageId(e.target.value as SignoffStageId)} className={INPUT_CLS}>
                {SIGNOFF_STAGE_ORDER.map((id) => <option key={id} value={id}>{pick(SIGNOFF_STAGE_META[id].labelKo, SIGNOFF_STAGE_META[id].labelEn)}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4">
            <label htmlFor={`${uid}-blind-toggle`} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold text-fg">
              <input id={`${uid}-blind-toggle`} type="checkbox" checked={hideInternalNotes} onChange={(e) => setHideInternalNotes(e.target.checked)} className="h-4 w-4 accent-accent" />
              <EyeOff className="h-4 w-4 text-accent" aria-hidden="true" />
              {pick("블라인드 모드: 내부 스튜디오 잡담·어시 메모 100% 차단", "Blind Mode: Strip 100% of Internal Studio Notes")}
            </label>
            <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
              <span className="rounded-full bg-good-soft px-2.5 py-1 font-semibold text-good">{pick(`제거된 내부 메모 ${blindPackage.tokenSpec.strippedInternalNoteCount}건`, `Stripped ${blindPackage.tokenSpec.strippedInternalNoteCount} internal notes`)}</span>
              <span className="rounded-full bg-raised px-2.5 py-1 font-semibold text-fg-2">{`${(blindPackage.byteSize / 1024).toFixed(1)} KB`}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-canvas p-4">
            <p className="text-xs font-semibold text-fg-2">{pick(`워터마크 패턴: ${blindPackage.tokenSpec.watermarkText}`, `Watermark pattern: ${blindPackage.tokenSpec.watermarkText}`)}</p>
            <p className="text-[11px] text-fg-3">{pick(blindPackage.tokenSpec.honestyNoticeKo, blindPackage.tokenSpec.honestyNoticeEn)}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN_SOLID} onClick={() => { triggerLocalDownload(blindPackage.htmlFilename, blindPackage.html, "text/html;charset=utf-8"); setStatusNotice(pick(`${blindPackage.htmlFilename} 블라인드 HTML 다운로드를 시작했습니다.`, `Downloaded ${blindPackage.htmlFilename}.`)); }}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />{pick("정적 블라인드 HTML 다운로드", "Download Blind HTML")}
              </button>
              <button type="button" className={BTN_OUTLINE} onClick={() => { triggerLocalDownload(blindPackage.jsonFilename, blindPackage.tokenSpecJson, "application/json;charset=utf-8"); setStatusNotice(pick(`${blindPackage.jsonFilename} 토큰 스펙 JSON을 저장했습니다.`, `Downloaded ${blindPackage.jsonFilename}.`)); }}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />{pick("토큰 스펙 JSON 다운로드", "Download Token JSON")}
              </button>
              <button type="button" className={BTN_OUTLINE} onClick={() => setShowHtmlPreview((v) => !v)}>
                <Code2 className="h-3.5 w-3.5" aria-hidden="true" />{showHtmlPreview ? pick("HTML 코드 접기", "Hide HTML") : pick("HTML 코드 점검", "Inspect HTML")}
              </button>
            </div>
            {showHtmlPreview ? <pre className="max-h-48 overflow-auto rounded-lg border border-line bg-panel p-3 text-[11px] text-fg-2"><code>{blindPackage.html}</code></pre> : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><FileUp className="h-4 w-4 text-accent" aria-hidden="true" />{pick("외부 PD 피드백 JSON 결재 보드 귀속", "Import External PD Feedback JSON")}</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_SOLID} onClick={() => { setFeedbackJsonInput(blindPackage.sampleFeedbackJson); applyExternalFeedback(blindPackage.sampleFeedbackJson); }}>
                  {pick("외부 피드백 가져오기 시뮬레이션", "Simulate External Feedback Import")}
                </button>
                <button type="button" className={BTN_OUTLINE} onClick={() => applyExternalFeedback(feedbackJsonInput)}>{pick("붙여넣은 JSON 적용", "Apply Pasted JSON")}</button>
              </div>
            </div>
            <label htmlFor={`${uid}-feedback-json`} className="text-xs font-semibold text-fg-2">{pick("외부 검수 HTML에서 내보낸 피드백 JSON", "Feedback JSON exported from Blind Review HTML")}</label>
            <textarea id={`${uid}-feedback-json`} rows={4} value={feedbackJsonInput} onChange={(e) => setFeedbackJsonInput(e.target.value)} placeholder={pick("외부 PD 피드백 JSON을 붙여넣거나 시뮬레이션 버튼을 누르세요.", "Paste external PD feedback JSON or click Simulate.")} className={`w-full rounded-lg border border-line bg-canvas p-3 font-mono text-xs text-fg ${FOCUS_RING}`} />
            {importError ? <p role="alert" className="text-xs font-semibold text-bad">{importError}</p> : null}
          </div>
        </div>
      ) : null}

      {activeTab === "round-sla" ? (
        <div id={`${uid}-panel-round-sla`} role="tabpanel" aria-labelledby={`${uid}-tab-round-sla`} className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 tabular-nums">
            <article className="rounded-xl bg-card p-3.5"><span className="text-[11px] font-semibold text-fg-3">{pick("회귀 적발 핀 (v1→v3)", "Regressed Pins (v1-v3)")}</span><p className="mt-1 text-xl font-extrabold text-bad">{pick(`${slaReport.regressedPinCount}건`, `${slaReport.regressedPinCount}`)}</p></article>
            <article className="rounded-xl bg-card p-3.5"><span className="text-[11px] font-semibold text-fg-3">{pick("전체 1차 통과율", "Overall 1st-Pass Rate")}</span><p className="mt-1 text-xl font-extrabold text-good">{`${slaReport.overallFirstPassApprovalRatePct}%`}</p></article>
            <article className="rounded-xl bg-card p-3.5"><span className="text-[11px] font-semibold text-fg-3">{pick("병목 공정 1위", "#1 Bottleneck Stage")}</span><p className="mt-1 text-base font-extrabold text-fg">{slaReport.topBottleneckStage ? pick(SIGNOFF_STAGE_META[slaReport.topBottleneckStage.stageId].labelKo, SIGNOFF_STAGE_META[slaReport.topBottleneckStage.stageId].labelEn) : "-"}</p></article>
            <article className="rounded-xl bg-card p-3.5"><span className="text-[11px] font-semibold text-fg-3">{pick("최다 반려 사유", "Top Rejection Reason")}</span><p className="mt-1 text-base font-extrabold text-warn">{slaReport.topRejectionReason ? `${pick(REJECTION_REASON_META[slaReport.topRejectionReason.reasonTag].labelKo, REJECTION_REASON_META[slaReport.topRejectionReason.reasonTag].labelEn)} (${slaReport.topRejectionReason.count})` : "-"}</p></article>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-line pt-4">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><AlertTriangle className="h-4 w-4 text-bad" aria-hidden="true" />{pick("해결 후 재오픈된 회귀 핀 경고", "Reopened Regressed Pin Alerts")}</h3>
            {slaReport.regressedPins.length === 0 ? (
              <p className="rounded-lg bg-good-soft px-3 py-2 text-xs font-semibold text-good">{pick("적발된 회귀 핀이 없습니다.", "No regressed pins detected.")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {slaReport.regressedPins.map((pin) => (
                  <li key={pin.pinId} className="flex flex-col gap-1.5 rounded-xl border border-bad bg-bad-soft p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-bad tabular-nums">{pin.cutId.toUpperCase()} · {pick(SIGNOFF_STAGE_META[pin.stageId].labelKo, SIGNOFF_STAGE_META[pin.stageId].labelEn)} · {pick(REJECTION_REASON_META[pin.reasonTag].labelKo, REJECTION_REASON_META[pin.reasonTag].labelEn)}</span>
                      <span className="rounded-full bg-panel px-2 py-0.5 text-[11px] font-bold text-bad tabular-nums">{pick(`${pin.resolvedInRound} 해결 → ${pin.reopenedInRound} 회귀`, `${pin.resolvedInRound} resolved -> ${pin.reopenedInRound} regressed`)}</span>
                    </div>
                    <p className="text-fg">{pick(pin.summaryKo, pin.summaryEn)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2.5 border-t border-line pt-4">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg"><Timer className="h-4 w-4 text-accent" aria-hidden="true" />{pick("공정별 검수 리드타임 · 재작업률 대시보드", "Stage Lead Time & Rework Rate Dashboard")}</h3>
            <div className="grid gap-2.5 md:grid-cols-2">
              {slaReport.stageSlaReports.map((stage) => (
                <article key={stage.stageId} className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3 text-xs tabular-nums">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-fg">{pick(SIGNOFF_STAGE_META[stage.stageId].labelKo, SIGNOFF_STAGE_META[stage.stageId].labelEn)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${stage.isOverSla ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>{stage.isOverSla ? pick(`SLA +${stage.slaDeltaMinutes}분 초과`, `SLA +${stage.slaDeltaMinutes}m over`) : pick("SLA 정상", "Within SLA")}</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-fg-2">
                    <span>{pick(`평균 ${stage.avgReviewDurationMinutes}분 / 목표 ${stage.slaTargetMinutes}분`, `Avg ${stage.avgReviewDurationMinutes}m / Target ${stage.slaTargetMinutes}m`)}</span>
                    <span>{pick(`1차 통과 ${stage.firstPassApprovalRatePct}% · 재작업 ${stage.reworkRatePct}%`, `1st-Pass ${stage.firstPassApprovalRatePct}% · Rework ${stage.reworkRatePct}%`)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
                    <div className={stage.isOverSla ? "h-full bg-bad" : "h-full bg-accent"} style={{ width: `${Math.min(100, Math.max(4, Math.round(stage.reworkRatePct)))}%` }} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
