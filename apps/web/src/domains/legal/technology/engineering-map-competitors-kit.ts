import type { EngineeringMapRow } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 경쟁·참고 제품 지도의 행을 만드는 공용 도구(행 자료는 engineering-map-competitors-rows*.ts).
 * 영역 순서대로 모은다.
 *
 * 쓰는 규칙(저장소가 스스로 정한 선):
 * - 저장소 문서(벤치마크·ADR·플레이북·참고 카드)가 기록한 관찰만 쓴다. 경쟁 제품의 가격·점유율·최신 버전·기능 우열은 조사하지 않았으므로 쓰지 않는다.
 * - "대체·동등·우위"를 말하지 않는다(`replacementClaimAllowed: false`). 자체 평가표(Magma 동등+, 3D 매트릭스 ‘O’)는 근거로 쓰지 않는다.
 * - 정량 수치(성능·번들 크기)와 마켓 수수료율(자체 설계값)은 싣지 않는다.
 * - 문서가 따로 적지 않은 것은 지어내지 않고 ‘문서에 없음·미확인’이라고 쓴다.
 *
 * 행은 두 종류다. `row()` 는 비교 문서·ADR·플레이북·코드 주석이 관찰을 적은 제품이고,
 * `watch()`(감시 목록 JSON)와 `listed()`(벤치마크 문서의 대상 목록)는 이름만 올라 있어 직접 비교한 기록이 없는 제품이다.
 * 둘을 섞어 "참고한 제품"이라고 세지 않도록 `WATCHLIST_ONLY_IDS` 로 구분해 요약에서 따로 센다.
 * 제품 이름(`name`)은 라틴 문자로만 쓴다(발표 덱이 이름을 그대로 가져가 영어 화면에 쓴다). 한글 상호는 `what` 칸에 적는다.
 */

export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** 첫 열(영역). 같은 객체를 여러 행이 공유한다. */
export const D = {
  drawing: t("그림·페인팅", "Drawing & painting"),
  threeD: t("3D·캐릭터", "3D & characters"),
  collab: t("협업·가상공간", "Collaboration & virtual space"),
  storyboard: t("콘티·검토", "Storyboard & review"),
  design: t("디자인·문서", "Design & documents"),
  publishing: t("웹툰 유통·생태계", "Webtoon publishing & ecosystem"),
  ai: t("AI·에이전트", "AI & agents"),
  engines: t("엔진·표준", "Engines & standards"),
  animation: t("2D 애니메이션·모션", "2D animation & motion"),
  market: t("마켓·소재·창작자 지원", "Marketplaces, assets & creator support"),
  identity: t("계정·로그인", "Accounts & sign-in"),
} as const;

/** 영역 id → 영역 이름. 요약(COMPETITOR_DOMAIN_SUMMARY)과 표가 같은 객체를 쓴다. 순서는 표에 처음 나타나는 순서다. */
export type CompetitorDomainId = keyof typeof D;

export interface RowSource {
  readonly id: string;
  readonly name: string;
  readonly domain: LocalizedText;
  /** 공식 주소. 링크 레지스트리(engineering-external-links.ts)나 접속 점검을 통과한 주소만 쓴다. */
  readonly url?: string;
  /** 공식 사이트 홈이 아니라 문서·저장소 페이지를 걸 때의 링크 제목(기본은 "<이름> official site"). */
  readonly urlTitle?: string;
  readonly what: LocalizedText;
  readonly learned: LocalizedText;
  readonly overlap: LocalizedText;
  readonly evidence: readonly string[];
}

export function row(source: RowSource): EngineeringMapRow {
  return {
    id: source.id,
    name: source.name,
    cells: { domain: source.domain, what: source.what, learned: source.learned, overlap: source.overlap },
    ...(source.url ? { link: { title: source.urlTitle ?? `${source.name} official site`, url: source.url } } : {}),
    evidence: source.evidence,
  };
}

export const CREATOR = "apps/web/src/domains/creator";
export const FIELD_NOTES = "apps/web/src/domains/legal/technology/engineering-field-notes-content.ts";
export const PLAYBOOK = "apps/web/src/domains/legal/technology/engineering-playbook-content.ts";

