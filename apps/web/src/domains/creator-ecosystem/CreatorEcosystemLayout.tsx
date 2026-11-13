import { BriefcaseBusiness, GraduationCap, LibraryBig, Sparkles } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/shared/lib/utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { ReactNode } from "react";

import "./creator-ecosystem-illustrated.css";

const NAV_ITEMS = [
  {
    to: "/ecosystem/education",
    label: "성장 · 교육",
    description: "학과·학원·교육·지원사업",
    icon: GraduationCap,
    art: "character-blue",
  },
  {
    to: "/ecosystem/collaboration",
    label: "비즈니스 · 협업",
    description: "굿즈·영상·브랜드·IP 제안",
    icon: BriefcaseBusiness,
    art: "project-romance",
  },
  {
    to: "/ecosystem/fandom",
    label: "팬덤 · 코스프레",
    description: "코스프레·행사·팬 창작",
    icon: Sparkles,
    art: "character-pink",
  },
  {
    to: "/ecosystem/library",
    label: "라이브러리",
    description: "소장·읽음·대여·도서관",
    icon: LibraryBig,
    art: "canvas-noir",
  },
] as const;

export function CreatorEcosystemLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  const bt = useBilingual("CreatorEcosystemLayout");
  return (
    <div className="creator-ecosystem-illustrated mx-auto w-full max-w-7xl space-y-5 px-4 py-5 text-fg sm:px-6 sm:py-8">
      <header className="ecosystem-masthead overflow-hidden rounded-3xl border border-line bg-panel p-4 sm:p-6">
        <p className="eyebrow text-accent">TOONSTUDIO CREATOR ECOSYSTEM</p>
        <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-fg-2">{bt("화면 안내", "About this screen")}</summary>
          <p className="max-w-3xl text-sm leading-7 text-fg-2">{intro}</p>
        </details>
      </header>
      {children}
      <details className="rounded-2xl border border-line bg-panel p-4">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">{bt("다른 창작 활동으로 이동", "Explore other creator activities")}</summary>
      <nav
        aria-label="창작자 생태계 메뉴"
        className="ecosystem-navigation grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {NAV_ITEMS.map(({ to, label, description, icon: Icon, art }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn(
              "ecosystem-navigation-card group rounded-2xl border p-4 transition-colors",
              isActive
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-panel hover:border-accent/50 hover:bg-raised",
            )}
          >
            <img className="ecosystem-navigation-art" src={`/brand/illustrated-20260928/${art}.webp`} alt="" aria-hidden="true" width={120} height={140} loading="lazy" />
            <span className="ecosystem-navigation-copy">
              <Icon size={18} aria-hidden="true" />
              <span className="mt-2 block text-sm font-bold">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-fg-3">{description}</span>
            </span>
          </NavLink>
        ))}
      </nav>
      </details>
    </div>
  );
}
