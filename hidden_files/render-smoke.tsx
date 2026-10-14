// Component render smoke — NOT shipped. Verifies the wired surfaces:
// 1) no episodeMetrics prop -> no metrics text at all (legacy rendering intact)
// 2) not-connected load   -> status line only, zero numbers/badges
// 3) live load            -> badges with real numbers + drop-off feedback hint
// 4) error load           -> surfaces still render their planning content
import { renderToString } from "react-dom/server";
import { StudioSeasonBeatBoard } from "./run/apps/web/src/domains/creator/planning/StudioSeasonBeatBoard";
import { StudioCharacterCoverageMap } from "./run/apps/web/src/domains/creator/planning/StudioCharacterCoverageMap";
import type { EpisodeMetricsLoad } from "./run/apps/web/src/domains/creator/planning/studio-episode-metrics-overlay";

const season: any = {
  id: "sp-1", projectId: "p-1", seasonId: "season-1", revision: 1, status: "draft",
  title: "시즌 1", goal: "목표", plotArc: [], characterArcRefs: [],
  episodeOrder: ["ep-1", "ep-2", "ep-3"], targetEpisodeCount: 3,
  releaseStartsAt: null, releaseCadenceDays: null, budgetCapMinor: null, currency: null,
  approvedByAssignmentIds: [], createdAt: "2026-10-14T00:00:00.000Z",
};
const plans: any[] = [1, 2, 3].map((n) => ({
  id: `plan-${n}`, projectId: "p-1", seasonId: "season-1", episodeId: `ep-${n}`,
  episodeNumber: n, revision: 1, status: "draft", title: `${n}화 제목`,
  logline: `${n}화 한 줄`, openingHook: "", coreConflict: "", turningPoints: [],
  cliffhanger: "", characterRefs: ["char-mina"], locationRefs: [], targetCutCount: 40,
  targetScrollHeightPx: 12000, dialogueDensity: "medium", difficulty: 2, riskIds: [],
  narrativeRevisionRef: null, approvedByAssignmentIds: [], createdAt: "2026-10-14T00:00:00.000Z",
  synopsis: `${n}화 줄거리`, goal: "", emotionalArc: null,
}));
const characters: any[] = [
  { id: "char-mina", name: "미나", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
];
const episodes = plans.map((p) => ({ episodeId: p.episodeId, episodeNumber: p.episodeNumber, title: p.title }));
const appearances: any[] = [
  { episodeId: "ep-1", characterId: "char-mina", costumeId: null, appearanceId: null, expression: null, cutCount: 12 },
];

const liveResponse: any = {
  seriesId: "s-1", period: "30d", generatedAt: "2026-10-15T00:00:00.000Z", mock: false,
  kpis: [], trafficSources: [], dropOffEpisodes: [3], series: [],
  retention: [
    { episode: 1, title: "1화", views: 10000, retentionPct: 100, dropOffPct: 0, isDropOff: false },
    { episode: 2, title: "2화", views: 9000, retentionPct: 90, dropOffPct: 10, isDropOff: false },
    { episode: 3, title: "3화", views: 6300, retentionPct: 63, dropOffPct: 30, isDropOff: true },
  ],
  episodes: [
    { episode: 1, title: "1화", publishedAt: "2026-09-01", views: 10000 },
    { episode: 2, title: "2화", publishedAt: "2026-09-08", views: 9000 },
    { episode: 3, title: "3화", publishedAt: "2026-09-15", views: 6300 },
  ],
};
const LIVE: EpisodeMetricsLoad = { status: "live", response: liveResponse };
const NOT_CONNECTED: EpisodeMetricsLoad = { status: "not-connected", response: null };
const ERROR_LOAD: EpisodeMetricsLoad = { status: "error", response: null };
const MOCK_AS_LIVE: EpisodeMetricsLoad = { status: "live", response: { ...liveResponse, mock: true } };

let failed = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "ok" : "FAIL"} - ${label}`);
  if (!ok) failed += 1;
}
const hasBadge = (html: string) => html.includes("data-episode-metrics");
const hasViews = (html: string) => html.includes("10,000") || html.includes("6,300");

// --- Beat board ---
const beatPlain = renderToString(<StudioSeasonBeatBoard season={season} plans={plans} characters={characters} />);
check("beat/no-prop renders board", beatPlain.includes("시즌 비트 보드"));
check("beat/no-prop has no metrics badge", !hasBadge(beatPlain) && !beatPlain.includes("회차 성과"));

const beatNc = renderToString(<StudioSeasonBeatBoard season={season} plans={plans} characters={characters} episodeMetrics={NOT_CONNECTED} />);
check("beat/not-connected shows status line", beatNc.includes("아직 연결되지 않았어요"));
check("beat/not-connected shows no numbers", !hasBadge(beatNc) && !hasViews(beatNc));

const beatMock = renderToString(<StudioSeasonBeatBoard season={season} plans={plans} characters={characters} episodeMetrics={MOCK_AS_LIVE} />);
check("beat/mock-as-live shows no numbers", !hasBadge(beatMock) && !hasViews(beatMock));
check("beat/mock-as-live falls back to not-connected line", beatMock.includes("아직 연결되지 않았어요"));

const beatLive = renderToString(<StudioSeasonBeatBoard season={season} plans={plans} characters={characters} episodeMetrics={LIVE} />);
check("beat/live shows badge numbers", hasBadge(beatLive) && beatLive.includes("조회 10,000"));
check("beat/live flags drop-off episode", beatLive.includes("이탈 지점"));
check("beat/live shows feedback hint for ep3", beatLive.includes("성과 피드백") && beatLive.includes("3화에서 독자가 많이 이탈했어요"));
check("beat/live keeps board content", beatLive.includes("미나"));

const beatErr = renderToString(<StudioSeasonBeatBoard season={season} plans={plans} characters={characters} episodeMetrics={ERROR_LOAD} />);
check("beat/error still renders board + fallback line", beatErr.includes("시즌 비트 보드") && beatErr.includes("불러오지 못했어요") && !hasBadge(beatErr));

// --- Coverage map ---
const covPlain = renderToString(<StudioCharacterCoverageMap characters={characters} episodes={episodes} appearances={appearances} />);
check("coverage/no-prop renders map", covPlain.includes("누가 언제 나왔나요"));
check("coverage/no-prop has no metrics badge", !hasBadge(covPlain) && !covPlain.includes("회차 성과"));

const covNc = renderToString(<StudioCharacterCoverageMap characters={characters} episodes={episodes} appearances={appearances} episodeMetrics={NOT_CONNECTED} />);
check("coverage/not-connected status only, no numbers", covNc.includes("아직 연결되지 않았어요") && !hasBadge(covNc) && !hasViews(covNc));

const covLive = renderToString(<StudioCharacterCoverageMap characters={characters} episodes={episodes} appearances={appearances} episodeMetrics={LIVE} />);
check("coverage/live shows column badge", hasBadge(covLive) && covLive.includes("조회 6,300"));
check("coverage/live keeps heatmap cells", covLive.includes("12"));

const covErr = renderToString(<StudioCharacterCoverageMap characters={characters} episodes={episodes} appearances={appearances} episodeMetrics={ERROR_LOAD} />);
check("coverage/error still renders map", covErr.includes("누가 언제 나왔나요") && !hasBadge(covErr));

console.log(failed === 0 ? "\nRENDER SMOKE: ALL PASSED" : `\nRENDER SMOKE: ${failed} FAILED`);
if (failed > 0) process.exit(1);
