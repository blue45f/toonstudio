import { useT } from "@/shared/lib/i18n";
import {
  Box,
  Compass,
  Download,
  Eye,
  Grid,
  Layers,
  Ruler,
  Scissors,
  Sparkles,
  Sun,
} from "lucide-react";
import React, { useId, useMemo, useState } from "react";

import {
  extrudeSketchUpFollowMe,
  extrudeSketchUpPolygonFaceWithHoleCut,
  generateSketchUpLinearArray,
  generateSketchUpRadialArray,
  offsetSketchUpPolygon2D,
  parseSketchUpArrayInput,
  type SketchUpArrayPlacement,
  type SketchUpVec2,
} from "./studio-bg3d-sketchup-direct-modeling";
import {
  clipConstructionLineToBounds,
  createSketchUpDimension3D,
  createSketchUpGuideLine,
  createSketchUpLeaderText3D,
  intersectTrianglesWithSketchUpSectionPlane,
  parseSketchUpProtractorInput,
  type StudioSketchUpSectionPlane3D,
} from "./studio-bg3d-sketchup-guides-sections-dimensions";
import {
  DEFAULT_SKETCHUP_SHADOW_INFO,
  applySketchUpShadowSettingsToLighting,
  exportSketchUpSceneToMultiCadFormat,
  type SketchUpExportFormat,
  type SketchUpShadowInfoConfig,
} from "./studio-bg3d-sketchup-shadow-and-exporter";
import {
  STUDIO_SKETCHUP_STYLE_PRESETS,
  filterSketchUpDrawableEdges,
  resolveSketchUpStyleToBg3dSettings,
  solveSketchUpFourPinHomography,
  type SketchUpStyleConfig,
} from "./studio-bg3d-sketchup-styles-uv-engine";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";
import { StudioBg3dArchitecturalModelingPanel } from "./StudioBg3dArchitecturalModelingPanel";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";
import { StudioBg3dSketchUpFullSections } from "./StudioBg3dSketchUpFullSections";
import {
  restoreStudioBg3dSkpAnnotationsAndGuides,
  restoreStudioBg3dSkpInstancedHierarchy,
  restoreStudioBg3dSkpScenesToShots,
  restoreStudioBg3dSkpTags,
} from "./studio-bg3d-skp-full-scene-restorer";

export interface StudioBg3dSketchUpWorkbenchPanelProps {
  readonly disabled?: boolean;
  readonly onApplyStyle?: (style: SketchUpStyleConfig) => void;
  readonly onApplyShadowSolar?: (azimuthDeg: number, altitudeDeg: number, colorTempK: number) => void;
  readonly onExecuteArray?: (token: string, placements: readonly SketchUpArrayPlacement[]) => void;
  readonly onRestoreSkpScenes?: (restoredShotCount: number, tagCount: number) => void;
  readonly onExportCadFormat?: (format: SketchUpExportFormat, byteSize: number) => void;
  readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
  readonly onApplySceneCamera?: (camera: StudioBg3dCameraSettings, labelKo: string) => void;
}

const SAMPLE_SKP_MODEL = Object.freeze({
  pages: [
    { name: "1컷_복도_정면_투시", eye: [0, -240, 64], target: [0, 0, 56], up: [0, 0, 1], fov: 42, parallel: false, orthoHeight: 0, hiddenLayers: ["천장_구조물"] },
    { name: "2컷_교실_평면_직교", eye: [0, 0, 360], target: [0, 0, 0], up: [0, 1, 0], fov: 35, parallel: true, orthoHeight: 240, hiddenLayers: ["지붕", "조명_보조선"] },
  ],
  layers: [
    { name: "Layer0", color: { r: 100, g: 118, b: 150 }, hidden: false },
    { name: "벽체_외벽", color: { r: 214, g: 204, b: 194 }, hidden: false },
    { name: "창호_유리", color: { r: 120, g: 190, b: 230 }, hidden: false },
    { name: "천장_구조물", color: { r: 160, g: 160, b: 160 }, hidden: true },
  ],
  styles: [{ name: "웹툰 은선 스타일", frontColor: { r: 255, g: 255, b: 255 }, backColor: { r: 100, g: 118, b: 150 } }],
  root: {
    sectionPlanes: [{ name: "교실 종단면", label: "A", hidden: false, plane: [0, 1, 0, -120] }],
    dimensions: [{ text: "<>", hidden: false, a: [0, 0, 0], b: [120, 0, 0], offset: [0, 24, 0] }],
    texts: [{ text: "출입문 개구부 (폭 900mm)", hidden: false, point: [36, 0, 84], leader: [18, -12, 18] }],
    constructionLines: [{ point: [0, 0, 0], direction: [1, 0, 0], start: [-1e30, 0, 0], end: [1e30, 0, 0] }],
    constructionPoints: [{ position: [60, 0, 0] }],
  },
});

