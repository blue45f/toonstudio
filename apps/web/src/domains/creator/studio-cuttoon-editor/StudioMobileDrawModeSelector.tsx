import { Grid3X3, Shapes } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import type { DrawMode } from "../studio-editor-tool-model";
import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";

const modes = ["pen", "pixel", "eraser", "shape"] as const;
type MobileDrawMode = (typeof modes)[number];

export function StudioMobileDrawModeSelector({ drawMode, labels, onSelect }: {
  drawMode: DrawMode;
  labels: Record<MobileDrawMode, string>;
  onSelect: (mode: MobileDrawMode) => void;
}) {
  return (
    <div className="mb-2.5 grid grid-cols-4 gap-1 rounded-xl border border-line bg-card/60 p-1" role="group" aria-label="그리기 모드">
      {modes.map((mode) => {
        const active = drawMode === mode;
        const Icon = mode === "pixel" ? Grid3X3 : Shapes;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => {
              if (!active) onSelect(mode);
            }}
            aria-pressed={active}
            aria-label={labels[mode]}
            title={labels[mode]}
            className={cn(
              "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[0.6875rem] font-semibold transition-colors motion-reduce:transition-none",
              active ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:bg-raised"
            )}
          >
            {mode === "pen" || mode === "eraser" ? <StudioToolArtwork tool={mode} /> : <Icon size={18} strokeWidth={1.75} aria-hidden />}
            <span aria-hidden>{labels[mode]}</span>
          </button>
        );
      })}
    </div>
  );
}
