// 창작 게시판(사용자 제작 웹툰/컷툰) 서버 로직 — 도메인별 모듈은 ./creator/ 아래에 있다.
// 이 파일은 기존 공개 API를 그대로 유지하는 배럴(barrel)이다.
export {
  generateImageAsset,
  type GeneratedCreatorAsset,
  type ImageAssetQuality,
  type ImageAssetSize,
} from "../modules/creator/asset-generation";
export {
  ensureDefaultChallenges,
  type CreatorChallengeDetail,
  type CreatorChallengeSummary,
} from "../modules/creator/challenges";
export {
  challengeStateOf,
  nextEpisodeNumber,
  parseSeriesSort,
  parseSeriesStatus,
  SEED_CHALLENGES,
  seedChallengeWindow,
  validateFollowPair,
  validateSeriesInput,
  type CreatorChallengeState,
  type CreatorSeriesInput,
  type CreatorSeriesSort,
  type CreatorSeriesStatus,
  type SeedChallengeDef,
  type ValidatedSeriesInput,
} from "./creator/community-contract";
export { ensureCreatorCommunitySchema } from "../modules/creator/community-schema";
export {
  createCreatorWorkRelease,
  listCreatorExternalPublications,
  listCreatorWorkReleases,
  removeCreatorExternalPublication,
  reportCreatorWork,
  saveCreatorExternalPublication,
  toggleCreatorWorkBookmark,
  type CreatorExternalPublicationPlatform,
  type CreatorExternalPublicationStatus,
  type CreatorWorkReportReason,
} from "../modules/creator/community-publishing";
export {
  getCreatorPublicProfile,
  getFollowStats,
  searchCreatorDirectory,
  toggleFollow,
  type CreatorDirectoryEntry,
  type CreatorDirectoryQuery,
  type CreatorDirectoryResult,
  type CreatorFollowStats,
  type CreatorPublicProfile,
} from "./creator/follows";
export {
  addComment,
  createWork,
  deleteComment,
  getWork,
  listComments,
  toggleCommentLike,
  toggleLike,
  updateComment,
  updateWork,
} from "./creator/publication-api";
export { listSeries } from "../modules/creator/publication-list-series";
export {
  CreatorPublicationValidationError,
  bumpViews,
  deleteWork,
  getChallenge,
  getSeries,
  listChallenges,
  listWorks,
  promoteDueCreatorPublications,
} from "./creator/publication";
export {
  createSeries,
  deleteSeries,
  updateSeries,
  type CreatorSeriesDetail,
  type CreatorSeriesSummary,
} from "../modules/creator/series";
export {
  bumpAssetDownloads,
  deleteSharedAsset,
  getSharedAssetContent,
  listAssetModerationQueue,
  listSharedAssetCatalog,
  listSharedAssets,
  moderateSharedAsset,
  publishAsset,
  reportSharedAsset,
  type CreatorAssetCatalogPage,
  type CreatorAssetModerationQueueItem,
  type CreatorSharedAsset,
  type CreatorSharedAssetCatalogItem,
  type CreatorSharedAssetContent,
  type CreatorSharedAssetSummary,
} from "./creator/shared-assets";
export {
  getWorkRevision,
  getWorkRevisionComparison,
  listWorkRevisions,
  restoreWorkRevision,
} from "../modules/creator/work-revision-service";
export {
  parseCreatorSort,
  type CreatorAuthor,
  type CreatorEpisodeRef,
  type CreatorWorkComment,
  type CreatorWorkDetail,
  type CreatorWorkFormat,
  type CreatorWorkInput,
  type CreatorWorkMutationResult,
  type CreatorWorkRevisionComparisonDetail,
  type CreatorWorkRevisionDetail,
  type CreatorWorkRevisionSummary,
  type CreatorWorkSort,
  type CreatorWorkStatus,
  type CreatorWorkSummary,
} from "../modules/creator/works-contract";