const SAMPLE_INSTANCED_HIERARCHY = Object.freeze({
  layerHidden: { 천장_구조물: true },
  root: {
    children: [
      {
        name: "교실_앞문_01",
        definitionName: "Sliding_Door_900",
        layer: "창호_유리",
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1.2, 0, -2.4, 1],
        properties: { onclick: "ANIMATE('roty', 0, 90)", max_angle: 90 },
        attributeDictionaries: { IFC2x3: { IfcType: "IfcDoor", FireRating: "60min" } },
        children: [],
      },
      {
        name: "복도_미닫이창_01",
        definitionName: "Window_Sliding_1800",
        layer: "창호_유리",
        matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3.0, 1.1, -2.4, 1],
        properties: { open_ratio: 0.5 },
        children: [],
      },
    ],
  },
});

const SAMPLE_WALL_OUTER: readonly SketchUpVec2[] = Object.freeze([[0, 0], [4, 0], [4, 3], [0, 3]]);
const SAMPLE_WINDOW_INNER: readonly SketchUpVec2[] = Object.freeze([[1.2, 0.9], [2.8, 0.9], [2.8, 2.1], [1.2, 2.1]]);
const EXPORT_FORMAT_OPTIONS: readonly (readonly [SketchUpExportFormat, string])[] = Object.freeze([
  ["skp", ".skp (Native)"],
  ["dxf", ".dxf (AutoCAD)"],
  ["ifc", ".ifc (BIM IFC4)"],
  ["obj", ".obj + .mtl"],
  ["stl", ".stl"],
  ["ply", ".ply"],
  ["instanced-glb", ".glb (Instanced)"],
]);

