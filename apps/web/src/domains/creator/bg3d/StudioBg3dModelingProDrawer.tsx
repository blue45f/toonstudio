/**
 * StudioBg3dModelingProDrawer.tsx
 *
 * Blender + SketchUp 고급 3D 모델링 연산기 8종 & 실시간 매니폴드 검증 드로어.
 * - SketchUp 계열: 면 밀고 당기기(Push/Pull), 경로 따라 뽑기(Follow-Me), 단면 절단·캡(Section Plane), 컴포넌트 배열(선형/방사형)
 * - Blender 계열: 모서리 다듬기(Micro-Bevel), 좌우 대칭(Mirror), 부드럽게 세분화(Loop/Catmull-Clark), 불리언 합·차집합(CSG)
 * - 모바일에서도 깔끔한 `<details>` 점진적 공개와 `min-h-11` 터치 타깃, OKLCH 의미 토큰, GPU `try/finally` 해제를 준수한다.
 */

import { Box, CheckCircle2, RotateCcw, Scissors, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import {
  applyBooleanMeshOperation,
  applyMicroBevelChamfer,
  applySymmetricMirrorGeometry,
  buildComponentArrayTransforms,
  extrudeFaceAlongNormal,
  inspectGeometryTopologyAndManifold,
  sliceGeometryWithSectionPlane,
  subdivideGeometrySmooth,
  sweepProfileAlongPath,
  type BooleanOperationKind,
  type ComponentArrayResult,
  type GeometryTopologyInspection,
  type ModelingAxis,
  type SubdivisionScheme,
} from "./studio-bg3d-blender-sketchup-pro-ops";
import { groundBufferGeometryToY0 } from "./studio-bg3d-geometry-manifold-utils";

export interface StudioBg3dModelingProDrawerProps {
  readonly disabled?: boolean;
  readonly onGeometryUpdated?: (geometry: THREE.BufferGeometry, inspection: GeometryTopologyInspection) => void;
  readonly onComponentArrayBuilt?: (arrayResult: ComponentArrayResult) => void;
  readonly onStatusMessage?: (messageKo: string) => void;
}

function createInitialArchitecturalBlock(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1.2, 2.0, 1.0);
  groundBufferGeometryToY0(geo);
  return geo;
}

