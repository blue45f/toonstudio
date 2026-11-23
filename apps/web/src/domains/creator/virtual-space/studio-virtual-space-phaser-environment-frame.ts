/**
 * Per-frame overlay graphics, zone/tile-effect tracking, living-world ambience,
 * dynamic lighting, and campus runtime updates for `StudioVirtualSpacePhaserCanvas`.
 */

import { studioAmbienceCondition, type StudioVirtualAmbienceRenderRuntime } from "./studio-virtual-space-ambience-render";
import { studioBuildingLifeAmbienceAt, studioBuildingSkyTint } from "./studio-virtual-space-building-life";
import type { StudioCampusRuntime, StudioCampusRuntimeFrame } from "./studio-virtual-space-campus-runtime";
import type { StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import { studioDayNightTimeOfDay } from "./studio-virtual-space-day-night-cycle";
import { studioDayNightModulationAt } from "./studio-virtual-space-day-night-lighting";
import type { StudioVirtualDecorationRuntime } from "./studio-virtual-space-decoration-runtime";
import type { StudioDeskPodRuntime } from "./studio-virtual-space-desk-pods";
import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import type {
  StudioVirtualSpaceZoneChange,
  StudioZoneChangeTracker,
} from "./studio-virtual-space-engine-events";
import type { StudioVirtualEnvironmentPreference } from "./studio-virtual-space-environment-preference";
import type { StudioVirtualExperiencePreference } from "./studio-virtual-space-experience-preference";
import {
  studioLightRenderRealTimeOfDay,
  type StudioVirtualLightRenderRuntime,
} from "./studio-virtual-space-light-render";
import { studioVirtualDayPhase, type StudioLivingWorldRuntime } from "./studio-virtual-space-living-world";
import { buildStudioLocateGuide } from "./studio-virtual-space-locate-guide";
import type { StudioVirtualSpacePeer, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioNpcAtmosphere } from "./studio-virtual-space-npc-director";
import type { StudioWorldObjectRuntime } from "./studio-virtual-space-object-runtime";
import type { PeerVisual } from "./studio-virtual-space-phaser-canvas-model";
import { drawStudioProximityOverlay } from "./studio-virtual-space-phaser-canvas-proximity-overlay";
import type { StudioPhaserArtProfile } from "./studio-virtual-space-phaser-peer-sync";
import type { studioVirtualQualityProfile } from "./studio-virtual-space-quality";
import {
  resolveStudioWorldZonePresence,
  type StudioWorldZoneTracker,
} from "./studio-virtual-space-runtime-policy";
import type { StudioVirtualSetDressingRuntime } from "./studio-virtual-space-scene-art-runtime";
import { studioProjectTownPoint } from "./studio-virtual-space-semantic-world";
import { StudioTileEffectRuntimeTracker } from "./studio-virtual-space-tile-effect-runtime";
import type { StudioTileEffectDefinition, StudioTileEffectTrigger } from "./studio-virtual-space-tile-effects";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldPortalDefinition,
} from "./studio-virtual-space-world-manifest";
import {
  drawStudioLocateOverlay,
  drawStudioRouteOverlay,
  type createStudioRouteOverlayMemory,
} from "./studio-virtual-space-world-overlays";
import {
  drawStudioZoneSeparationVeil,
  drawStudioZoneTransitionOverlay,
  type stepStudioZoneTransition,
} from "./studio-virtual-space-zone-transition";

export interface UpdateStudioPhaserOverlaysParams {
  readonly scene: import("phaser").Scene;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly parent: HTMLElement;
  readonly artProfile: StudioPhaserArtProfile;
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly path: readonly StudioVirtualSpacePoint[];
  readonly portals: readonly StudioWorldPortalDefinition[];
  readonly peers: ReadonlyMap<string, PeerVisual>;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly feelSpeed: number;
  readonly speed: number;
  readonly time: number;
  readonly markerStartedAt: number;
  readonly reducedMotion: boolean;
  readonly worldReadyForHud: boolean;
  readonly atmosphere: StudioNpcAtmosphere;
  readonly activity: StudioVirtualSpacePeer["state"]["activity"];
  readonly interactionRings: boolean;
  readonly routeOverlay: import("phaser").GameObjects.Graphics | null;
  readonly routeOverlayMemory: ReturnType<typeof createStudioRouteOverlayMemory>;
  readonly locateOverlay: import("phaser").GameObjects.Graphics | null;
  readonly transitionVeil: import("phaser").GameObjects.Graphics | null;
  readonly arrivalRing: import("phaser").GameObjects.Graphics | null;
  readonly arrivalRingPoint: StudioVirtualSpacePoint | null;
  readonly zoneVeil: import("phaser").GameObjects.Graphics | null;
  readonly proximityOverlay: import("phaser").GameObjects.Graphics | null;
  readonly steppedTransition: ReturnType<typeof stepStudioZoneTransition>;
  readonly zoneTracker: StudioWorldZoneTracker;
  readonly zoneChanges: StudioZoneChangeTracker;
  readonly onZoneChange?: (change: StudioVirtualSpaceZoneChange) => void;
  readonly tileEffects: readonly StudioTileEffectDefinition[];
  readonly tileTracker: StudioTileEffectRuntimeTracker;
  readonly tileTrackerEffects: readonly StudioTileEffectDefinition[];
  readonly onTileEffectTrigger?: (trigger: StudioTileEffectTrigger) => void;
  readonly livingWorld: StudioLivingWorldRuntime | null;
  readonly objectRuntime: StudioWorldObjectRuntime | null;
  readonly deskPodRuntime: StudioDeskPodRuntime | null;
  readonly decorationRuntime: StudioVirtualDecorationRuntime | null;
  readonly setDressingRuntime: StudioVirtualSetDressingRuntime | null;
}

