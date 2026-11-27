import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { LegacyPaintImage } from "../presets/legacy-character-paint";

export function LegacyCharacterPaintRecovery({ paint, buttonClass }: { paint: unknown; buttonClass: string }) {
  const bt = useBilingual("LegacyCharacterPaintRecovery");
  const [images, setImages] = useState<readonly LegacyPaintImage[] | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<{ image: LegacyPaintImage; url: string | null } | null>(null);
  const selected = images?.[index];

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    let url: string | null = null;
    void import("../presets/legacy-character-paint")
      .then(({ openLegacyPaintImage }) => openLegacyPaintImage(selected, controller.signal))
      .then((png) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(png);
        setView({ image: selected, url });
      }).catch(() => {
        if (!controller.signal.aborted) setView({ image: selected, url: null });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [selected]);

  if (!paint || typeof paint !== "object" || !("layers" in paint) || !Array.isArray(paint.layers)
    || (!paint.layers.length && !("sublayers" in paint))) return null;
  if (!images) return <div>
    <button className={buttonClass} type="button" onClick={() => {
      void import("../presets/legacy-character-paint").then(({ readLegacyPaintImages }) => {
        setImages(readLegacyPaintImages(paint));
      }).catch(() => setInvalid(true));
    }}>{bt("그린 페인트 원본 보기", "View original paint")}</button>
    {invalid && <p role="alert">{bt("레이어 정보를 읽을 수 없습니다. 원본 JSON을 저장할 수 있습니다.", "Could not read the paint layers. You can still save the original JSON.")}</p>}
  </div>;
  if (!images.length) return <p>{bt("저장된 페인트 이미지가 없습니다.", "No paint images were saved.")}</p>;

  const describe = (image: LegacyPaintImage) => image.slot === null
    ? `${image.part} · ${bt("합성본", "composite")}`
    : `${image.part} · ${bt("레이어", "layer")} ${image.slot + 1} · ${Math.round(image.opacity * 100)}% · ${image.visible ? bt("표시", "visible") : bt("숨김", "hidden")}`;
  const current = view?.image === selected ? view : null;
  return <div className="space-y-2 text-xs text-fg-2">
    <label className="block">{bt("원본 페인트 레이어", "Original paint layer")}
      <select className="block min-h-11 w-full" value={index} onChange={(event) => setIndex(Number(event.currentTarget.value))}>
        {images.map((image, i) => <option key={`${image.part}-${image.slot}`} value={i}>{describe(image)}</option>)}
      </select>
    </label>
    {selected && current?.url && <>
      <img src={current.url} alt={describe(selected)} onError={() => setView({ image: selected, url: null })} className="max-h-48 max-w-full object-contain" />
      <a className={buttonClass} href={current.url} download={`${selected.part}-${selected.slot === null ? "composite" : `layer-${selected.slot + 1}`}.png`}>
        {bt("원본 PNG 저장", "Download original PNG")} · {selected.width} × {selected.height}
      </a>
    </>}
    {current && !current.url && <p role="alert">{bt("PNG 형식이나 해상도를 확인할 수 없습니다. 원본 JSON에는 그대로 보존됩니다.", "Could not verify the PNG or its dimensions. The original JSON retains this data.")}</p>}
    {!current && <p role="status">{bt("PNG 확인 중…", "Checking PNG…")}</p>}
  </div>;
}
