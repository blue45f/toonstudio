import { Compass } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { formatStudioShortcutChord, matchStudioShortcut } from "../studio-app-settings";
import { cycleStudioStabilizerStrength } from "../studio-pro-draw-prefs";
import { useStudioDrawingClarity } from "../studio-cuttoon-editor/StudioDrawingClarityContext";
import type { StudioDrawingErgonomicsSession } from "../studio-cuttoon-editor/StudioDrawingQuickErgonomicsBar";
import {
  RADIAL_DIAL_CONTEXT_META,
  inferRadialDialContext,
  type RadialDialActionId,
  type RadialDialContextId,
  type RadialDialSlot,
} from "./studio-radial-quick-dial-engine";
import {
  STUDIO_SHORTCUT_PROFILE_APPLIED_EVENT,
  createDefaultShortcutAndDialProfile,
  type StudioShortcutAndDialProfile,
} from "./studio-shortcut-profile-engine";
import { StudioRadialQuickDialOverlay } from "./StudioRadialQuickDialOverlay";

export interface StudioRadialQuickDialTriggerAndHostProps {
  readonly session: StudioDrawingErgonomicsSession;
  readonly blocked: boolean;
  readonly onPushCue: (keycap: string, label: string, value?: string) => void;
  readonly onResetZoom: () => void;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function stepBrushWidthForDial(current: number, direction: -1 | 1): number {
  const rounded = Math.max(1, Math.round(Number.isFinite(current) ? current : 4));
  const delta = rounded >= 24 ? 6 : rounded >= 10 ? 3 : rounded >= 4 ? 2 : 1;
  return Math.max(1, Math.min(200, rounded + direction * delta));
}

function isShortcutProfileEventDetail(value: unknown): value is StudioShortcutAndDialProfile {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    (value as { readonly schemaVersion?: unknown }).schemaVersion === 1 &&
    "dialContexts" in value
  );
}

/**
 * 스튜디오 그리기 옵션 바에 상황별 8방향 퀵 다이얼 진입 버튼과 단축키(`Alt+Q`)를 연결하는 호스트.
 */
