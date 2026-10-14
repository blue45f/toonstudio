import { useRef, useState } from "react";

import {
  addStudioAnimaticCameraKeyframe,
  moveStudioAnimaticCameraKeyframe,
  patchStudioAnimaticCameraKeyframe,
  removeStudioAnimaticCameraKeyframe,
  STUDIO_ANIMATIC_MAX_CAMERA_KEYFRAMES,
  type StudioAnimaticCameraEasing,
  type StudioAnimaticDocument,
  type StudioAnimaticSegment,
} from "../studio-animatic-timeline";
import { cameraKeyframesToTracks, sampleCameraTracksAt } from "./animatic-keyframe-model";
import { StudioAnimaticKeyframeCurveEditor } from "./StudioAnimaticKeyframeCurveEditor";

const CONTROL = "min-h-11 min-w-11 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";
const FIELD = `${CONTROL} w-full`;

const EASING_OPTIONS: readonly { value: StudioAnimaticCameraEasing; label: string }[] = [
  { value: "linear", label: "일정하게 (선형)" },
  { value: "ease-in", label: "천천히 시작 (이지 인)" },
  { value: "ease-out", label: "천천히 멈춤 (이지 아웃)" },
  { value: "ease-in-out", label: "부드럽게 시작·멈춤 (이지 인아웃)" },
  { value: "ease-in-back", label: "뒤로 당겼다 시작 (이지 인 백)" },
  { value: "ease-out-back", label: "지나쳐 멈춤 (이지 아웃 백)" },
  { value: "hold", label: "멈춰 있다 점프 (홀드)" },
];

/**
 * 선택한 컷의 카메라·불투명도 키프레임 레인.
 * 다이아몬드를 눌러 고르고, 끌어 옮기고, 아래 입력으로 값·이징을 바꾼다.
 * 모든 변경은 타임라인 문서의 순수 연산으로만 일어나 미리보기·WebM 내보내기가 같은 샘플러를 쓴다.
 */