export function updateStudioPhaserOverlaysAndZone(params: UpdateStudioPhaserOverlaysParams): {
  readonly zone: ReturnType<typeof resolveStudioWorldZonePresence>;
  readonly tileTracker: StudioTileEffectRuntimeTracker;
  readonly tileTrackerEffects: readonly StudioTileEffectDefinition[];
} {
  const {
    scene,
    manifest,
    parent,
    artProfile,
    currentPoint,
    path,
    portals,
    peers,
    bridge,
    feelSpeed,
    speed,
    time,
    markerStartedAt,
    reducedMotion,
    worldReadyForHud,
    atmosphere,
    activity,
    interactionRings,
    routeOverlay,
    routeOverlayMemory,
    locateOverlay,
    transitionVeil,
    arrivalRing,
    arrivalRingPoint,
    zoneVeil,
    proximityOverlay,
    steppedTransition,
    zoneTracker,
    zoneChanges,
    onZoneChange,
    tileEffects,
    onTileEffectTrigger,
    livingWorld,
    objectRuntime,
    deskPodRuntime,
    decorationRuntime,
    setDressingRuntime,
  } = params;

  if (routeOverlay) {
    drawStudioRouteOverlay(routeOverlay, {
      current: currentPoint,
      path,
      moving: feelSpeed > 5,
      now: time,
      wallNow: Date.now(),
      markerStartedAt,
      reducedMotion,
      portals,
      memory: routeOverlayMemory,
      projectPoint: (point) => studioProjectTownPoint(manifest, point),
    });
  }
  if (locateOverlay) {
    const locateId = bridge.getLocateTarget();
    const locateVisual = locateId ? peers.get(locateId) : undefined;
    const locatePoint = locateVisual ? { x: locateVisual.targetX, y: locateVisual.targetY } : bridge.getLocatePoint();
    const camera = scene.cameras.main;
    drawStudioLocateOverlay(locateOverlay, buildStudioLocateGuide({
      self: currentPoint,
      target: locatePoint,
      cameraCenter: { x: camera.scrollX + camera.width / 2, y: camera.scrollY + camera.height / 2 },
      viewWidth: camera.width / camera.zoom,
      viewHeight: camera.height / camera.zoom,
    }), currentPoint, time, reducedMotion);
  }
  drawStudioZoneTransitionOverlay({
    veil: transitionVeil,
    ring: arrivalRing,
    frame: steppedTransition.frame,
    width: scene.cameras.main.width,
    height: scene.cameras.main.height,
    arrivalGround: arrivalRingPoint ? studioProjectTownPoint(manifest, arrivalRingPoint) : null,
  });
  const zone = resolveStudioWorldZonePresence(zoneTracker, manifest, currentPoint, reducedMotion);
  drawStudioZoneSeparationVeil({
    graphics: zoneVeil,
    rect: zone.separated ? zone.rect : null,
    alpha: artProfile.key === "neon" ? 0.18 : reducedMotion ? 0.22 : 0.28,
    worldWidth: manifest.width,
    worldHeight: manifest.height,
  });
  const zoneChange = worldReadyForHud ? zoneChanges.next(currentPoint) : null;
  if (zoneChange) onZoneChange?.(zoneChange);

  let { tileTracker, tileTrackerEffects } = params;
  if (worldReadyForHud) {
    if (tileEffects !== tileTrackerEffects) {
      tileTrackerEffects = tileEffects;
      tileTracker = new StudioTileEffectRuntimeTracker({ effects: tileTrackerEffects, officeZones: manifest.zones ?? [] });
    }
    const tileStep = tileTracker.next(currentPoint, { reducedMotion });
    if (tileStep.zoneEntryParticle) livingWorld?.triggerZoneEntryParticles(tileStep.zoneEntryParticle, currentPoint);
    if (tileStep.trigger) onTileEffectTrigger?.(tileStep.trigger);
  }
  parent.dataset.zoneId = zone.zoneId ?? "";
  parent.dataset.zoneSeparated = String(zone.separated);
  parent.dataset.zoneAnnounced = String(zone.announce);

  proximityOverlay?.clear();
  if (proximityOverlay && atmosphere !== "focus" && activity !== "focused" && activity !== "away") {
    drawStudioProximityOverlay(proximityOverlay, manifest, currentPoint, peers, interactionRings);
  }
  objectRuntime?.update(time, currentPoint);
  deskPodRuntime?.update([
    { point: currentPoint, focused: activity === "focused" },
    ...[...peers].map(([, peer]) => ({ point: { x: peer.targetX, y: peer.targetY }, focused: peer.activity === "focused" })),
  ], time, reducedMotion);
  decorationRuntime?.update(time, currentPoint, reducedMotion, speed);
  setDressingRuntime?.update(time, currentPoint, reducedMotion, speed);

  return { zone, tileTracker, tileTrackerEffects };
}

