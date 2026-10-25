import { MessageSquare, Plus, Sparkles, Volume2, Zap } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  BUBBLE_KIND_UI,
  CHARACTER_ANCHOR_SOCKET_UI,
  EMOTE_KIND_UI,
  Studio3DBillboardBubbleEngine,
  type BubbleKind,
  type CharacterAnchorSocket,
  type EmoteKind,
  type EmoteStickerItem,
  type SpeechBubbleItem,
} from "../scene-3d/studio-3d-billboard-bubble-anchor";
import {
  generate3dSpeedLines,
  type SpeedLineKind,
  type SpeedLineSetResult,
} from "../scene-3d/studio-3d-speed-lines-generator";
import {
  Studio3DSpatialFxEngine,
  type SfxTextPreset,
  type SpatialSfxTypographyConfig,
  type SpatialSpeedLineConfig,
} from "../scene-3d/studio-3d-spatial-fx";

export interface StudioBg3dSpatialFxPanelProps {
  readonly onInsertSpeedLines?: (config: SpatialSpeedLineConfig) => void;
  readonly onGenerateSpeedLineSet?: (set: SpeedLineSetResult) => void;
  readonly onInsertSfxTypography?: (config: SpatialSfxTypographyConfig) => void;
  readonly onInsertSpeechBubble?: (bubble: SpeechBubbleItem) => void;
  readonly onInsertEmoteSticker?: (emote: EmoteStickerItem) => void;
  readonly disabled?: boolean;
}

const SFX_PRESETS: readonly SfxTextPreset[] = [
  "쿵",
  "쾅",
  "촤아악",
  "번쩍",
  "스윽",
  "두근",
  "콰앙",
  "파지지직",
];

const SPEED_LINE_KINDS: readonly {
  readonly id: SpeedLineKind;
  readonly labelKo: string;
}[] = Object.freeze([
  { id: "radial-focus", labelKo: "방사 집중선" },
  { id: "linear-streak", labelKo: "직선 액션선" },
  { id: "spiral-tornado", labelKo: "나선 회오리" },
]);

