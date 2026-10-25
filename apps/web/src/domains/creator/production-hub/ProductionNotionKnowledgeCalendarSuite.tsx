import { useId, useMemo, useState } from "react";
import {
  computeContentCalendarBufferMetrics,
  computeLoreBibleRollups,
  getLoreCategoryLabelKo,
  getPlatformLabelKo,
  getPublishStatusLabelKo,
  instantiateStudioLoreTemplate,
  renewLoreVerification,
  toggleCalendarLoreRelation,
  type LoreCategoryKind,
  type NotionContentCalendarRecord,
  type NotionDatabaseViewMode,
  type NotionLoreRecord,
} from "./production-notion-knowledge-calendar-model";

const INITIAL_LORE_RECORDS: readonly NotionLoreRecord[] = [
  {
    loreId: "lore-char-kael",
    loreCategory: "character",
    title: "카엘 본 로엔 (북부 기사단장)",
    canonicalTag: "CHR-KAEL",
    summaryBlock: "제국 북부 변경백 가문의 후계자이자 제1기사단장. 왼손 검술과 냉기 마력을 구사한다.",
    outfitOrVisualSpec: "흑청색 제복 + 은색 늑대 문장 망토(우측 어깨 고정) + 좌안 아래 얇은 자상 흉터",
    continuityWarning: "주의: 2화 전투 이후 망토 우측 버클이 파손되어 4화부터 신형 은장 버클로 교체됨",
    verification: {
      verifiedBy: "총괄작화 김서연",
      verifiedUntilIso: "2026-11-20",
    },
  },
  {
    loreId: "lore-loc-citadel",
    loreCategory: "location_3d",
    title: "잿빛 성채 대연회장 & 지하 봉인실",
    canonicalTag: "LOC-CITADEL",
    summaryBlock: "고대 거인족 석조 양식 위에 세워진 북부 요새 중심부.",
    outfitOrVisualSpec: "Blender 3D 세트 AST-BG-CITADEL v4 기준 · 스테인드글라스 북쪽 창문 채광 고정",
    continuityWarning: null,
    verification: {
      verifiedBy: "배경3D팀 박도윤",
      verifiedUntilIso: "2026-10-20", // 기준일(2026-10-26) 대비 만료됨 -> 재검증 대상 시연
    },
  },
  {
    loreId: "lore-prop-sealstone",
    loreCategory: "artifact_prop",
    title: "심연의 청동 봉인석 (제1열쇠)",
    canonicalTag: "ART-SEALSTONE",
    summaryBlock: "마력 공명 시 청록색 룬 문자가 공중에 부유하는 고대 성물.",
    outfitOrVisualSpec: "정팔면체 비율 1:1.4 · 발광 레이어 블렌드 모드 Add(Glow) 강도 65%",
    continuityWarning: null,
    verification: {
      verifiedBy: "설정작가 오유진",
      verifiedUntilIso: "2026-10-30", // 7일 이내 만료 임박
    },
  },
];

