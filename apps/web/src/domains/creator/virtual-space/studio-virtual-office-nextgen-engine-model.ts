/**
 * Next-Gen Virtual Webtoon Studio Engine Simulation Logic (Nano Banana v11 + REA Physics/Audio/UX).
 */

import {
  DEFAULT_STUDIO_COLLIDERS,
  NANO_BANANA_V11_CREATOR_PERSONAS,
  NANO_BANANA_V11_STUDIO_THEMES,
  PIPELINE_STAGE_ORDER,
  STUDIO_LIGHTING_MOODS,
  type CharacterSecondaryMotionFrame,
  type CompanionPetFollowerState,
  type CreatorPersonaPose,
  type NanoBananaCreatorPersonaId,
  type NanoBananaStudioThemeId,
  type NextGenVirtualStudioEngineState,
  type SpatialAudioEvaluation,
  type StudioColliderBox,
  type StudioLightingMoodId,
  type StudioSoundscapeChannelId,
  type WebAudioSynthPingTelemetry,
} from "./studio-virtual-office-nextgen-engine-data";

export * from "./studio-virtual-office-nextgen-engine-data";

export function createInitialNextGenStudioEngineState(): NextGenVirtualStudioEngineState {
  return {
    activeThemeId: "seoul-editorial-hq",
    themes: NANO_BANANA_V11_STUDIO_THEMES,
    activePersonaId: "line-artist",
    activePersonaPose: "work",
    personas: NANO_BANANA_V11_CREATOR_PERSONAS,
    themesAtlasUrl:
      "/assets/virtual-studio/nano-banana-v11/four-studio-themes-atlas.webp",
    castCleanAtlasUrl:
      "/assets/virtual-studio/nano-banana-v11/diverse-creator-cast-clean-atlas.webp",
    v12ThemesAtlasUrl:
      "/assets/virtual-studio/nano-banana-v12/genre-studio-themes-atlas.webp",
    v12CastCleanAtlasUrl:
      "/assets/virtual-studio/nano-banana-v12/specialist-cast-clean-atlas.webp",
    lightingMoodId: "daylight-studio",
    deadlineCrunchFeverEnabled: false,
    physics: {
      x: 192,
      y: 132,
      vx: 0,
      vy: 0,
      facingAngleRad: 0,
      speedPxPerSec: 0,
      ghostModeGKey: false,
      activeProximityObjectId: "collider-desk-c04",
      activeProximityDistancePx: 38,
      cornerSlideEventsCount: 0,
      xKeyTriggeredObjectId: null,
    },
    companionFollower: {
      x: 162,
      y: 152,
      vx: 0,
      vy: 0,
      trailingDistancePx: 36,
      activeSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/studio-cat-mascot-work.webp",
      petNameKo: "나비 & 펜봇 (마스코트 팔로워)",
    },
    waypointPath: [],
    lastSynthesizedAudioPing: null,
    colliders: DEFAULT_STUDIO_COLLIDERS,
    soundscapeChannels: [
      {
        id: "wacom-pen-asmr",
        labelKo: "와콤 프로 펜 사각거림 (Stylus ASMR)",
        descriptionKo: "신티크 펠트심 마찰 대역(2.4kHz~6.8kHz) 핑크노이즈 모듈레이션",
        synthWaveformSummary: "Bandpass PinkNoise 4.2kHz + Stroke Envelope",
        gainPercent: 68,
        muted: false,
      },
      {
        id: "mech-keyboard-thock",
        labelKo: "커스텀 기계식 단축키 타건음 (Thock)",
        descriptionKo: "클립스튜디오 투핸드 단축키 입력 저소음 리니어 스위치 공명",
        synthWaveformSummary: "Lowpass Impulse 320Hz + Keycap Transient",
        gainPercent: 52,
        muted: false,
      },
      {
        id: "espresso-lofi-pad",
        labelKo: "스튜디오 에스프레소 바 & 로파이 패드",
        descriptionKo: "라운지 스팀 밀크 추출음과 따뜻한 재즈 코드 신스 패드",
        synthWaveformSummary: "Warm Rhodes Detune Saw + Vinyl Crackle",
        gainPercent: 58,
        muted: false,
      },
      {
        id: "rooftop-rain-breeze",
        labelKo: "루프탑 빗소리 & 소나무 정원 바람",
        descriptionKo: "한옥 화실 연못 물결 및 테라스 빗방울 바이노럴 앰비언스",
        synthWaveformSummary: "Stereo Decorrelated BrownNoise + Droplet Pluck",
        gainPercent: 36,
        muted: false,
      },
      {
        id: "page-flip-chime",
        labelKo: "원고 컷 승인 차임 & 페이지 넘김",
        descriptionKo: "컷 단계 완료 시 울리는 크리스탈 하모닉 벨 & 종이 질감",
        synthWaveformSummary: "FM Bell 880Hz/1320Hz + Crisp Paper Brush",
        gainPercent: 60,
        muted: false,
      },
    ],
    masterAudioMuted: false,
    cutDesks: [
      {
        deskId: "desk-ep43-c04",
        episodeCode: "EP.43",
        cutNumber: "C04",
        cutTitleKo: "주인공 각성 클로즈업 & 공간 참격 도입부",
        assignedPersonaId: "line-artist",
        stage: "line-art",
        progressPercent: 72,
        x: 142,
        y: 112,
        reviewCommentKo: "펜선 강약 훌륭함 — 참격 궤적 가이드선만 3D팀과 맞추면 완료",
      },
      {
        deskId: "desk-ep43-c19",
        episodeCode: "EP.43",
        cutNumber: "C19",
        cutTitleKo: "황궁 대성당 공중 로우앵글 3점 투시 배경",
        assignedPersonaId: "cgi-director",
        stage: "base-color",
        progressPercent: 84,
        x: 342,
        y: 112,
        reviewCommentKo: "언리얼 볼류메트릭 포그 렌더 패스 추출 완료, 선화 레이어 결합 중",
      },
      {
        deskId: "desk-ep43-c37",
        episodeCode: "EP.43",
        cutNumber: "C37",
        cutTitleKo: "청록 마력 폭발 글로우 & 역광 림라이트 합성",
        assignedPersonaId: "colorist",
        stage: "shading-vfx",
        progressPercent: 91,
        x: 142,
        y: 242,
        reviewCommentKo: "글로우 블렌딩(Add/Glow) 색수차 1.5px 적용 완료 — 최종 검수 대기",
      },
      {
        deskId: "desk-ep43-c52",
        episodeCode: "EP.43",
        cutNumber: "C52",
        cutTitleKo: "43화 엔딩 클리프행어 식자 & 스크롤 여백 감리",
        assignedPersonaId: "chief-pd",
        stage: "typeset-approved",
        progressPercent: 100,
        x: 342,
        y: 242,
        reviewCommentKo: "모바일 가독성 및 말풍선 호흡 최종 승인 (연재 업로드 준비 완료)",
      },
    ],
    selectedCutDeskId: "desk-ep43-c04",
    elapsedSimulationMs: 1200,
  };
}

