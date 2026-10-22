/**
 * Creative starter-card art — Canva 스타일 시작 카드의 그라데이션+글리프 헤더.
 *
 * `studio-creative-visuals.tsx`에서 분리한 순수 표시 컴포넌트다.
 */

import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export type StudioStarterArtId =
  | "draw"
  | "smart-shape"
  | "brush-kit"
  | "template"
  | "collab-focus"
  | "character"
  | "background-3d"
  | "bubble"
  | "example";

/** Gradient + glyph header for Canva-style starter cards. */
export function StudioStarterCardArt({
  id,
  className,
}: {
  id: StudioStarterArtId;
  className?: string;
}): ReactElement {
  const gradient = (() => {
    switch (id) {
      case "draw":
        return "linear-gradient(145deg, oklch(0.35 0.06 42 / 0.55), oklch(0.2 0.02 70 / 0.8))";
      case "smart-shape":
        return "linear-gradient(145deg, oklch(0.38 0.08 290 / 0.35), oklch(0.2 0.02 70 / 0.85))";
      case "brush-kit":
        return "linear-gradient(145deg, oklch(0.4 0.1 150 / 0.3), oklch(0.2 0.02 70 / 0.85))";
      case "template":
        return "linear-gradient(145deg, oklch(0.36 0.06 232 / 0.35), oklch(0.2 0.02 70 / 0.85))";
      case "collab-focus":
        return "linear-gradient(145deg, oklch(0.32 0.03 70 / 0.5), oklch(0.18 0.01 70 / 0.9))";
      case "character":
        return "linear-gradient(145deg, oklch(0.4 0.09 25 / 0.28), oklch(0.2 0.02 70 / 0.85))";
      case "background-3d":
        return "linear-gradient(145deg, oklch(0.42 0.11 52 / 0.34), oklch(0.19 0.02 70 / 0.9))";
      case "bubble":
        return "linear-gradient(145deg, oklch(0.42 0.04 85 / 0.4), oklch(0.22 0.02 70 / 0.85))";
      case "example":
      default:
        return "linear-gradient(145deg, oklch(0.45 0.12 42 / 0.4), oklch(0.22 0.03 42 / 0.75))";
    }
  })();

  return (
    <div
      data-studio-starter-art={id}
      className={cn(
        "relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg",
        className
      )}
      style={{ background: gradient }}
    >
      {/* Soft ledger grain */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.97 0.01 85 / 0.06) 1px, transparent 1px), linear-gradient(90deg, oklch(0.97 0.01 85 / 0.05) 1px, transparent 1px)",
          backgroundSize: "6px 6px",
        }}
      />
      <svg
        aria-hidden
        width={40}
        height={28}
        viewBox="0 0 40 28"
        className="relative text-fg drop-shadow-sm"
      >
        {id === "draw" && (
          <path
            d="M4 20 C10 8, 16 22, 22 10 S32 18, 36 12"
            fill="none"
            stroke="oklch(0.85 0.08 42)"
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        )}
        {id === "smart-shape" && (
          <>
            <rect x={5} y={7} width={12} height={12} rx={1.5} fill="none" stroke="oklch(0.82 0.08 290)" strokeWidth={1.5} />
            <circle cx={29} cy={13} r={6} fill="none" stroke="oklch(0.78 0.06 232)" strokeWidth={1.5} />
          </>
        )}
        {id === "brush-kit" && (
          <>
            <path d="M6 18 C12 10, 16 20, 22 12" fill="none" stroke="oklch(0.8 0.1 150)" strokeWidth={2.2} strokeLinecap="round" />
            <path d="M18 20 C24 12, 28 20, 34 14" fill="none" stroke="oklch(0.75 0.12 42)" strokeWidth={3} strokeLinecap="round" opacity={0.75} />
          </>
        )}
        {id === "template" && (
          <>
            <rect x={4} y={5} width={14} height={18} rx={1.2} fill="oklch(0.3 0.02 232 / 0.45)" stroke="oklch(0.75 0.06 232)" strokeWidth={1.2} />
            <rect x={20} y={5} width={16} height={8} rx={1.2} fill="oklch(0.32 0.02 70 / 0.5)" stroke="oklch(0.7 0.03 70)" strokeWidth={1.1} />
            <rect x={20} y={15} width={16} height={8} rx={1.2} fill="oklch(0.32 0.02 70 / 0.5)" stroke="oklch(0.7 0.03 70)" strokeWidth={1.1} />
          </>
        )}
        {id === "collab-focus" && (
          <rect x={6} y={6} width={28} height={16} rx={2} fill="none" stroke="oklch(0.82 0.04 70)" strokeWidth={1.5} strokeDasharray="3 2" />
        )}
        {id === "character" && (
          <>
            <circle cx={20} cy={10} r={5} fill="none" stroke="oklch(0.8 0.08 25)" strokeWidth={1.5} />
            <path d="M10 24 C12 16, 28 16, 30 24" fill="none" stroke="oklch(0.8 0.08 25)" strokeWidth={1.5} strokeLinecap="round" />
          </>
        )}
        {id === "background-3d" && (
          <>
            <path
              d="M20 3 33 9.5 20 16 7 9.5Z"
              fill="oklch(0.78 0.12 52 / 0.3)"
              stroke="oklch(0.82 0.12 52)"
              strokeWidth={1.35}
              strokeLinejoin="round"
            />
            <path
              d="M7 9.5v9L20 25v-9M33 9.5v9L20 25"
              fill="none"
              stroke="oklch(0.72 0.08 52)"
              strokeWidth={1.35}
              strokeLinejoin="round"
            />
            <path
              d="M4 24h32"
              fill="none"
              stroke="oklch(0.7 0.03 70)"
              strokeWidth={1}
              strokeLinecap="round"
              strokeDasharray="2 2"
            />
          </>
        )}
        {id === "bubble" && (
          <path
            d="M8 6 H28 C31 6, 33 8, 33 10.5 V15 C33 17.5, 31 19.5, 28 19.5 H20 L14 24 V19.5 H12 C9 19.5, 7 17.5, 7 15 V10.5 C7 8, 9 6, 12 6 Z"
            fill="oklch(0.94 0.02 85 / 0.85)"
            stroke="oklch(0.55 0.03 70)"
            strokeWidth={1.2}
          />
        )}
        {id === "example" && (
          <>
            <path d="M5 8 H35" stroke="oklch(0.75 0.1 42)" strokeWidth={1.2} opacity={0.5} />
            <path d="M5 14 H28" stroke="oklch(0.75 0.1 42)" strokeWidth={1.2} opacity={0.7} />
            <path d="M5 20 H22" stroke="oklch(0.75 0.1 42)" strokeWidth={1.2} />
          </>
        )}
      </svg>
    </div>
  );
}

