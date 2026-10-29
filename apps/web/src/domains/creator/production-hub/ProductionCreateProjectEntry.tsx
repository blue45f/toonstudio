import { useEffect, useRef, useState, type ComponentType } from "react";
import { Plus } from "lucide-react";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 실제 생성 UI와 SQLite는 사용자가 생성 화면을 연 뒤에만 불러온다. */
export function ProductionCreateProjectEntry({ actorId }: { readonly actorId: string }) {
  const bt = useBilingual("ProductionCreateProjectEntry"), alive = useRef(true);
  const [Dialog, setDialog] = useState<ComponentType<{ readonly actorId: string; readonly onClose: () => void }> | null>(null);
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const show = async () => {
    if (loading) return;
    if (Dialog) { setOpen(true); return; }
    setLoading(true); setError(false);
    try {
      const module = await import("./ProductionCreateProjectDialog");
      if (alive.current) { setDialog(() => module.ProductionCreateProjectDialog); setOpen(true); }
    } catch { if (alive.current) setError(true); }
    finally { if (alive.current) setLoading(false); }
  };
  return <div className="space-y-2">
    <button type="button" disabled={loading} onClick={() => void show()}
      className={buttonClass({ variant: "outline", size: "lg", className: "gap-2" })}>
      <Plus className="size-4" aria-hidden="true" />{loading ? bt("불러오는 중…", "Loading…") : bt("제작 프로젝트 만들기", "Create production project")}
    </button>
    {error ? <p role="alert" className="text-xs text-bad">{bt("생성 화면을 불러오지 못했습니다. 다시 눌러 불러와 주세요.", "Could not load creation. Press the button to try again.")}</p> : null}
    {Dialog && open ? <Dialog actorId={actorId} onClose={() => setOpen(false)} /> : null}
  </div>;
}
