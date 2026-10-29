import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import { vrmGenerateStatusText } from "../status-i18n/studio-vrm-generate-status-i18n";
import { readAvatarForgeVrmAuthoring, withAvatarForgeVrmAuthoring } from "./studio-vrm-avatar-forge-authoring";
import { buildStudioVrmExpressionPreviews, type StudioVrmExpressionPreview } from "./studio-vrm-generate-expression-preview";
import {
  addStudioVrmCustomExpression,
  removeStudioVrmCustomExpression,
  resetStudioVrmPresetExpression,
  setStudioVrmCustomExpressionEyeSide,
  setStudioVrmCustomExpressionParam,
  setStudioVrmPresetExpressionParam,
  STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES,
  STUDIO_VRM_EDITABLE_EXPRESSION_PRESETS,
  STUDIO_VRM_EXPRESSION_PARAM_KEYS,
  STUDIO_VRM_EXPRESSION_PARAMS,
  STUDIO_VRM_EXPRESSION_PARTS,
  STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS,
  studioVrmCustomExpressionLabel,
  type StudioVrmEditableExpressionPreset,
  type StudioVrmExpressionAuthoring,
  type StudioVrmExpressionPart,
} from "./studio-vrm-generate-expressions";
import { StudioVrmForgeRangeControl } from "./StudioVrmForgeRangeControl";

import type { AvatarForgeState } from "./studio-vrm-avatar-forge";

type ExpressionTarget =
  | { readonly kind: "preset"; readonly name: StudioVrmEditableExpressionPreset }
  | { readonly kind: "custom"; readonly name: string };

const ALL_PARTS: readonly StudioVrmExpressionPart[] = ["brow", "eye", "mouth"];
const EMOTION_PRESETS = STUDIO_VRM_EDITABLE_EXPRESSION_PRESETS.filter((spec) => spec.parts.length > 1);
const MOUTH_PRESETS = STUDIO_VRM_EDITABLE_EXPRESSION_PRESETS.filter((spec) => spec.parts.length === 1);
const EYE_SIDE_OPTIONS = [
  { id: "both", label: "양쪽 눈" },
  { id: "left", label: "왼쪽 눈만" },
  { id: "right", label: "오른쪽 눈만" },
] as const;

function chipClass(selected: boolean): string {
  return `inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-[0.62rem] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 ${
    selected ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised"
  }`;
}

