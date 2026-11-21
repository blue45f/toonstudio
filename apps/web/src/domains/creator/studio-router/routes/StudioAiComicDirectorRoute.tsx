import "../../studio-shell/creator-workflow-surfaces.css";
import {
  BookOpenCheck,
  ChevronRight,
  Cloud,
  CloudOff,
  Layers3,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { StudioToonAutomationWorkspace } from "../../ai/StudioToonAutomationWorkspace";
import { retryFailedStudioLocalDatabaseOpen } from "../../studio-local-database-runtime";
import { DirectorDeviceOpenFailure, readDirectorDeviceDraft, writeDirectorDeviceDraft } from "../../ai/studio-director-device-draft";
import { prepareDirectorEditorReturn } from "../../ai/studio-director-editor-return";
import { StudioDirectorDraftSync, type DirectorDraftPatch } from "../../ai/studio-director-draft-sync";
import { createStudioAiComicDirectorApiClient } from "../../ai/studio-ai-comic-director-api";
import { resolvePersistedAiErrorText } from "../../ai/studio-ai-error-i18n-t4t5";
import type { StudioScenarioImageGenerationRequest } from "../../ai/studio-scenario-candidate-workflow";
import {
  createStudioAiComicDirectorSession,
  reconcileStudioAiComicDirectorJobs,
  studioAiComicDirectorCandidateDigest,
  type StudioAiComicDirectorSessionDocument,
  type StudioAiVisualBibleEntry,
} from "../../ai/studio-ai-comic-director-session";
import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../../studio-panel-ui";

import type { StudioCompositionRouteResolution } from "../studio-route-manifest";

import { useT } from "@/shared/lib/i18n";
import { useApp } from "@/shared/lib/store";
import { creatorSub2StatusText } from "../../status-i18n/studio-creator-sub2-status-i18n-r3c13b";
import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";
import { cn } from "@/shared/lib/utils";

interface StudioAiComicDirectorRouteProps {
  readonly resolution: StudioCompositionRouteResolution;
}

function uid(): string {
  return createSecureRandomUuid(
    creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.sessionIdUnavailable", "이 브라우저에서는 안전한 AI 코믹 디렉터 세션 ID를 만들 수 없습니다."),
  );
}

function routePath(
  resolution: StudioCompositionRouteResolution,
  sessionId: string,
): string {
  if (resolution.workId) {
    return `/studio/work/${encodeURIComponent(resolution.workId)}/compose/${encodeURIComponent(sessionId)}`;
  }
  if (resolution.remixSourceWorkId) {
    return `/studio/remix/${encodeURIComponent(resolution.remixSourceWorkId)}/compose/${encodeURIComponent(sessionId)}`;
  }
  return `/studio/compose/${encodeURIComponent(sessionId)}`;
}

type StudioAutomationSurface = "comic" | "animation" | "character";

function studioSurfacePath(
  resolution: StudioCompositionRouteResolution,
  surface: StudioAutomationSurface,
): string {
  if (resolution.workId) {
    return `/studio/work/${encodeURIComponent(resolution.workId)}/${surface}`;
  }
  if (resolution.remixSourceWorkId) {
    return `/studio/remix/${encodeURIComponent(resolution.remixSourceWorkId)}/${surface}`;
  }
  return `/studio/${surface}`;
}

// 같은 문서에서 방금 발급한 ID만 저장소 장애 중의 임시 집필을 허용한다.
let issuedPersonalDraft: string | null = null;

function DirectorNewSession({ resolution }: StudioAiComicDirectorRouteProps) {
  const [id] = useState(uid);
  useLayoutEffect(() => {
    issuedPersonalDraft = !resolution.workId && !resolution.remixSourceWorkId ? id : null;
  }, [id, resolution.workId, resolution.remixSourceWorkId]);
  const location = useLocation();
  return <Navigate replace to={routePath(resolution, id) + location.search + location.hash} />;
}

const BIBLE_KINDS: readonly {
  readonly id: StudioAiVisualBibleEntry["kind"];
  readonly label: string;
  readonly description: string;
}[] = [
  { id: "character", label: "캐릭터", description: "얼굴·체형·실루엣·식별 특징" },
  { id: "costume", label: "의상", description: "버전·색·재질·손상 상태" },
  { id: "location", label: "장소", description: "랜드마크·평면·카메라 앵커" },
  { id: "prop", label: "소품", description: "소유자·방향·상태 변화" },
  { id: "style", label: "화풍", description: "선·팔레트·명암·질감" },
  { id: "lighting", label: "광원", description: "시간대·방향·색온도·대비" },
];

const STAGES = [
  ["brief", "01", "이야기·기준"],
  ["direction", "02", "컷 연출"],
  ["production", "03", "제작·수리"],
  ["finish", "04", "마감·추가"],
] as const;

export function StudioAiComicDirectorRoute({
  resolution,
}: StudioAiComicDirectorRouteProps): ReactElement {
  return resolution.sessionId === "new" ? <DirectorNewSession resolution={resolution}/> : <DirectorDeviceSession resolution={resolution}/>;
}

function DirectorDeviceSession({ resolution }: StudioAiComicDirectorRouteProps) {
  const [draft, setDraft] = useState<StudioDirectorDraftSync | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { sessionId: id, workId, remixSourceWorkId } = resolution;
  const [issuedHere] = useState(() => id === issuedPersonalDraft && !workId && !remixSourceWorkId);
  useEffect(() => {
    let active = true;
    if (issuedPersonalDraft === id) issuedPersonalDraft = null;
    const write = (expected: string | null, value: string) => writeDirectorDeviceDraft(id, expected, value);
    readDirectorDeviceDraft(id).then(({ session, raw }) => {
      if (!active) return;
      if (session && (session.workId !== workId || session.remixSourceWorkId !== remixSourceWorkId)) throw Error("다른 작품의 대본입니다.");
      const seed = session ? { ...session, jobs: reconcileStudioAiComicDirectorJobs(session.jobs) }
        : createStudioAiComicDirectorSession({ id, workId, remixSourceWorkId, title: "새 AI 코믹 디렉터 세션" });
      setDraft(new StudioDirectorDraftSync(seed, raw, write));
    }).catch(cause => {
      if (!active) return;
      if (issuedHere && cause instanceof DirectorDeviceOpenFailure) {
        const seed = createStudioAiComicDirectorSession({ id, title: "새 AI 코믹 디렉터 세션" });
        setDraft(new StudioDirectorDraftSync(seed, null, write, true));
      } else setFailed(true);
    });
    return () => { active = false; };
  }, [id, workId, remixSourceWorkId, attempt, issuedHere]);
  if (draft) return <DirectorWorkspace resolution={resolution} draft={draft}/>;
  return <div className="mx-auto max-w-xl space-y-3 p-6">
    <p role={failed ? "alert" : "status"}>{failed
      ? creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.deviceLoadFailed", "이 기기의 대본을 열지 못했어요. 다른 편집 탭을 닫고 다시 시도하세요.")
      : creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.deviceLoading", "대본을 여는 중…")}</p>
    {failed && <button type="button" className={cn("min-h-11 rounded-lg border border-line px-4", STUDIO_FOCUS_RING)}
      onClick={async () => {
        setFailed(false);
        await retryFailedStudioLocalDatabaseOpen();
        setAttempt(n => n + 1);
      }}>
      {creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.retryDeviceLoad", "대본 다시 열기")}
    </button>}
  </div>;
}

function DirectorWorkspace({ resolution, draft }: StudioAiComicDirectorRouteProps & { draft: StudioDirectorDraftSync }): ReactElement {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const api = useMemo(() => createStudioAiComicDirectorApiClient(), []);
  const [{ session, storageFailed, saving }, setDraftView] = useState(() => draft.snapshot());
  useEffect(() => draft.subscribe(() => setDraftView(draft.snapshot())), [draft]);
  useEffect(() => {
    const protectPendingDraft = (event: BeforeUnloadEvent) => {
      const state = draft.snapshot();
      if (!state.saving && !state.storageFailed) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectPendingDraft);
    return () => window.removeEventListener("beforeunload", protectPendingDraft);
  }, [draft]);
  const [networkBusy, setNetworkBusy] = useState(true);
  const pending = useRef(true);
  const [scopeRejected, setScopeRejected] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const initialSessionRef = useRef(session);
  const initialCreate = useRef<ReturnType<typeof api.createSession> | null>(null);
  const initialResolutionRef = useRef(resolution);
  const automationOpen = new URLSearchParams(location.search).get("view") === "automation";
  const [syncState, setSyncState] = useState<
    "local" | "loading" | "saved" | "conflict" | "error"
  >("local");
  const [message, setMessage] = useState<string | null>(null);
  const [newBibleName, setNewBibleName] = useState("");
  const [newBibleKind, setNewBibleKind] = useState<StudioAiVisualBibleEntry["kind"]>(
    "character",
  );

  const rejectMismatchedScope = useCallback(() => {
    setScopeRejected(true);
    setSyncState("error");
    setMessage(creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.scopeMismatch", "이 작품과 저장된 대본이 일치하지 않습니다. 현재 대본을 보존했습니다."));
  }, []);

  const reflectRemote = useCallback((kind: "read" | "save" | "reload", issued: StudioAiComicDirectorSessionDocument, remote: StudioAiComicDirectorSessionDocument) => {
    const state = draft.receive(kind, issued, remote);
    setDraftView(draft.snapshot());
    setSyncState(state);
    if (state === "conflict") setMessage("서버의 원고와 이 기기의 수정본이 달라요. 로컬 대본을 유지했습니다.");
    if (state === "local") setMessage("응답을 기다리는 동안 수정한 대본은 계속 편집할 수 있어요.");
    return state;
  }, [draft]);

  useEffect(() => {
    let active = true;
    const seedSession = initialSessionRef.current;
    const initialResolution = initialResolutionRef.current;
    const createInitialSession = () => initialCreate.current ??= api.createSession(seedSession);
    const synchronize = async () => {
      pending.current = true;
      setNetworkBusy(true);
      draft.persist();
      setDraftView(draft.snapshot());
      setSyncState("loading");
      const remote = await api.getSession(initialResolution.sessionId);
      if (!active) return;
      if (remote.ok) {
        reflectRemote("read", seedSession, {
          ...remote.data, jobs: reconcileStudioAiComicDirectorJobs(remote.data.jobs),
        });
        return;
      }
      if (remote.code === "not_found") {
        const created = await createInitialSession();
        if (!active) return;
        if (created.ok) {
          reflectRemote("save", seedSession, created.data);
        } else {
          setSyncState(created.code === "not_authenticated" ? "local" : "error");
          setMessage(created.message);
        }
        return;
      }
      setSyncState(remote.code === "not_authenticated" ? "local" : "error");
      setMessage(remote.message);
    };
    void synchronize().catch(() => {
      if (active) rejectMismatchedScope();
    }).finally(() => {
      if (active) { pending.current = false; setNetworkBusy(false); }
    });
    return () => {
      active = false;
    };
  }, [api, draft, reflectRemote, rejectMismatchedScope]);

  const patchSession = (patch: DirectorDraftPatch) => {
    draft.edit(patch);
    setDraftView(draft.snapshot());
    setSyncState(draft.conflicted ? "conflict" : "local");
    if (!draft.conflicted && !scopeRejected) setMessage(null);
  };

  const setAutomationView = (open: boolean) => {
    const params = new URLSearchParams(location.search);
    if (open) params.set("view", "automation");
    else params.delete("view");
    const search = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  };

  const openStudioSurface = (surface: StudioAutomationSurface) => {
    navigate(studioSurfacePath(resolution, surface));
  };

  const synchronizeDraft = async (kind: "save" | "reload") => {
    if (scopeRejected || pending.current || (kind === "save" && draft.conflicted)) return;
    pending.current = true;
    setNetworkBusy(true);
    setSyncState("loading");
    const issued = draft.current;
    try {
      const result = kind === "save" ? await api.updateSession(issued, issued.revision) : await api.getSession(issued.id);
      if (!mounted.current) return;
      if (result.ok) {
        if (reflectRemote(kind, issued, result.data) === "saved") {
          setMessage(kind === "save" ? "클라우드에 대본과 제작 기준을 저장했습니다." : "클라우드에 저장된 콘티를 불러왔습니다.");
        }
      } else {
        if (result.code === "conflict") draft.conflicted = true;
        setSyncState(draft.conflicted ? "conflict" : result.code === "not_authenticated" ? "local" : "error");
        setMessage(result.message);
      }
    } catch {
      if (mounted.current) rejectMismatchedScope();
    } finally {
      if (mounted.current) { pending.current = false; setNetworkBusy(false); }
    }
  };

  const addBibleEntry = () => {
    const name = newBibleName.normalize("NFKC").trim();
    if (!name) return;
    const entry: StudioAiVisualBibleEntry = {
      id: uid(),
      kind: newBibleKind,
      name,
      version: "v1",
      referenceAssetIds: [],
      constraints: [],
      rightsStatus: "review_required",
      canSendToExternalProvider: false,
    };
    patchSession({
      visualBible: {
        ...session.visualBible,
        revision: session.visualBible.revision + 1,
        entries: [...session.visualBible.entries, entry],
        updatedAt: new Date().toISOString(),
      },
    });
    setNewBibleName("");
  };

  const saveBibleRevision = async () => {
    if (scopeRejected || networkBusy) return;
    setSyncState("loading");
    const result = await api.appendVisualBibleRevision(
      session.id,
      session.visualBible,
    );
    if (!mounted.current) return;
    if (result.ok) {
      if (draft.current.visualBible !== session.visualBible) {
        setSyncState("local");
        setMessage("먼저 보낸 작품 기준을 저장했습니다. 이후 수정한 기준은 이 기기에 남아 있습니다.");
        return;
      }
      patchSession({ visualBible: result.data });
      setMessage(`작품 바이블 버전 #${result.data.revision}을 저장했습니다.`);
    } else {
      setSyncState(result.code === "not_authenticated" ? "local" : "error");
      setMessage(result.message);
    }
  };

  const openScenesInEditor = async (request?: StudioScenarioImageGenerationRequest) => {
    const actor = useApp.getState().userId;
    const saved = await draft.persist();
    if (!mounted.current || actor !== useApp.getState().userId) return;
    const href = saved && draft.current === session && prepareDirectorEditorReturn(session, resolution.editorHref, request);
    if (!href) {
      setMessage(creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.handoffFailed", "콘티를 원고로 넘기지 못했습니다. 이 기기의 저장 공간과 작품 로그인을 확인해 주세요."));
      return;
    }
    if (window.crossOriginIsolated) navigate(href);
    else window.location.assign(href);
  };

  const continueInEditor = () => openScenesInEditor();

  const changeAutomationScene = (
    index: number,
    patch: Partial<StudioAiComicDirectorSessionDocument["scenes"][number]>,
  ) => {
    const current = session.scenes[index];
    if (!current) return;
    const generationInputChanged =
      (typeof patch.imagePrompt === "string" && patch.imagePrompt !== current.imagePrompt)
      || ("continuity" in patch && patch.continuity !== current.continuity)
      || (typeof patch.aspect === "string" && patch.aspect !== current.aspect);
    patchSession({
      scenes: session.scenes.map((scene, sceneIndex) =>
        sceneIndex === index
          ? {
              ...scene,
              ...patch,
              ...(generationInputChanged
                ? { imageDataUrl: undefined, imageError: undefined, imageProvenance: undefined }
                : {}),
            }
          : scene,
      ),
    });
  };

  const replaceAutomationScenes = (
    scenes: readonly StudioAiComicDirectorSessionDocument["scenes"][number][],
  ) => patchSession({ scenes: [...scenes] });

  const candidateDigest = studioAiComicDirectorCandidateDigest(session.scenes);
  const activeApproval =
    session.approval?.status === "active"
    && session.approval.sessionRevision === session.revision
    && session.approval.candidateDigest === candidateDigest;

  return (
    <div
      className="min-h-[calc(100dvh-4rem)] bg-canvas px-3 py-4 text-fg sm:px-5 lg:px-8"
      data-creator-workflow="ai-director"
      data-studio-ai-comic-director-route="true"
    >
      <div className="mx-auto max-w-[90rem]">
        <header className="creator-workflow-topbar flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-on-accent">
            <img className="creator-workflow-director-avatar" src="/brand/illustrated-20260928/luna.webp" alt="" aria-hidden="true" width={44} height={44} decoding="async" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-accent">
              연출 작업실
            </p>
            <h1 className="truncate text-xl font-bold tracking-tight">
              AI 코믹 디렉터
            </h1>
            <p className="text-xs tabular-nums text-fg-3" title={session.id}>
              세션 {session.id.slice(0, 8)} · 버전 #{session.revision}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={automationOpen}
              onClick={() => setAutomationView(!automationOpen)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
                automationOpen
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg hover:bg-raised",
              )}
            >
              <Sparkles size={13} aria-hidden />
              {automationOpen ? "디렉터 보기" : "통합 제작 자동화"}
            </button>
            <span
              role="status"
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
                syncState === "saved"
                  ? "border-good/35 bg-good/10 text-good"
                  : syncState === "conflict" || storageFailed
                    ? "border-warn/35 bg-warn/10 text-warn"
                    : "border-line bg-card text-fg-3",
              )}
            >
              {syncState === "loading" ? (
                <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : syncState === "saved" ? (
                <Cloud size={12} aria-hidden />
              ) : (
                <CloudOff size={12} aria-hidden />
              )}
              {syncState === "saved"
                ? "클라우드 저장됨"
                : syncState === "loading"
                  ? "동기화 중"
                  : syncState === "conflict"
                    ? "버전 충돌"
                    : storageFailed
                      ? creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.deviceUnsaved", "기기에 저장 안 됨")
                      : saving ? creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.deviceSaving", "기기에 저장 중…") : "로컬 자동 저장"}
            </span>
            {syncState === "conflict" ? (
              <button
                type="button"
                disabled={networkBusy || scopeRejected}
                onClick={() => void synchronizeDraft("reload")}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised",
                  STUDIO_FOCUS_RING,
                )}
              >
                <RefreshCw size={13} aria-hidden />
                최신 버전 불러오기
              </button>
            ) : (
              <button
                type="button"
                disabled={networkBusy || scopeRejected}
                onClick={() => void synchronizeDraft("save")}
                className={cn(
                  "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold hover:bg-raised",
                  STUDIO_FOCUS_RING,
                )}
              >
                클라우드 저장
              </button>
            )}
            <button
              type="button"
              onClick={continueInEditor}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              <Play size={13} aria-hidden />
              Studio에서 제작 계속
            </button>
          </div>
        </header>

        {storageFailed && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/45 bg-warn/10 p-3">
            <p role="alert" className="min-w-0 flex-1 basis-60 text-sm text-fg">
              {creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.deviceSaveFailed", "이 기기에 대본을 저장하지 못했습니다. 창을 닫기 전에 다시 저장하거나 대본을 복사하세요.")}
            </p>
            <button type="button" className={cn("min-h-11 rounded-lg border border-line bg-card px-3 text-sm font-semibold", STUDIO_FOCUS_RING)}
              onClick={async () => {
                await retryFailedStudioLocalDatabaseOpen();
                if (await draft.persist(true) && mounted.current) setMessage(creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.deviceSaved", "이 기기에 대본을 저장했습니다."));
              }}>
              {creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.retryDeviceSave", "이 기기에 다시 저장")}
            </button>
          </div>
        )}
        {message ? (
          <p
            role="status"
            className="mt-3 rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-2"
          >
            {message}
          </p>
        ) : null}

        {automationOpen ? (
          <StudioToonAutomationWorkspace
            sessionId={session.id}
            title={session.title}
            storyText={session.storyText}
            sceneCount={session.scenes.length}
            scenes={session.scenes}
            visualBibleEntryCount={session.visualBible.entries.length}
            document={session.automation}
            onChange={(automation) => patchSession({ automation })}
            onChangeScene={changeAutomationScene}
            onReplaceScenes={replaceAutomationScenes}
            onGenerateScenes={openScenesInEditor}
            onOpenDirector={() => setAutomationView(false)}
            onOpenSurface={openStudioSurface}
            onOpenUsage={() => navigate("/membership")}
            disabled={syncState === "loading"}
          />
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label={t("studio.canvas.shell.aiDirectorStepsAriaLabel", "AI 코믹 디렉터 제작 단계")}>
            <ol className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1">
              {STAGES.map(([id, number, label]) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-current={session.stage === id ? "step" : undefined}
                    onClick={() => patchSession({ stage: id })}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-2 rounded-xl border px-3 text-left",
                      STUDIO_TOUCH_TARGET,
                      STUDIO_FOCUS_RING,
                      session.stage === id
                        ? "border-accent/45 bg-accent-soft"
                        : "border-transparent text-fg-3 hover:bg-card hover:text-fg",
                    )}
                  >
                    <span className={cn("font-mono text-base font-bold tabular-nums", session.stage === id ? "text-accent" : "text-fg-3")}>{number}</span>
                    <strong className="text-xs">{label}</strong>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <section className="min-w-0">
            {session.stage === "brief" ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
                <section className="rounded-2xl border border-line bg-panel p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <BookOpenCheck size={16} className="text-accent" aria-hidden />
                    <div>
                      <h2 className="text-sm font-bold">이야기와 제작 기준</h2>
                      <p className="text-xs text-fg-3">
                        원문은 보존되고 Studio 편집기로 그대로 전달됩니다.
                      </p>
                    </div>
                  </div>
                  <label className="block text-xs font-semibold text-fg-2">
                    세션 제목
                    <input
                      type="text"
                      value={session.title}
                      onChange={(event) => patchSession({ title: event.target.value.slice(0, 160) })}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-3 outline-none focus:border-accent"
                    />
                  </label>
                  <label className="mt-3 block text-xs font-semibold text-fg-2">
                    이야기 또는 회차 대본
                    <textarea
                      value={session.storyText}
                      onChange={(event) => patchSession({ storyText: event.target.value.slice(0, 12_000) })}
                      rows={12}
                      className="mt-1 w-full resize-y rounded-xl border border-line bg-card px-3 py-2 leading-relaxed outline-none focus:border-accent"
                    />
                  </label>
                  <label className="mt-3 block text-xs font-semibold text-fg-2">
                    캐릭터·스타일 고정 설명
                    <textarea
                      value={session.characterDescription}
                      onChange={(event) => patchSession({ characterDescription: event.target.value.slice(0, 4_000) })}
                      rows={5}
                      className="mt-1 w-full resize-y rounded-xl border border-line bg-card px-3 py-2 outline-none focus:border-accent"
                    />
                  </label>
                </section>

                <aside className="rounded-2xl border border-line bg-panel p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-accent" aria-hidden />
                    <div>
                      <h2 className="text-sm font-bold">작품 바이블</h2>
                      <p className="text-xs tabular-nums text-fg-3">
                        버전 #{session.visualBible.revision} · {session.visualBible.entries.length}개 기준
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {session.visualBible.entries.map((entry) => (
                      <article key={entry.id} className="rounded-xl border border-line bg-card p-2.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs">{entry.name}</strong>
                          <span className="ml-auto rounded-full border border-line px-2 py-0.5 text-xs text-fg-3">
                            {BIBLE_KINDS.find((kind) => kind.id === entry.kind)?.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-fg-3">
                          {entry.canSendToExternalProvider
                            ? "외부 생성 요청 허용"
                            : "외부 전송 확인 필요"}
                        </p>
                      </article>
                    ))}
                  </div>
                  <label className="mt-3 block text-xs font-semibold text-fg-2">
                    기준 종류
                    <select
                      value={newBibleKind}
                      onChange={(event) => setNewBibleKind(event.target.value as StudioAiVisualBibleEntry["kind"])}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2"
                    >
                      {BIBLE_KINDS.map((kind) => (
                        <option key={kind.id} value={kind.id}>{kind.label} · {kind.description}</option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-2 block text-xs font-semibold text-fg-2">
                    기준 이름
                    <input
                      type="text"
                      value={newBibleName}
                      onChange={(event) => setNewBibleName(event.target.value.slice(0, 120))}
                      className="mt-1 min-h-11 w-full rounded-lg border border-line bg-card px-2"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={addBibleEntry}
                    disabled={!newBibleName.trim()}
                    className="mt-2 min-h-11 w-full rounded-lg border border-line bg-card text-xs font-semibold hover:bg-raised disabled:opacity-45"
                  >
                    작품 기준 추가
                  </button>
                  <button
                    type="button"
                    disabled={networkBusy || scopeRejected}
                    onClick={() => void saveBibleRevision()}
                    className="mt-2 min-h-11 w-full rounded-lg bg-accent text-xs font-bold text-on-accent"
                  >
                    새 작품 바이블 버전 저장
                  </button>
                </aside>
              </div>
            ) : null}

            {session.stage === "direction" ? (
              <section className="rounded-2xl border border-line bg-panel p-4">
                <h2 className="text-sm font-bold">컷 연출 준비</h2>
                <p className="mt-1 text-xs text-fg-3">
                  현재 세션에는 {session.scenes.length}개 컷이 있습니다. Studio 편집기에서 체크박스 다중 선택, 비트·카메라·대사·연속성 기준을 조정할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={continueInEditor}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent"
                >
                  컷 연출 작업면 열기 <ChevronRight size={13} aria-hidden />
                </button>
              </section>
            ) : null}

            {session.stage === "production" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="rounded-2xl border border-line bg-panel p-4">
                  <div className="flex items-center gap-2"><Sparkles size={16} className="text-accent" aria-hidden /><h2 className="text-sm font-bold">제작 작업</h2></div>
                  <p className="mt-1 text-xs text-fg-3">생성·부분 수리·품질 분석·레이어 분리 작업은 작업 번호와 안전 잠금으로 복구 가능하게 기록됩니다.</p>
                  <div className="mt-3 space-y-2">
                    {session.jobs.length ? session.jobs.map((job) => (
                      <article key={job.id} className="rounded-xl border border-line bg-card p-3">
                        <div className="flex items-center gap-2"><strong className="text-xs">{job.kind}</strong><span className="ml-auto rounded-full border border-line px-2 py-0.5 text-xs">{job.status}</span></div>
                        <p className="mt-1 text-xs tabular-nums text-fg-3" title={job.operationId}>{job.progressDone}/{job.progressTotal} · 작업 #{job.operationId.slice(0, 8)}</p>
                        {job.error ? <p className="mt-1 text-xs text-bad">{resolvePersistedAiErrorText(job.error)}</p> : null}
                      </article>
                    )) : <p className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-fg-3">{creatorSub2StatusText("studio.creatorSub2.status.router.aiDirector.jobsEmpty", "아직 작업 기록이 없습니다.")}</p>}
                  </div>
                </section>
                <section className="rounded-2xl border border-line bg-panel p-4">
                  <div className="flex items-center gap-2"><Layers3 size={16} className="text-accent" aria-hidden /><h2 className="text-sm font-bold">후보·부분 수리·레이어</h2></div>
                  <p className="mt-1 text-xs text-fg-3">후보 {session.scenes.reduce((total, scene) => total + (scene.imageCandidates?.length ?? 0), 0)}개 · 편집 레이어 {session.scenes.reduce((total, scene) => total + (scene.layerManifest?.layers.length ?? 0), 0)}개</p>
                  <button type="button" onClick={continueInEditor} className="mt-4 min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent">제작·수리 작업면 열기</button>
                </section>
              </div>
            ) : null}

            {session.stage === "finish" ? (
              <section className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-accent" aria-hidden /><h2 className="text-sm font-bold">검수 버전과 Studio 인계</h2></div>
                <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">검수 버전</dt><dd className="mt-1 font-bold tabular-nums">#{session.revision}</dd></div>
                  <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">후보 확인 코드</dt><dd className="mt-1 break-all font-mono font-bold">{candidateDigest}</dd></div>
                  <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">현재 승인</dt><dd className={cn("mt-1 font-bold", activeApproval ? "text-good" : "text-warn")}>{activeApproval ? "현재 버전 승인됨" : "검수 다시 필요"}</dd></div>
                  <div className="rounded-xl border border-line bg-card p-3"><dt className="text-fg-3">적용 정책</dt><dd className="mt-1 font-bold">원본 보존 추가 · 한 번에 되돌리기</dd></div>
                </dl>
                <button type="button" onClick={continueInEditor} className="mt-4 min-h-11 rounded-lg bg-accent px-4 text-xs font-bold text-on-accent">Studio 마감·추가 열기</button>
              </section>
            ) : null}
          </section>
        </div>
        )}
      </div>
    </div>
  );
}
