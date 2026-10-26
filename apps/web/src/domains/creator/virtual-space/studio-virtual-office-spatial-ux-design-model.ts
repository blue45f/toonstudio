export type SpatialCanvasViewMode =
  | "2d-architectural"
  | "isometric-3d"
  | "acoustic-heatmap";

export type BiophilicAtmospherePresetId =
  | "sunlit-greenhouse"
  | "rainy-seoul-loft"
  | "jeju-coastal-terrace"
  | "cyberpunk-neon-den";

export interface ReaExtractedUiUxTokenLedger {
  readonly totalBundlesScanned: number;
  readonly backdropBlurCount: number;
  readonly cubicBezierSpringCount: number;
  readonly gradientLightingCount: number;
  readonly bentoGridTemplateCount: number;
  readonly keyframeAnimationCount: number;
  readonly environmentManifestEvidenceIds: readonly string[];
  readonly canonicalEasingCurve: string;
  readonly canonicalSpringCurve: string;
}

export const REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER: ReaExtractedUiUxTokenLedger = {
  totalBundlesScanned: 35,
  backdropBlurCount: 103,
  cubicBezierSpringCount: 205,
  gradientLightingCount: 29,
  bentoGridTemplateCount: 29,
  keyframeAnimationCount: 346,
  environmentManifestEvidenceIds: [
    "ev_48e079ea22b88f27a08a55439d4b1e68b9146fc07a16d54d35dea1943f4742cf",
    "ev_06532a367e11070f44e4d2819412b8720877863fb4e1b280bea33a006dd7ecd7",
    "ev_069a1cd1a28faacd7e8a9863ad3cb0f10de3d87f55c680d4094d315255473e25",
  ],
  canonicalEasingCurve: "cubic-bezier(0.16, 1, 0.3, 1)",
  canonicalSpringCurve: "cubic-bezier(0.34, 1.56, 0.64, 1)",
};

export interface BiophilicAtmosphereUxPreset {
  readonly id: BiophilicAtmospherePresetId;
  readonly labelKo: string;
  readonly iconSymbol: string;
  readonly colorTempKelvin: number;
  readonly ambientSoundLabelKo: string;
  readonly canvasGradientCss: string;
  readonly accentStrokeHex: string;
  readonly badgeClass: string;
}

export const BIOPHILIC_UX_THEME_PRESETS: readonly BiophilicAtmosphereUxPreset[] = [
  {
    id: "rainy-seoul-loft",
    labelKo: "비 오는 서울 로프트",
    iconSymbol: "🌧️",
    colorTempKelvin: 4200,
    ambientSoundLabelKo: "창가 빗소리 + 로파이 바이닐",
    canvasGradientCss: "linear-gradient(135deg, rgba(15, 23, 42, 0.94) 0%, rgba(30, 41, 59, 0.88) 100%)",
    accentStrokeHex: "#38bdf8",
    badgeClass: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  },
  {
    id: "sunlit-greenhouse",
    labelKo: "햇살 온실 아틀리에",
    iconSymbol: "🌿",
    colorTempKelvin: 5600,
    ambientSoundLabelKo: "온실 새소리 + 산들바람",
    canvasGradientCss: "linear-gradient(135deg, rgba(6, 46, 34, 0.92) 0%, rgba(20, 83, 45, 0.85) 100%)",
    accentStrokeHex: "#34d399",
    badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  },
  {
    id: "jeju-coastal-terrace",
    labelKo: "제주 해안 테라스",
    iconSymbol: "🌊",
    colorTempKelvin: 5000,
    ambientSoundLabelKo: "현무암 파도 소리 + 어쿠스틱 기타",
    canvasGradientCss: "linear-gradient(135deg, rgba(12, 36, 60, 0.93) 0%, rgba(15, 76, 117, 0.86) 100%)",
    accentStrokeHex: "#2dd4bf",
    badgeClass: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  },
  {
    id: "cyberpunk-neon-den",
    labelKo: "네온 야간 작화실",
    iconSymbol: "⚡",
    colorTempKelvin: 3400,
    ambientSoundLabelKo: "신스웨이브 앰비언트 + 타블렛 펜촉음",
    canvasGradientCss: "linear-gradient(135deg, rgba(24, 14, 46, 0.95) 0%, rgba(59, 20, 84, 0.88) 100%)",
    accentStrokeHex: "#c084fc",
    badgeClass: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  },
];

