import { useMemo, useState, type ReactElement } from "react";

import {
  CSP_BRUSH_SHAPE_BFPS_PRESETS,
  applyCspBrushShapePresetToStroke,
  type CspBrushShapePresetId,
} from "../../../../../../packages/studio-format-gateway/src/csp-bfps-cscr-prmi";
import {
  CSP_HAND_SETUP_PEP_PRESETS,
  interpolateCspHandSetupPadPose,
  type CspHandFingerGroup,
} from "../../../../../../packages/studio-format-gateway/src/csp-hand-setup-pad";
import {
  CSP_SPWS_COMMAND_BAR_ITEMS,
  CSP_SPWS_DOCK_PALETTE_KIND_SPECS,
  resolveCspModifierKeyBehavior,
} from "../../../../../../packages/studio-format-gateway/src/csp-tomd-spws-palette-dock";
import {
  CSP_MIX_PALETTE_TOOLS,
  stepCspMixPaletteStroke,
  type CspMixPaletteToolId,
} from "./studio-csp-comprehensive-suite";
import {
  CSP_CMYK_PRESS_INK_SPECS,
  applyCspIccSoftProofAndGamutCheck,
  generateCspAudioLipSyncTrack,
  type CspCmykPressProfileId,
} from "./studio-csp-icc-audio-xpg-engine";
import { computeCspAiliaHanukeEnclosedGapMap } from "./studio-csp-osqp-sharpyuv-ailia-engine";

export type StudioCspUnifiedUxTabId =
  | "command_dock"
  | "color_palettes"
  | "brush_3d_hand"
  | "icc_audio_ailia";

export type StudioCspWorkspacePresetId =
  | "presetMac_1_illustration"
  | "presetMac_2_comic"
  | "presetMac_3_category"
  | "ux_simple_mode";

export interface StudioClipStudioUnifiedUxPanelProps {
  readonly initialTab?: StudioCspUnifiedUxTabId;
  readonly initialWorkspacePreset?: StudioCspWorkspacePresetId;
  readonly onSelectColorHex?: (hex: string) => void;
  readonly onSelectBrushShapePreset?: (presetId: CspBrushShapePresetId) => void;
  readonly onExecuteCommandBarItem?: (command: string) => void;
}

const UX_TABS: readonly { readonly id: StudioCspUnifiedUxTabId; readonly labelKo: string }[] = [
  { id: "command_dock", labelKo: "커맨드 바·도킹·수식키 (.spws/.tomd)" },
  { id: "color_palettes", labelKo: "중간색·근사색·색 혼합 팔레트" },
  { id: "brush_3d_hand", labelKo: "브러시 모양(.bfps)·3D 핸드 셋업" },
  { id: "icc_audio_ailia", labelKo: "ICC CMYK 프루프·립싱크·선화 틈새" },
] as const;

const WORKSPACE_PRESETS: readonly {
  readonly id: StudioCspWorkspacePresetId;
  readonly labelKo: string;
  readonly badgeKo: string;
}[] = [
  { id: "presetMac_1_illustration", labelKo: "일러스트 (presetMac_1.spws)", badgeKo: "스튜디오 28팔레트" },
  { id: "presetMac_2_comic", labelKo: "코믹·웹툰 (presetMac_2.spws)", badgeKo: "만화·톤·페이지 특화" },
  { id: "presetMac_3_category", labelKo: "카테고리별 도킹 (presetMac_3.spws)", badgeKo: "다열 탭 도크" },
  { id: "ux_simple_mode", labelKo: "심플 모드 UX (UXEditImageTool.todb)", badgeKo: "136노드 슬림 UI" },
] as const;

const FINGER_GROUPS: readonly { readonly id: CspHandFingerGroup; readonly labelKo: string }[] = [
  { id: "thumb", labelKo: "엄지" },
  { id: "index", labelKo: "검지" },
  { id: "middle", labelKo: "중지" },
  { id: "ring", labelKo: "약지" },
  { id: "pinky", labelKo: "소지" },
] as const;

