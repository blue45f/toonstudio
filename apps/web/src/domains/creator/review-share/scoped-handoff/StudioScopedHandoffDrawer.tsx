import { Check, Copy, Link2, Lock, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import {
  SCOPED_HANDOFF_EXPIRY_PRESET_HOURS, SCOPED_HANDOFF_LAYER_ROLES, SCOPED_HANDOFF_ROLE_METADATA,
  createScopedHandoffEnvelope, decodeScopedHandoffLink, encodeScopedHandoffLink,
  mergeScopedHandoffReturn, parseScopedHandoffReturnInput, previewScopedHandoffReturnMerge,
  type ScopedHandoffEnvelope, type ScopedHandoffLayerRole, type ScopedHandoffManuscriptSnapshot,
  type ScopedHandoffMergePreviewOk, type ScopedHandoffMergePreviewResult,
} from "./scoped-cut-handoff-envelope";

export interface StudioScopedHandoffDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly manuscript: ScopedHandoffManuscriptSnapshot;
  readonly onApplyMerge?: (mergedManuscript: ScopedHandoffManuscriptSnapshot, preview: ScopedHandoffMergePreviewOk) => void;
  readonly initialNowMs?: number;
  readonly origin?: string;
}

type DrawerTab = "issue" | "return";

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_TRANSITION = `transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime()) ? DATE_TIME.format(parsed) : iso;
}

/**
 * Calm Atelier 컷 단위 제한 링크(Zero-Account Scoped Handoff) 발급·반납 검증 드로어.
 * - 브라우저 저장소(localStorage/sessionStorage/indexedDB)를 직접 호출하지 않고 메모리에서만 동작한다(₩0 로컬).
 * - 3클릭(컷 선택 → 허용 레이어 역할 선택 → 제한 링크 발급)으로 SHA-256 무결성 봉투를 생성한다.
 */
export function StudioScopedHandoffDrawer({
  open, onClose, manuscript, onApplyMerge, initialNowMs, origin,
}: StudioScopedHandoffDrawerProps) {
  const bt = useBilingual("StudioScopedHandoffDrawer");
  const titleId = useId();
  const descId = useId();
  const [activeTab, setActiveTab] = useState<DrawerTab>("issue");
  const [selectedCutIds, setSelectedCutIds] = useState<readonly string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<readonly ScopedHandoffLayerRole[]>([]);
  const [expiresInHours, setExpiresInHours] = useState<number>(72);
  const [includeContextCuts, setIncludeContextCuts] = useState(true);
  const [customTitle, setCustomTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [issuedEnvelope, setIssuedEnvelope] = useState<ScopedHandoffEnvelope | null>(null);
  const [issuedLink, setIssuedLink] = useState<string | null>(null);
  const [externalEnvelopeInput, setExternalEnvelopeInput] = useState("");
  const [returnInput, setReturnInput] = useState("");
  const [mergePreview, setMergePreview] = useState<ScopedHandoffMergePreviewResult | null>(null);
  const [appliedMerge, setAppliedMerge] = useState<{
    readonly sourceBaseHash: string; readonly manuscript: ScopedHandoffManuscriptSnapshot; readonly returnSha256: string;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  const currentManuscript = appliedMerge?.sourceBaseHash === manuscript.baseRevisionHash
    ? appliedMerge.manuscript
    : manuscript;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const validSelectedCutIds = useMemo(() => {
    const existing = new Set(currentManuscript.cuts.map((cut) => cut.cutId));
    return selectedCutIds.filter((cutId) => existing.has(cutId));
  }, [currentManuscript.cuts, selectedCutIds]);

  const selectedCutSet = useMemo(() => new Set(validSelectedCutIds), [validSelectedCutIds]);
  const selectedRoleSet = useMemo(() => new Set<ScopedHandoffLayerRole>(selectedRoles), [selectedRoles]);

  const previewContextByCutId = useMemo(() => {
    const map = new Map<string, readonly ("before" | "after")[]>();
    if (!includeContextCuts || selectedCutSet.size === 0) return map;
    const draft = new Map<string, Set<"before" | "after">>();
    const mark = (index: number, rel: "before" | "after") => {
      const target = currentManuscript.cuts[index];
      if (!target || selectedCutSet.has(target.cutId)) return;
      const entry = draft.get(target.cutId) ?? new Set<"before" | "after">();
      entry.add(rel);
      draft.set(target.cutId, entry);
    };
    currentManuscript.cuts.forEach((cut, index) => {
      if (!selectedCutSet.has(cut.cutId)) return;
      if (index > 0) mark(index - 1, "before");
      if (index + 1 < currentManuscript.cuts.length) mark(index + 1, "after");
    });
    draft.forEach((rels, cutId) => map.set(cutId, [...rels]));
    return map;
  }, [currentManuscript.cuts, includeContextCuts, selectedCutSet]);

  const toggleCut = useCallback((cutId: string) => {
    setSelectedCutIds((prev) => (prev.includes(cutId) ? prev.filter((id) => id !== cutId) : [...prev, cutId]));
    setStatusMessage("");
  }, []);

  const toggleRole = useCallback((role: ScopedHandoffLayerRole) => {
    setSelectedRoles((prev) => (prev.includes(role) ? prev.filter((item) => item !== role) : [...prev, role]));
    setStatusMessage("");
  }, []);

  const canIssue = validSelectedCutIds.length > 0 && selectedRoles.length > 0;

  const handleIssue = useCallback(() => {
    if (!canIssue) return;
    try {
      const envelope = createScopedHandoffEnvelope({
        manuscript: currentManuscript, cutIds: validSelectedCutIds, allowedRoles: selectedRoles,
        title: customTitle.trim() || `${currentManuscript.episodeLabel} · 컷 단위 전달`,
        instructions, expiresInHours, contextWindow: includeContextCuts ? 1 : 0, nowMs: initialNowMs,
      });
      setIssuedEnvelope(envelope);
      setIssuedLink(encodeScopedHandoffLink(envelope, origin));
      setMergePreview(null);
      setCopiedLink(false);
      setStatusMessage(bt(
        `배정 컷 ${envelope.cutIds.length}개·문맥 컷 ${envelope.contextCuts.length}개로 제한 링크를 발급했어요.`,
        `Issued scoped link for ${envelope.cutIds.length} assigned cut(s) and ${envelope.contextCuts.length} context cut(s).`,
      ));
    } catch (caught) {
      setStatusMessage(caught instanceof Error ? caught.message : bt("제한 링크를 발급하지 못했어요.", "Failed to issue scoped link."));
    }
  }, [bt, canIssue, currentManuscript, customTitle, expiresInHours, includeContextCuts, initialNowMs, instructions, origin, selectedRoles, validSelectedCutIds]);

  const handleCopyLink = useCallback(() => {
    if (!issuedLink) return;
    void navigator.clipboard?.writeText(issuedLink)
      .then(() => { setCopiedLink(true); setStatusMessage(bt("어시스턴트 제한 링크를 복사했어요.", "Copied the assistant scoped link.")); })
      .catch(() => { setStatusMessage(bt("링크 입력란을 선택해 직접 복사해 주세요.", "Select the link field and copy it manually.")); });
  }, [bt, issuedLink]);

  const resolveActiveEnvelope = useCallback((): ScopedHandoffEnvelope | null => {
    const externalTrimmed = externalEnvelopeInput.trim();
    if (externalTrimmed) {
      const decoded = decodeScopedHandoffLink(externalTrimmed, { nowMs: initialNowMs });
      if (decoded.ok) return decoded.envelope;
      setMergePreview(decoded);
      return null;
    }
    return issuedEnvelope;
  }, [externalEnvelopeInput, initialNowMs, issuedEnvelope]);

  const handleVerifyPreview = useCallback(() => {
    const activeEnvelope = resolveActiveEnvelope();
    if (!activeEnvelope) {
      if (!externalEnvelopeInput.trim()) {
        setMergePreview({
          ok: false, code: "invalid-envelope-schema", offendingCutIds: [], offendingLayerIds: [],
          message: bt("먼저 제한 링크를 발급하거나 기준 봉투 링크를 붙여 넣어 주세요.", "Issue a scoped link first or paste the reference envelope."),
        });
      }
      return;
    }
    const parsedReturn = parseScopedHandoffReturnInput(returnInput);
    if (!parsedReturn) {
      setMergePreview({
        ok: false, code: "invalid-return-schema", offendingCutIds: [], offendingLayerIds: [],
        message: bt("반납 패킷 JSON 또는 토큰 형식을 해독할 수 없습니다.", "Could not decode the return packet JSON or token."),
      });
      return;
    }
    const preview = previewScopedHandoffReturnMerge({ currentManuscript, envelope: activeEnvelope, returnPacket: parsedReturn, nowMs: initialNowMs });
    setMergePreview(preview);
    setStatusMessage(preview.ok
      ? bt("SHA-256 무결성과 cutId 기준 리비전 매칭을 확인했어요. 아래 미리보기 후 병합하세요.", "Verified SHA-256 integrity and cutId baseline matching. Review and merge below.")
      : preview.message);
  }, [bt, currentManuscript, externalEnvelopeInput, initialNowMs, resolveActiveEnvelope, returnInput]);

  const handleApplyMerge = useCallback(() => {
    const activeEnvelope = resolveActiveEnvelope();
    const parsedReturn = parseScopedHandoffReturnInput(returnInput);
    if (!activeEnvelope || !parsedReturn) return;
    const merged = mergeScopedHandoffReturn({ currentManuscript, envelope: activeEnvelope, returnPacket: parsedReturn, nowMs: initialNowMs });
    if (!merged.ok) { setMergePreview(merged); setStatusMessage(merged.message); return; }
    setAppliedMerge({ sourceBaseHash: manuscript.baseRevisionHash, manuscript: merged.manuscript, returnSha256: merged.preview.returnSha256 });
    setMergePreview(merged.preview);
    onApplyMerge?.(merged.manuscript, merged.preview);
    setStatusMessage(bt(
      `검증된 반납 ${merged.preview.cutPlans.length}개 컷을 불변 cutId 기준으로 병합했어요.`,
      `Merged ${merged.preview.cutPlans.length} verified cut(s) by immutable cutId.`,
    ));
  }, [bt, currentManuscript, initialNowMs, manuscript.baseRevisionHash, onApplyMerge, resolveActiveEnvelope, returnInput]);

  if (!open) return null;

  return (
    <div data-testid="scoped-handoff-drawer-backdrop" className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button" tabIndex={-1} onClick={onClose}
        aria-label={bt("배경 클릭으로 서랍 닫기", "Close drawer backdrop")}
        className="fixed inset-0 bg-canvas/75 motion-reduce:transition-none"
      />
      <aside
        role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}
        data-testid="studio-scoped-handoff-drawer"
        className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-line bg-panel text-fg shadow-xl [word-break:keep-all]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line bg-card px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                <Link2 className="size-3.5" aria-hidden="true" />
                {bt("계정 불필요 · ₩0 로컬", "Zero-Account · Local")}
              </span>
              <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-xs tabular-nums text-fg-2">
                {currentManuscript.cuts.length}{bt("컷", " cuts")}
              </span>
            </div>
            <h2 id={titleId} className="mt-2 text-base font-semibold tracking-tight text-fg">
              {bt("컷 단위 어시스턴트 전달", "Scoped Cut Assistant Handoff")}
            </h2>
            <p id={descId} className="mt-1 text-xs leading-5 text-fg-2">
              {bt(
                "배정 컷과 허용 레이어 역할만 잠금 해제해 링크로 전달하고, 반납 시 불변 cutId와 SHA-256으로 무결성을 검증합니다.",
                "Share only assigned cuts and allowed layer roles without accounts, then verify return SHA-256 integrity by immutable cutId.",
              )}
            </p>
          </div>
          <button
            type="button" data-testid="scoped-handoff-close-btn" onClick={onClose}
            aria-label={bt("컷 단위 전달 서랍 닫기", "Close scoped cut handoff drawer")}
            className={cn("inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg", BTN_TRANSITION)}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div role="tablist" aria-label={bt("컷 단위 전달 단계", "Scoped handoff steps")} className="grid grid-cols-2 gap-2 border-b border-line bg-panel px-5 py-3">
          {([
            { id: "issue", label: bt("1. 제한 링크 발급", "1. Issue Scoped Link") },
            { id: "return", label: bt("2. 반납 검증·병합", "2. Verify & Merge Return") },
          ] as const).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id} type="button" role="tab" aria-selected={active}
                data-testid={`scoped-handoff-tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
                className={cn("min-h-11 rounded-lg border px-3 text-sm font-semibold", BTN_TRANSITION,
                  active ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
              >{tab.label}</button>
            );
          })}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {activeTab === "issue" ? <>
            <section className="rounded-xl border border-line bg-card p-4" aria-label={bt("배정 컷 선택", "Select assigned cuts")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">{bt("① 배정 컷 선택", "Step 1 · Select Cuts")}</h3>
                <span className="text-xs tabular-nums text-fg-2">
                  {bt(`배정 ${validSelectedCutIds.length} · 문맥(±1) ${previewContextByCutId.size}`, `${validSelectedCutIds.length} assigned · ${previewContextByCutId.size} context (±1)`)}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {currentManuscript.cuts.map((cut, index) => {
                  const selected = selectedCutSet.has(cut.cutId);
                  const contextRels = previewContextByCutId.get(cut.cutId);
                  return (
                    <button
                      key={cut.cutId} type="button" aria-pressed={selected}
                      data-testid={`scoped-handoff-cut-${cut.cutId}`}
                      data-context-relation={contextRels ? contextRels.join(",") : ""}
                      onClick={() => toggleCut(cut.cutId)}
                      className={cn("flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left", BTN_TRANSITION,
                        selected ? "border-accent bg-accent-soft text-fg"
                          : contextRels ? "border-line-strong border-dashed bg-raised/70 text-fg-2"
                            : "border-line bg-panel text-fg-2 hover:bg-raised")}
                    >
                      <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold tabular-nums">
                        <span>#{index + 1} · {cut.label}</span>
                        {selected ? (
                          <span className="rounded bg-accent px-1.5 py-0.5 text-[0.6875rem] text-on-accent">{bt("배정", "Assigned")}</span>
                        ) : contextRels ? (
                          <span className="inline-flex items-center gap-1 rounded border border-line bg-card px-1.5 py-0.5 text-[0.6875rem] text-fg-2">
                            <Lock className="size-3" aria-hidden="true" />{bt("문맥 ±1 · 읽기 전용", "Context ±1 · Read-only")}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 font-mono text-[0.6875rem] tabular-nums text-fg-3">{cut.cutId} · {cut.width}×{cut.height}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-line bg-card p-4" aria-label={bt("허용 레이어 역할", "Allowed layer roles")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-fg">{bt("② 허용 레이어 역할", "Step 2 · Allowed Layer Roles")}</h3>
                <span className="text-xs tabular-nums text-fg-3">{bt(`${selectedRoles.length}/5 선택`, `${selectedRoles.length}/5 selected`)}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {SCOPED_HANDOFF_LAYER_ROLES.map((role) => {
                  const meta = SCOPED_HANDOFF_ROLE_METADATA[role];
                  const active = selectedRoleSet.has(role);
                  return (
                    <button
                      key={role} type="button" aria-pressed={active} data-testid={`scoped-handoff-role-${role}`}
                      onClick={() => toggleRole(role)}
                      className={cn("flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left", BTN_TRANSITION,
                        active ? "border-accent bg-accent-soft text-fg" : "border-line bg-panel text-fg-2 hover:bg-raised")}
                    >
                      <span className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
                        <span>{bt(meta.ko, meta.en)}</span>
                        <span className="font-mono text-[0.6875rem] text-fg-3">{role}</span>
                      </span>
                      <span className="mt-0.5 text-xs text-fg-3">{bt(meta.summaryKo, meta.summaryEn)}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-line bg-card p-4" aria-label={bt("발급 옵션", "Issuance options")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-fg-2">
                  {bt("만료 시간", "Expires in")}
                  <select
                    aria-label={bt("만료 시간", "Expires in")} value={expiresInHours}
                    onChange={(event) => setExpiresInHours(Number(event.target.value))}
                    className={cn("mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-sm tabular-nums text-fg", FOCUS_RING)}
                  >
                    {SCOPED_HANDOFF_EXPIRY_PRESET_HOURS.map((hours) => (
                      <option key={hours} value={hours}>{hours === 24 ? bt("24시간", "24 hours") : bt(`${hours / 24}일`, `${hours / 24} days`)}</option>
                    ))}
                  </select>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 self-end rounded-lg border border-line bg-panel px-3 text-xs font-medium text-fg">
                  <input type="checkbox" checked={includeContextCuts} onChange={(event) => setIncludeContextCuts(event.target.checked)} />
                  <span>{bt("앞뒤 문맥 컷(±1) 읽기 전용 포함", "Include read-only ±1 context cuts")}</span>
                </label>
              </div>
              <details className="mt-3 rounded-lg border border-line bg-panel px-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-fg-2">
                  {bt("전달 제목·작업 지시문 (선택)", "Title & assistant notes (optional)")}
                </summary>
                <div className="space-y-3 pb-3">
                  <label className="block text-xs font-semibold text-fg-2">
                    {bt("전달 제목", "Handoff title")}
                    <input type="text" maxLength={120} value={customTitle} placeholder={`${currentManuscript.episodeLabel} · 컷 단위 전달`}
                      onChange={(event) => setCustomTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg" />
                  </label>
                  <label className="block text-xs font-semibold text-fg-2">
                    {bt("작업 지시문", "Instructions")}
                    <textarea rows={2} maxLength={2000} value={instructions} onChange={(event) => setInstructions(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-card p-3 text-sm text-fg" />
                  </label>
                </div>
              </details>
              <button
                type="button" data-testid="scoped-handoff-issue-btn" disabled={!canIssue} onClick={handleIssue}
                className={cn("mt-4 min-h-11 w-full rounded-lg border border-accent bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50", BTN_TRANSITION)}
              >{bt("③ 컷 제한 링크 발급", "Step 3 · Issue Scoped Cut Link")}</button>
            </section>

            {issuedEnvelope && issuedLink ? (
              <section role="status" data-testid="scoped-handoff-issued-card" className="space-y-3 rounded-xl border border-good/40 bg-good-soft p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    <ShieldCheck className="size-4 text-good" aria-hidden="true" />{bt("SHA-256 무결성 봉투 발급 완료", "SHA-256 Integrity Envelope Issued")}
                  </p>
                  <span className="text-xs tabular-nums text-fg-2">{bt("만료", "Expires")} · {formatDateTime(issuedEnvelope.expiresAt)}</span>
                </div>
                <p className="text-xs tabular-nums text-fg-2">
                  {bt(
                    `배정 ${issuedEnvelope.cutIds.length}컷 · 읽기전용 문맥 ${issuedEnvelope.contextCuts.length}컷 · 허용 역할 ${issuedEnvelope.allowedRoles.map((r) => SCOPED_HANDOFF_ROLE_METADATA[r].ko).join(", ")}`,
                    `${issuedEnvelope.cutIds.length} assigned · ${issuedEnvelope.contextCuts.length} read-only context · roles: ${issuedEnvelope.allowedRoles.join(", ")}`,
                  )}
                </p>
                <p className="break-all font-mono text-[0.6875rem] text-fg-3">SHA-256 · {issuedEnvelope.envelopeSha256}</p>
                <input readOnly aria-label={bt("어시스턴트 제한 링크", "Assistant scoped handoff link")} data-testid="scoped-handoff-link-input"
                  value={issuedLink} onFocus={(event) => event.currentTarget.select()} className="min-h-11 w-full rounded-lg border border-line bg-card px-3 font-mono text-xs text-fg" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleCopyLink} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-sm font-medium text-fg hover:bg-raised", BTN_TRANSITION)}>
                    {copiedLink ? <Check className="size-4 text-good" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                    {copiedLink ? bt("복사됨", "Copied") : bt("제한 링크 복사", "Copy scoped link")}
                  </button>
                  <button type="button" onClick={() => setActiveTab("return")} className={cn("min-h-11 rounded-lg border border-line bg-card px-3 text-sm font-medium text-fg hover:bg-raised", BTN_TRANSITION)}>
                    {bt("반납 검증 탭으로 이동", "Go to return verify")}
                  </button>
                </div>
              </section>
            ) : null}
          </> : (
            <section className="space-y-4 rounded-xl border border-line bg-card p-4" aria-label={bt("반납 무결성 검증 및 병합 미리보기", "Verify return integrity and preview merge")}>
              <div className="rounded-lg border border-line bg-panel p-3 text-xs text-fg-2">
                {issuedEnvelope ? (
                  <div className="space-y-1">
                    <p className="font-semibold text-fg">{bt("활성 기준 봉투", "Active reference envelope")} · {issuedEnvelope.title}</p>
                    <p className="tabular-nums">{bt(`배정 컷 ${issuedEnvelope.cutIds.join(", ")} · 만료 ${formatDateTime(issuedEnvelope.expiresAt)}`, `Assigned: ${issuedEnvelope.cutIds.join(", ")} · Expires ${formatDateTime(issuedEnvelope.expiresAt)}`)}</p>
                    <p className="break-all font-mono text-[0.6875rem] text-fg-3">SHA-256 · {issuedEnvelope.envelopeSha256}</p>
                  </div>
                ) : (
                  <p>{bt("이 세션에서 발급한 봉투가 없으면 아래에서 기준 제한 링크를 붙여 넣으세요.", "No envelope issued in this session yet. Paste a reference scoped link below.")}</p>
                )}
              </div>

              <details className="rounded-lg border border-line bg-panel px-3" open={!issuedEnvelope}>
                <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-fg-2">
                  {bt("외부 발급 기준 링크·봉투 입력 (선택)", "Paste external reference link or envelope (optional)")}
                </summary>
                <div className="pb-3">
                  <textarea rows={2} aria-label={bt("기준 봉투 링크", "Reference envelope link")} value={externalEnvelopeInput}
                    onChange={(event) => setExternalEnvelopeInput(event.target.value)} placeholder={bt("#envelope=... 링크 또는 봉투 JSON", "#envelope=... link or envelope JSON")}
                    className="w-full rounded-lg border border-line bg-card p-3 font-mono text-xs text-fg" />
                </div>
              </details>

              <label className="block text-xs font-semibold text-fg-2">
                {bt("어시스턴트 반납 패킷 (JSON 또는 토큰)", "Assistant return packet (JSON or token)")}
                <textarea rows={5} aria-label={bt("반납 패킷 입력", "Return packet input")} data-testid="scoped-handoff-return-input"
                  value={returnInput} onChange={(event) => { setReturnInput(event.target.value); setMergePreview(null); }}
                  placeholder={bt("어시스턴트가 보낸 반납 JSON 또는 Base64URL 토큰을 붙여 넣으세요.", "Paste the return JSON or Base64URL token from the assistant.")}
                  className={cn("mt-1.5 w-full rounded-lg border border-line bg-panel p-3 font-mono text-xs text-fg", FOCUS_RING)} />
              </label>

              <button type="button" data-testid="scoped-handoff-verify-btn" disabled={!returnInput.trim()} onClick={handleVerifyPreview}
                className={cn("min-h-11 w-full rounded-lg border border-line-strong bg-raised px-4 text-sm font-semibold text-fg hover:bg-panel disabled:cursor-not-allowed disabled:opacity-50", BTN_TRANSITION)}
              >{bt("무결성 검증·병합 미리보기", "Verify SHA-256 & Preview Merge")}</button>

              {mergePreview && !mergePreview.ok ? (
                <div role="alert" data-testid="scoped-handoff-reject-alert" className="space-y-2 rounded-xl border border-bad/40 bg-bad-soft p-4 text-xs text-fg">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-bad">
                    <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />{bt("Fail-Closed 병합 거부", "Fail-Closed Merge Rejected")}
                  </p>
                  <p className="leading-5">{mergePreview.message}</p>
                  <p className="font-mono text-[0.6875rem] text-fg-2">code: {mergePreview.code}</p>
                  {mergePreview.offendingCutIds.length > 0 ? <p className="font-mono text-[0.6875rem] tabular-nums text-fg-2">cutIds: {mergePreview.offendingCutIds.join(", ")}</p> : null}
                  {mergePreview.offendingLayerIds.length > 0 ? <p className="font-mono text-[0.6875rem] tabular-nums text-fg-2">layerIds: {mergePreview.offendingLayerIds.join(", ")}</p> : null}
                </div>
              ) : null}

              {mergePreview && mergePreview.ok ? (
                <div role="status" data-testid="scoped-handoff-preview-ok" className="space-y-3 rounded-xl border border-good/40 bg-good-soft p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    <ShieldCheck className="size-4 text-good" aria-hidden="true" />{bt("무결성 확인 완료 · 불변 cutId 매칭 준비됨", "Integrity Verified · Ready to Merge by cutId")}
                  </p>
                  {mergePreview.reorderedCutIds.length > 0 ? (
                    <p data-testid="scoped-handoff-reorder-notice" className="rounded-lg border border-warn/40 bg-warning-soft px-3 py-2 text-xs text-fg">
                      {bt(
                        `메인 원고 컷 순서가 변경되었으나 배열 인덱스가 아닌 불변 cutId(${mergePreview.reorderedCutIds.join(", ")}) + 기준 리비전 해시로 안전 매칭했습니다.`,
                        `Cut order changed in main manuscript; safely matched by immutable cutId (${mergePreview.reorderedCutIds.join(", ")}) + baseline revision hash.`,
                      )}
                    </p>
                  ) : null}
                  <ul className="space-y-2 text-xs">
                    {mergePreview.cutPlans.map((plan) => (
                      <li key={plan.cutId} className="rounded-lg border border-line bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-fg">{plan.label} (<span className="font-mono">{plan.cutId}</span>)</span>
                          <span className="tabular-nums text-fg-2">
                            {plan.orderChanged
                              ? bt(`발급 #${plan.issuedOrderIndex + 1} → 현재 #${plan.currentOrderIndex + 1}`, `Issued #${plan.issuedOrderIndex + 1} → Now #${plan.currentOrderIndex + 1}`)
                              : bt(`위치 #${plan.currentOrderIndex + 1}`, `Position #${plan.currentOrderIndex + 1}`)}
                          </span>
                        </div>
                        <p className="mt-1 tabular-nums text-fg-3">
                          {bt(`갱신 레이어 ${plan.updatedLayerIds.length}개 · 추가 ${plan.addedLayerIds.length}개 · 잠금 보존 ${plan.untouchedLockedLayerCount}개`,
                            `Updated ${plan.updatedLayerIds.length} · Added ${plan.addedLayerIds.length} · Locked preserved ${plan.untouchedLockedLayerCount}`)}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button" data-testid="scoped-handoff-apply-merge-btn"
                    disabled={appliedMerge?.returnSha256 === mergePreview.returnSha256} onClick={handleApplyMerge}
                    className={cn("min-h-11 w-full rounded-lg border border-accent bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50", BTN_TRANSITION)}
                  >
                    {appliedMerge?.returnSha256 === mergePreview.returnSha256 ? bt("병합 반영 완료", "Merged into Manuscript") : bt("검증된 반납 원고에 병합", "Apply Verified Return Merge")}
                  </button>
                </div>
              ) : null}
            </section>
          )}
        </div>

        {statusMessage ? (
          <footer className="border-t border-line bg-card px-5 py-3">
            <p role="status" className="text-xs leading-5 text-fg-2">{statusMessage}</p>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