export function StudioBg3dSpatialFxPanel({
  onInsertSpeedLines,
  onGenerateSpeedLineSet,
  onInsertSfxTypography,
  onInsertSpeechBubble,
  onInsertEmoteSticker,
  disabled = false,
}: StudioBg3dSpatialFxPanelProps) {
  const engine = useMemo(() => new Studio3DSpatialFxEngine(), []);
  const bubbleEngine = useMemo(() => new Studio3DBillboardBubbleEngine(), []);
  const idPrefix = useId();
  const [activeTab, setActiveTab] = useState<"sfx" | "speedlines" | "bubbles">("sfx");

  // Speed lines state
  const [speedLineKind, setSpeedLineKind] = useState<SpeedLineKind>("radial-focus");
  const [rayCount, setRayCount] = useState(32);
  const [innerRadius, setInnerRadius] = useState(1.5);
  const [outerRadius, setOuterRadius] = useState(6.0);
  const [lineColor, setLineColor] = useState("#000000");
  const [lineOpacity, setLineOpacity] = useState(0.9);

  // SFX state
  const [selectedPreset, setSelectedPreset] = useState<SfxTextPreset>("쾅");
  const [customText, setCustomText] = useState("");
  const [sfxScale, setSfxScale] = useState(1.5);
  const [sfxDepth, setSfxDepth] = useState(0.2);
  const [sfxFillColor, setSfxFillColor] = useState("#ffbe0b");
  const [sfxOutlineColor, setSfxOutlineColor] = useState("#3a0ca3");

  // 3D Billboard Bubble & Emote state
  const [bubbleKind, setBubbleKind] = useState<BubbleKind>("speech");
  const [bubbleSocket, setBubbleSocket] = useState<CharacterAnchorSocket>("head-top");
  const [bubbleText, setBubbleText] = useState("잠깐, 지금 뒤에 누구야?!");
  const [emoteKind, setEmoteKind] = useState<EmoteKind>("exclamation");

  const speedLinePreview = useMemo(
    () =>
      generate3dSpeedLines({
        kind: speedLineKind,
        lineCount: rayCount,
        innerRadius,
        outerRadius,
        focusPoint: [0, 1.5, 0],
        lineThickness: 2.0,
        lengthVariation: 0.4,
        taperFactor: 0.85,
        densityNoise: 0.25,
        color: lineColor,
        opacity: lineOpacity,
      }),
    [speedLineKind, rayCount, innerRadius, outerRadius, lineColor, lineOpacity],
  );

  const bubbleAnchorPreview = useMemo(
    () =>
      bubbleEngine.computeAnchorWorldPosition(
        { x: 0, y: 1.65, z: 0 },
        bubbleSocket,
        { x: 0, y: 0.15, z: 0 },
      ),
    [bubbleEngine, bubbleSocket],
  );

  const bubbleSvgPath = useMemo(
    () => bubbleEngine.generateBubbleSvgPath(bubbleKind, 180, 64, 48, 82),
    [bubbleEngine, bubbleKind],
  );

  const handleApplySfxPreset = (preset: SfxTextPreset) => {
    setSelectedPreset(preset);
    const cfg = engine.createSfxPreset(preset);
    setSfxFillColor(cfg.fillColorHex);
    setSfxOutlineColor(cfg.outlineColorHex);
    setSfxDepth(cfg.extrusionDepth);
  };

  const handleInsertSfx = () => {
    const textToUse = customText.trim() || selectedPreset;
    onInsertSfxTypography?.({
      id: `sfx-${Date.now()}`,
      text: textToUse,
      position: [0, 1.5, 0],
      rotationDeg: [0, 0, 0],
      scale: sfxScale,
      extrusionDepth: sfxDepth,
      fillColorHex: sfxFillColor,
      outlineColorHex: sfxOutlineColor,
      outlineWidth: 2.5,
      motionBlurTrail: false,
    });
  };

  const handleInsertSpeedLines = () => {
    onInsertSpeedLines?.({
      center: [0, 1.5, 0],
      rayCount,
      innerRadius,
      outerRadius,
      lineThickness: 2.0,
      colorHex: lineColor,
      opacity: lineOpacity,
    });
    onGenerateSpeedLineSet?.(speedLinePreview);
  };

  const handleInsertBubble = () => {
    const created = bubbleEngine.addBubble({
      text: bubbleText.trim() || "…",
      kind: bubbleKind,
      socket: bubbleSocket,
      offset: { x: 0, y: 0.2, z: 0 },
      scale: 1.0,
      billboardFacing: true,
      tailTargetOffset: { x: 0, y: -0.25, z: 0 },
      bubbleBgColor: "#ffffff",
      textColor: "#111115",
    });
    onInsertSpeechBubble?.(created);
  };

  const handleInsertEmote = () => {
    const created = bubbleEngine.addEmote({
      kind: emoteKind,
      socket: bubbleSocket,
      offset: { x: 0.08, y: 0.08, z: 0 },
      scale: 1.15,
      floatAnimation: true,
      tintColor: "#f43f5e",
    });
    onInsertEmoteSticker?.(created);
  };

  const customTextId = `${idPrefix}-custom-text`;
  const sfxFillId = `${idPrefix}-sfx-fill`;
  const sfxOutlineId = `${idPrefix}-sfx-outline`;
  const sfxScaleId = `${idPrefix}-sfx-scale`;
  const sfxDepthId = `${idPrefix}-sfx-depth`;
  const rayCountId = `${idPrefix}-ray-count`;
  const innerRadiusId = `${idPrefix}-inner-radius`;
  const outerRadiusId = `${idPrefix}-outer-radius`;
  const lineColorId = `${idPrefix}-line-color`;
  const lineOpacityId = `${idPrefix}-line-opacity`;
  const bubbleTextId = `${idPrefix}-bubble-text`;

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      {/* Header Tabs */}
      <div className="flex rounded-lg border border-line bg-card p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setActiveTab("sfx")}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "sfx" ? "bg-raised text-fg shadow-sm" : "text-fg-3 hover:text-fg"
          }`}
        >
          <Volume2 className="h-3.5 w-3.5" />
          3D 입체 효과음 (SFX)
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setActiveTab("speedlines")}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "speedlines" ? "bg-raised text-fg shadow-sm" : "text-fg-3 hover:text-fg"
          }`}
        >
          <Zap className="h-3.5 w-3.5" />
          3D 원근 집중선
        </button>
        <button
          type="button"
          disabled={disabled}
          data-testid="bg3d-spatial-fx-tab-bubbles"
          onClick={() => setActiveTab("bubbles")}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-semibold transition-colors ${
            activeTab === "bubbles" ? "bg-raised text-fg shadow-sm" : "text-fg-3 hover:text-fg"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          3D 말풍선 & 이모트
        </button>
      </div>

      {activeTab === "sfx" ? (
        <div className="flex flex-col gap-3">
          <div>
            <span className="mb-1.5 block text-[0.7rem] font-semibold text-fg-2">
              웹툰 효과음 프리셋 선택
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {SFX_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleApplySfxPreset(preset)}
                  className={`rounded-lg border px-2 py-1.5 text-center text-xs font-black transition-colors ${
                    selectedPreset === preset
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor={customTextId} className="mb-1 block text-[0.7rem] font-semibold text-fg-2">
              직접 입력 (선택 사항)
            </label>
            <input
              id={customTextId}
              type="text"
              value={customText}
              disabled={disabled}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={`기본값: ${selectedPreset}`}
              className="w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={sfxFillId} className="mb-1 block text-[0.7rem] font-medium text-fg-3">
                채우기 색상
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={sfxFillId}
                  type="color"
                  value={sfxFillColor}
                  disabled={disabled}
                  onChange={(e) => setSfxFillColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-line bg-card p-0.5"
                />
                <span className="text-[0.7rem] font-mono">{sfxFillColor}</span>
              </div>
            </div>
            <div>
              <label htmlFor={sfxOutlineId} className="mb-1 block text-[0.7rem] font-medium text-fg-3">
                외곽선 색상
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={sfxOutlineId}
                  type="color"
                  value={sfxOutlineColor}
                  disabled={disabled}
                  onChange={(e) => setSfxOutlineColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-line bg-card p-0.5"
                />
                <span className="text-[0.7rem] font-mono">{sfxOutlineColor}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={sfxScaleId} className="text-[0.7rem] font-medium text-fg-3">크기 (배율)</label>
                <span className="font-mono text-[0.7rem]">{sfxScale.toFixed(1)}x</span>
              </div>
              <input
                id={sfxScaleId}
                type="range"
                min={0.5}
                max={4.0}
                step={0.1}
                value={sfxScale}
                disabled={disabled}
                onChange={(e) => setSfxScale(Number(e.target.value))}
                className="accent-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={sfxDepthId} className="text-[0.7rem] font-medium text-fg-3">입체 두께</label>
                <span className="font-mono text-[0.7rem]">{sfxDepth.toFixed(2)}m</span>
              </div>
              <input
                id={sfxDepthId}
                type="range"
                min={0.02}
                max={1.0}
                step={0.02}
                value={sfxDepth}
                disabled={disabled}
                onChange={(e) => setSfxDepth(Number(e.target.value))}
                className="accent-accent"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={handleInsertSfx}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
          >
            <Plus className="h-4 w-4" />
            3D 씬에 입체 효과음 추가
          </button>
        </div>
      ) : activeTab === "speedlines" ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-1">
            {SPEED_LINE_KINDS.map((kindItem) => (
              <button
                key={kindItem.id}
                type="button"
                disabled={disabled}
                data-testid={`bg3d-speedline-kind-${kindItem.id}`}
                onClick={() => setSpeedLineKind(kindItem.id)}
                className={`rounded-md border px-2 py-1 text-[0.68rem] font-semibold transition-colors ${
                  speedLineKind === kindItem.id
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                }`}
              >
                {kindItem.labelKo}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor={rayCountId} className="text-[0.7rem] font-medium text-fg-3">집중선 가닥 수</label>
              <span className="font-mono text-[0.7rem]" data-testid="bg3d-speedline-segment-readout">
                {rayCount}개 (생성 세그먼트 {speedLinePreview.segments.length}선분)
              </span>
            </div>
            <input
              id={rayCountId}
              type="range"
              min={8}
              max={96}
              step={4}
              value={rayCount}
              disabled={disabled}
              onChange={(e) => setRayCount(Number(e.target.value))}
              className="accent-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={innerRadiusId} className="text-[0.7rem] font-medium text-fg-3">내부 반경</label>
                <span className="font-mono text-[0.7rem]">{innerRadius.toFixed(1)}m</span>
              </div>
              <input
                id={innerRadiusId}
                type="range"
                min={0.2}
                max={5.0}
                step={0.2}
                value={innerRadius}
                disabled={disabled}
                onChange={(e) => setInnerRadius(Number(e.target.value))}
                className="accent-accent"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={outerRadiusId} className="text-[0.7rem] font-medium text-fg-3">외부 반경</label>
                <span className="font-mono text-[0.7rem]">{outerRadius.toFixed(1)}m</span>
              </div>
              <input
                id={outerRadiusId}
                type="range"
                min={2.0}
                max={20.0}
                step={0.5}
                value={outerRadius}
                disabled={disabled}
                onChange={(e) => setOuterRadius(Number(e.target.value))}
                className="accent-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={lineColorId} className="mb-1 block text-[0.7rem] font-medium text-fg-3">
                선 색상
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={lineColorId}
                  type="color"
                  value={lineColor}
                  disabled={disabled}
                  onChange={(e) => setLineColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-line bg-card p-0.5"
                />
                <span className="text-[0.7rem] font-mono">{lineColor}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={lineOpacityId} className="text-[0.7rem] font-medium text-fg-3">불투명도</label>
                <span className="font-mono text-[0.7rem]">{(lineOpacity * 100).toFixed(0)}%</span>
              </div>
              <input
                id={lineOpacityId}
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={lineOpacity}
                disabled={disabled}
                onChange={(e) => setLineOpacity(Number(e.target.value))}
                className="accent-accent"
              />
            </div>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={handleInsertSpeedLines}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45"
          >
            <Sparkles className="h-4 w-4" />
            3D 씬에 집중선 배치
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-testid="bg3d-spatial-fx-bubbles-panel">
          <div>
            <span className="mb-1 block text-[0.7rem] font-semibold text-fg-2">
              3D 빌보드 말풍선 종류
            </span>
            <div className="grid grid-cols-4 gap-1">
              {(Object.keys(BUBBLE_KIND_UI) as BubbleKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-bubble-kind-${kind}`}
                  onClick={() => setBubbleKind(kind)}
                  title={BUBBLE_KIND_UI[kind].tooltipKo}
                  className={`rounded-md border px-2 py-1 text-[0.68rem] font-semibold ${
                    bubbleKind === kind
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  {BUBBLE_KIND_UI[kind].labelKo}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor={bubbleTextId} className="mb-1 block text-[0.7rem] font-semibold text-fg-2">
              말풍선 대사 및 캐릭터 소켓 앵커
            </label>
            <input
              id={bubbleTextId}
              type="text"
              value={bubbleText}
              disabled={disabled}
              onChange={(e) => setBubbleText(e.target.value)}
              className="mb-1.5 w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-xs text-fg"
            />
            <div className="flex flex-wrap gap-1">
              {(Object.keys(CHARACTER_ANCHOR_SOCKET_UI) as CharacterAnchorSocket[]).map((socket) => (
                <button
                  key={socket}
                  type="button"
                  disabled={disabled}
                  onClick={() => setBubbleSocket(socket)}
                  className={`rounded border px-2 py-0.5 text-[0.64rem] ${
                    bubbleSocket === socket
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-card text-fg-3"
                  }`}
                >
                  {CHARACTER_ANCHOR_SOCKET_UI[socket].labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card/60 p-2 text-[0.65rem] text-fg-3">
            <div>
              월드 앵커 좌표: ({bubbleAnchorPreview.x.toFixed(2)},{" "}
              {bubbleAnchorPreview.y.toFixed(2)}, {bubbleAnchorPreview.z.toFixed(2)})
            </div>
            <div className="truncate font-mono" data-testid="bg3d-bubble-svg-path">
              SVG Path: {bubbleSvgPath}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[0.7rem] font-semibold text-fg-2">
              감정 이모트 스티커 (7종)
            </span>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(EMOTE_KIND_UI) as EmoteKind[]).map((ek) => (
                <button
                  key={ek}
                  type="button"
                  disabled={disabled}
                  data-testid={`bg3d-emote-kind-${ek}`}
                  onClick={() => setEmoteKind(ek)}
                  className={`rounded border px-2 py-0.5 text-[0.65rem] ${
                    emoteKind === ek
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-card text-fg-2"
                  }`}
                >
                  {EMOTE_KIND_UI[ek].labelKo}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-insert-bubble-btn"
              onClick={handleInsertBubble}
              className="flex items-center justify-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-bold text-on-accent"
            >
              <Plus className="h-3.5 w-3.5" />
              3D 말풍선 배치
            </button>
            <button
              type="button"
              disabled={disabled}
              data-testid="bg3d-insert-emote-btn"
              onClick={handleInsertEmote}
              className="flex items-center justify-center gap-1 rounded-lg border border-accent bg-accent/15 px-2.5 py-1.5 text-xs font-bold text-accent"
            >
              <Sparkles className="h-3.5 w-3.5" />
              이모트 스티커 배치
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
