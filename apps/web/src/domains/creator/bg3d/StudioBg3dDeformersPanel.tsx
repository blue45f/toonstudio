import { Move3d, Sparkles } from "lucide-react";
import React, { useMemo, useState } from "react";

import {
  planCsgBooleanOperation,
  type CsgBooleanOperation,
  type CsgBooleanPlanResult,
} from "../scene-3d/studio-3d-csg-boolean-engine";
import type {
  DeformerKind,
  MeshDeformerConfig,
} from "../scene-3d/studio-3d-mesh-deformers";

export interface StudioBg3dDeformersPanelProps {
  readonly onApplyDeformer?: (config: MeshDeformerConfig) => void;
  readonly onApplyCsgBooleanPlan?: (plan: CsgBooleanPlanResult) => void;
}

const CSG_OPERATIONS: readonly {
  readonly id: CsgBooleanOperation;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "union", labelKo: "합집합 (Union)" },
  { id: "difference", labelKo: "차집합 커팅 (Cut)" },
  { id: "intersection", labelKo: "교집합 (Intersect)" },
  { id: "smooth-clay-blend", labelKo: "소프트 클레이 블렌드" },
]);

export function StudioBg3dDeformersPanel({
  onApplyDeformer,
  onApplyCsgBooleanPlan,
}: StudioBg3dDeformersPanelProps): React.JSX.Element {
  const [kind, setKind] = useState<DeformerKind>("bend");
  const [strength, setStrength] = useState<number>(45);
  const [axis, setAxis] = useState<"x" | "y" | "z">("y");
  const [csgOperation, setCsgOperation] = useState<CsgBooleanOperation>("smooth-clay-blend");
  const [clayBlendRadius, setClayBlendRadius] = useState<number>(0.35);

  const csgPlan = useMemo(
    () =>
      planCsgBooleanOperation({
        operation: csgOperation,
        target: {
          id: "target-mesh",
          type: "box",
          position: [0, 0.8, 0],
          rotation: [0, 0, 0],
          scale: [2, 1.6, 2],
        },
        cutter: {
          id: "cutter-primitive",
          type: "sphere",
          position: [0.4, 1.1, 0.3],
          rotation: [0, 0, 0],
          scale: [1.2, 1.2, 1.2],
        },
        smoothBlendRadius: csgOperation === "smooth-clay-blend" ? clayBlendRadius : 0,
      }),
    [csgOperation, clayBlendRadius],
  );

  const handleKindSelect = (selectedKind: DeformerKind) => {
    setKind(selectedKind);
    let defaultStrength = 45;
    if (selectedKind === "twist") defaultStrength = 90;
    if (selectedKind === "taper") defaultStrength = -0.5;
    if (selectedKind === "squash-stretch") defaultStrength = 0.3;
    if (selectedKind === "noise-displacement") defaultStrength = 1.0;

    setStrength(defaultStrength);
    onApplyDeformer?.({
      kind: selectedKind,
      strength: defaultStrength,
      axis,
      minBound: -1.0,
      maxBound: 1.0,
    });
  };

  const handleStrengthChange = (val: number) => {
    setStrength(val);
    onApplyDeformer?.({
      kind,
      strength: val,
      axis,
      minBound: -1.0,
      maxBound: 1.0,
    });
  };

  const handleAxisSelect = (selectedAxis: "x" | "y" | "z") => {
    setAxis(selectedAxis);
    onApplyDeformer?.({
      kind,
      strength,
      axis: selectedAxis,
      minBound: -1.0,
      maxBound: 1.0,
    });
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      <div className="flex items-center justify-between border-b border-line pb-2">
        <div className="flex items-center gap-1.5 font-bold text-fg">
          <Move3d className="size-4 text-accent" />
          <span>3D 절차적 디포머 (Mesh Deformers)</span>
        </div>
        <span className="rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[0.68rem] text-accent font-semibold">
          {axis.toUpperCase()}축 기준
        </span>
      </div>

      {/* Deformer Types */}
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { id: "bend" as const, label: "구부리기 (Bend)", desc: "아치 및 곡선으로 휘어짐" },
          { id: "twist" as const, label: "비틀기 (Twist)", desc: "스파이럴 회전 꼬임 효과" },
          { id: "taper" as const, label: "테이퍼 (Taper)", desc: "끝단 뾰족화 또는 나팔형 팽창" },
          { id: "squash-stretch" as const, label: "스쿼시 & 스트레치", desc: "만화적 체적 보존 탄성 과장" },
          { id: "noise-displacement" as const, label: "노이즈 왜곡 (Noise)", desc: "유기적인 표면 파동 변형" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleKindSelect(item.id)}
            className={`flex flex-col items-start rounded-lg border p-2 text-left transition-all ${
              kind === item.id
                ? "border-accent bg-accent/10 font-bold text-accent shadow-sm"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
            }`}
          >
            <span className="text-[0.72rem] leading-tight">{item.label}</span>
            <span className="mt-0.5 text-[0.62rem] text-fg-3 line-clamp-1">{item.desc}</span>
          </button>
        ))}
      </div>

      {/* Deformation Parameters */}
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.68rem] text-fg-2">변형 강도 (Strength / Angle):</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={kind === "bend" || kind === "twist" ? "-180" : "-1"}
              max={kind === "bend" || kind === "twist" ? "180" : "2"}
              step={kind === "bend" || kind === "twist" ? "5" : "0.05"}
              value={strength}
              onChange={(e) => handleStrengthChange(parseFloat(e.target.value))}
              className="h-1.5 w-24 cursor-pointer accent-accent"
            />
            <span className="w-12 text-right font-mono text-xs font-bold text-fg">
              {strength}
              {kind === "bend" || kind === "twist" ? "°" : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[0.68rem] text-fg-2">변형 기준 축 (Deform Axis):</span>
          <div className="flex gap-1">
            {(["x", "y", "z"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => handleAxisSelect(a)}
                className={`w-7 rounded py-0.5 font-mono text-[0.68rem] font-bold uppercase transition-all ${
                  axis === a
                    ? "bg-accent text-on-accent"
                    : "border border-line bg-raised text-fg-2 hover:text-fg"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CSG Boolean & Smooth Clay Blend Section */}
      <div
        className="flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5"
        data-testid="bg3d-csg-boolean-section"
      >
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] font-bold text-fg">CSG 불리언 & 클레이 블렌드 연산</span>
          <span
            data-testid="bg3d-csg-plan-readout"
            className="font-mono text-[0.64rem] text-accent"
          >
            {csgPlan.estimatedTriangles}삼각형 · {csgPlan.estimatedVertices}정점 ·{" "}
            {csgPlan.isManifold ? "매니폴드" : "비매니폴드"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {CSG_OPERATIONS.map((op) => (
            <button
              key={op.id}
              type="button"
              data-testid={`bg3d-csg-op-${op.id}`}
              onClick={() => {
                setCsgOperation(op.id);
                const nextPlan = planCsgBooleanOperation({
                  operation: op.id,
                  target: {
                    id: "target-mesh",
                    type: "box",
                    position: [0, 0.8, 0],
                    rotation: [0, 0, 0],
                    scale: [2, 1.6, 2],
                  },
                  cutter: {
                    id: "cutter-primitive",
                    type: "sphere",
                    position: [0.4, 1.1, 0.3],
                    rotation: [0, 0, 0],
                    scale: [1.2, 1.2, 1.2],
                  },
                  smoothBlendRadius: op.id === "smooth-clay-blend" ? clayBlendRadius : 0,
                });
                onApplyCsgBooleanPlan?.(nextPlan);
              }}
              className={`rounded border px-2 py-1 text-left text-[0.66rem] transition-all ${
                csgOperation === op.id
                  ? "border-accent bg-accent/10 font-bold text-accent"
                  : "border-line bg-raised/50 text-fg-2 hover:text-fg"
              }`}
            >
              {op.labelKo}
            </button>
          ))}
        </div>
        {csgOperation === "smooth-clay-blend" ? (
          <div className="flex items-center justify-between text-[0.65rem] text-fg-3">
            <span>클레이 블렌드 반경: {clayBlendRadius.toFixed(2)}m</span>
            <input
              type="range"
              min="0.05"
              max="1.0"
              step="0.05"
              value={clayBlendRadius}
              onChange={(e) => setClayBlendRadius(parseFloat(e.target.value))}
              className="h-1.5 w-24 cursor-pointer accent-accent"
            />
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() =>
          onApplyDeformer?.({
            kind,
            strength,
            axis,
            minBound: -1.0,
            maxBound: 1.0,
          })
        }
        className="flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[0.72rem] font-bold text-on-accent shadow-sm transition-all hover:bg-accent/90"
      >
        <Sparkles className="size-3.5" />
        <span>선택 3D 메쉬에 디포머 변형 적용</span>
      </button>
    </div>
  );
}
