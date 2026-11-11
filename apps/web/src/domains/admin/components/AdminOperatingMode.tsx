import { Suspense, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import type { LicenseReview, OperationPolicyAdminView, OperationPolicyDraft, OperationPolicyPreview, OperatingMode } from "@toonstudio/contracts/operation-policy";
import { api, getApiErrorMessage } from "@/platform/api";
import { useI18n, useT } from "@/shared/lib/i18n";
import { adminButtonClass } from "./admin-client";
import { AdminSpinner } from "./admin-ui";

const endpoint = "/admin/production/operation-policy";
const MODE_KEYS = { free: "admin.operatingMode.modeFree", paid: "admin.operatingMode.modePaid" };
/** 기존 정책 제어를 유지하고 저장된 검토 근거로 이동한다. */
export function AdminOperatingMode({ uid, onReviewEvidence }: { readonly uid: string; readonly onReviewEvidence?: () => void }) {
  return <OperatingModeControls key={uid} onReviewEvidence={onReviewEvidence} />;
}
function OperatingModeControls({ onReviewEvidence }: { readonly onReviewEvidence?: () => void }) {
  const t = useT();
  const ko = useI18n((state) => state.lang).startsWith("ko");
  const [current, setCurrent] = useState<OperationPolicyAdminView | null>(null);
  const [draft, setDraft] = useState<OperationPolicyDraft | null>(null);
  const [impact, setImpact] = useState<OperationPolicyPreview | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const requestId = useRef("");
  useEffect(() => {
    let active = true;
    setCurrent(null); setDraft(null); setImpact(null); setBusy(true); setError("");
    void api.get<OperationPolicyAdminView>(endpoint).then((data) => {
      if (active) { setCurrent(data); setDraft(data.policy.draft); }
    }).catch(async (cause: unknown) => {
      const message = await getApiErrorMessage(cause, t("admin.operatingMode.viewForbidden"));
      if (active) setError(message);
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [reload, t]);
  async function prepare() {
    if (!draft || !current) return;
    setBusy(true); setError(""); setImpact(null);
    try {
      const result = await api.post<OperationPolicyPreview>(`${endpoint}/preview`, { expectedRevision: current.policy.revision, draft });
      requestId.current = crypto.randomUUID(); setImpact(result);
    } catch (cause) { setError(await getApiErrorMessage(cause, t("admin.operatingMode.previewFailed"))); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!draft || !current || !impact) return;
    setBusy(true); setError("");
    try {
      await api.post(`${endpoint}/apply`, { expectedRevision: current.policy.revision, draft, previewDigest: impact.digest, reason, mutationId: requestId.current });
      setReload((value) => value + 1);
    } catch (cause) { setError(await getApiErrorMessage(cause, t("admin.operatingMode.applyFailed"))); }
    finally { setBusy(false); }
  }
  const field = "min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-fg";
  return <section aria-labelledby="operating-mode-title" className="rounded-2xl border border-line bg-card p-5">
    <h2 id="operating-mode-title" className="text-base font-bold">{t("admin.operatingMode.title")}</h2>
    <p className="mt-2 text-sm text-fg-3">{t("admin.operatingMode.desc")}</p>
    {onReviewEvidence && <button type="button" onClick={onReviewEvidence} className="mt-3 min-h-11 rounded-xl border border-line px-3 text-sm font-semibold">{ko ? "정책 검토 근거·변경 이력 보기" : "View policy evidence & changes"}</button>}
    {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
    {busy && !current ? <AdminSpinner /> : null}
    {busy && current ? <p role="status" className="mt-3">{t("admin.operatingMode.checking")}</p> : null}
    <button className="mt-3 text-sm underline" disabled={busy} onClick={() => setReload((value) => value + 1)}>{t("admin.operatingMode.reload")}</button>
    {current && draft && <fieldset className="mt-4 space-y-4" disabled={busy}>
      <legend>{t("admin.operatingMode.legend", { mode: t(MODE_KEYS[current.policy.draft.mode]), revision: current.policy.revision })}</legend>
      <div className="flex gap-6">{(["free", "paid"] as const).map((mode: OperatingMode) => <label key={mode} className="flex min-h-11 items-center gap-2">
        <input name="production-mode" type="radio" checked={draft.mode === mode} onChange={() => { setDraft({ ...draft, mode }); setImpact(null); }} />{t(MODE_KEYS[mode])}</label>)}</div>
      <p className="text-sm text-fg-3">{t("admin.operatingMode.paidNote")} {current.runtimeFingerprint ? t("admin.operatingMode.fingerprintRegistered") : t("admin.operatingMode.fingerprintMissing")}</p>
      <div className="grid gap-3 sm:grid-cols-3">{([['ownedWorkspaces','admin.operatingMode.limitOwnedWorkspaces',100],['projectsPerWorkspace','admin.operatingMode.limitProjectsPerWorkspace',1000],['membersPerWorkspace','admin.operatingMode.limitMembersPerWorkspace',1000]] as const).map(([key,nameKey,max]) =>
        <label key={key} className="space-y-2 text-sm">{t(MODE_KEYS[draft.mode])} {t(nameKey)}<input type="number" min={1} max={max} className={field} value={draft.profiles[draft.mode].limits[key]} onChange={(event) => {
          setDraft({ ...draft, profiles: { ...draft.profiles, [draft.mode]: { ...draft.profiles[draft.mode], limits: { ...draft.profiles[draft.mode].limits, [key]: Number(event.target.value) } } } }); setImpact(null);
        }} /></label>)}</div>
      <label className="block text-sm">{t("admin.operatingMode.reason")}<textarea rows={2} maxLength={500} className={`${field} mt-2`} value={reason} onChange={(event) => { setReason(event.target.value); setImpact(null); }} /></label>
      <button className={adminButtonClass()} onClick={() => { void prepare(); }}>{t("admin.operatingMode.preview")}</button>
      {impact && <div className="rounded-xl border border-line p-4"><ul className="space-y-1 text-sm">{impact.changes.map((item) => <li key={item}>{item}</li>)}</ul>
        {impact.blockedReasons.length > 0 && <p role="alert" className="mt-3 text-sm text-bad">{impact.blockedReasons.join(" ")}</p>}
        <button className={`${adminButtonClass()} mt-4`} disabled={impact.blockedReasons.length > 0 || reason.trim().length < 5} onClick={() => { void apply(); }}>{t("admin.operatingMode.apply")}</button></div>}
    </fieldset>}
  </section>;
}

const AdminOps = lazyRetry(() => import("./AdminOps").then((module) => ({ default: module.AdminOps })), "AdminOpsV2");
const AdminIntegrations = lazyRetry(() => import("./AdminIntegrations").then((module) => ({ default: module.AdminIntegrations })), "AdminIntegrationsV1");

const PURPOSES = ["status", "policy", "evidence", "integrations"] as const;
type Purpose = (typeof PURPOSES)[number];

export function AdminOperationsWorkspace({ uid }: { readonly uid: string }) {
  const ko = useI18n((state) => state.lang).startsWith("ko");
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const requested = params.get("view");
  const active = PURPOSES.find((id) => id === requested)
    ?? (location.hash === "#integrations" ? "integrations" : "status");
  const [visited, setVisited] = useState<ReadonlySet<Purpose>>(() => new Set([active]));
  const labels: Record<Purpose, string> = ko
    ? { status: "서비스 상태·설정", policy: "운영 정책", evidence: "정책 검토 근거", integrations: "외부 연동 상태" }
    : { status: "Service status & settings", policy: "Operating policy", evidence: "Policy review evidence", integrations: "Integration status" };

  function select(next: Purpose) {
    if (next === active) return;
    // 방문한 폼은 숨긴 채 유지하여 목적 전환과 뒤로 가기에서 미저장 입력을 보존한다.
    setVisited((previous) => new Set(previous).add(active).add(next));
    const updated = new URLSearchParams(location.search);
    if (next === "status") updated.delete("view");
    else updated.set("view", next);
    navigate({ pathname: location.pathname, search: updated.toString() ? `?${updated}` : "", hash: "" }, { preventScrollReset: true });
  }

  return <div className="space-y-5">
    <nav aria-label={ko ? "운영 관리 업무 선택" : "Choose an operations task"} className="flex flex-wrap gap-2">
      {PURPOSES.map((id) => <button
        key={id}
        id={`admin-operations-choice-${id}`}
        type="button"
        aria-controls={`admin-operations-panel-${id}`}
        aria-current={active === id ? "page" : undefined}
        onClick={() => select(id)}
        className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active === id ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-accent/50"}`}
      >{labels[id]}</button>)}
    </nav>
    <p role="status" className="text-sm text-fg-2">{ko ? "현재 업무: " : "Current task: "}{labels[active]}</p>
    {/* 근거 조회는 다시 열 때 서버를 읽고, 편집 폼만 숨긴 채 보존한다. */}
    {PURPOSES.map((id) => <section
      key={id}
      id={`admin-operations-panel-${id}`}
      aria-labelledby={`admin-operations-choice-${id}`}
      hidden={active !== id}
    >{(active === id || (id !== "evidence" && visited.has(id))) && <Suspense fallback={<p role="status">{ko ? "관리 화면을 불러오는 중…" : "Loading administration…"}</p>}>
      {id === "status" && <AdminOps uid={uid} />}
      {id === "policy" && <AdminOperatingMode uid={uid} onReviewEvidence={() => select("evidence")} />}
      {id === "evidence" && <AdminPolicyEvidence onManage={() => select("policy")} />}
      {id === "integrations" && <AdminIntegrations />}
    </Suspense>}</section>)}
  </div>;
}

export function AdminPolicyEvidence({ onManage }: { readonly onManage: () => void }) {
  const ko = useI18n((state) => state.lang).startsWith("ko");
  const [data, setData] = useState<OperationPolicyAdminView | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    void api.get<OperationPolicyAdminView>("/admin/production/operation-policy").then((result) => {
      if (current) setData(result);
    }).catch(async (cause: unknown) => {
      const message = await getApiErrorMessage(cause, ko ? "검토 근거를 불러오지 못했습니다." : "Could not load policy review evidence.");
      if (current) setError(message);
    });
    return () => { current = false; };
  }, [ko, reload]);
  const stateLabel: Record<LicenseReview["state"], string> = ko
    ? { pending: "미검토", approved: "승인 완료", blocked: "사용 제한" }
    : { pending: "Pending", approved: "Approved", blocked: "Blocked" };
  const reviews = data ? [
    { id: "release", label: ko ? "배포물 전체" : "Release", review: data.policy.draft.releaseReview },
    { id: "licensed-assets", label: ko ? "라이선스 자산" : "Licensed assets", review: data.policy.draft.featureReviews["licensed-assets"] },
    { id: "ai-shading", label: ko ? "AI 모델" : "AI models", review: data.policy.draft.featureReviews["ai-shading"] },
  ] : [];
  return <div className="space-y-5">
    <header>
      <h2 className="text-lg font-bold">{ko ? "정책 검토 근거·최근 변경" : "Policy evidence & recent changes"}</h2>
      <p className="mt-2 text-sm text-fg-2">{ko ? "서버에 저장된 검토 근거를 확인합니다. 정책 변경은 운영 정책에서 미리보기 후 적용하세요." : "Review saved evidence. Preview and apply changes in Operating policy."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onManage} className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold">{ko ? "운영 정책으로 돌아가기" : "Back to operating policy"}</button>
        <button type="button" onClick={() => setReload((value) => value + 1)} className="min-h-11 rounded-xl border border-line px-3 text-sm">{ko ? "검토 근거 다시 읽기" : "Reload evidence"}</button>
      </div>
    </header>
    {error ? <p role="alert" className="text-sm text-bad">{error}</p> : !data ? <p role="status">{ko ? "검토 근거를 불러오는 중…" : "Loading evidence…"}</p> : <>
      <p className="text-sm text-fg-2">{ko ? "조회한 정책 revision" : "Loaded policy revision"}: {data.policy.revision}</p>
      <div className="grid gap-4 lg:grid-cols-3">{reviews.map(({ id, label, review }) => <section key={id} className="min-w-0 rounded-2xl border border-line bg-card p-4">
        <h3 className="font-bold">{label}</h3>
        <dl className="mt-3 space-y-2 break-words text-sm">
          <dt className="text-fg-2">{ko ? "검토 상태" : "Review status"}</dt><dd>{stateLabel[review.state]}</dd>
          <dt className="text-fg-2">{ko ? "근거 문서" : "Evidence reference"}</dt><dd>{review.evidenceRef || (ko ? "등록되지 않음" : "Not registered")}</dd>
          <dt className="text-fg-2">SHA-256</dt><dd className="break-all">{review.subjectDigest || (ko ? "등록되지 않음" : "Not registered")}</dd>
          <dt className="text-fg-2">{ko ? "유효 기한" : "Valid until"}</dt><dd>{review.validUntil || (ko ? "등록되지 않음" : "Not registered")}</dd>
        </dl>
      </section>)}</div>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h3 className="font-bold">{ko ? "최근 변경 이력" : "Recent policy changes"}</h3>
        {data.audit.length ? <ol className="mt-3 space-y-3 text-sm">{data.audit.map((entry) => <li key={entry.revision} className="break-words">revision {entry.revision} · {entry.reason}<br /><span className="text-fg-2">{entry.occurredAt}</span></li>)}</ol> : <p className="mt-3 text-sm text-fg-2">{ko ? "아직 변경 이력이 없습니다." : "No changes yet."}</p>}
      </section>
    </>}
  </div>;
}
