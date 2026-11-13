import { BookOpenText, Download, Headphones, HeartHandshake, MonitorSmartphone, PlayCircle, Scale, Sparkles, Users, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { Container } from "@/shared/components/section";
import { SectionArt } from "@/shared/components/section-art";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type SupportCategory = "story" | "production" | "staffing" | "rights" | "localization" | "environment";

const REQUEST_KEY = "toonstudio:creator-support-request:v1";

export function StudioCreatorSupportPage() {
  const bt = useBilingual("StudioCreatorSupportPage");
  useDocumentTitle(bt("작가 지원 센터", "Creator support"));
  const [category, setCategory] = useState<SupportCategory>("story");
  const [summary, setSummary] = useState("");
  const [contact, setContact] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const brief = useRef<HTMLDetailsElement>(null), video = useRef<HTMLDetailsElement>(null);
  const location = useLocation();
  useEffect(() => {
    const reveal = () => { const hash = window.location.hash || location.hash; const target = hash === "#support-request" ? brief.current : hash === "#product-tour" ? video.current : null; if (target) target.open = true; };
    reveal(); window.addEventListener("hashchange", reveal); return () => window.removeEventListener("hashchange", reveal);
  }, [location.hash]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(REQUEST_KEY);
      if (!raw) return;
      const value = JSON.parse(raw) as { category?: SupportCategory; summary?: string; contact?: string };
      if (["story", "production", "staffing", "rights", "localization", "environment"].includes(value.category ?? "")) setCategory(value.category!);
      setSummary(String(value.summary ?? "").slice(0, 6000));
      setContact(String(value.contact ?? "").slice(0, 500));
    } catch { /* optional draft */ }
  }, []);

  const clearSaveStatus = () => {
    setSaved(false);
    setSaveFailed(false);
  };

  const saveRequest = () => {
    const payload = { version: 1, category, summary: summary.trim(), contact: contact.trim(), createdAt: new Date().toISOString() };
    let persisted = false;
    try {
      window.localStorage.setItem(REQUEST_KEY, JSON.stringify(payload));
      persisted = true;
    } catch { /* Keep the user-initiated export available when browser storage is blocked. */ }
    setSaved(persisted);
    setSaveFailed(!persisted);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "creator-support-request.json";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const speakIntro = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(bt(
      "작가 지원 센터입니다. 스토리 기획, 제작 운영, 어시스트 인력, 판권, 현지화, 사용 환경 지원 경로를 한 곳에서 확인할 수 있습니다.",
      "This is the creator support center. Find support paths for story development, production, staffing, rights, localization and environment setup.",
    ));
    utterance.lang = document.documentElement.lang?.startsWith("en") ? "en-US" : "ko-KR";
    window.speechSynthesis.speak(utterance);
  };

  const cards = [
    { icon: BookOpenText, title: bt("스토리·웹소설", "Story & web novel"), body: bt("시놉시스, 회차, 웹툰 전환, Writer Room까지 이어지는 창작 흐름", "Synopsis, chapters, webtoon adaptation and Writer Room workflow"), to: "/studio", action: bt("프로젝트 열기", "Open projects") },
    { icon: Users, title: bt("제작·어시스트 인력", "Production staffing"), body: bt("역할·예산·지역·계약 조건을 기준으로 소싱 브리프와 후보군 매칭", "Build sourcing briefs and matching pools by role, budget, region and contract terms"), to: "/studio", action: bt("프로젝트 제작 화면", "Open production") },
    { icon: Scale, title: bt("판권·영상화", "Rights & adaptation"), body: bt("권리 정본, 피치 자료, 영화·애니·게임 제안 문의 접수 절차", "Chain of title, pitch material and the film, animation and game inquiry intake process"), to: "/studio", action: bt("프로젝트 내보내기", "Open export") },
    { icon: MonitorSmartphone, title: bt("사용 환경·PWA", "Environment & PWA"), body: bt("WebRTC, 3D, 펜·터치, 저장소, 앱 설치와 오프라인 상태 진단", "Check WebRTC, 3D, pen/touch, storage, install and offline readiness"), to: "/studio/environment", action: bt("환경 진단", "Run environment check") },
    { icon: Sparkles, title: bt("AI 제작 보조", "AI production assist"), body: bt("대사·구도·배경·캐릭터·색상 작업을 원본을 덮지 않는 제안 방식으로 지원", "Assist dialogue, composition, backgrounds, characters and palettes without overwriting originals"), to: "/settings/ai?source=studio", action: bt("AI 설정", "AI settings") },
    { icon: HeartHandshake, title: bt("제작 생태계", "Creator ecosystem"), body: bt("번역 승인, 공개 검토, 제작 과정 공유와 공동 창작 흐름", "Translation approval, release review, process sharing and co-creation workflows"), to: "/studio/ecosystem", action: bt("생태계 열기", "Open ecosystem") },
  ] as const;

  return (
    <div className="min-h-screen bg-canvas py-8 sm:py-12">
      <Container size="wide">
        <section className="overflow-hidden rounded-3xl border border-line bg-card shadow-sm">
          <div className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.8fr)] lg:items-center">
            <div>
              <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent"><HeartHandshake size={16} /> CREATOR SUPPORT</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-fg sm:text-4xl">{bt("창작부터 계약 준비까지 지원 흐름을 한곳에", "Creator support from drafting to deal readiness")}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">{bt("기능을 나열하는 도움말이 아니라 지금 하는 작업에 맞는 다음 화면, 환경 진단, 제작 지원, 인력 소싱, 판권 준비로 바로 연결합니다.", "Instead of a feature list, jump from your current task to the right workspace, environment checks, production support, staffing or rights readiness.")}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <a href="#support-request" onClick={() => { if (brief.current) brief.current.open = true; }} className={buttonClass({ className: "gap-2" })}><Download size={16} aria-hidden="true" /> {bt("지원 브리프 작성", "Create a support brief")}</a>
                <a href="#product-tour" onClick={() => { if (video.current) video.current.open = true; }} className={buttonClass({ variant: "quiet", className: "gap-2" })}><PlayCircle size={16} /> {bt("영상 가이드", "Video guide")}</a>
              </div><details className="mt-4"><summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-fg-2">{bt("추가 도움 경로", "More support options")}</summary><div className="flex flex-wrap gap-2">
                <button type="button" onClick={speakIntro} className={buttonClass({ variant: "outline", className: "gap-2" })}><Volume2 size={16} /> {bt("음성으로 안내 듣기", "Listen to overview")}</button>
                <Link to="/creator-support" className={buttonClass({ variant: "outline", className: "gap-2" })}>{bt("신인·학생 창작자 지원 안내", "New & student creator support")}</Link>
                <Link to="/studio/growth-ip" className={buttonClass({ variant: "outline", className: "gap-2" })}>{bt("작가 성장·IP 확장 작업대", "Growth & IP workbench")}</Link>
                <Link to="/help" className={buttonClass({ variant: "quiet", className: "gap-2" })}>{bt("도움말 센터", "Help center")}</Link>
              </div></details>
            </div>
            <div className="flex flex-col gap-4">
              <SectionArt image="community" className="hidden aspect-[16/10] w-full rounded-3xl border border-line object-cover lg:block" />
              <details className="rounded-3xl border border-accent/20 bg-accent-soft/15 p-5"><summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-fg">{bt("화면별 도움 안내", "Help inside each workspace")}</summary>
                <Headphones className="size-8 text-accent" />
                <h2 className="mt-3 text-lg font-black text-fg">{bt("페이지별 설명도 작업 흐름 안에서", "Contextual help inside every project section")}</h2>
                <p className="mt-2 text-xs leading-6 text-fg-2">{bt("프로젝트의 Story, Production, Export 등 각 화면 하단에서 현재 화면을 음성으로 듣거나 제품 투어로 이동할 수 있습니다. 자동 재생은 하지 않습니다.", "Story, Production, Export and other project sections now offer optional voice guidance and a link to the product tour. Nothing auto-plays.")}</p>
              </details>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={bt("지원 영역", "Support areas")}>
          {cards.map(({ icon: Icon, title, body, to, action }) => (
            <article key={title} className="flex flex-col rounded-3xl border border-line bg-card p-5 shadow-sm">
              <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent"><Icon size={20} /></span>
              <h2 className="mt-4 text-lg font-black text-fg">{title}</h2>
              <p className="mt-2 flex-1 text-xs leading-6 text-fg-2">{body}</p>
              <Link to={to} className={buttonClass({ variant: "outline", className: "mt-4 w-full" })}>{action}</Link>
            </article>
          ))}
        </section>

        <details ref={video} className="mt-5 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-6"><summary className="min-h-12 cursor-pointer py-3 font-semibold text-fg">{bt("영상으로 제작 흐름 보기", "Watch the workflow guide")}</summary><section id="product-tour">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">PRODUCT TOUR</p>
          <h2 className="mt-2 text-2xl font-black text-fg">{bt("영상으로 전체 제작 흐름 보기", "Watch the full production workflow")}</h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">{bt("기존 Remotion 제품 투어 렌더를 재사용합니다. 모바일에서는 전체 화면으로 열어 단계별 흐름을 확인할 수 있습니다.", "Reuses the existing Remotion product-tour render. On mobile, open it full-screen to follow the workflow.")}</p>
          <video className="mt-4 aspect-video w-full rounded-2xl border border-line bg-black object-contain" controls preload="metadata" poster="/brand/toonstudio-product-tour-poster.jpg">
            <source src="/brand/toonstudio-product-tour.mp4" type="video/mp4" />
            <track kind="captions" src="/brand/toonstudio-product-tour.ko.vtt" srcLang="ko" label="한국어" default />
            <track kind="captions" src="/brand/toonstudio-product-tour.en.vtt" srcLang="en" label="English" />
          </video>
        </section></details>

        <details ref={brief} className="mt-5 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-6"><summary className="min-h-12 cursor-pointer py-3 font-semibold text-fg">{bt("지원 브리프 작성", "Create a support brief")}</summary><section id="support-request" className="scroll-mt-24" aria-labelledby="support-request-title">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">SUPPORT BRIEF</p>
          <h2 id="support-request-title" tabIndex={-1} className="mt-2 text-xl font-black text-fg">{bt("지원 요청 브리프 만들기", "Create a support request brief")}</h2>
          <div id="support-request-privacy" className="mt-4 rounded-2xl border border-line bg-panel p-4 text-sm leading-6 text-fg-2">
            <p className="font-bold text-fg">{bt("이 브라우저에 저장 · 파일로 내보내기", "Save in this browser · export a file")}</p>
            <p className="mt-1">{bt("상담 접수나 전송은 되지 않습니다. 작성한 내용과 연락 방법은 저장 버튼을 누르면 이 브라우저와 내보낸 JSON 파일에 보관됩니다. 공용 기기에서는 개인정보를 입력하지 마세요.", "This does not submit or send a support ticket. Saving keeps your brief and contact details in this browser and the exported JSON file. Do not enter personal information on a shared device.")}</p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <label className="text-xs font-bold text-fg-2">{bt("지원 유형", "Support type")}<select className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" value={category} onChange={(event) => { setCategory(event.target.value as SupportCategory); clearSaveStatus(); }}><option value="story">{bt("스토리/시놉시스", "Story / synopsis")}</option><option value="production">{bt("제작 운영", "Production")}</option><option value="staffing">{bt("인력 소싱", "Staffing")}</option><option value="rights">{bt("판권/계약 준비", "Rights / deal prep")}</option><option value="localization">{bt("번역/현지화", "Localization")}</option><option value="environment">{bt("기술/환경", "Technical setup")}</option></select></label>
            <label className="text-xs font-bold text-fg-2">{bt("연락 방법 (선택)", "Contact (optional)")}<input className="mt-1 min-h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm text-fg" aria-describedby="support-request-privacy" value={contact} maxLength={500} onChange={(event) => { setContact(event.target.value); clearSaveStatus(); }} placeholder={bt("업무용 이메일/메신저 등", "Business email or messenger")} /></label>
          </div>
          <label className="mt-3 block text-xs font-bold text-fg-2">{bt("도움이 필요한 내용", "What do you need help with?")}<textarea className="mt-1 min-h-28 w-full resize-y rounded-xl border border-line bg-panel px-3 py-2 text-sm leading-6 text-fg" aria-describedby="support-request-hint support-request-count" value={summary} maxLength={6000} onChange={(event) => { setSummary(event.target.value); clearSaveStatus(); }} /></label>
          <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs leading-5 text-fg-2">
            <p id="support-request-hint">{bt("현재 작업, 막힌 부분, 원하는 도움을 적어 주세요.", "Describe your work, what is blocking you and the help you need.")}</p>
            <p id="support-request-count" className="shrink-0 tabular-nums">{summary.length.toLocaleString()} / 6,000{bt("자", " characters")}</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={!summary.trim()} onClick={saveRequest} className={buttonClass({ className: "gap-2" })}><Download size={16} /> {bt("요청 브리프 저장·내보내기", "Save & export request")}</button>
            {saved ? <span role="status" className="text-xs font-bold text-success">{bt("브라우저에 초안을 저장했습니다.", "Draft saved in this browser.")}</span> : null}
            {saveFailed ? <span role="alert" className="text-xs font-bold text-warning">{bt("브라우저에 초안을 저장하지 못했습니다. 내보낸 파일을 보관해 주세요.", "Could not save the browser draft. Keep the exported file.")}</span> : null}
          </div>
        </section></details>
      </Container>
    </div>
  );
}
