import { useMemo, useState, type ReactElement, type ReactNode } from "react";

import {
  CSP_3D_ASSET_42_CATEGORIES,
  CSP_3D_FACIAL_21_MORPH_CHANNELS,
  CSP_3D_HEAD_10_FEATURE_POINTS,
  CSP_BUILTIN_CS3O_CHARACTER_OBJECT_SPECS,
  CSP_CROSS_PLATFORM_SPWS_PRESET_SPECS,
  CSP_DEFAULT_POSE_VER2_67_BONES,
  CSP_MENUV3_ALL_18_SVG_ICONS,
  CSP_PWPIECE_SPRITE_ATLAS_ARCHIVES,
  CSP_REMAINING_RESOURCE_ARCHIVE_SPECS,
  CSP_SPWS_DEFAULT_MENU_SHORTCUTS,
  CSP_SPWS_DEFAULT_TOOL_SHORTCUTS,
  CSP_SPWS_SHORTCUT_DB_SUMMARY,
  INITIAL_CSP_WKBRIDGE_BOARD_STATE,
  evaluateCspPwglFoilStampShading,
  evaluateCspShadeDsSixStepToon,
  executeCspWkBridgeTellBoardCommand,
  stepCspParaparaFlipbookState,
  type CspParaparaFlipbookState,
  type CspWkBridgeBoardState,
} from "../../../../../../packages/studio-format-gateway/src/csp-complete-archive-cs3o-foil-shortcuts";
import {
  CSP_BUILTIN_FTO_FONTS,
  CSP_MENUV3_KOREAN_BENTO_ITEMS,
  CSP_PW_UI_WIDGET_CLASSES,
} from "../../../../../../packages/studio-format-gateway/src/csp-fto-pwui-bento-design";
import {
  CSP_LIP_QUICKLOOK_PLUGIN_SPECS,
  CSP_SKSHAPER_UNICODE_SPEC,
  CSP_SYSTEM_HELPER_APP_MANIFEST,
  CSP_TG_TOS_PLUGIN_SPEC,
   applyCspScanAppLineArtBinarization,
  convertCspTosLegacyToolToSutSpec,
  encodeCspLipQuickLookPreviewSqliteStub,
  extractCspLipQuickLookPreview,
  layoutCspSkShaperMangaVerticalText,
  type CspTosLegacyTonePatternType,
} from "../../../../../../packages/studio-format-gateway/src/csp-lippreview-tos-scan-skshaper";
import {
  executeCspUnifiedFilterPlugIn,
  getCspCompleteInternalizationManifest,
  type CspUnifiedDispatchedFilterId,
} from "./studio-csp-unified-runtime-hub";