const INITIAL_CALENDAR_RECORDS: readonly NotionContentCalendarRecord[] = [
  {
    recordId: "cal-ep01",
    episodeCode: "EP01",
    title: "1화 · 잿빛 성채의 서막",
    category: "regular_episode",
    platforms: ["naver_webtoon", "kakao_page"],
    publishStatus: "published",
    releaseDateIso: "2026-10-12",
    relatedLoreIds: ["lore-char-kael", "lore-loc-citadel"],
    manuscriptReadyPercent: 100,
  },
  {
    recordId: "cal-ep02",
    episodeCode: "EP02",
    title: "2화 · 심야의 추격전",
    category: "regular_episode",
    platforms: ["naver_webtoon", "kakao_page"],
    publishStatus: "published",
    releaseDateIso: "2026-10-19",
    relatedLoreIds: ["lore-char-kael", "lore-prop-sealstone"],
    manuscriptReadyPercent: 100,
  },
  {
    recordId: "cal-ep03",
    episodeCode: "EP03",
    title: "3화 · 지하 수로의 비밀",
    category: "regular_episode",
    platforms: ["naver_webtoon", "kakao_page", "line_webtoon_en"],
    publishStatus: "scheduled",
    releaseDateIso: "2026-10-26",
    relatedLoreIds: ["lore-char-kael", "lore-loc-citadel", "lore-prop-sealstone"],
    manuscriptReadyPercent: 100,
  },
  {
    recordId: "cal-ep04",
    episodeCode: "EP04",
    title: "4화 · 붉은 달의 서약식",
    category: "regular_episode",
    platforms: ["naver_webtoon", "kakao_page"],
    publishStatus: "ready_buffer",
    releaseDateIso: "2026-11-02",
    relatedLoreIds: ["lore-char-kael", "lore-loc-citadel"],
    manuscriptReadyPercent: 100,
  },
  {
    recordId: "cal-promo-01",
    episodeCode: "PROMO-SHORTS",
    title: "시즌1 하이라이트 무빙툰 PV 쇼츠",
    category: "sns_promo",
    platforms: ["youtube_shorts", "line_webtoon_en"],
    publishStatus: "drafting",
    releaseDateIso: "2026-10-31",
    relatedLoreIds: ["lore-char-kael"],
    manuscriptReadyPercent: 75,
  },
];

