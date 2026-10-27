import { useMemo, useState } from "react";
import {
  BIOPHILIC_UX_THEME_PRESETS,
  computeVoiceConeSvgPath,
  createDefaultSpatialCanvasHudState,
  filterSpatialQuickCommands,
  REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER,
  rotateSelfAvatarVoiceCone,
  setSpatialCanvasAtmospherePreset,
  setSpatialCanvasViewMode,
  teleportSelfAvatarToZone,
  toggleFloatingDockControl,
  type BiophilicAtmospherePresetId,
  type SpatialCanvasHudState,
  type SpatialCanvasViewMode,
  type SpatialQuickCommandItem,
} from "./studio-virtual-office-spatial-ux-design-model";

export interface StudioVirtualOfficeSpatialCanvasHudProps {
  readonly onNavigateToTab?: (
    tabId: SpatialQuickCommandItem["targetTabId"],
    statusMessageKo: string,
  ) => void;
}

const SPATIAL_QUICK_COMMANDS_COUNT = 6;

const AVATAR_SPRITE_URLS: Readonly<Record<string, string>> = {
  "creator-self":
    "/assets/virtual-studio/nano-banana-v11/cast/cgi-director-work.webp",
  "creator-line":
    "/assets/virtual-studio/nano-banana-v11/cast/line-artist-work.webp",
  "creator-pd":
    "/assets/virtual-studio/nano-banana-v11/cast/chief-pd-work.webp",
  "agent-sophia":
    "/assets/virtual-studio/nano-banana-v12/cast/story-writer-work.webp",
};

