import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { COLLABORATION_MODELS, type CollaborationModel } from "@toonstudio/core/production";
import type { WorkSummary } from "@/platform/creator-client";
import { getApiErrorMessage, httpStatus } from "@/platform/api";
import { getAuthSession, getAuthSessionRevision, listeners } from "@/domains/auth/public/session/auth-session-state";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { getStudioTeam } from "../studio-team-client";
import { ProductionWorkspaceDialog } from "./ProductionWorkspaceDialog";
import { getProductionProjectByWork } from "./production-api";
import { confirmProductionProjectCreate, loadProductionCreateOwnedWorks, productionCreateOwnerConfirmed } from "./production-create-command";
import { prepareProductionCreatePending, type ProductionCreatePending } from "./production-create-pending";
import { productionCreatePendingStore } from "./production-create-pending-store";

const fieldClass = "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-base sm:text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const subscribe = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
const MODEL_LABELS: Readonly<Record<CollaborationModel, readonly [string, string]>> = {
  solo: ["1인 제작", "Solo"], "co-creator": ["공동 창작", "Co-creation"],
  "story-led-commission": ["글 중심 협업", "Story-led commission"],
  "art-led-commission": ["그림 중심 협업", "Art-led commission"],
  adaptation: ["각색", "Adaptation"], "studio-production": ["스튜디오 분업 제작", "Studio production"],
  anthology: ["앤솔러지", "Anthology"], replacement: ["담당 교체", "Replacement"],
};
interface Selection {
  readonly workId: string; readonly loading: boolean; readonly pending: ProductionCreatePending | null;
  readonly linkedProjectId: string | null; readonly owner: boolean; readonly error: string | null;
}

