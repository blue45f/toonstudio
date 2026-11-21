import { Crosshair, MessageSquareText, PenTool, Radio, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { StudioVirtualSpaceP2pBoard, type StudioVirtualSpaceP2pBoardProps } from "./StudioVirtualSpaceP2pBoard";
import type { StudioP2pBoardScope } from "./studio-virtual-space-p2p-board";
import { useStudioVirtualSpaceP2pBoard } from "./use-studio-virtual-space-p2p-board";

type AnnotationMode = "pen" | "note";

export interface StudioVirtualSpaceLiveAnnotationPanelProps extends StudioVirtualSpaceP2pBoardProps {
  /** 실시간 팀 P2P 직접 채널이 연결돼 있으면 실시간 P2P 보드 훅을 우선 사용한다. */
  readonly liveP2p?: {
    readonly participant: StudioLiveParticipant | undefined;
    readonly port: StudioLiveDirectPort | null | undefined;
    readonly scope: StudioP2pBoardScope;
    readonly storageOwnerId: string | null | undefined;
    readonly enabled: boolean;
  };
}

/**
 * 라이브 주석 패널.
 * - 실시간 P2P 채널이 열려 있으면 `useStudioVirtualSpaceP2pBoard`로 동료와 즉시 펜·메모를 주고받는다.
 * - 개인·오프라인 상태에서는 상위 Yjs/로컬 보드 props로 자연스럽게 폴백한다.
 */
export function StudioVirtualSpaceLiveAnnotationPanel({ liveP2p, ...fallbackProps }: StudioVirtualSpaceLiveAnnotationPanelProps) {
  const bt = useBilingual("StudioVirtualSpaceLiveAnnotationPanel");
  const [mode, setMode] = useState<AnnotationMode>("pen");
  const scopeWorldId = liveP2p?.scope.worldId ?? "local";
  const scopeBoardId = liveP2p?.scope.boardId ?? "live-annotation";
  const scopeContentRevision = liveP2p?.scope.contentRevision ?? "v1";
  const p2pScope = useMemo<StudioP2pBoardScope>(
    () => ({ worldId: scopeWorldId, boardId: scopeBoardId, contentRevision: scopeContentRevision }),
    [scopeWorldId, scopeBoardId, scopeContentRevision],
  );
  const p2p = useStudioVirtualSpaceP2pBoard({
    participant: liveP2p?.participant,
    port: liveP2p?.port,
    scope: p2pScope,
    storageOwnerId: liveP2p?.storageOwnerId,
    enabled: Boolean(liveP2p?.enabled && liveP2p.participant && liveP2p.port),
  });
  const useLiveP2p = Boolean(liveP2p?.enabled && p2p.snapshot.available);
  const boardProps: StudioVirtualSpaceP2pBoardProps = useLiveP2p
    ? {
        snapshot: p2p.snapshot,
        selfSessionId: liveP2p?.participant?.sessionId ?? fallbackProps.selfSessionId,
        authorNameOf: fallbackProps.authorNameOf,
        onStroke: p2p.addStroke,
        onNote: p2p.addNote,
        onRemove: p2p.remove,
        onClearOwn: p2p.clearOwn,
        localSaveFailed: p2p.localSaveFailed,
        onRetryLocalSave: p2p.retryLocalSave,
      }
    : fallbackProps;

  return <section className="studio-vspace-live-annotation" data-annotation-mode={mode} data-p2p-live={useLiveP2p || undefined} data-space-interactive="true">
    <header>
      <div><Crosshair size={17} aria-hidden /><h2>{bt("공유 화면 라이브 주석", "Live shared-screen annotation")}</h2></div>
      <p>{useLiveP2p
        ? bt("팀원 실시간 공유 보드에 연결되어 펜·메모가 바로 동기화됩니다.", "Connected to the live shared board — pen strokes and notes sync immediately.")
        : bt("현재 회의의 펜·메모는 참여 중인 팀원과 바로 공유합니다. 검수 기록으로 남겨야 할 의견은 고정 검수본에서 별도로 게시하세요.", "Share pen strokes and notes live during this meeting. Publish durable feedback separately against the pinned review snapshot.")}</p>
      {useLiveP2p ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
          <Radio size={13} aria-hidden />
          {bt(`실시간 공유 보드 연결됨 · 함께 보는 동료 ${p2p.snapshot.readyPeerIds.length}명`, `Live shared board connected · ${p2p.snapshot.readyPeerIds.length} teammates ready`)}
        </p>
      ) : null}
    </header>
    <div className="studio-vspace-annotation-modes" role="group" aria-label={bt("주석 모드", "Annotation mode")}>
      <button type="button" className="min-h-11" aria-pressed={mode === "pen"} onClick={() => setMode("pen")}><PenTool size={14} aria-hidden />{bt("펜", "Pen")}</button>
      <button type="button" className="min-h-11" aria-pressed={mode === "note"} onClick={() => setMode("note")}><MessageSquareText size={14} aria-hidden />{bt("메모", "Note")}</button>
    </div>
    <StudioVirtualSpaceP2pBoard {...boardProps} tool={mode} />
    <p className="studio-vspace-annotation-durable"><Save size={14} aria-hidden />{bt("영구 의견은 검수 패널에서 버전·컷·담당자·기한과 함께 저장됩니다.", "Durable comments are saved in Review with version, cut, assignee and due date.")}</p>
  </section>;
}