export function selectNanoBananaStudioTheme(
  state: NextGenVirtualStudioEngineState,
  themeId: NanoBananaStudioThemeId,
): NextGenVirtualStudioEngineState {
  const theme =
    state.themes.find((item) => item.id === themeId) ?? state.themes[0];
  return applyStudioLightingMood(
    {
      ...state,
      activeThemeId: theme.id,
    },
    theme.recommendedLightingId,
  );
}

export function selectNanoBananaCreatorPersona(
  state: NextGenVirtualStudioEngineState,
  personaId: NanoBananaCreatorPersonaId,
  pose: CreatorPersonaPose = state.activePersonaPose,
): NextGenVirtualStudioEngineState {
  const persona =
    state.personas.find((item) => item.id === personaId) ?? state.personas[0];
  return {
    ...state,
    activePersonaId: persona.id,
    activePersonaPose: pose,
    selectedCutDeskId: persona.defaultDeskId,
  };
}

export function applyStudioLightingMood(
  state: NextGenVirtualStudioEngineState,
  lightingMoodId: StudioLightingMoodId,
): NextGenVirtualStudioEngineState {
  const mood =
    STUDIO_LIGHTING_MOODS.find((item) => item.id === lightingMoodId) ??
    STUDIO_LIGHTING_MOODS[1];
  const updatedChannels = state.soundscapeChannels.map((channel) => ({
    ...channel,
    gainPercent: mood.ambientPresetGains[channel.id] ?? channel.gainPercent,
  }));
  return {
    ...state,
    lightingMoodId: mood.id,
    deadlineCrunchFeverEnabled: mood.id === "midnight-crunch-fever",
    soundscapeChannels: updatedChannels,
  };
}

