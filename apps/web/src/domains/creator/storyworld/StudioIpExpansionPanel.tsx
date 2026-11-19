import {
  CheckCircle2,
  Coins,
  FlaskConical,
  Globe2,
  Layers,
  Plus,
  ShieldAlert,
  Sparkles,
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

export interface StudioIpExpansionPanelProps {
  readonly initialProfile?: IpWorkProfile;
  readonly onExportPitchBible?: (markdown: string) => void;
}

type ExpansionPanelView = "tracks" | "pilot" | "funding-royalty" | "spinoff-bible";

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

  // 파일럿 3컷 시장성 사전검증 상태
  const [openingHookScore, setOpeningHookScore] = useState(84);
  const [characterConsistencyScore, setCharacterConsistencyScore] = useState(88);
  const [sampleReaderCompletionRate, setSampleReaderCompletionRate] = useState(79);
  const [pilotCutCount, setPilotCutCount] = useState(6);
  const [mobileLegibilityPass, setMobileLegibilityPass] = useState(true);

  // 시즌 팬덤 펀딩 & 레이어 자동 로열티 원장 상태
  const [targetSupporters, setTargetSupporters] = useState(320);
  const [avgMonthlyPledgeKrw, setAvgMonthlyPledgeKrw] = useState(9_900);
  const [seasonEpisodes, setSeasonEpisodes] = useState(24);
  const [episodeProductionCostKrw, setEpisodeProductionCostKrw] = useState(450_000);
  const [royaltyEntries, setRoyaltyEntries] = useState<readonly LayerRoyaltyUsageEntry[]>(
    DEFAULT_ROYALTY_ENTRIES,
  );

  // 스핀오프 & 파생 기획 상태
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
    setExportNotice("IP 피치 바이블 마크다운(11트랙·사전검증·펀딩·로열티 포함)을 생성했습니다.");
  };

  return (
    <section
      className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 text-fg break-keep"
      aria-label="IP 확장 스튜디오 패널"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <h3 className="text-base font-bold tracking-tight text-fg">
              IP 확장 스튜디오 · OSM 파이프라인
            </h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            단일 원고에서 영상·게임·로컬·교육·자서전까지 11개 확장 트랙을 진단하고 시장성 사전검증·시즌 펀딩·자동 로열티를 설계합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-on-accent transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          IP 피치 바이블 내보내기
        </button>
      </header>

      {/* KPI 요약 스트립 (중첩 카드 없이 표면 단계와 헤어라인으로만 구분) */}
      <div className="grid gap-3 border-b border-line pb-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-0.5 rounded-xl bg-card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-3">즉시 추진 가능 트랙</span>
          <strong className="text-lg font-bold tabular-nums text-accent">
            {readyCount}/{readiness.length}개
          </strong>
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl bg-card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-3">파일럿 시장성 점수</span>
          <strong className="text-lg font-bold tabular-nums text-fg">
            {pilotReport.overallScore}점
          </strong>
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl bg-card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-3">시즌 펀딩 순정산</span>
          <strong className="text-lg font-bold tabular-nums text-good">
            {(fundingReport.netCreatorFundingKrw / 10_000).toLocaleString("ko-KR")}만원
          </strong>
        </div>
        <div className="flex flex-col gap-0.5 rounded-xl bg-card px-3.5 py-2.5">
          <span className="text-[11px] font-medium text-fg-3">레이어 자동 로열티</span>
          <strong className="text-lg font-bold tabular-nums text-fg">
            {(royaltyReport.eligiblePayoutKrw / 10_000).toLocaleString("ko-KR")}만원
          </strong>
        </div>
      </div>

      {/* 작품 상태 토글 + 뷰 탭 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-fg-2">
          <span className="font-semibold text-fg">{profile.workTitle}</span>
          <span className="tabular-nums text-fg-3">{profile.publishedEpisodes}화</span>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={profile.hasCleanRightsBom}
              onChange={(e) =>
                setProfile((prev) => ({ ...prev, hasCleanRightsBom: e.target.checked }))
              }
            />
            <span>권리 BOM 클리어</span>
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5">
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

        <div role="tablist" aria-label="IP 확장 스튜디오 보기" className="flex flex-wrap gap-1.5">
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
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected
                    ? "bg-accent-soft text-accent"
                    : "bg-card text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                <span>{tab.labelKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* View 1: 11트랙 OSM 진단 & 수익 시뮬레이션 */}
      {activeView === "tracks" && (
        <div className="flex flex-col gap-4" role="tabpanel" aria-label="11트랙 OSM 진단">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {readiness.map((item) => {
              const isSelected = item.trackId === activeTrack.trackId;
              return (
                <button
                  key={item.trackId}
                  type="button"
                  onClick={() => setSelectedTrack(item.trackId)}
                  className={`flex min-h-11 flex-col gap-1 rounded-xl p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isSelected
                      ? "bg-accent-soft ring-1 ring-accent"
                      : "bg-card hover:bg-raised"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                    <span className="truncate text-fg">{item.labelKo}</span>
                    <span className="shrink-0 tabular-nums text-accent">
                      {item.readinessScore}점
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-fg-2">
                    {item.status === "ready" ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-good" aria-hidden="true" />
                    ) : (
                      <ShieldAlert className="size-3.5 shrink-0 text-warn" aria-hidden="true" />
                    )}
                    <span className="tabular-nums">
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
                <TrendingUp className="size-3.5 text-accent" aria-hidden="true" />
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
                />
              </label>
              <p className="font-semibold tabular-nums text-accent">
                작가 예상 총정산:{" "}
                {(simulation.totalCreatorPayoutKrw / 10_000).toLocaleString("ko-KR")}만원
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {activeTrack.deliverablesKo.map((deliverable) => (
                  <span
                    key={deliverable}
                    className="rounded-lg bg-card px-2.5 py-1 text-[11px] text-fg-2"
                  >
                    {deliverable}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              <h4 className="font-semibold text-fg">스핀오프 · 파생 기획 ({spinoffs.length}건)</h4>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newSpinoffTitle}
                  onChange={(e) => setNewSpinoffTitle(e.target.value)}
                  placeholder="신규 스핀오프/외전 제목"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-1.5 text-xs text-fg"
                />
                <button
                  type="button"
                  onClick={handleAddSpinoff}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-raised px-3 py-1.5 font-semibold text-fg hover:bg-accent-soft hover:text-accent"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  추가
                </button>
              </div>
              <ul className="space-y-1.5 text-fg-2">
                {spinoffs.map((node) => (
                  <li key={node.id} className="truncate">
                    · <strong className="text-fg">{node.title}</strong> ({node.canonLink})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* View 2: 파일럿 3컷 시장성 사전검증 */}
      {activeView === "pilot" && (
        <div
          className="grid gap-5 border-t border-line pt-4 md:grid-cols-2"
          role="tabpanel"
          aria-label="파일럿 사전검증"
        >
          <div className="flex flex-col gap-3 text-xs">
            <h4 className="font-semibold text-fg">원천 IP 파일럿 콘티 사전검증 입력</h4>
            <label className="flex flex-col gap-1 text-fg-2">
              <span className="tabular-nums">초반 3컷 오프닝 훅 점수 ({openingHookScore}점)</span>
              <input
                type="range"
                min={20}
                max={100}
                value={openingHookScore}
                onChange={(e) => setOpeningHookScore(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-fg-2">
              <span className="tabular-nums">
                멀티컷 캐릭터·공간 일관성 ({characterConsistencyScore}점)
              </span>
              <input
                type="range"
                min={20}
                max={100}
                value={characterConsistencyScore}
                onChange={(e) => setCharacterConsistencyScore(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-fg-2">
              <span className="tabular-nums">
                샘플 독자 완독률 ({sampleReaderCompletionRate}%)
              </span>
              <input
                type="range"
                min={10}
                max={100}
                value={sampleReaderCompletionRate}
                onChange={(e) => setSampleReaderCompletionRate(Number(e.target.value))}
              />
            </label>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-fg-2">
                <span>파일럿 컷 수</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={pilotCutCount}
                  onChange={(e) => setPilotCutCount(Math.max(1, Number(e.target.value) || 1))}
                  className="min-h-11 w-20 rounded-xl border border-line bg-card px-2.5 text-xs tabular-nums text-fg"
                />
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-fg-2">
                <input
                  type="checkbox"
                  checked={mobileLegibilityPass}
                  onChange={(e) => setMobileLegibilityPass(e.target.checked)}
                />
                <span>375px 모바일 가독성 통과</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-card p-4 text-xs">
            <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2.5">
              <span className="font-semibold text-fg">사전검증 판정</span>
              <span
                className={`font-bold tabular-nums ${
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
            <p className="text-fg-2 tabular-nums">
              예상 1화 완독 유지율: <strong className="text-fg">{pilotReport.estimatedRetentionPercent}%</strong>
            </p>
            <ul className="space-y-1.5 text-fg-2">
              {pilotReport.actionItemsKo.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* View 3: 시즌 팬덤 펀딩 & 수정 가능 레이어 자동 로열티 원장 */}
      {activeView === "funding-royalty" && (
        <div
          className="grid gap-5 border-t border-line pt-4 md:grid-cols-2"
          role="tabpanel"
          aria-label="시즌 펀딩 및 자동 로열티"
        >
          <div className="flex flex-col gap-3 text-xs">
            <h4 className="font-semibold text-fg">시즌제 팬덤 펀딩 · 완결 동행 시뮬레이터</h4>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex flex-col gap-1 text-fg-2">
                <span>목표 후원 독자(명)</span>
                <input
                  type="number"
                  min={10}
                  max={50_000}
                  value={targetSupporters}
                  onChange={(e) => setTargetSupporters(Math.max(0, Number(e.target.value) || 0))}
                  className="min-h-11 rounded-xl border border-line bg-card px-3 tabular-nums text-fg"
                />
              </label>
              <label className="flex flex-col gap-1 text-fg-2">
                <span>월 평균 후원금(원)</span>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={avgMonthlyPledgeKrw}
                  onChange={(e) => setAvgMonthlyPledgeKrw(Math.max(0, Number(e.target.value) || 0))}
                  className="min-h-11 rounded-xl border border-line bg-card px-3 tabular-nums text-fg"
                />
              </label>
              <label className="flex flex-col gap-1 text-fg-2">
                <span>시즌 총 회차</span>
                <input
                  type="number"
                  min={4}
                  max={100}
                  value={seasonEpisodes}
                  onChange={(e) => setSeasonEpisodes(Math.max(1, Number(e.target.value) || 1))}
                  className="min-h-11 rounded-xl border border-line bg-card px-3 tabular-nums text-fg"
                />
              </label>
              <label className="flex flex-col gap-1 text-fg-2">
                <span>회차당 제작비(원)</span>
                <input
                  type="number"
                  min={0}
                  step={50_000}
                  value={episodeProductionCostKrw}
                  onChange={(e) =>
                    setEpisodeProductionCostKrw(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="min-h-11 rounded-xl border border-line bg-card px-3 tabular-nums text-fg"
                />
              </label>
            </div>
            <div className="rounded-xl bg-card p-3.5">
              <p className="font-semibold tabular-nums text-good">
                창작자 순정산: {(fundingReport.netCreatorFundingKrw / 10_000).toLocaleString("ko-KR")}만원 · 제작 확보 {fundingReport.fundedEpisodeRunway}화
              </p>
              <ul className="mt-2 space-y-1 text-fg-2">
                {fundingReport.milestonesKo.map((milestone) => (
                  <li key={milestone}>· {milestone}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold text-fg">수정 가능 레이어 · 자동 로열티 정산 원장</h4>
              <span className="tabular-nums text-fg-2">
                누적 {royaltyReport.totalUsageCount}회 사용 · 보류 {royaltyReport.blockedCount}건
              </span>
            </div>
            <ul className="divide-y divide-line/60 rounded-xl bg-card px-3.5">
              {royaltyReport.entries.map((entry) => (
                <li key={entry.assetId} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-fg">{entry.assetName}</p>
                    <p className="text-[11px] tabular-nums text-fg-3">
                      {entry.creatorName} · {entry.usageCount}회 ×{" "}
                      {(entry.unitRoyaltyKrw / 10_000).toLocaleString("ko-KR")}만원
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleRoyaltyBom(entry.assetId)}
                      className={`min-h-11 rounded-lg px-2.5 text-[11px] font-semibold ${
                        entry.rightsBomCleared
                          ? "bg-accent-soft text-accent"
                          : "bg-raised text-warn"
                      }`}
                    >
                      {entry.rightsBomCleared ? "BOM 승인" : "권리 보류"}
                    </button>
                    <span className="w-16 text-right font-semibold tabular-nums text-fg">
                      {(entry.subtotalKrw / 10_000).toLocaleString("ko-KR")}만원
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* View 4: 스핀오프 캐논 & B2B 피치 바이블 프리뷰 */}
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
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-xs text-fg"
            />
            <button
              type="button"
              onClick={handleAddSpinoff}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-raised px-4 font-semibold text-fg hover:bg-accent-soft hover:text-accent"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              추가
            </button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-xl bg-card p-4 font-mono text-[11px] leading-5 text-fg-2 whitespace-pre-wrap">
            {buildIpPitchBibleMarkdown(profile, readiness, spinoffs, {
              pilotReport,
              fundingReport,
              royaltyReport,
            })}
          </pre>
        </div>
      )}

      {exportNotice && (
        <p className="text-xs font-medium text-good" role="status">
          {exportNotice}
        </p>
      )}
    </section>
  );
}