export function ProductionNotionKnowledgeCalendarSuite() {
  const [viewMode, setViewMode] = useState<NotionDatabaseViewMode>("calendar");
  const [loreRecords, setLoreRecords] =
    useState<readonly NotionLoreRecord[]>(INITIAL_LORE_RECORDS);
  const [calendarRecords, setCalendarRecords] =
    useState<readonly NotionContentCalendarRecord[]>(INITIAL_CALENDAR_RECORDS);
  const [selectedLoreCategory, setSelectedLoreCategory] = useState<LoreCategoryKind | "all">("all");
  const [templateKind, setTemplateKind] = useState<LoreCategoryKind>("character");
  const [activeCalendarIdForRelation, setActiveCalendarIdForRelation] = useState<string>("cal-ep04");
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const tableCaptionId = useId();

  const bufferMetrics = useMemo(
    () => computeContentCalendarBufferMetrics(calendarRecords, "2026-10-26"),
    [calendarRecords],
  );

  const loreRollups = useMemo(
    () => computeLoreBibleRollups(loreRecords, calendarRecords, "2026-10-26"),
    [loreRecords, calendarRecords],
  );

  const filteredLoreRollups = useMemo(
    () =>
      selectedLoreCategory === "all"
        ? loreRollups
        : loreRollups.filter((row) => row.lore.loreCategory === selectedLoreCategory),
    [loreRollups, selectedLoreCategory],
  );

  const handleToggleRelation = (recordId: string, loreId: string) => {
    setCalendarRecords((prev) => toggleCalendarLoreRelation(prev, recordId, loreId));
    setStatusBanner("회차 캘린더와 작품 설정집 간의 양방향 Relation 연결 및 Rollup 등장 회차 집계가 즉시 갱신되었습니다.");
  };

  const handleRenewVerification = (loreId: string) => {
    setLoreRecords((prev) =>
      renewLoreVerification(prev, loreId, "총괄PD 최현우", "2026-11-25"),
    );
    setStatusBanner("선택한 작품 설정집 문서의 위키 검증(Verification) 유효기한을 2026-11-25까지 갱신했습니다.");
  };

  const handleInstantiateTemplate = () => {
    const created = instantiateStudioLoreTemplate(templateKind, loreRecords.length + 1);
    setLoreRecords((prev) => [...prev, created]);
    setStatusBanner(`노션 표준 템플릿으로 '${created.title}' 설정집 레코드를 생성했습니다.`);
  };

  return (
    <section
      aria-label="노션 콘텐츠 캘린더 및 관계형 작품 설정집 아카이빙 스위트"
      data-testid="notion-knowledge-calendar-suite"
      className="rounded-2xl border border-line bg-card p-5 shadow-xs space-y-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-good/15 px-2 py-0.5 text-[11px] font-bold text-good">
              Notion RecordStore / Relation & Rollup 내재화
            </span>
            <span className="text-xs text-fg-3">
              멀티뷰 연재 캘린더 · 양방향 관계형 작품 설정집(Lore Bible) · 위키 검증 만료 관리
            </span>
          </div>
          <h3 className="mt-1 text-base font-bold text-fg">
            콘텐츠 연재·프로모션 멀티뷰 캘린더 & 관계형 작품 설정집(Lore Bible) 데이터베이스
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            data-testid="notion-buffer-health-badge"
            className={`rounded-lg border px-3 py-1.5 font-bold ${
              bufferMetrics.bufferHealthStatus === "healthy"
                ? "border-good/40 bg-good/10 text-good"
                : bufferMetrics.bufferHealthStatus === "warning"
                  ? "border-warn/40 bg-warn/10 text-warn"
                  : "border-bad/40 bg-bad/10 text-bad"
            }`}
          >
            {bufferMetrics.bufferSummaryLabel}
          </span>
          <span className="rounded-lg border border-line bg-raised px-2.5 py-1.5 text-fg-2">
            7일 내 공개 예정: {bufferMetrics.upcomingSevenDaysCount}건
          </span>
        </div>
      </header>

      {statusBanner ? (
        <div
          role="status"
          data-testid="notion-status-banner"
          className="rounded-xl border border-good/40 bg-good/10 px-3.5 py-2.5 text-xs font-medium text-fg"
        >
          {statusBanner}
        </div>
      ) : null}

      {/* 1. 콘텐츠 연재·프로모션 멀티뷰 데이터베이스 */}
      <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2">
              콘텐츠 연재 & 글로벌 프로모션 캘린더 (Multi-View Collection)
            </h4>
            <p className="text-xs text-fg-3">
              동일한 레코드 컬렉션을 캘린더·테이블·보드·타임라인 뷰로 즉석 프로젝션합니다.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-line bg-card p-0.5 text-xs">
            {(
              [
                { id: "calendar", label: "캘린더 뷰" },
                { id: "table", label: "테이블 뷰" },
                { id: "board", label: "상태 보드 뷰" },
                { id: "timeline", label: "타임라인 뷰" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`notion-view-tab-${tab.id}`}
                onClick={() => setViewMode(tab.id)}
                className={`rounded-md px-2.5 py-1 font-semibold transition ${
                  viewMode === tab.id
                    ? "bg-fg text-bg"
                    : "text-fg-2 hover:text-fg"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "table" ? (
          <div
            role="region"
            aria-labelledby={tableCaptionId}
            data-testid="notion-calendar-table-view"
            className="overflow-auto max-w-full rounded-xl border border-line bg-card"
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <caption id={tableCaptionId} className="sr-only">
                콘텐츠 연재 및 프로모션 캘린더 데이터베이스 테이블 뷰
              </caption>
              <thead className="sticky top-0 z-10 bg-raised text-fg-2">
                <tr>
                  <th scope="col" className="sticky left-0 z-20 border-b border-line bg-raised px-3 py-2 font-bold">
                    회차/코드
                  </th>
                  <th scope="col" className="border-b border-line px-3 py-2 font-bold">제목</th>
                  <th scope="col" className="border-b border-line px-3 py-2 font-bold">공개일</th>
                  <th scope="col" className="border-b border-line px-3 py-2 font-bold">연재 플랫폼</th>
                  <th scope="col" className="border-b border-line px-3 py-2 font-bold">상태</th>
                  <th scope="col" className="border-b border-line px-3 py-2 font-bold">
                    연결된 설정집(Relation)
                  </th>
                </tr>
              </thead>
              <tbody>
                {bufferMetrics.sortedRecords.map((rec) => (
                  <tr key={rec.recordId} className="hover:bg-panel">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-line bg-card px-3 py-2 font-mono font-bold text-fg"
                    >
                      {rec.episodeCode}
                    </th>
                    <td className="border-b border-line px-3 py-2 font-medium text-fg">
                      {rec.title}
                    </td>
                    <td className="border-b border-line px-3 py-2 font-mono text-fg-2">
                      {rec.releaseDateIso}
                    </td>
                    <td className="border-b border-line px-3 py-2 text-fg-2">
                      {rec.platforms.map((p) => getPlatformLabelKo(p)).join(", ")}
                    </td>
                    <td className="border-b border-line px-3 py-2">
                      <span className="rounded border border-line bg-raised px-2 py-0.5 text-[11px] font-semibold text-fg">
                        {getPublishStatusLabelKo(rec.publishStatus)} ({rec.manuscriptReadyPercent}%)
                      </span>
                    </td>
                    <td className="border-b border-line px-3 py-2 text-fg-2">
                      {rec.relatedLoreIds.length}개 설정 연결됨
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            data-testid={`notion-calendar-${viewMode}-view`}
            className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5"
          >
            {bufferMetrics.sortedRecords.map((rec) => {
              const linkedLoreTitles = loreRecords
                .filter((lore) => rec.relatedLoreIds.includes(lore.loreId))
                .map((lore) => lore.canonicalTag);

              return (
                <div
                  key={rec.recordId}
                  data-testid={`notion-calendar-card-${rec.recordId}`}
                  className="rounded-xl border border-line bg-card p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold text-good">
                      {rec.episodeCode}
                    </span>
                    <span className="font-mono text-[11px] text-fg-3">{rec.releaseDateIso}</span>
                  </div>
                  <p className="font-bold text-fg">{rec.title}</p>
                  <p className="text-[11px] text-fg-2">
                    {getPublishStatusLabelKo(rec.publishStatus)} · 완성도 {rec.manuscriptReadyPercent}%
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {rec.platforms.map((plat) => (
                      <span
                        key={plat}
                        className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-fg-2"
                      >
                        {getPlatformLabelKo(plat)}
                      </span>
                    ))}
                  </div>
                  <div className="border-t border-line pt-1.5 text-[10px] text-fg-3">
                    Relation: {linkedLoreTitles.length > 0 ? linkedLoreTitles.join(", ") : "없음"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. 관계형 작품 설정집(Lore Bible) 아카이브 & Rollup 자동 집계 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-fg-2">
              작품 설정집(Lore Bible) 아카이브 · Relation & Rollup 자동 집계
            </h4>
            <select
              aria-label="설정집 카테고리 필터"
              data-testid="notion-lore-category-filter"
              value={selectedLoreCategory}
              onChange={(e) => setSelectedLoreCategory(e.target.value as LoreCategoryKind | "all")}
              className="rounded-lg border border-line bg-card px-2.5 py-1 text-xs text-fg"
            >
              <option value="all">전체 설정 카테고리 ({loreRecords.length})</option>
              <option value="character">캐릭터(Character)</option>
              <option value="location_3d">배경·3D 장소(Location)</option>
              <option value="artifact_prop">소품·아티팩트(Prop)</option>
              <option value="timeline_event">세계관 사건 연표(Timeline)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-fg-2">
              <span>Relation 연결 대상 회차:</span>
              <select
                aria-label="Relation 연결 대상 회차 선택"
                data-testid="notion-active-episode-relation-select"
                value={activeCalendarIdForRelation}
                onChange={(e) => setActiveCalendarIdForRelation(e.target.value)}
                className="rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg"
              >
                {calendarRecords.map((cal) => (
                  <option key={cal.recordId} value={cal.recordId}>
                    {cal.episodeCode} ({cal.title})
                  </option>
                ))}
              </select>
            </label>

            <select
              aria-label="설정집 표준 템플릿 종류"
              data-testid="notion-template-kind-select"
              value={templateKind}
              onChange={(e) => setTemplateKind(e.target.value as LoreCategoryKind)}
              className="rounded-lg border border-line bg-card px-2 py-1 text-xs text-fg"
            >
              <option value="character">캐릭터 시트 템플릿</option>
              <option value="location_3d">3D 배경 세트 템플릿</option>
              <option value="artifact_prop">핵심 소품 시트 템플릿</option>
              <option value="timeline_event">세계관 연표 템플릿</option>
            </select>
            <button
              type="button"
              data-testid="notion-instantiate-template-btn"
              onClick={handleInstantiateTemplate}
              className="rounded-lg bg-good px-3 py-1.5 font-bold text-canvas hover:opacity-90"
            >
              +표준 템플릿으로 설정 추가
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {filteredLoreRollups.map((row) => {
            const { lore } = row;
            const activeEpisodeRecord = calendarRecords.find(
              (c) => c.recordId === activeCalendarIdForRelation,
            );
            const isLinkedToActiveEpisode =
              activeEpisodeRecord?.relatedLoreIds.includes(lore.loreId) ?? false;

            return (
              <article
                key={lore.loreId}
                data-testid={`notion-lore-card-${lore.loreId}`}
                className={`rounded-xl border p-4 text-xs space-y-2.5 ${
                  row.hasContinuityRisk
                    ? "border-warn/50 bg-warn/5"
                    : "border-line bg-card"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-good">
                        {lore.canonicalTag}
                      </span>
                      <span className="rounded bg-raised px-1.5 py-0.5 text-[10px] text-fg-2">
                        {getLoreCategoryLabelKo(lore.loreCategory)}
                      </span>
                    </div>
                    <h5 className="mt-1 text-sm font-bold text-fg">{lore.title}</h5>
                  </div>

                  {/* 노션 위키 검증(Verification) 상태 배지 */}
                  <span
                    data-testid={`notion-verification-badge-${lore.loreId}`}
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                      row.verificationState === "verified"
                        ? "border-good/40 bg-good/10 text-good"
                        : row.verificationState === "expiring_soon"
                          ? "border-warn/40 bg-warn/10 text-warn"
                          : "border-bad/40 bg-bad/10 text-bad"
                    }`}
                  >
                    {row.verificationState === "verified"
                      ? `검증됨 (D-${row.daysUntilVerificationExpiry})`
                      : row.verificationState === "expiring_soon"
                        ? `검증 만료 임박 (D-${row.daysUntilVerificationExpiry})`
                        : `검증 만료됨 (${Math.abs(row.daysUntilVerificationExpiry)}일 경과)`}
                  </span>
                </div>

                <p className="text-fg-2 leading-relaxed">{lore.summaryBlock}</p>

                <div className="rounded-lg border border-line bg-raised p-2.5 space-y-1">
                  <div className="font-semibold text-fg">작화·3D 불변 설정 규격</div>
                  <p className="text-[11px] text-fg-2">{lore.outfitOrVisualSpec}</p>
                </div>

                {lore.continuityWarning ? (
                  <div className="rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[11px] font-semibold text-warn">
                    {lore.continuityWarning}
                  </div>
                ) : null}

                {/* Rollup 자동 집계 결과 */}
                <div
                  data-testid={`notion-lore-rollup-${lore.loreId}`}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-fg-2"
                >
                  <span>
                    Rollup 등장: <strong>{row.appearanceCount}회</strong> (
                    {row.firstAppearanceEpisode
                      ? `${row.firstAppearanceEpisode} ~ ${row.latestAppearanceEpisode}`
                      : "미등장"}
                    )
                  </span>
                  <div className="flex items-center gap-1.5">
                    {row.verificationState !== "verified" ? (
                      <button
                        type="button"
                        data-testid={`notion-renew-verify-btn-${lore.loreId}`}
                        onClick={() => handleRenewVerification(lore.loreId)}
                        className="rounded border border-line bg-raised px-2 py-0.5 text-[10px] font-bold text-fg hover:bg-card"
                      >
                        검증 갱신(+30일)
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-testid={`notion-toggle-relation-btn-${lore.loreId}`}
                      onClick={() =>
                        handleToggleRelation(activeCalendarIdForRelation, lore.loreId)
                      }
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                        isLinkedToActiveEpisode
                          ? "bg-good text-canvas"
                          : "border border-line bg-raised text-fg-2 hover:text-fg"
                      }`}
                    >
                      {isLinkedToActiveEpisode
                        ? `${activeEpisodeRecord?.episodeCode} 등장 연결됨`
                        : `+${activeEpisodeRecord?.episodeCode} 등장 연결`}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
