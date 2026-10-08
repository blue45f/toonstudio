import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";

import type { ResourceProvider } from "@/shared/lib/creator-resources";

/**
 * 리서치 소스 정체성 키트 (디자인 웨이브 3 · R5, 웨이브 5 · T5에서 전 제공처로 확장).
 *
 * 리서치 소스 페이지가 하나의 템플릿(ResourceSearchPage)을 공유해
 * "어느 소스인지"가 첫 화면에서 읽히지 않던 문제를, 템플릿 슬롯으로 푼다.
 * 소스마다 ① 대표 비주얼 ② 고유 액센트 색 ③ 한 줄 정체성을 강제한다.
 * 검색 템플릿 제공처 21곳에서 시작해, 제작 팩(aic·cleveland)·글로벌 도서
 * (openlibrary·googlebooks·openbd)까지 전체 제공처 26곳으로 넓혔다 — 허브·
 * 디렉터리처럼 여러 소스가 한 화면에 모이는 표면도 같은 표를 쓴다.
 *
 * - 이름(name)은 카드 배지와 같은 정본(RESOURCE_LABELS)을 재사용한다 — 이름을 새로 만들지 않는다.
 * - 대표 비주얼(art)은 기존 브랜드 일러스트(apps/web/public/brand/illustrated-20260928) 중
 *   주제가 실제로 맞는 것만 배정한다. 무관한 일러스트를 끼워 넣지 않는다.
 * - 브랜드 일러스트와 주제가 맞는 게 없는 소스는 장면 표지(scene)를 쓴다
 *   (디자인 웨이브 8-A, apps/web/public/brand/research-sources-20261008) — 소스가
 *   모으는 자료의 성격이 한눈에 읽히는 장면(우주·생물 표본·복식·음악 아카이브 등)을
 *   소스마다 서로 다른 그림으로 그렸다. art와 scene은 함께 쓰지 않는다.
 * - 어느 쪽 실물 아트도 없는 소스만 타이포그래픽 표지(글리프+액센트 패턴)로 남는다.
 * - 액센트 색 값은 research-source-identity.css의 소스별 토큰(--source-accent)이 정본이다.
 *   이 파일은 색을 값으로 갖지 않고, CSS가 같은 provider 키로 토큰을 제공하는지를
 *   테스트가 대조한다.
 * - 새 소스를 추가할 때는 이 표에 한 줄 + CSS 토큰 한 블록이면 된다.
 */
export interface ResearchSourceIdentity {
  provider: ResourceProvider;
  /** 소스 공식 이름 (RESOURCE_LABELS의 이름 부분 — 카드 배지와 동일 표기). */
  name: string;
  /** 한 줄 정체성 — 이 소스가 무엇을 모아 둔 곳인지, 사용자 언어로. */
  tagline: string;
  /** 대표 비주얼 파일명(확장자 제외). 맞는 기존 아트가 없으면 null → 타이포그래픽 표지. */
  art: string | null;
  /** 장면 표지 파일명(확장자 제외, brand/research-sources-20261008). art와 함께 쓰지 않는다. */
  sceneArt: string | null;
  /** 타이포그래픽 표지의 큰 글리프 (소스를 상징하는 한 글자). */
  glyph: string;
}

type ResearchSourceIdentitySeed = Pick<ResearchSourceIdentity, "tagline" | "art" | "glyph"> & {
  scene?: string;
};

const RESEARCH_SOURCE_IDENTITY_SEEDS: Record<ResourceProvider, ResearchSourceIdentitySeed> = {
  met: { tagline: "메트로폴리탄 미술관의 공개 소장품에서 복식·장식·가구의 원형을 찾습니다", art: null, glyph: "M" },
  kakao: { tagline: "카카오 도서 검색으로 만화 단행본과 작법서를 찾습니다", art: "storyboard", glyph: "카" },
  bizinfo: { tagline: "기업마당에 모인 창작자 지원사업 공고를 찾습니다", art: null, glyph: "기" },
  polyhaven: { tagline: "CC0 3D 모델·HDRI·텍스처를 공개하는 재료 아카이브입니다", art: "background-city", glyph: "P" },
  ambientcg: { tagline: "CC0 PBR 재질과 3D 소재를 공개하는 라이브러리입니다", art: "materials", glyph: "A" },
  nasa: { tagline: "NASA가 공개한 행성·성운·우주선 이미지 자료실입니다", art: null, glyph: "N", scene: "nasa" },
  vam: { tagline: "빅토리아 앨버트 박물관의 패션·디자인 소장품을 탐색합니다", art: null, glyph: "V", scene: "vam" },
  googlefonts: { tagline: "실제 글꼴로 문구를 미리 보는 서체 라이브러리입니다", art: null, glyph: "가" },
  rijksmuseum: { tagline: "네덜란드 황금기 회화와 장식미술의 소장 기록을 찾습니다", art: null, glyph: "R" },
  gbif: { tagline: "전 세계 생물종 관찰 기록과 사진으로 크리처의 근거를 찾습니다", art: null, glyph: "G", scene: "gbif" },
  musicbrainz: { tagline: "음악가와 음반의 관계를 잇는 공개 음악 데이터베이스입니다", art: null, glyph: "음", scene: "musicbrainz" },
  internetarchive: { tagline: "도서·잡지·영상·음원을 보존하는 인터넷 도서관입니다", art: null, glyph: "아", scene: "internetarchive" },
  metweather: { tagline: "노르웨이 기상청 예보로 장면의 날씨와 빛을 읽습니다", art: null, glyph: "빛" },
  kheritage: { tagline: "국가유산청이 공개하는 문화유산 지정·관리 기록을 찾습니다", art: null, glyph: "유", scene: "kheritage" },
  neis: { tagline: "전국 학교의 기본정보를 모은 교육 행정 데이터입니다", art: "background-classroom", glyph: "학" },
  tourapi: { tagline: "한국관광공사가 정리한 국내 관광지·문화시설 정보를 찾습니다", art: null, glyph: "관", scene: "tourapi" },
  korean: { tagline: "국립국어원 표준국어대사전의 표제어와 뜻풀이를 찾습니다", art: null, glyph: "말", scene: "korean" },
  smithsonian: { tagline: "스미스소니언 박물관군의 공개 문화유산·과학 기록을 탐색합니다", art: null, glyph: "S", scene: "smithsonian" },
  wikimedia: { tagline: "위키백과 문서 조회수로 대중의 관심 흐름을 읽습니다", art: null, glyph: "위", scene: "wikimedia" },
  europeana: { tagline: "유럽 박물관·도서관·아카이브를 한 번에 잇는 통합검색입니다", art: null, glyph: "E", scene: "europeana" },
  dpla: { tagline: "미국 도서관·박물관 자료를 모은 디지털 공공 도서관입니다", art: null, glyph: "D", scene: "dpla" },
  aic: { tagline: "시카고 미술관이 공개한 회화·조각·공예 소장품에서 시대의 원형을 찾습니다", art: null, glyph: "시" },
  cleveland: { tagline: "클리블랜드 미술관이 CC0로 공개한 유물·문양·회화 소장품을 찾습니다", art: null, glyph: "클" },
  openlibrary: { tagline: "전 세계 도서 서지를 모은 열린 도서관에서 작품과 판본을 찾습니다", art: null, glyph: "O" },
  googlebooks: { tagline: "Google 도서 검색으로 전 세계 책의 서지와 미리보기를 찾습니다", art: null, glyph: "책" },
  openbd: { tagline: "일본 출판 서지 데이터베이스에서 일본 도서와 ISBN 정보를 찾습니다", art: null, glyph: "B" },
};

