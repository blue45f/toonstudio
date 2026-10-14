// 카탈로그 표지 프록시 변환 — 외부 플랫폼 CDN 표지를 우리 Core API 프록시(/api/cover)로 중계한다.
//
// 배경: 표지 원본 URL이 가리키는 외부 CDN(네이버 pstatic 등)을 방문자 브라우저가 직접
// 호출하면 방문자 IP와 보던 페이지(리퍼러)가 외부 플랫폼에 그대로 노출된다. 카탈로그 표지는
// 전부 우리 서버를 거쳐 받고, 외부에는 우리 서버만 보이게 한다.
//
// 허용 호스트는 API 측 정본(apps/api/src/modules/catalog/catalog-url-policy.ts 의
// COVER_ORIGINS)과 반드시 동기 상태로 유지한다. 여기에 없는 호스트는 변환하지 않고 원본을
// 그대로 돌려준다 — 카탈로그 표지가 아닌 외부 이미지(사용자 등록 이미지 등)를 깨지 않기
// 위해서다. 허용 호스트인데 프록시 응답이 실패하면 <img> 오류가 기존 깨진 이미지 폴백을
// 타게 둔다. 직접 연결로 폴백하면 프라이버시 결정이 무효가 되므로 절대 되돌리지 않는다.
//
// 예외 — KMAS(한국만화영상진흥원, *.kmas.or.kr)는 변환하지 않고 원본 URL을 그대로 쓴다.
// 근거 ① KMAS 통합 규약(docs/kmas-integration.md §3·§6): imageDownloadUrl은 URL
// 메타데이터로만 저장하고 서버 프록시로 중계하지 않는 것이 이 소스의 정본 취급이다.
// 근거 ② 실측(2026-10-08): KMAS 포털 첨부 다운로드는 서버 경유 fetch가 닿지 않거나
// 거절돼 /api/cover가 502를 반환했고, 그 결과 KMAS 표지를 쓰는 유일한 표면인 홈·탐색
// 스포트라이트("오늘의 추천"·"함께 볼 만한 추천")의 표지가 전부 폴백으로 떨어졌다.
// 방문자 브라우저의 직접 호출은 프록시 전환 이전부터 정상 동작하던 경로다. API 측
// COVER_ORIGINS에는 KMAS가 남아 있어, 이미 프록시 형태로 저장·캐시된 URL은 계속
// 해석된다 — 클라이언트가 새로 만들지 않을 뿐이다.

const COVER_PROXY_HOSTS: ReadonlySet<string> = new Set([
  "image-comic.pstatic.net",
  "comicthumb-phinf.pstatic.net",
  "series-phinf.pstatic.net",
  "bookthumb-phinf.pstatic.net",
  "ssl.pstatic.net",
  "kr-a.kakaopagecdn.com",
  "kr-a2.kakaopagecdn.com",
  "t1.kakaocdn.net",
  "t2.kakaocdn.net",
  "t3.kakaocdn.net",
  "dn-img-page.kakao.com",
  "ccdn.lezhin.com",
  "img.ridicdn.net",
  "cdn1.munpia.com",
  "cf-image.joara.com",
  "images.novelpia.com",
  "novelpia.com",
  "image.balcony.studio",
  "cdn.balcony.studio",
  "toptoon.com",
  "cdn.toptoon.com",
  "smurfs.toptoon.com",
  "toomics.com",
  "cdn.toomics.com",
  "thumb.toomics.com",
  "d3mcojo3jv0dbr.cloudfront.net",
  "img.mrblue.com",
  "bookimg.bookcube.com",
  "img-books.onestore.co.kr",
  "image.yes24.com",
  "contents.kyobobook.co.kr",
  "www.comico.kr",
]);

const COVER_PROXY_PREFIX = "/api/cover?u=";

// 표지 표준 폭 — srcSet 후보 폭의 정본. 그리드 카드의 CSS 폭(cover-image.tsx의
// COVER_GRID_SIZES: 모바일 50vw≈160~320px · 태블릿 33vw · 데스크톱 25vw·상한 16rem)과
// hero(20rem)에 DPR 1~2를 곱해 도출했다. 브라우저는 sizes와 함께 이 후보 중 카드 폭에
// 맞는 가장 작은 폭만 수신한다. API 측(catalog.controller.ts의 COVER_STANDARD_WIDTHS)과
// 반드시 동기 상태로 유지한다 — 한쪽에만 있는 폭은 프록시가 무시한다(원본 서빙).
export const COVER_STANDARD_WIDTHS = [160, 320, 480, 640, 960] as const;

