import {
  Armchair,
  BookOpen,
  Brush,
  CircleHelp,
  ClipboardList,
  CloudUpload,
  Images,
  LifeBuoy,
  MessageCircle,
  Mic,
  PenTool,
  Presentation,
  Radio,
  StickyNote,
  UserPlus,
} from "lucide-react";
import { Suspense, lazy, useState, type ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import type { StudioLiveCollaborationContextValue } from "../../live/studio-live-collaboration-context";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import { STUDIO_VIRTUAL_ART_STYLES, studioVirtualArtStyleScopeNote, type StudioVirtualArtStyleKey } from "../studio-virtual-space-art-style";
import { STUDIO_VIRTUAL_CAMPUS_COMMONS_ID } from "../studio-virtual-space-campus-world";
import { StudioVirtualExperienceArtPreview } from "../StudioVirtualExperienceArtPreview";
import { StudioVirtualSpaceGuide } from "../StudioVirtualSpaceGuide";
import { StudioVirtualSpaceLightingPanel } from "../StudioVirtualSpaceLightingPanel";
import { StudioVirtualSpaceMegaphonePanel } from "../StudioVirtualSpaceMegaphonePanel";
import { StudioVirtualSpacePanelGate } from "../StudioVirtualSpacePanelGate";
import { StudioVirtualSpaceUserList } from "../StudioVirtualSpaceUserList";
import { StudioVirtualThemeCharacterPicker } from "../StudioVirtualThemeCharacterPicker";
import { StudioSpacePollPanel } from "../StudioSpacePollPanel";
import { StudioVirtualAvatarPersistenceNotice } from "../studio-virtual-avatar-persistence";
import { studioPrivateRoomWalkTarget } from "../private-room/studio-private-room-walk";
import { createStudioWorldStarterTemplate } from "../studio-world-template-package";
import type { StudioVirtualWorkspacePanel } from "../studio-virtual-space-panel-scope";
import type { StudioVirtualSpacePoint, StudioVirtualSpaceZoneId } from "../studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import type { StudioVirtualStageKind } from "../office2d/studio-virtual-space-stage-mode";
import type { StudioVirtualSpaceWorldManifest, StudioWorldInteractionDefinition } from "../studio-virtual-space-world-manifest";
import { writeStudioWorldAuthoringDraft } from "../studio-virtual-space-world-authoring";
import { SpaceAtmosphereSettings, type SpaceAtmosphere } from "./SpaceAtmosphereSettings";
import { SpaceAvatar } from "./SpaceAvatar";
import { SpaceAvatarDetailSection } from "./SpaceAvatarDetailSection";
import { SpaceSelfCard } from "./SpaceSelfCard";
import { distanceBetween, TALK_DISTANCE } from "../studio-virtual-space-page-helpers";
import {
  StudioPrivateRoomPanel,
  StudioVirtualSpaceConversationPanel,
  StudioVirtualSpaceEnvironmentPanel,
  StudioVirtualSpaceExperiencePanel,
  StudioVirtualSpaceGalleryViewer,
  StudioVirtualSpaceInviteSheet,
  StudioVirtualSpaceLiveAnnotationPanel,
  StudioVirtualSpaceNpcPanel,
  StudioVirtualSpacePlaceGallery,
  StudioVirtualSpaceRecordingBoothPanel,
  StudioVirtualSpaceReviewPicker,
  StudioVirtualSpaceRoomCatalog,
  StudioVirtualSpaceRtcPanel,
  StudioVirtualSpaceSeatsPanel,
  StudioVirtualSpaceSocialPanel,
  StudioVirtualSpaceSpaceBookingPanel,
  StudioVirtualSpaceStickyNotes,
  StudioVirtualSpaceTeamHub,
  StudioVirtualSpaceTodayBoard,
  StudioVirtualSpaceTownProgramPanel,
  StudioVirtualSpaceWhiteboard,
  StudioWorkspaceInbox,
  StudioWorldPublicationPanel,
  WorkSessionWorkspace,
} from "./space-lazy-panels";
import { VirtualThreeThemePanel } from "../three/ui/VirtualThreeThemePanel";
import type { useVirtualSpaceYjsDoc } from "../crdt/studio-virtual-space-yjs-doc";
import type { VirtualSpacePermissions } from "../state/use-virtual-space-permissions";
import type { useVirtualSpaceSocialAndMedia } from "../state/use-virtual-space-social-and-media";
import type { StudioEntryCodeRecord } from "../studio-virtual-space-entry-code";
import type { useStudioSpaceLighting } from "../use-studio-space-lighting";
import type { useStudioVirtualSpaceOperations } from "../use-studio-virtual-space-operations";
import type { useSpacePreferences } from "./use-space-preferences";
import type { useStudioWorldPublication } from "../world-publication/use-studio-world-publication";
import type { useStudioVirtualAvatarPersistence } from "../use-studio-virtual-avatar-persistence";
import type { StudioVirtualRuntimeMetrics } from "../studio-virtual-space-observability";
import type { StudioVirtualNpcGuideTourState } from "../studio-virtual-space-npc-guide";
import type { StudioSpaceBooking, StudioSpaceWaitlistEntry, StudioVirtualSpace as StudioBookableSpace } from "../studio-virtual-space-space-booking";
import type { StudioRecordingBoothConfig } from "../studio-virtual-space-recording-booth";
import type { StudioGalleryFrame, StudioGalleryStats } from "../studio-virtual-space-gallery";

const LazyVirtualThreeAvatarPicker = lazy(() =>
  import("../three/ui/VirtualThreeAvatarPicker").then((module) => ({ default: module.VirtualThreeAvatarPicker })),
);

export interface VirtualSpaceSidePanelContentProps {
  readonly panel: StudioVirtualWorkspacePanel | null;
  readonly personal: boolean;
  readonly signedIn: boolean;
  readonly isGuest: boolean;
  readonly projectId: string;
  readonly productionProjectId: string | null;
  readonly activeWorldScope: string;
  readonly stageKind: StudioVirtualStageKind;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly worldReady: boolean;
  readonly authoringMode: boolean;
  readonly builtinKind: string | null;
  readonly builtinPlaceWorld: boolean;
  readonly selectedPlaceId: string;
  readonly locationZone: { readonly roomId: string | null; readonly labelKo: string; readonly labelEn: string };
  readonly worldManifest: StudioVirtualSpaceWorldManifest;
  readonly authoringDraft: StudioVirtualSpaceWorldManifest;
  readonly setAuthoringDraft: React.Dispatch<React.SetStateAction<StudioVirtualSpaceWorldManifest>>;
  readonly draftBaseRevision: string | null | undefined;
  readonly setDraftBaseRevision: (rev: string | null) => void;
  readonly worldDraftLifetimeActive: () => boolean;
  readonly publication: ReturnType<typeof useStudioWorldPublication>;
  readonly live: StudioLiveCollaborationContextValue;
  readonly connectivityServerAvailable: boolean;
  readonly connectivityLocalOnly: boolean;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly fallbackIdentity: string;
  readonly privateActorId: string | null;
  readonly currentSessionReady: boolean;
  readonly localName: string;
  readonly avatarIndex: number;
  readonly selectAvatar: (index: number) => void;
  readonly avatarSaveStatus: ReturnType<typeof useStudioVirtualAvatarPersistence>["status"];
  readonly retryAvatarChoice: () => void;
  readonly spaceRoleLabel: { readonly ko: string | null; readonly en: string | null };
  readonly userListUsers: Parameters<typeof StudioVirtualSpaceUserList>[0]["users"];
  readonly userListZones: Parameters<typeof StudioVirtualSpaceUserList>[0]["zones"];
  readonly selfListId: string;
  readonly selectedPeerId: string | null;
  readonly setSelectedPeerId: (id: string | null) => void;
  readonly permissions: VirtualSpacePermissions;
  readonly socialAndMedia: ReturnType<typeof useVirtualSpaceSocialAndMedia>;
  readonly yjsSpace: ReturnType<typeof useVirtualSpaceYjsDoc>;
  readonly lighting: ReturnType<typeof useStudioSpaceLighting>;
  readonly operations: ReturnType<typeof useStudioVirtualSpaceOperations>;
  readonly preferences: ReturnType<typeof useSpacePreferences>;
  readonly atmosphere: SpaceAtmosphere;
  readonly changeAtmosphere: (next: SpaceAtmosphere) => void;
  readonly runtimeMetrics: StudioVirtualRuntimeMetrics;
  readonly captureVirtualPhoto: () => void;
  readonly returnToStartPosition: () => void;
  readonly preferredSlotId: string | null;
  readonly preferDesk: (id: string) => void;
  readonly engineBridge: StudioVirtualSpaceEngineBridge;
  readonly queuePathTo: (point: StudioVirtualSpacePoint) => void;
  readonly selectPlace: (placeId: string) => void;
  readonly startGuideToPlace: (placeId: string) => void;
  readonly moveToRoomOrPlace: (roomId: StudioVirtualSpaceZoneId, point?: StudioVirtualSpacePoint) => void;
  readonly walkToPersonalDesk: () => void;
  readonly activateAction: (action: StudioWorldInteractionDefinition["action"]) => void;
  readonly requestInteraction: (interaction: StudioWorldInteractionDefinition) => void;
  readonly guideTour: StudioVirtualNpcGuideTourState | null;
  readonly guideTourRequested: boolean;
  readonly startGuideTour: (guideId: string) => void;
  readonly cancelGuideTour: () => void;
  readonly replayMiniTour: () => void;
  readonly boothSpaces: readonly StudioBookableSpace[];
  readonly boothConfig: StudioRecordingBoothConfig;
  readonly boothBookings: readonly StudioSpaceBooking[];
  readonly setBoothBookings: React.Dispatch<React.SetStateAction<readonly StudioSpaceBooking[]>>;
  readonly boothWaitlist: readonly StudioSpaceWaitlistEntry[];
  readonly setBoothWaitlist: React.Dispatch<React.SetStateAction<readonly StudioSpaceWaitlistEntry[]>>;
  readonly galleryFrames: readonly StudioGalleryFrame[];
  readonly galleryStats: StudioGalleryStats;
  readonly setGalleryStats: React.Dispatch<React.SetStateAction<StudioGalleryStats>>;
  readonly requestSaveLogin: () => void;
  readonly handleBoothProjectAsset: Parameters<typeof StudioVirtualSpaceRecordingBoothPanel>[0]["onProjectAsset"];
  readonly inviteRecord: StudioEntryCodeRecord;
  readonly inviteLink: string;
  readonly spaceUrlBase: string;
  readonly initialSessionId: string | null;
  readonly setPanel: (panel: StudioVirtualWorkspacePanel | null) => void;
  readonly setHelpOpen: (open: boolean) => void;
  readonly openWorldEditor: () => void;
  readonly closeWorldEditor: () => void;
  readonly notify: (msg: string, tone?: "info" | "success" | "warn" | "error") => void;
}

/**
 * 우측 사이드 패널 콘텐츠 렌더러(StudioVirtualSpacePage 2,089줄 모놀리스 분해).
 * 오펀이었던 Whiteboard·StickyNotes·InviteSheet를 정식 승격하고, 3D 모드에서도 조명·분위기·경험 설정을 완전 제공한다.
 */
export function VirtualSpaceSidePanelContent(props: VirtualSpaceSidePanelContentProps): ReactNode {
  const bt = useBilingual("VirtualSpaceSidePanelContent");
  const [boardTab, setBoardTab] = useState<"whiteboard" | "stickies">("whiteboard");
  const {
    panel, personal, signedIn, isGuest, projectId, productionProjectId, activeWorldScope,
    stageKind, artStyle, worldReady, authoringMode, builtinKind, builtinPlaceWorld,
    selectedPlaceId, locationZone, worldManifest, authoringDraft, setAuthoringDraft,
    draftBaseRevision, setDraftBaseRevision, worldDraftLifetimeActive, publication, live,
    connectivityServerAvailable, connectivityLocalOnly, snapshot, fallbackIdentity,
    privateActorId, currentSessionReady, localName, avatarIndex, selectAvatar,
    avatarSaveStatus, retryAvatarChoice, spaceRoleLabel, userListUsers, userListZones,
    selfListId, selectedPeerId, setSelectedPeerId, permissions, socialAndMedia, yjsSpace,
    lighting, operations, preferences, atmosphere, changeAtmosphere, runtimeMetrics,
    captureVirtualPhoto, returnToStartPosition, preferredSlotId, preferDesk, engineBridge,
    queuePathTo, selectPlace, startGuideToPlace, moveToRoomOrPlace, walkToPersonalDesk,
    activateAction, requestInteraction, guideTour, guideTourRequested, startGuideTour,
    cancelGuideTour, replayMiniTour, boothSpaces, boothConfig, boothBookings, setBoothBookings,
    boothWaitlist, setBoothWaitlist, galleryFrames, galleryStats, setGalleryStats,
    requestSaveLogin, handleBoothProjectAsset, inviteRecord, inviteLink, spaceUrlBase,
    initialSessionId, setPanel, setHelpOpen, openWorldEditor, closeWorldEditor, notify,
  } = props;

  const conversationMemberIds = socialAndMedia.activeConversation?.memberIds ?? socialAndMedia.pairConversation?.memberIds ?? [];
  const authorNameOf = (sessionId: string): string =>
    sessionId === selfListId
      ? localName
      : snapshot.peers.find((peer) => peer.participant.sessionId === sessionId)?.participant.displayName ?? bt("팀원", "Teammate");

  switch (panel) {
    case "people":
      return (
        <>
          <SpaceSelfCard
            stageKind={stageKind}
            artStyle={artStyle}
            identity={fallbackIdentity}
            name={localName}
            self={snapshot.self}
            zoneLabelKo={locationZone.labelKo}
            zoneLabelEn={locationZone.labelEn}
            onEditCharacter={() => setPanel("build")}
            roleLabelKo={spaceRoleLabel.ko}
            roleLabelEn={spaceRoleLabel.en}
          />
          {personal ? (
            <p className="space-panel-note">
              {bt("개인 스튜디오에는 나만 있어요. 팀 프로젝트 공간으로 이동하면 동료들과 함께 협업할 수 있어요.", "Only you are in your personal studio. Open a team project space to collaborate live.")}
            </p>
          ) : (
            <>
              <p className="space-panel-count" aria-live="polite">
                {(connectivityServerAvailable || snapshot.direct)
                  ? bt(`접속 중 ${snapshot.peers.length + 1}명 · NPC 제외`, `${snapshot.peers.length + 1} online · NPCs excluded`)
                  : bt("서버 연결 없음 · 로컬 작업", "Server unavailable · local work")}
              </p>
              <StudioVirtualSpaceUserList users={userListUsers} zones={userListZones} selfId={selfListId} onActivate={setSelectedPeerId} />
              <StudioVirtualSpacePanelGate active>
                <StudioVirtualSpaceSocialPanel
                  manifest={worldManifest}
                  renderPeerAvatar={(peer) => <SpaceAvatar identity={peer.participant.sessionId} activity={peer.state.activity} avatarIndex={peer.state.avatarIndex} appearance={peer.state.appearance} />}
                  selectedPeer={snapshot.peers.find((peer) => peer.participant.sessionId === selectedPeerId) ?? null}
                  peers={snapshot.peers}
                  social={socialAndMedia.socialSnapshot}
                  nearbyPeerIds={snapshot.peers.filter((peer) => distanceBetween(peer.state, snapshot.self) <= TALK_DISTANCE).map((peer) => peer.participant.sessionId)}
                  onApproachPeer={socialAndMedia.approachOfficePeer}
                  approachingPeerId={socialAndMedia.officeApproach.approachingPeerId}
                  approachDisabled={!socialAndMedia.officeApproachEnabled}
                  conversationPeerIds={conversationMemberIds}
                  disabled={!permissions.canVoice || !snapshot.direct || authoringMode || !socialAndMedia.socialInteractive}
                  focused={socialAndMedia.socialFocused}
                  onSelect={setSelectedPeerId}
                  onWave={() => { if (selectedPeerId) socialAndMedia.waveTo(selectedPeerId); }}
                  onRequest={socialAndMedia.requestActivity}
                  onRespond={socialAndMedia.respondToRequest}
                  onCancel={socialAndMedia.cancelSocialRequest}
                  onBlock={(id, blocked) => {
                    if (blocked) {
                      for (const record of socialAndMedia.conversation.snapshot.records) {
                        if (record.memberIds.includes(id)) socialAndMedia.conversation.leave(record.id);
                      }
                      if (socialAndMedia.sharedActivityRef.current?.peer.sessionId === id) socialAndMedia.finishSharedActivity();
                      if (socialAndMedia.reviewPeerId === id) socialAndMedia.setReviewPeerId(null);
                    }
                    socialAndMedia.setPeerBlocked(id, blocked);
                  }}
                />
                {socialAndMedia.reviewPeerId ? (
                  <StudioVirtualSpaceReviewPicker
                    key={socialAndMedia.reviewPeerId}
                    workId={projectId}
                    peerName={authorNameOf(socialAndMedia.reviewPeerId)}
                    disabled={!socialAndMedia.socialInteractive || !socialAndMedia.socialSnapshot.reviewReadyPeerIds.includes(socialAndMedia.reviewPeerId)}
                    onInvite={async (subject, signal) => Boolean(await socialAndMedia.requestReview(socialAndMedia.reviewPeerId!, subject, signal))}
                    onClose={() => socialAndMedia.setReviewPeerId(null)}
                  />
                ) : null}
              </StudioVirtualSpacePanelGate>
              {socialAndMedia.sharedActivity?.action === "review" ? (
                <section className="vs2-panel studio-vspace-shared-review">
                  <h2>{bt("함께 검토하기", "Review together")}</h2>
                  <p>{bt(`${socialAndMedia.sharedActivity.peer.displayName} 님과 같은 검수 버전을 함께 봐요.`, `Review the invited snapshot with ${socialAndMedia.sharedActivity.peer.displayName}.`)}</p>
                  <button type="button" onClick={() => { const r = worldManifest.interactions.find((item) => item.action === "review"); if (r) queuePathTo(r.point); }}>
                    {bt("리뷰 데스크로 이동", "Walk to review desk")}
                  </button>
                  <button type="button" disabled={socialAndMedia.openingReview || !socialAndMedia.sharedActivity.reviewSubject} onClick={() => { void socialAndMedia.openSharedReview(); }}>
                    {socialAndMedia.openingReview ? bt("권한 확인 중…", "Verifying access…") : bt("초대한 검수본 열기", "Open invited snapshot")}
                  </button>
                </section>
              ) : null}
              <StudioVirtualSpacePanelGate active>
                <StudioVirtualSpaceInviteSheet inviteLink={inviteLink} codeRecord={inviteRecord} spaceUrlBase={spaceUrlBase} />
              </StudioVirtualSpacePanelGate>
              <button type="button" className="space-link-row" onClick={() => setPanel("team")}>
                <UserPlus size={17} aria-hidden />
                {bt("팀·그룹·초대 관리", "Teams, groups & invites")}
              </button>
            </>
          )}
          {worldReady ? (
            <StudioVirtualSpacePanelGate active>
              <StudioVirtualSpaceNpcPanel manifest={worldManifest} onInteract={requestInteraction} />
            </StudioVirtualSpacePanelGate>
          ) : null}
        </>
      );

    case "chat":
      return personal ? (
        <div className="space-empty">
          <MessageCircle size={22} aria-hidden />
          <p>{bt("대화와 통화는 팀 프로젝트 공간에서 쓸 수 있어요.", "Chat and calls are available in team project spaces.")}</p>
          <Link href="/studio/new" className="space-pill-button">{bt("팀 작품 만들기", "Create a team work")}</Link>
        </div>
      ) : (
        <>
          <p className="space-panel-note">
            {bt("근처 팀원과 소그룹 대화를 제안하거나 P2P 음성·화이트보드·스티키 보드를 함께 쓰세요.", "Start nearby voice huddles, shared whiteboard, or sticky notes with teammates.")}
          </p>
          {permissions.canVoice && snapshot.peers.length > 0 ? (
            <StudioVirtualSpacePanelGate active>
              <StudioVirtualSpaceConversationPanel
                self={live.room?.participant}
                snapshot={socialAndMedia.conversation.snapshot}
                currentConversation={socialAndMedia.pairConversation}
                onPropose={socialAndMedia.conversation.propose}
                onRespond={socialAndMedia.conversation.respond}
                onSetLocked={socialAndMedia.conversation.setLocked}
                onLeave={(id) => {
                  if (socialAndMedia.sharedActivityRef.current?.id === id) socialAndMedia.finishSharedActivity();
                  else socialAndMedia.conversation.leave(id);
                }}
              />
            </StudioVirtualSpacePanelGate>
          ) : (
            <p className="space-panel-note">{bt("근처에 팀원이 오면 소그룹 대화를 제안할 수 있어요.", "When teammates come near, you can propose a group chat.")}</p>
          )}
          <div className="space-link-grid">
            <button type="button" className="space-link-row" onClick={() => setPanel("board")}>
              <PenTool size={17} aria-hidden />
              {bt("공유 화이트보드 · 스티키", "Whiteboard & stickies")}
            </button>
            <button type="button" className="space-link-row" onClick={() => setPanel("annotation")}>
              <Presentation size={17} aria-hidden />
              {bt("라이브 화면 주석", "Live annotation")}
            </button>
          </div>
        </>
      );

    case "today":
      return (
        <StudioVirtualSpacePanelGate active>
          <StudioVirtualSpaceTodayBoard
            snapshot={operations.snapshot}
            workId={projectId}
            onRefresh={operations.refresh}
            onGuide={(destination) => moveToRoomOrPlace(destination === "story" ? "writers" : destination)}
            deadlines={yjsSpace.state.deadlines}
            bulletins={yjsSpace.state.bulletins}
            canEditBoard={permissions.canUseBoard}
            onUpsertDeadline={yjsSpace.upsertDeadline}
            onAddBulletin={yjsSpace.addBulletin}
          />
          <div className="space-link-grid">
            <button type="button" className="space-link-row" onClick={() => setPanel("work")}><ClipboardList size={17} aria-hidden />{bt("검수·작업함", "Reviews & inbox")}</button>
            <button type="button" className="space-link-row" onClick={() => setPanel("sessions")}><BookOpen size={17} aria-hidden />{bt("공동 작업 세션", "Work sessions")}</button>
          </div>
        </StudioVirtualSpacePanelGate>
      );

    case "places":
      return (
        <StudioVirtualSpacePanelGate active>
          {builtinPlaceWorld ? (
            <StudioVirtualSpacePlaceGallery
              personal={personal}
              currentPlaceId={builtinKind === "campus" ? locationZone.roomId ?? selectedPlaceId : selectedPlaceId}
              onSelectPlace={selectPlace}
              onOpen={activateAction}
              onGuidePlace={startGuideToPlace}
            />
          ) : (
            <p className="space-panel-note">{bt("게시된 커스텀 월드의 방과 포털을 사용합니다.", "Using the published custom world's rooms and portals.")}</p>
          )}
          {worldReady && builtinKind !== "campus" ? (
            <section className="space-panel-section" aria-label={bt("구역 바로가기", "Zone shortcuts")}>
              <h3>{bt("이 월드의 구역", "Zones in this world")}</h3>
              <ul className="space-zone-list workspace-live-room-links">
                {worldManifest.rooms.filter((room) => room.id !== STUDIO_VIRTUAL_CAMPUS_COMMONS_ID).map((room) => (
                  <li key={room.id}>
                    <span>{bt(room.labelKo, room.labelEn)}</span>
                    <button type="button" className="space-pill-button" onClick={() => { setPanel(null); queuePathTo(worldManifest.spawns.find((spawn) => spawn.id === room.id)?.point ?? { x: room.x + room.width / 2, y: room.y + room.height / 2 }); }}>
                      {bt("걸어가기", "Walk")}
                    </button>
                    {room.action ? (
                      <button type="button" className="space-pill-button" onClick={() => { if (room.action) activateAction(room.action); }}>
                        {bt("열기 ↗", "Open ↗")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <button type="button" className="space-link-row" onClick={() => setPanel("seats")}><Armchair size={17} aria-hidden />{personal ? bt("내 작업 자리", "My desk") : bt("작업 자리 고르기", "Choose a desk")}</button>
          <button type="button" className="space-link-row" onClick={() => setPanel("town")}><Presentation size={17} aria-hidden />{bt("제작 공간·프로그램", "Production spaces & program")}</button>
          <button type="button" className="space-link-row" onClick={() => setPanel("booth")}><Mic size={17} aria-hidden />{bt("녹음부스", "Recording booth")}</button>
          <button type="button" className="space-link-row" onClick={() => setPanel("gallery")}><Images size={17} aria-hidden />{bt("전시관", "Exhibition hall")}</button>
          {worldReady ? (
            <StudioVirtualSpaceGuide
              manifest={worldManifest}
              onMove={queuePathTo}
              onOpen={activateAction}
              onStop={() => engineBridge.clearMovement()}
              onFocus={() => changeAtmosphere("focus")}
              guideTour={guideTour}
              tourRequested={guideTourRequested}
              onStartTour={socialAndMedia.socialFocused || authoringMode ? undefined : startGuideTour}
              onCancelTour={cancelGuideTour}
              onReplayMiniTour={replayMiniTour}
            />
          ) : null}
          <StudioVirtualSpaceRoomCatalog
            projectAvailable={!personal}
            onPanel={setPanel}
            onZone={moveToRoomOrPlace}
            onTemplate={(template) => {
              try { setAuthoringDraft((current) => createStudioWorldStarterTemplate(template, current)); } catch { /* handled by panel */ }
              openWorldEditor();
            }}
          />
          {!personal ? (
            <StudioPrivateRoomPanel
              key={`${privateActorId}:${projectId}:${activeWorldScope}:${socialAndMedia.privateZoneId}`}
              room={socialAndMedia.privateRoom}
              zones={socialAndMedia.privateZones}
              zoneId={socialAndMedia.privateZoneId}
              onZone={socialAndMedia.setPrivateZoneSelection}
              peers={snapshot.peers}
              onWalk={worldReady && !authoringMode && !socialAndMedia.socialFocused ? () => {
                const target = socialAndMedia.privateZoneId ? studioPrivateRoomWalkTarget(worldManifest, socialAndMedia.privateZoneId, snapshot.self) : null;
                if (!target) return false;
                queuePathTo(target);
                return true;
              } : undefined}
              labels={Object.fromEntries(socialAndMedia.privateZones.map((item) => {
                const room = worldManifest.rooms.find((candidate) => candidate.id === item.roomId);
                return [item.id, room ? bt(room.labelKo, room.labelEn) : bt("비공개 방", "Private room")];
              }))}
            />
          ) : null}
        </StudioVirtualSpacePanelGate>
      );

    case "build":
      return (
        <StudioVirtualSpacePanelGate active>
          <StudioVirtualAvatarPersistenceNotice status={avatarSaveStatus} onRetry={retryAvatarChoice} personal={personal} />
          {stageKind === "three" ? (
            <>
              <VirtualThreeThemePanel />
              <Suspense fallback={<p role="status">{bt("3D 아바타 목록을 불러오는 중…", "Loading 3D avatars…")}</p>}>
                <LazyVirtualThreeAvatarPicker avatarIndex={avatarIndex} onSelect={selectAvatar} />
              </Suspense>
            </>
          ) : (
            <section className="space-panel-section" aria-label={bt("내 캐릭터", "My character")}>
              <StudioVirtualThemeCharacterPicker mode="all" includeAuto stageKind={stageKind} identity={fallbackIdentity} artStyle={artStyle} spaceTheme={preferences.spaceTheme} avatarIndex={avatarIndex} onSelect={selectAvatar} />
            </section>
          )}
          <SpaceAvatarDetailSection identity={fallbackIdentity} />
          {stageKind !== "three" ? (
            <fieldset className="space-panel-section studio-vspace-art-style-picker">
              <legend>{bt("공간 아트 스타일", "World art direction")}</legend>
              <p className="space-panel-note">{bt(studioVirtualArtStyleScopeNote(stageKind).ko, studioVirtualArtStyleScopeNote(stageKind).en)}</p>
              <div className="studio-vspace-art-style-grid">
                {STUDIO_VIRTUAL_ART_STYLES.map((style) => (
                  <button key={style.key} type="button" data-art-style={style.key} aria-pressed={artStyle === style.key} title={bt(style.descriptionKo, style.descriptionEn)} onClick={() => preferences.selectArtStyle(style.key)}>
                    <StudioVirtualExperienceArtPreview kind="landmarks" artStyle={style.key} frame={0} preserveAspectRatio="xMidYMid slice" />
                    <small>{bt(style.labelKo, style.labelEn)}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          {!personal && permissions.canEditSpace ? (
            <button type="button" className="space-link-row" onClick={openWorldEditor}>
              <Brush size={17} aria-hidden />
              {bt("월드 편집기 열기", "Open the world editor")}
            </button>
          ) : null}
        </StudioVirtualSpacePanelGate>
      );

    case "settings":
      return (
        <StudioVirtualSpacePanelGate active>
          <SpaceAtmosphereSettings value={atmosphere} localOnly={connectivityLocalOnly} onChange={changeAtmosphere} />
          {stageKind === "three" ? (
            <VirtualThreeThemePanel />
          ) : (
            <StudioVirtualSpaceEnvironmentPanel
              value={preferences.environmentPreference}
              artStyle={artStyle}
              onChange={preferences.selectEnvironmentPreference}
              spaceTheme={preferences.spaceTheme}
              onSpaceThemeChange={preferences.selectSpaceTheme}
            />
          )}
          {/* 2D·3D 공통: 0~24시 시간대 태양 고도·실내등 디머 패널을 3D 모드에서도 완전 활성화 */}
          <StudioVirtualSpaceLightingPanel
            fixtures={lighting.lightFixtures}
            ambient={lighting.lightAmbient}
            hour={lighting.lightHour}
            hourOverride={lighting.lightHourOverride}
            onToggleFixture={lighting.toggleLightFixture}
            onDimmerChange={lighting.changeLightDimmer}
            onHourOverride={lighting.setLightHourOverride}
            onClearHourOverride={() => lighting.setLightHourOverride(null)}
            onApplyPreset={lighting.applyLightPreset}
            cycleEnabled={lighting.dayNightEnabled}
            cycleAutoLighting={lighting.lightAutoMode}
            onCycleAutoLightingChange={lighting.setLightAutoMode}
            cycleTimeOfDay={lighting.cycleTimeOfDay}
            cycleSpeedMs={lighting.dayNightSpeedMs}
            onToggleCycle={lighting.toggleDayNight}
            onCycleScrub={lighting.scrubDayNight}
            onCycleSpeedChange={lighting.changeDayNightSpeed}
          />
          <StudioVirtualSpaceExperiencePanel
            value={preferences.experiencePreference}
            metrics={runtimeMetrics}
            onChange={preferences.selectExperiencePreference}
            onCapture={captureVirtualPhoto}
          />
          <button type="button" className="space-link-row" onClick={() => setHelpOpen(true)}><CircleHelp size={17} aria-hidden />{bt("단축키 도움말 · 처음 안내 다시 보기", "Shortcuts · replay guide")}</button>
          <button type="button" className="space-link-row" onClick={returnToStartPosition}><LifeBuoy size={17} aria-hidden />{bt("시작 위치로 돌아가기", "Back to start position")}</button>
          {!personal ? (
            <>
              <button type="button" className="space-link-row" onClick={() => setPanel("rtc")}><Radio size={17} aria-hidden />{bt("실시간 연결 상태", "Live connection status")}</button>
              <StudioWorldPublicationPanel
                publication={publication}
                draft={authoringMode ? authoringDraft : undefined}
                draftBaseRevision={draftBaseRevision}
                onRebaseDraft={async (revisionId) => {
                  if (!await writeStudioWorldAuthoringDraft(projectId, authoringDraft, revisionId) || !worldDraftLifetimeActive()) return false;
                  setDraftBaseRevision(revisionId);
                  return true;
                }}
                onEdit={openWorldEditor}
                onApplied={() => { if (authoringMode) closeWorldEditor(); }}
              />
            </>
          ) : null}
        </StudioVirtualSpacePanelGate>
      );

    case "board":
      return (
        <StudioVirtualSpacePanelGate active>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label={bt("협업 보드 탭", "Board view tabs")} className="flex gap-1.5">
              <button type="button" role="tab" aria-selected={boardTab === "whiteboard"} onClick={() => setBoardTab("whiteboard")} className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${boardTab === "whiteboard" ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2"}`}>
                <PenTool size={14} aria-hidden />
                {bt("화이트보드", "Whiteboard")}
              </button>
              <button type="button" role="tab" aria-selected={boardTab === "stickies"} onClick={() => setBoardTab("stickies")} className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${boardTab === "stickies" ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2"}`}>
                <StickyNote size={14} aria-hidden />
                {bt("포스트잇 칸반", "Sticky notes")}
              </button>
            </div>
            {yjsSpace.hasPendingSoloMerge ? (
              <button
                type="button"
                onClick={() => {
                  if (yjsSpace.mergeSoloToCloud()) {
                    notify(bt("오프라인·솔로 보드 작업을 클라우드 공간으로 병합했어요.", "Merged solo board edits into cloud space."), "success");
                  }
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-accent bg-accent px-3 text-xs font-semibold text-on-accent"
              >
                <CloudUpload size={14} aria-hidden />
                {bt("솔로 작업 병합", "Merge solo work")}
              </button>
            ) : null}
          </div>
          {boardTab === "whiteboard" ? (
            <StudioVirtualSpaceWhiteboard
              snapshot={yjsSpace.boardSnapshot}
              selfSessionId={selfListId}
              authorNameOf={authorNameOf}
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
        </StudioVirtualSpacePanelGate>
      );

    case "annotation":
      return (
        <StudioVirtualSpacePanelGate active>
          <StudioVirtualSpaceLiveAnnotationPanel
            snapshot={yjsSpace.boardSnapshot}
            selfSessionId={selfListId}
            onStroke={yjsSpace.addStroke}
            onNote={yjsSpace.addBoardNote}
            onRemove={yjsSpace.removeBoardEntity}
            onClearOwn={yjsSpace.clearOwnBoardEntities}
          />
        </StudioVirtualSpacePanelGate>
      );

    case "work":
      return <StudioVirtualSpacePanelGate active><StudioWorkspaceInbox workId={projectId} /></StudioVirtualSpacePanelGate>;
    case "sessions":
      return <StudioVirtualSpacePanelGate active><WorkSessionWorkspace workId={projectId} initialSessionId={initialSessionId} /></StudioVirtualSpacePanelGate>;
    case "team":
      return (
        <StudioVirtualSpacePanelGate active>
          <StudioVirtualSpaceInviteSheet inviteLink={inviteLink} codeRecord={inviteRecord} spaceUrlBase={spaceUrlBase} />
          <StudioVirtualSpaceTeamHub productionProjectId={productionProjectId} workId={projectId} />
        </StudioVirtualSpacePanelGate>
      );
    case "rtc":
      return (
        <StudioVirtualSpacePanelGate active>
          <StudioVirtualSpaceRtcPanel
            live={live}
            screenShare={{
              status: socialAndMedia.theaterFeed.source !== "none" ? "previewing" : "idle",
              canShare: permissions.canVoice,
              liveConnected: socialAndMedia.proximity.phase === "live",
              error: null,
              scope: socialAndMedia.spotlightEventId ? "broadcast" : "bubble",
              onStart: () => {
                if (socialAndMedia.proximity.phase === "live") socialAndMedia.proximity.toggleScreen();
                else if (socialAndMedia.theaterFeed.startLocalCanvasStream()) {
                  notify(bt("2D 캔버스 라이브를 3D 시어터 스크린에 연결했어요.", "Connected 2D canvas live feed to 3D theater screen."), "success");
                }
              },
              onStop: () => {
                socialAndMedia.theaterFeed.stopLocalCanvasStream();
                if (socialAndMedia.proximity.snapshot?.sharing) socialAndMedia.proximity.toggleScreen();
              },
            }}
          />
        </StudioVirtualSpacePanelGate>
      );
    case "town":
      return (
        <StudioVirtualSpacePanelGate active>
          <StudioVirtualSpaceTownProgramPanel
            selfPoint={snapshot.self}
            personal={personal}
            operations={operations.snapshot}
            manifest={worldManifest}
            decorations={preferences.decorations}
            rewards={preferences.rewardInventory}
            spotlightActive={Boolean(socialAndMedia.spotlightEventId)}
            onDecorations={preferences.selectDecorations}
            onClaimReward={(id) => { preferences.claimReward(id); notify(bt("꾸미기 보상을 획득했어요.", "Cosmetic reward unlocked."), "success"); }}
            onEquipReward={(id) => { preferences.equipReward(id); notify(bt("꾸미기 보상을 적용했어요.", "Cosmetic reward equipped."), "success"); }}
            onMoveToRoom={moveToRoomOrPlace}
            onMoveToDesk={(pod) => moveToRoomOrPlace(pod.roomId, builtinPlaceWorld ? undefined : pod.point)}
            onOpenPeople={() => setPanel("people")}
            onOpenAnnotation={() => setPanel("annotation")}
            onOpenSessions={() => setPanel("sessions")}
            onStartSpotlight={socialAndMedia.startSpotlight}
            onStopSpotlight={socialAndMedia.stopSpotlight}
          />
        </StudioVirtualSpacePanelGate>
      );
    case "seats":
      return (
        <StudioVirtualSpacePanelGate active>
          <p className="space-panel-note">{bt("작업실 안에서 쓸 자리를 선택하세요.", "Choose a desk in this space.")}</p>
          {worldReady && worldManifest.interactionSlots?.length ? (
            <StudioVirtualSpaceSeatsPanel
              slots={worldManifest.interactionSlots}
              snapshot={socialAndMedia.slots.snapshot}
              approachingSlotId={socialAndMedia.slots.approachingSlotId}
              preferredSlotId={preferredSlotId}
              onPreferSlot={preferDesk}
              onSelect={(id) => { setPanel(null); socialAndMedia.slots.requestSlot(id); }}
              onRelease={() => { void socialAndMedia.slots.cancel(); engineBridge.clearMovement(); }}
            />
          ) : (
            <p role="status">{worldReady ? bt("현재 장소에는 공유 작업 자리가 없어요.", "This place has no shared desks.") : bt("작업 자리를 확인하고 있어요.", "Checking the workspaces.")}</p>
          )}
          {builtinPlaceWorld ? <button type="button" className="space-link-row" onClick={() => moveToRoomOrPlace("lobby")}><Armchair size={17} aria-hidden />{bt("공유 자리 있는 로비로 이동", "Go to shared workspaces in lobby")}</button> : null}
          {personal ? <button type="button" className="space-link-row" onClick={walkToPersonalDesk}><Brush size={17} aria-hidden />{bt("내 드로잉 책상으로 걷기", "Walk to drawing desk")}</button>
            : <button type="button" className="space-link-row" onClick={() => setPanel("work")}><BookOpen size={17} aria-hidden />{bt("내 작업 열기", "Open my work")}</button>}
        </StudioVirtualSpacePanelGate>
      );
    case "booth":
      return (
        <StudioVirtualSpacePanelGate active>
          <StudioVirtualSpaceSpaceBookingPanel spaces={boothSpaces} bookings={boothBookings} waitlist={boothWaitlist} onBookingsChange={setBoothBookings} onWaitlistChange={setBoothWaitlist} />
          <StudioVirtualSpaceRecordingBoothPanel
            config={boothConfig}
            bookings={boothBookings}
            actorId={currentSessionReady ? privateActorId : undefined}
            position={{ x: snapshot.self.x, y: snapshot.self.y }}
            userName={localName}
            micMutedByUser={socialAndMedia.userMicMuted}
            projectId={personal ? null : projectId}
            isGuest={isGuest}
            onRequireLogin={requestSaveLogin}
            onProjectAsset={handleBoothProjectAsset}
          />
        </StudioVirtualSpacePanelGate>
      );
    case "gallery":
      return (
        <StudioVirtualSpacePanelGate active>
          <StudioVirtualSpaceGalleryViewer frames={galleryFrames} position={{ x: snapshot.self.x, y: snapshot.self.y }} userId={privateActorId} stats={galleryStats} onStatsChange={setGalleryStats} onRequireLogin={requestSaveLogin} />
        </StudioVirtualSpacePanelGate>
      );
    case "megaphone":
      return <StudioVirtualSpacePanelGate active><StudioVirtualSpaceMegaphonePanel binding={socialAndMedia.megaphone} /></StudioVirtualSpacePanelGate>;
    case "poll":
      return (
        <StudioVirtualSpacePanelGate active>
          <StudioSpacePollPanel workId={projectId} world={activeWorldScope} actor={privateActorId} name={localName} localOnly={personal || isGuest || !signedIn || authoringMode} />
        </StudioVirtualSpacePanelGate>
      );
    default:
      return null;
  }
}