export interface SpatialCanvasRoomZone {
  readonly zoneId: string;
  readonly floorId: "1f" | "2f" | "3f";
  readonly labelKo: string;
  readonly categoryIcon: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly soundproofed: boolean;
  readonly locked: boolean;
  readonly activeDccBadge: string;
  readonly acousticDbLevel: number;
}

export interface SpatialCanvasAvatarNode {
  readonly avatarId: string;
  readonly displayNameKo: string;
  readonly roleBadgeKo: string;
  readonly statusHatIcon: string;
  readonly x: number;
  readonly y: number;
  readonly headingDeg: number;
  readonly speaking: boolean;
  readonly isSelf: boolean;
}

export interface SpatialQuickCommandItem {
  readonly commandId: string;
  readonly shortcutLabel: string;
  readonly titleKo: string;
  readonly categoryKo: "공간이동" | "음향·방송" | "스토리보드·검수" | "AI·자동화";
  readonly targetTabId:
    | "spatial-floors-knock-audio"
    | "ai-agents-memory-mcp"
    | "dcc-presence-aikido-multishare"
    | "host-canvas-pulse-matrix"
    | "pairing-xr-floor-coaching"
    | "stage-sprint-holo-lounge"
    | "warroom-async-stage";
}

export const SPATIAL_QUICK_COMMANDS: readonly SpatialQuickCommandItem[] = [
  {
    commandId: "cmd-teleport-conte-vault",
    shortcutLabel: "⌘1",
    titleKo: "3F 스포일러 보안 콘티실로 즉시 이동 & 노크",
    categoryKo: "공간이동",
    targetTabId: "spatial-floors-knock-audio",
  },
  {
    commandId: "cmd-dispatch-sophia-bot",
    shortcutLabel: "⌘2",
    titleKo: "AI 에이전트 데스크(Sophia)에 식자 무결성 검수 배정",
    categoryKo: "AI·자동화",
    targetTabId: "ai-agents-memory-mcp",
  },
  {
    commandId: "cmd-quad-screen-compare",
    shortcutLabel: "⌘3",
    titleKo: "4화면 동시 공유 비교 그리드 & 레이저 포인터 열기",
    categoryKo: "스토리보드·검수",
    targetTabId: "dcc-presence-aikido-multishare",
  },
  {
    commandId: "cmd-pair-5k-redline",
    shortcutLabel: "⌘5",
    titleKo: "5K 60fps 초저지연 페어 드로잉 & 3D 페데스탈 품평",
    categoryKo: "스토리보드·검수",
    targetTabId: "pairing-xr-floor-coaching",
  },
  {
    commandId: "cmd-greenroom-golive",
    shortcutLabel: "⌘6",
    titleKo: "에어미트 그린룸 백스테이지 점검 & 포모도로 딥스프린트",
    categoryKo: "음향·방송",
    targetTabId: "stage-sprint-holo-lounge",
  },
  {
    commandId: "cmd-warroom-dot-vote",
    shortcutLabel: "⌘7",
    titleKo: "스토리보드 워룸 뷰포트 소환 & 4K60 Go-Live 시어터",
    categoryKo: "스토리보드·검수",
    targetTabId: "warroom-async-stage",
  },
];