export function StudioVirtualOfficeSpatialCanvasHud({
  onNavigateToTab,
}: StudioVirtualOfficeSpatialCanvasHudProps) {
  const [hudState, setHudState] = useState<SpatialCanvasHudState>(() =>
    createDefaultSpatialCanvasHudState(),
  );
  const [hudToastKo, setHudToastKo] = useState<string>(
    "아이소메트릭 공간 플로어 캔버스 · 구역을 클릭하면 내 아바타가 즉시 텔레포트합니다.",
  );

  const activePreset = useMemo(
    () =>
      BIOPHILIC_UX_THEME_PRESETS.find((p) => p.id === hudState.atmospherePresetId) ??
      BIOPHILIC_UX_THEME_PRESETS[0],
    [hudState.atmospherePresetId],
  );

  const selfAvatar = useMemo(
    () => hudState.avatars.find((a) => a.isSelf) ?? hudState.avatars[0],
    [hudState.avatars],
  );

  const voiceConePath = useMemo(
    () =>
      computeVoiceConeSvgPath({
        x: selfAvatar.x,
        y: selfAvatar.y,
        radiusPx: hudState.dockMegaphoneActive ? 145 : 78,
        headingDeg: selfAvatar.headingDeg,
        spreadDeg: hudState.dockMegaphoneActive ? 110 : 64,
      }),
    [selfAvatar.x, selfAvatar.y, selfAvatar.headingDeg, hudState.dockMegaphoneActive],
  );

  const filteredCommands = useMemo(
    () => filterSpatialQuickCommands(hudState.commandSearchQuery),
    [hudState.commandSearchQuery],
  );

  return (
    <section
      aria-label="REA 역공학 기반 인터랙티브 공간 플로어 레이더 및 글래스모피즘 플로팅 HUD"
      data-testid="studio-virtual-office-spatial-canvas-hud"
      className="space-y-3 rounded-xl border border-line bg-card/90 p-3.5 shadow-sm backdrop-blur-md transition-all duration-200"
    >
      {/* Top UX Control Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${activePreset.badgeClass}`}
            data-testid="spatial-hud-active-theme-badge"
          >
            <span aria-hidden="true">{activePreset.iconSymbol}</span>
            <span>{activePreset.labelKo}</span>
            <span className="tabular-nums opacity-80">({activePreset.colorTempKelvin}K)</span>
          </span>
          <span className="rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] text-fg-2 tabular-nums">
            REA UI 토큰: Blur {REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.backdropBlurCount} · Spring{" "}
            {REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.cubicBezierSpringCount} · Keyframes{" "}
            {REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.keyframeAnimationCount}
          </span>
          <button
            type="button"
            data-testid="spatial-hud-open-practical-workbench-btn"
            onClick={() => {
              onNavigateToTab?.(
                "holistic-master-command",
                "실무 원고 마감 워크벤치 & 8대 가상 스튜디오 엔진을 열었습니다.",
              );
              setHudToastKo("실무 원고 마감 워크벤치 & 가상 스튜디오로 이동했습니다.");
            }}
            className="rounded-md border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent hover:opacity-90"
          >
            🎨 실무 원고 마감 워크벤치 · 가상 스튜디오 열기
          </button>
        </div>

        {/* View Mode & Biophilic Atmosphere Switchers */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["isometric-3d", "🧊 3D 아이소메트릭"],
              ["2d-architectural", "📐 2D 도면 뷰"],
              ["acoustic-heatmap", "🔊 음향 dB 히트맵"],
            ] as const
          ).map(([modeId, labelKo]) => (
            <button
              key={modeId}
              type="button"
              data-testid={`spatial-view-mode-${modeId}`}
              aria-pressed={hudState.viewMode === modeId}
              onClick={() => {
                setHudState((prev) =>
                  setSpatialCanvasViewMode(prev, modeId as SpatialCanvasViewMode),
                );
                setHudToastKo(`공간 플로어 뷰포트를 '${labelKo}' 모드로 전환했습니다.`);
              }}
              className={`rounded-lg border px-2 py-1 text-xs transition ${
                hudState.viewMode === modeId
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-panel text-fg-2 hover:text-fg"
              }`}
            >
              {labelKo}
            </button>
          ))}

          <select
            aria-label="바이오필릭 공간 조명 테마 선택"
            data-testid="spatial-atmosphere-select"
            value={hudState.atmospherePresetId}
            onChange={(e) => {
              const nextId = e.target.value as BiophilicAtmospherePresetId;
              setHudState((prev) => setSpatialCanvasAtmospherePreset(prev, nextId));
              setHudToastKo("바이오필릭 공간 조명 테마를 변경했습니다.");
            }}
            className="rounded-lg border border-line bg-panel px-2 py-1 text-xs"
          >
            {BIOPHILIC_UX_THEME_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.iconSymbol} {preset.labelKo} ({preset.colorTempKelvin}K)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Interactive SVG Spatial Floor Radar Map */}
      <div
        className="relative overflow-hidden rounded-xl border border-line p-2"
        style={{ background: activePreset.canvasGradientCss }}
      >
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-fg-2">
          <span aria-live="polite" data-testid="spatial-hud-toast">
            ✨ {hudToastKo}
          </span>
          <span className="tabular-nums opacity-85">
            내 아바타 좌표: ({selfAvatar.x}, {selfAvatar.y}) · 시선 각도: {selfAvatar.headingDeg}°
          </span>
        </div>

        <svg
          viewBox="0 0 714 280"
          role="img"
          aria-label="툰스튜디오 다층 가상 오피스 실시간 공간 레이더 맵"
          className="h-56 w-full select-none rounded-lg"
          style={{
            transform:
              hudState.viewMode === "isometric-3d"
                ? "perspective(980px) rotateX(10deg)"
                : "none",
            transition: `transform 260ms ${REA_VIRTUAL_OFFICE_UX_TOKEN_LEDGER.canonicalEasingCurve}`,
          }}
        >
          <defs>
            <pattern id="spatial-grid-dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="var(--color-line)" />
            </pattern>
            <radialGradient id="voice-aura-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={activePreset.accentStrokeHex} stopOpacity="0.42" />
              <stop offset="100%" stopColor={activePreset.accentStrokeHex} stopOpacity="0.02" />
            </radialGradient>
          </defs>

          <rect x="0" y="0" width="714" height="280" fill="url(#spatial-grid-dots)" />
          <image
            href="/assets/virtual-studio/nano-banana-v10/studio-theme-floor-panorama.webp"
            x="0"
            y="0"
            width="714"
            height="280"
            preserveAspectRatio="xMidYMid slice"
            opacity="0.22"
            data-testid="spatial-nano-banana-floor-backdrop"
          />

          {/* Clickable Room Zones */}
          {hudState.zones.map((zone) => {
            const isSelected = hudState.selectedZoneId === zone.zoneId;
            return (
              <g
                key={zone.zoneId}
                data-testid={`spatial-canvas-zone-${zone.zoneId}`}
                onClick={() => {
                  setHudState((prev) => teleportSelfAvatarToZone(prev, zone.zoneId));
                  setHudToastKo(`${zone.labelKo} 구역으로 아바타를 텔레포트했습니다.`);
                }}
                className="cursor-pointer"
              >
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.width}
                  height={zone.height}
                  rx={12}
                  fill={
                    hudState.viewMode === "acoustic-heatmap"
                      ? "var(--color-raised)"
                      : "var(--color-panel)"
                  }
                  fillOpacity={
                    hudState.viewMode === "acoustic-heatmap"
                      ? Math.min(0.95, 0.35 + zone.acousticDbLevel / 100)
                      : isSelected
                        ? 0.94
                        : 0.8
                  }
                  stroke={isSelected ? activePreset.accentStrokeHex : "var(--color-line)"}
                  strokeWidth={isSelected ? 2.2 : 1.2}
                  strokeDasharray={zone.soundproofed ? "0" : "5 3"}
                />
                <text
                  x={zone.x + 12}
                  y={zone.y + 22}
                  fill="var(--color-fg)"
                  fontSize="11.5"
                  fontWeight="600"
                >
                  {zone.categoryIcon} {zone.labelKo}
                </text>
                <text x={zone.x + 12} y={zone.y + 40} fill="var(--color-fg-2)" fontSize="10">
                  {zone.locked ? "🔒 노크 필요" : "🔓 즉시 입장"} ·{" "}
                  {zone.soundproofed ? "🛡️ 방음 룸" : "🌊 개방형"} · {zone.acousticDbLevel}dB
                </text>
                <rect
                  x={zone.x + 12}
                  y={zone.y + zone.height - 26}
                  width={Math.min(zone.width - 24, 152)}
                  height={18}
                  rx={5}
                  fill="var(--color-card)"
                  stroke="var(--color-line)"
                />
                <text
                  x={zone.x + 18}
                  y={zone.y + zone.height - 13}
                  fill="var(--color-accent)"
                  fontSize="9.5"
                >
                  💻 {zone.activeDccBadge}
                </text>
              </g>
            );
          })}

          {/* Self Avatar Directional Voice Cone & Proximity Aura */}
          {!hudState.dockMicMuted ? (
            <g data-testid="spatial-voice-cone-svg">
              <circle
                cx={selfAvatar.x}
                cy={selfAvatar.y}
                r={hudState.dockMegaphoneActive ? 110 : 58}
                fill="url(#voice-aura-grad)"
              />
              <path
                d={voiceConePath}
                fill={activePreset.accentStrokeHex}
                fillOpacity="0.26"
                stroke={activePreset.accentStrokeHex}
                strokeWidth="1.4"
              />
            </g>
          ) : null}

          {/* Companion Mascot Follower (WorkAdventure / Gather style trailing pet) */}
          <g
            transform={`translate(${Math.max(24, selfAvatar.x - 34)}, ${Math.min(256, selfAvatar.y + 14)})`}
            data-testid="spatial-companion-mascot-follower"
          >
            <image
              href="/assets/virtual-studio/nano-banana-v12/cast/studio-cat-mascot-work.webp"
              x="-16"
              y="-18"
              width="32"
              height="32"
            />
          </g>

          {/* Avatar Tokens with Nano Banana RGBA Chibi Sprites */}
          {hudState.avatars.map((avatar) => (
            <g
              key={avatar.avatarId}
              transform={`translate(${avatar.x}, ${avatar.y})`}
              data-testid={`spatial-avatar-${avatar.avatarId}`}
            >
              {avatar.speaking ? (
                <circle
                  r="22"
                  fill="none"
                  stroke={activePreset.accentStrokeHex}
                  strokeWidth="1.6"
                  strokeDasharray="3 2"
                />
              ) : null}
              <circle
                r="16"
                fill={avatar.isSelf ? "var(--color-accent)" : "var(--color-raised)"}
                fillOpacity="0.35"
                stroke={avatar.isSelf ? "var(--color-cool)" : "var(--color-line)"}
                strokeWidth="2"
              />
              <image
                href={
                  AVATAR_SPRITE_URLS[avatar.avatarId] ??
                  "/assets/virtual-studio/nano-banana-v11/cast/line-artist-idle.webp"
                }
                x="-18"
                y="-22"
                width="36"
                height="36"
              />
              <text textAnchor="middle" x="14" y="-12" fontSize="11">
                {avatar.statusHatIcon}
              </text>
              <rect
                x="-54"
                y="17"
                width="108"
                height="16"
                rx="6"
                fill="var(--color-card)"
                stroke="var(--color-line)"
              />
              <text
                textAnchor="middle"
                y="28"
                fill="var(--color-fg)"
                fontSize="9.5"
                fontWeight="500"
              >
                {avatar.displayNameKo}
              </text>
            </g>
          ))}
        </svg>

        {/* Floating Glassmorphic Bottom Command Dock (Gather 2.0 / Roam / SoWork style) */}
        <div
          role="toolbar"
          aria-label="가상 오피스 플로팅 퀵 컨트롤 독"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/90 px-3 py-2 text-xs text-fg backdrop-blur-md"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-testid="spatial-dock-mic-btn"
              aria-pressed={!hudState.dockMicMuted}
              onClick={() => {
                setHudState((prev) => toggleFloatingDockControl(prev, "mic"));
                setHudToastKo(
                  hudState.dockMicMuted
                    ? "마이크 음소거를 해제하고 지향성 음성 콘을 활성화했습니다."
                    : "마이크를 음소거했습니다.",
                );
              }}
              className={`rounded-lg border px-2.5 py-1 font-medium transition ${
                !hudState.dockMicMuted
                  ? "border-good bg-good-soft text-good"
                  : "border-bad bg-bad-soft text-bad"
              }`}
            >
              {hudState.dockMicMuted ? "🔇 마이크 꺼짐" : "🎙️ 지향성 마이크 켜짐"}
            </button>

            <button
              type="button"
              data-testid="spatial-dock-rotate-cone-btn"
              onClick={() => {
                setHudState((prev) => rotateSelfAvatarVoiceCone(prev, 30));
                setHudToastKo("내 아바타 시선 및 지향성 음성 콘 방향을 +30° 회전했습니다.");
              }}
              className="rounded-lg border border-line bg-card px-2.5 py-1 hover:border-accent"
            >
              🧭 음성 콘 회전 (+30°)
            </button>

            <button
              type="button"
              data-testid="spatial-dock-megaphone-btn"
              aria-pressed={hudState.dockMegaphoneActive}
              onClick={() => {
                setHudState((prev) => toggleFloatingDockControl(prev, "megaphone"));
                setHudToastKo("전 층 메가폰 브로드캐스트 모드를 토글했습니다.");
              }}
              className={`rounded-lg border px-2.5 py-1 transition ${
                hudState.dockMegaphoneActive
                  ? "border-warn bg-raised font-semibold text-warn"
                  : "border-line bg-card"
              }`}
            >
              📢 {hudState.dockMegaphoneActive ? "메가폰 방송 중" : "메가폰"}
            </button>

            <button
              type="button"
              data-testid="spatial-dock-helmet-btn"
              aria-pressed={hudState.dockFocusHelmetOn}
              onClick={() => {
                setHudState((prev) => toggleFloatingDockControl(prev, "focus-helmet"));
                setHudToastKo("Teemyco 초집중 원고 헬멧(자동 방해금지) 착용 상태를 전환했습니다.");
              }}
              className={`rounded-lg border px-2.5 py-1 transition ${
                hudState.dockFocusHelmetOn
                  ? "border-accent bg-accent-soft font-semibold text-accent"
                  : "border-line bg-card"
              }`}
            >
              ⛑️ {hudState.dockFocusHelmetOn ? "초집중 헬멧 착용 중" : "상태 모자"}
            </button>
          </div>

          <button
            type="button"
            data-testid="spatial-dock-cmdk-btn"
            aria-expanded={hudState.commandPaletteOpen}
            onClick={() =>
              setHudState((prev) => ({
                ...prev,
                commandPaletteOpen: !prev.commandPaletteOpen,
              }))
            }
            className="rounded-lg border border-accent bg-accent-soft px-3 py-1 font-semibold text-accent hover:opacity-90"
          >
            ⌘K 공간 커맨드 런처 ({SPATIAL_QUICK_COMMANDS_COUNT}종)
          </button>
        </div>
      </div>

      {/* Collapsible ⌘K Spatial Command Palette Drawer */}
      {hudState.commandPaletteOpen ? (
        <div
          role="region"
          aria-label="⌘K 공간 커맨드 팔레트"
          data-testid="spatial-cmdk-palette"
          className="space-y-2 rounded-xl border border-accent bg-panel p-3 shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <input
              type="search"
              aria-label="공간 커맨드 검색"
              data-testid="spatial-cmdk-search-input"
              placeholder="이동할 룸, AI 에이전트, 5K 페어링, 그린룸, 워룸 명령 검색..."
              value={hudState.commandSearchQuery}
              onChange={(e) =>
                setHudState((prev) => ({ ...prev, commandSearchQuery: e.target.value }))
              }
              className="flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs"
            />
            <span className="text-[11px] text-fg-2 tabular-nums">
              검색 결과 {filteredCommands.length}건
            </span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCommands.map((cmd) => (
              <button
                key={cmd.commandId}
                type="button"
                data-testid={`spatial-cmdk-item-${cmd.commandId}`}
                onClick={() => {
                  onNavigateToTab?.(
                    cmd.targetTabId,
                    `⌘K 공간 런처 실행: ${cmd.titleKo}`,
                  );
                  setHudState((prev) => ({ ...prev, commandPaletteOpen: false }));
                  setHudToastKo(`⌘K 명령 실행 완료: ${cmd.titleKo}`);
                }}
                className="flex items-center justify-between rounded-lg border border-line bg-card px-2.5 py-2 text-left text-xs transition hover:border-accent"
              >
                <div>
                  <div className="font-semibold">{cmd.titleKo}</div>
                  <div className="text-[10px] text-fg-2">{cmd.categoryKo}</div>
                </div>
                <kbd className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[10px]">
                  {cmd.shortcutLabel}
                </kbd>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
