import { X } from "lucide-react";
import { Suspense } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioVirtualSpaceActionSheet } from "../StudioVirtualSpaceActionSheet";
import { StudioVirtualSpaceAppEmbedPanel } from "../StudioVirtualSpaceAppEmbedPanel";
import { StudioVirtualSpaceDirectory } from "../StudioVirtualSpaceDirectory";
import { StudioVirtualSpaceNpcDialoguePanel, type StudioNpcDialogueAction } from "../StudioVirtualSpaceNpcDialoguePanel";
import { StudioWorldAuthoringEntry } from "../StudioWorldAuthoringEntry";
import type { StudioVirtualArtStyleKey } from "../studio-virtual-space-art-style";
import type { StudioEntryCodeRecord } from "../studio-virtual-space-entry-code";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualExperiencePreference } from "../studio-virtual-space-experience-preference";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { distanceBetween, TALK_DISTANCE } from "../studio-virtual-space-page-helpers";
import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import type { StudioSpatialInteractionPhase } from "../studio-virtual-space-interaction-state";
import { studioSpatialActions, type StudioSpatialActionId } from "../studio-virtual-space-spatial-actions";
import type { StudioTileEffectOf } from "../studio-virtual-space-tile-effects";
import { clearStudioWorldAuthoringDraft } from "../studio-virtual-space-world-authoring";
import type { StudioVirtualSpaceWorldManifest, StudioWorldInteractionDefinition, StudioWorldNpcDefinition } from "../studio-virtual-space-world-manifest";
import type { StudioVirtualStageKind } from "../office2d/studio-virtual-space-stage-mode";
import type { useVirtualSpaceYjsDoc } from "../crdt/studio-virtual-space-yjs-doc";
import type { useVirtualSpaceOverlays } from "../state/use-virtual-space-overlays";
import type { VirtualSpacePermissions } from "../state/use-virtual-space-permissions";
import type { useVirtualSpaceSocialAndMedia } from "../state/use-virtual-space-social-and-media";
import type { useStudioVirtualSpaceOperations } from "../use-studio-virtual-space-operations";
import type { useStudioWorldPublication } from "../world-publication/use-studio-world-publication";
import { SpaceChatPanel } from "./SpaceChatPanel";
import { SpaceCoworkSheet, type SpaceCoworkAction } from "./SpaceCoworkSheet";
import { SpaceMinimap } from "./SpaceMinimap";
import { SpacePopover } from "./SpacePopover";
import { SpaceProximityConsent } from "./SpaceProximityVideo";
import { SpaceShortcutsHelp } from "./SpaceShortcutsHelp";
import { SPACE_PROXIMITY_MEDIA_RADIUS } from "./space-proximity-media";
import { StudioVirtualSpaceInviteSheet, StudioVirtualSpaceStickyNotes, StudioVirtualSpaceWhiteboard } from "./space-lazy-panels";