export function toggleGatherGhostModeGKey(
  state: NextGenVirtualStudioEngineState,
): NextGenVirtualStudioEngineState {
  return {
    ...state,
    physics: {
      ...state.physics,
      ghostModeGKey: !state.physics.ghostModeGKey,
    },
  };
}

function intersectsCircleBox(
  cx: number,
  cy: number,
  radius: number,
  box: StudioColliderBox,
): boolean {
  const closestX = Math.max(box.x, Math.min(cx, box.x + box.width));
  const closestY = Math.max(box.y, Math.min(cy, box.y + box.height));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

export function stepAvatarPhysicsTick(
  state: NextGenVirtualStudioEngineState,
  inputVector: { readonly dx: number; readonly dy: number },
  dtMs = 16.67,
): NextGenVirtualStudioEngineState {
  const dt = Math.max(0.004, Math.min(0.1, dtMs / 1000));
  const avatarRadius = 14;
  const maxSpeed = state.physics.ghostModeGKey ? 260 : 200;
  const springAccel = 14;
  const damping = 10;

  const inputMag = Math.hypot(inputVector.dx, inputVector.dy);
  const normDx = inputMag > 0.001 ? inputVector.dx / inputMag : 0;
  const normDy = inputMag > 0.001 ? inputVector.dy / inputMag : 0;

  const targetVx = normDx * maxSpeed;
  const targetVy = normDy * maxSpeed;

  let nextVx =
    state.physics.vx +
    (targetVx - state.physics.vx) * Math.min(1, springAccel * dt);
  let nextVy =
    state.physics.vy +
    (targetVy - state.physics.vy) * Math.min(1, springAccel * dt);

  if (inputMag <= 0.001) {
    nextVx *= Math.max(0, 1 - damping * dt);
    nextVy *= Math.max(0, 1 - damping * dt);
  }

  let candidateX = state.physics.x + nextVx * dt;
  let candidateY = state.physics.y + nextVy * dt;
  let cornerSlideEventsCount = state.physics.cornerSlideEventsCount;

  if (!state.physics.ghostModeGKey) {
    for (const box of state.colliders) {
      if (!box.isSolidObstacle) continue;
      if (intersectsCircleBox(candidateX, state.physics.y, avatarRadius, box)) {
        candidateX = state.physics.x;
        nextVx = 0;
        const boxCenterY = box.y + box.height / 2;
        const slideDirY = state.physics.y < boxCenterY ? -1 : 1;
        candidateY += slideDirY * 3.5;
        cornerSlideEventsCount += 1;
      }
      if (intersectsCircleBox(candidateX, candidateY, avatarRadius, box)) {
        candidateY = state.physics.y;
        nextVy = 0;
        const boxCenterX = box.x + box.width / 2;
        const slideDirX = state.physics.x < boxCenterX ? -1 : 1;
        candidateX += slideDirX * 3.5;
        cornerSlideEventsCount += 1;
      }
    }
  }

  const clampedX = Math.max(20, Math.min(460, Math.round(candidateX * 100) / 100));
  const clampedY = Math.max(20, Math.min(300, Math.round(candidateY * 100) / 100));
  const speedPxPerSec = Math.round(Math.hypot(nextVx, nextVy) * 10) / 10;
  const facingAngleRad =
    speedPxPerSec > 2
      ? Math.atan2(nextVy, nextVx)
      : state.physics.facingAngleRad;

  let nearestId: string | null = null;
  let nearestDist = Number.POSITIVE_INFINITY;
  for (const box of state.colliders) {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const dist = Math.hypot(clampedX - centerX, clampedY - centerY);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestId = box.id;
    }
  }

  const withinInteractRadius = nearestDist <= 78;
  const nextCompanion = stepCompanionPetFollowerSpring(
    clampedX,
    clampedY,
    state.companionFollower,
    dt,
  );

  return {
    ...state,
    elapsedSimulationMs: Math.round(state.elapsedSimulationMs + dtMs),
    companionFollower: nextCompanion,
    physics: {
      ...state.physics,
      x: clampedX,
      y: clampedY,
      vx: Math.round(nextVx * 100) / 100,
      vy: Math.round(nextVy * 100) / 100,
      facingAngleRad: Math.round(facingAngleRad * 1000) / 1000,
      speedPxPerSec,
      activeProximityObjectId: withinInteractRadius ? nearestId : null,
      activeProximityDistancePx: withinInteractRadius
        ? Math.round(nearestDist)
        : null,
      cornerSlideEventsCount,
    },
  };
}

