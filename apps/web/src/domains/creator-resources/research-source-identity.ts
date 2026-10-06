import { RESOURCE_LABELS } from "@/shared/lib/creator-resources";

import type { ResourceSearchProvider } from "./resource-search-config";

/**
 * 리서치 소스 정체성 키트 (디자인 웨이브 3 · R5).
 *
 * 18개 리서치 소스 페이지가 하나의 템플릿(ResourceSearchPage)을 공유해
 * "어느 소스인지"가 첫 화면에서 읽히지 않던 문제를, 템플릿 슬롯으로 푼다.
 * 소스마다 ① 대표 비주얼 ② 고유 액센트 색 ③ 한 줄 정체성을 강제한다.
 *
 * - 이름(name)은 카드 배지와 같은 정본(RESOURCE_LABELS)을 재사용한다 — 이름을 새로 만들지 않는다.
 * - 대표 비주얼(art)은 기존 브랜드 일러스트(apps/web/public/brand/illustrated-20260928) 중
 *   주제가 실제로 맞는 것만 배정한다. 맞는 아트가 없는 소스는 null — 타이포그래픽 표지
 *   (글리프+액센트 패턴)가 정직한 대체이며, 무관한 일러스트를 끼워 넣지 않는다.
 * - 액센트 색 값은 research-source-identity.css의 소스별 토큰(--source-accent)이 정본이다.
 *   이 파일은 색을 값으로 갖지 않고, CSS가 같은 provider 키로 토큰을 제공하는지를
 *   테스트가 대조한다.
 * - 새 소스를 추가할 때는 이 표에 한 줄 + CSS 토큰 한 블록이면 된다.
 */
export interface ResearchSourceIdentity {
  provider: ResourceSearchProvider;
  /** 소스 공식 이름 (RESOURCE_LABELS의 이름 부분 — 카드 배지와 동일 표기). */
  name: string;
  /** 한 줄 정체성 — 이 소스가 무엇을 모아 둔 곳인지, 사용자 언어로. */
  tagline: string;
  /** 대표 비주얼 파일명(확장자 제외). 맞는 기존 아트가 없으면 null → 타이포그래픽 표지. */
  art: string | null;
  /** 타이포그래픽 표지의 큰 글리프 (소스를 상징하는 한 글자). */
  glyph: string;
}

type ResearchSourceIdentitySeed = Pick<ResearchSourceIdentity, "tagline" | "art" | "glyph">;

const RESEARCH_SOURCE_IDENTITY_SEEDS: Record<ResourceSearchProvider, ResearchSourceIdentitySeed> = {
  met: { tagline: "메트로폴리탄 미술관의 공개 소장품에서 복식·장식·가구의 원형을 찾습니다", art: null, glyph: "M" },
  kakao: { tagline: "카카오 도서 검색으로 만화 단행본과 작법서를 찾습니다", art: "storyboard", glyph: "카" },
  bizinfo: { tagline: "기업마당에 모인 창작자 지원사업 공고를 찾습니다", art: null, glyph: "기" },
  polyhaven: { tagline: "CC0 3D 모델·HDRI·텍스처를 공개하는 재료 아카이브입니다", art: "background-city", glyph: "P" },
  ambientcg: { tagline: "CC0 PBR 재질과 3D 소재를 공개하는 라이브러리입니다", art: "materials", glyph: "A" },
  nasa: { tagline: "NASA가 공개한 행성·성운·우주선 이미지 자료실입니다", art: null, glyph: "N" },
  vam: { tagline: "빅토리아 앨버트 박물관의 패션·디자인 소장품을 탐색합니다", art: null, glyph: "V" },
  googlefonts: { tagline: "실제 글꼴로 문구를 미리 보는 서체 라이브러리입니다", art: null, glyph: "가" },
  rijksmuseum: { tagline: "네덜란드 황금기 회화와 장식미술의 소장 기록을 찾습니다", art: null, glyph: "R" },
  gbif: { tagline: "전 세계 생물종 관찰 기록과 사진으로 크리처의 근거를 찾습니다", art: null, glyph: "G" },
  musicbrainz: { tagline: "음악가와 음반의 관계를 잇는 공개 음악 데이터베이스입니다", art: null, glyph: "음" },
  internetarchive: { tagline: "도서·잡지·영상·음원을 보존하는 인터넷 도서관입니다", art: null, glyph: "아" },
  metweather: { tagline: "노르웨이 기상청 예보로 장면의 날씨와 빛을 읽습니다", art: null, glyph: "빛" },
  kheritage: { tagline: "국가유산청이 공개하는 문화유산 지정·관리 기록을 찾습니다", art: null, glyph: "유" },
  neis: { tagline: "전국 학교의 기본정보를 모은 교육 행정 데이터입니다", art: "background-classroom", glyph: "학" },
  tourapi: { tagline: "한국관광공사가 정리한 국내 관광지·문화시설 정보를 찾습니다", art: null, glyph: "관" },
  korean: { tagline: "국립국어원 표준국어대사전의 표제어와 뜻풀이를 찾습니다", art: null, glyph: "말" },
  smithsonian: { tagline: "스미스소니언 박물관군의 공개 문화유산·과학 기록을 탐색합니다", art: null, glyph: "S" },
  wikimedia: { tagline: "위키백과 문서 조회수로 대중의 관심 흐름을 읽습니다", art: null, glyph: "위" },
  europeana: { tagline: "유럽 박물관·도서관·아카이브를 한 번에 잇는 통합검색입니다", art: null, glyph: "E" },
  dpla: { tagline: "미국 도서관·박물관 자료를 모은 디지털 공공 도서관입니다", art: null, glyph: "D" },
};

/** 소스 정체성 — 이름은 정본 라벨에서 가져와 배지·칩·표지가 같은 이름을 쓰게 한다. */
export function researchSourceIdentity(provider: ResourceSearchProvider): ResearchSourceIdentity {
  const seed = RESEARCH_SOURCE_IDENTITY_SEEDS[provider];
  return {
    provider,
    name: RESOURCE_LABELS[provider].split(" · ")[0],
    tagline: seed.tagline,
    art: seed.art,
    glyph: seed.glyph,
  };
}

/** 정체성 키트가 다루는 전체 소스 — 레지스트리 완전성 검사용. */
export const RESEARCH_SOURCE_PROVIDERS = Object.keys(RESEARCH_SOURCE_IDENTITY_SEEDS) as ResourceSearchProvider[];
