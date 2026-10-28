import { Camera, Combine, FileCode2, Mountain, Sparkles } from "lucide-react";
import React, { useMemo, useState } from "react";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";
import {
  applySketchUpDrapePath,
  applySketchUpSmooveTerrain,
  applySketchUpStampPad,
  buildSketchUpLayOutVectorCutawaySvg,
  buildSketchUpSandboxFromContours,
  calibrateSketchUpMatchPhotoCamera,
  evaluateSketchUpSolidOperation,
  inspectSketchUpManifoldSolid,
  synthesizeSketchUpTerrainPrimitives,
  type SketchUpSolidOperationKind,
} from "./studio-bg3d-sketchup-full-engine";

export interface StudioBg3dSketchUpFullSectionsProps {
  readonly disabled?: boolean;
  readonly onStatusChange?: (messageKo: string) => void;
  readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
  readonly onApplySceneCamera?: (camera: StudioBg3dCameraSettings, labelKo: string) => void;
}

const SOLID_OP_OPTIONS: readonly {
  readonly id: SketchUpSolidOperationKind;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "outer-shell", labelKo: "Outer Shell (외피 병합)" },
  { id: "union", labelKo: "Union (합집합)" },
  { id: "subtract", labelKo: "Subtract (차집합)" },
  { id: "trim", labelKo: "Trim (비파괴 트리밍)" },
  { id: "intersect", labelKo: "Intersect (교집합)" },
  { id: "split", labelKo: "Split (3분할)" },
]);

