/**
 * StudioSmartBubbleCharacterPanel.tsx
 *
 * Tooning Editor (ED) 절차적 말풍선 생성기(6종 형태 · 7종 감정 · 실시간 SVG 경로 · 2~5개 말풍선 불리언 병합) +
 * 16파츠 모듈형 2D 스마트 캐릭터(정면/측면/후면 · 머리/몸통 각도) + 다각형 가변 컷(editableCut 코너 라운드) &
 * 9종 웹툰 대지 프리셋 통합 패널.
 */
import { Combine, Frame, MessageSquarePlus, UserCheck } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import type { BubbleVariant } from "../studio-assets";

import {
  buildEdEditableCutSvgPath,
  createDefaultEdProceduralBubbleParams,
  createDefaultEdSmartCharacterState,
  ED_ARTBOARD_PRESETS,
  ED_SMART_CHARACTER_PART_SLOTS,
  generateEdProceduralSpeechBubbleSvgPath,
  mergeEdSpeechBubbles,
  type EdArtboardPresetId,
  type EdProceduralBubbleParams,
  type EdSmartCharacterPartSlot,
  type EdSpeechBubbleEmotionType,
  type EdSpeechBubbleShapeType,
} from "./studio-smart-editor-magic-suite";

export interface StudioSmartBubbleCharacterPanelProps {
  readonly onInsertBubble?: (variant: BubbleVariant) => void;
}

const BUBBLE_SHAPES: readonly { readonly id: EdSpeechBubbleShapeType; readonly labelKo: string }[] = [
  { id: "Ellipse", labelKo: "타원형 (Ellipse)" },
  { id: "Rectangle", labelKo: "사각형 (Rectangle)" },
  { id: "Shout", labelKo: "외침 가시형 (Shout)" },
  { id: "Thought", labelKo: "생각 구름형 (Thought)" },
  { id: "SelfTalk", labelKo: "독백 성게형 (SelfTalk)" },
  { id: "Squircle", labelKo: "스쿼클 (Squircle)" },
];

const BUBBLE_EMOTIONS: readonly { readonly id: EdSpeechBubbleEmotionType; readonly labelKo: string }[] = [
  { id: "General", labelKo: "일반" },
  { id: "Daily", labelKo: "일상" },
  { id: "Serious", labelKo: "진지" },
  { id: "Action", labelKo: "액션" },
  { id: "Comedy", labelKo: "코미디" },
  { id: "Fury", labelKo: "격노" },
  { id: "Custom", labelKo: "커스텀" },
];

function mapEdShapeToStudioVariant(shape: EdSpeechBubbleShapeType): BubbleVariant {
  switch (shape) {
    case "Shout":
      return "shout";
    case "Thought":
      return "thought";
    case "Rectangle":
      return "box";
    case "SelfTalk":
      return "whisper";
    case "Squircle":
    case "Ellipse":
    default:
      return "speech";
  }
}

