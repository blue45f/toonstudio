import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function ProductionProjectLoading() {
  const bt = useBilingual("ProductionProjectPage");
  return (
    <div data-route-pending="production-project" className="min-h-dvh bg-canvas p-6 text-fg" role="status">
      <div className="mx-auto max-w-5xl animate-pulse space-y-3 rounded-3xl border border-line bg-card p-8 motion-reduce:animate-none">
        <div className="h-4 w-40 rounded bg-raised" />
        <div className="h-8 w-72 rounded bg-raised" />
        <p className="text-sm text-fg-2">{bt("제작 프로젝트를 불러오는 중…", "Loading the production project…")}</p>
      </div>
    </div>
  );
}
