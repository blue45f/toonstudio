import { useEffect, useState } from "react";

import {
  resolveStudioMarketplaceAssetPreview,
  type StudioMarketplaceAssetPreview,
} from "@/domains/creator/public/marketplace-asset-access";
import { useT } from "@/shared/lib/i18n";

export function MarketBuiltinAssetPreview({ runtimeRef }: { readonly runtimeRef: string }) {
  const t = useT();
  const [resolved, setResolved] = useState<{ ref: string; preview: StudioMarketplaceAssetPreview | null } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  useEffect(() => {
    setResolved({ ref: runtimeRef, preview: resolveStudioMarketplaceAssetPreview(runtimeRef) });
  }, [runtimeRef]);
  const preview = resolved?.ref === runtimeRef ? resolved.preview : null;
  if (!preview) return null;
  return (
    <figure className="border-b border-line bg-panel/30 p-3" data-market-real-preview="true">
      {failedSource === preview.src ? (
        <p role="alert" className="p-4 text-sm text-fg-2">{t("market.builtinPreview.loadFailed", "실제 미리보기 파일을 불러오지 못했습니다. Studio에서 다시 확인해 주세요.")}</p>
      ) : (
        <img src={preview.src} alt={`${preview.name} 실제 에셋 미리보기`} decoding="async" className="max-h-[32rem] w-full rounded-lg object-contain" onError={() => setFailedSource(preview.src)} />
      )}
      <figcaption className="mt-2 text-xs leading-relaxed text-fg-3">{preview.caption}</figcaption>
    </figure>
  );
}
