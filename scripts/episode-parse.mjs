// 회차 메타데이터 파싱 — 플랫폼 회차 목록 응답을 TitleEpisode 계약으로 바꾸는 순수 함수 모음.
// scripts/crawl-episodes.mjs 가 사용하고, 단위 테스트(scripts/__tests__/episode-parse.test.mjs) 대상이라
// 네트워크·파일 의존을 두지 않는다(related-info-parse.mjs 와 같은 분리 규약).
//
// 필드 정직성:
// - 좋아요는 플랫폼 목록 응답에 공개 수치가 없으면 만들지 않는다. starScore 같은 별점을
//   좋아요로 바꿔 넣는 위장을 하지 않는다.
// - 날짜는 형식이 엄격히 맞을 때만 변환한다. 추측 파싱으로 없는 날짜를 만들지 않는다.
// - 컷 이미지 본문은 다루지 않는다. 회차 썸네일 URL 만 표지와 같은 프록시 형태로 바꾼다.

// 표지 선례(crawlers/_shared.mjs coverProxy)와 동일 의미 — https 원본만 /api/cover 프록시로 감싼다.
// 호스트 허용목록은 API catalog-url-policy 의 COVER_ORIGINS 가 강제한다.
export function coverProxy(url) {
  if (typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return undefined;
  return `/api/cover?u=${encodeURIComponent(trimmed)}`;
}

// 네이버 serviceDateDescription "26.10.04" (YY.MM.DD) → ISO "2026-10-04".
// 두 자리 연도는 2000년대로 본다(네이버 웹툰 서비스 개시 이후의 표기만 존재).
// 형식이 다르거나 월·일이 범위를 벗어나면 null — 호출측이 publishedAt 을 비운다.
export function parseNaverServiceDate(desc) {
  if (typeof desc !== "string") return null;
  const m = desc.trim().match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const year = 2000 + Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// 네이버 회차 1건(articleList 항목) → TitleEpisode. 번호가 유효하지 않으면 null.
export function mapNaverArticle(article) {
  if (!article || typeof article !== "object") return null;
  const number = article.no;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) return null;
  const episode = { number };
  const title = typeof article.subtitle === "string" ? article.subtitle.trim() : "";
  if (title) episode.title = title;
  const publishedAt = parseNaverServiceDate(article.serviceDateDescription);
  if (publishedAt) episode.publishedAt = publishedAt;
  const thumbnailUrl = coverProxy(article.thumbnailUrl);
  if (thumbnailUrl) episode.thumbnailUrl = thumbnailUrl;
  return episode;
}

// 네이버 회차 목록 응답 1페이지 → { episodes, page, totalPages, totalRows }.
// 응답이 깨졌으면 null(호출측이 실패로 처리하고 기존 데이터를 지우지 않는다).
export function mapNaverArticlePage(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.articleList)) return null;
  const episodes = payload.articleList.map(mapNaverArticle).filter((ep) => ep !== null);
  const info = payload.pageInfo && typeof payload.pageInfo === "object" ? payload.pageInfo : {};
  const totalPages =
    typeof info.totalPages === "number" && Number.isInteger(info.totalPages) && info.totalPages > 0
      ? info.totalPages
      : 1;
  const page =
    typeof info.page === "number" && Number.isInteger(info.page) && info.page > 0 ? info.page : 1;
  const totalRows =
    typeof info.totalRows === "number" && Number.isInteger(info.totalRows) && info.totalRows >= 0
      ? info.totalRows
      : typeof payload.totalCount === "number" && Number.isInteger(payload.totalCount) && payload.totalCount >= 0
        ? payload.totalCount
        : null;
  return { episodes, page, totalPages, totalRows };
}

// 여러 페이지의 회차를 합친다 — 번호 기준 중복 제거(먼저 본 쪽 유지), 번호 오름차순.
export function mergeEpisodePages(pages) {
  const byNumber = new Map();
  for (const page of pages) {
    for (const episode of page?.episodes ?? []) {
      if (!byNumber.has(episode.number)) byNumber.set(episode.number, episode);
    }
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}
