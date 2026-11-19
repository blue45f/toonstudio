import {
  CheckCircle2,
  Coins,
  FileOutput,
  FlaskConical,
  Globe2,
  Layers,
  Package,
  Plus,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  buildIpPitchBibleMarkdown,
  calculateLayerRoyaltyLedger,
  evaluateIpExpansionReadiness,
  evaluatePilotMarketValidation,
  simulateIpTrackRevenue,
  simulateSeasonFandomFunding,
  type IpExpansionTrackId,
  type IpSpinoffNode,
  type IpWorkProfile,
  type LayerRoyaltyUsageEntry,
} from "./studio-ip-expansion";
import { StudioMultiFormatIpKitPanel } from "./StudioMultiFormatIpKitPanel";

export interface StudioIpExpansionPanelProps {
  readonly initialProfile?: IpWorkProfile;
  readonly onExportPitchBible?: (markdown: string) => void;
}

type ExpansionPanelView =
  | "tracks"
  | "pilot"
  | "funding-royalty"
  | "multiformat-qr"
  | "spinoff-bible";

const DEFAULT_PROFILE: IpWorkProfile = {
  workTitle: "서울 게이트 브레이커",
  genre: "현대판타지 · 액션",
  publishedEpisodes: 48,
  cumulativeViews: 2_400_000,
  hasCharacterSheets: true,
  hasStoryBible: true,
  hasCleanRightsBom: true,
  has3dWorldAssets: true,
  hasVoiceCastPlan: false,
};

const DEFAULT_ROYALTY_ENTRIES: readonly LayerRoyaltyUsageEntry[] = [
  {
    assetId: "layer-timeline-ep01",
    assetName: "1화 액션 스토리보드 레이어 타임라인",
    creatorName: "원작자",
    rightsBomCleared: true,
    usageCount: 14,
    unitRoyaltyKrw: 120_000,
  },
  {
    assetId: "kitbash-rooftop-01",
    assetName: "서울 옥상 조립형 3D 모듈 세트",
    creatorName: "배경 아티스트",
    rightsBomCleared: true,
    usageCount: 28,
    unitRoyaltyKrw: 45_000,
  },
  {
    assetId: "bgm-draft-nc",
    assetName: "임시 효과음 팩 (권리 확인 대기)",
    creatorName: "외부 사운드",
    rightsBomCleared: false,
    usageCount: 6,
    unitRoyaltyKrw: 30_000,
  },
];

const VIEW_TABS: readonly {
  readonly id: ExpansionPanelView;
  readonly labelKo: string;
  readonly icon: typeof Globe2;
}[] = [
  { id: "tracks", labelKo: "11트랙 OSM 진단", icon: Globe2 },
  { id: "pilot", labelKo: "파일럿 사전검증", icon: FlaskConical },
  { id: "funding-royalty", labelKo: "시즌 펀딩 · 로열티", icon: Coins },
  { id: "multiformat-qr", labelKo: "멀티포맷 · QR 키트", icon: Package },
  { id: "spinoff-bible", labelKo: "스핀오프 · 피치 바이블", icon: Layers },
];

