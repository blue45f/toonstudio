import { lazyRetry } from "@/shared/lib/lazy-retry";

export const CatalogResearchPage = lazyRetry(
  () => import("@/domains/creator-resources/CatalogResearchPage").then((module) => ({ default: module.CatalogResearchPage })),
  "CatalogResearchPage",
);
// /research 는 앱 계층 래퍼를 거쳐 문장 허브의 "AI로 다듬기"(선택 기능)를 주입받는다.
export const CreatorHubPage = lazyRetry(
  () => import("./research-home-route").then((module) => ({ default: module.ResearchHomeRoute })),
  "CreatorHubPage",
);
export const NowPage = lazyRetry(
  () => import("@/domains/creator-resources/NowPage").then((module) => ({ default: module.NowPage })),
  "NowPage",
);
export const OpportunitiesPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpportunitiesPage })),
  "OpportunitiesPage",
);
export const ReferenceAssetsPage = lazyRetry(
  () => import("@/domains/creator-resources/ReferenceAssetsPage").then((module) => ({ default: module.ReferenceAssetsPage })),
  "ReferenceAssetsPage",
);
export const MaterialAtlasPage = lazyRetry(
  () => import("@/domains/creator-resources/MaterialAtlasPage").then((module) => ({ default: module.MaterialAtlasPage })),
  "MaterialAtlasPage",
);
export const WorksPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.WorksPage })),
  "WorksPage",
);
export const PolyHavenPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.PolyHavenPage })),
  "PolyHavenPage",
);
export const AmbientCgPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.AmbientCgPage })),
  "AmbientCgPage",
);
export const NasaImagesPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.NasaImagesPage })),
  "NasaImagesPage",
);
export const VamCollectionsPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.VamCollectionsPage })),
  "VamCollectionsPage",
);
export const RijksmuseumPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.RijksmuseumPage })),
  "RijksmuseumPage",
);
export const GoogleFontsPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.GoogleFontsPage })),
  "GoogleFontsPage",
);
export const GbifPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.GbifPage })),
  "GbifPage",
);
export const MusicBrainzPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.MusicBrainzPage })),
  "MusicBrainzPage",
);
export const InternetArchivePage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.InternetArchivePage })),
  "InternetArchivePage",
);
export const MetWeatherPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.MetWeatherPage })),
  "MetWeatherPage",
);
export const KoreanHeritagePage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.KoreanHeritagePage })),
  "KoreanHeritagePage",
);
export const NeisSchoolPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.NeisSchoolPage })),
  "NeisSchoolPage",
);
export const TourApiPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.TourApiPage })),
  "TourApiPage",
);
export const KoreanDictionaryPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.KoreanDictionaryPage })),
  "KoreanDictionaryPage",
);
export const SmithsonianPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.SmithsonianPage })),
  "SmithsonianPage",
);
export const WikimediaInterestPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.WikimediaInterestPage })),
  "WikimediaInterestPage",
);
export const EuropeanaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.EuropeanaPage })),
  "EuropeanaPage",
);
export const DplaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.DplaPage })),
  "DplaPage",
);
export const OpenDataLabPage = lazyRetry(
  () => import("@/domains/creator-resources/OpenDataLabPage").then((module) => ({ default: module.OpenDataLabPage })),
  "OpenDataLabPage",
);
export const OpenDataNasaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataNasaPage })),
  "OpenDataNasaPage",
);
export const OpenDataGbifPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataGbifPage })),
  "OpenDataGbifPage",
);
export const OpenDataVamPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataVamPage })),
  "OpenDataVamPage",
);
export const OpenDataMusicBrainzPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataMusicBrainzPage })),
  "OpenDataMusicBrainzPage",
);
export const OpenDataInternetArchivePage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataInternetArchivePage })),
  "OpenDataInternetArchivePage",
);
export const OpenDataSmithsonianPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataSmithsonianPage })),
  "OpenDataSmithsonianPage",
);
export const OpenDataEuropeanaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataEuropeanaPage })),
  "OpenDataEuropeanaPage",
);
export const OpenDataDplaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataDplaPage })),
  "OpenDataDplaPage",
);
export const OpenDataKheritagePage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataKheritagePage })),
  "OpenDataKheritagePage",
);
export const OpenDataTourApiPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataTourApiPage })),
  "OpenDataTourApiPage",
);
export const OpenDataKoreanPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataKoreanPage })),
  "OpenDataKoreanPage",
);
export const OpenDataWikimediaPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataWikimediaPage })),
  "OpenDataWikimediaPage",
);
export const OpenDataAmbientCgPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataAmbientCgPage })),
  "OpenDataAmbientCgPage",
);
export const OpenDataNeisPage = lazyRetry(
  () => import("@/domains/creator-resources/ResourceSearchPage").then((module) => ({ default: module.OpenDataNeisPage })),
  "OpenDataNeisPage",
);
export const GlobalBooksPage = lazyRetry(
  () => import("@/domains/creator-resources/GlobalBooksPage").then((module) => ({ default: module.GlobalBooksPage })),
  "GlobalBooksPage",
);
// 제작 레시피는 학습 셸로 감싼 요소를 한 청크로 지연 로딩한다(셸이 학습 콘텐츠를 끌어오므로
// 라우트 표가 셸을 정적으로 import하면 앱 진입 번들에 섞인다 — learn-recipes-route.tsx 참조).
export const LearnRecipesRoute = lazyRetry(
  () => import("./learn-recipes-route").then((module) => ({ default: module.LearnRecipesRoute })),
  "LearnRecipesRoute",
);
export const StoryLabPage = lazyRetry(
  () => import("@/domains/creator-resources/StoryLabPage").then((module) => ({ default: module.StoryLabPage })),
  "StoryLabPage",
);
export const OpenCreationPage = lazyRetry(
  () => import("@/domains/creator-resources/OpenCreationPage").then((module) => ({ default: module.OpenCreationPage })),
  "OpenCreationPage",
);
export const SourcesPage = lazyRetry(
  () => import("@/domains/creator-resources/SourcesPage").then((module) => ({ default: module.SourcesPage })),
  "SourcesPage",
);
export const ContentPacksPage = lazyRetry(
  () => import("@/domains/creator-resources/ContentPacksPage").then((module) => ({ default: module.ContentPacksPage })),
  "ContentPacksPage",
);
export const EducationHubPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/EducationHubPage").then((module) => ({ default: module.EducationHubPage })),
  "EducationHubPage",
);
export const CollaborationHubPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/CollaborationHubPage").then((module) => ({ default: module.CollaborationHubPage })),
  "CollaborationHubPage",
);
export const FandomCosplayPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/FandomCosplayPage").then((module) => ({ default: module.FandomCosplayPage })),
  "FandomCosplayPage",
);
export const ComicLibraryPage = lazyRetry(
  () => import("@/domains/creator-ecosystem/ComicLibraryPage").then((module) => ({ default: module.ComicLibraryPage })),
  "ComicLibraryPage",
);