export function StudioBg3dSketchUpFullSections({
  disabled = false,
  onStatusChange,
  onInsertScenePrimitives,
  onApplySceneCamera,
}: StudioBg3dSketchUpFullSectionsProps): React.JSX.Element {
  // 6. Sandbox & Terrain state
  const [smooveRadius, setSmooveRadius] = useState<number>(4.5);
  const [smooveHeight, setSmooveHeight] = useState<number>(1.8);
  const [stampElevation, setStampElevation] = useState<number>(1.4);
  const [includeDrapeRoad, setIncludeDrapeRoad] = useState<boolean>(true);

  // 7. Solid Tools & Solid Inspector state
  const [solidOp, setSolidOp] = useState<SketchUpSolidOperationKind>("outer-shell");
  const [solidOverlapOffset, setSolidOverlapOffset] = useState<number>(0.8);
  const [inspectorStrayEdges, setInspectorStrayEdges] = useState<number>(0);

  // 8. Match Photo Camera Calibrator state
  const [vp1X, setVp1X] = useState<number>(-1.35);
  const [vp2X, setVp2X] = useState<number>(1.25);
  const [horizonSkewY] = useState<number>(0.08);
  const [matchTargetDist, setMatchTargetDist] = useState<number>(8.5);

  // 9. Parametric Architectural Component & LayOut SVG state
  const [layoutSvgSummary, setLayoutSvgSummary] = useState<string | null>(null);

  const terrainGrid = useMemo(() => {
    const base = buildSketchUpSandboxFromContours(
      [
        { elevationY: 0.2, pointsXZ: [[-6, -6], [6, -6]] },
        { elevationY: 1.5, pointsXZ: [[-4, 2], [4, 2]] },
      ],
      { cols: 7, rows: 7, widthMeters: 14, depthMeters: 14 },
    );
    const smooved = applySketchUpSmooveTerrain(base, {
      centerX: -1.5,
      centerZ: 1.0,
      radiusMeters: smooveRadius,
      displacementY: smooveHeight,
    });
    const stamped = applySketchUpStampPad(smooved, {
      centerX: 1.2,
      centerZ: -0.8,
      width: 4.2,
      depth: 3.4,
      elevationY: stampElevation,
      embankmentSlopeMeters: 1.8,
    });
    return includeDrapeRoad
      ? applySketchUpDrapePath(stamped, [
          [-5, -4],
          [-1, -1],
          [3, 3],
          [5, 5],
        ])
      : stamped;
  }, [includeDrapeRoad, smooveHeight, smooveRadius, stampElevation]);

  const terrainPrimitives = useMemo(
    () => synthesizeSketchUpTerrainPrimitives(terrainGrid),
    [terrainGrid],
  );

  const solidResult = useMemo(
    () =>
      evaluateSketchUpSolidOperation(
        solidOp,
        {
          id: "solid-a",
          nameKo: "본관 매스 A",
          center: [0, 1.5, 0],
          size: [3.2, 3.0, 2.8],
          colorHex: "#d6ccc2",
        },
        {
          id: "solid-b",
          nameKo: "코어 볼륨 B",
          center: [solidOverlapOffset, 1.5, 0.4],
          size: [2.4, 2.6, 2.4],
          colorHex: "#9fb4c9",
        },
      ),
    [solidOp, solidOverlapOffset],
  );

  const solidInspectorReport = useMemo(
    () =>
      inspectSketchUpManifoldSolid({
        vertexCount: 8,
        edgeCount: 12,
        faceCount: 6,
        strayEdgeCount: inspectorStrayEdges,
        internalFaceCount: solidOp === "outer-shell" ? 0 : 1,
        reversedNormalFaceCount: 0,
        boundaryHoleLoopCount: 0,
        boundingBoxSizeMeters: [3.2, 3.0, 2.8],
      }),
    [inspectorStrayEdges, solidOp],
  );

  const matchPhotoResult = useMemo(
    () =>
      calibrateSketchUpMatchPhotoCamera({
        vp1Normalized: [vp1X, -horizonSkewY * 0.5],
        vp2Normalized: [vp2X, horizonSkewY * 0.5],
        originNormalized: [0, -0.12],
        referenceHeightMeters: 3.2,
        targetDistanceMeters: matchTargetDist,
      }),
    [horizonSkewY, matchTargetDist, vp1X, vp2X],
  );

  const insertPrimitives = (primitives: readonly BgPrimitive[], labelKo: string) => {
    try {
      if (!disabled && onInsertScenePrimitives?.(primitives, labelKo)) {
        onStatusChange?.(`${labelKo} · 3D 장면 배치 완료`);
        return;
      }
      onStatusChange?.("배치하지 못했습니다. 편집 가능한 장면과 도형 한도를 확인해 주세요.");
    } catch {
      onStatusChange?.("장면에 배치하지 못했습니다. 장면 상태를 확인해 주세요.");
    }
  };

  return (
    <>
      {/* 6. Sandbox & Terrain */}
      <details name="sketchup-workbench-accordion" className="rounded-xl border border-line bg-card p-2.5">
        <summary className="flex cursor-pointer items-center justify-between font-bold text-fg">
          <span className="inline-flex items-center gap-1.5">
            <Mountain className="size-3.5 text-accent" aria-hidden />
            6. Sandbox 지형 스튜디오 (From Contours · Smoove · Stamp 부지 · Drape 도로)
          </span>
          <span className="font-mono text-[0.62rem] text-fg-3">
            프리미티브 {terrainPrimitives.length}개 · Drape {terrainGrid.drapedPathPoints3D.length}점
          </span>
        </summary>

        <div className="mt-2.5 space-y-2 border-t border-line/60 pt-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex items-center justify-between font-semibold">
                <span>Smoove 반경 (m)</span>
                <span className="font-mono text-accent">{smooveRadius.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="1.5"
                max="8.0"
                step="0.5"
                disabled={disabled}
                aria-label="Sandbox Smoove 반경"
                data-testid="sketchup-sandbox-smoove-radius"
                value={smooveRadius}
                onChange={(e) => setSmooveRadius(parseFloat(e.target.value))}
                className="mt-1.5 w-full accent-accent"
              />
            </div>

            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex items-center justify-between font-semibold">
                <span>Smoove 융기 높이 (m)</span>
                <span className="font-mono text-accent">{smooveHeight.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="-2.0"
                max="3.5"
                step="0.2"
                disabled={disabled}
                aria-label="Sandbox Smoove 융기 높이"
                data-testid="sketchup-sandbox-smoove-height"
                value={smooveHeight}
                onChange={(e) => setSmooveHeight(parseFloat(e.target.value))}
                className="mt-1.5 w-full accent-accent"
              />
            </div>

            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex items-center justify-between font-semibold">
                <span>Stamp 대지 표고 (m)</span>
                <span className="font-mono text-accent">+{stampElevation.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="3.0"
                step="0.2"
                disabled={disabled}
                aria-label="Sandbox Stamp 대지 표고"
                data-testid="sketchup-sandbox-stamp-elevation"
                value={stampElevation}
                onChange={(e) => setStampElevation(parseFloat(e.target.value))}
                className="mt-1.5 w-full accent-accent"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-[0.65rem] text-fg-2">
              <input
                type="checkbox"
                checked={includeDrapeRoad}
                disabled={disabled}
                onChange={(e) => setIncludeDrapeRoad(e.target.checked)}
                className="accent-accent"
              />
              <span>Drape 도로 폴리라인 지형 투영 포함</span>
            </label>

            <button
              type="button"
              disabled={disabled || !onInsertScenePrimitives}
              data-testid="sketchup-sandbox-insert-scene-btn"
              onClick={() => {
                insertPrimitives(terrainPrimitives, `Sandbox 지형·부지 (${terrainPrimitives.length}개 요소)`);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent hover:bg-accent/90"
            >
              <Sparkles className="size-3.5" aria-hidden />
              <span>현재 3D 장면에 Sandbox 지형·부지 즉시 배치</span>
            </button>
          </div>
        </div>
      </details>

      {/* 7. Solid Tools & Manifold Solid Inspector */}
      <details name="sketchup-workbench-accordion" className="rounded-xl border border-line bg-card p-2.5">
        <summary className="flex cursor-pointer items-center justify-between font-bold text-fg">
          <span className="inline-flex items-center gap-1.5">
            <Combine className="size-3.5 text-accent" aria-hidden />
            7. Solid Tools 6대 불리언 연산 & Manifold Solid Inspector²
          </span>
          <span className="font-mono text-[0.62rem] text-fg-3">
            {solidResult.operation.toUpperCase()} · 체적 {solidResult.volumeCubicMeters}㎥ · χ={solidInspectorReport.eulerCharacteristic}
          </span>
        </summary>

        <div className="mt-2.5 space-y-2 border-t border-line/60 pt-2">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SOLID_OP_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                data-testid={`sketchup-solid-op-${opt.id}`}
                onClick={() => {
                  setSolidOp(opt.id);
                  onStatusChange?.(`Solid Tools 연산 전환: ${opt.labelKo}`);
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-left text-[0.66rem] ${
                  solidOp === opt.id
                    ? "border-accent bg-accent/15 font-bold text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                }`}
              >
                {opt.labelKo}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex items-center justify-between font-semibold">
                <span>코어 볼륨 교차 오프셋</span>
                <span className="font-mono text-accent">{solidOverlapOffset.toFixed(2)}m</span>
              </div>
              <input
                type="range"
                min="0"
                max="2.4"
                step="0.2"
                disabled={disabled}
                aria-label="솔리드 교차 오프셋"
                value={solidOverlapOffset}
                onChange={(e) => setSolidOverlapOffset(parseFloat(e.target.value))}
                className="mt-1.5 w-full accent-accent"
              />
              <p className="mt-1 text-[0.62rem] text-fg-3">
                결과 바디 {solidResult.resultingBodyCount}개 · 표면적 {solidResult.surfaceAreaSqMeters}㎡ · 내부 격벽 제거{" "}
                {solidResult.internalWallsRemoved}면
              </p>
            </div>

            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex items-center justify-between font-semibold">
                <span>Solid Inspector² 수밀성 진단</span>
                <span className="font-mono text-good">
                  {solidInspectorReport.isSolidManifold ? "Manifold OK" : "Auto-Heal 준비"}
                </span>
              </div>
              <p className="mt-1 text-[0.62rem] text-fg-2">{solidInspectorReport.issuesSummaryKo.join(" / ")}</p>
              <button
                type="button"
                disabled={disabled || !onInsertScenePrimitives}
                data-testid="sketchup-solid-insert-scene-btn"
                onClick={() => {
                  setInspectorStrayEdges(0);
                  insertPrimitives(solidResult.primitives, `솔리드 예제 (${solidResult.labelKo}) ${solidResult.primitives.length}개 바디`);
                }}
                className="mt-1.5 inline-flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-[0.65rem] font-bold text-on-accent"
              >
                <Sparkles className="size-3" aria-hidden />
                <span>현재 3D 장면에 솔리드 연산 결과 배치</span>
              </button>
            </div>
          </div>
        </div>
      </details>

      {/* 8. Match Photo 2-VP Camera Calibrator */}
      <details name="sketchup-workbench-accordion" className="rounded-xl border border-line bg-card p-2.5">
        <summary className="flex cursor-pointer items-center justify-between font-bold text-fg">
          <span className="inline-flex items-center gap-1.5">
            <Camera className="size-3.5 text-accent" aria-hidden />
            8. Match Photo (2소실점 사진 투시 역산 카메라 캘리브레이터)
          </span>
          <span className="font-mono text-[0.62rem] text-fg-3">
            {matchPhotoResult.focalLength35mmEquiv}mm · FOV {matchPhotoResult.verticalFovDeg}° · 롤 {matchPhotoResult.horizonTiltDeg}°
          </span>
        </summary>

        <div className="mt-2.5 space-y-2 border-t border-line/60 pt-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex items-center justify-between font-semibold">
                <span>좌측 소실점 VP1 (Red X)</span>
                <span className="font-mono text-accent">{vp1X.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="-2.4"
                max="-0.4"
                step="0.05"
                disabled={disabled}
                aria-label="좌측 소실점 VP1 X"
                value={vp1X}
                onChange={(e) => setVp1X(parseFloat(e.target.value))}
                className="mt-1.5 w-full accent-accent"
              />
            </div>

            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex items-center justify-between font-semibold">
                <span>우측 소실점 VP2 (Green Z)</span>
                <span className="font-mono text-accent">{vp2X.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="2.4"
                step="0.05"
                disabled={disabled}
                aria-label="우측 소실점 VP2 X"
                value={vp2X}
                onChange={(e) => setVp2X(parseFloat(e.target.value))}
                className="mt-1.5 w-full accent-accent"
              />
            </div>

            <div className="rounded-lg border border-line bg-panel p-2">
              <div className="flex items-center justify-between font-semibold">
                <span>수평선 기울기 & 기준 거리</span>
                <span className="font-mono text-accent">{matchTargetDist.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min="3.0"
                max="25.0"
                step="0.5"
                disabled={disabled}
                aria-label="Match Photo 기준 거리"
                value={matchTargetDist}
                onChange={(e) => setMatchTargetDist(parseFloat(e.target.value))}
                className="mt-1.5 w-full accent-accent"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel p-2">
            <span className="font-mono text-[0.63rem] text-fg-2">
              {matchPhotoResult.summaryKo} · Eye [{matchPhotoResult.cameraSettings.position.join(", ")}]
            </span>
            <button
              type="button"
              disabled={disabled}
              data-testid="sketchup-match-photo-apply-camera-btn"
              onClick={() => {
                onStatusChange?.(matchPhotoResult.summaryKo);
                onApplySceneCamera?.(matchPhotoResult.cameraSettings, matchPhotoResult.summaryKo);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent hover:bg-accent/90"
            >
              <Camera className="size-3.5" aria-hidden />
              <span>현재 3D 뷰포트에 Match Photo 카메라 즉시 적용</span>
            </button>
          </div>
        </div>
      </details>

      <details className="rounded-xl border border-line bg-card p-2.5">
        <summary className="cursor-pointer font-bold text-fg">LayOut 벡터 단면도 예제 (SVG)</summary>
        <button
          type="button"
          disabled={disabled}
          data-testid="sketchup-layout-svg-export-btn"
          onClick={() => {
            const res = buildSketchUpLayOutVectorCutawaySvg({
              title: "건축 단면도 예제",
              widthMeters: 4.0,
              heightMeters: 3.2,
              sectionElevationMeters: 1.2,
            });
            const summary = `LayOut 벡터 단면 SVG (${res.byteLength} B) 생성 완료`;
            setLayoutSvgSummary(summary);
            onStatusChange?.(summary);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/20"
        >
          <FileCode2 className="size-3.5" aria-hidden />
          <span>LayOut 벡터 단면 SVG 예제 생성</span>
        </button>
        {layoutSvgSummary ? (
          <p data-testid="sketchup-layout-svg-summary" className="font-mono text-[0.62rem] text-good">
            {layoutSvgSummary}
          </p>
        ) : null}
      </details>
    </>
  );
}