export function StudioIpExpansionPanel({
  initialProfile = DEFAULT_PROFILE,
  onExportPitchBible,
}: StudioIpExpansionPanelProps) {
  const [profile, setProfile] = useState<IpWorkProfile>(initialProfile);
  const [activeView, setActiveView] = useState<ExpansionPanelView>("tracks");
  const [selectedTrack, setSelectedTrack] = useState<IpExpansionTrackId>("animation");
  const [projectedGrossKrw, setProjectedGrossKrw] = useState(1_500_000_000);

  const [openingHookScore, setOpeningHookScore] = useState(84);
  const [characterConsistencyScore, setCharacterConsistencyScore] = useState(88);
  const [sampleReaderCompletionRate, setSampleReaderCompletionRate] = useState(79);
  const [pilotCutCount, setPilotCutCount] = useState(6);
  const [mobileLegibilityPass, setMobileLegibilityPass] = useState(true);

  const [targetSupporters, setTargetSupporters] = useState(320);
  const [avgMonthlyPledgeKrw, setAvgMonthlyPledgeKrw] = useState(9_900);
  const [seasonEpisodes, setSeasonEpisodes] = useState(24);
  const [episodeProductionCostKrw, setEpisodeProductionCostKrw] = useState(450_000);
  const [royaltyEntries, setRoyaltyEntries] = useState<readonly LayerRoyaltyUsageEntry[]>(
    DEFAULT_ROYALTY_ENTRIES,
  );

  const [spinoffs, setSpinoffs] = useState<readonly IpSpinoffNode[]>([
    {
      id: "spin-1",
      title: "게이트 브레이커: 제로 데이",
      trackId: "webnovel-spinoff",
      premiseKo: "본편 5년 전 첫 번째 균열을 막아낸 숨겨진 길드장의 프리퀄 외전",
      canonLink: "prequel",
    },
  ]);
  const [newSpinoffTitle, setNewSpinoffTitle] = useState("");
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const readiness = useMemo(() => evaluateIpExpansionReadiness(profile), [profile]);
  const readyCount = useMemo(
    () => readiness.filter((item) => item.status === "ready").length,
    [readiness],
  );
  const activeTrack = readiness.find((r) => r.trackId === selectedTrack) ?? readiness[0];
  const simulation = useMemo(
    () =>
      simulateIpTrackRevenue(
        activeTrack.trackId,
        projectedGrossKrw,
        activeTrack.estimatedMgKrw,
        activeTrack.creatorRsPercent,
      ),
    [activeTrack, projectedGrossKrw],
  );
  const pilotReport = useMemo(
    () =>
      evaluatePilotMarketValidation({
        openingHookScore,
        characterConsistencyScore,
        mobileLegibilityPass,
        pilotCutCount,
        sampleReaderCompletionRate,
        targetDemographicLabel: "20~40대 핵심 웹툰 독자",
      }),
    [
      openingHookScore,
      characterConsistencyScore,
      mobileLegibilityPass,
      pilotCutCount,
      sampleReaderCompletionRate,
    ],
  );
  const fundingReport = useMemo(
    () =>
      simulateSeasonFandomFunding({
        targetSupporters,
        avgMonthlyPledgeKrw,
        seasonEpisodes,
        platformFeePercent: 10,
        episodeProductionCostKrw,
      }),
    [targetSupporters, avgMonthlyPledgeKrw, seasonEpisodes, episodeProductionCostKrw],
  );
  const royaltyReport = useMemo(
    () => calculateLayerRoyaltyLedger(royaltyEntries),
    [royaltyEntries],
  );

  const handleAddSpinoff = () => {
    const clean = newSpinoffTitle.trim();
    if (!clean) return;
    setSpinoffs((prev) => [
      ...prev,
      {
        id: `spin-${prev.length + 1}`,
        title: clean,
        trackId: selectedTrack,
        premiseKo: `${activeTrack.labelKo} 연계 확장 기획안`,
        canonLink: "side-story",
      },
    ]);
    setNewSpinoffTitle("");
  };

  const handleToggleRoyaltyBom = (assetId: string) => {
    setRoyaltyEntries((prev) =>
      prev.map((item) =>
        item.assetId === assetId
          ? { ...item, rightsBomCleared: !item.rightsBomCleared }
          : item,
      ),
    );
  };

  const handleExport = () => {
    const md = buildIpPitchBibleMarkdown(profile, readiness, spinoffs, {
      pilotReport,
      fundingReport,
      royaltyReport,
    });
    onExportPitchBible?.(md);
    setExportNotice("IP 피치 바이블 마크다운을 생성했습니다.");
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg break-keep [overflow-wrap:break-word] sm:p-5"
      aria-label="IP 확장 스튜디오 패널"
    >
      <header className="flex flex-col gap-2.5 border-b border-line pb-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Globe2 className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-sm font-semibold leading-[1.35] tracking-[-0.015em] text-fg">
            IP 확장 스튜디오 (OSM 파이프라인)
          </h3>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 sm:min-h-9 sm:w-auto"
        >
          <FileOutput className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          IP 피치 바이블 내보내기
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2 border-b border-line pb-4 lg:grid-cols-4">
        <div className="flex flex-col gap-0.5 rounded-lg bg-card px-3 py-2.5 sm:px-3.5">
          <span className="text-[11px] leading-[1.4] text-fg-3 sm:text-xs">즉시 추진 가능 트랙</span>
          <strong className="text-base font-semibold tabular-nums text-accent">
            {readyCount}/{readiness.length}개
          </strong>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg bg-card px-3 py-2.5 sm:px-3.5">
          <span className="text-[11px] leading-[1.4] text-fg-3 sm:text-xs">파일럿 시장성 점수</span>
          <strong className="text-base font-semibold tabular-nums text-fg">
            {pilotReport.overallScore}점
          </strong>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg bg-card px-3 py-2.5 sm:px-3.5">
          <span className="text-[11px] leading-[1.4] text-fg-3 sm:text-xs">시즌 펀딩 순정산</span>
          <strong className="text-base font-semibold tabular-nums text-good">
            {(fundingReport.netCreatorFundingKrw / 10_000).toLocaleString("ko-KR")}만원
          </strong>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg bg-card px-3 py-2.5 sm:px-3.5">
          <span className="text-[11px] leading-[1.4] text-fg-3 sm:text-xs">레이어 자동 로열티</span>
          <strong className="text-base font-semibold tabular-nums text-fg">
            {(royaltyReport.eligiblePayoutKrw / 10_000).toLocaleString("ko-KR")}만원
          </strong>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-semibold text-fg">{profile.workTitle}</span>
          <span className="tabular-nums text-fg-3">{profile.publishedEpisodes}화</span>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-fg-2 sm:min-h-9">
            <input
              type="checkbox"
              checked={profile.hasCleanRightsBom}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, hasCleanRightsBom: e.target.checked }))
              }
            />
            <span>권리 BOM 클리어</span>
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-fg-2 sm:min-h-9">
            <input
              type="checkbox"
              checked={profile.hasVoiceCastPlan}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, hasVoiceCastPlan: e.target.checked }))
              }
            />
            <span>보이스 가이드</span>
          </label>
        </div>

        <div
          role="tablist"
          aria-label="IP 확장 스튜디오 보기"
          className="flex flex-nowrap gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
        >
          {VIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            const selected = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveView(tab.id)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium leading-[1.35] transition-colors duration-150 sm:min-h-9 ${
                  selected
                    ? "bg-accent-soft text-accent"
                    : "bg-card text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <span>{tab.labelKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeView === "tracks" && (
        <div className="flex flex-col gap-4" role="tabpanel" aria-label="11트랙 OSM 진단">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {readiness.map((item) => {
              const isSelected = item.trackId === activeTrack.trackId;
              return (
                <button
                  key={item.trackId}
                  type="button"
                  onClick={() => setSelectedTrack(item.trackId)}
                  className={`flex min-h-11 flex-col gap-1.5 rounded-lg p-3 text-left transition-colors duration-150 ${
                    isSelected
                      ? "bg-accent-soft/60 ring-1 ring-accent"
                      : "bg-card hover:bg-raised"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-medium leading-[1.4] text-fg">
                    <span>{item.labelKo}</span>
                    <span className="shrink-0 tabular-nums">{item.readinessScore}점</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs tabular-nums text-fg-3">
                    {item.status === "ready" ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-good" strokeWidth={1.5} aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="size-3.5 shrink-0 text-warn" strokeWidth={1.5} aria-hidden="true" />
                    )}
                    <span>
                      예상 MG {(item.estimatedMgKrw / 10_000).toLocaleString("ko-KR")}만원 · RS{" "}
                      {item.creatorRsPercent}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
            <div className="flex flex-col gap-2 text-xs">
              <h4 className="flex items-center gap-1.5 font-semibold text-fg">
                <TrendingUp className="size-3.5 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
                {activeTrack.labelKo} 수익 시뮬레이션
              </h4>
              <label className="flex flex-col gap-1.5 text-fg-2">
                <span className="tabular-nums">
                  예상 총매출 ({(projectedGrossKrw / 100_000_000).toFixed(1)}억원)
                </span>
                <input
                  type="range"
                  min={100_000_000}
                  max={5_000_000_000}
                  step={100_000_000}
                  value={projectedGrossKrw}
                  onChange={(e) => setProjectedGrossKrw(Number(e.target.value))}
                  className="h-6 w-full accent-[var(--accent)]"
                />
              </label>
              <p className="font-semibold tabular-nums text-accent">
                작가 예상 총정산:{" "}
                {(simulation.totalCreatorPayoutKrw / 10_000).toLocaleString("ko-KR")}만원
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeTrack.deliverablesKo.map((deliverable) => (
                  <span key={deliverable} className="rounded-md bg-card px-2 py-1 text-[11px] text-fg-2">
                    {deliverable}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              <h4 className="font-semibold tabular-nums text-fg">스핀오프 · 파생 기획 ({spinoffs.length}건)</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSpinoffTitle}
                  onChange={(e) => setNewSpinoffTitle(e.target.value)}
                  placeholder="신규 스핀오프/외전 제목"
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 text-xs text-fg sm:min-h-9 sm:px-2.5"
                />
                <button
                  type="button"
                  onClick={handleAddSpinoff}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-raised px-3 text-xs font-medium text-fg-2 transition-colors duration-150 hover:bg-accent-soft hover:text-accent sm:min-h-9"
                >
                  <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  추가
                </button>
              </div>
              <ul className="space-y-1.5 leading-[1.6] text-fg-2">
                {spinoffs.map((node) => (
                  <li key={node.id}>
                    · <span className="font-medium text-fg">{node.title}</span> ({node.canonLink})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeView === "pilot" && (
        <div
          className="grid gap-4 border-t border-line pt-4 md:grid-cols-2"
          role="tabpanel"
          aria-label="파일럿 사전검증"
        >
          <div className="flex flex-col gap-3 text-xs">
            <h4 className="font-semibold text-fg">원천 IP 파일럿 콘티 사전검증 입력</h4>
            <label className="flex flex-col gap-1.5 text-fg-2">
              <span className="tabular-nums">초반 3컷 오프닝 훅 점수 ({openingHookScore}점)</span>
              <input
                type="range"
                min={20}
                max={100}
                value={openingHookScore}
                onChange={(e) => setOpeningHookScore(Number(e.target.value))}
                className="h-6 w-full"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-fg-2">
              <span className="tabular-nums">
                멀티컷 캐릭터·공간 일관성 ({characterConsistencyScore}점)
              </span>
              <input
                type="range"
                min={20}
                max={100}
                value={characterConsistencyScore}
                onChange={(e) => setCharacterConsistencyScore(Number(e.target.value))}
                className="h-6 w-full"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-fg-2">
              <span className="tabular-nums">
                샘플 독자 완독률 ({sampleReaderCompletionRate}%)
              </span>
              <input
                type="range"
                min={10}
                max={100}
                value={sampleReaderCompletionRate}
                onChange={(e) => setSampleReaderCompletionRate(Number(e.target.value))}
                className="h-6 w-full"
              />
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-fg-2">
                <span>파일럿 컷 수</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={60}
                  value={pilotCutCount}
                  onChange={(e) => setPilotCutCount(Math.max(1, Number(e.target.value) || 1))}
                  className="min-h-11 w-20 rounded-lg border border-line bg-card px-2.5 text-xs tabular-nums text-fg sm:min-h-9"
                />
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-fg-2 sm:min-h-9">
                <input
                  type="checkbox"
                  checked={mobileLegibilityPass}
                  onChange={(e) => setMobileLegibilityPass(e.target.checked)}
                />
                <span>375px 모바일 가독성 통과</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg bg-card p-4 text-xs">
            <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2">
              <span className="font-semibold text-fg">사전검증 판정</span>
              <span
                className={`font-semibold tabular-nums ${
                  pilotReport.verdict === "go"
                    ? "text-good"
                    : pilotReport.verdict === "iterate"
                      ? "text-warn"
                      : "text-bad"
                }`}
              >
                {pilotReport.overallScore}점 · {pilotReport.verdictLabelKo}
              </span>
            </div>
            <p className="tabular-nums leading-[1.6] text-fg-2">
              예상 1화 완독 유지율: <strong className="text-fg">{pilotReport.estimatedRetentionPercent}%</strong>
            </p>
            <ul className="space-y-1.5 leading-[1.6] text-fg-2">
              {pilotReport.actionItemsKo.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeView === "funding-royalty" && (
        <div
          className="grid gap-4 border-t border-line pt-4 md:grid-cols-2"
          role="tabpanel"
          aria-label="시즌 펀딩 및 자동 로열티"
        >
          <div className="flex flex-col gap-3 text-xs">
            <h4 className="font-semibold text-fg">시즌제 팬덤 펀딩 · 완결 동행 시뮬레이터</h4>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-fg-2">
                <span>목표 후원 독자(명)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={50_000}
                  value={targetSupporters}
                  onChange={(e) => setTargetSupporters(Math.max(0, Number(e.target.value) || 0))}
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 tabular-nums text-fg sm:min-h-9"
                />
              </label>
              <label className="flex flex-col gap-1 text-fg-2">
                <span>월 평균 후원금(원)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1000}
                  step={1000}
                  value={avgMonthlyPledgeKrw}
                  onChange={(e) => setAvgMonthlyPledgeKrw(Math.max(0, Number(e.target.value) || 0))}
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 tabular-nums text-fg sm:min-h-9"
                />
              </label>
              <label className="flex flex-col gap-1 text-fg-2">
                <span>시즌 총 회차</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={4}
                  max={100}
                  value={seasonEpisodes}
                  onChange={(e) => setSeasonEpisodes(Math.max(1, Number(e.target.value) || 1))}
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 tabular-nums text-fg sm:min-h-9"
                />
              </label>
              <label className="flex flex-col gap-1 text-fg-2">
                <span>회차당 제작비(원)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={50_000}
                  value={episodeProductionCostKrw}
                  onChange={(e) =>
                    setEpisodeProductionCostKrw(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 tabular-nums text-fg sm:min-h-9"
                />
              </label>
            </div>
            <div className="rounded-lg bg-card p-3">
              <p className="font-semibold tabular-nums leading-[1.5] text-good">
                창작자 순정산: {(fundingReport.netCreatorFundingKrw / 10_000).toLocaleString("ko-KR")}만원 · 제작 확보 {fundingReport.fundedEpisodeRunway}화
              </p>
              <ul className="mt-2 space-y-1 leading-[1.6] text-fg-2">
                {fundingReport.milestonesKo.map((milestone) => (
                  <li key={milestone}>· {milestone}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-fg">수정 가능 레이어 · 자동 로열티 정산 원장</h4>
              <span className="tabular-nums text-fg-2">
                누적 {royaltyReport.totalUsageCount}회 사용 · 보류 {royaltyReport.blockedCount}건
              </span>
            </div>
            <ul className="divide-y divide-line/60 rounded-lg bg-card px-3">
              {royaltyReport.entries.map((entry) => (
                <li
                  key={entry.assetId}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium leading-[1.4] text-fg">{entry.assetName}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-fg-3">
                      {entry.creatorName} · {entry.usageCount}회 ×{" "}
                      {(entry.unitRoyaltyKrw / 10_000).toLocaleString("ko-KR")}만원
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => handleToggleRoyaltyBom(entry.assetId)}
                      className={`min-h-11 rounded-md px-3 text-[11px] font-medium transition-colors duration-150 sm:min-h-8 sm:px-2 ${
                        entry.rightsBomCleared
                          ? "bg-accent-soft text-accent"
                          : "bg-raised text-warn"
                      }`}
                    >
                      {entry.rightsBomCleared ? "BOM 승인" : "권리 보류"}
                    </button>
                    <span className="min-w-16 text-right font-semibold tabular-nums text-fg">
                      {(entry.subtotalKrw / 10_000).toLocaleString("ko-KR")}만원
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeView === "multiformat-qr" && (
        <StudioMultiFormatIpKitPanel
          workTitle={profile.workTitle}
          rightsBomCleared={profile.hasCleanRightsBom}
        />
      )}

      {activeView === "spinoff-bible" && (
        <div
          className="flex flex-col gap-3 border-t border-line pt-4 text-xs"
          role="tabpanel"
          aria-label="스핀오프 및 피치 바이블"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={newSpinoffTitle}
              onChange={(e) => setNewSpinoffTitle(e.target.value)}
              placeholder="신규 스핀오프/외전 제목"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-3 text-xs text-fg sm:min-h-9 sm:px-2.5"
            />
            <button
              type="button"
              onClick={handleAddSpinoff}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-raised px-3 text-xs font-medium text-fg transition-colors duration-150 hover:bg-accent-soft hover:text-accent sm:min-h-9"
            >
              <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              추가
            </button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg bg-card p-4 font-mono text-[11px] leading-5 text-fg-2 whitespace-pre-wrap">
            {buildIpPitchBibleMarkdown(profile, readiness, spinoffs, {
              pilotReport,
              fundingReport,
              royaltyReport,
            })}
          </pre>
        </div>
      )}

      {exportNotice && (
        <p className="text-xs leading-[1.5] text-good" role="status">
          {exportNotice}
        </p>
      )}
    </section>
  );
}
