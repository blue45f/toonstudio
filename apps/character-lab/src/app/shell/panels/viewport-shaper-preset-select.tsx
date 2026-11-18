import { SHAPER_BUILTIN_ARCHETYPE_PRESETS, SHAPER_BUILTIN_PART_PRESETS, SHAPER_BUILTIN_POSE_PRESETS, WEBTOON_SIGNATURE_POSES } from "./shaper-control-points";
import { SHAPER_BUILTIN_BODY_PRESETS, SHAPER_BUILTIN_FACE_PRESETS } from "./viewport-interactions";

interface ViewportShaperPresetSelectProps {
  readonly value: string;
  readonly onSelect: (value: string) => void;
}

export function ViewportShaperPresetSelect({ value, onSelect }: ViewportShaperPresetSelectProps) {
  return (
    <select className="cl-viewport-select" aria-label="SHAPER 내장 프리셋" value={value} title="SHAPER BuiltInData 풀세트 아키타입·체형·두상·이목구비·포즈를 즉시 적용합니다" onChange={(event) => onSelect(event.target.value)}>
      <option value="">SHAPER 프리셋 적용…</option>
      <optgroup label="한국 웹툰 시그니처 연기·액션 (포즈+손+시선+표정)">
        {Object.values(WEBTOON_SIGNATURE_POSES).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
      </optgroup>
      <optgroup label="SHAPER 풀세트 아키타입 (헤어+의상+체형+포즈)">
        {Object.values(SHAPER_BUILTIN_ARCHETYPE_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
      </optgroup>
      <optgroup label="SHAPER 정본 체형 (BuiltInData/body)">
        {Object.values(SHAPER_BUILTIN_BODY_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
      </optgroup>
      <optgroup label="SHAPER 정본 두상 (BuiltInData/head)">
        {Object.values(SHAPER_BUILTIN_FACE_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
      </optgroup>
      <optgroup label="SHAPER 이목구비 파츠 (BuiltInData/parts)">
        {Object.values(SHAPER_BUILTIN_PART_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
      </optgroup>
      <optgroup label="SHAPER 정본 포즈 (BuiltInData/pose)">
        {Object.values(SHAPER_BUILTIN_POSE_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
      </optgroup>
    </select>
  );
}