/** 실제 저장 작품만 연결한다. 조회·새로고침은 생성이나 미확인 요청의 자동 전송을 하지 않는다. */
export function ProductionCreateProjectDialog({ actorId, onClose }: {
  readonly actorId: string; readonly onClose: () => void;
}) {
  const bt = useBilingual("ProductionCreateProjectDialog"), navigate = useNavigate();
  const [works, setWorks] = useState<readonly WorkSummary[]>([]), [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null), [reload, setReload] = useState(0);
  const [workId, setWorkId] = useState(""), [title, setTitle] = useState("");
  const [model, setModel] = useState<CollaborationModel>("studio-production"), [ownerName, setOwnerName] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authRevision = useSyncExternalStore(subscribe, getAuthSessionRevision, getAuthSessionRevision);
  const alive = useRef(true), generation = useRef(0), selectedWorkId = useRef(workId);
  selectedWorkId.current = workId;
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current += 1; }; }, []);
  const sameActor = () => getAuthSession()?.user.id === actorId;
  const selected = selection?.workId === workId ? selection : null;
  const pending = selected?.pending ?? null, selectedWork = works.find((work) => work.id === workId);

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setLoadError(null); setWorks([]);
    void (async () => {
      try {
        if (getAuthSession()?.user.id !== actorId) throw new Error(bt("현재 로그인 계정을 확인할 수 없습니다.", "Could not confirm the signed-in account."));
        const result = await loadProductionCreateOwnedWorks(actorId, controller.signal);
        if (active && getAuthSession()?.user.id === actorId) setWorks(result);
      } catch (cause) {
        const message = await getApiErrorMessage(cause, bt("저장된 내 작품을 불러오지 못했습니다.", "Could not load your saved works."));
        if (active) setLoadError(message);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [actorId, reload, authRevision, bt]);

  useEffect(() => {
    const epoch = ++generation.current, requestedAuthRevision = authRevision;
    const current = () => alive.current && generation.current === epoch && getAuthSession()?.user.id === actorId
      && getAuthSessionRevision() === requestedAuthRevision;
    if (!workId) { setSelection(null); return; }
    setSelection({ workId, loading: true, pending: null, linkedProjectId: null, owner: false, error: null });
    setError(null); setBusy(false);
    void (async () => {
      try {
        if (!current()) throw new Error(bt("계정이 변경되어 작품 확인을 중지했습니다.", "The account changed. Work verification stopped."));
        const scope = { actorUserId: actorId, workId }, stored = await productionCreatePendingStore.load(scope);
        if (!current()) return;
        const team = await getStudioTeam(workId);
        if (!current()) return;
        const owner = productionCreateOwnerConfirmed(team, scope);
        const linked = stored ? null : await getProductionProjectByWork(workId).catch((cause: unknown) => {
          if (httpStatus(cause) === 404) return null; throw cause;
        });
        if (!current()) return;
        setSelection({ workId, loading: false, pending: stored,
          linkedProjectId: linked?.aggregate.projectId ?? null, owner, error: null });
      } catch (cause) {
        const message = await getApiErrorMessage(cause, bt("현재 작품과 보관한 요청을 확인하지 못했습니다.", "Could not verify this work and its saved request."));
        if (current()) setSelection({ workId, loading: false, pending: null, linkedProjectId: null, owner: false, error: message });
      }
    })();
    return () => { generation.current += 1; };
  }, [actorId, workId, reload, authRevision, bt]);

  const submit = async () => {
    if (busy || !selected || selected.loading || selected.error || !selected.owner || !selectedWork || !sameActor()) return;
    const epoch = generation.current, authRevision = getAuthSessionRevision(), scope = { actorUserId: actorId, workId };
    const current = () => alive.current && generation.current === epoch && selectedWorkId.current === scope.workId
      && getAuthSession()?.user.id === actorId && getAuthSessionRevision() === authRevision;
    setBusy(true); setError(null);
    try {
      let original = selected.pending;
      if (!original) {
        if (selected.linkedProjectId) return;
        const candidate = await prepareProductionCreatePending(scope, { workId, title, collaborationModel: model, ownerDisplayName: ownerName });
        if (!current()) return;
        original = await productionCreatePendingStore.remember(scope, candidate);
        if (!current()) return;
        setSelection((value) => value?.workId === workId ? { ...value, pending: original } : value);
        if (original.digest !== candidate.digest) {
          setError(bt("이미 보관한 생성 요청이 있습니다. 원래 요청의 생성 상태 확인을 눌러 주세요.", "A saved creation request already exists. Confirm its original result."));
          return;
        }
      }
      const projectId = await confirmProductionProjectCreate(original, { current });
      if (!current()) return;
      navigate("/production/projects/" + encodeURIComponent(projectId) + "/settings");
      onClose();
    } catch (cause) {
      const message = await getApiErrorMessage(cause, bt("생성 결과를 확인하지 못했습니다. 보관한 원래 요청의 상태를 확인하세요.", "Could not confirm creation. Check the original saved request."));
      if (current()) setError(message);
    } finally { if (current()) setBusy(false); }
  };
  const chooseWork = (id: string) => {
    setWorkId(id); setError(null); const work = works.find((entry) => entry.id === id);
    setTitle(work?.title ?? "");
    setOwnerName((getAuthSession()?.user.name?.trim() || work?.author.name?.trim() || "").slice(0, 120));
  };
  const linkedPath = selected?.linkedProjectId
    ? "/production/projects/" + encodeURIComponent(selected.linkedProjectId) + "/settings" : null;
  return <ProductionWorkspaceDialog title={bt("제작 프로젝트 만들기", "Create a production project")}
    description={bt("저장된 내 작품을 제작 관리에 연결합니다. 생성 후 설정에서 실제 참여자와 담당 공정을 배정할 수 있습니다.",
      "Connect a saved work to production management, then assign real people and production roles in settings.")}
    onClose={onClose} busy={busy} dirty={!pending && Boolean(workId)}>
    {loading ? <p role="status">{bt("저장된 내 작품을 불러오고 있습니다.", "Loading your saved works.")}</p> : null}
    {loadError ? <div role="alert"><p>{loadError}</p><button type="button" className={buttonClass({ variant: "outline" })}
      onClick={() => setReload((value) => value + 1)}>{bt("작품 다시 불러오기", "Reload works")}</button></div> : null}
    {!loading && !loadError && !works.length ? <div className="space-y-3">
      <p>{bt("먼저 내 작품을 서버에 저장해 주세요.", "Save a work to the server first.")}</p>
      <Link className={buttonClass({ variant: "outline" })} to="/studio">{bt("내 작품 열기", "Open my works")}</Link>
    </div> : null}
    {!loading && !loadError && works.length ? <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="block space-y-2 text-sm font-semibold">
        <span>{bt("저장된 내 작품", "My saved work")}</span>
        <select className={fieldClass} value={workId} disabled={busy} required onChange={(event) => chooseWork(event.target.value)}>
          <option value="">{bt("작품 선택", "Choose a work")}</option>
          {works.map((work) => <option key={work.id} value={work.id}>{work.title}</option>)}
        </select>
      </label>
      {selected?.loading ? <p role="status">{bt("현재 소유권과 이전 생성 요청을 확인하고 있습니다.", "Checking ownership and previous creation requests.")}</p> : null}
      {selected?.error ? <div role="alert"><p>{selected.error}</p>
        <button type="button" className={buttonClass({ variant: "outline" })} onClick={() => setReload((value) => value + 1)}>{bt("선택 작품 다시 확인", "Check this work again")}</button></div> : null}
      {selected && !selected.loading && !selected.error && !selected.owner ? <p role="alert">{bt("현재 작품 소유자만 생성할 수 있습니다.", "Only the current work owner can create a project.")}</p> : null}
      {pending ? <div className="space-y-2 rounded-xl border border-warn/40 bg-warn/10 p-4" role="status">
        <p className="font-semibold">{bt("보관한 원래 요청의 생성 상태 확인", "Confirm the original saved creation request")}</p>
        <p className="text-sm">{pending.input.title} · {bt(...MODEL_LABELS[pending.input.collaborationModel])}</p>
        <p className="break-all text-xs text-fg-2">{pending.input.workId} · {pending.input.projectId}</p>
        <p className="text-xs text-fg-2">{bt("제목·작품·식별자를 바꾸지 않고 같은 요청의 결과만 확인합니다. 새로고침만으로 전송하지 않습니다.",
          "Confirms the same request with its original title, work and IDs. Reloading never sends it automatically.")}</p>
      </div> : linkedPath ? <div className="space-y-3">
        <p>{bt("이미 연결된 제작 프로젝트가 있습니다.", "A production project is already connected.")}</p>
        <Link to={linkedPath} className={buttonClass({ variant: "outline" })}>{bt("연결된 프로젝트 설정 열기", "Open connected project settings")}</Link>
      </div> : <>
        <label className="block space-y-2 text-sm font-semibold"><span>{bt("제작 프로젝트 제목", "Production project title")}</span>
          <input className={fieldClass} value={title} required maxLength={240} disabled={busy}
            onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="block space-y-2 text-sm font-semibold"><span>{bt("협업 모델", "Collaboration model")}</span>
          <select className={fieldClass} value={model} disabled={busy} onChange={(event) => {
            const next = COLLABORATION_MODELS.find((value) => value === event.target.value); if (next) setModel(next);
          }}>{COLLABORATION_MODELS.map((value) => <option key={value} value={value}>{bt(...MODEL_LABELS[value])}</option>)}</select></label>
        <label className="block space-y-2 text-sm font-semibold"><span>{bt("소유자 표시 이름", "Owner display name")}</span>
          <input className={fieldClass} value={ownerName} required maxLength={120} disabled={busy}
            onChange={(event) => setOwnerName(event.target.value)} /></label>
      </>}
      {error ? <p role="alert" className="text-sm text-bad">{error}</p> : null}
      {!linkedPath || pending ? <button type="submit" className={buttonClass()} disabled={busy || !selected?.owner
        || selected?.loading || Boolean(selected?.error) || (!pending && (!title.trim() || !ownerName.trim()))}>
        {busy ? bt("생성 결과 확인 중…", "Confirming creation…") : pending
          ? bt("원래 요청의 생성 상태 확인", "Confirm original creation") : bt("제작 프로젝트 생성", "Create production project")}
      </button> : null}
    </form> : null}
  </ProductionWorkspaceDialog>;
}
