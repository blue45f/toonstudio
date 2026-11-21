import { useId, useState, type KeyboardEvent } from "react";
import { BookOpen, Eye, Film, Globe2, Layers, ShieldCheck } from "lucide-react";

import { CutReuseBankTab, ReadabilityAuditTab, StoryTensionBranchTab } from "./IpCreativeTabsPartOne";
import { AudioTrailerTab, CulturalLocalizationTab, LocalLoraCleanroomTab } from "./IpCreativeTabsPartTwo";
import "./ip-creative-engines.css";

type IpCreativeTabId = "a11y" | "reuse" | "story" | "media" | "l10n" | "clean";

interface TabDescriptor {
  readonly id: IpCreativeTabId;
  readonly labelKo: string;
  readonly shortDescKo: string;
  readonly tone: IpCreativeTabId;
}

const SUITE_TABS: readonly TabDescriptor[] = [
  { id: "a11y", labelKo: "다크·색맹 검수", shortDescKo: "야간 배경 매몰 탐지 및 자동 외곽선 교정", tone: "a11y" },
  { id: "reuse", labelKo: "컷 재활용 뱅크", shortDescKo: "1~100화 표정·손·소품 검색 및 1초 삽입", tone: "reuse" },
  { id: "story", labelKo: "관계도·텐션·분기", shortDescKo: "무스포일러 30초 요약, 텐션 곡선, 분기 루프 검증", tone: "story" },
  { id: "media", labelKo: "오디오·숏폼 예고", shortDescKo: "성우 큐시트 변환 및 9:16 모션 트레일러", tone: "media" },
  { id: "l10n", labelKo: "5개국 문화 현지화", shortDescKo: "관용구 치환, 일본어 세로쓰기, 말풍선 안전 보정", tone: "l10n" },
  { id: "clean", labelKo: "로컬 LoRA·클린룸", shortDescKo: "화풍 데이터셋 패키징(₩0) 및 저작권 사전 판정", tone: "clean" },
];

function TabIcon({ id }: { readonly id: IpCreativeTabId }) {
  if (id === "a11y") return <Eye size={16} aria-hidden="true" />;
  if (id === "reuse") return <Layers size={16} aria-hidden="true" />;
  if (id === "story") return <BookOpen size={16} aria-hidden="true" />;
  if (id === "media") return <Film size={16} aria-hidden="true" />;
  if (id === "l10n") return <Globe2 size={16} aria-hidden="true" />;
  return <ShieldCheck size={16} aria-hidden="true" />;
}

export interface StudioIpCreativeEnginesPanelProps {
  readonly projectId?: string;
  readonly initialTab?: IpCreativeTabId;
}

export function StudioIpCreativeEnginesPanel({
  projectId,
  initialTab = "a11y",
}: StudioIpCreativeEnginesPanelProps) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<IpCreativeTabId>(initialTab);
  const currentTabMeta = SUITE_TABS.find((tab) => tab.id === activeTab) ?? SUITE_TABS[0];

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % SUITE_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + SUITE_TABS.length) % SUITE_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = SUITE_TABS.length - 1;
    setActiveTab(SUITE_TABS[nextIndex].id);
  };

  return (
    <section
      className="ipce-suite"
      aria-label="IP 창작·가독성·컷재활용·텐션·오디오/트레일러·현지화·클린룸 스위트"
      data-testid="studio-ip-creative-engines-panel"
    >
      <header className="ipce-header">
        <div className="ipce-title-group">
          <h3 className="ipce-title">
            창작·독자·IP 현지화 &amp; 클린룸 스위트{projectId ? ` · ${projectId}` : ""}
          </h3>
          <p className="ipce-subtitle">{currentTabMeta.shortDescKo}</p>
        </div>
        <span className="ipce-zero-badge">로컬 결정론 엔진 · 과금 ₩0</span>
      </header>

      <div role="tablist" aria-label="IP 창작 스위트 기능 탭" className="ipce-tablist">
        {SUITE_TABS.map((tab, index) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              data-tone={tab.tone}
              className="ipce-tab"
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              <TabIcon id={tab.id} />
              <span>{tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${activeTab}`}
      >
        {activeTab === "a11y" ? <ReadabilityAuditTab /> : null}
        {activeTab === "reuse" ? <CutReuseBankTab /> : null}
        {activeTab === "story" ? <StoryTensionBranchTab /> : null}
        {activeTab === "media" ? <AudioTrailerTab /> : null}
        {activeTab === "l10n" ? <CulturalLocalizationTab /> : null}
        {activeTab === "clean" ? <LocalLoraCleanroomTab /> : null}
      </div>
    </section>
  );
}