export function StudioBg3dModelingProDrawer({
  disabled = false,
  onGeometryUpdated,
  onComponentArrayBuilt,
  onStatusMessage,
}: StudioBg3dModelingProDrawerProps) {
  const workingGeoRef = useRef<THREE.BufferGeometry | null>(null);
  if (!workingGeoRef.current) {
    workingGeoRef.current = createInitialArchitecturalBlock();
  }

  const [inspection, setInspection] = useState<GeometryTopologyInspection>(() =>
    inspectGeometryTopologyAndManifold(workingGeoRef.current!),
  );
  const [pushPullMeters, setPushPullMeters] = useState<number>(0.45);
  const [bevelMm, setBevelMm] = useState<number>(50);
  const [bevelSegments, setBevelSegments] = useState<number>(2);
  const [sectionHeightM, setSectionHeightM] = useState<number>(1.2);
  const [mirrorAxis, setMirrorAxis] = useState<ModelingAxis>("x");
  const [subdivScheme, setSubdivScheme] = useState<SubdivisionScheme>("loop");
  const [booleanKind, setBooleanKind] = useState<BooleanOperationKind>("subtract");
  const [arrayMode, setArrayMode] = useState<"linear" | "radial">("linear");
  const [arrayCount, setArrayCount] = useState<number>(4);
  const [lastArraySummary, setLastArraySummary] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string>(
    "기본 1.2×2.0×1.0m 건축 블록이 준비됐어요. 아래 도구로 버텍스·면 연산을 바로 실행해 보세요.",
  );

  useEffect(() => {
    return () => {
      const active = workingGeoRef.current;
      workingGeoRef.current = null;
      if (active) {
        try {
          active.dispose();
        } finally {
          // 작업 지오메트리 GPU 해제
        }
      }
    };
  }, []);

  const commitGeometry = (nextGeo: THREE.BufferGeometry, messageKo: string) => {
    const previous = workingGeoRef.current;
    workingGeoRef.current = nextGeo;
    if (previous && previous !== nextGeo) {
      try {
        previous.dispose();
      } finally {
        // 이전 단계 지오메트리 해제
      }
    }
    const nextInspection = inspectGeometryTopologyAndManifold(nextGeo);
    setInspection(nextInspection);
    setStatusNote(messageKo);
    onStatusMessage?.(messageKo);
    onGeometryUpdated?.(nextGeo, nextInspection);
  };

  const handleResetBlock = () => {
    setLastArraySummary(null);
    commitGeometry(createInitialArchitecturalBlock(), "기본 건축 블록(1.2×2.0×1.0m · Y=0)으로 되돌렸어요.");
  };

  const handlePushPull = () => {
    const current = workingGeoRef.current;
    if (!current) return;
    const result = extrudeFaceAlongNormal(current, [0, 1, 0], pushPullMeters, { groundAtY0: true });
    commitGeometry(result.geometry, `면 밀고 당기기 완료 — ${result.summaryKo}`);
  };

  const handleFollowMe = () => {
    const profile: readonly (readonly [number, number])[] = [
      [-0.08, -0.05],
      [0.08, -0.05],
      [0.08, 0.05],
      [-0.08, 0.05],
    ];
    const path: readonly (readonly [number, number, number])[] = [
      [-1.0, 0, 0],
      [1.0, 0, 0],
      [1.0, 0, -1.2],
      [1.0, 0.9, -1.2],
    ];
    const result = sweepProfileAlongPath(profile, path, { closedPath: false, groundAtY0: true });
    commitGeometry(result.geometry, `경로 따라 뽑기 완료 — ${result.summaryKo}`);
  };

  const handleSectionSlice = () => {
    const current = workingGeoRef.current;
    if (!current) return;
    const result = sliceGeometryWithSectionPlane(
      current,
      { normal: [0, 1, 0], constant: -sectionHeightM },
      { generateCap: true, groundAtY0: true },
    );
    commitGeometry(result.geometry, `단면 절단·캡 완료 — ${result.summaryKo}`);
  };

  const handleComponentArray = () => {
    const result =
      arrayMode === "linear"
        ? buildComponentArrayTransforms({
            mode: "linear",
            count: arrayCount,
            offsetM: [1.4, 0, 0],
            distribution: "step",
          })
        : buildComponentArrayTransforms({
            mode: "radial",
            count: arrayCount,
            centerM: [0, 0, 0],
            axis: "y",
            radiusM: 2.2,
            totalAngleDeg: 360,
            alignTangent: true,
          });
    setLastArraySummary(result.summaryKo);
    setStatusNote(result.summaryKo);
    onStatusMessage?.(result.summaryKo);
    onComponentArrayBuilt?.(result);
  };

  const handleMicroBevel = () => {
    const current = workingGeoRef.current;
    if (!current) return;
    const result = applyMicroBevelChamfer(current, bevelMm / 1000, bevelSegments, { groundAtY0: true });
    commitGeometry(result.geometry, `모서리 다듬기 완료 — ${result.summaryKo}`);
  };

  const handleSymmetricMirror = () => {
    const current = workingGeoRef.current;
    if (!current) return;
    const shifted = current.clone();
    try {
      if (mirrorAxis === "x") shifted.translate(0.35, 0, 0);
      else if (mirrorAxis === "z") shifted.translate(0, 0, 0.35);
      const result = applySymmetricMirrorGeometry(shifted, mirrorAxis, {
        pivot: 0,
        clipAcrossPlane: true,
        groundAtY0: true,
      });
      commitGeometry(result.geometry, `좌우 대칭 완료 — ${result.summaryKo}`);
    } finally {
      shifted.dispose();
    }
  };

  const handleSubdivide = () => {
    const current = workingGeoRef.current;
    if (!current) return;
    const result = subdivideGeometrySmooth(current, 1, subdivScheme, { groundAtY0: true });
    commitGeometry(result.geometry, `부드럽게 세분화 완료 — ${result.summaryKo}`);
  };

  const handleBooleanOp = () => {
    const current = workingGeoRef.current;
    if (!current) return;
    const cutter = new THREE.BoxGeometry(0.65, 0.85, 1.5);
    try {
      groundBufferGeometryToY0(cutter);
      cutter.translate(0.25, 0.55, 0);
      const result = applyBooleanMeshOperation(current, cutter, booleanKind, {
        resolution: 12,
        groundAtY0: true,
      });
      commitGeometry(result.geometry, `불리언 연산 완료 — ${result.summaryKo}`);
    } finally {
      cutter.dispose();
    }
  };

  const m = inspection.manifold;

  return (
    <section
      data-testid="studio-bg3d-modeling-pro-drawer"
      aria-label="Blender 및 SketchUp 고급 3D 모델링 도구"
      className="space-y-3 rounded-xl border border-line bg-panel p-3 text-xs text-fg [word-break:keep-all]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Wrench size={15} className="shrink-0 text-accent" aria-hidden />
          <h4 className="font-semibold text-fg">Blender · SketchUp 고급 3D 모델링</h4>
        </div>
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-modeling-reset-btn"
          onClick={handleResetBlock}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-medium text-fg-2 transition-colors hover:border-accent hover:text-fg motion-reduce:transition-none"
        >
          <RotateCcw size={13} aria-hidden />
          초기 블록
        </button>
      </div>

      {/* 실시간 매니폴드 · 트라이앵글 수 검증기 */}
      <div
        data-testid="bg3d-modeling-manifold-verifier"
        className="rounded-xl border border-line bg-card p-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="inline-flex items-center gap-1 font-semibold text-fg">
            <CheckCircle2
              size={14}
              className={m.isWatertightSolid ? "shrink-0 text-good" : "shrink-0 text-warn"}
              aria-hidden
            />
            실시간 매니폴드 검증기
          </span>
          <span
            data-testid="bg3d-modeling-manifold-status"
            className="text-[11px] font-semibold text-good tabular-nums"
          >
            {inspection.statusKo}
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px] text-fg-3 tabular-nums sm:grid-cols-4">
          <span>버텍스 {m.uniqueVertexCount}</span>
          <span>트라이앵글 {m.triangleCount}</span>
          <span>비다양체 {m.nonManifoldEdgeCount} · 퇴화 {m.degenerateTriangleCount}</span>
          <span>체적 {m.signedVolumeCubicMeters.toFixed(3)}m³</span>
        </div>
      </div>

      {/* SketchUp 계열 4종 */}
      <details className="rounded-xl border border-line bg-card" open>
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-2.5 py-2 font-semibold text-fg">
          <span className="inline-flex items-center gap-1.5">
            <Box size={14} className="shrink-0 text-accent" aria-hidden />
            SketchUp 건축 직관 모델링 (4종)
          </span>
          <span className="text-[11px] text-fg-3">압출·스윕·단면·배열</span>
        </summary>
        <div className="space-y-2.5 border-t border-line p-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-op-push-pull"
              onClick={handlePushPull}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
            >
              면 밀고 당기기
            </button>
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-op-follow-me"
              onClick={handleFollowMe}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
            >
              경로 따라 뽑기
            </button>
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-op-section-slice"
              onClick={handleSectionSlice}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
            >
              <Scissors size={13} aria-hidden />
              단면 절단·캡
            </button>
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-op-component-array"
              onClick={handleComponentArray}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
            >
              컴포넌트 배열 ({arrayCount}개)
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] text-fg-2 tabular-nums">
              <span>압출 거리 {pushPullMeters.toFixed(2)}m</span>
              <input
                type="range"
                aria-label="압출 거리"
                min={-0.35}
                max={1.2}
                step={0.05}
                value={pushPullMeters}
                onChange={(e) => setPushPullMeters(Number(e.currentTarget.value))}
                className="w-full accent-accent"
              />
            </label>
            <label className="space-y-1 text-[11px] text-fg-2 tabular-nums">
              <span>단면 절단 높이 {sectionHeightM.toFixed(2)}m</span>
              <input
                type="range"
                aria-label="단면 절단 높이"
                min={0.4}
                max={1.8}
                step={0.1}
                value={sectionHeightM}
                onChange={(e) => setSectionHeightM(Number(e.currentTarget.value))}
                className="w-full accent-accent"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(["linear", "radial"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={arrayMode === mode}
                onClick={() => setArrayMode(mode)}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-2.5 text-xs text-fg-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
              >
                {mode === "linear" ? "선형 배열" : "방사형 배열"}
              </button>
            ))}
            <label className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg-2 tabular-nums">
              <span>개수 {arrayCount}</span>
              <input
                type="range"
                aria-label="배열 개수"
                min={2}
                max={12}
                step={1}
                value={arrayCount}
                onChange={(e) => setArrayCount(Number(e.currentTarget.value))}
                className="w-20 accent-accent"
              />
            </label>
          </div>
          {lastArraySummary ? (
            <p data-testid="bg3d-op-array-readout" className="text-[11px] text-accent tabular-nums">
              {lastArraySummary}
            </p>
          ) : null}
        </div>
      </details>

      {/* Blender 계열 4종 */}
      <details className="rounded-xl border border-line bg-card">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-2.5 py-2 font-semibold text-fg">
          <span>Blender 정밀 메시 연산 (4종)</span>
          <span className="text-[11px] text-fg-3">베벨·대칭·세분화·불리언</span>
        </summary>
        <div className="space-y-2.5 border-t border-line p-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-op-micro-bevel"
              onClick={handleMicroBevel}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
            >
              모서리 다듬기
            </button>
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-op-symmetric-mirror"
              onClick={handleSymmetricMirror}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
            >
              좌우 대칭 ({mirrorAxis.toUpperCase()})
            </button>
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-op-subdivide"
              onClick={handleSubdivide}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
            >
              부드럽게 세분화
            </button>
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-op-boolean"
              onClick={handleBooleanOp}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel px-2.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none"
            >
              불리언 {booleanKind === "subtract" ? "차집합" : booleanKind === "union" ? "합집합" : "교집합"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] text-fg-2 tabular-nums">
              <span>베벨 폭 {bevelMm}mm · {bevelSegments}단</span>
              <input
                type="range"
                aria-label="모서리 베벨 폭"
                min={10}
                max={120}
                step={10}
                value={bevelMm}
                onChange={(e) => setBevelMm(Number(e.currentTarget.value))}
                className="w-full accent-accent"
              />
            </label>
            <div className="flex flex-wrap items-center gap-1">
              {([1, 2] as const).map((seg) => (
                <button
                  key={seg}
                  type="button"
                  aria-pressed={bevelSegments === seg}
                  onClick={() => setBevelSegments(seg)}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-2 text-xs text-fg-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
                >
                  {seg}단
                </button>
              ))}
              {(["x", "z"] as const).map((ax) => (
                <button
                  key={ax}
                  type="button"
                  aria-pressed={mirrorAxis === ax}
                  onClick={() => setMirrorAxis(ax)}
                  className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-2 text-xs text-fg-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
                >
                  {ax.toUpperCase()}축
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {(["loop", "catmull-clark"] as const).map((scheme) => (
              <button
                key={scheme}
                type="button"
                aria-pressed={subdivScheme === scheme}
                onClick={() => setSubdivScheme(scheme)}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-2.5 text-xs text-fg-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
              >
                {scheme === "loop" ? "Loop" : "Catmull-Clark"}
              </button>
            ))}
            {(["subtract", "union", "intersect"] as const).map((op) => (
              <button
                key={op}
                type="button"
                aria-pressed={booleanKind === op}
                onClick={() => setBooleanKind(op)}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line bg-panel px-2.5 text-xs text-fg-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
              >
                {op === "subtract" ? "차집합" : op === "union" ? "합집합" : "교집합"}
              </button>
            ))}
          </div>
        </div>
      </details>

      <p role="status" data-testid="bg3d-modeling-status" className="text-xs text-fg-2">
        {statusNote}
      </p>
    </section>
  );
}
