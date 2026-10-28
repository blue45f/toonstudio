import { Building2, Plus } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useT } from "@/shared/lib/i18n";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import {
  buildSketchUpArchitecturalComponentPrimitives,
  type SketchUpArchitecturalComponentKind,
} from "./studio-bg3d-sketchup-full-engine";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";

export interface StudioBg3dArchitecturalModelingPanelProps {
  readonly disabled?: boolean;
  readonly onStatusChange?: (messageKo: string) => void;
  readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
}

const COMPONENT_OPTIONS: readonly { readonly id: SketchUpArchitecturalComponentKind; readonly labelKo: string }[] = [
  { id: "staircase-straight", labelKo: "직선형 계단" },
  { id: "staircase-l-landing", labelKo: "L자형 참 계단" },
  { id: "staircase-spiral", labelKo: "나선형 계단" },
  { id: "roof-gable", labelKo: "박공 지붕" },
  { id: "roof-hip", labelKo: "모임 지붕" },
  { id: "roof-hanok", labelKo: "한옥 팔작 지붕" },
  { id: "window-bay", labelKo: "돌출 베이 윈도우" },
  { id: "door-arch", labelKo: "아치형 정문" },
  { id: "street-colonnade", labelKo: "열주 회랑" },
];

type InputKey = "width" | "height" | "depth" | "x" | "y" | "z";

const INPUT_FIELDS: readonly {
  readonly key: InputKey;
  readonly labelKo: string;
  readonly min: number;
  readonly max: number;
}[] = [
  { key: "width", labelKo: "가로 (m)", min: 0.8, max: 24 },
  { key: "height", labelKo: "높이 (m)", min: 0.8, max: 18 },
  { key: "depth", labelKo: "깊이 (m)", min: 0.6, max: 24 },
  { key: "x", labelKo: "배치 X (m)", min: -1000, max: 1000 },
  { key: "y", labelKo: "배치 Y (m)", min: -1000, max: 1000 },
  { key: "z", labelKo: "배치 Z (m)", min: -1000, max: 1000 },
];