export interface SpatialCanvasHudState {
  readonly viewMode: SpatialCanvasViewMode;
  readonly zoomPercent: 80 | 100 | 125;
  readonly atmospherePresetId: BiophilicAtmospherePresetId;
  readonly commandPaletteOpen: boolean;
  readonly commandSearchQuery: string;
  readonly dockMicMuted: boolean;
  readonly dockCamActive: boolean;
  readonly dockScreenShareActive: boolean;
  readonly dockMegaphoneActive: boolean;
  readonly dockFocusHelmetOn: boolean;
  readonly selectedZoneId: string;
  readonly zones: readonly SpatialCanvasRoomZone[];
  readonly avatars: readonly SpatialCanvasAvatarNode[];
}

export function createDefaultSpatialCanvasHudState(): SpatialCanvasHudState {
  return {
    viewMode: "isometric-3d",
    zoomPercent: 100,
    atmospherePresetId: "rainy-seoul-loft",
    commandPaletteOpen: false,
    commandSearchQuery: "",
    dockMicMuted: false,
    dockCamActive: true,
    dockScreenShareActive: true,
    dockMegaphoneActive: false,
    dockFocusHelmetOn: false,
    selectedZoneId: "zone-2f-main-atelier",
    zones: [
      {
        zoneId: "zone-2f-main-atelier",
        floorId: "2f",
        labelKo: "2F 메인 작화·펜선 아틀리에",
        categoryIcon: "✒️",
        x: 24,
        y: 22,
        width: 220,
        height: 132,
        soundproofed: false,
        locked: false,
        activeDccBadge: "Clip Studio Paint EX",
        acousticDbLevel: 48,
      },
      {
        zoneId: "zone-2f-color-booth",
        floorId: "2f",
        labelKo: "2F 채색·조명 후보정 부스",
        categoryIcon: "🎨",
        x: 264,
        y: 22,
        width: 196,
        height: 132,
        soundproofed: true,
        locked: false,
        activeDccBadge: "Photoshop · LUT",
        acousticDbLevel: 36,
      },
      {
        zoneId: "zone-3f-conte-vault",
        floorId: "3f",
        labelKo: "3F 스포일러 보안 콘티 워룸",
        categoryIcon: "🔐",
        x: 480,
        y: 22,
        width: 210,
        height: 132,
        soundproofed: true,
        locked: true,
        activeDccBadge: "Miro · Claap Pin",
        acousticDbLevel: 22,
      },
      {
        zoneId: "zone-1f-golive-stage",
        floorId: "1f",
        labelKo: "1F 타운홀 Go-Live 4K60 시어터",
        categoryIcon: "🎬",
        x: 24,
        y: 170,
        width: 436,
        height: 92,
        soundproofed: false,
        locked: false,
        activeDccBadge: "Stage On-Air · 4K60",
        acousticDbLevel: 64,
      },
      {
        zoneId: "zone-3f-ai-desk",
        floorId: "3f",
        labelKo: "3F AI 에이전트 관제 & 딥스프린트 포드",
        categoryIcon: "🤖",
        x: 480,
        y: 170,
        width: 210,
        height: 92,
        soundproofed: true,
        locked: false,
        activeDccBadge: "Sophia · OpenClaw",
        acousticDbLevel: 18,
      },
    ],
    avatars: [
      {
        avatarId: "creator-self",
        displayNameKo: "수석 배경 아티스트 (나)",
        roleBadgeKo: "BG·3D Lead",
        statusHatIcon: "🎩",
        x: 130,
        y: 92,
        headingDeg: 15,
        speaking: true,
        isSelf: true,
      },
      {
        avatarId: "creator-line",
        displayNameKo: "수석 선화 작가",
        roleBadgeKo: "Line Art",
        statusHatIcon: "🎧",
        x: 192,
        y: 86,
        headingDeg: 180,
        speaking: false,
        isSelf: false,
      },
      {
        avatarId: "creator-pd",
        displayNameKo: "민 프로듀서",
        roleBadgeKo: "Lead PD",
        statusHatIcon: "👑",
        x: 356,
        y: 88,
        headingDeg: -45,
        speaking: true,
        isSelf: false,
      },
      {
        avatarId: "agent-sophia",
        displayNameKo: "Sophia AI 서기",
        roleBadgeKo: "AI Scribe",
        statusHatIcon: "🤖",
        x: 576,
        y: 214,
        headingDeg: 90,
        speaking: false,
        isSelf: false,
      },
    ],
  };
}