export interface VirtualSpaceStagePopoversProps {
  readonly projectId: string;
  readonly personal: boolean;
  readonly touch: boolean;
  readonly worldReady: boolean;
  readonly authoringMode: boolean;
  readonly builtinKind: string | null;
  readonly stageKind: StudioVirtualStageKind;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly worldManifest: StudioVirtualSpaceWorldManifest;
  readonly roomById: ReadonlyMap<string, StudioVirtualSpaceWorldManifest["rooms"][number]>;
  readonly locationZoneRoomId: string | null;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly chatSnapshot: StudioVirtualSpaceSnapshot;
  readonly chatOpen: boolean;
  readonly setChatOpen: (open: boolean) => void;
  readonly chatTypingNames: readonly string[];
  readonly sendSpaceChat: (scope: "nearby" | "all", text: string) => void;
  readonly sendSpaceChatTyping: (scope: "nearby" | "all", typing: boolean) => void;
  readonly onChatInputChange: (typing: boolean) => void;
  readonly engineBridge: StudioVirtualSpaceEngineBridge;
  readonly overlays: ReturnType<typeof useVirtualSpaceOverlays>;
  readonly minimapPeople: readonly { readonly id: string; readonly name: string; readonly point: StudioVirtualSpacePoint }[];
  readonly highlightRoomIds: readonly string[];
  readonly queuePathTo: (point: StudioVirtualSpacePoint) => void;
  readonly quickTravelTo: (point: StudioVirtualSpacePoint) => void;
  readonly selectPlace: (placeId: string) => void;
  readonly activateAction: (action: StudioWorldInteractionDefinition["action"]) => void;
  readonly returnToStartPosition: () => void;
  readonly setSelectedPeerId: (id: string | null) => void;
  readonly setPanel: (panel: StudioVirtualWorkspacePanel | null) => void;
  readonly socialAndMedia: ReturnType<typeof useVirtualSpaceSocialAndMedia>;
  readonly socialDisabledReason: string | null;
  readonly inviteLink: string;
  readonly inviteRecord: StudioEntryCodeRecord;
  readonly spaceUrlBase: string;
  readonly soloBoardOpen: "whiteboard" | "stickies" | null;
  readonly setSoloBoardOpen: (next: "whiteboard" | "stickies" | null) => void;
  readonly yjsSpace: ReturnType<typeof useVirtualSpaceYjsDoc>;
  readonly selfListId: string;
  readonly localName: string;
  readonly permissions: VirtualSpacePermissions;
  readonly appOpenEffect: StudioTileEffectOf<"app"> | null;
  readonly closeAppEffect: () => void;
  readonly tileMedia: { readonly title: string; readonly embedUrl: string } | null;
  readonly setTileMedia: (next: null) => void;
  readonly pendingInteraction: StudioWorldInteractionDefinition | null;
  readonly interactionPhase: StudioSpatialInteractionPhase;
  readonly interactionActionId: StudioSpatialActionId | null;
  readonly spatialContext: { readonly personal: boolean; readonly nearbyPeerCount: number };
  readonly handleSpatialAction: (id: StudioSpatialActionId) => void;
  readonly executeSpatialAction: (id: StudioSpatialActionId) => void;
  readonly closePendingInteraction: () => void;
  readonly dialogueNpc: StudioWorldNpcDefinition | null;
  readonly operations: ReturnType<typeof useStudioVirtualSpaceOperations>;
  readonly experiencePreference: StudioVirtualExperiencePreference;
  readonly selectExperiencePreference: (next: StudioVirtualExperiencePreference) => void;
  readonly handleNpcDialogueAction: (action: StudioNpcDialogueAction) => void;
  readonly closeDialogue: () => void;
  readonly privateActorId: string | null;
  readonly publication: ReturnType<typeof useStudioWorldPublication>;
  readonly authoringDraft: StudioVirtualSpaceWorldManifest;
  readonly setAuthoringDraft: React.Dispatch<React.SetStateAction<StudioVirtualSpaceWorldManifest>>;
  readonly draftBaseRevision: string | null | undefined;
  readonly setDraftBaseRevision: (rev: string | null) => void;
  readonly baselineWorldManifestRef: React.RefObject<StudioVirtualSpaceWorldManifest>;
  readonly worldDraftLifetimeActive: () => boolean;
  readonly reloadTileEffects: () => void;
  readonly cloneBinding: Parameters<typeof StudioWorldAuthoringEntry>[0]["clone"];
}

