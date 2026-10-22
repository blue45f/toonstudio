/**
 * Production 회차 검수 룸 — 비동기 음성 해설 호스트 훅.
 *
 * `ProductionEpisodeReviewRoom.tsx`에서 분리했다. 패널(ReviewVoiceCommentaryPanel)은
 * 콜백 계약만 아는 순수 표면이라, 실제 탭·뷰포트·핀 상태는 룸이 소유하고
 * 이 훅이 어댑터를 만든다.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  listProductionVoiceCommentaries,
  uploadProductionVoiceCommentary,
} from "./production-voice-commentary-api";
import type { VoiceViewCapture } from "./ReviewVoiceCommentaryPanel";
import {
  mergeVoiceCommentaryTracks,
  type VoiceCommentaryTrack,
  type VoiceViewSnapshot,
} from "./review-voice-commentary-model";
import type { StudioCommentsDocument } from "../studio-comments";

export interface EpisodeVoiceCommentaryHostInput {
  readonly projectId: string;
  readonly episodeId: string;
  readonly isDemo: boolean;
  readonly tab: "viewer" | "compare";
  readonly comments: StudioCommentsDocument | null;
  readonly compareItems: readonly { readonly id: string }[];
  readonly pageId: string;
  readonly panelRef: RefObject<HTMLDivElement | null>;
  readonly programmaticScrollRef: RefObject<boolean>;
  readonly setTab: (next: "viewer" | "compare") => void;
}

export function useEpisodeVoiceCommentary({
  projectId,
  episodeId,
  isDemo,
  tab,
  comments,
  compareItems,
  pageId,
  panelRef,
  programmaticScrollRef,
  setTab,
}: EpisodeVoiceCommentaryHostInput) {
// ── 비동기 검수 해설(음성 해설) 호스트 배선 ─────────────────────────────
// 패널(ReviewVoiceCommentaryPanel)은 콜백 계약만 아는 순수 표면이라, 실제
// 탭·뷰포트·핀 상태는 이 룸이 소유하고 어댑터를 여기서 만든다.
// - captureView: 현재 탭 + 룸 패널 스크롤(정규화 0..1) + 열린 핀 스레드를
//   VoiceViewSnapshot으로 변환한다. 원고 뷰어·비교 뷰어 내부의 줌/팬 상태는
//   각 뷰어가 자체 소유해 호스트가 읽을 수 없으므로 scale은 1로 기록한다.
// - onApplyView: 표면에 맞는 탭으로 전환하고, 원고 표면이면 기록된 스크롤을
//   룸 패널에 적용하며, 큐가 가리키는 핀을 아래 요약 목록으로 하이라이트한다.
//   비교 뷰어(ProcessCompareViewer)의 페인·뷰포트는 내부 상태라 호스트에서
//   강제 적용할 수 없어, 비교 표면 적용은 탭 전환+핀 하이라이트까지가 범위다.
// - onSaveTrack(저장): 실제 프로젝트에서는 제작 모듈의 회차 음성 해설
//   엔드포인트(POST /production/projects/:projectId/episodes/:episodeId/
//   voice-commentaries)로 업로드해 서버 저장 트랙으로 교체한다. 검수 음성
//   노트 API는 project-graph 식별자·전사를 필수로 요구해 이 룸에서는 쓸 수
//   없어, 같은 운영 정책(5MB·보유 기본 14일/최대 30일·서명 읽기)을 따르는
//   전용 경로를 둔다. 데모이거나 업로드가 실패하면 패널이 만든 blob 참조
//   트랙을 세션 상태에 그대로 보관한다 — 이 탭 안에서만 미리듣기가 되고
//   새로고침하면 사라지며, 모델의 parse가 blob 오디오를 복원 대상에서
//   제외하는 정책과 같은 한계다.
// - 목록(진입 시): 실제 프로젝트면 같은 엔드포인트의 목록(query)을 룸
//   마운트 때 불러와 서버 트랙을 세션 상태에 병합한다
//   (mergeVoiceCommentaryTracks — 같은 id는 서명 URL이 새로 발급된
//   서버본 우선, 목록에 없는 세션 트랙은 보존). 로딩·실패는 패널의
//   loading/error 표면으로 알리고, 실패해도 세션 보관과 녹음은 유지된다.
const [voiceTracks, setVoiceTracks] = useState<readonly VoiceCommentaryTrack[]>([]);
const [voicePanelOpen, setVoicePanelOpen] = useState(false);
const [voicePinIds, setVoicePinIds] = useState<readonly string[]>([]);
const [voiceListState, setVoiceListState] = useState<"idle" | "loading" | "ready" | "error">("idle");

useEffect(() => {
  if (isDemo) return;
  const controller = new AbortController();
  setVoiceListState("loading");
  void (async () => {
    try {
      const { items } = await listProductionVoiceCommentaries(projectId, episodeId, controller.signal);
      if (controller.signal.aborted) return;
      setVoiceTracks((previous) => mergeVoiceCommentaryTracks(previous, items.map((item) => item.track)));
      setVoiceListState("ready");
    } catch {
      if (controller.signal.aborted) return;
      // 목록을 못 불러와도 이 탭의 세션 보관 트랙과 녹음은 그대로 동작한다.
      setVoiceListState("error");
    }
  })();
  return () => controller.abort();
}, [projectId, episodeId, isDemo]);
// 패널은 녹화 중 500ms 간격으로 captureView를 부른다. 콜백 정체성이 매
// 렌더마다 바뀌면 샘플링 타이머가 계속 리셋되므로, 최신 상태는 ref로 읽는다.
const voiceCaptureRef = useRef({ tab, comments, compareItems });
useEffect(() => {
  voiceCaptureRef.current = { tab, comments, compareItems };
}, [tab, comments, compareItems]);

const captureVoiceView = useCallback((): VoiceViewCapture | null => {
  const current = voiceCaptureRef.current;
  const panel = panelRef.current;
  const maxX = panel ? Math.max(1, panel.scrollWidth - panel.clientWidth) : 1;
  const maxY = panel ? Math.max(1, panel.scrollHeight - panel.clientHeight) : 1;
  const tx = panel ? Math.min(1, Math.max(0, panel.scrollLeft / maxX)) : 0;
  const ty = panel ? Math.min(1, Math.max(0, panel.scrollTop / maxY)) : 0;
  const doc = current.comments;
  if (current.tab === "compare") {
    return {
      view: {
        surface: "compare",
        poolItemId: current.compareItems[0]?.id ?? null,
        pageId: null,
        mode: null,
        scale: 1,
        tx,
        ty,
      },
      pinThreadIds: doc
        ? doc.threads.filter((thread) => thread.anchor.type === "compare-image" && !thread.resolved).map((thread) => thread.id)
        : [],
    };
  }
  return {
    view: { surface: "manuscript", poolItemId: null, pageId, mode: null, scale: 1, tx, ty },
    pinThreadIds: doc
      ? doc.threads
        .filter((thread) => thread.anchor.type === "point" && thread.anchor.pageId === pageId && !thread.resolved)
        .map((thread) => thread.id)
      : [],
  };
}, [pageId, panelRef]);

const applyVoiceView = useCallback((view: VoiceViewSnapshot, pinThreadIds: readonly string[]) => {
  setVoicePinIds(pinThreadIds);
  if (view.surface === "compare") {
    setTab("compare");
    return;
  }
  setTab("viewer");
  // 탭 전환 렌더 뒤에 스크롤을 적용한다. 프로그래매틱 스크롤로 표시해
  // 팔로우 일시정지(handlePanelScroll)가 걸리지 않게 한다.
  requestAnimationFrame(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const maxX = Math.max(0, panel.scrollWidth - panel.clientWidth);
    const maxY = Math.max(0, panel.scrollHeight - panel.clientHeight);
    // 호출자가 넘긴 ref 에 표시를 남기는 것이 이 훅의 계약이다(handlePanelScroll 이 읽는다).
    // eslint-disable-next-line react-compiler/react-compiler
    programmaticScrollRef.current = true;
    panel.scrollTo({ left: view.tx * maxX, top: view.ty * maxY });
  });
}, [setTab, panelRef, programmaticScrollRef]);

const handleSaveVoiceTrack = useCallback((track: VoiceCommentaryTrack, audioBlob: Blob | null) => {
  // 먼저 세션에 넣어 이 탭에서 바로 재생할 수 있게 하고, 실제 프로젝트면
  // 서버 저장을 이어 시도한다. 성공하면 서버가 재구성한 트랙(kind:"server"
  // 참조 + 서명 URL)으로 교체하고, 실패하면 blob 세션 보관이 폴백으로 남는다.
  setVoiceTracks((previous) => [...previous.filter((kept) => kept.id !== track.id), track]);
  setVoicePanelOpen(true);
  if (!audioBlob || isDemo) return;
  void (async () => {
    try {
      const { view } = await uploadProductionVoiceCommentary({
        projectId: projectId,
        episodeId,
        operationId: `episode-voice-commentary:${track.id}`,
        track,
        file: audioBlob,
      });
      setVoiceTracks((previous) => [...previous.filter((kept) => kept.id !== track.id), view.track]);
    } catch {
      // 서버 저장 실패(권한·용량·네트워크) — 세션 보관이 폴백으로 유지된다.
    }
  })();
}, [projectId, episodeId, isDemo]);

const handleOpenVoicePin = useCallback((threadId: string) => {
  setVoicePinIds([threadId]);
  const thread = voiceCaptureRef.current.comments?.threads.find((candidate) => candidate.id === threadId);
  // 핀 스레드 열기 동선은 기존 탭 구조를 재사용한다: 비교 핀이면 비교 탭,
  // 원고 핀이면 원고 뷰어 탭으로 이동하고, 해당 핀을 아래 요약에 고정한다.
  // (핀 브리지는 외부 선택 API가 없어 스레드 내부 선택까지는 강제하지 않는다.)
  setTab(thread?.anchor.type === "compare-image" ? "compare" : "viewer");
}, [setTab]);

  return {
    voiceTracks,
    voicePanelOpen,
    setVoicePanelOpen,
    voicePinIds,
    voiceListState,
    captureVoiceView,
    applyVoiceView,
    handleSaveVoiceTrack,
    handleOpenVoicePin,
  };
}
