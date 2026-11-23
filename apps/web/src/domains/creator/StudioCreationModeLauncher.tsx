import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { StudioVibrantToolArtwork } from "./canvas-chrome/StudioVibrantToolArtwork";
import {
  resolveSafePopoverAnchor,
  STUDIO_Z_LAYERS,
} from "./canvas-chrome/studio-hud-collision-guard";
import { resolveVibrantSpriteForCreationMode } from "./canvas-chrome/studio-vibrant-sprite-catalog";
import {
  StudioQuickMigrateWizard,
  type QuickMigrateAppliedBundle,
} from "./creator-onboarding-pro";
import {
  STUDIO_CREATION_MODE_EVENT,
  type StudioCreationMode,
} from "./studio-creation-mode";

interface StudioCreationModeDefinition {
  readonly id: StudioCreationMode;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly accent: string;
}
/**
 * "캐릭터"는 3D 캐릭터 만들기(셰이퍼)를, "배경"은 장면·3D 배경 메뉴를 연다. 처음 쓰는 사람이 3D 진입점을
 * 찾지 못하던 문제라 설명에 "3D"를 직접 적는다(툴바에 3D 도구를 고정하지 않아도 여기서 바로 보인다).
 */
const CREATION_MODES: readonly StudioCreationModeDefinition[] = [
  {
    id: "draw",
    labelKo: "드로잉",
    labelEn: "Drawing",
    descriptionKo: "브러시·선화·채색",
    descriptionEn: "Brushes, line art, color",
    accent: "violet",
  },
  {
    id: "story",
    labelKo: "스토리",
    labelEn: "Story",
    descriptionKo: "컷·대사·말풍선",
    descriptionEn: "Panels, dialogue, balloons",
    accent: "blue",
  },
  {
    id: "character",
    labelKo: "캐릭터",
    labelEn: "Characters",
    descriptionKo: "3D 캐릭터·포즈·의상",
    descriptionEn: "3D characters, poses, outfits",
    accent: "pink",
  },
  {
    id: "background",
    labelKo: "배경",
    labelEn: "Backgrounds",
    descriptionKo: "장면·원근·3D 배경",
    descriptionEn: "Scenes, perspective, 3D",
    accent: "cyan",
  },
  {
    id: "assets",
    labelKo: "에셋",
    labelEn: "Assets",
    descriptionKo: "소재·이미지·참고",
    descriptionEn: "Materials, images, references",
    accent: "amber",
  },
  {
    id: "ai",
    labelKo: "AI 디렉터",
    labelEn: "AI director",
    descriptionKo: "구도·연출·생성",
    descriptionEn: "Composition, direction, generation",
    accent: "aurora",
  },
] as const;

interface StudioCreationModeLauncherProps {
  readonly className?: string;
  readonly onSelectMode: (mode: StudioCreationMode) => void;
  readonly onQuickMigrateApplied?: (bundle: QuickMigrateAppliedBundle) => void;
}

interface PalettePosition {
  readonly left: number;
  readonly top: number;
  readonly zIndex: number;
}
function resolvePalettePosition(trigger: HTMLElement): PalettePosition {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth > 0 ? window.innerWidth : 1280;
  const vh = window.innerHeight > 0 ? window.innerHeight : 800;
  const width = Math.min(430, Math.max(260, vw - 24));
  const estimatedHeight = Math.min(420, Math.max(240, vh - 24));
  const anchored = resolveSafePopoverAnchor({
    triggerRect: {
      x: rect.left,
      y: rect.top,
      width: Math.max(44, rect.width),
      height: Math.max(44, rect.height),
    },
    popoverSize: { width, height: estimatedHeight },
    viewport: { widthPx: vw, heightPx: vh },
    preferredSide: "right",
    zLayer: "creationModePalette",
  });
  return { left: anchored.left, top: anchored.top, zIndex: anchored.zIndex };
}