export interface UpdateStudioPhaserAmbienceParams {
  readonly scene: import("phaser").Scene;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly time: number;
  readonly deltaMs: number;
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly speed: number;
  readonly reducedMotion: boolean;
  readonly qualityProfile: ReturnType<typeof studioVirtualQualityProfile>;
  readonly effectLevel: StudioVirtualExperiencePreference["effectLevel"];
  readonly environment: StudioVirtualEnvironmentPreference;
  readonly presentationMode: StudioVirtualDecorationState["presentationMode"];
  readonly hasCampusRuntime: boolean;
  readonly livingWorld: StudioLivingWorldRuntime | null;
  readonly ambienceRender: StudioVirtualAmbienceRenderRuntime | null;
  readonly lightRender: StudioVirtualLightRenderRuntime | null;
}

export function updateStudioPhaserAmbienceAndLighting(params: UpdateStudioPhaserAmbienceParams): void {
  const {
    scene,
    bridge,
    time,
    deltaMs,
    currentPoint,
    speed,
    reducedMotion,
    qualityProfile,
    effectLevel,
    environment,
    presentationMode,
    hasCampusRuntime,
    livingWorld,
    ambienceRender,
    lightRender,
  } = params;
  const environmentEffect = bridge.consumeEnvironmentEffect();
  if (environmentEffect) livingWorld?.triggerEnvironmentEffect(environmentEffect.effect, environmentEffect.point, time);
  livingWorld?.update(
    time,
    deltaMs,
    currentPoint,
    speed,
    reducedMotion,
    qualityProfile,
    effectLevel,
    environment,
    presentationMode,
  );
  const ambienceCondition = studioAmbienceCondition(environment.weather);
  const ambienceDayNight = bridge.getDayNightCycle();
  ambienceRender?.update({
    time,
    deltaMs,
    viewport: scene.cameras.main.worldView,
    condition: ambienceCondition.particles,
    particleRatio: qualityProfile.weather ? qualityProfile.particleRatio : 0,
    reducedMotion,
    patrolWeather: ambienceCondition.patrol,
    timeOfDay: ambienceDayNight.enabled
      ? studioDayNightTimeOfDay(ambienceDayNight.now, ambienceDayNight.startMs, ambienceDayNight.cycleMs)
      : null,
    players: [currentPoint],
    ambientActorsEnabled: !hasCampusRuntime && qualityProfile.ambientActors,
  });
  const lightFraction = ambienceDayNight.enabled
    ? studioDayNightTimeOfDay(ambienceDayNight.now, ambienceDayNight.startMs, ambienceDayNight.cycleMs)
    : studioLightRenderRealTimeOfDay(new Date());
  const lightModulation = studioDayNightModulationAt(lightFraction);
  lightRender?.update({
    time,
    fixtures: bridge.getLightFixtures(),
    ambientLevel: studioBuildingLifeAmbienceAt(lightFraction).ambient,
    neonGlow: lightModulation.neonGlow,
    focus: { x: scene.cameras.main.worldView.centerX, y: scene.cameras.main.worldView.centerY },
    dynamicLights: qualityProfile.dynamicLights,
    particleRatio: qualityProfile.particleRatio,
    reducedMotion,
  });
}

export function updateStudioPhaserCampusFrame(params: {
  readonly campusRuntime: StudioCampusRuntime | null;
  readonly campusFrame: StudioCampusRuntimeFrame | null;
  readonly horizonArtwork: import("phaser").GameObjects.Image | null;
  readonly lastSkyTintPhase: string | null;
  readonly time: number;
  readonly reducedMotion: boolean;
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly dayPhasePreference: StudioVirtualEnvironmentPreference["dayPhase"];
  readonly qualityProfile: ReturnType<typeof studioVirtualQualityProfile>;
}): string | null {
  const {
    campusRuntime,
    campusFrame,
    horizonArtwork,
    time,
    reducedMotion,
    currentPoint,
    dayPhasePreference,
    qualityProfile,
  } = params;
  let lastSkyTintPhase = params.lastSkyTintPhase;
  if (campusRuntime && campusFrame) {
    campusFrame.time = time;
    campusFrame.reducedMotion = reducedMotion;
    campusFrame.playerX = currentPoint.x;
    campusFrame.playerY = currentPoint.y;
    campusFrame.phase = dayPhasePreference === "auto" ? studioVirtualDayPhase(time) : dayPhasePreference;
    if (horizonArtwork && lastSkyTintPhase !== campusFrame.phase) {
      lastSkyTintPhase = campusFrame.phase;
      horizonArtwork.setTint(studioBuildingSkyTint(campusFrame.phase));
    }
    campusFrame.quality = qualityProfile;
    campusRuntime.update(campusFrame);
  }
  return lastSkyTintPhase;
}