export function StudioSmartBubbleCharacterPanel({
  onInsertBubble,
}: StudioSmartBubbleCharacterPanelProps): ReactElement {
  const [activeSubTab, setActiveSubTab] = useState<"proceduralBubble" | "smartCharacter" | "editableCut">(
    "proceduralBubble",
  );

  // Procedural Bubble State
  const [bubbleParams, setBubbleParams] = useState<EdProceduralBubbleParams>(() =>
    createDefaultEdProceduralBubbleParams("Shout", "Action"),
  );
  const [mergeCount, setMergeCount] = useState<number>(2);
  const [mergedPathPreview, setMergedPathPreview] = useState<string>("");

  // Smart Character (16 SVG Slots) State
  const [smartChar, setSmartChar] = useState(() => createDefaultEdSmartCharacterState());
  const [selectedPartSlot, setSelectedPartSlot] = useState<EdSmartCharacterPartSlot>("front_hair");

  // Editable Polygon Cut & Artboard Preset State
  const [artboardPreset, setArtboardPreset] = useState<EdArtboardPresetId>("Naver");
  const [cutCornerRadius, setCutCornerRadius] = useState<number>(12);

  const svgGeometry = useMemo(
    () => generateEdProceduralSpeechBubbleSvgPath(bubbleParams),
    [bubbleParams],
  );

  const editableCutPath = useMemo(
    () =>
      buildEdEditableCutSvgPath([
        { x: 20, y: 15, cornerRadius: cutCornerRadius },
        { x: 670, y: 40, cornerRadius: cutCornerRadius },
        { x: 660, y: 420, cornerRadius: cutCornerRadius },
        { x: 15, y: 390, cornerRadius: cutCornerRadius },
      ]),
    [cutCornerRadius],
  );

  const handleShapeSelect = (shapeType: EdSpeechBubbleShapeType) => {
    setBubbleParams((prev) => ({
      ...createDefaultEdProceduralBubbleParams(shapeType, prev.emotionType),
      tailThickness: prev.tailThickness,
    }));
  };

  const handleMergeBubbles = () => {
    const items = Array.from({ length: mergeCount }, (_, idx) => ({
      id: `b-${idx + 1}`,
      params: bubbleParams,
      offsetX: idx * 95,
      offsetY: idx * 18,
    }));
    const res = mergeEdSpeechBubbles(items);
    if (res.merged) {
      setMergedPathPreview(
        `${res.sourceBubbleIds.length}개 말풍선 불리언 병합 완료 (Ctrl+E) · 경로 길이 ${res.compoundSvgPathD.length}자`,
      );
    }
  };

  return (
    <section
      aria-label="투닝 에디터 절차적 말풍선·16파츠 스마트 캐릭터·가변 다각형 컷"
      data-testid="tooning-editor-bubble-character-panel"
      className="mx-2.5 mt-2.5 flex flex-col gap-2 rounded-xl border border-line bg-card/85 p-2.5 text-[0.66rem] text-fg"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="font-bold text-fg">
          투닝 에디터 (ED) 절차적 말풍선 · 16파츠 스마트 캐릭터 · 가변 컷
        </span>
        <div className="flex gap-1" role="tablist" aria-label="투닝 에디터 도구 모드">
          {(
            [
              { id: "proceduralBubble", label: "절차적 말풍선·병합", icon: MessageSquarePlus },
              { id: "smartCharacter", label: "16파츠 캐릭터", icon: UserCheck },
              { id: "editableCut", label: "가변 컷·9종 대지", icon: Frame },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSubTab(tab.id)}
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[0.6rem] font-bold ${
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-raised text-fg-3"
                }`}
              >
                <Icon className="h-3 w-3" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeSubTab === "proceduralBubble" && (
        <div className="flex flex-col gap-2" data-testid="ed-procedural-bubble-tab">
          <div className="grid grid-cols-3 gap-1">
            {BUBBLE_SHAPES.map((shape) => (
              <button
                key={shape.id}
                type="button"
                aria-pressed={bubbleParams.shapeType === shape.id}
                onClick={() => handleShapeSelect(shape.id)}
                className={`rounded border px-1.5 py-1 text-[0.6rem] font-semibold ${
                  bubbleParams.shapeType === shape.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2"
                }`}
              >
                {shape.labelKo}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            {BUBBLE_EMOTIONS.map((em) => (
              <button
                key={em.id}
                type="button"
                aria-pressed={bubbleParams.emotionType === em.id}
                onClick={() =>
                  setBubbleParams((prev) => ({
                    ...prev,
                    emotionType: em.id,
                  }))
                }
                className={`rounded border px-1.5 py-0.5 text-[0.58rem] font-bold ${
                  bubbleParams.emotionType === em.id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-raised text-fg-3"
                }`}
              >
                {em.labelKo}
              </button>
            ))}
          </div>

          {/* Procedural Geometry Sliders */}
          <div className="grid grid-cols-2 gap-1.5 rounded border border-line bg-canvas/40 p-2 text-[0.6rem]">
            <label className="flex flex-col gap-0.5">
              <span>꼭짓점/구름 분할 수 ({bubbleParams.numPoints})</span>
              <input
                type="range"
                min={8}
                max={56}
                value={bubbleParams.numPoints}
                onChange={(e) =>
                  setBubbleParams((prev) => ({ ...prev, numPoints: Number(e.target.value) }))
                }
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span>꼬리 두께 (10~100, 현재 {bubbleParams.tailThickness})</span>
              <input
                type="range"
                min={10}
                max={100}
                step={10}
                value={bubbleParams.tailThickness}
                onChange={(e) =>
                  setBubbleParams((prev) => ({ ...prev, tailThickness: Number(e.target.value) }))
                }
              />
            </label>
          </div>

          {/* Live SVG Procedural Path & Boolean Merge (2..5 bubbles) */}
          <div className="flex items-center justify-between gap-2 rounded border border-line bg-card p-2">
            <svg
              viewBox={`0 0 ${bubbleParams.width} ${bubbleParams.height + 35}`}
              className="h-14 w-24 shrink-0 rounded border border-line bg-raised p-1"
              aria-label="절차적 말풍선 SVG 프리뷰"
            >
              <path
                d={svgGeometry.bodyPathD}
                fill="currentColor"
                className="text-card"
                stroke="var(--color-accent)"
                strokeWidth="2.5"
                strokeDasharray={svgGeometry.strokeDasharray}
              />
              {svgGeometry.tailPathD ? (
                <path d={svgGeometry.tailPathD} fill="var(--color-accent)" opacity="0.35" />
              ) : null}
            </svg>
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-1">
                <label className="text-[0.6rem] font-semibold">
                  병합 개수(2~5):
                  <select
                    aria-label="병합할 말풍선 개수"
                    value={mergeCount}
                    onChange={(e) => setMergeCount(Number(e.target.value))}
                    className="ml-1 rounded border border-line bg-field px-1 py-0.5"
                  >
                    {[2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}개
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleMergeBubbles}
                  className="inline-flex items-center gap-1 rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.6rem] font-bold text-accent"
                >
                  <Combine className="h-3 w-3" aria-hidden />
                  그룹 말풍선 병합 (Ctrl+E)
                </button>
                {onInsertBubble ? (
                  <button
                    type="button"
                    onClick={() => onInsertBubble(mapEdShapeToStudioVariant(bubbleParams.shapeType))}
                    className="rounded bg-accent px-2 py-0.5 text-[0.6rem] font-bold text-on-accent"
                  >
                    캔버스에 추가
                  </button>
                ) : null}
              </div>
              {mergedPathPreview ? (
                <span className="text-[0.58rem] font-semibold text-good">{mergedPathPreview}</span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === "smartCharacter" && (
        <div className="flex flex-col gap-2" data-testid="ed-smart-character-tab">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex gap-1" role="group" aria-label="스마트 캐릭터 시점 방향">
              {(["front", "side", "back"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={smartChar.viewDirection === view}
                  onClick={() => setSmartChar((prev) => ({ ...prev, viewDirection: view }))}
                  className={`rounded border px-2 py-0.5 text-[0.6rem] font-bold ${
                    smartChar.viewDirection === view
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2"
                  }`}
                >
                  {view === "front" ? "정면 (Front)" : view === "side" ? "측면 (Side)" : "후면 (Back)"}
                </button>
              ))}
            </div>
            <span className="font-mono text-[0.58rem] text-fg-3">
              16종 SVG 파츠 슬롯 · 머리 {smartChar.headAngleDeg}° / 몸통 {smartChar.bodyAngleDeg}°
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[0.6rem]">
              <span>머리 회전 각도 ({smartChar.headAngleDeg}°)</span>
              <input
                type="range"
                min={-45}
                max={45}
                value={smartChar.headAngleDeg}
                onChange={(e) =>
                  setSmartChar((prev) => ({ ...prev, headAngleDeg: Number(e.target.value) }))
                }
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[0.6rem]">
              <span>몸통 기울기 각도 ({smartChar.bodyAngleDeg}°)</span>
              <input
                type="range"
                min={-45}
                max={45}
                value={smartChar.bodyAngleDeg}
                onChange={(e) =>
                  setSmartChar((prev) => ({ ...prev, bodyAngleDeg: Number(e.target.value) }))
                }
              />
            </label>
          </div>

          <label className="flex flex-col gap-0.5 text-[0.6rem] font-semibold">
            16종 SVG 모듈 파츠 슬롯 선택
            <select
              aria-label="16종 스마트 캐릭터 파츠 슬롯"
              value={selectedPartSlot}
              onChange={(e) => setSelectedPartSlot(e.target.value as EdSmartCharacterPartSlot)}
              className="rounded border border-line bg-field px-1.5 py-1 text-[0.62rem]"
            >
              {ED_SMART_CHARACTER_PART_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot} ({smartChar.partPresets[slot]})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {activeSubTab === "editableCut" && (
        <div className="flex flex-col gap-2" data-testid="ed-editable-cut-tab">
          <label className="flex flex-col gap-0.5 text-[0.6rem] font-semibold">
            투닝 에디터 9종 대지(Artboard) 규격 프리셋
            <select
              aria-label="투닝 에디터 대지 프리셋"
              value={artboardPreset}
              onChange={(e) => setArtboardPreset(e.target.value as EdArtboardPresetId)}
              className="rounded border border-line bg-field px-1.5 py-1 text-[0.62rem]"
            >
              {ED_ARTBOARD_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.labelKo}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[0.6rem]">
            <span>가변 다각형 컷(editableCut) 꼭짓점 코너 라운드 반경: {cutCornerRadius}px</span>
            <input
              type="range"
              min={0}
              max={48}
              value={cutCornerRadius}
              onChange={(e) => setCutCornerRadius(Number(e.target.value))}
            />
          </label>
          <p className="truncate font-mono text-[0.56rem] text-fg-3">{editableCutPath}</p>
        </div>
      )}
    </section>
  );
}