function rgb01ToHex(rgb: readonly [number, number, number]): string {
  const c = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

/**
 * 클립스튜디오 네이티브 `PWEditSliderJoint` 위젯(게이지 슬라이더 바 + 인라인 수치 표시 결합 컨트롤)
 */
export function CspPwEditSliderJoint({
  label,
  value,
  min,
  max,
  unit = "%",
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit?: string;
  readonly disabled?: boolean;
  readonly onChange: (nextValue: number) => void;
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-line bg-card px-2 py-1 text-[0.68rem]">
      <span className="min-w-28 font-medium">{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <span className="min-w-12 text-right font-mono text-[0.65rem] text-fg-2">
        {value}
        {unit}
      </span>
    </div>
  );
}

/**
 * 클립스튜디오 네이티브 `PWCheckBoxEnabler` 위젯(체크 상태에 따라 하위 파라미터 그룹 전체를 제어하는 컨테이너)
 */
export function CspPwCheckBoxEnabler({
  label,
  checked,
  onChange,
  children,
}: {
  readonly label: string;
  readonly checked: boolean;
  onChange: (nextChecked: boolean) => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="rounded border border-line bg-card p-2">
      <label className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-medium">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label} (PWCheckBoxEnabler)</span>
      </label>
      <div className={checked ? "opacity-100" : "pointer-events-none opacity-45"}>
        {children}
      </div>
    </div>
  );
}

export interface StudioCspPwuiBentoToonSectionProps {
  readonly toonShadingEnabled: boolean;
  readonly onChangeToonShadingEnabled: (enabled: boolean) => void;
  readonly vividnessPercent: number;
  readonly onChangeVividnessPercent: (value: number) => void;
  readonly lightIntensityPercent: number;
  readonly onChangeLightIntensityPercent: (value: number) => void;
  readonly quantizedLightValue: number;
  readonly appliedSaturationBoost: number;
  readonly shadedHex: string;
  readonly selectedFtoFont: string;
  readonly onChangeSelectedFtoFont: (postScriptName: string) => void;
  readonly verticalBalloonMode: boolean;
  readonly onChangeVerticalBalloonMode: (vertical: boolean) => void;
  readonly onLaunchBentoItem?: (bentoId: string, target: string) => void;
}

export function StudioCspPwuiBentoToonSection({
  toonShadingEnabled,
  onChangeToonShadingEnabled,
  vividnessPercent,
  onChangeVividnessPercent,
  lightIntensityPercent,
  onChangeLightIntensityPercent,
  quantizedLightValue,
  appliedSaturationBoost,
  shadedHex,
  selectedFtoFont,
  onChangeSelectedFtoFont,
  verticalBalloonMode,
  onChangeVerticalBalloonMode,
  onLaunchBentoItem,
}: StudioCspPwuiBentoToonSectionProps): ReactElement {
  return (
    <div
      role="tabpanel"
      id="csp-ux-panel-pwui_bento_3d_toon"
      aria-labelledby="csp-ux-tab-pwui_bento_3d_toon"
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          PWGLCalcVividColor 3D 툰·비비드 음영 셰이더 (46B67EA9)
        </div>
        <CspPwCheckBoxEnabler
          label="4단계 툰 계단화 (PWGLtoonfaultlist)"
          checked={toonShadingEnabled}
          onChange={onChangeToonShadingEnabled}
        >
          <div className="flex flex-col gap-1.5">
            <CspPwEditSliderJoint
              label="비비드 채도 부스트"
              value={vividnessPercent}
              min={0}
              max={800}
              disabled={!toonShadingEnabled}
              onChange={onChangeVividnessPercent}
            />
            <CspPwEditSliderJoint
              label="조명 밝기 (Light)"
              value={lightIntensityPercent}
              min={0}
              max={100}
              disabled={!toonShadingEnabled}
              onChange={onChangeLightIntensityPercent}
            />
          </div>
        </CspPwCheckBoxEnabler>
        <div
          data-testid="csp-pwgl-vivid-readout"
          className="mt-2 flex items-center justify-between rounded bg-card p-1.5 text-[0.65rem]"
        >
          <span>
            양자화 명도: {quantizedLightValue.toFixed(2)} · 채도 가산:{" "}
            {appliedSaturationBoost.toFixed(3)} ({shadedHex.toUpperCase()})
          </span>
          <span
            style={{
              backgroundColor: shadedHex,
              forcedColorAdjust: "none",
            }}
            className="inline-block h-5 w-10 rounded border border-line"
          />
        </div>
      </div>

      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          내장 .fto 만화 서체 5종 &amp; PW* 27종 위젯 카탈로그
        </div>
        <select
          aria-label="내장 .fto 만화 서체 선택"
          value={selectedFtoFont}
          onChange={(e) => onChangeSelectedFtoFont(e.target.value)}
          className="mb-2 w-full rounded border border-line bg-card px-2 py-1 text-[0.68rem]"
        >
          {CSP_BUILTIN_FTO_FONTS.map((f) => (
            <option key={f.assetFileName} value={f.postScriptName}>
              {f.postScriptName} ({f.assetFileName} · VORG 세로조판)
            </option>
          ))}
        </select>
        <label className="mb-2 flex items-center gap-1.5 text-[0.68rem]">
          <input
            type="checkbox"
            checked={verticalBalloonMode}
            onChange={(e) => onChangeVerticalBalloonMode(e.target.checked)}
          />
          <span>세로쓰기 말풍선 조판 (VORG/vhea/vmtx)</span>
        </label>
        <div
          data-testid="csp-fto-pwui-readout"
          className="rounded bg-card p-1.5 text-[0.65rem]"
        >
          서체: <strong>{selectedFtoFont}</strong> (
          {verticalBalloonMode ? "세로조판" : "가로조판"}) · PW* 위젯 클래스:{" "}
          {CSP_PW_UI_WIDGET_CLASSES.length}종 (스튜디오 507 / 심플UX 40 다이얼로그)
        </div>
      </div>

      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          CLIP STUDIO MENUv3 벤토(Bento) 퀵 런처 (9항목 · 18 SVG 벡터)
        </div>
        <div className="grid grid-cols-3 gap-1">
          {CSP_MENUV3_KOREAN_BENTO_ITEMS.map((item) => {
            const svgSpec =
              CSP_MENUV3_ALL_18_SVG_ICONS.find((s) => s.fileName === item.svgIconFileName) ??
              CSP_MENUV3_ALL_18_SVG_ICONS[0]!;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  onLaunchBentoItem?.(item.id, item.targetCommandOrPage)
                }
                className="flex flex-col items-center rounded border border-line bg-card p-1.5 text-center hover:border-accent"
              >
                <svg
                  aria-hidden="true"
                  viewBox={svgSpec.viewBox}
                  className="mb-0.5 h-5 w-5 text-accent"
                >
                  <path fill="currentColor" d={svgSpec.svgPathD} />
                </svg>
                <span className="text-[0.65rem] font-semibold">{item.nameKo}</span>
                <span className="text-[0.58rem] text-fg-2">{item.subLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * 6번째 탭(`cs3o_foil_shortcuts_wkbridge`):
 * `.cs3o` 3D 캐릭터 두상/손 오브젝트 · `PWGLisfoilstamptex` 금박(Foil-Stamp) 셰이더 ·
 * `.spws` 870 메뉴 / 258 도구 단축키 · `4B945704` `PWPiece` 스프라이트 아틀라스 ·
 * `WKBridge.bundle` Ghidra 디컴파일 `_TellBoard` 9종 IPC · `jquery.parapara.js` 플립북 통합 패널
 */
export function StudioCspCompleteArchiveFoilShortcutsSection(): ReactElement {
  const [selectedCs3oFile, setSelectedCs3oFile] = useState<
    "dessindoll_head_ver1.cs3o" | "dessindollLeftHand.cs3o" | "dessindollRightHand.cs3o"
  >("dessindoll_head_ver1.cs3o");
  const [selectedFacialMorph, setSelectedFacialMorph] = useState<string>(
    CSP_3D_FACIAL_21_MORPH_CHANNELS[0],
  );
  const [foilLightAnglePercent, setFoilLightAnglePercent] = useState<number>(65);
  const [shadeDsLightPercent, setShadeDsLightPercent] = useState<number>(72);
  const [selectedToolShortcutKey, setSelectedToolShortcutKey] = useState<string>("P");
  const [wkBridgeState, setWkBridgeState] = useState<CspWkBridgeBoardState>(
    INITIAL_CSP_WKBRIDGE_BOARD_STATE,
  );
  const [flipbookState, setFlipbookState] = useState<CspParaparaFlipbookState>(() => ({
    frameUrls: ["page_01.png", "page_02.png", "page_03.png", "page_04.png"],
    currentFrameIndex: 0,
    intervalMs: 200,
    loop: true,
    isPlaying: false,
  }));

  const foilPreview = useMemo(() => {
    const lx = (foilLightAnglePercent - 50) / 50;
    const res = evaluateCspPwglFoilStampShading({
      baseRgb01: [0.14, 0.15, 0.2],
      maskAlpha3x3: [0.1, 0.4, 0.9, 0.2, 0.85, 1.0, 0.3, 0.9, 1.0],
      bumpNormalXyz: [0.15, 0.12, 0.96],
      lightDirXyz: [lx, 0.35, 0.85],
    });
    return {
      ...res,
      compositeHex: rgb01ToHex(res.foilCompositeRgb01),
    };
  }, [foilLightAnglePercent]);

  const shadeDsPreview = useMemo(() => {
    const res = evaluateCspShadeDsSixStepToon({
      baseRgb01: [0.86, 0.48, 0.38],
      nDotL01: shadeDsLightPercent / 100,
    });
    return {
      ...res,
      shadedHex: rgb01ToHex(res.shadedRgb01),
    };
  }, [shadeDsLightPercent]);

  const activeToolShortcut = useMemo(
    () =>
      CSP_SPWS_DEFAULT_TOOL_SHORTCUTS.find((t) => t.key === selectedToolShortcutKey) ??
      CSP_SPWS_DEFAULT_TOOL_SHORTCUTS[0]!,
    [selectedToolShortcutKey],
  );

  const selectedCs3oSpec = useMemo(
    () =>
      CSP_BUILTIN_CS3O_CHARACTER_OBJECT_SPECS.find(
        (c) => c.fileName === selectedCs3oFile,
      ) ?? CSP_BUILTIN_CS3O_CHARACTER_OBJECT_SPECS[0]!,
    [selectedCs3oFile],
  );

  return (
    <div
      role="tabpanel"
      id="csp-ux-panel-cs3o_foil_shortcuts_wkbridge"
      aria-labelledby="csp-ux-tab-cs3o_foil_shortcuts_wkbridge"
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          .cs3o 3D 캐릭터 두상·손 오브젝트 &amp; 67본·21표정·10특징점
        </div>
        <select
          aria-label=".cs3o 3D 캐릭터 오브젝트 선택"
          value={selectedCs3oFile}
          onChange={(e) =>
            setSelectedCs3oFile(
              e.target.value as
                | "dessindoll_head_ver1.cs3o"
                | "dessindollLeftHand.cs3o"
                | "dessindollRightHand.cs3o",
            )
          }
          className="mb-1.5 w-full rounded border border-line bg-card px-2 py-1 text-[0.68rem]"
        >
          {CSP_BUILTIN_CS3O_CHARACTER_OBJECT_SPECS.map((spec) => (
            <option key={spec.fileName} value={spec.fileName}>
              {spec.fileName} ({(spec.sqliteByteSize / (1024 * 1024)).toFixed(2)}MB ·{" "}
              {spec.catalogId})
            </option>
          ))}
        </select>
        <select
          aria-label="3D 안면 표정·모음 모프 채널 선택"
          value={selectedFacialMorph}
          onChange={(e) => setSelectedFacialMorph(e.target.value)}
          className="mb-1.5 w-full rounded border border-line bg-card px-2 py-1 text-[0.68rem]"
        >
          {CSP_3D_FACIAL_21_MORPH_CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              안면 모프: {ch}
            </option>
          ))}
        </select>
        <div
          data-testid="csp-cs3o-rig-readout"
          className="rounded bg-card p-1.5 text-[0.64rem]"
        >
          <strong>{selectedCs3oSpec.fileName}</strong> · 전신 본:{" "}
          {CSP_DEFAULT_POSE_VER2_67_BONES.length}개 · 안면 특징점:{" "}
          {CSP_3D_HEAD_10_FEATURE_POINTS.length}개 · 3D 카테고리:{" "}
          {CSP_3D_ASSET_42_CATEGORIES.length}종 · 활성 모프: {selectedFacialMorph}
        </div>
      </div>

      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          PWGLisfoilstamptex 금박(Foil) 엠보스·범프 셰이더 &amp; 6단계 shadeDS
        </div>
        <div className="flex flex-col gap-1.5">
          <CspPwEditSliderJoint
            label="금박 광원 각도 (Foil)"
            value={foilLightAnglePercent}
            min={0}
            max={100}
            onChange={setFoilLightAnglePercent}
          />
          <CspPwEditSliderJoint
            label="shadeDS 6단계 조명"
            value={shadeDsLightPercent}
            min={0}
            max={100}
            onChange={setShadeDsLightPercent}
          />
        </div>
        <div
          data-testid="csp-foil-shadeds-readout"
          className="mt-2 flex items-center justify-between gap-2 rounded bg-card p-1.5 text-[0.64rem]"
        >
          <span>
            금박 페더 알파: {(foilPreview.featheredMaskAlpha01 * 100).toFixed(1)}% (
            {foilPreview.compositeHex.toUpperCase()}) · shadeDS Step #{shadeDsPreview.stepIndex + 1}/6
          </span>
          <span className="flex items-center gap-1">
            <span
              style={{
                backgroundColor: foilPreview.compositeHex,
                forcedColorAdjust: "none",
              }}
              className="inline-block h-5 w-7 rounded border border-line"
            />
            <span
              style={{
                backgroundColor: shadeDsPreview.shadedHex,
                forcedColorAdjust: "none",
              }}
              className="inline-block h-5 w-7 rounded border border-line"
            />
          </span>
        </div>
      </div>

      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          .spws 단축키({CSP_SPWS_SHORTCUT_DB_SUMMARY.totalMenuCommandRows}메뉴/
          {CSP_SPWS_SHORTCUT_DB_SUMMARY.totalToolShortcutRows}도구) · WKBridge · 파라파라
        </div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          {CSP_SPWS_DEFAULT_TOOL_SHORTCUTS.slice(0, 10).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSelectedToolShortcutKey(t.key)}
              className={`rounded px-1.5 py-0.5 text-[0.62rem] font-semibold ${
                selectedToolShortcutKey === t.key
                  ? "bg-accent text-fg"
                  : "border border-line bg-card"
              }`}
            >
              [{t.key}] {t.toolNodeId}
            </button>
          ))}
        </div>
        <div className="mb-1.5 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() =>
              setWkBridgeState(
                executeCspWkBridgeTellBoardCommand(
                  wkBridgeState,
                  "jump\thttps://assets.clip-studio.com/ko-kr\tX-CSP:5.1.5",
                ).nextState,
              )
            }
            className="rounded border border-line bg-card px-2 py-0.5 text-[0.62rem]"
          >
            WKBridge jump (ASSETS)
          </button>
          <button
            type="button"
            onClick={() =>
              setWkBridgeState(
                executeCspWkBridgeTellBoardCommand(wkBridgeState, "redraw").nextState,
              )
            }
            className="rounded border border-line bg-card px-2 py-0.5 text-[0.62rem]"
          >
            WKBridge redraw (#{wkBridgeState.redrawCount})
          </button>
          <button
            type="button"
            onClick={() =>
              setFlipbookState((prev) => stepCspParaparaFlipbookState(prev, "next"))
            }
            className="rounded border border-line bg-card px-2 py-0.5 text-[0.62rem]"
          >
            Parapara 페이지 넘김 ({flipbookState.currentFrameIndex + 1}/
            {flipbookState.frameUrls.length})
          </button>
        </div>
        <div
          data-testid="csp-shortcuts-wkbridge-readout"
          className="rounded bg-card p-1.5 text-[0.63rem]"
        >
          단축키 <strong>[{activeToolShortcut.key}]</strong> → {activeToolShortcut.labelKo} (메뉴 기본{" "}
          {CSP_SPWS_DEFAULT_MENU_SHORTCUTS.length}종) · PWPiece 아틀라스{" "}
          {CSP_PWPIECE_SPRITE_ATLAS_ARCHIVES.length}종 · 잔여 아카이브{" "}
          {CSP_REMAINING_RESOURCE_ARCHIVE_SPECS.length}종 · 프리셋{" "}
          {CSP_CROSS_PLATFORM_SPWS_PRESET_SPECS.length}종 · WKBridge URL:{" "}
          <code>{wkBridgeState.currentUrl.slice(0, 36)}</code>
        </div>
      </div>
    </div>
  );
}

const DISPATCHABLE_FILTER_IDS: readonly CspUnifiedDispatchedFilterId[] = [
  "TPPFilmCameraStyle",
  "LineWidth",
  "Sphere",
  "Waveform",
  "Zigzag",
  "GeometricDistortionPanorama",
  "PencilArtFilter",
  "FlowBasedAbstraction",
  "Smoothing",
  "GaussBlur",
  "MotionBlur",
  "RadialBlur",
  "TPPRotationBlur",
  "UnSharpMask",
  "Sharp",
  "SharpStrong",
  "SharpOff",
  "SharpOffStrong",
  "Mosaic",
  "Pinch",
  "LensDistortion",
  "GeometricDistortionFishEye",
  "TPPChromaticAberration",
  "TPPNormalMap",
  "TPReduceNoiseFilter",
  "TPPAddNoise",
  "SimpleWave",
  "Spiral",
  "Dust",
  "PolarCd",
  "PerlinNoise",
  "ColorTransfer",
] as const;

/**
 * 7번째 탭(`lippreview_scan_skshaper_filters`):
 * `LipPreview.qlgenerator` (.clip/.lip QuickLook) · `TGTosPlugIn.cfpi` (.tos 툴셋/톤) ·
 * `scan.app` 원고 스캔 이진화 · `libskshaper.dylib` 세로쓰기(금칙·TCY·루비) · 32종 FilterPlugIn 디스패처
 */
export function StudioCspLipPreviewScanSkShaperFiltersSection(): ReactElement {
  const [lipFormat, setLipFormat] = useState<"clip_csfchunk" | "lip_sqlite3">("clip_csfchunk");
  const [selectedTosTone, setSelectedTosTone] = useState<CspTosLegacyTonePatternType>(
    CSP_TG_TOS_PLUGIN_SPEC.builtInTonePatterns[0],
  );
  const [scanThresholdPercent, setScanThresholdPercent] = useState<number>(55);
  const [verticalTextInput, setVerticalTextInput] = useState<string>(
    "{만화|망가}15화!?（특집）。",
  );
  const [selectedFilterId, setSelectedFilterId] =
    useState<CspUnifiedDispatchedFilterId>("TPPFilmCameraStyle");

  const lipPreviewResult = useMemo(() => {
    const stub = encodeCspLipQuickLookPreviewSqliteStub({
      containerFormat: lipFormat,
      widthPx: 512,
      heightPx: 724,
    });
    return extractCspLipQuickLookPreview(stub);
  }, [lipFormat]);

  const convertedTosSut = useMemo(
    () =>
      convertCspTosLegacyToolToSutSpec({
        kindName: "IllustStudio Pen",
        innerName: "G-Pen Tos",
        brushStyle: "stamp",
        brushSizePx: 14,
        brushSizeMinimumPercent: 25,
        inOutDrawLine: true,
        vectorByTrace: true,
        vectorSmoothPower: 60,
        tonePattern: selectedTosTone,
      }),
    [selectedTosTone],
  );

  const scanBinarizationPreview = useMemo(() => {
    const samplePaper = new Uint8ClampedArray([
      248, 246, 242, 255, 25, 22, 20, 255, 245, 244, 240, 255,
      30, 28, 25, 255, 18, 16, 15, 255, 250, 249, 245, 255,
      246, 245, 240, 255, 28, 26, 24, 255, 249, 248, 244, 255,
    ]);
    return applyCspScanAppLineArtBinarization(samplePaper, 3, 3, {
      threshold01: scanThresholdPercent / 100,
      despeckle3x3: false,
      convertPaperToTransparent: true,
    });
  }, [scanThresholdPercent]);

  const verticalLayout = useMemo(
    () =>
      layoutCspSkShaperMangaVerticalText(verticalTextInput, {
        maxRowsPerColumn: 4,
        fontSizePx: 20,
        enableTateChuYoko: true,
        enableKinsokuShori: true,
      }),
    [verticalTextInput],
  );

  const dispatchedFilterPreview = useMemo(() => {
    const sampleCanvas = new Uint8ClampedArray([
      220, 80, 60, 255, 40, 160, 220, 255, 240, 210, 70, 255, 30, 30, 40, 255,
      50, 190, 120, 255, 250, 110, 150, 255, 90, 70, 210, 255, 200, 200, 210, 255,
      180, 60, 190, 255, 70, 210, 180, 255, 230, 130, 50, 255, 60, 90, 140, 255,
      110, 140, 230, 255, 210, 75, 95, 255, 85, 195, 95, 255, 245, 240, 230, 255,
    ]);
    const out = executeCspUnifiedFilterPlugIn(selectedFilterId, sampleCanvas, 4, 4);
    const hex0 = `#${(out[0] ?? 0).toString(16).padStart(2, "0")}${(out[1] ?? 0)
      .toString(16)
      .padStart(2, "0")}${(out[2] ?? 0).toString(16).padStart(2, "0")}`;
    return {
      firstPixelHex: hex0,
      byteLength: out.byteLength,
      manifest: getCspCompleteInternalizationManifest(),
    };
  }, [selectedFilterId]);

  return (
    <div
      role="tabpanel"
      id="csp-ux-panel-lippreview_scan_skshaper_filters"
      aria-labelledby="csp-ux-tab-lippreview_scan_skshaper_filters"
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
    >
      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          LipPreview.qlgenerator (.clip/.lip) · TGTosPlugIn (.tos) · InitInfo
        </div>
        <div className="mb-1.5 flex gap-1">
          <button
            type="button"
            onClick={() => setLipFormat("clip_csfchunk")}
            className={`rounded px-2 py-0.5 text-[0.65rem] ${
              lipFormat === "clip_csfchunk" ? "bg-accent text-fg" : "border border-line bg-card"
            }`}
          >
            .clip (CSFCHUNK→CHNKSQLi)
          </button>
          <button
            type="button"
            onClick={() => setLipFormat("lip_sqlite3")}
            className={`rounded px-2 py-0.5 text-[0.65rem] ${
              lipFormat === "lip_sqlite3" ? "bg-accent text-fg" : "border border-line bg-card"
            }`}
          >
            .lip (SQLite 3.30.1)
          </button>
        </div>
        <select
          aria-label="TGTosPlugIn 레거시 톤 패턴 선택"
          value={selectedTosTone}
          onChange={(e) => setSelectedTosTone(e.target.value as CspTosLegacyTonePatternType)}
          className="mb-1.5 w-full rounded border border-line bg-card px-2 py-1 text-[0.68rem]"
        >
          {CSP_TG_TOS_PLUGIN_SPEC.builtInTonePatterns.map((pat) => (
            <option key={pat} value={pat}>
              TGTos 톤 패턴: {pat}
            </option>
          ))}
        </select>
        <div
          data-testid="csp-lippreview-tos-readout"
          className="rounded bg-card p-1.5 text-[0.64rem]"
        >
          QuickLook ({CSP_LIP_QUICKLOOK_PLUGIN_SPECS.length}번들):{" "}
          <strong>{lipPreviewResult.containerFormat}</strong> ({lipPreviewResult.previewWidthPx}×
          {lipPreviewResult.previewHeightPx}px) · TGTos→SUT:{" "}
          <strong>{convertedTosSut.mappedToneTextureId}</strong> · 헬퍼 앱:{" "}
          {CSP_SYSTEM_HELPER_APP_MANIFEST.length}종
        </div>
      </div>

      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          scan.app 스캔 선화 이진화 &amp; libskshaper 만화 세로쓰기(금칙·TCY·루비)
        </div>
        <CspPwEditSliderJoint
          label="스캔 선화 임계값 (scan.app)"
          value={scanThresholdPercent}
          min={10}
          max={90}
          onChange={setScanThresholdPercent}
        />
        <input
          type="text"
          aria-label="만화 세로쓰기 대사 입력 (libskshaper)"
          value={verticalTextInput}
          onChange={(e) => setVerticalTextInput(e.target.value)}
          className="my-1.5 w-full rounded border border-line bg-card px-2 py-1 text-[0.68rem]"
        />
        <div
          data-testid="csp-scan-skshaper-readout"
          className="rounded bg-card p-1.5 text-[0.64rem]"
        >
          스캔 선화 잉크: <strong>{scanBinarizationPreview.inkPixelCount}px</strong> / 투명 배경:{" "}
          {scanBinarizationPreview.transparentPaperPixelCount}px · SkShaper (
          {CSP_SKSHAPER_UNICODE_SPEC.libraries.length} dylib): {verticalLayout.columnCount}열 · TCY{" "}
          <strong>{verticalLayout.tateChuYokoCount}개</strong> · 루비{" "}
          <strong>{verticalLayout.rubyAnnotationCount}개</strong> · 금칙조정{" "}
          <strong>{verticalLayout.kinsokuAdjustmentCount}회</strong>
        </div>
      </div>

      <div className="rounded border border-line bg-panel p-2">
        <div className="mb-1.5 font-medium">
          App/PlugIn/PAINT 32종 네이티브 필터 통합 디스패처 (143 Mach-O 완비)
        </div>
        <select
          aria-label="클립스튜디오 네이티브 필터 플러그인 선택"
          value={selectedFilterId}
          onChange={(e) =>
            setSelectedFilterId(e.target.value as CspUnifiedDispatchedFilterId)
          }
          className="mb-1.5 w-full rounded border border-line bg-card px-2 py-1 text-[0.68rem]"
        >
          {DISPATCHABLE_FILTER_IDS.map((fid) => (
            <option key={fid} value={fid}>
              FilterPlugIn: {fid}.bundle
            </option>
          ))}
        </select>
        <div
          data-testid="csp-all-32-filters-readout"
          className="flex items-center justify-between rounded bg-card p-1.5 text-[0.64rem]"
        >
          <span>
            실행 필터: <strong>{selectedFilterId}</strong> ({dispatchedFilterPreview.byteLength}B ·{" "}
            {dispatchedFilterPreview.firstPixelHex.toUpperCase()}) · 총 바이너리:{" "}
            {dispatchedFilterPreview.manifest.totalMachOBinaryCount}개 / 필터{" "}
            {dispatchedFilterPreview.manifest.dispatchedFilterPlugInCount}종
          </span>
          <span
            style={{
              backgroundColor: dispatchedFilterPreview.firstPixelHex,
              forcedColorAdjust: "none",
            }}
            className="inline-block h-5 w-7 rounded border border-line"
          />
        </div>
      </div>
    </div>
  );
}
