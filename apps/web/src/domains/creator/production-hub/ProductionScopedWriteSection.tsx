import { useState, type ComponentType } from "react";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function ProductionScopedWriteSection({ aggregate }: { readonly aggregate: ProductionProjectAggregate }) {
  const bt = useBilingual("ProductionScopedWriteSection"), [open, setOpen] = useState(false), [loading, setLoading] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<{ readonly aggregate: ProductionProjectAggregate }> | null>(null), [error, setError] = useState(false);
  const load = async () => {
    if (Panel || loading) return;
    setLoading(true); setError(false);
    try { const module = await import("./ProductionScopedWritePanel"); setPanel(() => module.ProductionScopedWritePanel); }
    catch { setError(true); }
    finally { setLoading(false); }
  };
  return <details className="rounded-2xl border border-line bg-card p-4" onToggle={(event) => {
    setOpen(event.currentTarget.open); if (event.currentTarget.open) void load();
  }}>
    <summary className="cursor-pointer rounded-lg text-sm font-bold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      {bt("실제 원고의 담당 편집 범위 배정", "Assign editing ranges in saved manuscripts")}
    </summary>
    {open ? <div className="mt-4 space-y-3">
      {loading ? <p role="status">{bt("편집 범위 관리를 불러오고 있습니다.", "Loading editing range management.")}</p> : null}
      {error ? <div role="alert"><p>{bt("편집 범위 관리를 불러오지 못했습니다.", "Could not load editing range management.")}</p>
        <button type="button" className={buttonClass({ variant: "outline", size: "sm" })} onClick={() => void load()}>{bt("다시 불러오기", "Reload")}</button></div> : null}
      {Panel ? <Panel aggregate={aggregate} /> : null}
    </div> : null}
  </details>;
}