export function StudioRadialQuickDialTriggerAndHost({
  session: s,
  blocked,
  onPushCue,
  onResetZoom,
}: StudioRadialQuickDialTriggerAndHostProps): ReactElement {
  const clarity = useStudioDrawingClarity();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [profile, setProfile] = useState<StudioShortcutAndDialProfile>(() =>
    createDefaultShortcutAndDialProfile(),
  );
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [manualContext, setManualContext] = useState<RadialDialContextId | null>(null);

  const inferredContext = inferRadialDialContext({
    activeSurfaceReviewLocked: s.activeSurfaceReviewLocked,
    exportMenuOpen: s.exportMenuOpen,
    bg3dOpen: s.bg3dOpen,
    tool: s.tool,
    drawMode: s.drawMode,
    stabilizer: s.stabilizer,
    activeBrushId: s.activeCatalogBrush?.id,
    activeBrushName: s.activeCatalogBrush?.name,
  });
  const activeContext = manualContext ?? inferredContext;
  const activeContextMeta = RADIAL_DIAL_CONTEXT_META[activeContext];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleProfileApplied = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      if (isShortcutProfileEventDetail(event.detail)) {
        setProfile(event.detail);
      }
    };
    window.addEventListener(STUDIO_SHORTCUT_PROFILE_APPLIED_EVENT, handleProfileApplied);
    return () => {
      window.removeEventListener(STUDIO_SHORTCUT_PROFILE_APPLIED_EVENT, handleProfileApplied);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const triggerChord = profile.dialTriggerShortcut.trim();
    if (!triggerChord) return;

    const handleGlobalDialTrigger = (event: KeyboardEvent) => {
      if (event.repeat || isEditableKeyboardTarget(event.target)) return;
      if (!matchStudioShortcut(triggerChord, event)) return;
      event.preventDefault();
      setManualContext(null);
      setAnchor(null);
      setOpen((prev) => !prev);
    };

    window.addEventListener("keydown", handleGlobalDialTrigger);
    return () => window.removeEventListener("keydown", handleGlobalDialTrigger);
  }, [profile.dialTriggerShortcut]);

  const handleSelectAction = useCallback(
    (actionId: RadialDialActionId, slot: RadialDialSlot, contextId: RadialDialContextId) => {
      const triggerEl =
        triggerRef.current ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : document.body);
      onPushCue(
        slot.shortcutKey,
        slot.action.labelKo,
        RADIAL_DIAL_CONTEXT_META[contextId].labelKo,
      );

      switch (actionId) {
        case "undo":
          if (!blocked) s.undo?.();
          return;
        case "redo":
          if (!blocked) s.redo?.();
          return;
        case "brush-larger":
          if (!blocked) s.setStrokeWidth((current) => stepBrushWidthForDial(current, 1));
          return;
        case "brush-smaller":
          if (!blocked) s.setStrokeWidth((current) => stepBrushWidthForDial(current, -1));
          return;
        case "tool-fill":
        case "correct-current-stroke":
        case "toggle-transparent-color":
          if (!blocked) s.activatePrimaryCanvasTool("draw", "pen");
          return;
        case "tool-eraser":
          if (!blocked) s.activatePrimaryCanvasTool("draw", "eraser");
          return;
        case "tool-eyedropper":
          if (!blocked) s.setEyedropperActive?.(true);
          return;
        case "flip-canvas":
          if (s.studioOptionsBarsHandlers?.flipCanvasHorizontal) {
            s.studioOptionsBarsHandlers.flipCanvasHorizontal();
          } else {
            s.toggleCanvasFlipX?.();
          }
          return;
        case "cycle-stabilizer":
          if (!blocked) s.setStabilizer((current) => cycleStudioStabilizerStrength(current));
          return;
        case "toggle-perspective-snap":
        case "bg3d-sync-perspective":
          if (!blocked) s.setPerspectiveRulerActive?.((active) => !active);
          return;
        case "toggle-size-lock":
          s.studioOptionsBarsHandlers?.toggleSizeLock?.();
          return;
        case "new-layer":
          clarity?.open("layers", triggerEl);
          return;
        case "toggle-bg3d":
        case "bg3d-camera-fit":
        case "bg3d-wall-cutaway":
        case "bg3d-ground-snap":
        case "bg3d-lighting-toggle":
        case "bg3d-lt-extract":
        case "bg3d-snapshot":
          if (!s.bg3dOpen || actionId === "toggle-bg3d") {
            s.studioLeftToolRailHandlers.toggleBg3dEditor();
          }
          return;
        case "tool-lettering":
          if (!blocked) {
            s.activatePrimaryCanvasTool("select");
            clarity?.open("commands", triggerEl);
          }
          return;
        case "lettering-batch-edit":
        case "lettering-sfx-place":
        case "lettering-overflow-check":
          clarity?.open("commands", triggerEl);
          return;
        case "toggle-webtoon-guides":
          s.setShowWebtoonGuides((visible) => !visible);
          return;
        case "actual-size-view":
        case "fit-view":
        case "reset-view":
          onResetZoom();
          return;
        case "tool-select":
          s.activatePrimaryCanvasTool("select");
          return;
        case "tool-comment":
        case "toggle-chrome":
          clarity?.open("commands", triggerEl);
          return;
        case "open-export-menu":
          s.setExportMenuOpen(true);
          return;
      }
    },
    [blocked, clarity, onPushCue, onResetZoom, s],
  );

  const formattedTrigger = profile.dialTriggerShortcut
    ? formatStudioShortcutChord(profile.dialTriggerShortcut)
    : "미지정";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="studio-drawing-ergonomics-chip min-h-11"
        aria-pressed={open}
        aria-haspopup="menu"
        aria-keyshortcuts={profile.dialTriggerShortcut || undefined}
        data-studio-radial-quick-dial-trigger="true"
        data-radial-dial-inferred-context={inferredContext}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setManualContext(null);
          setAnchor({
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.bottom + 148),
          });
          setOpen((prev) => !prev);
        }}
        title={`상황별 8방향 퀵 다이얼 열기 (${formattedTrigger} · 현재: ${activeContextMeta.labelKo})`}
      >
        <Compass size={15} aria-hidden="true" />
        <span>8방향 다이얼 · {activeContextMeta.labelKo}</span>
      </button>

      <StudioRadialQuickDialOverlay
        open={open}
        contextId={activeContext}
        anchor={anchor}
        contextSlots={profile.dialContexts}
        deadzonePx={profile.dialDeadzonePx}
        hysteresisDeg={profile.dialHysteresisDeg}
        triggerShortcutLabel={profile.dialTriggerShortcut}
        onContextChange={(nextContext) => setManualContext(nextContext)}
        onContextSlotsChange={(nextContexts) => {
          setProfile((prev) => ({
            ...prev,
            dialContexts: nextContexts,
          }));
        }}
        onSelectAction={handleSelectAction}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