export function stepCompanionPetFollowerSpring(
  leaderX: number,
  leaderY: number,
  follower: CompanionPetFollowerState,
  dtSeconds = 0.032,
): CompanionPetFollowerState {
  const dx = leaderX - follower.x;
  const dy = leaderY - follower.y;
  const dist = Math.hypot(dx, dy);
  const restDist = 32;

  if (dist <= restDist) {
    return {
      ...follower,
      vx: Math.round(follower.vx * 0.6 * 100) / 100,
      vy: Math.round(follower.vy * 0.6 * 100) / 100,
      trailingDistancePx: Math.round(dist * 10) / 10,
      activeSpriteUrl:
        "/assets/virtual-studio/nano-banana-v12/cast/studio-cat-mascot-idle.webp",
    };
  }

  const pullRatio = (dist - restDist) / Math.max(dist, 1);
  const springK = 9.5;
  const stepX = dx * pullRatio * Math.min(1, springK * dtSeconds);
  const stepY = dy * pullRatio * Math.min(1, springK * dtSeconds);
  const nx = Math.round((follower.x + stepX) * 100) / 100;
  const ny = Math.round((follower.y + stepY) * 100) / 100;

  return {
    ...follower,
    x: nx,
    y: ny,
    vx: Math.round((stepX / Math.max(dtSeconds, 0.008)) * 10) / 10,
    vy: Math.round((stepY / Math.max(dtSeconds, 0.008)) * 10) / 10,
    trailingDistancePx: Math.round(Math.hypot(leaderX - nx, leaderY - ny) * 10) / 10,
    activeSpriteUrl:
      "/assets/virtual-studio/nano-banana-v12/cast/studio-cat-mascot-work.webp",
  };
}

export function navigateAvatarClickToWalk(
  state: NextGenVirtualStudioEngineState,
  targetX: number,
  targetY: number,
): NextGenVirtualStudioEngineState {
  const clampedTargetX = Math.max(24, Math.min(456, Math.round(targetX)));
  const clampedTargetY = Math.max(24, Math.min(296, Math.round(targetY)));
  const startX = state.physics.x;
  const startY = state.physics.y;
  const midX = Math.round((startX + clampedTargetX) / 2);
  const midY = Math.round((startY + clampedTargetY) / 2);

  // If midpoint intersects any solid desk collider, route around the central corridor (y=176)
  let detourMidY = midY;
  for (const box of state.colliders) {
    if (box.isSolidObstacle && intersectsCircleBox(midX, midY, 18, box)) {
      detourMidY = midY < 165 ? 168 : 192;
      break;
    }
  }

  const waypoints = [
    { x: startX, y: startY },
    { x: midX, y: detourMidY },
    { x: clampedTargetX, y: clampedTargetY },
  ];

  const updatedCompanion = stepCompanionPetFollowerSpring(
    clampedTargetX,
    clampedTargetY,
    state.companionFollower,
    0.12,
  );

  return {
    ...state,
    waypointPath: waypoints,
    companionFollower: updatedCompanion,
    physics: {
      ...state.physics,
      x: clampedTargetX,
      y: clampedTargetY,
      vx: 0,
      vy: 0,
      speedPxPerSec: 0,
      facingAngleRad:
        Math.round(
          Math.atan2(clampedTargetY - startY, clampedTargetX - startX) * 1000,
        ) / 1000,
    },
  };
}

