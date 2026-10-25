import { useMemo, useState } from "react";

import { StudioPresenceRoster } from "./StudioPresenceRoster";
import { StudioVirtualSpaceAppHost } from "./StudioVirtualSpaceAppHost";
import { StudioVirtualSpaceAppStore } from "./StudioVirtualSpaceAppStore";
import { StudioVirtualSpaceBotRecorder } from "./StudioVirtualSpaceBotRecorder";
import { StudioVirtualSpaceClonePanel } from "./StudioVirtualSpaceClonePanel";
import { StudioVirtualSpaceGameFeelSettings } from "./StudioVirtualSpaceGameFeelSettings";
import { StudioVirtualSpaceInviteSheet } from "./StudioVirtualSpaceInviteSheet";
import { StudioVirtualSpacePlaceModeBanner } from "./StudioVirtualSpacePlaceModeBanner";
import {
  StudioVirtualSpaceScreenShareRequest,
  type StudioShareRequestPhase,
} from "./StudioVirtualSpaceScreenShareRequest";
import { StudioVirtualSpaceShareIndicator } from "./StudioVirtualSpaceShareIndicator";
import { StudioVirtualSpaceStickyNotes } from "./StudioVirtualSpaceStickyNotes";
import { StudioVirtualSpaceWhiteboard } from "./StudioVirtualSpaceWhiteboard";
import {
  deriveStudioPresenceExposures,
  type StudioPresencePeerInput,
} from "./studio-presence-exposure-policy";
import {
  STUDIO_AUTOTILE_CANONICAL_MASKS,
  studioAutotileFrame,
  studioAutotileMaskAt,
} from "./studio-virtual-space-autotile";
import {
  DEFAULT_STUDIO_SPACE_BRANDING,
  studioBrandingDisplay,
  validateStudioSpaceBranding,
} from "./studio-virtual-space-branding";
import type { StudioShareBandwidth } from "./studio-virtual-space-bubble-share";
import {
  describeStudioCoviewFocus,
  IDLE_STUDIO_COVIEW_STATE,
  reduceStudioCoview,
  type StudioCoviewState,
} from "./studio-virtual-space-coview";
import {
  creativeZoneActionText,
  resolveCreativeZone,
  type StudioCreativeZone,
} from "./studio-virtual-space-creative-zones";
import { createEntryCodeRecord } from "./studio-virtual-space-entry-code";
import {
  DEFAULT_STUDIO_VIRTUAL_GAME_FEEL,
  type StudioVirtualGameFeelPreference,
} from "./studio-virtual-space-game-feel-preference";
import {
  resolveStudioScreenSlotAction,
  studioScreenInteractionSlots,
} from "./studio-virtual-space-interaction-slots";
import {
  advanceStudioLipsync,
  createStudioLipsyncState,
  studioLipsyncMouthForIntensity,
} from "./studio-virtual-space-lipsync";
import {
  MAP_SCRIPT_PROTOCOL,
  mapScriptSandboxSrcdoc,
} from "./studio-virtual-space-map-script";
import {
  advanceNpcBehavior,
  createNpcBehavior,
  npcBehaviorModeLabel,
} from "./studio-virtual-space-npc-behavior";
import {
  createNpcConversation,
  createScriptedNpcResponder,
} from "./studio-virtual-space-npc-responder";
import {
  createDoorSwingState,
  createSitAnimation,
  doorSwingAngleDegrees,
  sitPhaseProgress,
  stepDoorSwing,
} from "./studio-virtual-space-object-feel";
import type { StudioScreenObject } from "./studio-virtual-space-object-runtime";
import {
  STUDIO_P2P_BOARD_COLORS,
  type StudioP2pBoardColor,
  type StudioP2pBoardEntity,
  type StudioP2pBoardPoint,
} from "./studio-virtual-space-p2p-board";
import {
  computeLocateGuide,
  sortLocateCandidates,
} from "./studio-virtual-space-participant-locate";
import {
  adoptStudioPet,
  EMPTY_PET_ADOPTION,
  type StudioPetAdoption,
} from "./studio-virtual-space-pets";
import type { PlaceMediaSnapshot } from "./studio-virtual-space-place-media";
import {
  privateSpaceAudioGain,
  resolvePrivateSpace,
} from "./studio-virtual-space-private-space";
import {
  formProximityCircles,
  proximityAudioMixes,
} from "./studio-virtual-space-proximity-circles";
import {
  createStudioProximityTracker,
  updateStudioProximityTracker,
} from "./studio-virtual-space-proximity-triggers";
import {
  STUDIO_EXTRA_ROOM_TEMPLATES,
  validateStudioExtraRoomTemplates,
} from "./studio-virtual-space-room-templates-extra";
import {
  STUDIO_SPRITE_ASSET_REGISTRY,
  validateStudioSpriteAssetRegistry,
} from "./studio-virtual-space-sprite-assets";
import {
  createStickyNote,
  editStickyNoteText,
  moveStickyNote,
  recolorStickyNote,
  removeStickyNote,
  resizeStickyNote,
  toggleStickyNoteDone,
  type StudioStickyNote,
  type StudioStickyNoteColor,
} from "./studio-virtual-space-sticky-notes";
import {
  findNearestUnifiedInteractTarget,
  handleUnifiedInteractKey,
  unifiedInteractPromptText,
} from "./studio-virtual-space-unified-interact";
import { getStudioWeatherLabels } from "./studio-virtual-space-weather-labels";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";

