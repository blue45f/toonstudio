import { useEffect, useRef, useState } from "react";
import type { OperationPolicyAdminView, OperationPolicyDraft, OperationPolicyPreview, OperatingMode } from "@toonstudio/contracts/operation-policy";
import { api, getApiErrorMessage } from "@/platform/api";
import { useT } from "@/shared/lib/i18n";
import { AdminSpinner } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

const endpoint = "/admin/production/operation-policy";
const MODE_KEYS = { free: "admin.operatingMode.modeFree", paid: "admin.operatingMode.modePaid" };
/** Compact launch controls for the existing console; full evidence management remains in apps/admin-web. */
export function AdminOperatingMode({ uid }: { readonly uid: string }) {
  return <OperatingModeControls key={uid} />;
}
function OperatingModeControls() {
  const t = useT();
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
