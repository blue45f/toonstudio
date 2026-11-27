// Krita 스타일 롱프레스 원형 색상 휠(center != null) + 좌측 레일·상단 바 색상 선택 팝오버(center == null).
// 기존 center == null 또는 recentColors == [] 일 때 null을 반환하며 colorWheelOpen=true 고착으로
// 캔버스 드로잉과 브러시 커서를 먹통으로 만들던 버그를 근본 해결한다.
import { X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  COLOR_WHEEL_SWATCH_RADIUS_PX,
  colorWheelSliceOffset,
  hitTestColorWheel,
  isKeyboardActivatedClick,
} from "./studio-color-wheel";

import { cx } from "@/shared/lib/cx";

const DEFAULT_WHEEL_COLORS = [
  "#111111",
  "#ffffff",
  "#e11d48",
  "#f97316",
  "#eab308",
  "#10b981",
  "#2563eb",
  "#7c3aed",
] as const;

const WEBTOON_SWATCH_SECTIONS = [
  {
    title: "선화 · 무채색",
    swatches: ["#111111", "#27272a", "#52525b", "#a1a1aa", "#e4e4e7", "#ffffff"],
  },
  {
    title: "인물 · 피부 톤",
    swatches: ["#fff3e8", "#fde2cc", "#f9c6a6", "#eeb08c", "#d48c6a", "#9c5a3c"],
  },
  {
    title: "웹툰 포인트 · 감정",
    swatches: ["#e11d48", "#f97316", "#eab308", "#10b981", "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899"],
  },
] as const;

