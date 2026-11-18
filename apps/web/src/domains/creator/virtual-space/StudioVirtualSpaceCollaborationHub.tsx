import { useId, useMemo, useState } from "react";

import { navigateStudioSpaceTab } from "./studio-space-tab-navigation";
import { StudioCollaborationSessionTools } from "./StudioCollaborationSessionTools";
import { useStudioCollaborationSpaceTarget } from "./use-studio-collaboration-space-target";
import { StudioVirtualDynamicSpriteWorkspace } from "./StudioVirtualDynamicSpriteWorkspace";
import { StudioVirtualOfficeEnterpriseSuite } from "./StudioVirtualOfficeEnterpriseSuite";
import { StudioWorkspaceMiniApps } from "./StudioWorkspaceMiniApps";
import { StudioVirtualSpaceBotRecorder } from "./StudioVirtualSpaceBotRecorder";
import { StudioVirtualSpaceGameFeelSettings } from "./StudioVirtualSpaceGameFeelSettings";
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
import {
  creativeZoneActionText,
  resolveCreativeZone,
  type StudioCreativeZone,
} from "./studio-virtual-space-creative-zones";
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
  computeLocateGuide,
  sortLocateCandidates,
} from "./studio-virtual-space-participant-locate";
import {
  adoptStudioPet,
  EMPTY_PET_ADOPTION,
  type StudioPetAdoption,
} from "./studio-virtual-space-pets";
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
  | "spatial-npc-engine"
  | "dynamic-sprite-workspace"
  | "enterprise-virtual-office";

const SELF_SESSION_ID = "session-self-01";

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
  const navigationId = useId();
  const [subTab, setSubTab] = useState<CollabSubTabId>("presence-coview");
  const target = useStudioCollaborationSpaceTarget();
  const [gameFeel, setGameFeel] = useState<StudioVirtualGameFeelPreference>(DEFAULT_STUDIO_VIRTUAL_GAME_FEEL);
  const [petAdoption, setPetAdoption] = useState<StudioPetAdoption>(EMPTY_PET_ADOPTION);
  const [avatarPoint, setAvatarPoint] = useState<{ readonly x: number; readonly y: number }>({ x: 190, y: 205 });
  const [voiceIntensity, setVoiceIntensity] = useState(0.38);

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
      aria-label="공간 협업"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <h3 className="text-sm font-semibold">공간 협업 도구</h3>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="공간 협업 도구">
          {(
            [
              ["presence-coview", "참여자·초대·화면 공유"],
              ["whiteboard-sticky", "보드·메모"],
              ["apps-bot-clone", "앱·녹화·공간 복제"],
              ["spatial-npc-engine", "공간·NPC 동작"],
              ["dynamic-sprite-workspace", "캐릭터 동작·효과"],
              ["enterprise-virtual-office", "가상 사무실 운영"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${navigationId}-${id}`}
              aria-controls={`${navigationId}-panel`}
              tabIndex={subTab === id ? 0 : -1}
              onKeyDown={navigateStudioSpaceTab}
              aria-selected={subTab === id}
              onClick={() => setSubTab(id)}
              className={`min-h-11 rounded-lg border px-2.5 py-1 text-xs font-medium focus-visible:outline-accent ${
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
      <div id={`${navigationId}-panel`} role="tabpanel" aria-labelledby={`${navigationId}-${subTab}`}>


      {subTab === "presence-coview" || subTab === "whiteboard-sticky" ? (
        <StudioCollaborationSessionTools target={target} board={subTab === "whiteboard-sticky"} />
      ) : null}

      {subTab === "apps-bot-clone" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <StudioWorkspaceMiniApps projectId={target.projectId} />
          </div>
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <StudioVirtualSpaceBotRecorder
              zones={[
                { id: "zone-meeting-1", name: "콘티 회의실" },
                { id: "zone-review-1", name: "배경 검수실" },
              ]}
              defaultZoneId="zone-meeting-1"
            />
            <a href={target.spacePath + "?worldEdit=1&clone=1"} target="_blank" rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm">
              {target.projectId ? "프로젝트 공간 복제 열기" : "개인 공간 복제 열기"}
            </a>
          </div>
        </div>
      ) : null}

      {subTab === "spatial-npc-engine" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <h4 className="text-xs font-semibold">이동·음성·NPC 동작 미리보기</h4>
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

      {subTab === "dynamic-sprite-workspace" ? <StudioVirtualDynamicSpriteWorkspace /> : null}

      {subTab === "enterprise-virtual-office" ? <StudioVirtualOfficeEnterpriseSuite /> : null}
      </div>
    </section>
  );
}
