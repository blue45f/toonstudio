/**
 * Character Shaper — floating controls over the 3D viewport.
 *
 * 카메라 프리셋과 선택 필드는 모든 화면에서 별도의 정상 흐름 bar가 예약한 공간을 사용한다.
 * Top-right: turntable, lighting tone, transparent background, zoom.
 * Bottom-left: a status pill (model status / busy reason / hold-to-compare). Every control is a
 * labelled 44px button; the wrapper is pointer-transparent so orbiting the model keeps working.
 */
import { CircleQuestionMark, Eye, EyeOff, LoaderCircle, Maximize2, PenLine, RotateCw, SunMedium, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { StudioHudPill } from "../studio-chrome-ui";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";
import {
  StudioLtConvertDialog,
  type StudioLtConvertDialogSource,
} from "../lt-convert/StudioLtConvertDialog";
import { createStudioLtConvertLayerPayloads } from "../lt-convert/studio-lt-convert-layer";
import { captureCharacterShaperLt } from "./character-shaper-lt-capture";
import { encodeStudioLtPng } from "../lt-convert/studio-lt-raster-output";
import { decodeStudioLtSourceFile } from "../lt-convert/studio-lt-convert-source";
import type { StudioLtConvertResult } from "../lt-convert/studio-lt-convert";
import { resolveVrmLibraryEntryDisplayName } from "../vrm/studio-vrm-display-name";
import { CAMERA_PRESETS } from "../vrm/studio-vrm-poser-catalogs";

import {
  characterLightingToneLabel,
  nextCharacterLightingTone,
  resolveShaperContextKeycapStatusGuide,
} from "./character-shaper-ui-model";

import { useCharacterShaperSessionSettings } from "./character-shaper-session-settings";

import type { CharacterShaperViewportHudProps } from "./character-shaper-ui-contract";
import type { LoadStatus } from "../vrm/StudioVrmPoserTypes";
import type { VrmLibraryEntry } from "../vrm/vrm-library";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const HUD_BUTTON = cn(
  "grid size-11 shrink-0 place-items-center rounded-xl border border-line/70 bg-panel/85 text-fg-2 shadow-sm backdrop-blur",
  "transition-colors duration-150 hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

const HUD_BUTTON_ACTIVE = "border-accent/60 bg-accent text-on-accent hover:bg-accent-2 hover:text-on-accent";

/**
 * 도구 이름표. 터치 화면의 세로 도구에서만 보인다(마우스 화면은 툴팁이 같은 이름을 보여 준다).
 * 터치에는 올려 보기(hover)가 없어 아이콘만으로는 뜻을 알기 어렵다.
 */
function HudLabel({ children }: { readonly children: string }) {
  return <span aria-hidden data-character-hud-label="true">{children}</span>;
}

function statusText(input: {
  readonly status: LoadStatus;
  readonly compareActive: boolean;
  readonly busyReason: string | null;
  readonly cameraLabel: string;
  readonly transparent: boolean;
  readonly paintMode: boolean;
}): { readonly text: string; readonly accent: boolean } {
  if (input.compareActive) return { text: r3c04StatusText("studio.r3c04Status.shaper.viewportHud.comparing", "기준 상태 보는 중"), accent: true };
  if (input.busyReason) return { text: input.busyReason, accent: true };
  if (input.status === "loading") return { text: r3c04StatusText("studio.r3c04Status.shaper.viewportHud.loading", "VRM 불러오는 중"), accent: false };
  if (input.status === "error") return { text: r3c04StatusText("studio.r3c04Status.shaper.viewportHud.loadFailed", "불러오기 실패"), accent: false };
  if (input.status === "empty") return { text: r3c04StatusText("studio.r3c04Status.shaper.viewportHud.emptyModel", "모델 없음"), accent: false };
  const parts = [input.cameraLabel];
  if (input.paintMode) parts.push("표면 드로잉");
  if (input.transparent) parts.push("투명 배경");
  return { text: parts.join(" · "), accent: false };
}

export function CharacterShaperViewportHud({ h, binding, compact, onShowGuide, onInsertLtLayers }: CharacterShaperViewportHudProps) {
  const settings = useCharacterShaperSessionSettings();
  const locale = useI18n((state) => state.lang);
  const bt = useBilingual("CharacterShaperViewportHud");
  const [ltOpen, setLtOpen] = useState(false);
  const [ltApplyError, setLtApplyError] = useState<string | null>(null);
  const [ltSource, setLtSource] = useState<StudioLtConvertDialogSource>({
    status: "idle",
    imageData: null,
    error: null,
    label: "3D 뷰 캡처",
  });
  const status: LoadStatus = h.status ?? "empty";
  const activeCameraId: string = typeof h.activeCameraId === "string" ? h.activeCameraId : "front";
  const turntable = Boolean(h.turntable);
  const transparent = Boolean(h.transparentBackground);
  const paintMode = Boolean(h.texturePaintModeSelected);
  const cameraLocked = Boolean(h.viewportCameraInteractionLocked || h.isCapturing || h.isSharingPose || h.isThumbnailCapturing);
  const lightingTone: string | undefined = typeof h.lightingTone === "string" ? h.lightingTone : undefined;
  const modelReady = status === "ready";
  const activePresetLabel = CAMERA_PRESETS.find((preset) => preset.id === activeCameraId)?.label ?? "정면";
  const entries: readonly VrmLibraryEntry[] = Array.isArray(h.libraryEntries) ? h.libraryEntries : [];
  const activeEntry = entries.find((entry) => entry.id === h.activeModelId) ?? null;
  const modelName = activeEntry ? resolveVrmLibraryEntryDisplayName(activeEntry, locale) : null;
  const pill = statusText({
    status,
    compareActive: binding.compareActive,
    busyReason: binding.busyReason,
    cameraLabel: activePresetLabel,
    transparent,
    paintMode,
  });
  const lightingLabel = characterLightingToneLabel(lightingTone);

  const request = useRef(0);
  const insertion = useRef<AbortController | null>(null);
  const [applying, setApplying] = useState(false);
  useEffect(() => () => { request.current += 1; insertion.current?.abort(); }, []);
  const closeLt = () => {
    request.current += 1;
    insertion.current?.abort();
    insertion.current = null;
    setApplying(false);
    setLtOpen(false);
    setLtSource({ status: "idle", imageData: null, error: null, label: "" });
  };
  const openLtDialog = () => {
    request.current += 1;
    setLtApplyError(null);
    setLtOpen(true);
    try {
      const imageData = captureCharacterShaperLt(h);
      setLtSource({ status: "ready", imageData, label: "3D 뷰 캡처", error: null });
    } catch (cause) {
      setLtSource({ status: "error", imageData: null, label: "3D 뷰 캡처",
        error: cause instanceof Error ? cause.message : "뷰포트를 캡처하지 못했습니다." });
    }
  };

  const handleLtImportImage = useCallback(async (file: File) => {
    insertion.current?.abort();
    insertion.current = null;
    setApplying(false);
    const token = ++request.current;
    setLtApplyError(null);
    setLtSource({ status: "capturing", imageData: null, error: null, label: file.name });
    try {
      const imageData = await decodeStudioLtSourceFile(file);
      if (request.current === token) setLtSource({ status: "ready", imageData, error: null, label: file.name });
    } catch (cause) {
      if (request.current === token) setLtSource({ status: "error", imageData: null, label: file.name,
        error: cause instanceof Error ? cause.message : "이미지를 불러오지 못했습니다." });
    }
  }, []);

  const handleLtApply = async (result: StudioLtConvertResult) => {
    if (!onInsertLtLayers || insertion.current) return;
    const controller = new AbortController();
    insertion.current = controller;
    setApplying(true);
    try {
      const [line, tone] = createStudioLtConvertLayerPayloads(result);
      const committed = await onInsertLtLayers([encodeStudioLtPng(line), encodeStudioLtPng(tone)], controller.signal);
      if (controller.signal.aborted) return;
      if (!committed) {
        setLtApplyError("이 페이지에 레이어를 추가할 수 없습니다. 원고의 편집 권한과 잠금 상태를 확인하세요.");
        return;
      }
      closeLt();
    } catch (cause) {
      if (!controller.signal.aborted) setLtApplyError(cause instanceof Error ? cause.message : "레이어를 추가하지 못했습니다.");
    } finally {
      if (insertion.current === controller) { insertion.current = null; setApplying(false); }
    }
  };

  const downloadLt = (result: StudioLtConvertResult, kind: "line" | "tone") => {
    try {
      const [line, tone] = createStudioLtConvertLayerPayloads(result);
      const png = encodeStudioLtPng(kind === "line" ? line : tone);
      const link = document.createElement("a");
      link.href = png.src;
      link.download = png.name + ".png";
      link.click();
      setLtApplyError(null);
    } catch (cause) { setLtApplyError(cause instanceof Error ? cause.message : "PNG를 저장하지 못했습니다."); }
  };
  return (
    <div
      data-character-shaper-hud="true"
      className="pointer-events-none absolute inset-0 z-20"
    >
      <div
        role="group"
        aria-label="뷰포트 보기 설정"
        className={cn(
          "pointer-events-auto absolute right-2 gap-1.5",
          compact ? "top-2 grid grid-cols-2" : "top-2 flex flex-col",
        )}
      >
        <button
          type="button"
          aria-pressed={turntable}
          aria-keyshortcuts="T"
          disabled={paintMode || cameraLocked || !modelReady}
          title={
            paintMode
              ? "표면 드로잉 중에는 턴테이블을 잠급니다."
              : turntable
                ? "턴테이블 정지 (T)"
                : "턴테이블 회전 (T)"
          }
          aria-label={turntable ? "턴테이블 정지" : "턴테이블 회전"}
          onClick={() => h.setTurntable((value: boolean) => !value)}
          className={cn(HUD_BUTTON, turntable && HUD_BUTTON_ACTIVE)}
        >
          <RotateCw
            size={17}
            aria-hidden
            className={turntable ? "animate-spin [animation-duration:3s] motion-reduce:animate-none" : ""}
          />
          <HudLabel>{bt("회전", "Spin")}</HudLabel>
        </button>
        <button
          type="button"
          aria-label={`조명 톤 바꾸기 (현재 ${lightingLabel})`}
          title={`조명 톤: ${lightingLabel} → ${characterLightingToneLabel(nextCharacterLightingTone(lightingTone))}`}
          disabled={!modelReady}
          onClick={() => h.setLightingTone(nextCharacterLightingTone(lightingTone))}
          className={cn(HUD_BUTTON, "relative")}
        >
          <SunMedium size={17} aria-hidden />
          <span aria-hidden data-character-hud-tone="true" className="absolute inset-x-0 bottom-0.5 text-center text-[0.55rem] font-semibold leading-none">
            {lightingLabel}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={transparent}
          aria-label={transparent ? "투명 배경 끄기" : "투명 배경 켜기"}
          title={transparent ? "투명 배경 · 캔버스에 추가하면 캐릭터만 남습니다" : "배경색 포함 · 투명 배경으로 바꾸려면 누르세요"}
          onClick={() => h.setTransparentBackground(!transparent)}
          className={cn(
            HUD_BUTTON,
            transparent &&
              "border-accent/60 text-accent [background-image:linear-gradient(45deg,oklch(0.75_0.01_80/0.22)_25%,transparent_25%),linear-gradient(-45deg,oklch(0.75_0.01_80/0.22)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,oklch(0.75_0.01_80/0.22)_75%),linear-gradient(-45deg,transparent_75%,oklch(0.75_0.01_80/0.22)_75%)] [background-position:0_0,0_6px,6px_-6px,-6px_0] [background-size:12px_12px]",
          )}
        >
          {transparent ? <Eye size={17} aria-hidden /> : <EyeOff size={17} aria-hidden />}
          <HudLabel>{bt("배경", "BG")}</HudLabel>
        </button>
        <div className={cn("my-0.5 h-px w-full bg-line/70", compact && "hidden")} aria-hidden />
        <button
          type="button"
          aria-label="확대"
          title="확대"
          disabled={cameraLocked || !modelReady}
          onClick={() => h.zoomViewport(0.82)}
          className={HUD_BUTTON}
        >
          <ZoomIn size={17} aria-hidden />
          <HudLabel>{bt("확대", "Zoom in")}</HudLabel>
        </button>
        <button
          type="button"
          aria-label="축소"
          title="축소"
          disabled={cameraLocked || !modelReady}
          onClick={() => h.zoomViewport(1.22)}
          className={HUD_BUTTON}
        >
          <ZoomOut size={17} aria-hidden />
          <HudLabel>{bt("축소", "Zoom out")}</HudLabel>
        </button>
        <button
          type="button"
          aria-label="시점 초기화"
          title="시점 초기화"
          disabled={cameraLocked || !modelReady}
          onClick={() => h.handleViewReset()}
          className={HUD_BUTTON}
        >
          <Maximize2 size={17} aria-hidden />
          <HudLabel>{bt("초기화", "Reset")}</HudLabel>
        </button>
        <div className={cn("my-0.5 h-px w-full bg-line/70", compact && "hidden")} aria-hidden />
        <button
          type="button"
          aria-label="LT 변환"
          title="LT 변환 · 3D 뷰를 선화 + 톤 레이어로 분리"
          disabled={!modelReady}
          onClick={openLtDialog}
          className={HUD_BUTTON}
        >
          <PenLine size={17} aria-hidden />
          <HudLabel>{bt("LT 변환", "LT")}</HudLabel>
        </button>
        {compact && onShowGuide ? (
          <button
            type="button"
            data-character-gesture-guide-trigger="true"
            aria-label={bt("화면 조작 안내 보기", "Show touch controls")}
            title={bt("화면 조작 안내", "Touch controls")}
            onClick={onShowGuide}
            className={HUD_BUTTON}
          >
            <CircleQuestionMark size={17} aria-hidden />
            <HudLabel>{bt("안내", "Help")}</HudLabel>
          </button>
        ) : null}
      </div>

      <div className="pointer-events-auto absolute bottom-2 left-2 flex max-w-[75%] flex-wrap items-center gap-1.5">
        <div role="status" className="min-w-0 max-w-full">
          <StudioHudPill
            accent={pill.accent}
            title={modelName ? `${modelName} · ${pill.text}` : pill.text}
            className="max-w-full truncate"
          >
            {status === "loading" ? (
              <LoaderCircle size={12} aria-hidden className="animate-spin motion-reduce:animate-none" />
            ) : null}
            {pill.text}
          </StudioHudPill>
        </div>
        {!compact && modelReady ? (
          <div
            data-testid="shaper-hud-context-keycaps"
            aria-label="단축키 안내"
            className="flex items-center gap-2 rounded-xl border border-line/60 bg-panel/85 px-2.5 py-1 text-[0.65rem] font-medium text-fg-2 shadow-sm backdrop-blur"
          >
            {resolveShaperContextKeycapStatusGuide({
              tab: paintMode ? "draw" : "camera",
              drawingActive: paintMode,
              cameraStyle: settings?.cameraStyle,
            }).map((item) => (
              <span key={item.keycap} className="inline-flex items-center gap-1">
                <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-line-strong/70 bg-card px-1 font-mono text-[0.6rem] font-bold text-fg">
                  {item.keycap}
                </kbd>
                <span>{item.actionKo}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <StudioLtConvertDialog
        open={ltOpen}
        source={ltSource}
        applyError={ltApplyError}
        onImportImage={handleLtImportImage}
        onApply={onInsertLtLayers ? handleLtApply : undefined}
        applying={applying}
        onDownload={downloadLt}
        onCancel={closeLt}
      />
    </div>
  );
}
