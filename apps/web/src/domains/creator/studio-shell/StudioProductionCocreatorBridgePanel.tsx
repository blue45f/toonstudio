import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { ArrowRight, ClipboardCheck, Handshake, Scale, Users } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonClass } from "@/shared/components/ui/button-utils";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProductionCocreatorBridgePanel", ko, en);

export function StudioProductionCocreatorBridgePanel({
  projectId,
  locale: _locale,
}: {
  readonly projectId: string;
  readonly locale: "ko" | "en";
}) {
  useBilingualI18nRevision();

  const href = `/production/projects/${encodeURIComponent(projectId)}/overview`;
  return (
    <section className="rounded-2xl border border-accent/30 bg-accent-soft p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-accent">
            {bi("함께 제작하기", "Create together")}
          </p>
          <h2 className="mt-2 text-lg font-black tracking-tight text-fg">
            {bi("이야기·그림·검토·이용 조건을 한곳에서 확인", "Story, artwork, review and usage terms in one place")}
          </h2>
          <p className="mt-2 text-xs leading-6 text-fg-2">
            {bi("이 작품의 초안 확정과 그림 전달, 담당자 확인, 의뢰 범위, 크레딧·보상을 관리합니다.", "Manage draft approval, artwork handoffs, assigned reviews, commissions, credits and compensation for this project.")}
          </p>
        </div>
        <Link className={buttonClass()} to={href}>
          {bi("함께 제작하는 작업 보기", "View team production")}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          [Handshake, bi("이야기에서 그림으로 전달", "Story to artwork")],
          [ClipboardCheck, bi("단계별 함께 확인", "Review each stage together")],
          [Users, bi("담당자와 승인자", "Assignees and reviewers")],
          [Scale, bi("크레딧·권리·보상", "Credits, rights and pay")],
        ].map(([Icon, label]) => {
          const ItemIcon = Icon as typeof Handshake;
          return (
            <div key={label as string} className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-xs font-semibold text-fg">
              <ItemIcon className="size-4 text-accent" aria-hidden="true" />
              {label as string}
            </div>
          );
        })}
      </div>
    </section>
  );
}