export interface StudioVirtualSpaceCollaborationHubProps {
  readonly className?: string;
}

type CollabSubTabId =
  | "presence-coview"
  | "whiteboard-sticky"
  | "apps-bot-clone"
  | "spatial-npc-engine";

const SELF_SESSION_ID = "session-self-01";

const INITIAL_PEERS: readonly StudioPresencePeerInput[] = [
  { sessionId: SELF_SESSION_ID, userStatus: "available" },
  { sessionId: "session-peer-02", userStatus: "focusing" },
  { sessionId: "session-peer-03", userStatus: "available" },
];

const INITIAL_DISPLAY_NAMES = new Map<string, string>([
  [SELF_SESSION_ID, "수석 배경 아티스트"],
  ["session-peer-02", "콘티 디렉터"],
  ["session-peer-03", "라이팅 아티스트"],
]);

const INITIAL_CREATIVE_ZONES: readonly StudioCreativeZone[] = [
  { id: "zone-drawing-1", kind: "drawing", position: { x: 180, y: 200 }, radius: 85, labelKo: "메인 드로잉 존", labelEn: "Main drawing zone" },
  { id: "zone-meeting-1", kind: "meeting", position: { x: 340, y: 220 }, radius: 95, labelKo: "콘티 회의실", labelEn: "Storyboard meeting room" },
];

const INITIAL_SCREENS: readonly StudioScreenObject[] = [
  {
    id: "screen-main-01",
    position: { x: 320, y: 180 },
    visibilityRadius: 240,
    share: null,
  },
];