export function triggerWebAudioSynthesizerPing(
  state: NextGenVirtualStudioEngineState,
  channelId: StudioSoundscapeChannelId,
): NextGenVirtualStudioEngineState {
  const channel =
    state.soundscapeChannels.find((c) => c.id === channelId) ??
    state.soundscapeChannels[0];
  const carrierHzMap: Readonly<Record<StudioSoundscapeChannelId, number>> = {
    "wacom-pen-asmr": 4200,
    "mech-keyboard-thock": 320,
    "espresso-lofi-pad": 440,
    "rooftop-rain-breeze": 680,
    "page-flip-chime": 880,
  };
  const carrierHz = carrierHzMap[channel.id];
  const gainLinear = Math.round((channel.gainPercent / 100) * 100) / 100;

  if (typeof window !== "undefined") {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { readonly webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (typeof AudioCtx === "function") {
      try {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        osc.frequency.value = carrierHz;
        gainNode.gain.value = Math.max(0.01, gainLinear * 0.12);
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } catch {
        // Ignore audio context autoplay restrictions in headless/test environments
      }
    }
  }

  const telemetry: WebAudioSynthPingTelemetry = {
    channelId: channel.id,
    carrierHz,
    durationMs: 80,
    gainLinear,
    statusKo: `${channel.labelKo} (${carrierHz}Hz · 이득 ${Math.round(gainLinear * 100)}%) 실시간 WebAudio 합성 완료`,
  };

  return {
    ...state,
    lastSynthesizedAudioPing: telemetry,
  };
}

export function triggerNearestObjectWithXKey(
  state: NextGenVirtualStudioEngineState,
): NextGenVirtualStudioEngineState {
  const activeColliderId = state.physics.activeProximityObjectId;
  if (!activeColliderId) {
    return state;
  }
  const collider = state.colliders.find((item) => item.id === activeColliderId);
  return {
    ...state,
    selectedCutDeskId: collider?.boundEpisodeCutId ?? state.selectedCutDeskId,
    physics: {
      ...state.physics,
      xKeyTriggeredObjectId: activeColliderId,
    },
  };
}

export function computeCharacterSecondaryMotion(
  elapsedMs: number,
  speedPxPerSec: number,
  pose: CreatorPersonaPose,
): CharacterSecondaryMotionFrame {
  const tSec = elapsedMs / 1000;
  const isMoving = speedPxPerSec > 8;

  const bobOffsetYPx = isMoving
    ? Math.round(Math.sin(tSec * 14) * 3.2 * 100) / 100
    : Math.round(Math.sin(tSec * 2.6) * 1.1 * 100) / 100;

  const breathWave = Math.sin(tSec * 3.1);
  const breathScaleX = Math.round((1 + breathWave * 0.018) * 1000) / 1000;
  const breathScaleY = Math.round((1 - breathWave * 0.018) * 1000) / 1000;

  const stylusTiltDeg =
    pose === "work"
      ? Math.round(Math.sin(tSec * 9.5) * 8.4 * 10) / 10
      : Math.round(Math.sin(tSec * 2.0) * 1.5 * 10) / 10;

  const cyclePos = ((elapsedMs % 3600) + 3600) % 3600;
  const isBlinking = cyclePos >= 3440;

  const motionPhaseLabelKo = isMoving
    ? "서브픽셀 보행 바운스 + 시선 이징"
    : pose === "work"
      ? "타블렛 펜 스트로크 진동 + 호흡 스케일링"
      : "자연 호흡 스쿼시&스트레치 + 주기적 눈깜빡임";

  return {
    bobOffsetYPx,
    breathScaleX,
    breathScaleY,
    stylusTiltDeg,
    isBlinking,
    motionPhaseLabelKo,
  };
}

export function computeSpatialAudioGainAndPan(
  listener: {
    readonly x: number;
    readonly y: number;
    readonly facingAngleRad: number;
  },
  emitter: { readonly x: number; readonly y: number },
  wallBarriersBetween = 0,
): SpatialAudioEvaluation {
  const dx = emitter.x - listener.x;
  const dy = emitter.y - listener.y;
  const distancePx = Math.round(Math.hypot(dx, dy) * 10) / 10;

  const minDistance = 45;
  const maxDistance = 360;

  let rawDistanceGain = 1;
  if (distancePx > minDistance) {
    if (distancePx >= maxDistance) {
      rawDistanceGain = 0;
    } else {
      const normalized =
        (distancePx - minDistance) / (maxDistance - minDistance);
      rawDistanceGain = Math.cos(normalized * (Math.PI / 2)) ** 1.6;
    }
  }

  const angleToEmitter = Math.atan2(dy, dx);
  const angleDiff = Math.atan2(
    Math.sin(angleToEmitter - listener.facingAngleRad),
    Math.cos(angleToEmitter - listener.facingAngleRad),
  );
  const directionalConeGain =
    distancePx < 1
      ? 1
      : 0.65 + 0.35 * ((Math.cos(angleDiff) + 1) / 2);

  const wallAttenuationDb = wallBarriersBetween * -28;
  const wallLinearFactor = 10 ** (wallAttenuationDb / 20);

  const finalGain =
    Math.round(
      Math.max(
        0,
        Math.min(1, rawDistanceGain * directionalConeGain * wallLinearFactor),
      ) * 1000,
    ) / 1000;

  const stereoPan =
    Math.round(Math.max(-1, Math.min(1, dx / 220)) * 100) / 100;

  const audibleStatusKo =
    wallBarriersBetween > 0
      ? `방음벽 차음 적용 (${wallAttenuationDb}dB)`
      : finalGain >= 0.65
        ? "근접 선명 수음 (HD Spatial Zone)"
        : finalGain > 0.05
          ? "거리 비례 자연 감쇠 (Cosine Rolloff)"
          : "가청 반경 외부 (완전 무음 보장)";

  return {
    distancePx,
    rawDistanceGain: Math.round(rawDistanceGain * 1000) / 1000,
    directionalConeGain: Math.round(directionalConeGain * 1000) / 1000,
    wallAttenuationDb,
    finalGain,
    stereoPan,
    audibleStatusKo,
  };
}

export function setSoundscapeChannelGain(
  state: NextGenVirtualStudioEngineState,
  channelId: StudioSoundscapeChannelId,
  gainPercent: number,
): NextGenVirtualStudioEngineState {
  const clamped = Math.max(0, Math.min(100, Math.round(gainPercent)));
  return {
    ...state,
    soundscapeChannels: state.soundscapeChannels.map((ch) =>
      ch.id === channelId ? { ...ch, gainPercent: clamped, muted: clamped === 0 } : ch,
    ),
  };
}

export function approachCutDeskAndInspect(
  state: NextGenVirtualStudioEngineState,
  deskId: string,
): NextGenVirtualStudioEngineState {
  const desk =
    state.cutDesks.find((item) => item.deskId === deskId) ?? state.cutDesks[0];
  const collider = state.colliders.find(
    (item) => item.boundEpisodeCutId === desk.deskId,
  );
  return {
    ...state,
    selectedCutDeskId: desk.deskId,
    activePersonaId: desk.assignedPersonaId,
    activePersonaPose: "work",
    companionFollower: stepCompanionPetFollowerSpring(
      desk.x,
      desk.y + 28,
      state.companionFollower,
      0.12,
    ),
    physics: {
      ...state.physics,
      x: desk.x,
      y: desk.y + 28,
      vx: 0,
      vy: 0,
      speedPxPerSec: 0,
      activeProximityObjectId: collider?.id ?? null,
      activeProximityDistancePx: 24,
      xKeyTriggeredObjectId: collider?.id ?? null,
    },
  };
}

export function advanceDeskEpisodeCutStage(
  state: NextGenVirtualStudioEngineState,
  deskId: string,
): NextGenVirtualStudioEngineState {
  return {
    ...state,
    cutDesks: state.cutDesks.map((desk) => {
      if (desk.deskId !== deskId) return desk;
      const currentIdx = PIPELINE_STAGE_ORDER.indexOf(desk.stage);
      const nextIdx = (currentIdx + 1) % PIPELINE_STAGE_ORDER.length;
      const nextStage = PIPELINE_STAGE_ORDER[nextIdx];
      const nextProgress =
        nextStage === "typeset-approved"
          ? 100
          : Math.min(95, (nextIdx + 1) * 20 + 12);
      return {
        ...desk,
        stage: nextStage,
        progressPercent: nextProgress,
      };
    }),
  };
}
