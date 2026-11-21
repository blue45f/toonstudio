import { KWEBTOON_BUILTIN_ARCHETYPE_PRESETS, SHAPER_BUILTIN_ARCHETYPE_PRESETS, SHAPER_BUILTIN_PART_PRESETS, SHAPER_BUILTIN_POSE_PRESETS, WEBTOON_SIGNATURE_POSES } from "./shaper-control-points";
import { SHAPER_BUILTIN_BODY_PRESETS, SHAPER_BUILTIN_FACE_PRESETS } from "./viewport-interactions";

interface ViewportPresetSelectProps {
  readonly presetId: string;
  readonly onSelect: (presetId: string) => void;
}

/** 프리셋 표시만 담당하며 선택 상태와 명령 적용은 뷰포트가 유지한다. */
export function ViewportPresetSelect({ presetId, onSelect }: ViewportPresetSelectProps) {
  return (
    <select className="cl-viewport-select" aria-label="SHAPER 내장 프리셋" value={presetId} title="K-웹툰 10종 완성형 아키타입 및 SHAPER BuiltInData 프리셋을 즉시 적용합니다" onChange={(event) => onSelect(event.target.value)}>
      <option value="">K-웹툰 · SHAPER 프리셋 적용…</option>
      <optgroup label="K-웹툰 완성형 캐릭터 아키타입 10종 (조형+헤어+의상+2단셀)">
        {Object.values(KWEBTOON_BUILTIN_ARCHETYPE_PRESETS).map((preset) => <option key={preset.id} value={preset.id}>{preset.labelKo}</option>)}
      </optgroup>
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
