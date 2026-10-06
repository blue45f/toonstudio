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

// ── 포스타입 ────────────────────────────────────────────────────────────────
// 포스타입 시리즈·포스트 페이지는 Next.js RSC(self.__next_f.push) 페이로드에 React Query
// dehydrated 상태를 임베드한다. 시리즈 상세 상태에는 postCount·firstPostId 가, 포스트 상세
// 상태에는 제목·발행시각(epoch 초)·썸네일·이전/다음 포스트가 들어 있다.
// 회차 목록 자체는 시리즈 페이지에 임베드되지 않는다 — 클라이언트가 /api 로 불러오며
// robots.txt 가 /api/* 와 목록 정렬 파라미터(?post_sort=)를 금지하므로, 공개 포스트
// 페이지의 nextPost 체인을 따라가는 것만이 공개 경로다(2026-10-06 실측).

// RSC 페이로드 청크를 이어붙여 디코드한다(scripts/crawlers/postype.mjs 의 decodeNextPayload 와 동일 알고리즘).
export function decodePostypePayload(html) {
  if (typeof html !== "string") return "";
  const re = /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  let joined = "";
  while ((m = re.exec(html))) {
    try {
      joined += JSON.parse('"' + m[1] + '"');
    } catch {
      /* 부분 청크 디코드 실패는 무시 */
    }
  }
  return joined;
}

// text[start] 의 '{' 에서 시작하는 JSON 객체를 문자열·이스케이프를 의식해 균형 추출한다.
// "$undefined" 토큰은 null 로 치환해 파싱 가능하게 한다(포스타입 카탈로그 크롤러와 같은 처리).
function extractJsonObjectAt(text, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < text.length; j++) {
    const ch = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, j + 1).replace(/"\$undefined"/g, "null"));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// queryKey 앵커보다 앞에 있는 가장 가까운 dehydrated state 의 data 객체를 꺼낸다.
// 포스타입 dehydrated 쿼리는 {"state":{"data":...,...},"queryKey":[...]} 가 한 객체로 붙어 있다.
function stateDataBefore(text, anchorIndex) {
  const marker = '"state":{"data":';
  const at = text.lastIndexOf(marker, anchorIndex);
  if (at < 0) return null;
  return extractJsonObjectAt(text, at + marker.length);
}

// 포스타입 시리즈 페이지 → { seriesId, postCount, firstPostId }. 체인 시작점과 플랫폼 총수다.
// 상세 상태가 없거나 id 가 어긋나면 null(호출측이 실패로 처리한다).
export function parsePostypeSeriesMeta(html) {
  const joined = decodePostypePayload(html);
  if (!joined) return null;
  const m = joined.match(/"queryKey":\["CHANNEL","ID",\d+,"SERIES","DETAIL",(\d+)\]/);
  if (!m) return null;
  const data = stateDataBefore(joined, m.index);
  if (!data || String(data.id) !== m[1]) return null;
  const postCount =
    typeof data.postCount === "number" && Number.isInteger(data.postCount) && data.postCount > 0
      ? data.postCount
      : null;
  const firstPostId =
    typeof data.firstPostId === "number" && Number.isInteger(data.firstPostId) && data.firstPostId > 0
      ? data.firstPostId
      : null;
  if (postCount === null || firstPostId === null) return null;
  return { seriesId: m[1], postCount, firstPostId };
}

// epoch 초 → Asia/Seoul 기준 ISO 날짜. 포스타입은 한국 서비스라 발행일 표기도 KST 다.
// 고정 +09:00 오프셋으로 계산해 실행 환경 시간대에 흔들리지 않게 한다.
export function epochSecondsToKstDate(sec) {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec <= 0) return null;
  const d = new Date((sec + 9 * 3600) * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 2000 || year > 2100) return null;
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// 포스타입 포스트 페이지 → 포스트 1건 + 체인 링크. 포스트 상세 상태가 아니면 null.
export function parsePostypePost(html) {
  const joined = decodePostypePayload(html);
  if (!joined) return null;
  const m = joined.match(/"queryKey":\["CHANNEL","ID",\d+,"POST","DETAIL",(\d+),"INFO","KO"\]/);
  if (!m) return null;
  const data = stateDataBefore(joined, m.index);
  if (!data || typeof data !== "object") return null;
  if (!("prevPost" in data) && !("nextPost" in data) && !("publishedAt" in data)) return null;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const subTitle = typeof data.subTitle === "string" ? data.subTitle.trim() : "";
  const epoch =
    typeof data.publishedAt === "number"
      ? data.publishedAt
      : typeof data.firstPublishedAt === "number"
        ? data.firstPublishedAt
        : null;
  const chainId = (v) =>
    v && typeof v === "object" && Number.isInteger(v.postId) && v.postId > 0 ? v.postId : null;
  return {
    postId: m[1],
    title: title || subTitle,
    publishedAt: epochSecondsToKstDate(epoch),
    thumbnailUrl: coverProxy(data.thumbnail),
    prevPostId: chainId(data.prevPost),
    nextPostId: chainId(data.nextPost),
    seriesId:
      data.series && typeof data.series === "object" && data.series.seriesId != null
        ? String(data.series.seriesId)
        : null,
  };
}