function ExpressionFace({ preview, label }: { readonly preview: StudioVrmExpressionPreview; readonly label: string }) {
  return (
    <figure className="min-w-0">
      <svg
        role="img"
        aria-label={label}
        viewBox={preview.viewBox}
        className="h-24 w-full rounded-lg border border-line/70 bg-panel/60"
        data-studio-vrm-expression-preview={label}
      >
        <ellipse
          cx={preview.head.cx}
          cy={preview.head.cy}
          rx={preview.head.rx}
          ry={preview.head.ry}
          fill={preview.skinColor}
          stroke="var(--color-line-strong)"
          strokeWidth={preview.head.rx * 0.02}
        />
        {preview.shapes.map((shape, index) => (
          <path
            key={index}
            d={shape.path}
            fill={shape.color}
            stroke={shape.color}
            strokeWidth={preview.head.rx * 0.004}
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <figcaption className="mt-1 truncate text-center text-[0.58rem] font-bold text-fg-3">{label}</figcaption>
    </figure>
  );
}

export interface StudioVrmGenerateExpressionEditorProps {
  readonly state: AvatarForgeState;
  /** 실제로 생성될 상태(기본 스타일 대체 포함). 미리보기는 이 얼굴로 그리고, 편집은 `state` 에 건다. */
  readonly previewState?: AvatarForgeState;
  readonly disabled?: boolean;
  readonly onChange: (state: AvatarForgeState) => void;
}

/**
 * 생성 VRM 의 표정 편집기. VRoid Studio 의 표정 편집처럼 프리셋 표정을 눈썹·눈·입 슬라이더로 다듬고,
 * VRM 프리셋에 없는 연기 표정은 템플릿에서 커스텀 표정으로 더한다. 값은 생성 레시피에만 쓰인다.
 */
export function StudioVrmGenerateExpressionEditor({
  state,
  previewState = state,
  disabled = false,
  onChange,
}: StudioVrmGenerateExpressionEditorProps) {
  const [target, setTarget] = useState<ExpressionTarget>({ kind: "preset", name: "happy" });
  const [notice, setNotice] = useState<string | null>(null);
  const authoring = readAvatarForgeVrmAuthoring(state)?.expressions;
  const custom = authoring?.custom ?? [];
  const selectedCustom = target.kind === "custom" ? custom.find((entry) => entry.name === target.name) : undefined;
  // 지운 커스텀 표정을 가리키고 있으면 첫 프리셋으로 돌아간다.
  const resolvedTarget: ExpressionTarget = target.kind === "custom" && !selectedCustom
    ? { kind: "preset", name: "happy" }
    : target;
  const presetSpec = resolvedTarget.kind === "preset"
    ? STUDIO_VRM_EDITABLE_EXPRESSION_PRESETS.find((spec) => spec.name === resolvedTarget.name)
    : undefined;
  const parts = presetSpec?.parts ?? ALL_PARTS;
  const delta = resolvedTarget.kind === "preset"
    ? authoring?.presets?.[resolvedTarget.name] ?? {}
    : selectedCustom?.delta ?? {};
  const targetLabel = presetSpec?.label ?? studioVrmCustomExpressionLabel(resolvedTarget.name) ?? resolvedTarget.name;

  // 부모가 렌더마다 새 상태 객체를 만들므로 객체 동일성 대신 직렬화 값으로 메시를 다시 구울지 정한다.
  const deferredStateKey = useDeferredValue(JSON.stringify(previewState));
  const deferredName = useDeferredValue(resolvedTarget.name);
  const previews = useMemo(
    () => buildStudioVrmExpressionPreviews(JSON.parse(deferredStateKey) as AvatarForgeState, [null, deferredName]),
    [deferredStateKey, deferredName],
  );

  const emit = (expressions: StudioVrmExpressionAuthoring | undefined) => {
    onChange(withAvatarForgeVrmAuthoring(state, { expressions }));
  };

  const updateParam = (key: (typeof STUDIO_VRM_EXPRESSION_PARAM_KEYS)[number], value: number) => {
    setNotice(null);
    emit(resolvedTarget.kind === "preset"
      ? setStudioVrmPresetExpressionParam(authoring, resolvedTarget.name, key, value)
      : setStudioVrmCustomExpressionParam(authoring, resolvedTarget.name, key, value));
  };

  const editedPresetCount = Object.keys(authoring?.presets ?? {}).length;

  return (
    <div className="space-y-3" data-studio-vrm-expression-editor="">
      <div className="space-y-1.5">
        <p className="text-[0.6rem] font-bold text-fg-3">기본 표정(VRM 프리셋)</p>
        <div className="flex flex-wrap gap-1.5">
          {[...EMOTION_PRESETS, ...MOUTH_PRESETS].map((spec) => {
            const selected = resolvedTarget.kind === "preset" && resolvedTarget.name === spec.name;
            const edited = Boolean(authoring?.presets?.[spec.name]);
            return (
              <button
                key={spec.name}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                data-studio-vrm-expression-target={spec.name}
                className={chipClass(selected)}
                onClick={() => setTarget({ kind: "preset", name: spec.name })}
              >
                {spec.label}
                {edited ? (
                  <>
                    <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                    <span className="sr-only">(편집됨)</span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="text-[0.58rem] text-fg-3">
          편집한 기본 표정 {editedPresetCount}개 · 입모양 표정은 대사 립싱크에 쓰여 입만 조정할 수 있어요.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[0.6rem] font-bold text-fg-3">커스텀 표정 {custom.length}/{STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS}</p>
        {custom.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {custom.map((entry) => {
              const selected = resolvedTarget.kind === "custom" && resolvedTarget.name === entry.name;
              return (
                <button
                  key={entry.name}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  data-studio-vrm-expression-target={entry.name}
                  className={chipClass(selected)}
                  onClick={() => setTarget({ kind: "custom", name: entry.name })}
                >
                  {studioVrmCustomExpressionLabel(entry.name) ?? entry.name}
                </button>
              );
            })}
          </div>
        ) : null}
        <details className="rounded-xl border border-line/70 bg-card/55 p-2">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 text-[0.62rem] font-bold text-fg-2 [&::-webkit-details-marker]:hidden">
            <Plus size={12} aria-hidden />
            커스텀 표정 추가
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                disabled={disabled || custom.length >= STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS}
                aria-label={`${template.label} 커스텀 표정 추가: ${template.hint}`}
                data-studio-vrm-expression-template={template.id}
                className="min-h-11 rounded-lg border border-line bg-card px-2 py-1.5 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                onClick={() => {
                  const added = addStudioVrmCustomExpression(authoring, template.id);
                  if (!added.name) {
                    setNotice(vrmGenerateStatusText(
                      "studio.vrmGenerateStatus.customExpressionLimit",
                      { max: STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS },
                      "커스텀 표정은 {max}개까지 둘 수 있어요.",
                    ));
                    return;
                  }
                  setNotice(null);
                  emit(added.authoring);
                  setTarget({ kind: "custom", name: added.name });
                }}
              >
                <span className="block text-[0.64rem] font-extrabold text-fg">{template.label}</span>
                <span className="block truncate text-[0.56rem] text-fg-3">{template.hint}</span>
              </button>
            ))}
          </div>
        </details>
        {notice ? <p className="text-[0.6rem] font-bold text-danger">{notice}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ExpressionFace preview={previews[0]} label="무표정" />
        <ExpressionFace preview={previews[1]} label={`${targetLabel} 편집 결과`} />
      </div>

      {resolvedTarget.kind === "custom" && selectedCustom ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${targetLabel} 눈 조정 범위`}>
          {EYE_SIDE_OPTIONS.map((option) => {
            const selected = (selectedCustom.eyeSide ?? "both") === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                className={chipClass(selected)}
                onClick={() => emit(setStudioVrmCustomExpressionEyeSide(authoring, selectedCustom.name, option.id))}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {STUDIO_VRM_EXPRESSION_PARTS.filter((part) => parts.includes(part.id)).map((part) => (
        <fieldset key={part.id} className="space-y-1.5">
          <legend className="text-[0.62rem] font-extrabold text-fg-2">{part.label}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {STUDIO_VRM_EXPRESSION_PARAM_KEYS.filter((key) => STUDIO_VRM_EXPRESSION_PARAMS[key].part === part.id).map((key) => {
              const spec = STUDIO_VRM_EXPRESSION_PARAMS[key];
              return (
                <StudioVrmForgeRangeControl
                  key={key}
                  label={`${targetLabel} ${spec.label}`}
                  hint={`${spec.lowHint} ↔ ${spec.highHint}`}
                  value={delta[key] ?? 0}
                  minimum={spec.min}
                  maximum={spec.max}
                  step={spec.step}
                  defaultValue={0}
                  disabled={disabled}
                  onChange={(value) => updateParam(key, value)}
                />
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-[0.58rem] leading-relaxed text-fg-3">
          편집한 표정은 VRM 생성 때 모프 타깃으로 구워져 포저 표정 목록에 나타납니다. 조정하지 않은 커스텀
          표정은 내보내지 않아요.
        </p>
        {resolvedTarget.kind === "preset" ? (
          <button
            type="button"
            disabled={disabled || !authoring?.presets?.[resolvedTarget.name]}
            className={chipClass(false)}
            onClick={() => emit(resetStudioVrmPresetExpression(authoring, resolvedTarget.name))}
          >
            <RotateCcw size={12} aria-hidden />
            {targetLabel} 기본으로
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            className={chipClass(false)}
            onClick={() => {
              emit(removeStudioVrmCustomExpression(authoring, resolvedTarget.name));
              setTarget({ kind: "preset", name: "happy" });
            }}
          >
            <Trash2 size={12} aria-hidden />
            {targetLabel} 삭제
          </button>
        )}
      </div>
    </div>
  );
}