/* ───────────── 감시 목록(레지스트리)에만 있는 제품 ───────────── */

/** 제품 감시 목록 JSON 세 종(`purpose` 가 "공식 출처 기반 경쟁 벤치마크 감시 목록"이라고 밝힌 파일). */
export const REGISTRY_PATH = {
  competitor: "docs/benchmarks/studio-competitor-registry.json",
  emerging: "docs/benchmarks/studio-emerging-product-registry.json",
  webtoon: "docs/benchmarks/studio-webtoon-ecosystem-registry.json",
} as const;

const REGISTRY_LABEL: Readonly<Record<keyof typeof REGISTRY_PATH, LocalizedText>> = {
  competitor: t("경쟁 제품 레지스트리, 2026-09-02", "competitor registry, 2026-09-02"),
  emerging: t("신규 제품 레지스트리, 2026-09-02", "emerging-product registry, 2026-09-02"),
  webtoon: t("웹툰 생태계 레지스트리, 2026-09-03", "webtoon-ecosystem registry, 2026-09-03"),
};

/** 레지스트리가 제품마다 붙인 `category` 값을 쉬운 말로 푼 것. 값은 JSON 그대로다. */
const REGISTRY_KIND = {
  "comic-drawing": t("만화·그림 앱", "A comic and drawing app"),
  "mobile-drawing": t("모바일 그림 앱", "A mobile drawing app"),
  "image-editor": t("이미지 편집 프로그램", "An image editor"),
  "natural-media": t("물감·종이 질감을 흉내 내는 자연 매체 그림 프로그램", "A natural-media painting program that imitates paint and paper"),
  "vector-infinite-canvas": t("벡터·무한 캔버스 도구", "A vector and infinite-canvas tool"),
  "animation-2d": t("2D 애니메이션·모션 도구", "A 2D animation and motion tool"),
  "rigging-avatar": t("리깅·아바타 도구", "A rigging and avatar tool"),
  "3d-dcc": t("3D 제작 도구", "A 3D content-creation tool"),
  "material-marketplace": t("소재 마켓", "An asset marketplace"),
  "ai-creative": t("생성형 AI 창작 도구", "A generative-AI creative tool"),
  storyboard: t("스토리보드 도구", "A storyboard tool"),
  "collaboration-design": t("협업 디자인 도구", "A collaborative design tool"),
  "three-d-webtoon-production": t("웹툰 3D 배경 제작 도구", "A 3D background tool for webtoons"),
  "three-d-character-authoring": t("웹툰 3D 캐릭터 제작 도구", "A 3D character tool for webtoons"),
  "ai-webtoon-creation": t("AI 웹툰 제작 서비스", "An AI webtoon-making service"),
  "webtoon-production-and-distribution": t("웹툰 제작·유통 서비스", "A webtoon production and distribution service"),
  "ai-webtoon-assist": t("AI 웹툰 보조 서비스", "An AI webtoon assistant service"),
  "social-comic-assist": t("소셜 만화 제작 보조 서비스", "A social-comic assistant service"),
  "ai-motion-capture": t("AI 모션 캡처 서비스", "An AI motion-capture service"),
  "creator-publishing-support": t("창작자 게시 지원 서비스", "A creator publishing-support service"),
  "ai-manhwa-planning": t("AI 만화 기획 서비스", "An AI comic-planning service"),
} as const;

export type RegistryCategory = keyof typeof REGISTRY_KIND;

export interface WatchSource {
  readonly id: string;
  readonly name: string;
  readonly domain: LocalizedText;
  readonly url?: string;
  /** 어느 감시 목록 파일에 올라 있는가. */
  readonly registry: keyof typeof REGISTRY_PATH;
  /** 레지스트리의 `category` 값. */
  readonly category: RegistryCategory;
  /** 레지스트리의 `priority` 값: P0 은 매 릴리스 감사, P1 은 분기별, P2 는 아이디어 감시. */
  readonly priority: "P0" | "P1" | "P2";
  /** 레지스트리의 `focus` 태그를 쉬운 말로 푼 것(쓰지 않은 태그를 지어내지 않는다). */
  readonly focus: LocalizedText;
  /** 레지스트리 말고 이 제품을 다른 문서도 언급할 때만 더한다. */
  readonly extraEvidence?: readonly string[];
  /** 레지스트리가 적은 구현 메모. 계획이지 구현이 아니므로 "(계획)"으로 붙는다. */
  readonly note?: LocalizedText;
}