function parseHexToRgb255(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "").padEnd(6, "0");
  return [
    Number.parseInt(clean.slice(0, 2), 16) || 0,
    Number.parseInt(clean.slice(2, 4), 16) || 0,
    Number.parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function rgb255ToHex(r: number, g: number, b: number): string {
  const clamp = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function buildBilinearIntermediateColorGrid(
  topLeftHex: string,
  topRightHex: string,
  bottomLeftHex: string,
  bottomRightHex: string,
  gridSize = 5,
): readonly string[] {
  const tl = parseHexToRgb255(topLeftHex);
  const tr = parseHexToRgb255(topRightHex);
  const bl = parseHexToRgb255(bottomLeftHex);
  const br = parseHexToRgb255(bottomRightHex);
  const cells: string[] = [];

  for (let row = 0; row < gridSize; row += 1) {
    const v = gridSize > 1 ? row / (gridSize - 1) : 0;
    for (let col = 0; col < gridSize; col += 1) {
      const u = gridSize > 1 ? col / (gridSize - 1) : 0;
      const r = (1 - u) * (1 - v) * tl[0] + u * (1 - v) * tr[0] + (1 - u) * v * bl[0] + u * v * br[0];
      const g = (1 - u) * (1 - v) * tl[1] + u * (1 - v) * tr[1] + (1 - u) * v * bl[1] + u * v * br[1];
      const b = (1 - u) * (1 - v) * tl[2] + u * (1 - v) * tr[2] + (1 - u) * v * bl[2] + u * v * br[2];
      cells.push(rgb255ToHex(r, g, b));
    }
  }
  return cells;
}

function buildApproximateColorGrid(baseHex: string, gridSize = 5): readonly string[] {
  const [baseR, baseG, baseB] = parseHexToRgb255(baseHex);
  const cells: string[] = [];
  const half = Math.floor(gridSize / 2);

  for (let row = 0; row < gridSize; row += 1) {
    const lumShift = (half - row) * 18;
    for (let col = 0; col < gridSize; col += 1) {
      const warmCoolShift = (col - half) * 16;
      cells.push(
        rgb255ToHex(baseR + lumShift + warmCoolShift, baseG + lumShift, baseB + lumShift - warmCoolShift),
      );
    }
  }
  return cells;
}

export function StudioClipStudioUnifiedUxPanel({
  initialTab = "command_dock",
  initialWorkspacePreset = "presetMac_1_illustration",
  onSelectColorHex,
  onSelectBrushShapePreset,
  onExecuteCommandBarItem,
}: StudioClipStudioUnifiedUxPanelProps): ReactElement {
  const [activeTab, setActiveTab] = useState<StudioCspUnifiedUxTabId>(initialTab);
  const [workspacePreset, setWorkspacePreset] =
    useState<StudioCspWorkspacePresetId>(initialWorkspacePreset);
  const [lastExecutedCommand, setLastExecutedCommand] = useState<string>("filesave");

  const [shiftKey, setShiftKey] = useState<boolean>(false);
  const [ctrlOrMetaKey, setCtrlOrMetaKey] = useState<boolean>(false);
  const [altKey, setAltKey] = useState<boolean>(false);
  const [spaceKey, setSpaceKey] = useState<boolean>(false);
  const [stylusTailEraser, setStylusTailEraser] = useState<boolean>(false);

  const [cornerTl, setCornerTl] = useState<string>("#ff3b5c");
  const [cornerTr, setCornerTr] = useState<string>("#2ec4b6");
  const [cornerBl, setCornerBl] = useState<string>("#ffbe0b");
  const [cornerBr, setCornerBr] = useState<string>("#3a86ff");
  const [activeColorHex, setActiveColorHex] = useState<string>("#ff3b5c");
  const [mixToolId, setMixToolId] = useState<CspMixPaletteToolId>("mix-brush");
  const [mixPadHex, setMixPadHex] = useState<string>("#8f68a8");

  const [selectedBrushPresetId, setSelectedBrushPresetId] =
    useState<CspBrushShapePresetId>("real_g_pen");
  const [handSpreadX01, setHandSpreadX01] = useState<number>(0.5);
  const [handFistY01, setHandFistY01] = useState<number>(0.25);
  const [handFistPresetId, setHandFistPresetId] = useState<"gu00" | "gu01" | "gu02" | "gu03">("gu00");
  const [handSide, setHandSide] = useState<"left" | "right">("left");
  const [lockedFingerSet, setLockedFingerSet] = useState<ReadonlySet<CspHandFingerGroup>>(() => new Set());

  const [cmykProfileId, setCmykProfileId] =
    useState<CspCmykPressProfileId>("JapanColor2001Coated");
  const [highlightOutOfGamut, setHighlightOutOfGamut] = useState<boolean>(true);

  const resolvedModifier = useMemo(
    () =>
      resolveCspModifierKeyBehavior({
        shiftKey,
        ctrlOrMetaKey,
        altKey,
        spaceKey,
        stylusTailEraser,
      }),
    [shiftKey, ctrlOrMetaKey, altKey, spaceKey, stylusTailEraser],
  );

  const intermediateGrid = useMemo(
    () => buildBilinearIntermediateColorGrid(cornerTl, cornerTr, cornerBl, cornerBr, 5),
    [cornerTl, cornerTr, cornerBl, cornerBr],
  );

  const approximateGrid = useMemo(
    () => buildApproximateColorGrid(activeColorHex, 5),
    [activeColorHex],
  );

  const brushProjection = useMemo(
    () => applyCspBrushShapePresetToStroke({ presetId: selectedBrushPresetId }),
    [selectedBrushPresetId],
  );

  const handPoseResult = useMemo(() => {
    const lockedFingers: Partial<Record<CspHandFingerGroup, readonly [number, number, number, number]>> = {};
    for (const group of lockedFingerSet) {
      lockedFingers[group] = [1, 0, 0, 0];
    }
    return interpolateCspHandSetupPadPose({
      spreadX01: handSpreadX01,
      fistY01: handFistY01,
      fistPresetId: handFistPresetId,
      handSide,
      lockedFingers,
    });
  }, [handSpreadX01, handFistY01, handFistPresetId, handSide, lockedFingerSet]);

  const iccProofSample = useMemo(() => {
    const [r, g, b] = parseHexToRgb255(activeColorHex);
    const sampleBytes = new Uint8ClampedArray([
      r, g, b, 255, 0, 255, 140, 255, 240, 30, 180, 255, 45, 90, 160, 255,
    ]);
    return applyCspIccSoftProofAndGamutCheck({
      rgbaBytes: sampleBytes,
      cmykProfileId,
      highlightOutOfGamut,
    });
  }, [activeColorHex, cmykProfileId, highlightOutOfGamut]);

  const lipSyncSampleCues = useMemo(() => {
    const sampleRateHz = 22050;
    const monoPcm = new Float32Array(sampleRateHz);
    for (let i = 0; i < monoPcm.length; i += 1) {
      const t = i / sampleRateHz;
      const env = Math.sin(Math.min(Math.PI, t * Math.PI * 2));
      monoPcm[i] = Math.sin(2 * Math.PI * 520 * t) * Math.max(0, env) * 0.65;
    }
    return generateCspAudioLipSyncTrack({
      clips: [
        {
          clipId: "dialogue-01",
          startFrame: 0,
          volumeGain01: 1.0,
          pitchRatio: 1.0,
          sampleRateHz,
          monoPcmSamples: monoPcm,
        },
      ],
      startFrame: 0,
      endFrame: 5,
      fps: 12,
    });
  }, []);

  const hanukeInspectSummary = useMemo(() => {
    const lineArt = new Uint8Array([255, 255, 255, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 255]);
    const flatFill = new Uint8Array([0, 0, 0, 0, 0, 200, 0, 0, 0, 0, 200, 0, 0, 0, 0, 0]);
    return computeCspAiliaHanukeEnclosedGapMap({
      lineAlphaBytes: lineArt,
      fillAlphaBytes: flatFill,
      width: 4,
      height: 4,
    });
  }, []);

  const handlePickSwatch = (hex: string): void => {
    setActiveColorHex(hex);
    onSelectColorHex?.(hex);
  };

  const handleMixStroke = (): void => {
    const [dr, dg, db] = parseHexToRgb255(activeColorHex);
    const [cr, cg, cb] = parseHexToRgb255(mixPadHex);
    const res = stepCspMixPaletteStroke({
      toolId: mixToolId,
      activeDrawingColor: { r: dr / 255, g: dg / 255, b: db / 255, a: 1 },
      carriedBrushReservoirColor: { r: dr / 255, g: dg / 255, b: db / 255, a: 1 },
      canvasSampleColor: { r: cr / 255, g: cg / 255, b: cb / 255, a: 1 },
      pressure01: 0.8,
    });
    const nextHex = rgb255ToHex(
      res.nextCanvasColor.r * 255,
      res.nextCanvasColor.g * 255,
      res.nextCanvasColor.b * 255,
    );
    setMixPadHex(nextHex);
    if (mixToolId === "mix-eyedropper") {
      handlePickSwatch(nextHex);
    }
  };

  const toggleFingerLock = (finger: CspHandFingerGroup): void => {
    setLockedFingerSet((prev) => {
      const next = new Set(prev);
      if (next.has(finger)) {
        next.delete(finger);
      } else {
        next.add(finger);
      }
      return next;
    });
  };

  return (
    <section
      aria-label="클립스튜디오 통합 UI/UX 워크스페이스 및 팔레트 도크"
      className="flex flex-col gap-3 rounded-lg border border-line bg-card p-3 text-xs text-fg"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div>
          <h2 className="text-sm font-semibold">
            클립스튜디오 5.1.5 통합 UI/UX 도크 &amp; 네이티브 팔레트 허브
          </h2>
          <p className="text-[0.68rem] text-fg-2">
            .spws 28종 팔레트 도크 · 21종 커맨드 바 · .tomd 수식키 · 중간색/근사색/색 혼합 · .bfps 14종 · 3D 핸드 패드 · ICC CMYK
          </p>
        </div>
        <span className="rounded bg-accent/15 px-2 py-0.5 text-[0.65rem] font-medium text-accent">
          활성 색: {activeColorHex.toUpperCase()}
        </span>
      </header>

      <div
        role="tablist"
        aria-label="클립스튜디오 통합 UX 카테고리 탭"
        className="flex flex-wrap gap-1 border-b border-line pb-2"
      >
        {UX_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`csp-ux-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`csp-ux-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded px-2.5 py-1 text-[0.7rem] font-medium transition ${
                selected ? "bg-accent text-fg" : "bg-panel text-fg hover:bg-accent/10"
              }`}
            >
              {tab.labelKo}
            </button>
          );
        })}
      </div>

      {activeTab === "command_dock" && (
        <div
          role="tabpanel"
          id="csp-ux-panel-command_dock"
          aria-labelledby="csp-ux-tab-command_dock"
          className="flex flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="csp-workspace-preset-select" className="font-medium">
              워크스페이스 레이아웃 (.spws):
            </label>
            <select
              id="csp-workspace-preset-select"
              value={workspacePreset}
              onChange={(e) => setWorkspacePreset(e.target.value as StudioCspWorkspacePresetId)}
              className="rounded border border-line bg-panel px-2 py-1 text-[0.7rem]"
            >
              {WORKSPACE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.labelKo} ({preset.badgeKo})
                </option>
              ))}
            </select>
            <span className="text-[0.68rem] text-fg-2">
              도킹 팔레트 {CSP_SPWS_DOCK_PALETTE_KIND_SPECS.length}종 · 커맨드 바{" "}
              {CSP_SPWS_COMMAND_BAR_ITEMS.length}항목
            </span>
          </div>

          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-medium">상단 커맨드 바 (workspacetoolbaritem 21종)</span>
              <span className="text-[0.65rem] text-fg-2">
                최근 실행: <code>{lastExecutedCommand}</code>
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {CSP_SPWS_COMMAND_BAR_ITEMS.map((item) => (
                <button
                  key={item.pwId}
                  type="button"
                  onClick={() => {
                    setLastExecutedCommand(item.command);
                    onExecuteCommandBarItem?.(item.command);
                  }}
                  className="rounded border border-line bg-card px-2 py-0.5 text-[0.65rem] hover:border-accent"
                >
                  {item.labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 font-medium">
              수식 키 임시 도구 전환 시뮬레이터 (DefaultToolModifyKey.tomd / UXToolModifyKey.tomd)
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={shiftKey} onChange={(e) => setShiftKey(e.target.checked)} />
                <span>Shift</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={ctrlOrMetaKey}
                  onChange={(e) => setCtrlOrMetaKey(e.target.checked)}
                />
                <span>Ctrl / Cmd</span>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={altKey} onChange={(e) => setAltKey(e.target.checked)} />
                <span>Alt / Option</span>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={spaceKey} onChange={(e) => setSpaceKey(e.target.checked)} />
                <span>Space</span>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={stylusTailEraser}
                  onChange={(e) => setStylusTailEraser(e.target.checked)}
                />
                <span>펜 뒷부분 스위치</span>
              </label>
            </div>
            <div
              data-testid="csp-modifier-resolution-readout"
              className="rounded bg-card px-2.5 py-1.5 text-[0.7rem]"
            >
              <strong>{resolvedModifier.labelKo}</strong> → 일시 전환 도구:{" "}
              <span className="font-semibold text-accent">{resolvedModifier.temporaryToolKo}</span> (
              {resolvedModifier.descriptionKo}, flags={resolvedModifier.modifierFlags})
            </div>
          </div>
        </div>
      )}

      {activeTab === "color_palettes" && (
        <div
          role="tabpanel"
          id="csp-ux-panel-color_palettes"
          aria-labelledby="csp-ux-tab-color_palettes"
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 font-medium">중간색 팔레트 (palettekindcolorblend 4코너 5×5)</div>
            <div className="mb-2 flex items-center justify-between gap-1 text-[0.65rem]">
              <button type="button" onClick={() => setCornerTl(activeColorHex)} className="rounded border border-line px-1.5 py-0.5">
                좌상단={cornerTl}
              </button>
              <button type="button" onClick={() => setCornerTr(activeColorHex)} className="rounded border border-line px-1.5 py-0.5">
                우상단={cornerTr}
              </button>
              <button type="button" onClick={() => setCornerBl(activeColorHex)} className="rounded border border-line px-1.5 py-0.5">
                좌하단={cornerBl}
              </button>
              <button type="button" onClick={() => setCornerBr(activeColorHex)} className="rounded border border-line px-1.5 py-0.5">
                우하단={cornerBr}
              </button>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {intermediateGrid.map((hex, idx) => (
                <button
                  key={`blend-${idx}`}
                  type="button"
                  aria-label={`중간색 타일 ${idx + 1} ${hex}`}
                  onClick={() => handlePickSwatch(hex)}
                  style={{ backgroundColor: hex, forcedColorAdjust: "none" }}
                  className="h-6 w-full rounded border border-line"
                />
              ))}
            </div>
          </div>

          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 font-medium">근사색 팔레트 (palettekindcolorguide 5×5)</div>
            <p className="mb-2 text-[0.65rem] text-fg-2">
              기준색 {activeColorHex.toUpperCase()} 중심 명도·온도 근사 그리드
            </p>
            <div className="grid grid-cols-5 gap-1">
              {approximateGrid.map((hex, idx) => (
                <button
                  key={`approx-${idx}`}
                  type="button"
                  aria-label={`근사색 타일 ${idx + 1} ${hex}`}
                  onClick={() => handlePickSwatch(hex)}
                  style={{ backgroundColor: hex, forcedColorAdjust: "none" }}
                  className="h-6 w-full rounded border border-line"
                />
              ))}
            </div>
          </div>

          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 font-medium">색 혼합 팔레트 (MixPaletteTool.todb)</div>
            <div className="mb-2 flex gap-1">
              {CSP_MIX_PALETTE_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setMixToolId(tool.id)}
                  className={`rounded px-2 py-0.5 text-[0.68rem] ${
                    mixToolId === tool.id ? "bg-accent text-fg" : "border border-line bg-card"
                  }`}
                >
                  {tool.nameKo}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div
                data-testid="csp-mix-pad-swatch"
                style={{ backgroundColor: mixPadHex, forcedColorAdjust: "none" }}
                className="h-10 w-16 rounded border border-line"
              />
              <button
                type="button"
                onClick={handleMixStroke}
                className="rounded bg-accent px-2.5 py-1 text-[0.68rem] font-medium text-fg"
              >
                혼합 스트로크 적용 ({mixPadHex.toUpperCase()})
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "brush_3d_hand" && (
        <div
          role="tabpanel"
          id="csp-ux-panel-brush_3d_hand"
          aria-labelledby="csp-ux-tab-brush_3d_hand"
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 font-medium">브러시 모양 프리셋 14종 (BrushPreset.bfps)</div>
            <div className="mb-2 flex flex-wrap gap-1">
              {CSP_BRUSH_SHAPE_BFPS_PRESETS.map((preset) => (
                <button
                  key={preset.presetId}
                  type="button"
                  onClick={() => {
                    setSelectedBrushPresetId(preset.presetId);
                    onSelectBrushShapePreset?.(preset.presetId);
                  }}
                  className={`rounded px-2 py-0.5 text-[0.68rem] ${
                    selectedBrushPresetId === preset.presetId
                      ? "bg-accent text-fg"
                      : "border border-line bg-card"
                  }`}
                >
                  {preset.nodeNameKo}
                </button>
              ))}
            </div>
            <div data-testid="csp-bfps-stroke-readout" className="rounded bg-card p-2 text-[0.68rem]">
              선택 모양: <strong>{brushProjection.preset.nodeNameKo}</strong> · 경도:{" "}
              {brushProjection.preset.brushHardness}% · 스텝 간격:{" "}
              {brushProjection.effectiveStepDistancePx.toFixed(2)}px · 종횡비:{" "}
              {brushProjection.aspectRatio.toFixed(2)}
            </div>
          </div>

          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-medium">3D 핸드 셋업 2D 포즈 패드 (handsetup_*.pep 6종 SLERP)</span>
              <button
                type="button"
                onClick={() => setHandSide((prev) => (prev === "left" ? "right" : "left"))}
                className="rounded border border-line bg-card px-2 py-0.5 text-[0.65rem]"
              >
                손 방향: {handSide === "left" ? "왼손(Left)" : "오른손(Right)"}
              </button>
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {(["gu00", "gu01", "gu02", "gu03"] as const).map((guId) => (
                <button
                  key={guId}
                  type="button"
                  onClick={() => setHandFistPresetId(guId)}
                  className={`rounded px-2 py-0.5 text-[0.65rem] ${
                    handFistPresetId === guId ? "bg-accent text-fg" : "border border-line bg-card"
                  }`}
                >
                  {guId.toUpperCase()} ({CSP_HAND_SETUP_PEP_PRESETS[guId].aliasName})
                </button>
              ))}
            </div>
            <div className="mb-2 flex flex-col gap-1.5 text-[0.68rem]">
              <label className="flex items-center justify-between gap-2">
                <span>가로 벌림 (pa01↔pa00): {Math.round(handSpreadX01 * 100)}%</span>
                <input
                  type="range"
                  aria-label="손가락 가로 벌림"
                  min={0}
                  max={100}
                  value={Math.round(handSpreadX01 * 100)}
                  onChange={(e) => setHandSpreadX01(Number(e.target.value) / 100)}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>세로 주먹 쥐기 ({handFistPresetId}): {Math.round(handFistY01 * 100)}%</span>
                <input
                  type="range"
                  aria-label="손가락 세로 주먹 쥐기"
                  min={0}
                  max={100}
                  value={Math.round(handFistY01 * 100)}
                  onChange={(e) => setHandFistY01(Number(e.target.value) / 100)}
                />
              </label>
            </div>
            <div className="mb-1.5 flex flex-wrap gap-1">
              {FINGER_GROUPS.map((fg) => {
                const locked = lockedFingerSet.has(fg.id);
                return (
                  <button
                    key={fg.id}
                    type="button"
                    onClick={() => toggleFingerLock(fg.id)}
                    className={`rounded px-2 py-0.5 text-[0.65rem] ${
                      locked ? "bg-warn text-fg" : "border border-line bg-card"
                    }`}
                  >
                    {fg.labelKo} {locked ? "잠금" : "자유"}
                  </button>
                );
              })}
            </div>
            <div data-testid="csp-hand-pose-readout" className="rounded bg-card p-1.5 text-[0.65rem]">
              보간 본 수: {Object.keys(handPoseResult.boneQuaternionsWxyz).length}개 · 손 방향:{" "}
              {handPoseResult.handSide} · 주먹 모드: {handPoseResult.fistPresetId}
            </div>
          </div>
        </div>
      )}

      {activeTab === "icc_audio_ailia" && (
        <div
          role="tabpanel"
          id="csp-ux-panel-icc_audio_ailia"
          aria-labelledby="csp-ux-tab-icc_audio_ailia"
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 font-medium">ICC CMYK 소프트 프루프 (IccProfLib_CRT)</div>
            <select
              aria-label="CMYK 인쇄 프로파일 선택"
              value={cmykProfileId}
              onChange={(e) => setCmykProfileId(e.target.value as CspCmykPressProfileId)}
              className="mb-2 w-full rounded border border-line bg-card px-2 py-1 text-[0.68rem]"
            >
              {(Object.keys(CSP_CMYK_PRESS_INK_SPECS) as CspCmykPressProfileId[]).map((id) => (
                <option key={id} value={id}>
                  {id} (총 잉크량 {CSP_CMYK_PRESS_INK_SPECS[id].totalInkLimitPercent}%)
                </option>
              ))}
            </select>
            <label className="mb-2 flex items-center gap-1.5 text-[0.68rem]">
              <input
                type="checkbox"
                checked={highlightOutOfGamut}
                onChange={(e) => setHighlightOutOfGamut(e.target.checked)}
              />
              <span>색역 외(Out-of-Gamut) 경고 표시</span>
            </label>
            <div data-testid="csp-icc-proof-readout" className="rounded bg-card p-1.5 text-[0.65rem]">
              최대 ΔE: {iccProofSample.maxDeltaE.toFixed(2)} · 색역 외 픽셀:{" "}
              {iccProofSample.outOfGamutPixelCount}개
            </div>
          </div>

          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 font-medium">타임라인 오디오 5모음 립싱크 (libAudioUtl.dylib)</div>
            <ul className="space-y-1 text-[0.65rem]">
              {lipSyncSampleCues.map((cue) => (
                <li
                  key={cue.frameIndex}
                  className="flex items-center justify-between rounded bg-card px-2 py-0.5"
                >
                  <span>Frame #{cue.frameIndex}</span>
                  <span>RMS {(cue.rmsLevel01 * 100).toFixed(0)}%</span>
                  <span className="font-semibold text-accent">입모양: {cue.mouthShape}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded border border-line bg-panel p-2">
            <div className="mb-1.5 font-medium">선화 폐영역 칠 누락 감지 (libailia create_hanukemap)</div>
            <div data-testid="csp-hanuke-readout" className="rounded bg-card p-2 text-[0.68rem]">
              감지된 미채움 미세 틈새(hanuke) 픽셀:{" "}
              <strong>{hanukeInspectSummary.detectedGapPixelCount}개</strong>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