export function computeVoiceConeSvgPath(input: {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly headingDeg: number;
  readonly spreadDeg?: number;
}): string {
  const spread = Math.max(15, Math.min(160, input.spreadDeg ?? 68));
  const halfRad = ((spread / 2) * Math.PI) / 180;
  const centerRad = (input.headingDeg * Math.PI) / 180;
  const startAngle = centerRad - halfRad;
  const endAngle = centerRad + halfRad;
  const r = Math.max(12, input.radiusPx);

  const x1 = Math.round((input.x + r * Math.cos(startAngle)) * 10) / 10;
  const y1 = Math.round((input.y + r * Math.sin(startAngle)) * 10) / 10;
  const x2 = Math.round((input.x + r * Math.cos(endAngle)) * 10) / 10;
  const y2 = Math.round((input.y + r * Math.sin(endAngle)) * 10) / 10;
  const largeArcFlag = spread > 180 ? 1 : 0;

  return `M ${input.x} ${input.y} L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
}

export function teleportSelfAvatarToZone(
  state: SpatialCanvasHudState,
  zoneId: string,
): SpatialCanvasHudState {
  const targetZone = state.zones.find((z) => z.zoneId === zoneId);
  if (!targetZone) return state;
  const centerX = Math.round(targetZone.x + targetZone.width * 0.42);
  const centerY = Math.round(targetZone.y + targetZone.height * 0.54);
  return {
    ...state,
    selectedZoneId: zoneId,
    avatars: state.avatars.map((avatar) =>
      avatar.isSelf
        ? {
            ...avatar,
            x: centerX,
            y: centerY,
          }
        : avatar,
    ),
  };
}

export function rotateSelfAvatarVoiceCone(
  state: SpatialCanvasHudState,
  deltaDeg: number,
): SpatialCanvasHudState {
  return {
    ...state,
    avatars: state.avatars.map((avatar) =>
      avatar.isSelf
        ? {
            ...avatar,
            headingDeg: (((avatar.headingDeg + deltaDeg) % 360) + 360) % 360,
          }
        : avatar,
    ),
  };
}

export function setSpatialCanvasViewMode(
  state: SpatialCanvasHudState,
  viewMode: SpatialCanvasViewMode,
): SpatialCanvasHudState {
  return {
    ...state,
    viewMode,
  };
}

export function setSpatialCanvasAtmospherePreset(
  state: SpatialCanvasHudState,
  atmospherePresetId: BiophilicAtmospherePresetId,
): SpatialCanvasHudState {
  return {
    ...state,
    atmospherePresetId,
  };
}

export function toggleFloatingDockControl(
  state: SpatialCanvasHudState,
  control: "mic" | "cam" | "screen" | "megaphone" | "focus-helmet",
): SpatialCanvasHudState {
  switch (control) {
    case "mic":
      return { ...state, dockMicMuted: !state.dockMicMuted };
    case "cam":
      return { ...state, dockCamActive: !state.dockCamActive };
    case "screen":
      return { ...state, dockScreenShareActive: !state.dockScreenShareActive };
    case "megaphone":
      return { ...state, dockMegaphoneActive: !state.dockMegaphoneActive };
    case "focus-helmet":
      return { ...state, dockFocusHelmetOn: !state.dockFocusHelmetOn };
  }
}

export function filterSpatialQuickCommands(
  query: string,
): readonly SpatialQuickCommandItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return SPATIAL_QUICK_COMMANDS;
  return SPATIAL_QUICK_COMMANDS.filter(
    (item) =>
      item.titleKo.toLowerCase().includes(normalized) ||
      item.categoryKo.toLowerCase().includes(normalized) ||
      item.shortcutLabel.toLowerCase().includes(normalized),
  );
}
