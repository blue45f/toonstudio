/**
 * WebCodecs 4K/60fps 릴스 · 무한 캔버스 희소 타일 벡터 · OPFS 버전 관리 통합 대시보드 패널.
 *
 * - Props 없이 단독 렌더 가능하며 Calm Atelier 시맨틱 토큰만 사용한다(원시 색상 0건).
 * - 브라우저 웹 스토리지, 전속성 전환, 장식 아이콘을 일절 사용하지 않는다.
 */

import { Cpu, Film, GitBranch, Grid2x2, HardDrive, ShieldCheck } from "lucide-react";
import { useCallback, useId, useState, type KeyboardEvent, type ReactElement } from "react";

import type { VfsBackendKind } from "./opfs-snapshot-vcs";
import { OpfsSnapshotVcsTab } from "./OpfsSnapshotVcsTab";
import { SparseTileKalmanTab } from "./SparseTileKalmanTab";
import { WebcodecsReelsTab } from "./WebcodecsReelsTab";

export type WebcodecsOpfsTabId = "reels" | "sparse-tiles" | "opfs-vcs";

export interface StudioWebcodecsOpfsPanelProps {
  readonly initialTab?: WebcodecsOpfsTabId;
  readonly className?: string;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const TAB_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;
const TAB_IDLE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-canvas px-3.5 py-2 text-xs font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised hover:text-fg ${FOCUS_RING} [word-break:keep-all]`;

const TABS: readonly { readonly id: WebcodecsOpfsTabId; readonly labelKo: string }[] = [
  { id: "reels", labelKo: "WebCodecs 4K/60fps 릴스" },
  { id: "sparse-tiles", labelKo: "희소 타일 · 2D 칼만 예측" },
  { id: "opfs-vcs", labelKo: "OPFS 브랜치 · 스냅샷 복원" },
];

function TabIcon({ id }: { readonly id: WebcodecsOpfsTabId }): ReactElement {
  if (id === "reels") return <Film className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  if (id === "sparse-tiles") return <Grid2x2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  return <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
}

/** WebCodecs 4K 무빙툰 · 희소 타일 벡터 래스터화 · OPFS 스냅샷 VCS 통합 대시보드 패널. */
export function StudioWebcodecsOpfsPanel({
  initialTab = "reels",
  className,
}: StudioWebcodecsOpfsPanelProps = {}): ReactElement {
  const uid = useId();
  const [activeTab, setActiveTab] = useState<WebcodecsOpfsTabId>(initialTab);
  const [noticeText, setNoticeText] = useState<string>("");
  const [backendKind, setBackendKind] = useState<VfsBackendKind>("memory-vfs");

  const handleNotify = useCallback((message: string) => {
    setNoticeText(message);
  }, []);

  const handleBackendReady = useCallback((kind: VfsBackendKind) => {
    setBackendKind(kind);
  }, []);

  const handleTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = TABS[(currentIndex + delta + TABS.length) % TABS.length];
    if (nextTab) setActiveTab(nextTab.id);
  }, []);

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] md:p-5 ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-[11px] font-semibold text-accent">
            <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>로컬 퍼스트 4K 무빙툰 · 희소 타일 · OPFS 버전 관리</span>
          </div>
          <h2 id={`${uid}-title`} className="text-base font-bold tracking-tight text-fg md:text-lg">
            WebCodecs 릴스 인코더 · 무한 캔버스 희소 타일 · OPFS 스냅샷 VCS
          </h2>
          <p className="max-w-2xl text-xs leading-relaxed text-fg-2">
            브라우저 하드웨어 VideoEncoder로 서버 비용 0원 4K/60fps 무빙툰을 생성하고, 256×256 희소
            타일 벡터·2D 칼만 지연 예측·콘텐츠 주소 중복제거 Git 스냅샷을 한곳에서 점검합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-good/40 bg-good/15 px-2.5 py-1 font-semibold text-good">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>서버 인코딩 비용 0원</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1 font-semibold text-fg-2">
            <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{backendKind === "opfs" ? "OPFS 영구 저장소 활성" : "메모리 VFS 안전 폴백"}</span>
          </span>
        </div>
      </header>

      <div role="tablist" aria-label="WebCodecs 및 OPFS 엔진 기능 탭" className="flex flex-wrap gap-2">
        {TABS.map((tab, idx) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, idx)}
              className={selected ? TAB_ACTIVE : TAB_IDLE}
            >
              <TabIcon id={tab.id} />
              <span>{tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      {noticeText ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-medium text-fg"
        >
          {noticeText}
        </p>
      ) : null}

      <div
        id={`${uid}-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${activeTab}`}
        className="min-w-0"
      >
        {activeTab === "reels" ? <WebcodecsReelsTab onNotify={handleNotify} /> : null}
        {activeTab === "sparse-tiles" ? <SparseTileKalmanTab /> : null}
        {activeTab === "opfs-vcs" ? (
          <OpfsSnapshotVcsTab onNotify={handleNotify} onBackendReady={handleBackendReady} />
        ) : null}
      </div>
    </section>
  );
}
