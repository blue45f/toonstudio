/** 회차 음성 해설의 세션 보관·서버 읽기·화면 연결을 소유한다. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { getAuthUserId, listeners, type Session } from "@/domains/auth/public/session/auth-session-state";
import { useT } from "@/shared/lib/i18n";

import {
  listProductionVoiceCommentaries,
  readProductionVoiceCommentary,
  uploadProductionVoiceCommentary,
} from "./production-voice-commentary-api";
import type { VoiceViewCapture } from "./ReviewVoiceCommentaryPanel";
import { mergeVoiceCommentaryTracks, type VoiceCommentaryTrack, type VoiceViewSnapshot } from "./review-voice-commentary-model";
import type { StudioCommentsDocument } from "../studio-comments";
import { compareSourceKey } from "./compare-review-model";

export interface EpisodeVoiceCommentaryHostInput {
  readonly projectId: string;
  readonly episodeId: string;
  readonly isDemo: boolean;
  readonly tab: "viewer" | "compare";
  readonly comments: StudioCommentsDocument | null;
  readonly compareComments?: StudioCommentsDocument | null;
  readonly compareItems: readonly { readonly id: string }[];
  readonly pageId: string;
  readonly panelRef: RefObject<HTMLDivElement | null>;
  readonly programmaticScrollRef: RefObject<boolean>;
  readonly setTab: (next: "viewer" | "compare") => void;
  readonly captureCompareView?: () => VoiceViewCapture | null;
  readonly applyCompareView?: (view: VoiceViewSnapshot, pinThreadIds: readonly string[]) => void;
}

interface VoiceHostLifetime {
  readonly projectId: string;
  readonly episodeId: string;
  readonly revision: number;
  readonly isDemo: boolean;
  readonly userId: string | null;
  readonly requests: Set<AbortController>;
  readonly blobUrls: Set<string>;
  readonly retiredUrls: Set<string>;
  readonly blobByTrack: Map<string, string>;
  readonly saves: Map<string, symbol>;
  active: boolean;
}

function releaseVoiceHost(lifetime: VoiceHostLifetime): void {
  lifetime.active = false;
  lifetime.requests.forEach((controller) => controller.abort());
  lifetime.requests.clear();
  lifetime.blobUrls.forEach((url) => URL.revokeObjectURL(url));
  lifetime.blobUrls.clear();
  lifetime.retiredUrls.clear();
  lifetime.blobByTrack.clear();
  lifetime.saves.clear();
}

function voiceHostCurrent(lifetime: VoiceHostLifetime | null): lifetime is VoiceHostLifetime {
  return lifetime !== null && lifetime.active && lifetime.userId === getAuthUserId();
}

function abortedPlayback(): DOMException {
  return new DOMException("음성 재생의 소유자 또는 선택이 바뀌었습니다.", "AbortError");
}

export function useEpisodeVoiceCommentary({
  projectId, episodeId, isDemo, tab, comments, compareComments, pageId, panelRef, programmaticScrollRef, setTab,
  captureCompareView, applyCompareView,
}: EpisodeVoiceCommentaryHostInput) {
  const t = useT();
  const [voiceTracks, setVoiceTracks] = useState<readonly VoiceCommentaryTrack[]>([]);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voicePinIds, setVoicePinIds] = useState<readonly string[]>([]);
  const [voiceListState, setVoiceListState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [voiceSaveError, setVoiceSaveError] = useState<string | null>(null);
  const [ownerRevision, setOwnerRevision] = useState(0);
  const lifetimeRef = useRef<VoiceHostLifetime | null>(null);
  const lastVoiceViewRef = useRef<VoiceViewSnapshot | null>(null);

  // React가 묶은 UID A→B→A도 공개 세션 발행 시점에 이전 요청을 폐기한다.
  useLayoutEffect(() => {
    let publishedUserId = getAuthUserId();
    const published = (next: Session) => {
      const nextId = next?.user.id ?? null;
      if (publishedUserId === nextId) return;
      publishedUserId = nextId;
      if (lifetimeRef.current) releaseVoiceHost(lifetimeRef.current);
      lifetimeRef.current = null;
      setOwnerRevision((previous) => previous + 1);
    };
    listeners.add(published);
    return () => { listeners.delete(published); };
  }, []);

  useLayoutEffect(() => {
    const lifetime: VoiceHostLifetime = {
      projectId, episodeId, isDemo, revision: ownerRevision, userId: getAuthUserId(),
      requests: new Set(), blobUrls: new Set(), retiredUrls: new Set(),
      blobByTrack: new Map(), saves: new Map(), active: true,
    };
    lifetimeRef.current = lifetime;
    setVoiceTracks([]);
    setVoicePinIds([]);
    setVoicePanelOpen(false);
    setVoiceListState("idle");
    setVoiceSaveError(null);
    lastVoiceViewRef.current = null;
    return () => {
      releaseVoiceHost(lifetime);
      if (lifetimeRef.current === lifetime) lifetimeRef.current = null;
    };
  }, [projectId, episodeId, isDemo, ownerRevision]);

  const currentLifetime = useCallback(() => {
    const lifetime = lifetimeRef.current;
    return voiceHostCurrent(lifetime) && lifetime.projectId === projectId
      && lifetime.episodeId === episodeId && lifetime.revision === ownerRevision && lifetime.isDemo === isDemo ? lifetime : null;
  }, [projectId, episodeId, isDemo, ownerRevision]);

  useEffect(() => {
    const lifetime = currentLifetime();
    if (!lifetime || isDemo) return;
    const controller = new AbortController();
    lifetime.requests.add(controller);
    setVoiceListState("loading");
    void (async () => {
      try {
        const { items } = await listProductionVoiceCommentaries(projectId, episodeId, controller.signal);
        if (!voiceHostCurrent(lifetime) || controller.signal.aborted) return;
        for (const { track } of items) {
          const previousUrl = lifetime.blobByTrack.get(track.id);
          if (previousUrl && track.episodeId === episodeId) lifetime.retiredUrls.add(previousUrl);
        }
        setVoiceTracks((previous) => mergeVoiceCommentaryTracks(previous,
          items.map((item) => item.track).filter((track) => track.episodeId === episodeId)));
        setVoiceListState("ready");
      } catch {
        if (voiceHostCurrent(lifetime) && !controller.signal.aborted) setVoiceListState("error");
      } finally {
        lifetime.requests.delete(controller);
      }
    })();
    return () => { controller.abort(); lifetime.requests.delete(controller); };
  }, [projectId, episodeId, isDemo, currentLifetime]);

  // 트랙을 그린 커밋 뒤에만 사용이 끝난 URL을 해제한다. 업로드 실패의 탭 보관본은 유지한다.
  useEffect(() => {
    const lifetime = currentLifetime();
    if (!lifetime) return;
    const retained = new Set(voiceTracks.flatMap((track) => track.audio?.kind === "blob" ? [track.audio.url] : []));
    for (const url of lifetime.retiredUrls) {
      if (retained.has(url)) continue;
      URL.revokeObjectURL(url);
      lifetime.blobUrls.delete(url);
      lifetime.retiredUrls.delete(url);
    }
  }, [voiceTracks, currentLifetime]);

  const voiceCaptureRef = useRef({ tab, comments, compareComments, pageId, captureCompareView });
  useLayoutEffect(() => {
    voiceCaptureRef.current = { tab, comments, compareComments, pageId, captureCompareView };
  }, [tab, comments, compareComments, pageId, captureCompareView]);

  const captureVoiceView = useCallback((): VoiceViewCapture | null => {
    if (!currentLifetime()) return null;
    const current = voiceCaptureRef.current;
    if (current.tab === "compare") return current.captureCompareView?.() ?? null;
    const panel = panelRef.current;
    const maxX = panel ? Math.max(1, panel.scrollWidth - panel.clientWidth) : 1;
    const maxY = panel ? Math.max(1, panel.scrollHeight - panel.clientHeight) : 1;
    const tx = panel ? Math.min(1, Math.max(0, panel.scrollLeft / maxX)) : 0;
    const ty = panel ? Math.min(1, Math.max(0, panel.scrollTop / maxY)) : 0;
    return {
      view: { surface: "manuscript", poolItemId: null, pageId: current.pageId, mode: null, scale: 1, tx, ty },
      pinThreadIds: current.comments?.threads
        .filter((thread) => thread.anchor.type === "point" && thread.anchor.pageId === current.pageId && !thread.resolved)
        .map((thread) => thread.id) ?? [],
    };
  }, [currentLifetime, panelRef]);

  const applyVoiceView = useCallback((view: VoiceViewSnapshot, pinThreadIds: readonly string[]) => {
    const lifetime = currentLifetime();
    if (!lifetime) return;
    lastVoiceViewRef.current = view;
    setVoicePinIds(pinThreadIds);
    applyCompareView?.(view, pinThreadIds);
    if (view.surface === "compare") {
      setTab("compare");
      return;
    }
    setTab("viewer");
    requestAnimationFrame(() => {
      if (!voiceHostCurrent(lifetime)) return;
      const panel = panelRef.current;
      if (!panel) return;
      const maxX = Math.max(0, panel.scrollWidth - panel.clientWidth);
      const maxY = Math.max(0, panel.scrollHeight - panel.clientHeight);
      // 호출자가 읽는 스크롤 표시에 프로그램에 의한 이동임을 기록한다.
      programmaticScrollRef.current = true;
      panel.scrollTo({ left: Math.max(0, view.tx) * maxX, top: Math.max(0, view.ty) * maxY });
    });
  }, [currentLifetime, setTab, applyCompareView, panelRef, programmaticScrollRef]);

  const handleSaveVoiceTrack = useCallback((track: VoiceCommentaryTrack, audioBlob: Blob | null) => {
    const lifetime = currentLifetime();
    if (!lifetime || track.episodeId !== episodeId) {
      if (track.audio?.kind === "blob") URL.revokeObjectURL(track.audio.url);
      return;
    }
    const previousUrl = lifetime.blobByTrack.get(track.id);
    if (previousUrl && previousUrl !== track.audio?.url) lifetime.retiredUrls.add(previousUrl);
    if (track.audio?.kind === "blob") {
      lifetime.blobUrls.add(track.audio.url);
      lifetime.blobByTrack.set(track.id, track.audio.url);
    }
    const operation = Symbol(track.id);
    lifetime.saves.set(track.id, operation);
    setVoiceTracks((previous) => [...previous.filter((kept) => kept.id !== track.id), track]);
    setVoicePanelOpen(true);
    setVoiceSaveError(null);
    if (!audioBlob || isDemo) return;
    const controller = new AbortController();
    lifetime.requests.add(controller);
    void (async () => {
      try {
        const { view } = await uploadProductionVoiceCommentary({
          projectId, episodeId, operationId: `episode-voice-commentary:${track.id}`, track, file: audioBlob,
        }, controller.signal);
        if (!voiceHostCurrent(lifetime) || controller.signal.aborted || lifetime.saves.get(track.id) !== operation) return;
        if (view.track.id !== track.id || view.track.episodeId !== episodeId) throw new Error("voice_upload_response_changed");
        if (track.audio?.kind === "blob") lifetime.retiredUrls.add(track.audio.url);
        setVoiceTracks((previous) => [...previous.filter((kept) => kept.id !== track.id), view.track]);
      } catch {
        if (voiceHostCurrent(lifetime) && !controller.signal.aborted && lifetime.saves.get(track.id) === operation) {
          setVoiceSaveError(t("productionHub.status.voiceSaveFailed", "해설을 서버에 저장하지 못했어요. 방금 녹음은 이 탭에서 계속 들을 수 있지만 새로고침하면 사라져요."));
        }
      } finally {
        lifetime.requests.delete(controller);
      }
    })();
  }, [currentLifetime, episodeId, projectId, isDemo, t]);

  const handlePrepareVoicePlayback = useCallback(async (track: VoiceCommentaryTrack, signal: AbortSignal) => {
    const lifetime = currentLifetime();
    if (!lifetime || signal.aborted || track.episodeId !== episodeId) throw abortedPlayback();
    if (track.audio?.kind !== "server" || isDemo) return track;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    lifetime.requests.add(controller);
    try {
      const read = await readProductionVoiceCommentary(projectId, episodeId, track.id, controller.signal);
      if (!voiceHostCurrent(lifetime) || controller.signal.aborted || signal.aborted) throw abortedPlayback();
      if (read.track.id !== track.id || read.track.episodeId !== episodeId || read.track.audio?.kind !== "server") {
        throw new Error("voice_playback_response_changed");
      }
      const refreshed: VoiceCommentaryTrack = {
        ...read.track, audio: { ...read.track.audio, url: read.signedRead.url },
      };
      setVoiceTracks((previous) => previous.map((kept) => kept.id === track.id ? refreshed : kept));
      return refreshed;
    } finally {
      signal.removeEventListener("abort", abort);
      lifetime.requests.delete(controller);
    }
  }, [currentLifetime, episodeId, projectId, isDemo]);

  const handleOpenVoicePin = useCallback((threadId: string) => {
    if (!currentLifetime()) return;
    setVoicePinIds([threadId]);
    const current = voiceCaptureRef.current;
    const thread = current.compareComments?.threads.find((candidate) => candidate.id === threadId)
      ?? current.comments?.threads.find((candidate) => candidate.id === threadId);
    if (thread?.anchor.type === "compare-image") {
      const anchor = thread.anchor;
      const previous = lastVoiceViewRef.current;
      const containsSource = previous?.surface === "compare" && (previous.poolItemId === anchor.poolItemId
        || previous.compare?.panes.some((pane) => compareSourceKey(pane) === anchor.poolItemId));
      applyVoiceView(containsSource && previous ? previous : {
        surface: "compare", poolItemId: anchor.poolItemId, pageId: null,
        mode: "panes", scale: 1, tx: 0, ty: 0,
      }, [threadId]);
      return;
    }
    setTab("viewer");
  }, [currentLifetime, setTab, applyVoiceView]);

  return {
    voiceTracks, voicePanelOpen, setVoicePanelOpen, voicePinIds, voiceListState, voiceSaveError,
    captureVoiceView, applyVoiceView, handleSaveVoiceTrack, handlePrepareVoicePlayback, handleOpenVoicePin,
  };
}
