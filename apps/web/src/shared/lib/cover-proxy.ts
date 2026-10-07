// 카탈로그 표지 프록시 변환 — 외부 플랫폼 CDN 표지를 우리 Core API 프록시(/api/cover)로 중계한다.
//
// 배경: 표지 원본 URL이 가리키는 외부 CDN(네이버 pstatic, KMAS 등)을 방문자 브라우저가 직접
// 호출하면 방문자 IP와 보던 페이지(리퍼러)가 외부 플랫폼에 그대로 노출된다. 카탈로그 표지는
// 전부 우리 서버를 거쳐 받고, 외부에는 우리 서버만 보이게 한다.
//
// 허용 호스트는 API 측 정본(apps/api/src/modules/catalog/catalog-url-policy.ts 의
// COVER_ORIGINS)과 반드시 동기 상태로 유지한다. 여기에 없는 호스트는 변환하지 않고 원본을
// 그대로 돌려준다 — 카탈로그 표지가 아닌 외부 이미지(사용자 등록 이미지 등)를 깨지 않기
// 위해서다. 허용 호스트인데 프록시 응답이 실패하면 <img> 오류가 기존 깨진 이미지 폴백을
// 타게 둔다. 직접 연결로 폴백하면 프라이버시 결정이 무효가 되므로 절대 되돌리지 않는다.

const COVER_PROXY_HOSTS: ReadonlySet<string> = new Set([
  "image-comic.pstatic.net",
  "comicthumb-phinf.pstatic.net",
  "series-phinf.pstatic.net",
  "bookthumb-phinf.pstatic.net",
  "ssl.pstatic.net",
  "www.kmas.or.kr",
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

// 표지 src 1건을 프록시 URL로 바꾼다. 이미 프록시 경유인 URL, 로컬 자산(/…), data:/blob:
// 인라인 이미지는 그대로 둔다. 허용 호스트가 아닌 절대 URL도 그대로 둔다.
export function proxiedCoverSrc(src: string): string {
  if (!src) return src;
  if (src.startsWith(COVER_PROXY_PREFIX)) return src;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (src.startsWith("/") && !src.startsWith("//")) return src;

  let url: URL;
  try {
    url = new URL(src.startsWith("//") ? `https:${src}` : src);
  } catch {
    return src;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return src;
  if (!COVER_PROXY_HOSTS.has(url.hostname)) return src;
  // API 프록시는 https 원본만 받는다. http로 온 허용 호스트 표지는 https로 올려서 중계한다.
  if (url.protocol === "http:") url.protocol = "https:";
  return `${COVER_PROXY_PREFIX}${encodeURIComponent(url.href)}`;
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