/** 소스 정체성 — 이름은 정본 라벨에서 가져와 배지·칩·표지가 같은 이름을 쓰게 한다. */
export function researchSourceIdentity(provider: ResourceProvider): ResearchSourceIdentity {
  const seed = RESEARCH_SOURCE_IDENTITY_SEEDS[provider];
  return {
    provider,
    name: RESOURCE_LABELS[provider].split(" · ")[0],
    tagline: seed.tagline,
    art: seed.art,
    sceneArt: seed.scene ?? null,
    glyph: seed.glyph,
  };
}

/**
 * 표지 이미지의 공개 경로 — 실물 아트가 있는 소스만 경로를 갖는다.
 * 브랜드 일러스트(art)를 먼저 보고, 없으면 소스 장면 표지(sceneArt)를 본다.
 * 둘 다 없으면 null이고, 표지는 타이포그래픽 대체로 렌더된다.
 */
export function researchSourceArtSrc(identity: ResearchSourceIdentity): string | null {
  if (identity.art) return `/brand/illustrated-20260928/${identity.art}.webp`;
  if (identity.sceneArt) return `/brand/research-sources-20261008/${identity.sceneArt}.webp`;
  return null;
}

/** 정체성 키트가 다루는 전체 소스 — 레지스트리 완전성 검사용. */
export const RESEARCH_SOURCE_PROVIDERS = Object.keys(RESEARCH_SOURCE_IDENTITY_SEEDS) as ResourceProvider[];

/**
 * 출처 디렉터리(sources.ts)의 productRoute → 제공처 바인딩.
 *
 * 디렉터리 행은 자유 텍스트 이름이라 이름으로 제공처를 추정하지 않는다.
 * 행이 자기 기능 경로(productRoute)를 가질 때만, 그 경로가 가리키는 검색
 * 페이지의 제공처와 같은 소스로 확정한다. 경로가 없거나 이 표에 없는 행은
 * 정체성을 붙이지 않는다 — 디렉터리에는 아직 연결되지 않은 소스도 섞여 있다.
 * 바인딩이 실제 데이터와 어긋나지 않는지는 테스트가 대조한다.
 */
export const RESEARCH_SOURCE_ROUTE_PROVIDERS: Readonly<Record<string, ResourceProvider>> = {
  "/research/material-assets": "ambientcg",
  "/research/space-assets": "nasa",
  "/research/vam": "vam",
  "/research/rijksmuseum": "rijksmuseum",
  "/research/fonts": "googlefonts",
  "/research/creatures": "gbif",
  "/research/music-metadata": "musicbrainz",
  "/research/archive": "internetarchive",
  "/research/weather-light": "metweather",
  "/research/open-data/kheritage": "kheritage",
  "/research/open-data/neis": "neis",
  "/research/open-data/tourapi": "tourapi",
  "/research/open-data/korean": "korean",
  "/research/open-data/smithsonian": "smithsonian",
  "/research/open-data/wikimedia": "wikimedia",
  "/research/open-data/europeana": "europeana",
  "/research/open-data/dpla": "dpla",
};

/** 기능 경로로 소스 정체성을 확정한다 — 바인딩이 없으면 null(정체성 없음이 정직한 상태). */
export function researchSourceIdentityForRoute(route: string | undefined): ResearchSourceIdentity | null {
  if (!route) return null;
  const provider = RESEARCH_SOURCE_ROUTE_PROVIDERS[route];
  return provider ? researchSourceIdentity(provider) : null;
}