/** 건축 요소를 치수와 위치에 맞춰 만들고 실제 장면의 편집 명령으로 배치한다. */
export function StudioBg3dArchitecturalModelingPanel({
  disabled = false,
  onStatusChange,
  onInsertScenePrimitives,
}: StudioBg3dArchitecturalModelingPanelProps) {
  const t = useT();
  const inputId = useId();
  const [kind, setKind] = useState<SketchUpArchitecturalComponentKind>("staircase-straight");
  const [count, setCount] = useState(8);
  const [inputs, setInputs] = useState<Record<InputKey, string>>({
    width: "3.6", height: "3.2", depth: "4.2", x: "0", y: "0", z: "0",
  });
  const [status, setStatus] = useState<string | null>(null);
  const usesDepth = kind !== "staircase-spiral";
  const usesCount = kind.startsWith("staircase-") || kind === "street-colonnade";
  const values = {
    width: Number(inputs.width), height: Number(inputs.height), depth: Number(inputs.depth),
    x: Number(inputs.x), y: Number(inputs.y), z: Number(inputs.z),
  };
  const invalidField = INPUT_FIELDS.find(({ key, min, max }) => (key !== "depth" || usesDepth)
    && (inputs[key].trim() === "" || !Number.isFinite(values[key]) || values[key] < min || values[key] > max));
  const validationError = invalidField
    ? t("studio.bg3d.architecture.invalidInput", {
      label: t(`studio.bg3d.architecture.field.${invalidField.key}`, invalidField.labelKo),
      min: invalidField.min, max: invalidField.max,
    }, "{label}에 {min}~{max} 사이의 숫자를 입력하세요.")
    : null;
  const depthMeters = usesDepth ? values.depth : 4.2;
  const result = useMemo(() => validationError ? null : buildSketchUpArchitecturalComponentPrimitives({
    kind, widthMeters: values.width, heightMeters: values.height, depthMeters,
    stepOrBayCount: count,
  }), [kind, count, validationError, values.width, values.height, depthMeters]);

  const updateStatus = (messageKo: string) => {
    setStatus(messageKo);
    onStatusChange?.(messageKo);
  };
  const insert = () => {
    if (disabled || validationError || !result || !onInsertScenePrimitives) return;
    const primitives: BgPrimitive[] = result.primitives.map((primitive) => ({
      ...primitive,
      position: [primitive.position[0] + values.x, primitive.position[1] + values.y, primitive.position[2] + values.z],
    }));
    let inserted: boolean;
    try {
      inserted = onInsertScenePrimitives(primitives, result.labelKo);
    } catch {
      updateStatus(t("studio.bg3d.architecture.insertError", "건축 요소를 배치하지 못했습니다. 장면 상태를 확인한 뒤 다시 시도하세요."));
      return;
    }
    updateStatus(inserted
      ? t("studio.bg3d.architecture.inserted", {
        label: t(`studio.bg3d.architecture.kind.${kind}`, COMPONENT_OPTIONS.find((option) => option.id === kind)?.labelKo ?? result.labelKo),
        count: primitives.length,
      }, "{label} {count}개 요소를 현재 3D 장면에 배치했습니다.")
      : t("studio.bg3d.architecture.insertRejected", "건축 요소를 배치하지 못했습니다. 장면의 편집 잠금과 도형 한도를 확인하세요."));
  };

  return (
    <section data-testid="bg3d-architectural-modeling-panel" aria-label={t("studio.bg3d.architecture.title", "배경 건축 도구")} className="space-y-3 rounded-xl border border-line bg-card p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <Building2 className="size-4 text-accent" aria-hidden />{t("studio.bg3d.architecture.title", "배경 건축 도구")}
      </h3>
      <p className="text-xs text-fg-2">{t("studio.bg3d.architecture.description", "계단·지붕·창호·회랑을 만들고 장면에 배치하세요. 배치한 요소는 3D 편집기에서 선택하고 이동할 수 있습니다.")}</p>
      <p className="text-xs text-fg-2">{t("studio.bg3d.architecture.dimensionScope", "치수는 기본 부품과 배치 간격의 기준입니다. 처마·회전 계단을 포함한 전체 외곽 크기는 입력값과 다를 수 있습니다.")}</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="group" aria-label={t("studio.bg3d.architecture.kindLabel", "건축 요소 종류")}>
        {COMPONENT_OPTIONS.map((option) => (
          <button key={option.id} type="button" disabled={disabled} aria-pressed={kind === option.id}
            data-testid={`sketchup-arch-kind-${option.id}`} onClick={() => setKind(option.id)}
            className={`min-h-11 rounded-lg border px-2 py-1.5 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${kind === option.id ? "border-accent bg-accent/15 font-bold text-accent" : "border-line bg-panel text-fg-2"}`}>
            {t(`studio.bg3d.architecture.kind.${option.id}`, option.labelKo)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {INPUT_FIELDS.map(({ key, labelKo, min, max }) => (
          <label key={key} htmlFor={`${inputId}-${key}`} className="space-y-1 text-xs text-fg-2">
            <span>{t(`studio.bg3d.architecture.field.${key}`, labelKo)}</span>
            <input id={`${inputId}-${key}`} type="number" min={min} max={max} step="any" disabled={disabled || (key === "depth" && !usesDepth)}
              value={inputs[key]} aria-invalid={invalidField?.key === key}
              aria-describedby={key === "depth" && !usesDepth ? `${inputId}-depth-unused` : invalidField?.key === key ? `${inputId}-error` : undefined}
              onChange={(event) => setInputs((previous) => ({ ...previous, [key]: event.target.value }))}
              className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
          </label>
        ))}
      </div>
      {!usesDepth ? <p id={`${inputId}-depth-unused`} className="text-xs text-fg-2">{t("studio.bg3d.architecture.depthUnused", "나선형 계단은 가로를 기준으로 원형 배치하므로 깊이 입력을 사용하지 않습니다.")}</p> : null}
      <label htmlFor={`${inputId}-count`} className="block space-y-1 text-xs text-fg-2">
        <span>{t("studio.bg3d.architecture.count", { count }, "계단 단수 / 열주 경간 수: {count}")}</span>
        <input id={`${inputId}-count`} type="range" min="3" max="24" step="1" disabled={disabled || !usesCount}
          aria-describedby={!usesCount ? `${inputId}-count-unused` : undefined}
          aria-label={t("studio.bg3d.architecture.countLabel", "건축 컴포넌트 분할 수")} value={count}
          onChange={(event) => setCount(Number(event.target.value))} className="w-full accent-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
      </label>
      {!usesCount ? <p id={`${inputId}-count-unused`} className="text-xs text-fg-2">{t("studio.bg3d.architecture.countUnused", "분할 수는 계단 단수와 열주 회랑 경간에만 사용합니다. 선택한 건축 요소에는 적용하지 않습니다.")}</p> : null}
      {validationError ? <p id={`${inputId}-error`} role="alert" className="text-xs text-danger">{validationError}</p> : null}
      {!onInsertScenePrimitives ? <p className="text-xs text-fg-2">{t("studio.bg3d.architecture.noScene", "3D 배경 편집기에서 장면을 열면 건축 요소를 배치할 수 있습니다.")}</p> : null}
      <button type="button" data-testid="sketchup-arch-insert-scene-btn"
        disabled={disabled || !onInsertScenePrimitives || Boolean(validationError)} onClick={insert}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
        <Plus className="size-4" aria-hidden />{t("studio.bg3d.architecture.insert", "현재 3D 장면에 건축 요소 배치")}{result ? t("studio.bg3d.architecture.elementCount", { count: result.primitiveCount }, " ({count}개)") : ""}
      </button>
      <p role="status" aria-live="polite" data-testid="bg3d-architecture-status" className="text-xs text-fg-2">{status ?? t("studio.bg3d.architecture.ready", "건축 요소를 고른 뒤 치수와 배치 위치를 입력하세요.")}</p>
    </section>
  );
}