export type CoverStandardWidth = (typeof COVER_STANDARD_WIDTHS)[number];

// 임의의 숫자를 표준 폭으로 인정하지 않는다 — 목록 밖 폭은 변형·캐시 키를 만들지 않는다.
export function isCoverStandardWidth(width: number): width is CoverStandardWidth {
  return (COVER_STANDARD_WIDTHS as readonly number[]).includes(width);
}

// 프록시 URL에 표준 폭 힌트(&w=)를 붙인다. 이미 폭이 지정된 프록시 URL은 존중하고,
// 표준 폭이 아닌 값은 붙이지 않는다(호출부 실수로 임의 변형이 생기지 않게).
function withCoverWidth(proxyUrl: string, width?: number): string {
  if (width === undefined || !isCoverStandardWidth(width)) return proxyUrl;
  if (/[?&]w=\d+/.test(proxyUrl)) return proxyUrl;
  return `${proxyUrl}&w=${width}`;
}

// KMAS 호스트 판정 — API 측 isKmasCover(apps/api/src/server/kmas.ts)와 같은 의미로,
// kmas.or.kr 본체와 그 서브도메인을 모두 본다.
function isKmasHost(hostname: string): boolean {
  return hostname === "kmas.or.kr" || hostname.endsWith(".kmas.or.kr");
}

// 표지 src 1건을 프록시 URL로 바꾼다. 이미 프록시 경유인 URL, 로컬 자산(/…), data:/blob:
// 인라인 이미지는 그대로 둔다. 허용 호스트가 아닌 절대 URL도 그대로 둔다.
// KMAS 표지는 파일 머리말의 예외 근거에 따라 변환하지 않는다.
// width(표준 폭)를 주면 프록시 결과에만 &w= 힌트를 붙인다 — 프록시를 타지 않는
// 표지(KMAS·로컬·미허용 호스트)에는 폭 힌트가 의미가 없어 붙이지 않는다.
export function proxiedCoverSrc(src: string, width?: number): string {
  if (!src) return src;
  if (src.startsWith(COVER_PROXY_PREFIX)) return withCoverWidth(src, width);
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (src.startsWith("/") && !src.startsWith("//")) return src;

  let url: URL;
  try {
    url = new URL(src.startsWith("//") ? `https:${src}` : src);
  } catch {
    return src;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return src;
  if (isKmasHost(url.hostname)) return src;
  if (!COVER_PROXY_HOSTS.has(url.hostname)) return src;
  // API 프록시는 https 원본만 받는다. http로 온 허용 호스트 표지는 https로 올려서 중계한다.
  if (url.protocol === "http:") url.protocol = "https:";
  return withCoverWidth(`${COVER_PROXY_PREFIX}${encodeURIComponent(url.href)}`, width);
}

// 표지 1건의 표준 폭 srcSet을 만든다. 프록시를 타는 표지만 변형 후보를 갖고,
// 프록시를 타지 않는 표지(KMAS 직접 연결·로컬·미허용 호스트)는 후보를 만들지
// 않는다(undefined) — 폭 협상이 불가능한 URL에 거짓 디스크립터를 주지 않기
// 위해서다(S3-16에서 세운 원칙). 단일 src 폴백은 호출부의 src가 담당한다.
export function coverStandardSrcSet(src: string): string | undefined {
  if (!proxiedCoverSrc(src).startsWith(COVER_PROXY_PREFIX)) return undefined;
  return COVER_STANDARD_WIDTHS.map((width) => `${proxiedCoverSrc(src, width)} ${width}w`).join(", ");
}

// srcset("url 480w, url2 960w")의 각 URL에도 같은 변환을 적용한다.
export function proxiedCoverSrcSet(srcSet: string): string {
  return srcSet
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return trimmed;
      const [url, ...descriptors] = trimmed.split(/\s+/);
      return [proxiedCoverSrc(url ?? ""), ...descriptors].join(" ");
    })
    .join(", ");
}