export function StudioBg3dSketchUpWorkbenchPanel({
  disabled = false,
  onApplyStyle,
  onApplyShadowSolar,
  onExecuteArray,
  onRestoreSkpScenes,
  onExportCadFormat,
  onInsertScenePrimitives,
  onApplySceneCamera,
}: StudioBg3dSketchUpWorkbenchPanelProps): React.JSX.Element {
  const t = useT();
  const vcbInputId = useId();
  const protractorInputId = useId();

  const [pushPullDistMeters, setPushPullDistMeters] = useState<number>(-0.2);
  const [wallThicknessMeters] = useState<number>(0.2);
  const [offsetDistMeters, setOffsetDistMeters] = useState<number>(-0.15);
  const [vcbArrayText, setVcbArrayText] = useState<string>("*4");
  const [arrayModeKind, setArrayModeKind] = useState<"linear" | "radial">("linear");
  const [statusBanner, setStatusBanner] = useState<string>(
    t("studio.bg3d.architecture.readyIntro", "치수와 위치를 정해 건축 요소를 현재 배경에 배치하세요."),
  );
  const [protractorText, setProtractorText] = useState<string>("6:12");
  const [sectionOffsetMeters, setSectionOffsetMeters] = useState<number>(0);
  const [selectedStyleId, setSelectedStyleId] = useState<string>(STUDIO_SKETCHUP_STYLE_PRESETS[0]!.id);
  const [pinPerspectiveSkew, setPinPerspectiveSkew] = useState<number>(0.18);
  const [shadowConfig, setShadowConfig] = useState<SketchUpShadowInfoConfig>(DEFAULT_SKETCHUP_SHADOW_INFO);
  const [exportFormat, setExportFormat] = useState<SketchUpExportFormat>("skp");
  const [lastExportSummary, setLastExportSummary] = useState<string | null>(null);

  const restoredShots = useMemo(() => restoreStudioBg3dSkpScenesToShots(SAMPLE_SKP_MODEL), []);
  const restoredTags = useMemo(() => restoreStudioBg3dSkpTags(SAMPLE_SKP_MODEL), []);
  const restoredHierarchy = useMemo(() => restoreStudioBg3dSkpInstancedHierarchy(SAMPLE_INSTANCED_HIERARCHY), []);
  const restoredAnnotations = useMemo(() => restoreStudioBg3dSkpAnnotationsAndGuides(SAMPLE_SKP_MODEL), []);

  const pushPullPreview = useMemo(
    () =>
      extrudeSketchUpPolygonFaceWithHoleCut({
        outerLoop2D: SAMPLE_WALL_OUTER,
        innerProfile2D: SAMPLE_WINDOW_INNER,
        distanceMeters: pushPullDistMeters,
        wallThicknessMeters,
      }),
    [pushPullDistMeters, wallThicknessMeters],
  );
  const offsetPreview = useMemo(() => offsetSketchUpPolygon2D(SAMPLE_WALL_OUTER, offsetDistMeters), [offsetDistMeters]);
  const followMePreview = useMemo(
    () =>
      extrudeSketchUpFollowMe({
        profile2D: [[0, 0], [0.12, 0], [0.12, 0.08], [0, 0.08]],
        path3D: [[0, 3, 0], [4, 3, 0], [4, 3, -3], [0, 3, -3]],
        closedPath: true,
      }),
    [],
  );
  const parsedArrayCmd = useMemo(() => parseSketchUpArrayInput(vcbArrayText), [vcbArrayText]);
  const arrayPlacements = useMemo(() => {
    if (arrayModeKind === "linear") {
      return generateSketchUpLinearArray({ basePosition: [0, 0, 0], deltaVector: [1.5, 0, 0], command: parsedArrayCmd });
    }
    return generateSketchUpRadialArray({
      basePosition: [2, 0, 0],
      pivot: [0, 0, 0],
      angleStepOrSpanDeg: parsedArrayCmd.mode === "divide" ? 180 : 30,
      axis: "y",
      command: parsedArrayCmd,
    });
  }, [arrayModeKind, parsedArrayCmd]);

  const protractorParsed = useMemo(() => parseSketchUpProtractorInput(protractorText), [protractorText]);
  const guideLineClipped = useMemo(() => {
    const guide = createSketchUpGuideLine({
      id: "guide-protractor-1",
      basePoint: [0, 0, 0],
      baseDirection: [1, 0, 0],
      rotateAngleDeg: protractorParsed.ok ? protractorParsed.angleDeg : 30,
    });
    return clipConstructionLineToBounds(guide, 25);
  }, [protractorParsed]);

  const sampleDimension = useMemo(
    () =>
      createSketchUpDimension3D({
        id: "dim-wall-width",
        startPoint: [0, 0, 0],
        endPoint: [4, 0, 0],
        offsetVector: [0, 0.4, 0],
        textTemplate: "벽 폭 <>",
      }),
    [],
  );
  const sampleLeader = useMemo(
    () =>
      createSketchUpLeaderText3D({
        id: "leader-window",
        anchorPoint: [2.0, 1.5, 0],
        leaderOffset: [0.5, 0.6, 0],
        text: "창호 개구부 (1600×1200)",
      }),
    [],
  );
  const sectionCutSummary = useMemo(() => {
    const plane: StudioSketchUpSectionPlane3D = {
      id: "sec-main",
      name: "수평 평면도 단면",
      symbol: "1",
      plane: [0, 0, 1, -sectionOffsetMeters],
      active: true,
      hidden: false,
      fillColorHex: "#262626",
      lineColorHex: "#000000",
      lineWidthPx: 3,
    };
    return intersectTrianglesWithSketchUpSectionPlane(plane, pushPullPreview.mesh.positions, pushPullPreview.mesh.indices);
  }, [pushPullPreview.mesh.indices, pushPullPreview.mesh.positions, sectionOffsetMeters]);

  const selectedStyle = useMemo(
    () => STUDIO_SKETCHUP_STYLE_PRESETS.find((s) => s.id === selectedStyleId) ?? STUDIO_SKETCHUP_STYLE_PRESETS[0]!,
    [selectedStyleId],
  );
  const styleBg3dSettings = useMemo(() => resolveSketchUpStyleToBg3dSettings(selectedStyle), [selectedStyle]);
  const edgeFilterStats = useMemo(
    () =>
      filterSketchUpDrawableEdges([
        { a: [0, 0, 0], b: [1, 0, 0], flagsByte: 0x00 },
        { a: [1, 0, 0], b: [1, 1, 0], flagsByte: 0x08 | 0x10 },
        { a: [1, 1, 0], b: [0, 1, 0], flagsByte: 0x01 },
        { a: [0, 1, 0], b: [0, 0, 0], flagsByte: 0x00 },
      ]),
    [],
  );
  const homographyResult = useMemo(
    () =>
      solveSketchUpFourPinHomography([
        { planePoint: [0, 0], uv: [0, 0] },
        { planePoint: [2, 0], uv: [1, 0] },
        { planePoint: [2 - pinPerspectiveSkew, 2], uv: [1, 1] },
        { planePoint: [pinPerspectiveSkew, 2], uv: [0, 1] },
      ]),
    [pinPerspectiveSkew],
  );
  const shadowResult = useMemo(() => applySketchUpShadowSettingsToLighting(shadowConfig), [shadowConfig]);

  const handleArraySubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!parsedArrayCmd.ok) {
      setStatusBanner(parsedArrayCmd.messageKo);
      return;
    }
    setStatusBanner(`${parsedArrayCmd.messageKo} (${arrayPlacements.length}개 예제 위치 계산)`);
    onExecuteArray?.(parsedArrayCmd.normalizedToken, arrayPlacements);
  };

  // IME-safe Enter keydown handler per `ime-safe-enter-submit`
  const handleVcbKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      handleArraySubmit();
    }
  };

  const handleRestoreScenesAndTags = () => {
    setStatusBanner(
      `SKP 장면 ${restoredShots.length}개(카메라·직교투영·숨김 태그), 태그 ${restoredTags.length}개, 다이나믹 컴포넌트 ${restoredHierarchy.dynamicComponents.length}개 예제 복원 계산`,
    );
    onRestoreSkpScenes?.(restoredShots.length, restoredTags.length);
  };

  const handleStyleSelect = (style: SketchUpStyleConfig) => {
    setSelectedStyleId(style.id);
    setStatusBanner(`SketchUp 스타일 적용: ${style.labelKo}`);
    onApplyStyle?.(style);
  };

  const handleApplyShadow = () => {
    const { solar } = shadowResult;
    setStatusBanner(
      `태양광 스터디 예제 계산: 방위각 ${solar.solarAzimuthDeg.toFixed(1)}° / 고도 ${solar.solarAltitudeDeg.toFixed(1)}° (${solar.colorTemperatureK}K)`,
    );
    onApplyShadowSolar?.(solar.solarAzimuthDeg, solar.solarAltitudeDeg, solar.colorTemperatureK);
  };

  const handleRunExport = async () => {
    const artifact = await exportSketchUpSceneToMultiCadFormat(
      {
        modelName: "toonstudio_sketchup_set",
        unit: "m",
        tags: restoredTags,
        boxes: [
          { name: "Classroom_Wall_Main", layer: "벽체_외벽", colorHex: "#d6ccc2", positionMeters: [0, 1.5, 0], sizeMeters: [4, 3, 0.2] },
        ],
        sectionPlane: { name: "수평 단면", symbol: "1", planeMetersYUp: [0, 1, 0, -1.2] },
        dimensions: [{ startMeters: [0, 0, 0], endMeters: [4, 0, 0], offsetMeters: [0, 0.4, 0], text: "4.00 m" }],
        leaderTexts: [{ pointMeters: [2, 1.5, 0], leaderOffsetMeters: [0.4, 0.5, 0], text: "창호 개구부" }],
      },
      exportFormat,
    );
    const summary = `${artifact.fileName} (${artifact.byteSize.toLocaleString("ko-KR")} B, ${artifact.mimeType}) 생성 완료`;
    setLastExportSummary(summary);
    setStatusBanner(`CAD 예제 생성: ${summary}`);
    onExportCadFormat?.(artifact.format, artifact.byteSize);
  };

  return (
    <div data-testid="bg3d-sketchup-workbench-panel" className="flex flex-col gap-3 p-3 text-xs text-fg">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Box className="size-4 text-accent" aria-hidden />
          <span>{t("studio.bg3d.architecture.workbench", "배경 건축 · SketchUp 작업대")}</span>
        </div>
        <span
          data-testid="sketchup-workbench-status"
          role="status"
          aria-live="polite"
          className="rounded bg-accent/15 px-2 py-0.5 font-mono text-[0.65rem] font-semibold text-accent"
        >
          {statusBanner}
        </span>
      </header>

      <StudioBg3dArchitecturalModelingPanel
        disabled={disabled}
        onStatusChange={setStatusBanner}
        onInsertScenePrimitives={onInsertScenePrimitives}
      />
      <details className="rounded-xl border border-line p-2.5" data-testid="sketchup-example-tools">
        <summary className="cursor-pointer font-semibold">{t("studio.bg3d.architecture.examples", "모델링 예제 · 계산 미리보기")}</summary>
        <p className="my-2 text-fg-2">{t("studio.bg3d.architecture.exampleScope", "아래 복원·배열·작도·태양광·CAD 도구는 내장 예제로 계산합니다. 현재 선택한 모델을 편집하거나 내보내지 않습니다. Sandbox·솔리드 결과는 배치 버튼으로 장면에 추가할 수 있습니다.")}</p>
      {/* Mutually exclusive `<details name="sketchup-workbench-accordion">` per `search-hidden-content` */}
      <div className="space-y-2">
        <details name="sketchup-workbench-accordion" open className="rounded-xl border border-line bg-card p-2.5">
          <summary className="flex cursor-pointer items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="size-3.5 text-accent" aria-hidden />
              1. SKP 장면(Pages)·태그(Layers)·다이나믹 컴포넌트·엔티티 완전 복원
            </span>
            <span className="font-mono text-[0.62rem] text-fg-3">
              장면 {restoredShots.length} · 태그 {restoredTags.length} · DC {restoredHierarchy.dynamicComponents.length}
            </span>
          </summary>

          <div className="mt-2.5 space-y-2 border-t border-line/60 pt-2">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {restoredShots.map((item) => (
                <div key={item.shot.id} className="rounded-lg border border-line bg-panel p-2">
                  <div className="flex items-center justify-between font-semibold text-fg">
                    <span>{item.name}</span>
                    <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] text-accent">
                      {item.parallel ? "평행 투영 (Ortho)" : `원근 ${item.shot.camera?.fovDegrees}°`}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[0.62rem] text-fg-3">
                    Eye(m): [{item.shot.camera?.position?.join(", ")}] · 숨김 태그: {item.hiddenLayerNames.join(", ") || "없음"}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {restoredTags.map((tag) => (
                <span key={tag.name} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2 py-0.5 text-[0.65rem]">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: tag.colorHex }} aria-hidden />
                  <span>{tag.name}</span>
                  {tag.hidden ? <span className="text-[0.58rem] text-warn">(숨김)</span> : null}
                </span>
              ))}
            </div>

            <p className="text-[0.65rem] text-fg-2">
              복원된 어노테이션: 단면 평면 {restoredAnnotations.sectionPlanes.length}개 · 치수선{" "}
              {restoredAnnotations.dimensions.length}개 · 지시선 {restoredAnnotations.leaderTexts.length}개 · 무한 보조선{" "}
              {restoredAnnotations.constructionLines.length}개
            </p>

            <button
              type="button"
              disabled={disabled}
              data-testid="sketchup-restore-scenes-btn"
              onClick={handleRestoreScenesAndTags}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent hover:bg-accent/90 disabled:opacity-45"
            >
              <Sparkles className="size-3.5" aria-hidden />
              <span>SKP 카메라 샷·태그 가시성·다이나믹 컴포넌트 일괄 복원</span>
            </button>
          </div>
        </details>

        <details name="sketchup-workbench-accordion" className="rounded-xl border border-line bg-card p-2.5">
          <summary className="flex cursor-pointer items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1.5">
              <Grid className="size-3.5 text-accent" aria-hidden />
              2. 직접 모델링 커널 (Push/Pull 개구부 관통 · Offset · Follow Me · VCB 배열)
            </span>
            <span className="font-mono text-[0.62rem] text-fg-3">
              {pushPullPreview.holeCut ? "관통 개구부(Hole Cut)" : "일반 돌출"} · FollowMe {followMePreview.mesh.triangleCount} tris
            </span>
          </summary>

          <div className="mt-2.5 space-y-2.5 border-t border-line/60 pt-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-panel p-2">
                <div className="flex items-center justify-between font-semibold">
                  <span>Push/Pull (창호 개구부 관통 판정)</span>
                  <span className="font-mono text-accent">{pushPullDistMeters.toFixed(2)} m</span>
                </div>
                <input
                  type="range"
                  min="-0.5"
                  max="0.5"
                  step="0.05"
                  disabled={disabled}
                  aria-label="Push/Pull 거리 (m)"
                  value={pushPullDistMeters}
                  onChange={(e) => setPushPullDistMeters(parseFloat(e.target.value))}
                  className="mt-1.5 w-full accent-accent"
                />
                <p className="mt-1 text-[0.62rem] text-fg-3">
                  벽 두께 {wallThicknessMeters}m 대비{" "}
                  {pushPullPreview.holeCut
                    ? "반대면 도달 → 창문 개구부 자동 관통 절단(Through-Hole Cut) 활성"
                    : `일반 돌출 (${pushPullPreview.mesh.triangleCount} 삼각형)`}
                </p>
              </div>

              <div className="rounded-lg border border-line bg-panel p-2">
                <div className="flex items-center justify-between font-semibold">
                  <span>Offset (동일 평면 다각형 등거리 오프셋)</span>
                  <span className="font-mono text-accent">{offsetDistMeters.toFixed(2)} m</span>
                </div>
                <input
                  type="range"
                  min="-0.6"
                  max="0.6"
                  step="0.05"
                  disabled={disabled}
                  aria-label="Offset 거리 (m)"
                  value={offsetDistMeters}
                  onChange={(e) => setOffsetDistMeters(parseFloat(e.target.value))}
                  className="mt-1.5 w-full accent-accent"
                />
                <p className="mt-1 text-[0.62rem] text-fg-3">
                  원래 넓이 {offsetPreview.areaOriginal}㎡ → 오프셋 넓이 {offsetPreview.areaOffset}㎡ (Follow Me 둘레 {followMePreview.pathLengthMeters}m)
                </p>
              </div>
            </div>

            <form onSubmit={handleArraySubmit} className="rounded-lg border border-line bg-panel p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={vcbInputId} className="font-semibold text-fg">
                  VCB 복제 배열 입력 (`*N`, `Nx` 외부 배수 / `/N` 내부 등분)
                </label>
                <div className="flex gap-1">
                  {(["linear", "radial"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setArrayModeKind(mode)}
                      className={`rounded px-2 py-0.5 text-[0.64rem] font-semibold ${
                        arrayModeKind === mode ? "bg-accent text-on-accent" : "border border-line bg-card text-fg-2"
                      }`}
                    >
                      {mode === "linear" ? "Move/Copy 선형" : "Rotate/Copy 방사형"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id={vcbInputId}
                  type="text"
                  disabled={disabled}
                  data-testid="sketchup-vcb-array-input"
                  value={vcbArrayText}
                  onChange={(e) => setVcbArrayText(e.target.value)}
                  onKeyDown={handleVcbKeyDown}
                  placeholder="*3, 5x, /4"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1 font-mono text-xs text-fg"
                />
                <button
                  type="submit"
                  disabled={disabled}
                  data-testid="sketchup-vcb-array-submit"
                  className="rounded-lg bg-accent px-3 py-1 text-xs font-bold text-on-accent hover:bg-accent/90"
                >
                  배열 실행
                </button>
              </div>
              <p className="mt-1 text-[0.62rem] text-fg-3">
                {parsedArrayCmd.messageKo} · 생성 위치 수: {arrayPlacements.length}개
              </p>
            </form>
          </div>
        </details>

        <details name="sketchup-workbench-accordion" className="rounded-xl border border-line bg-card p-2.5">
          <summary className="flex cursor-pointer items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1.5">
              <Ruler className="size-3.5 text-accent" aria-hidden />
              3. 정밀 작도 도구 (보조선 Tape/Protractor · 3D 치수선 · 지시선 · 단면 채움)
            </span>
            <span className="font-mono text-[0.62rem] text-fg-3">
              각도기 {protractorParsed.formatted || "유효하지 않음"} · 단면 선분 {sectionCutSummary.segments.length}개
            </span>
          </summary>

          <div className="mt-2.5 space-y-2 border-t border-line/60 pt-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-panel p-2">
                <label htmlFor={protractorInputId} className="block font-semibold">
                  각도기(Protractor) 각도 / 물매(Rise:Run) 입력
                </label>
                <input
                  id={protractorInputId}
                  type="text"
                  disabled={disabled}
                  value={protractorText}
                  onChange={(e) => setProtractorText(e.target.value)}
                  className="mt-1 w-full rounded border border-line bg-card px-2 py-1 font-mono text-xs"
                />
                <p className="mt-1 text-[0.62rem] text-fg-3">
                  해석 결과: {protractorParsed.formatted} · 클리핑 선분:{" "}
                  {guideLineClipped ? `[${guideLineClipped.start.join(", ")}] → [${guideLineClipped.end.join(", ")}]` : "범위 밖"}
                </p>
              </div>

              <div className="rounded-lg border border-line bg-panel p-2">
                <div className="flex items-center justify-between font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <Scissors className="size-3 text-accent" aria-hidden />
                    Section Plane 절단 위치
                  </span>
                  <span className="font-mono text-accent">{sectionOffsetMeters.toFixed(2)} m</span>
                </div>
                <input
                  type="range"
                  min="-0.2"
                  max="0.2"
                  step="0.02"
                  disabled={disabled}
                  aria-label="단면 절단 위치 (m)"
                  value={sectionOffsetMeters}
                  onChange={(e) => setSectionOffsetMeters(parseFloat(e.target.value))}
                  className="mt-1.5 w-full accent-accent"
                />
                <p className="mt-1 text-[0.62rem] text-fg-3">
                  교차 절단선 {sectionCutSummary.segments.length}개 · 단면 채움(Poché) 추정 면적 {sectionCutSummary.estimatedFillAreaSqMeters}㎡
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panel p-2 text-[0.64rem] text-fg-2">
              <p>
                <strong>3D 치수선(Dimension):</strong> {sampleDimension.displayText} (중심 라벨 [{sampleDimension.labelPosition.join(", ")}])
              </p>
              <p className="mt-0.5">
                <strong>3D 지시선(Leader Text):</strong> {sampleLeader.text} (엘보 [{sampleLeader.elbowPoint.join(", ")}])
              </p>
            </div>
          </div>
        </details>

        <details name="sketchup-workbench-accordion" className="rounded-xl border border-line bg-card p-2.5">
          <summary className="flex cursor-pointer items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-3.5 text-accent" aria-hidden />
              4. 스타일(Face/Edge Styles) · `D307` 모서리 필터 · 4핀 원근 텍스처 매핑
            </span>
            <span className="font-mono text-[0.62rem] text-fg-3">{selectedStyle.labelKo}</span>
          </summary>

          <div className="mt-2.5 space-y-2 border-t border-line/60 pt-2">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {STUDIO_SKETCHUP_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={disabled}
                  data-testid={`sketchup-style-btn-${preset.id}`}
                  onClick={() => handleStyleSelect(preset)}
                  className={`rounded-lg border p-2 text-left transition-colors ${
                    selectedStyleId === preset.id
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised"
                  }`}
                >
                  <div className="truncate text-[0.68rem]">{preset.labelKo}</div>
                  <div className="mt-0.5 text-[0.58rem] text-fg-3">
                    윤곽 {preset.profileWidthPx}px · {preset.faceStyle}
                  </div>
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex items-center justify-between font-semibold">
                <span>4-Pin 투영 텍스처(Projective Homography) 왜곡 보정</span>
                <span className="font-mono text-accent">
                  Skew {pinPerspectiveSkew.toFixed(2)}m · {homographyResult.uvProjected ? "원근 투영(Projected)" : "아핀(Affine)"}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="0.5"
                step="0.02"
                disabled={disabled}
                aria-label="4핀 원근 왜곡 보정량"
                value={pinPerspectiveSkew}
                onChange={(e) => setPinPerspectiveSkew(parseFloat(e.target.value))}
                className="mt-1.5 w-full accent-accent"
              />
              <p className="mt-1 font-mono text-[0.6rem] text-fg-3">
                D307 가시 모서리: {edgeFilterStats.drawable.length}개 (Softened {edgeFilterStats.softenedCount} · Hidden{" "}
                {edgeFilterStats.hiddenCount}) · LT 선두께 {styleBg3dSettings.line.widthPx}px
              </p>
            </div>
          </div>
        </details>

        <details name="sketchup-workbench-accordion" className="rounded-xl border border-line bg-card p-2.5">
          <summary className="flex cursor-pointer items-center justify-between font-bold text-fg">
            <span className="inline-flex items-center gap-1.5">
              <Sun className="size-3.5 text-accent" aria-hidden />
              5. 태양광 그림자 스터디(Solar North) & 네이티브 `.skp` / CAD 다중 내보내기
            </span>
            <span className="font-mono text-[0.62rem] text-fg-3">
              고도 {shadowResult.solar.solarAltitudeDeg.toFixed(1)}° · 방위 {shadowResult.solar.solarAzimuthDeg.toFixed(1)}°
            </span>
          </summary>

          <div className="mt-2.5 space-y-2.5 border-t border-line/60 pt-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-panel p-2">
                <div className="flex items-center justify-between font-semibold">
                  <span>시각 (UTC+{shadowConfig.utcOffsetHours})</span>
                  <span className="font-mono text-accent">
                    {shadowConfig.timeOfDayHours.toFixed(1)}h (일출 {shadowResult.solar.sunriseHour.toFixed(1)}h ~ 일몰{" "}
                    {shadowResult.solar.sunsetHour.toFixed(1)}h)
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="20"
                  step="0.25"
                  disabled={disabled}
                  aria-label="태양광 시각"
                  value={shadowConfig.timeOfDayHours}
                  onChange={(e) => setShadowConfig((prev) => ({ ...prev, timeOfDayHours: parseFloat(e.target.value) }))}
                  className="mt-1.5 w-full accent-accent"
                />
              </div>

              <div className="rounded-lg border border-line bg-panel p-2">
                <div className="flex items-center justify-between font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <Compass className="size-3 text-accent" aria-hidden />
                    Solar North 방위 오프셋
                  </span>
                  <span className="font-mono text-accent">{shadowConfig.solarNorthAngleDeg}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="5"
                  disabled={disabled}
                  aria-label="Solar North 방위각 오프셋"
                  value={shadowConfig.solarNorthAngleDeg}
                  onChange={(e) => setShadowConfig((prev) => ({ ...prev, solarNorthAngleDeg: parseFloat(e.target.value) }))}
                  className="mt-1.5 w-full accent-accent"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={disabled}
              data-testid="sketchup-apply-shadow-btn"
              onClick={handleApplyShadow}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent hover:bg-accent/90"
            >
              <Sun className="size-3.5" aria-hidden />
              <span>현재 장면에 SketchUp 천문 태양광·그림자 농도 적용</span>
            </button>

            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-fg">네이티브 `.skp` (v17) & 다중 CAD 포맷 내보내기</span>
                <div className="flex flex-wrap gap-1">
                  {EXPORT_FORMAT_OPTIONS.map(([fmt, label]) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setExportFormat(fmt)}
                      className={`rounded px-2 py-0.5 text-[0.62rem] font-semibold ${
                        exportFormat === fmt ? "bg-accent text-on-accent" : "border border-line bg-card text-fg-2"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  data-testid="sketchup-export-cad-btn"
                  onClick={() => void handleRunExport()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent hover:bg-accent/90"
                >
                  <Download className="size-3.5" aria-hidden />
                  <span>선택 포맷({exportFormat.toUpperCase()})으로 예제 생성</span>
                </button>
                {lastExportSummary ? (
                  <span data-testid="sketchup-export-summary" className="font-mono text-[0.62rem] text-good">
                    {lastExportSummary}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </details>

        <StudioBg3dSketchUpFullSections
          disabled={disabled}
          onStatusChange={setStatusBanner}
          onInsertScenePrimitives={onInsertScenePrimitives}
          onApplySceneCamera={onApplySceneCamera}
        />
      </div>
      </details>
    </div>
  );
}

export default StudioBg3dSketchUpWorkbenchPanel;
