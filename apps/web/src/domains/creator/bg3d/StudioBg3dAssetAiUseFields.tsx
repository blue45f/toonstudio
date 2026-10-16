import { useId } from "react";

import { cx } from "./studio-bg3d-asset-panel-styles";

import type { StudioBg3dAssetAiGenerated, StudioBg3dAssetAiTraining } from "./studio-bg3d-asset-metadata";

export type StudioBg3dAssetAiGeneratedChoice = StudioBg3dAssetAiGenerated | "unknown";
export type StudioBg3dAssetAiTrainingChoice = StudioBg3dAssetAiTraining | "unknown";

interface RadioOption<V extends string> {
  readonly value: V;
  readonly label: string;
}

const AI_GENERATED_OPTIONS: readonly RadioOption<StudioBg3dAssetAiGeneratedChoice>[] = [
  { value: "yes", label: "AI로 만듦" },
  { value: "no", label: "AI 아님" },
  { value: "unknown", label: "모름" },
];
const AI_TRAINING_OPTIONS: readonly RadioOption<StudioBg3dAssetAiTrainingChoice>[] = [
  { value: "allowed", label: "허용" },
  { value: "prohibited", label: "금지" },
  { value: "unknown", label: "모름" },
];

function RadioRow<V extends string>({
  name,
  legend,
  options,
  value,
  onChange,
}: {
  readonly name: string;
  readonly legend: string;
  readonly options: readonly RadioOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
}) {
  return (
    <fieldset className="mt-2 min-w-0 border-0 p-0">
      <legend className="p-0 text-[0.68rem] font-bold text-fg-2">{legend}</legend>
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {options.map((option) => (
          <label key={option.value} className="relative block">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              className="peer sr-only"
              onChange={() => onChange(option.value)}
            />
            <span
              className={cx(
                "flex min-h-11 items-center justify-center rounded-lg border border-line bg-panel px-1.5 text-center text-[0.66rem] font-bold text-fg-2 transition-colors hover:bg-raised sm:min-h-9",
                "peer-checked:border-accent/55 peer-checked:bg-accent-soft peer-checked:text-accent",
                "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface StudioBg3dAssetAiUseFieldsProps {
  readonly aiGenerated: StudioBg3dAssetAiGeneratedChoice;
  readonly aiTraining: StudioBg3dAssetAiTrainingChoice;
  readonly onAiGeneratedChange: (value: StudioBg3dAssetAiGeneratedChoice) => void;
  readonly onAiTrainingChange: (value: StudioBg3dAssetAiTrainingChoice) => void;
}

/** 가져오기 권리 폼의 AI 사용 표기. 둘 다 선택이며 기본값은 "모름"(= 미확인으로 저장·표시). */
export function StudioBg3dAssetAiUseFields({
  aiGenerated,
  aiTraining,
  onAiGeneratedChange,
  onAiTrainingChange,
}: StudioBg3dAssetAiUseFieldsProps) {
  const groupId = useId();
  return (
    <div className="mt-2.5 rounded-lg border border-line bg-card/50 px-2.5 py-2">
      <p className="text-[0.68rem] font-bold text-fg">AI 사용 표기 (선택)</p>
      <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3">
        모르면 '모름'으로 두세요. 기록하지 않은 소재는 목록에서 'AI 미확인'으로 표시됩니다.
      </p>
      <RadioRow
        name={`${groupId}-ai-generated`}
        legend="AI로 생성한 소재인가요?"
        options={AI_GENERATED_OPTIONS}
        value={aiGenerated}
        onChange={onAiGeneratedChange}
      />
      <RadioRow
        name={`${groupId}-ai-training`}
        legend="라이선스가 AI 학습 이용을 허용하나요?"
        options={AI_TRAINING_OPTIONS}
        value={aiTraining}
        onChange={onAiTrainingChange}
      />
    </div>
  );
}
