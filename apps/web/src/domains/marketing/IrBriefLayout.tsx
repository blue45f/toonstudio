import { ArrowLeft, ArrowRight, Download, Presentation } from "lucide-react";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { INTRO_SECTION } from "./public/intro-tokens";
import { IR_BRIEF_SECTIONS as SECTIONS, IR_BRIEF_GROUPS as GROUPS, resolveIrBriefSection } from "./ir-brief-navigation";

const BriefContext = createContext("overview");


/** 본문은 한 목적 안에서 한 항목씩 읽고, 기존 발표·파일 링크는 어디서든 찾을 수 있다. */
export function IrBriefLayout({ children, onPresent }: { readonly children: ReactNode; readonly onPresent: (trigger: HTMLElement) => void }) {
  const bi = useBilingualLocalizer("IrBriefLayout"), location = useLocation();
  const selected = resolveIrBriefSection(location.search, location.hash);
  const section = SECTIONS.find(item => item.id === selected);
  const heading = useRef<HTMLHeadingElement>(null), previous = useRef(selected);
  const href = (id: string) => {
    const query = new URLSearchParams(location.search);
    if (id === "overview") query.delete("brief"); else query.set("brief", id);
    return `${location.pathname}${query.size ? `?${query}` : ""}${id === "overview" ? "" : `#ir-${id}-title`}`;
  };
  useEffect(() => {
    if (previous.current === selected) return;
    previous.current = selected;
    const target = selected === "overview" ? heading.current : document.getElementById(`ir-${selected}-title`);
    target?.focus();
  }, [selected]);
  const index = SECTIONS.findIndex(item => item.id === selected), next = SECTIONS[index + 1], prior = SECTIONS[index - 1];
  return <BriefContext.Provider value={selected}>
    <header className="rounded-2xl border border-line bg-card p-5 sm:p-7">
      <p className="text-xs font-bold tracking-widest text-accent">IR · TOONSTUDIO</p>
      <h1 ref={heading} tabIndex={-1} id="ir-brief-title" className="mt-2 text-2xl font-black tracking-tight text-fg sm:text-4xl">{section ? bi(section.ko, section.en) : bi("ToonStudio 투자 소개", "ToonStudio investor brief")}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-2">{bi("웹툰 기획부터 연재·운영까지 연결하는 브라우저 제작 OS. 궁금한 주제를 골라 읽어 보세요.", "A browser production OS connecting webtoon planning, publishing and operations. Choose a topic to read.")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {section ? <Link href={href("overview")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg"><ArrowLeft size={16} aria-hidden />{bi("소개 목차", "Brief contents")}</Link> : null}
        <button type="button" onClick={event => onPresent(event.currentTarget)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-accent bg-accent-soft px-3 text-sm font-bold text-accent"><Presentation size={17} aria-hidden />{bi("발표 시작", "Start presenting")}</button>
        <Link href="/ir/present" className="inline-flex min-h-12 items-center rounded-xl border border-line px-3 text-sm font-semibold text-fg">{bi("전체 발표 · 24씬", "Full presentation · 24 scenes")}</Link>
        <Link href={href("downloads")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg"><Download size={16} aria-hidden />{bi("자료 받기", "Get the deck")}</Link>
      </div>
    </header>
    {!section ? <nav aria-label={bi("투자 소개 목적 고르기", "Choose an investor topic")} className="my-5 grid gap-3 md:grid-cols-3">
      {GROUPS.map(group => <Link key={group.id} href={href(group.start)} className="flex min-h-28 flex-col justify-between gap-3 rounded-2xl border border-line bg-card p-5 text-fg hover:border-accent">
        <strong className="text-lg">{bi(group.ko, group.en)}</strong><span className="text-sm text-fg-2">{bi(group.detailKo, group.detailEn)}</span><ArrowRight size={18} aria-hidden />
      </Link>)}
    </nav> : <nav aria-label={bi("현재 주제의 세부 목차", "Sections in this topic")} className="my-5 flex flex-wrap gap-2">
      {SECTIONS.filter(item => item.group === section.group).map(item => <Link key={item.id} href={href(item.id)} aria-current={selected === item.id ? "page" : undefined}
        className={`inline-flex min-h-12 items-center rounded-xl border px-3 text-sm font-semibold ${selected === item.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2"}`}>{bi(item.ko, item.en)}</Link>)}
    </nav>}
    {children}
    {section ? <nav aria-label={bi("소개 읽기 이동", "Read the brief")} className="mt-6 flex flex-wrap justify-between gap-3 border-t border-line py-5">
      <Link href={href(prior?.id ?? "overview")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg"><ArrowLeft size={16} aria-hidden />{prior ? bi(prior.ko, prior.en) : bi("소개 목차", "Brief contents")}</Link>
      <Link href={href(next?.id ?? "overview")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg">{next ? bi(next.ko, next.en) : bi("소개 목차", "Brief contents")}<ArrowRight size={16} aria-hidden /></Link>
    </nav> : null}
  </BriefContext.Provider>;
}

export function IrBriefSection({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  const selected = useContext(BriefContext);
  if (selected !== id) return null;
  return <section className={INTRO_SECTION} aria-labelledby={id === "overview" ? "ir-brief-title" : `ir-${id}-title`} data-ir-brief-section={id}>{children}</section>;
}