const unresearchedIds = new Set<string>();

/**
 * 이름만 올라 있고 직접 비교한 기록은 없는 제품의 id(감시 목록·대상 목록). 요약이 "참고한 곳"과 따로 센다.
 * `watch()`·`listed()` 를 부르는 순간 채워지므로, 행 배열 모듈을 먼저 불러온 뒤에 읽어야 한다.
 */
export const WATCHLIST_ONLY_IDS: ReadonlySet<string> = unresearchedIds;

const UNCONFIRMED_OVERLAP = t("겹치는 ToonStudio 기능은 문서에 적혀 있지 않음(미확인).", "No overlapping ToonStudio feature is recorded (unconfirmed).");

/**
 * 감시 목록에만 있는 제품 행. 비교 결과를 지어내지 않고 "미조사"라고 그대로 적는다(KAISTORY 행과 같은 방식).
 * 레지스트리 등재는 직접 써 보거나 채택했다는 뜻이 아니다.
 */
export function watch(source: WatchSource): EngineeringMapRow {
  unresearchedIds.add(source.id);
  const kind = REGISTRY_KIND[source.category];
  const label = REGISTRY_LABEL[source.registry];
  const base = t(
    `미조사: 감시 목록(우선순위 ${source.priority})에만 있고 직접 비교한 기록은 없음.`,
    `Not researched: it is only on the watch list (priority ${source.priority}), with no direct comparison on record.`,
  );
  return row({
    id: source.id,
    name: source.name,
    domain: source.domain,
    ...(source.url ? { url: source.url } : {}),
    what: t(
      `${kind.ko}입니다. 저장소 감시 목록(${label.ko})이 눈여겨본 점은 ${source.focus.ko}입니다.`,
      `${kind.en}. The repository's watch list (${label.en}) noted this focus: ${source.focus.en}.`,
    ),
    learned: source.note
      ? t(`${base.ko} 레지스트리 메모(계획): ${source.note.ko}`, `${base.en} Registry note (plan): ${source.note.en}`)
      : base,
    overlap: UNCONFIRMED_OVERLAP,
    evidence: [REGISTRY_PATH[source.registry], ...(source.extraEvidence ?? [])],
  });
}

export interface ListedSource {
  readonly id: string;
  readonly name: string;
  readonly domain: LocalizedText;
  readonly url?: string;
  readonly urlTitle?: string;
  /** 어떤 제품인지(문서가 적은 만큼만). */
  readonly what: LocalizedText;
  /** 이름이 올라 있는 벤치마크 문서. */
  readonly evidence: readonly string[];
  /** 묶음 서술 등, 문서가 이 제품에 대해 적은 것이 있으면 한 줄로. */
  readonly note?: LocalizedText;
}

/**
 * 벤치마크 문서의 ‘조사 대상 목록’에만 이름이 있고 제품별 관찰은 없는 제품 행. `watch()` 와 같이 "미조사"로 적는다.
 */
export function listed(source: ListedSource): EngineeringMapRow {
  unresearchedIds.add(source.id);
  const base = t(
    "미조사: 문서의 대상 목록에만 이름이 있고 제품별 관찰·적용 기록은 없음.",
    "Not researched: it is only named on the document's target list, with no per-product observation or adoption record.",
  );
  return row({
    id: source.id,
    name: source.name,
    domain: source.domain,
    ...(source.url ? { url: source.url } : {}),
    ...(source.urlTitle ? { urlTitle: source.urlTitle } : {}),
    what: source.what,
    learned: source.note ? t(`${base.ko} ${source.note.ko}`, `${base.en} ${source.note.en}`) : base,
    overlap: UNCONFIRMED_OVERLAP,
    evidence: source.evidence,
  });
}