function normalizeHex6(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/u.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/u.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function rgbCssToHex(cssColor: string | null | undefined): string | null {
  if (!cssColor) return null;
  const direct = normalizeHex6(cssColor);
  if (direct) return direct;
  const m = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/iu);
  if (!m) return null;
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(Number(m[1]))}${toHex(Number(m[2]))}${toHex(Number(m[3]))}`;
}

function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const val = Math.max(0, Math.min(1, v));
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  let r1: number;
  let g1: number;
  let b1: number;
  if (hue < 60) [r1, g1, b1] = [c, x, 0];
  else if (hue < 120) [r1, g1, b1] = [x, c, 0];
  else if (hue < 180) [r1, g1, b1] = [0, c, x];
  else if (hue < 240) [r1, g1, b1] = [0, x, c];
  else if (hue < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const toHex = (f: number) => Math.round((f + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const norm = normalizeHex6(hex) ?? "#111111";
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function readCurrentRailSwatchHex(fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const swatch = document.querySelector<HTMLElement>(
    '[data-studio-rail-tool-id="color"] .studio-drawing-clarity-swatch',
  );
  const fromStyle = rgbCssToHex(swatch?.style.backgroundColor);
  if (fromStyle) return fromStyle;
  if (swatch) {
    const computed = rgbCssToHex(getComputedStyle(swatch).backgroundColor);
    if (computed) return computed;
  }
  return fallback;
}

function resolvePopoverPosition(): { left: number; top: number } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { left: 56, top: 96 };
  }
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 800;
  const cardW = 304;
  const cardH = 440;
  const trigger =
    document.querySelector<HTMLElement>('[data-studio-rail-tool-id="color"]') ??
    document.querySelector<HTMLElement>('[aria-label="컬러 휠"]');
  if (trigger) {
    const r = trigger.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const preferRight = r.right + 10;
      const left =
        preferRight + cardW + 12 <= vw
          ? preferRight
          : Math.max(12, Math.min(vw - cardW - 12, r.left - cardW - 10));
      const top = Math.max(52, Math.min(vh - cardH - 12, r.top - 12));
      return { left: Math.round(left), top: Math.round(top) };
    }
  }
  return {
    left: Math.max(12, Math.round((vw - cardW) / 2)),
    top: Math.max(52, Math.round((vh - cardH) / 2)),
  };
}

export type StudioColorWheelOverlayProps = {
  /** 열림 여부 — false면 아무것도 렌더링하지 않는다. */
  open: boolean;
  /** 휠 중심(뷰포트 px, clientX/clientY 기준) — null이면 좌측 레일/상단 바 기준 색상 선택 팝오버로 열린다. */
  center: { x: number; y: number } | null;
  /** 휠에 배치할 색(최대 8개) — 비어 있으면 기본 웹툰 스와치로 안전 폴백한다. */
  colors: string[];
  /** 색상이 선택됐을 때 호출 — 브러시 색 반영은 호출부 책임. */
  onSelect: (color: string) => void;
  /** 팝업이 닫혀야 할 때(선택 완료/취소/바깥 클릭/Esc) 호출. */
  onClose: () => void;
};

export function StudioColorWheelOverlay({
  open,
  center,
  colors,
  onSelect,
  onClose,
}: StudioColorWheelOverlayProps): React.ReactElement | null {
  const rootRef = useRef<HTMLDivElement>(null);
  const svAreaRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const effectiveColors = useMemo(
    () => (colors.length > 0 ? colors : [...DEFAULT_WHEEL_COLORS]),
    [colors],
  );
  const defaultHex = normalizeHex6(effectiveColors[0]) ?? "#111111";
  const [hsv, setHsv] = useState(() => hexToHsv(readCurrentRailSwatchHex(defaultHex)));
  const [hexDraft, setHexDraft] = useState(() => readCurrentRailSwatchHex(defaultHex));
  const [popoverPos, setPopoverPos] = useState(() => resolvePopoverPosition());

  useLayoutEffect(() => {
    if (!open) return;
    setHoveredIndex(null);
    const freshHex = readCurrentRailSwatchHex(normalizeHex6(effectiveColors[0]) ?? "#111111");
    setHsv(hexToHsv(freshHex));
    setHexDraft(freshHex);
    if (!center) {
      setPopoverPos(resolvePopoverPosition());
    }
  }, [open, center, effectiveColors]);

  useEffect(() => {
    if (!open) return;
    const onOutsidePointerDown = (e: PointerEvent | MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      const railTrigger =
        typeof document !== "undefined"
          ? document.querySelector('[data-studio-rail-tool-id="color"]')
          : null;
      if (railTrigger?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const onResize = () => {
      if (!center) setPopoverPos(resolvePopoverPosition());
    };
    document.addEventListener("pointerdown", onOutsidePointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onOutsidePointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, center, onClose]);

  const applyHexLive = useCallback(
    (nextHex: string, closeAfter = false) => {
      const normalized = normalizeHex6(nextHex);
      if (!normalized) return;
      setHsv(hexToHsv(normalized));
      setHexDraft(normalized);
      onSelect(normalized);
      if (closeAfter) onClose();
    },
    [onClose, onSelect],
  );

  const updateSvFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const box = svAreaRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0 || box.height <= 0) return;
      const nextS = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
      const nextV = Math.max(0, Math.min(1, 1 - (clientY - box.top) / box.height));
      setHsv((prev) => {
        const nextHex = hsvToHex(prev.h, nextS, nextV);
        setHexDraft(nextHex);
        onSelect(nextHex);
        return { h: prev.h, s: nextS, v: nextV };
      });
    },
    [onSelect],
  );

  if (!open) return null;

  // 1) 캔버스 롱프레스 모드(center != null): Krita식 8색 원형 퀵 휠
  if (center) {
    const total = effectiveColors.length;
    const resolveHit = (clientX: number, clientY: number) =>
      hitTestColorWheel(clientX - center.x, clientY - center.y, total);

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      const hit = resolveHit(e.clientX, e.clientY);
      setHoveredIndex(hit.kind === "slice" ? hit.index : null);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      const hit = resolveHit(e.clientX, e.clientY);
      if (hit.kind === "slice") {
        onSelect(effectiveColors[hit.index]);
        onClose();
      } else if (hit.kind === "cancel") {
        onClose();
      }
      setHoveredIndex(null);
    };

    return (
      <div
        ref={rootRef}
        className="fixed inset-0 z-[70]"
        style={{ touchAction: "none" }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="menu"
        aria-label="최근 사용 색 빠른 선택"
      >
        <div className="absolute" style={{ left: center.x, top: center.y }}>
          <span className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/40" />
          {effectiveColors.map((c, i) => {
            const offset = colorWheelSliceOffset(i, total, COLOR_WHEEL_SWATCH_RADIUS_PX);
            const active = hoveredIndex === i;
            return (
              <button
                key={`${c}-${i}`}
                type="button"
                role="menuitem"
                title={c}
                aria-label={`최근 색 ${c} 선택`}
                onClick={(e) => {
                  if (!isKeyboardActivatedClick(e.detail)) return;
                  onSelect(c);
                  onClose();
                }}
                className={cx(
                  "absolute size-9 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border-2 shadow-lg transition-transform duration-150",
                  active ? "scale-125 border-accent" : "border-line",
                )}
                style={{ left: offset.x, top: offset.y, background: c }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // 2) 좌측 레일 `색상` 버튼 / 상단 바 클릭 모드(center == null): 정식 고정형 색상 선택 팝오버
  const activeHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const pureHueHex = hsvToHex(hsv.h, 1, 1);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="false"
      aria-label="색상 선택"
      data-studio-color-popover="true"
      data-studio-shortcut-boundary="true"
      style={{ left: popoverPos.left, top: popoverPos.top }}
      className="fixed z-[180] flex w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col gap-3 rounded-2xl border border-line-strong bg-panel p-3.5 text-fg shadow-2xl [word-break:keep-all]"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line pb-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-6 shrink-0 rounded-lg border border-line-strong shadow-inner"
            style={{ backgroundColor: activeHex }}
          />
          <div>
            <h2 className="text-sm font-semibold leading-tight">브러시·채우기 색상</h2>
            <p className="font-mono text-xs tabular-nums text-fg-2">{activeHex.toUpperCase()}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="색상 선택 닫기"
          onClick={onClose}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      {/* 채도·명도 2D 필드 */}
      <div
        ref={svAreaRef}
        role="slider"
        tabIndex={0}
        aria-label="채도 및 명도 조절"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={activeHex}
        style={{
          backgroundColor: pureHueHex,
          backgroundImage:
            "linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, transparent)",
          touchAction: "none",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateSvFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if ((e.buttons & 1) === 1) updateSvFromPointer(e.clientX, e.clientY);
        }}
        className="relative h-36 w-full cursor-crosshair select-none overflow-hidden rounded-xl border border-line-strong"
      >
        <span
          aria-hidden="true"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: activeHex,
          }}
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel ring-2 ring-fg shadow-md"
        />
      </div>

      {/* 색상(Hue) 360도 슬라이더 */}
      <label className="flex flex-col gap-1">
        <span className="flex items-center justify-between text-xs font-medium text-fg-2">
          <span>색상 링</span>
          <span className="tabular-nums">{Math.round(hsv.h)}°</span>
        </span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          aria-label="색상 각도 조절"
          value={Math.round(hsv.h)}
          onChange={(e) => {
            const nextH = Number(e.currentTarget.value);
            const nextHex = hsvToHex(nextH, hsv.s, hsv.v);
            setHsv((prev) => ({ ...prev, h: nextH }));
            setHexDraft(nextHex);
            onSelect(nextHex);
          }}
          style={{
            background:
              "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
          }}
          className="h-3 w-full cursor-pointer appearance-none rounded-full border border-line"
        />
      </label>

      {/* HEX 직접 입력 + OS 스포이드/컬러피커 */}
      <div className="flex items-center gap-2">
        <label className="relative flex min-h-11 flex-1 items-center">
          <span className="sr-only">16진수 색상 코드</span>
          <input
            type="text"
            data-studio-color-hex="true"
            value={hexDraft}
            maxLength={7}
            onChange={(e) => {
              const raw = e.currentTarget.value;
              setHexDraft(raw);
              const valid = normalizeHex6(raw);
              if (valid) {
                setHsv(hexToHsv(valid));
                onSelect(valid);
              }
            }}
            className="min-h-11 w-full rounded-xl border border-line bg-card px-3 font-mono text-xs font-semibold uppercase tabular-nums text-fg focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        <input
          type="color"
          aria-label="시스템 색상 선택기"
          value={activeHex}
          onChange={(e) => applyHexLive(e.currentTarget.value)}
          className="size-11 shrink-0 cursor-pointer rounded-xl border border-line bg-card p-1"
        />
      </div>

      {/* 웹툰 전용 추천 팔레트 + 최근 사용 색상 */}
      <div className="max-h-44 space-y-2.5 overflow-y-auto overscroll-contain pr-0.5">
        {colors.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium text-fg-2">최근 사용 색상</p>
            <div className="flex flex-wrap gap-1.5">
              {colors.slice(0, 8).map((swatch, idx) => (
                <button
                  key={`recent-${swatch}-${idx}`}
                  type="button"
                  title={swatch}
                  aria-label={`최근 색상 ${swatch} 적용`}
                  onClick={() => applyHexLive(swatch)}
                  style={{ backgroundColor: swatch }}
                  className="size-8 rounded-lg border border-line-strong transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
                />
              ))}
            </div>
          </div>
        ) : null}
        {WEBTOON_SWATCH_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-1 text-xs font-medium text-fg-2">{section.title}</p>
            <div className="flex flex-wrap gap-1.5">
              {section.swatches.map((swatch) => {
                const selected = normalizeHex6(swatch) === activeHex;
                return (
                  <button
                    key={swatch}
                    type="button"
                    title={swatch}
                    aria-label={`색상 ${swatch} 선택`}
                    aria-pressed={selected}
                    onClick={() => applyHexLive(swatch)}
                    style={{ backgroundColor: swatch }}
                    className={cx(
                      "size-8 rounded-lg border transition-transform duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-accent",
                      selected ? "scale-105 border-accent ring-2 ring-accent" : "border-line-strong",
                    )}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <footer className="flex items-center justify-end border-t border-line pt-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl border border-accent bg-accent px-4 text-xs font-semibold text-on-accent transition-colors duration-150 hover:opacity-95 focus-visible:outline-2 focus-visible:outline-accent"
        >
          선택 완료
        </button>
      </footer>
    </div>
  );
}
