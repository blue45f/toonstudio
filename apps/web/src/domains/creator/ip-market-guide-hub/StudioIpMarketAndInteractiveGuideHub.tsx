/**
 * 양방향 IP·게임 변환 + 마켓 30초 시착·로열티 + 30초 인터랙티브 가이드 통합 허브.
 * 3개 컬러 탭(`IP·게임 변환` · `마켓 시착·로열티` · `30초 인터랙티브 가이드`)과
 * 5종 생성 스프라이트(`emblem-guide-map`, `emblem-market`, `emblem-community`, `tech-remotion`, `tool-bg3d`)를 전면 적용한다.
 */

import { useState, type KeyboardEvent } from "react";

import "./ip-market-guide-hub.css";
import { InteractiveGuideMissionTabPanel } from "./InteractiveGuideMissionTabPanel";
import { IpGameTransformTabPanel } from "./IpGameTransformTabPanel";
import { MarketTryOnBountyTabPanel } from "./MarketTryOnBountyTabPanel";

export type IpMarketGuideHubTabId = "ip-game" | "market-royalty" | "interactive-guide";

export interface StudioIpMarketAndInteractiveGuideHubProps {
  readonly initialProjectTitle?: string;
  readonly initialTab?: IpMarketGuideHubTabId;
  readonly onStatusNotice?: (message: string) => void;
}

interface HubTabSpec {
  readonly id: IpMarketGuideHubTabId;
  readonly labelKo: string;
  readonly subLabelKo: string;
  readonly spritePath: string;
}

const HUB_TABS: readonly HubTabSpec[] = [
  {
    id: "ip-game",
    labelKo: "IP·게임 변환",
    subLabelKo: "웹툰↔소설·드라마·애니·게임",
    spritePath: "/assets/studio/vibrant-sprites/tech-remotion.webp",
  },
  {
    id: "market-royalty",
    labelKo: "마켓 시착·로열티",
    subLabelKo: "30초 시착·BOM 100% 정산·POD",
    spritePath: "/assets/studio/vibrant-sprites/emblem-market.webp",
  },
  {
    id: "interactive-guide",
    labelKo: "30초 인터랙티브 가이드",
    subLabelKo: "5대 체험 미션·단축키 시뮬레이터",
    spritePath: "/assets/studio/vibrant-sprites/emblem-guide-map.webp",
  },
];

const HEADER_SPRITE_EMBLEMS: readonly { readonly labelKo: string; readonly spritePath: string }[] = [
  { labelKo: "30초 가이드", spritePath: "/assets/studio/vibrant-sprites/emblem-guide-map.webp" },
  { labelKo: "마켓 시착", spritePath: "/assets/studio/vibrant-sprites/emblem-market.webp" },
  { labelKo: "공동 로열티", spritePath: "/assets/studio/vibrant-sprites/emblem-community.webp" },
  { labelKo: "숏폼·비주얼노벨", spritePath: "/assets/studio/vibrant-sprites/tech-remotion.webp" },
  { labelKo: "3D·게임 에셋", spritePath: "/assets/studio/vibrant-sprites/tool-bg3d.webp" },
];

export function StudioIpMarketAndInteractiveGuideHub({
  initialProjectTitle = "옥상 위의 시간표",
  initialTab = "ip-game",
  onStatusNotice,
}: StudioIpMarketAndInteractiveGuideHubProps) {
  const [activeTab, setActiveTab] = useState<IpMarketGuideHubTabId>(initialTab);
  const [projectTitle, setProjectTitle] = useState(initialProjectTitle);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleNotify = (message: string) => {
    setStatusMessage(message);
    onStatusNotice?.(message);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const total = HUB_TABS.length;
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? total - 1
          : event.key === "ArrowRight"
            ? (currentIndex + 1) % total
            : (currentIndex - 1 + total) % total;
    const nextTab = HUB_TABS[nextIndex];
    if (nextTab) setActiveTab(nextTab.id);
  };

  return (
    <section
      className="img-hub-shell"
      data-active-tab={activeTab}
      data-testid="studio-ip-market-guide-hub"
      aria-labelledby="img-hub-main-title"
    >
      <div className="img-hub-inner">
        <header className="img-hub-header">
          <div>
            <p className="img-hub-kicker">IP TRANSFORMER · LIVE MARKET TRY-ON · 30s INTERACTIVE GUIDE</p>
            <h2 id="img-hub-main-title" className="img-hub-title">
              양방향 IP·게임 변환 · 마켓 30초 시착 · 실전 미션 가이드 허브
            </h2>
            <p className="img-hub-lead">
              웹툰 원고를 웹소설·드라마 프리비즈·Remotion 애니·게임 에셋과 비주얼 노벨로 넘기고,
              마켓 소재 30초 시착·Rights BOM 100% 공동 정산·30초 체험 가이드까지 한곳에서 바로 실행합니다.
            </p>
          </div>
          <div className="img-hub-sprite-ribbon" aria-label="허브 핵심 기능 엠블럼">
            {HEADER_SPRITE_EMBLEMS.map((emblem) => (
              <span key={emblem.labelKo} className="img-hub-sprite-chip">
                <img
                  src={emblem.spritePath}
                  alt={emblem.labelKo}
                  className="img-hub-sprite-img"
                />
                <span>{emblem.labelKo}</span>
              </span>
            ))}
          </div>
        </header>

        <div className="img-hub-grid img-hub-grid-2">
          <label className="text-xs font-bold text-fg-2">
            변환·출고 기준 작품명
            <input
              type="text"
              className="img-hub-input mt-1"
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              placeholder="예: 옥상 위의 시간표"
            />
          </label>
          <div
            role="status"
            aria-live="polite"
            className="img-hub-subcard"
            data-testid="ip-market-guide-hub-status"
          >
            <strong className="text-xs font-bold text-fg">실시간 작업 상태</strong>
            <p className="img-hub-muted">
              {statusMessage ?? "탭을 선택해 IP·게임 변환, 30초 마켓 시착·로열티 정산, 30초 체험 미션을 바로 테스트하세요."}
            </p>
          </div>
        </div>

        <div className="img-hub-tablist" role="tablist" aria-label="창작 생태계 확장 허브 탭">
          {HUB_TABS.map((tab, index) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`img-hub-tab-${tab.id}`}
                type="button"
                role="tab"
                data-tab-tone={tab.id}
                className="img-hub-tab"
                aria-selected={selected}
                aria-controls={`img-hub-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <img
                  src={tab.spritePath}
                  alt=""
                  aria-hidden="true"
                  className="img-hub-sprite-img-lg"
                />
                <span className="flex flex-col items-start text-left">
                  <span>{tab.labelKo}</span>
                  <span className="text-xs font-medium text-fg-2">{tab.subLabelKo}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          id={`img-hub-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`img-hub-tab-${activeTab}`}
        >
          {activeTab === "ip-game" ? (
            <IpGameTransformTabPanel projectTitle={projectTitle} onNotify={handleNotify} />
          ) : activeTab === "market-royalty" ? (
            <MarketTryOnBountyTabPanel onNotify={handleNotify} />
          ) : (
            <InteractiveGuideMissionTabPanel onNotify={handleNotify} />
          )}
        </div>
      </div>
    </section>
  );
}