export function VirtualSpaceStagePopovers(props: VirtualSpaceStagePopoversProps) {
  const bt = useBilingual("VirtualSpaceStagePopovers");
  const {
    projectId, personal, touch, worldReady, authoringMode, builtinKind, stageKind, artStyle,
    worldManifest, roomById, locationZoneRoomId, snapshot, chatSnapshot, chatOpen, setChatOpen,
    chatTypingNames, sendSpaceChat, sendSpaceChatTyping, onChatInputChange, engineBridge, overlays,
    minimapPeople, highlightRoomIds, queuePathTo, quickTravelTo, selectPlace, activateAction,
    returnToStartPosition, setSelectedPeerId, setPanel, socialAndMedia, socialDisabledReason,
    inviteLink, inviteRecord, spaceUrlBase, soloBoardOpen, setSoloBoardOpen, yjsSpace, selfListId,
    localName, permissions, appOpenEffect, closeAppEffect, tileMedia, setTileMedia,
    pendingInteraction, interactionPhase, interactionActionId, spatialContext, handleSpatialAction,
    executeSpatialAction, closePendingInteraction, dialogueNpc, operations, experiencePreference,
    selectExperiencePreference, handleNpcDialogueAction, closeDialogue, privateActorId, publication,
    authoringDraft, setAuthoringDraft, draftBaseRevision, setDraftBaseRevision,
    baselineWorldManifestRef, worldDraftLifetimeActive, reloadTileEffects, cloneBinding,
  } = props;

  return (
    <>
      {worldReady ? (
        <SpaceChatPanel
          messages={chatSnapshot.chatMessages}
          typingNames={chatTypingNames}
          open={chatOpen}
          onOpenChange={setChatOpen}
          onSend={sendSpaceChat}
          onTyping={(scope, typing) => { sendSpaceChatTyping(scope, typing); onChatInputChange(typing); }}
          onReturnFocus={() => engineBridge.focusWorld()}
        />
      ) : null}

      {worldReady ? (
        <SpacePopover
          open={overlays.mapOpen}
          sheet={touch}
          onClose={() => { overlays.setMapOpen(false); engineBridge.focusWorld(); }}
          title={builtinKind === "campus" ? bt("캠퍼스 전체 지도", "Campus map") : bt("전체 지도", "Full map")}
          toggleSelector='[data-space-toggle="map"]'
          className="space-popover--map"
          focusFirst={false}
        >
          <SpaceMinimap
            manifest={worldManifest}
            self={snapshot.self}
            people={minimapPeople}
            currentRoomId={locationZoneRoomId}
            variant="full"
            destination={overlays.moveDestination}
            highlightRoomIds={highlightRoomIds}
            onMoveTo={(pt) => { overlays.setMapOpen(false); queuePathTo(pt); }}
            onJumpTo={(pt) => { overlays.setMapOpen(false); quickTravelTo(pt); }}
            onJumpToPlace={(id) => { overlays.setMapOpen(false); selectPlace(id); }}
          />
        </SpacePopover>
      ) : null}

      <SpaceShortcutsHelp open={overlays.helpOpen} sheet={touch} onClose={() => overlays.setHelpOpen(false)} onReplayTour={overlays.replayMiniTour} />

      <SpacePopover
        open={overlays.searchOpen}
        sheet={touch}
        palette
        onClose={() => { overlays.setSearchOpen(false); engineBridge.focusWorld(); }}
        title={bt("방·팀원 찾기", "Find rooms & people")}
        className="space-palette--search"
        focusFirst={false}
      >
        {worldReady ? (
          <StudioVirtualSpaceDirectory
            manifest={worldManifest}
            peers={snapshot.peers}
            onApproachPeer={socialAndMedia.approachOfficePeer}
            approachingPeerId={socialAndMedia.officeApproach.approachingPeerId}
            approachDisabled={!socialAndMedia.officeApproachEnabled}
            inputRef={overlays.spaceSearchRef}
            expanded
            onMove={(pt) => { overlays.setSearchOpen(false); queuePathTo(pt); }}
            onOpen={(a) => { overlays.setSearchOpen(false); activateAction(a); }}
            onJump={(pt) => { overlays.setSearchOpen(false); quickTravelTo(pt); }}
            onJumpToPlace={(id) => { overlays.setSearchOpen(false); selectPlace(id); }}
            onRespawn={() => { overlays.setSearchOpen(false); returnToStartPosition(); }}
            onSelectPeer={(id) => { overlays.setSearchOpen(false); setSelectedPeerId(id); setPanel("people"); }}
          />
        ) : (
          <p role="status">{bt("공간 목록을 확인하는 중이에요.", "Checking space directory.")}</p>
        )}
      </SpacePopover>

      <SpacePopover open={overlays.inviteOpen} sheet={touch} palette onClose={() => { overlays.setInviteOpen(false); engineBridge.focusWorld(); }} title={bt("스페이스 초대", "Invite to space")}>
        <Suspense fallback={<p role="status">{bt("초대 시트를 불러오는 중…", "Loading invite sheet…")}</p>}>
          <StudioVirtualSpaceInviteSheet inviteLink={inviteLink} codeRecord={inviteRecord} spaceUrlBase={spaceUrlBase} />
        </Suspense>
      </SpacePopover>

      {soloBoardOpen ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-label={soloBoardOpen === "whiteboard" ? bt("공유 화이트보드", "Whiteboard") : bt("포스트잇 칸반", "Sticky notes")}
          data-space-interactive="true"
          className="fixed inset-x-4 bottom-24 top-20 z-40 mx-auto flex max-w-4xl flex-col overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-2xl"
        >
          <header className="mb-3 flex shrink-0 items-center justify-between gap-2 border-b border-line pb-2">
            <h2 className="text-sm font-semibold text-fg">
              {soloBoardOpen === "whiteboard" ? bt("공유 화이트보드", "Whiteboard") : bt("포스트잇 칸반", "Sticky notes")}
            </h2>
            <button
              type="button"
              onClick={() => { setSoloBoardOpen(null); engineBridge.focusWorld(); }}
              aria-label={bt("닫기", "Close")}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-card text-fg-2 hover:text-fg"
            >
              <X size={16} aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            <Suspense fallback={<p role="status">{bt("보드를 불러오는 중…", "Loading board…")}</p>}>
              {soloBoardOpen === "whiteboard" ? (
                <StudioVirtualSpaceWhiteboard
                  snapshot={yjsSpace.boardSnapshot}
                  selfSessionId={selfListId}
                  authorNameOf={() => localName}
                  onStroke={yjsSpace.addStroke}
                  onNote={yjsSpace.addBoardNote}
                  onRemove={yjsSpace.removeBoardEntity}
                  onClearOwn={yjsSpace.clearOwnBoardEntities}
                />
              ) : (
                <StudioVirtualSpaceStickyNotes
                  notes={yjsSpace.state.stickyNotes}
                  canEdit={permissions.canUseBoard}
                  onCreate={yjsSpace.createSticky}
                  onMove={yjsSpace.moveSticky}
                  onResize={yjsSpace.resizeSticky}
                  onEdit={yjsSpace.editSticky}
                  onToggleDone={yjsSpace.toggleStickyDone}
                  onRemove={yjsSpace.removeSticky}
                  onRecolor={yjsSpace.recolorSticky}
                />
              )}
            </Suspense>
          </div>
        </section>
      ) : null}

      <SpacePopover open={overlays.mediaConsentOpen} sheet={touch} onClose={() => { overlays.setMediaConsentOpen(false); engineBridge.focusWorld(); }} title={bt("가까이 가면 영상으로 대화하기", "Proximity voice & video")} className="space-popover--consent">
        <SpaceProximityConsent
          radiusTiles={Math.round(SPACE_PROXIMITY_MEDIA_RADIUS / 32)}
          unavailableReason={socialAndMedia.proximityAvailable ? null : bt("팀원 연결을 확인하는 중이에요.", "Checking teammate connection.")}
          onStart={(capture) => { overlays.setMediaConsentOpen(false); socialAndMedia.setUserMicMuted(!capture.mic); socialAndMedia.proximity.start(capture); engineBridge.focusWorld(); }}
          onCancel={() => { overlays.setMediaConsentOpen(false); engineBridge.focusWorld(); }}
        />
      </SpacePopover>

      <SpacePopover open={overlays.coworkOpen} sheet={touch} onClose={() => { overlays.setCoworkOpen(false); engineBridge.focusWorld(); }} title={bt("같이 작업하기", "Work together")} className="space-popover--cowork">
        <SpaceCoworkSheet
          stageKind={stageKind}
          artStyle={artStyle}
          peers={personal ? [] : snapshot.peers.map((peer) => ({
            id: peer.participant.sessionId,
            name: peer.participant.displayName,
            activity: peer.state.activity,
            userStatus: peer.state.userStatus ?? null,
            avatarIndex: peer.state.avatarIndex,
            appearance: peer.state.appearance,
            near: distanceBetween(peer.state, snapshot.self) <= TALK_DISTANCE,
          }))}
          targetId={overlays.coworkTargetId}
          disabledReason={socialDisabledReason}
          links={personal ? [] : [
            { id: "board", href: `/studio/p/${encodeURIComponent(projectId)}/production`, labelKo: "회차 보드", labelEn: "Episode board" },
            { id: "review", href: `/studio/p/${encodeURIComponent(projectId)}/review?view=inbox`, labelKo: "원고 검토", labelEn: "Page review" },
          ]}
          onSelectTarget={overlays.setCoworkTargetId}
          onRequest={(id: string, action: SpaceCoworkAction) => { overlays.setCoworkOpen(false); setSelectedPeerId(id); if (action === "review") setPanel("people"); socialAndMedia.requestActivity(id, action); }}
          onApproach={(id) => { overlays.setCoworkOpen(false); socialAndMedia.approachOfficePeer(id); }}
          onOpenTeam={() => { overlays.setCoworkOpen(false); setPanel(personal ? "people" : "team"); }}
        />
      </SpacePopover>

      {overlays.theaterOpen && socialAndMedia.theaterFeed.stream ? (
        <div role="dialog" aria-label={bt("라이브 시어터 화면", "Live theater screen")} data-testid="space-theater-modal" className="fixed inset-6 z-50 flex flex-col rounded-2xl border border-line bg-panel p-4 shadow-2xl">
          <header className="mb-2 flex items-center justify-between">
            <strong className="text-sm font-semibold">{socialAndMedia.theaterFeed.label ?? bt("라이브 공유 화면", "Live shared screen")}</strong>
            <button type="button" onClick={() => overlays.setTheaterOpen(false)} aria-label={bt("닫기", "Close")} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-card">
              <X size={16} aria-hidden />
            </button>
          </header>
          <video autoPlay playsInline muted className="min-h-0 flex-1 rounded-xl bg-black object-contain" ref={(el) => { if (el) el.srcObject = socialAndMedia.theaterFeed.stream; }} />
        </div>
      ) : null}

      {appOpenEffect ? (
        <SpacePopover open sheet={touch} onClose={() => { closeAppEffect(); engineBridge.focusWorld(); }} title={appOpenEffect.title ?? bt("인월드 앱", "In-world app")} className="space-popover--app-embed">
          <StudioVirtualSpaceAppEmbedPanel effect={appOpenEffect} worldId={worldManifest.id} onClose={() => { closeAppEffect(); engineBridge.focusWorld(); }} />
        </SpacePopover>
      ) : null}

      {tileMedia ? (
        <SpacePopover open sheet={touch} onClose={() => { setTileMedia(null); engineBridge.focusWorld(); }} title={tileMedia.title} className="space-popover--tile-media">
          <iframe src={tileMedia.embedUrl} title={tileMedia.title} loading="lazy" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ width: "100%", aspectRatio: "16 / 9", border: 0 }} />
        </SpacePopover>
      ) : null}

      {pendingInteraction ? (
        <StudioVirtualSpaceActionSheet
          interaction={pendingInteraction}
          room={roomById.get(pendingInteraction.zoneId)}
          actions={studioSpatialActions(pendingInteraction, roomById.get(pendingInteraction.zoneId), spatialContext)}
          phase={interactionPhase}
          selectedActionId={interactionActionId}
          onChoose={handleSpatialAction}
          onConfirm={() => { if (interactionActionId && interactionPhase === "confirming") executeSpatialAction(interactionActionId); }}
          onClose={closePendingInteraction}
          modal={touch}
        />
      ) : null}

      {dialogueNpc ? (
        <StudioVirtualSpaceNpcDialoguePanel
          npc={dialogueNpc}
          stageKind={stageKind}
          room={roomById.get(dialogueNpc.roomId)}
          operations={operations.snapshot}
          peers={snapshot.peers}
          artStyle={artStyle}
          dialogueScale={experiencePreference.dialogueScale}
          ttsEnabled={experiencePreference.ttsEnabled}
          onDialogueScale={(dialogueScale) => selectExperiencePreference({ ...experiencePreference, dialogueScale })}
          onAction={handleNpcDialogueAction}
          onClose={closeDialogue}
          modal={touch}
          personal={personal}
          roomInteractions={worldManifest.interactions.filter((item) => item.zoneId === dialogueNpc.roomId).map((item) => ({ labelKo: item.labelKo, labelEn: item.labelEn }))}
        />
      ) : null}

      {authoringMode && worldReady ? (
        <div className="space-hud__authoring">
          <Suspense fallback={<p role="status">{bt("공간 편집기 불러오는 중…", "Loading world editor…")}</p>}>
            <StudioWorldAuthoringEntry
              key={JSON.stringify([privateActorId, projectId])}
              projectId={projectId}
              basePublishedRevisionId={draftBaseRevision}
              disabled={publication.enabled && (["reading", "publishing", "preparing"].includes(publication.snapshot.phase) || !publication.snapshot.viewVerified)}
              manifest={authoringDraft}
              clone={cloneBinding}
              onChange={setAuthoringDraft}
              onReset={async () => {
                const cleared = await clearStudioWorldAuthoringDraft(projectId);
                if (cleared && worldDraftLifetimeActive()) {
                  reloadTileEffects();
                  setAuthoringDraft(baselineWorldManifestRef.current);
                  setDraftBaseRevision(publication.snapshot.active?.publication.revisionId ?? null);
                }
              }}
            />
          </Suspense>
        </div>
      ) : null}
    </>
  );
}