export function StudioCreationModeLauncher({
  className,
  onSelectMode,
  onQuickMigrateApplied,
}: StudioCreationModeLauncherProps) {
  const bt = useBilingual("StudioCreationModeLauncher");
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [migrateWizardOpen, setMigrateWizardOpen] = useState(false);
  const [position, setPosition] = useState<PalettePosition>({
    left: 82,
    top: 84,
    zIndex: STUDIO_Z_LAYERS.creationModePalette,
  });

  const runMode = useCallback((mode: StudioCreationMode) => {
    onSelectMode(mode);
    setOpen(false);
  }, [onSelectMode]);
  useEffect(() => {
    const onRequested = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: StudioCreationMode }>).detail?.mode;
      if (!mode || !CREATION_MODES.some((item) => item.id === mode)) return;
      runMode(mode);
    };
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, onRequested);
    return () => window.removeEventListener(STUDIO_CREATION_MODE_EVENT, onRequested);
  }, [runMode]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) setPosition(resolvePalettePosition(triggerRef.current));
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (paletteRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    update();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const toggle = () => {
    if (triggerRef.current) setPosition(resolvePalettePosition(triggerRef.current));
    setOpen((value) => !value);
  };

  // 좁은 레일에서는 글자 줄이 CSS 로 접히므로 이름과 풍선 도움말을 속성으로 직접 단다(이름 없는 버튼 방지).
  const triggerLabel = bt("만들기 · 작업 모드 고르기", "Create · choose a work mode");
  const triggerHint = bt(
    "만들기 — 드로잉·스토리·3D 캐릭터·3D 배경 중 작업 모드를 고릅니다",
    "Create — pick a work mode: drawing, story, 3D characters or 3D backgrounds",
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "studio-creation-mode-trigger studio-vibrant-touch-target studio-vibrant-ink-bloom studio-vibrant-press studio-vibrant-anchor-trigger studio-vibrant-keep-all",
          className,
        )}
        data-vibrant-accent="ink"
        data-vibrant-active={open ? "true" : "false"}
        aria-label={triggerLabel}
        title={triggerHint}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? `${titleId}-palette` : undefined}
        onClick={toggle}
      >
        <span className="studio-creation-mode-trigger__art" aria-hidden="true">
          <StudioVibrantToolArtwork spriteId="emblem-studio" accent="ink" size={28} active={open} />
        </span>
        <span className="studio-creation-mode-trigger__copy">
          <strong>{bt("만들기", "Create")}</strong>
          <small>{bt("작업 모드", "Work mode")}</small>
        </span>
      </button>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={paletteRef}
          id={`${titleId}-palette`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className="studio-creation-mode-palette studio-vibrant-surface studio-vibrant-keep-all studio-vibrant-anchored-popover"
          style={{ left: position.left, top: position.top, zIndex: position.zIndex }}
          data-studio-creation-mode-palette="true"
          data-studio-z-layer={STUDIO_Z_LAYERS.creationModePalette}
          data-hud-collision-free="true"
        >
          <header className="studio-creation-mode-palette__header">
            <div>
              <span>CREATOR WORKSPACES</span>
              <h2 id={titleId}>{bt("무엇을 만들까요?", "What will you make?")}</h2>
              <p>{bt("필요한 도구와 패널을 한 번에 준비합니다.", "Gets the tools and panels ready in one step.")}</p>
            </div>
            <button
              type="button"
              aria-label={bt("작업 모드 닫기", "Close work modes")}
              className="studio-vibrant-touch-target studio-vibrant-press min-h-11 min-w-11"
              onClick={() => setOpen(false)}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="studio-creation-mode-palette__grid">
            {CREATION_MODES.map((mode) => {
              const sprite = resolveVibrantSpriteForCreationMode(mode.id);
              return (
                <button
                  key={mode.id}
                  type="button"
                  data-studio-creation-mode={mode.id}
                  data-accent={mode.accent}
                  data-vibrant-accent={sprite.accent}
                  className="studio-vibrant-touch-target studio-vibrant-ink-bloom studio-vibrant-press studio-vibrant-keep-all min-h-11"
                  onClick={() => runMode(mode.id)}
                >
                  <span className="studio-creation-mode-palette__art" aria-hidden="true">
                    <StudioVibrantToolArtwork
                      spriteId={sprite.spriteId}
                      accent={sprite.accent}
                      size={36}
                    />
                  </span>
                  <span className="studio-creation-mode-palette__copy">
                    <strong>{bt(mode.labelKo, mode.labelEn)}</strong>
                    <small>{bt(mode.descriptionKo, mode.descriptionEn)}</small>
                  </span>
                  <span className="studio-creation-mode-palette__arrow" aria-hidden="true">↗</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <button
              type="button"
              data-studio-quick-migrate-trigger="true"
              data-vibrant-accent="ai"
              onClick={() => {
                setOpen(false);
                setMigrateWizardOpen(true);
              }}
              className="studio-vibrant-touch-target studio-vibrant-press flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line-strong bg-raised px-3.5 py-2.5 text-left text-xs font-medium text-fg transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none [word-break:keep-all]"
            >
              <span className="flex items-center gap-2">
                <StudioVibrantToolArtwork spriteId="tech-webgpu" accent="ai" size={20} />
                <span>
                  {bt(
                    "타 툴 30초 정착 · 단축키 & 7밴드 브러시 매핑",
                    "30s quick migrate · shortcuts & 7-band brushes",
                  )}
                </span>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>,
        document.body,
      ) : null}

      <StudioQuickMigrateWizard
        open={migrateWizardOpen}
        onClose={() => setMigrateWizardOpen(false)}
        onApply={onQuickMigrateApplied}
      />
    </>
  );
}
