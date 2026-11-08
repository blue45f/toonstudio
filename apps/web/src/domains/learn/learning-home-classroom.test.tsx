// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { LearningHome } from "./LearningHome";
import { LESSONS } from "./learning-content";
import { emptyProgress, type LearningProgress } from "./learning-model";

const state = vi.hoisted(() => ({ progress: {version:1, lessons:{}, bookmarks:[]} as LearningProgress, warning:"", reset:vi.fn() }));
vi.mock("./use-learning-progress", () => ({useLearningProgress:()=>state}));
vi.mock("@/shared/components/page-intro", () => ({PageIntro:({children,...props}: {children:ReactNode})=><main {...props}>{children}</main>}));
vi.mock("@/shared/components/reveal-on-scroll", () => ({RevealOnScroll:({children}: {children:ReactNode})=><>{children}</>}));
vi.mock("@/shared/components/site-experience/WorkflowIllustration", () => ({WorkflowIllustration:()=> <img alt="학습 과정 콘셉트 아트" />}));
vi.mock("@/shared/components/site-experience/SiteArtSurfaceSpotlight", () => ({SiteArtSurfaceSpotlight:()=> <aside>학습 안내</aside>}));
vi.mock("./LearningProcessStudy", () => ({LearningProcessStudy:()=> <aside>학습 과정</aside>}));
vi.mock("./learn-status-i18n", () => ({learnStatusText:(_key:string,fallback:string)=>fallback}));
vi.mock("@/shared/navigation/webtoon-platform-router-ux-model", () => ({LEARN_CURRICULUM_ROADMAP_TRACKS:[]}));
vi.mock("@/domains/legal/public/site-link-card", () => ({SiteLinkCard:({href,title}: {href:string;title:string})=><a href={href}>{title}</a>}));
function mount(url="/learn") { return render(<MemoryRouter initialEntries={[url]}><LearningHome /></MemoryRouter>); }
afterEach(()=>{cleanup(); localStorage.clear(); state.progress=emptyProgress(); state.warning=""; state.reset.mockClear();});
describe("다음 실습 우선 학습 홈",()=>{
  it("실제 첫 12분 수업과 22분 세션을 로드맵보다 앞에 표시한다",()=>{
    mount(); const session=screen.getByRole("region",{name:LESSONS[0].title});
    expect(within(session).getByRole("link",{name:"시작하기"}).getAttribute("href")).toMatch(/story-board\?from=/);
    expect(within(session).getByText(/약 12분/)).toBeTruthy(); expect(within(session).getByText("22분")).toBeTruthy();
    expect(within(session).getByText("0/36")).toBeTruthy();
    const progressLabel = document.querySelector(".learn-dashboard-heading > strong");
    expect(progressLabel?.textContent).toBe("전체 강좌 0% 완료");
    expect(progressLabel?.hasAttribute("aria-label")).toBe(false);
    const roadmap=screen.getByText("학습 경로 · 강좌·자료"); expect(roadmap.closest("details")?.open).toBe(false);
    expect(session.compareDocumentPosition(roadmap)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });
  it("키보드로 네 학습 목적지를 순환하고 오늘의 학습으로 돌아온다",()=>{
    mount();
    const today=screen.getByRole("tab",{name:"오늘의 학습"});
    today.focus();
    fireEvent.keyDown(today,{key:"ArrowRight"});
    const paths=screen.getByRole("tab",{name:/학습 경로/});
    expect(paths.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(paths);
    fireEvent.keyDown(paths,{key:"End"});
    const skills=screen.getByRole("tab",{name:"역량 지도"});
    expect(skills.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(skills,{key:"Home"});
    expect(today.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("link",{name:"시작하기"})).toBeTruthy();
  });
  it("설정 열기와 역할·목표·경험·시간 편집을 유지한다",()=>{
    mount(); fireEvent.click(screen.getByRole("button",{name:"학습 설정 바꾸기"}));
    expect(document.querySelector<HTMLDetailsElement>("#learn-plan")?.open).toBe(true);
    for(const name of ["나의 역할","지금 가장 중요한 목표","현재 경험","한 번에 집중할 시간"]) expect(screen.getByLabelText(name)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("한 번에 집중할 시간"),{target:{value:"15"}});
    expect(screen.getByText("15분 안에 이어갈 학습")).toBeTruthy();
  });
  it("수업 상태·시간과 경로 이동을 분리하고 설정 열림 상태를 전달한다",()=>{
    mount();
    const feature = document.querySelector(".learn-classroom-feature");
    expect(feature).toBeTruthy();
    const settings = screen.getByRole("button", { name: "학습 설정 바꾸기" });
    expect(settings.getAttribute("aria-expanded")).toBe("false");
    expect(settings.getAttribute("aria-controls")).toBe("learn-plan");
    expect(screen.getByRole("link", { name: "경로 보기" }).getAttribute("href")).toMatch(/^\/learn\/paths\//);
    expect(document.querySelector(".learn-classroom-meta")?.textContent).toBe("시작 전약 12분");
    fireEvent.click(settings);
    expect(settings.getAttribute("aria-expanded")).toBe("true");
  });
  it("한 강좌 세션은 빈 순서 목록 대신 집중 안내를 보여 주고 시간을 늘리면 목록을 복원한다",()=>{
    mount();
    fireEvent.click(screen.getByRole("button", { name: "학습 설정 바꾸기" }));
    const duration = screen.getByLabelText("한 번에 집중할 시간");
    fireEvent.change(duration, { target: { value: "15" } });
    expect(screen.getByText("오늘은 이 강좌 하나에 집중해 보세요.")).toBeTruthy();
    expect(document.querySelector(".learn-session-list")).toBeNull();
    expect(screen.getByRole("link", { name: "시작하기" })).toBeTruthy();
    fireEvent.change(duration, { target: { value: "30" } });
    expect(screen.queryByText("오늘은 이 강좌 하나에 집중해 보세요.")).toBeNull();
    expect(document.querySelectorAll(".learn-session-list li")).toHaveLength(1);
  });
  it("필터 공유 주소·빈 결과·초기화에서 전체 강좌 탭을 유지한다",()=>{
    mount("/learn?view=library&q=zzzzzz"); expect(screen.getByRole("tab",{name:/전체 강좌/}).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("조건에 맞는 강좌가 없습니다.")).toBeTruthy(); fireEvent.click(screen.getByRole("button",{name:"필터 초기화"}));
    expect(screen.getByRole("tab",{name:/전체 강좌/}).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("강좌 검색").getAttribute("value")).toBe("");
  });
  it("실제 진행 중 기록은 계속하기로 표시하고 완료 기록은 다음 강좌로 이어진다",()=>{
    state.progress.lessons[LESSONS[0].id]={checks:[0],answer:null,notes:"",completed:false};
    const first=mount(); expect(screen.getByRole("link",{name:"계속하기"})).toBeTruthy(); first.unmount();
    state.progress.lessons[LESSONS[0].id].completed=true;
    mount(); expect(screen.getByRole("heading",{level:2,name:LESSONS[1].title})).toBeTruthy(); expect(screen.getByText("1/36")).toBeTruthy();
  });
  it("계획 앵커·역량 탭·완료비율 안내를 유지한다",()=>{
    mount("/learn#learn-plan"); expect(document.querySelector<HTMLDetailsElement>("#learn-plan")?.open).toBe(true);
    fireEvent.click(screen.getByRole("tab",{name:"역량 지도"}));
    expect(screen.getByText("숙련도 평가가 아니라 관련 강좌의 완료 비율입니다.")).toBeTruthy();
  });
  it("저장 경고와 취소 가능한 기록 초기화를 유지한다",()=>{
    state.warning="저장 실패 경고"; mount(); expect(screen.getByRole("status").textContent).toBe("저장 실패 경고");
    fireEvent.click(screen.getByRole("button",{name:"학습 기록 초기화…"})); expect(state.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"취소"})); expect(state.reset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"학습 기록 초기화…"})); fireEvent.click(screen.getByRole("button",{name:"모두 지우기"}));expect(state.reset).toHaveBeenCalledOnce();
  });
});