export function StudioVirtualSpaceCollaborationHub({
  className,
}: StudioVirtualSpaceCollaborationHubProps) {
  const [subTab, setSubTab] = useState<CollabSubTabId>("presence-coview");
  const [coviewState, setCoviewState] = useState<StudioCoviewState>(IDLE_STUDIO_COVIEW_STATE);
  const [sharePhase, setSharePhase] = useState<StudioShareRequestPhase>("idle");
  const [shareBandwidth, setShareBandwidth] = useState<StudioShareBandwidth>("balanced");
  const [installedAppIds, setInstalledAppIds] = useState<readonly string[]>(["conte-pack", "pose-timer"]);
  const [gameFeel, setGameFeel] = useState<StudioVirtualGameFeelPreference>(DEFAULT_STUDIO_VIRTUAL_GAME_FEEL);
  const [petAdoption, setPetAdoption] = useState<StudioPetAdoption>(EMPTY_PET_ADOPTION);
  const [avatarPoint, setAvatarPoint] = useState<{ readonly x: number; readonly y: number }>({ x: 190, y: 205 });
  const [voiceIntensity, setVoiceIntensity] = useState(0.38);

  const [stickyNotes, setStickyNotes] = useState<readonly StudioStickyNote[]>(() => {
    const initial = createStickyNote({
      id: "sticky-init-1",
      authorSessionId: SELF_SESSION_ID,
      authorName: "수석 배경 아티스트",
      x: 0.15,
      y: 0.2,
      text: "14화 옥상 야경 컷 조명 색온도 4200K 확인",
      color: "#ffd166",
      nowMs: 1_710_000_000_000,
    });
    return initial ? [initial] : [];
  });

  const [boardEntities, setBoardEntities] = useState<readonly StudioP2pBoardEntity[]>([]);
  const [placeMedia, setPlaceMedia] = useState<PlaceMediaSnapshot>({
    active: true,
    kind: "conference",
    localStream: null,
    microphone: true,
    camera: false,
    speaking: false,
    screenSharing: false,
    screenStream: null,
    screenShareScope: "bubble",
    screenShareBandwidth: "balanced",
    peers: [],
    spotlightSessionId: null,
    error: null,
  });

  const exposures = useMemo(
    () =>
      deriveStudioPresenceExposures(
        INITIAL_PEERS,
        coviewState.status === "active"
          ? { sessionId: coviewState.sessionId ?? "coview-1", participantSessionIds: INITIAL_PEERS.map((p) => p.sessionId) }
          : null,
        SELF_SESSION_ID,
      ),
    [coviewState],
  );

  const entryCodeRecord = useMemo(
    () =>
      createEntryCodeRecord({
        code: "TS7K9M",
        spaceId: DEFAULT_STUDIO_WORLD_MANIFEST.id,
        spaceName: "툰스튜디오 가상 협업 공간",
        now: 1_710_000_000_000,
      }) ?? {
        code: "TS7K9M",
        spaceId: DEFAULT_STUDIO_WORLD_MANIFEST.id,
        spaceName: "툰스튜디오 가상 협업 공간",
        issuedAt: 1_710_000_000_000,
        expiresAt: 1_710_000_000_000 + 86_400_000,
      },
    [],
  );

  const spatialTelemetry = useMemo(() => {
    const mask = studioAutotileMaskAt(
      { width: 3, height: 3, cells: [1, 1, 1, 1, 1, 1, 0, 1, 1] },
      1,
      1,
      1,
    ) ?? 0;
    const autotileFrame = studioAutotileFrame(mask);

    const brandingErrors = validateStudioSpaceBranding(DEFAULT_STUDIO_SPACE_BRANDING);
    const brandingView = studioBrandingDisplay(DEFAULT_STUDIO_SPACE_BRANDING);

    const activeCreativeZone = resolveCreativeZone(INITIAL_CREATIVE_ZONES, avatarPoint);
    const creativeAction = activeCreativeZone ? creativeZoneActionText(activeCreativeZone) : null;

    const screenSlots = studioScreenInteractionSlots(INITIAL_SCREENS);
    const firstScreen = INITIAL_SCREENS[0];
    const slotVerdict = firstScreen
      ? resolveStudioScreenSlotAction({
          action: "start-screen-share",
          screen: firstScreen,
          viewerId: SELF_SESSION_ID,
          distance: 64,
        })
      : { allowed: false as const, reason: "no-share" as const };

    const lipsync = advanceStudioLipsync(createStudioLipsyncState(), voiceIntensity, 1200);
    const mouthShape = studioLipsyncMouthForIntensity(lipsync.level, 1200);

    const sandboxHtml = mapScriptSandboxSrcdoc("console.log('virtual-space-ready');");

    const npcBehavior0 = createNpcBehavior(
      { home: { x: 200, y: 200 }, waypoints: [{ x: 260, y: 200 }, { x: 260, y: 260 }] },
      1000,
    );
    const npcBehavior1 = advanceNpcBehavior(npcBehavior0, "npc-guide-01", {
      obstacles: [],
      others: [avatarPoint],
      deltaSeconds: 0.5,
      nowMs: 1500,
    });
    const npcModeLabel = npcBehaviorModeLabel(npcBehavior1.state.mode);

    const npcConv = createNpcConversation("npc-guide-01", "curator", "아카이브 큐레이터");
    const npcReply = createScriptedNpcResponder().respond({
      npcId: npcConv.npcId,
      archetypeKey: npcConv.archetypeKey,
      npcName: npcConv.npcName,
      userText: "배경 에셋 어디 있어?",
      locale: "ko",
      history: npcConv.turns,
    });

    const doorSwing = stepDoorSwing(createDoorSwingState(0.2), 1, 0.16, false);
    const doorDeg = Math.round(doorSwingAngleDegrees(doorSwing));
    const sitProgress = sitPhaseProgress(createSitAnimation());

    const locateGuide = computeLocateGuide(avatarPoint, { x: 340, y: 220 }, 120);
    const locateCandidates = sortLocateCandidates(avatarPoint, [
      { sessionId: "session-peer-02", point: { x: 340, y: 220 } },
      { sessionId: "session-peer-03", point: { x: 210, y: 215 } },
    ]);

    const privateZone = resolvePrivateSpace(DEFAULT_STUDIO_WORLD_MANIFEST.acousticZones ?? [], avatarPoint);
    const privateGain = privateSpaceAudioGain(Boolean(privateZone));

    const circles = formProximityCircles(SELF_SESSION_ID, avatarPoint, []);
    const audioMixes = proximityAudioMixes(avatarPoint, [], circles);

    const tracker0 = createStudioProximityTracker([
      { id: "trig-1", kind: "zone", point: { x: 195, y: 205 }, radius: 40, cooldownMs: 0 },
    ]);
    const trackerStep = updateStudioProximityTracker(tracker0, avatarPoint, 2000);

    const extraTemplateErrors = validateStudioExtraRoomTemplates(STUDIO_EXTRA_ROOM_TEMPLATES);
    const spriteRegistryErrors = validateStudioSpriteAssetRegistry(STUDIO_SPRITE_ASSET_REGISTRY);

    const nearestTarget = findNearestUnifiedInteractTarget(
      {
        officeObjects: [],
        lightFixtures: [{ id: "light-1", kind: "desk-lamp", position: { x: 200, y: 210 }, radius: 120, on: true, dimmer: 0.8, warm: true, labelKo: "작업등", labelEn: "Desk lamp" }],
        doors: [],
      },
      avatarPoint,
    );
    const interactCmd = handleUnifiedInteractKey(nearestTarget);
    const interactPrompt = nearestTarget ? unifiedInteractPromptText(nearestTarget).ko : "근접 대상 없음";

    const weatherLabels = getStudioWeatherLabels("ko");

    return {
      autotileMasksCount: STUDIO_AUTOTILE_CANONICAL_MASKS.length,
      autotileFrame,
      brandingTitle: brandingView.title,
      brandingValid: brandingErrors.length === 0,
      creativeActionKo: creativeAction?.ko ?? "자유 이동",
      screenSlotCount: screenSlots.length,
      slotAllowed: slotVerdict.allowed,
      mouthShape,
      mapScriptProtocol: MAP_SCRIPT_PROTOCOL,
      sandboxReady: Boolean(sandboxHtml),
      npcModeKo: npcModeLabel.ko,
      npcReplyKo: "textKo" in npcReply ? npcReply.textKo : "응답 준비 중",
      doorDeg,
      sitProgress,
      locateDistance: Math.round(locateGuide?.distance ?? 0),
      locateCandidateCount: locateCandidates.length,
      privateGain,
      circleCount: circles.length,
      mixCount: audioMixes.length,
      triggerEvents: trackerStep.events.length,
      extraRoomCount: STUDIO_EXTRA_ROOM_TEMPLATES.length,
      extraTemplateValid: extraTemplateErrors.length === 0,
      spriteAssetCount: STUDIO_SPRITE_ASSET_REGISTRY.length,
      spriteRegistryValid: spriteRegistryErrors.length === 0,
      interactCommand: interactCmd?.command ?? "none",
      interactPrompt,
      weatherSample: weatherLabels.widgetLabel(22, "clear"),
    };
  }, [avatarPoint, voiceIntensity]);

  const handleToggleCoview = () => {
    if (coviewState.status === "idle") {
      setCoviewState(
        reduceStudioCoview(coviewState, {
          type: "start",
          sessionId: "coview-main-1",
          leaderSessionId: SELF_SESSION_ID,
          leaderDisplayName: "수석 배경 아티스트",
          startedAt: Date.now(),
        }),
      );
    } else {
      setCoviewState(reduceStudioCoview(coviewState, { type: "end" }));
    }
  };

  const handleAdoptPet = () => {
    const res = adoptStudioPet(petAdoption, {
      species: "cat",
      name: `치즈냥-${petAdoption.pets.length + 1}`,
      ownerPoint: avatarPoint,
    });
    if (res.ok) setPetAdoption(res.adoption);
  };

  return (
    <section
      className={`space-y-4 rounded-xl border border-line bg-card p-4 text-fg ${className ?? ""}`}
      data-testid="studio-virtual-space-collaboration-hub"
      aria-label="가상 공간 협업·소셜·미니앱 통합 허브"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div>
          <h3 className="text-sm font-semibold">가상 공간 협업·소셜·미니앱 통합 허브</h3>
          <p className="text-xs text-fg-2">
            프레즌스·함께 보기·P2P 화이트보드·포스트잇·미니앱 스토어·봇 녹화·NPC·공간 스크립트 31종 모듈 실시간 제어
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="가상 공간 협업 하위 탭">
          {(
            [
              ["presence-coview", "프레즌스·초대·공유"],
              ["whiteboard-sticky", "화이트보드·포스트잇"],
              ["apps-bot-clone", "앱스토어·봇녹화·복제"],
              ["spatial-npc-engine", "공간엔진·NPC·게임필"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={subTab === id}
              onClick={() => setSubTab(id)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                subTab === id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {subTab === "presence-coview" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">함께 보기(Co-view) & 프레즌스 명단</span>
              <button
                type="button"
                onClick={handleToggleCoview}
                className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
              >
                {coviewState.status === "active" ? "함께 보기 종료" : "함께 보기 시작"}
              </button>
            </div>
            <p className="text-xs text-fg-2">
              상태: <strong>{coviewState.status}</strong> · 포커스: {describeStudioCoviewFocus(coviewState.focus)}
            </p>
            <StudioPresenceRoster
              sessionActive={coviewState.status === "active"}
              exposures={exposures}
              displayNames={INITIAL_DISPLAY_NAMES}
              selfSessionId={SELF_SESSION_ID}
              onStartSession={handleToggleCoview}
            />
            <StudioVirtualSpacePlaceModeBanner
              prompt={null}
              banner={null}
              session={{
                zoneId: "zone-meeting-1",
                zoneLabelKo: "콘티 회의실",
                zoneLabelEn: "Storyboard meeting room",
                mode: "conference",
                stage: "engaged",
                engagedAt: 1_710_000_000_000,
              }}
              media={placeMedia}
              whiteboardOffer={null}
              onConfirmJoin={() => {}}
              onDeclineJoin={() => {}}
              onLeaveSession={() => setPlaceMedia((prev) => ({ ...prev, active: false }))}
              onDismissBanner={() => {}}
              onOpenWhiteboard={() => setSubTab("whiteboard-sticky")}
              onDismissWhiteboardOffer={() => {}}
              onToggleMicrophone={() => setPlaceMedia((prev) => ({ ...prev, microphone: !prev.microphone }))}
              onToggleCamera={() => setPlaceMedia((prev) => ({ ...prev, camera: !prev.camera }))}
              onStartScreenShare={() => setSharePhase("selecting")}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <StudioVirtualSpaceShareIndicator
              sharerLabel="수석 배경 아티스트"
              route="bubble"
              bandwidth={shareBandwidth}
              onBandwidthChange={setShareBandwidth}
            />
            <StudioVirtualSpaceScreenShareRequest
              screens={[{ id: "screen-main-01", labelKo: "메인 리뷰 스크린", labelEn: "Main review screen", occupied: false }]}
              phase={sharePhase}
              pendingScreenId={sharePhase === "pending" ? "screen-main-01" : null}
              incomingRequest={null}
              activeShare={null}
              denial={null}
              onOpenSelect={() => setSharePhase("selecting")}
              onCancelSelect={() => setSharePhase("idle")}
              onRequest={() => setSharePhase("pending")}
              onCancelRequest={() => setSharePhase("idle")}
              onAcceptIncoming={() => {}}
              onDeclineIncoming={() => {}}
              onStopShare={() => setSharePhase("idle")}
              onDismissDenial={() => {}}
            />
            <StudioVirtualSpaceInviteSheet
              inviteLink="https://toonstudio.cloud/vspace#invite=demo-token"
              codeRecord={entryCodeRecord}
              spaceUrlBase="https://toonstudio.cloud/vspace"
            />
          </div>
        </div>
      ) : null}

      {subTab === "whiteboard-sticky" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-panel p-3">
            <StudioVirtualSpaceWhiteboard
              snapshot={{
                entities: boardEntities,
                readyPeerIds: ["session-peer-02"],
                available: true,
                canEdit: true,
              }}
              selfSessionId={SELF_SESSION_ID}
              authorNameOf={(sessionId) => INITIAL_DISPLAY_NAMES.get(sessionId) ?? sessionId}
              onStroke={(points: readonly StudioP2pBoardPoint[], color: StudioP2pBoardColor, width = 4) => {
                const id = `stroke-${boardEntities.length + 1}`;
                setBoardEntities((prev) => [
                  ...prev,
                  {
                    id,
                    kind: "stroke",
                    ownerSessionId: SELF_SESSION_ID,
                    ownerEpoch: "epoch-1",
                    revision: 1,
                    color,
                    width,
                    points,
                  },
                ]);
                return id;
              }}
              onNote={(x: number, y: number, text: string, color: StudioP2pBoardColor) => {
                const id = `bnote-${boardEntities.length + 1}`;
                setBoardEntities((prev) => [
                  ...prev,
                  {
                    id,
                    kind: "note",
                    ownerSessionId: SELF_SESSION_ID,
                    ownerEpoch: "epoch-1",
                    revision: 1,
                    color: color ?? STUDIO_P2P_BOARD_COLORS[0],
                    x,
                    y,
                    text,
                  },
                ]);
                return id;
              }}
              onRemove={(id: string) => {
                setBoardEntities((prev) => prev.filter((item) => item.id !== id));
                return true;
              }}
              onClearOwn={() => {
                setBoardEntities((prev) => prev.filter((item) => item.ownerSessionId !== SELF_SESSION_ID));
              }}
            />
          </div>
          <div className="rounded-lg border border-line bg-panel p-3">
            <StudioVirtualSpaceStickyNotes
              notes={stickyNotes}
              canEdit
              onCreate={({ x, y, text, color }) => {
                const created = createStickyNote({
                  id: `sticky-${Date.now()}`,
                  authorSessionId: SELF_SESSION_ID,
                  authorName: "수석 배경 아티스트",
                  x,
                  y,
                  text,
                  color,
                });
                if (created) setStickyNotes((prev) => [...prev, created]);
              }}
              onMove={(id, x, y) =>
                setStickyNotes((prev) => prev.map((n) => (n.id === id ? moveStickyNote(n, x, y) : n)))
              }
              onResize={(id, w, h) =>
                setStickyNotes((prev) => prev.map((n) => (n.id === id ? resizeStickyNote(n, w, h) : n)))
              }
              onEdit={(id, text) =>
                setStickyNotes((prev) => prev.map((n) => (n.id === id ? editStickyNoteText(n, text) : n)))
              }
              onToggleDone={(id) =>
                setStickyNotes((prev) => prev.map((n) => (n.id === id ? toggleStickyNoteDone(n) : n)))
              }
              onRemove={(id) => setStickyNotes((prev) => removeStickyNote(prev, id))}
              onRecolor={(id, color: StudioStickyNoteColor) =>
                setStickyNotes((prev) => prev.map((n) => (n.id === id ? recolorStickyNote(n, color) : n)))
              }
            />
          </div>
        </div>
      ) : null}

      {subTab === "apps-bot-clone" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <StudioVirtualSpaceAppStore
              installedAppIds={installedAppIds}
              onInstalledChange={setInstalledAppIds}
            />
            <StudioVirtualSpaceAppHost installedAppIds={installedAppIds} />
          </div>
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <StudioVirtualSpaceBotRecorder
              zones={[
                { id: "zone-meeting-1", name: "콘티 회의실" },
                { id: "zone-review-1", name: "배경 검수실" },
              ]}
              defaultZoneId="zone-meeting-1"
            />
            <StudioVirtualSpaceClonePanel
              world={DEFAULT_STUDIO_WORLD_MANIFEST}
              disabled={false}
              onApplySnapshot={() => {}}
            />
          </div>
        </div>
      ) : null}

      {subTab === "spatial-npc-engine" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <h4 className="text-xs font-semibold">공간·NPC·오디오·인터랙션 19종 엔진 텔레메트리</h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAvatarPoint((pt) => ({ x: pt.x + 15, y: pt.y + 10 }))}
                className="rounded border border-line bg-card px-2.5 py-1 text-xs"
              >
                아바타 이동 ({avatarPoint.x}, {avatarPoint.y})
              </button>
              <button
                type="button"
                onClick={() => setVoiceIntensity((v) => (v > 0.6 ? 0.12 : 0.72))}
                className="rounded border border-line bg-card px-2.5 py-1 text-xs"
              >
                립싱크 레벨 전환 ({voiceIntensity})
              </button>
              <button
                type="button"
                onClick={handleAdoptPet}
                className="rounded border border-accent bg-accent-soft px-2.5 py-1 text-xs text-accent"
              >
                반려동물 입양 ({petAdoption.pets.length}마리)
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-1.5 text-xs">
              <div className="rounded border border-line bg-card p-2">
                <dt className="text-fg-2">오토타일 마스크 / 프레임</dt>
                <dd className="font-medium">{spatialTelemetry.autotileMasksCount}종 / #{spatialTelemetry.autotileFrame}</dd>
              </div>
              <div className="rounded border border-line bg-card p-2">
                <dt className="text-fg-2">공간 브랜딩 검증</dt>
                <dd className="font-medium">{spatialTelemetry.brandingTitle} ({spatialTelemetry.brandingValid ? "정상" : "오류"})</dd>
              </div>
              <div className="rounded border border-line bg-card p-2">
                <dt className="text-fg-2">크리에이티브 존 / 통합 X키</dt>
                <dd className="font-medium">{spatialTelemetry.creativeActionKo} · {spatialTelemetry.interactPrompt}</dd>
              </div>
              <div className="rounded border border-line bg-card p-2">
                <dt className="text-fg-2">립싱크 입모양 / NPC 상태</dt>
                <dd className="font-medium">{spatialTelemetry.mouthShape} · {spatialTelemetry.npcModeKo}</dd>
              </div>
              <div className="rounded border border-line bg-card p-2">
                <dt className="text-fg-2">NPC 응답</dt>
                <dd className="truncate font-medium">{spatialTelemetry.npcReplyKo}</dd>
              </div>
              <div className="rounded border border-line bg-card p-2">
                <dt className="text-fg-2">문 스윙 / 착석 진행률</dt>
                <dd className="font-medium">{spatialTelemetry.doorDeg}° · {Math.round(spatialTelemetry.sitProgress * 100)}%</dd>
              </div>
              <div className="rounded border border-line bg-card p-2">
                <dt className="text-fg-2">근접 서클 / 프라이빗 오디오</dt>
                <dd className="font-medium">{spatialTelemetry.circleCount}서클 (믹스 {spatialTelemetry.mixCount}) · 게인 {spatialTelemetry.privateGain}</dd>
              </div>
              <div className="rounded border border-line bg-card p-2">
                <dt className="text-fg-2">룸 템플릿 / 스프라이트 / 날씨</dt>
                <dd className="font-medium">{spatialTelemetry.extraRoomCount}룸 · {spatialTelemetry.spriteAssetCount}에셋 · {spatialTelemetry.weatherSample}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-line bg-panel p-3">
            <StudioVirtualSpaceGameFeelSettings value={gameFeel} onChange={setGameFeel} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