// 포스타입 포스트 → TitleEpisode. number 는 체인 순서(1부터) — 포스타입 회차에는 별도
// 번호 필드가 없고 제목 끝의 "01" 같은 표기는 작품마다 달라 번호로 단정하지 않는다.
export function mapPostypeEpisode(post, number) {
  if (!post || typeof post !== "object") return null;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) return null;
  const episode = { number };
  if (typeof post.title === "string" && post.title.trim()) episode.title = post.title.trim();
  if (post.publishedAt) episode.publishedAt = post.publishedAt;
  if (post.thumbnailUrl) episode.thumbnailUrl = post.thumbnailUrl;
  return episode;
}

// ── 리디 ────────────────────────────────────────────────────────────────────
// 리디 열람 임베드는 붙이지 않는다 — ridibooks.com 이 X-Frame-Options: SAMEORIGIN 을 보내
// 타 오리진 iframe 을 브라우저가 차단하고, 뷰어는 계정·구매 상태 전제라 공식 임베드(oEmbed 등)
// 경로도 없다(2026-10-06 실측). 열람은 원 플랫폼 딥링크가 정직한 동선이다.
// 대신 회차 메타데이터는 작품(책) 페이지의 __NEXT_DATA__ 에 회차 목록 셀
// (BookDetailHomeEpisodeBookList)이 임베드돼 있어 공개 페이지 파싱으로 수집할 수 있다.
// 단 임베드는 첫 30건까지만이고, 다음 페이지는 /api 로 불러오며 robots.txt 가 /api/ 를
// 금지하므로 30건을 넘는 시리즈는 partial 로만 수집한다.

// 리디 regDate "2024.08.01." → ISO "2024-08-01". 형식이 엄격히 맞을 때만 변환한다.
export function parseRidiRegDate(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})\.?$/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// 리디 책 페이지 HTML → __NEXT_DATA__ 객체(scripts/crawlers/_shared.mjs extractNextData 와 동일 규약).
export function extractRidiNextData(html) {
  if (typeof html !== "string") return null;
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// 제목 끝의 권/화 번호("… 3권", "… 12화") — 리디 회차 제목의 통상 표기. 없으면 null.
function trailingVolumeNumber(title) {
  if (typeof title !== "string") return null;
  const m = title.trim().match(/(\d+)\s*(?:권|화)\s*$/);
  return m ? Number(m[1]) : null;
}

// 리디 __NEXT_DATA__ → { seriesId, books: [{ bookId, title, publishedAt, thumbnailUrl }], hasMore }.
// 회차 셀의 books 는 회차순(오래된 것부터)이다. 제목에 권/화 번호가 있으면 위치와 대조해
// 어긋나면 null — 번호를 지어내지 않는다. 셀이 없거나 깨졌으면 null.
export function parseRidiEpisodeList(nextData) {
  const cells = nextData?.props?.pageProps?.sectionProps?.gridQuery?.riGrid?.grid?.cells;
  if (!Array.isArray(cells)) return null;
  const cell = cells.find(
    (c) => c && typeof c === "object" && c.cell__BookDetailHomeEpisodeBookList,
  );
  const list = cell?.cell__BookDetailHomeEpisodeBookList;
  if (!list || !Array.isArray(list.books) || list.books.length === 0) return null;
  const books = [];
  for (const [i, raw] of list.books.entries()) {
    if (!raw || typeof raw !== "object" || raw.bookId == null) return null;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const volume = trailingVolumeNumber(title);
    if (volume !== null && volume !== i + 1) return null; // 위치와 번호가 어긋나면 수집하지 않는다
    const cover = raw.cover && typeof raw.cover === "object" ? raw.cover : {};
    const rawCover = (cover.xxlarge || cover.large || cover.small || "").split("#")[0];
    books.push({
      bookId: String(raw.bookId),
      title,
      publishedAt: parseRidiRegDate(raw.metadata?.regDate),
      thumbnailUrl: coverProxy(rawCover),
    });
  }
  return {
    seriesId: list.seriesId != null ? String(list.seriesId) : null,
    books,
    hasMore: Boolean(list.pagination && list.pagination.nextPage),
  };
}

// 리디 회차 책 → TitleEpisode. number 는 목록 위치(1부터) — parseRidiEpisodeList 가
// 제목 번호와 대조를 마친 순서다.
export function mapRidiEpisode(book, number) {
  if (!book || typeof book !== "object") return null;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) return null;
  const episode = { number };
  if (typeof book.title === "string" && book.title.trim()) episode.title = book.title.trim();
  if (book.publishedAt) episode.publishedAt = book.publishedAt;
  if (book.thumbnailUrl) episode.thumbnailUrl = book.thumbnailUrl;
  return episode;
}
