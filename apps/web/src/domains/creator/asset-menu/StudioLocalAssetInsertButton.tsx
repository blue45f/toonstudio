import { BadgeCheck, Loader2, Plus, Sparkles } from "lucide-react";
import { useState } from "react";

import type { StudioAsset } from "../studio-asset-library";

import { useT } from "@/shared/lib/i18n";

interface Props {
  readonly asset: StudioAsset;
  readonly onUse: (asset: StudioAsset) => boolean;
  readonly onUseBg3d?: (asset: StudioAsset) => Promise<boolean>;
}

export function StudioLocalAssetInsertButton({ asset, onUse, onUseBg3d }: Props) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const addToView = t("studio.assetMenu.addToCurrentView", "선택한 컷 또는 현재 보이는 위치에 추가");

  function handleInsert(): void {
    if (asset.kind !== "bg3d" || !onUseBg3d) {
      onUse(asset);
      return;
    }
    if (pending) return;
    setPending(true);
    void onUseBg3d(asset).finally(() => setPending(false));
  }

  return (
    <button
      type="button"
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={handleInsert}
      className="relative flex h-20 w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-panel"
      style={{
        // Warm checkerboard (Canva/Photopea asset preview) — not cold neutral-800.
        backgroundColor: "oklch(0.22 0.01 66)",
        backgroundImage:
          "linear-gradient(45deg, oklch(0.26 0.01 66) 25%, transparent 25%), linear-gradient(-45deg, oklch(0.26 0.01 66) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, oklch(0.26 0.01 66) 75%), linear-gradient(-45deg, transparent 75%, oklch(0.26 0.01 66) 75%)",
        backgroundSize: "10px 10px",
        backgroundPosition: "0 0, 0 5px, 5px -5px, -5px 0",
      }}
      title={`${asset.name} · ${addToView}`}
      aria-label={`${asset.name} ${addToView}`}
    >
      <img
        src={asset.dataUrl}
        alt=""
        className="max-h-full max-w-full object-contain drop-shadow-sm transition-transform duration-150 group-hover:scale-105"
      />
      {pending && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-card/70" aria-hidden>
          <Loader2 size={18} className="motion-safe:animate-spin" />
        </span>
      )}
      {asset.kind === "ai" && (
        <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-md bg-accent px-1 py-px text-[0.5rem] font-bold uppercase leading-none tracking-wide text-on-accent shadow">
          <Sparkles size={7} aria-hidden /> AI
        </span>
      )}
      {asset.kind === "bg3d" && (
        <span className="pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-md border border-line/70 bg-panel/90 px-1 py-px text-[0.5rem] font-bold leading-none tracking-wide text-fg-2 shadow backdrop-blur-sm">
          <BadgeCheck size={8} className="text-good" aria-hidden />
          {t("studio.assetMenu.rightsBadge", "권리 인증")}
        </span>
      )}
      <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-md border border-line/40 bg-panel/90 px-1.5 py-0.5 text-[0.55rem] font-semibold text-fg shadow-sm backdrop-blur-sm">
        <Plus size={10} aria-hidden /> {t("studio.assetMenu.cardAction.add", "추가")}
      </span>
    </button>
  );
}