export function StudioAnimaticKeyframeLane({ document, segment, disabled, onDocumentChange }: {
  document: StudioAnimaticDocument;
  segment: StudioAnimaticSegment;
  disabled: boolean;
  onDocumentChange: (document: StudioAnimaticDocument) => void;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const dragAt = useRef<number | null>(null);
  const [selectedAt, setSelectedAt] = useState<number>(segment.cameraKeyframes[0]?.at ?? 0);
  const [scrub, setScrub] = useState(0);
  const keyframes = segment.cameraKeyframes;
  const selected = keyframes.find((kf) => Math.abs(kf.at - selectedAt) < 1e-9) ?? keyframes[0];
  const preview = sampleCameraTracksAt(cameraKeyframesToTracks(keyframes), scrub);

  function atFromClientX(clientX: number): number {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }
  function addKeyframe() {
    const next = addStudioAnimaticCameraKeyframe(document, segment.id);
    if (next === document) return;
    const before = new Set(keyframes.map((kf) => kf.at));
    const added = next.segments.find((item) => item.id === segment.id)?.cameraKeyframes.find((kf) => !before.has(kf.at));
    onDocumentChange(next);
    if (added) setSelectedAt(added.at);
  }
  if (!selected) return null;
  const selectedIndex = keyframes.indexOf(selected);
  return (
    <div className="space-y-2" data-studio-animatic-keyframe-lane="true">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-fg-2">키프레임 레인 · 카메라 이동·줌·불투명도 ({keyframes.length}/{STUDIO_ANIMATIC_MAX_CAMERA_KEYFRAMES})</p>
        <button type="button" className={CONTROL} disabled={disabled || keyframes.length >= STUDIO_ANIMATIC_MAX_CAMERA_KEYFRAMES} onClick={addKeyframe}>키프레임 추가</button>
        <button type="button" className={CONTROL} disabled={disabled || keyframes.length <= 2 || selectedIndex <= 0 || selectedIndex >= keyframes.length - 1}
          onClick={() => { onDocumentChange(removeStudioAnimaticCameraKeyframe(document, segment.id, selected.at)); setSelectedAt(keyframes[0]!.at); }}>선택 키프레임 삭제</button>
      </div>
      <div ref={laneRef} className="relative h-11 rounded-lg border border-line bg-canvas" role="group" aria-label={`${segment.label} 키프레임 레인`}
        onPointerDown={(event) => { if (event.target === event.currentTarget) { const snapped = Math.round(atFromClientX(event.clientX) * 20) / 20; const next = addStudioAnimaticCameraKeyframe(document, segment.id, snapped); if (next !== document) { onDocumentChange(next); setSelectedAt(snapped); } } }}>
        <div className="absolute left-0 top-1/2 h-px w-full bg-line" aria-hidden />
        {keyframes.map((kf, index) => (
          <button key={index} type="button" disabled={disabled}
            aria-label={`키프레임 ${(kf.at * 100).toFixed(0)}% · 줌 ${kf.zoom.toFixed(2)}배 · 불투명도 ${Math.round(kf.opacity * 100)}%`}
            aria-pressed={Math.abs(kf.at - selected.at) < 1e-9}
            className={`absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${Math.abs(kf.at - selected.at) < 1e-9 ? "border-accent bg-accent" : "border-line bg-panel"}`}
            style={{ left: `${kf.at * 100}%` }}
            onClick={() => setSelectedAt(kf.at)}
            onPointerDown={(event) => { dragAt.current = kf.at; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => {
              if (dragAt.current === null || Math.abs(dragAt.current - kf.at) > 1e-9) return;
              const to = Math.round(atFromClientX(event.clientX) * 100) / 100;
              if (Math.abs(to - kf.at) < 0.01) return;
              const next = moveStudioAnimaticCameraKeyframe(document, segment.id, kf.at, to);
              if (next !== document) { onDocumentChange(next); dragAt.current = to; setSelectedAt(to); }
            }}
            onPointerUp={() => { dragAt.current = null; }}
          />
        ))}
      </div>
      <label className="block text-xs text-fg-2">선택 키프레임 위치 ({(selected.at * 100).toFixed(0)}%)
        <input className="w-full" type="range" min={0} max={100} step={1} value={Math.round(selected.at * 100)} disabled={disabled} aria-label="선택 키프레임 위치"
          onChange={(event) => { const to = Number(event.target.value) / 100; const next = moveStudioAnimaticCameraKeyframe(document, segment.id, selected.at, to); if (next !== document) { onDocumentChange(next); setSelectedAt(to); } }} />
      </label>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {([
          ["panXPercent", "가로 이동 (%)", -100, 100, 1],
          ["panYPercent", "세로 이동 (%)", -100, 100, 1],
          ["zoom", "줌 (배)", 0.25, 4, 0.05],
          ["opacity", "불투명도", 0, 1, 0.05],
        ] as const).map(([field, label, min, max, step]) => (
          <label key={field} className="text-xs text-fg-2">{label}
            <input className={FIELD} type="number" min={min} max={max} step={step} value={selected[field]} disabled={disabled} aria-label={`선택 키프레임 ${label}`}
              onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) onDocumentChange(patchStudioAnimaticCameraKeyframe(document, segment.id, selected.at, { [field]: value })); }} />
          </label>
        ))}
        <label className="text-xs text-fg-2">이 키프레임까지의 움직임{selectedIndex === 0 ? " (시작 키프레임은 이전 구간이 없어요)" : ""}
          <select className={FIELD} value={selected.easing} disabled={disabled || selectedIndex === 0} aria-label="선택 키프레임 이징"
            onChange={(event) => { const value = event.target.value as StudioAnimaticCameraEasing; if (value !== "custom") onDocumentChange(patchStudioAnimaticCameraKeyframe(document, segment.id, selected.at, { easing: value })); }}>
            {selected.easing === "custom" ? <option value="custom">직접 그린 곡선 (아래 그래프에서 편집)</option> : null}
            {EASING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      {selectedIndex > 0 ? (
        <StudioAnimaticKeyframeCurveEditor document={document} segment={segment} keyframe={selected} disabled={disabled} onDocumentChange={onDocumentChange} />
      ) : null}
      <label className="block text-xs text-fg-2">움직임 미리보기 위치 ({(scrub * 100).toFixed(0)}%) — 가로 {preview.panXPercent.toFixed(0)}% · 세로 {preview.panYPercent.toFixed(0)}% · 줌 {preview.zoom.toFixed(2)}배 · 불투명도 {Math.round(preview.opacity * 100)}%
        <input className="w-full" type="range" min={0} max={100} step={1} value={Math.round(scrub * 100)} aria-label="키프레임 보간 미리보기 위치" onChange={(event) => setScrub(Number(event.target.value) / 100)} />
      </label>
      <p className="text-xs text-fg-3">레인의 빈 곳을 누르면 그 위치에 키프레임이 생기고, 다이아몬드를 끌면 위치가 옮겨집니다. 여기서 바꾼 움직임과 불투명도는 미리보기 재생과 WebM 내보내기에 그대로 반영됩니다.</p>
    </div>
  );
}
