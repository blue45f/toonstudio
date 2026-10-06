// 회차 메타데이터 크롤러 — 작품별 회차 목록(번호·제목·공개일·썸네일)을 공개 메타데이터만
// 수집해 apps/api/data/title-episodes.json 에 { [titleId]: TitleEpisodeEntry } 로 저장한다.
// 카탈로그 크롤(scripts/crawl.mjs)·관련 정보 크롤(scripts/crawl-related-info.mjs)과 같은 규약:
// 개별 목적지 API만 호출, additive(실패해도 기존 항목 유지), resumable(신선한 수집분 스킵),
// 레이트리밋, 원자적 저장. 컷 이미지 본문은 수집하지 않는다 — 썸네일 URL만 다룬다.
//
// 사용:
//   node scripts/crawl-episodes.mjs                      # naver-webtoon 인기순 상위 50개(기본), 신선분 스킵
//   node scripts/crawl-episodes.mjs --limit 200          # 상위 200개
//   node scripts/crawl-episodes.mjs --id nw-758037       # 특정 작품만
//   node scripts/crawl-episodes.mjs --platform postype   # 포스타입(공개 포스트 페이지 체인 추적)
//   node scripts/crawl-episodes.mjs --platform ridi      # 리디(책 페이지 임베드 회차 목록, 첫 30건까지)
//   node scripts/crawl-episodes.mjs --refresh            # 신선도와 무관하게 다시 수집
//   node scripts/crawl-episodes.mjs --max-episodes 100   # 작품당 최신 100화까지만(부분 수집 표시)
//   node scripts/crawl-episodes.mjs --dry-run            # 수집·집계만 하고 파일은 쓰지 않음
//
// 60,234개 전량은 비현실적이라 인기 상위부터 additive 로 넓혀간다(카탈로그·관련 정보와 동일 전략).
// 플랫폼이 차단하면 우회하지 않고 실패로 기록한다 — 도달 불가 판정은 impl 기록의 도달 표를 본다.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import {
  extractRidiNextData,
  mapNaverArticlePage,
  mapPostypeEpisode,
  mapRidiEpisode,
  mergeEpisodePages,
  parsePostypePost,
  parsePostypeSeriesMeta,
  parseRidiEpisodeList,
} from "./episode-parse.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_GZ = join(ROOT, "apps/api/data/catalog.json.gz");
const OUT = join(ROOT, "apps/api/data/title-episodes.json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const args = process.argv.slice(2);
function argVal(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
function argNum(name, def, { min = 0 } = {}) {
  const raw = argVal(name, null);
  if (raw === null) return def; // 미지정 — Number("")가 0이 되어 기본값을 삼키는 것을 막는다
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? n : def;
}
const PLATFORM = argVal("--platform", "naver-webtoon");
const LIMIT = argNum("--limit", 50, { min: 1 });
const ONLY_ID = argVal("--id", null);
const REFRESH = args.includes("--refresh");
const DRY_RUN = args.includes("--dry-run");
const DELAY_MS = argNum("--delay", 700); // 요청 간 예의상 간격(관련 정보 크롤과 동일 기본값)
const MAX_AGE_DAYS = argNum("--max-age-days", 7);
const MAX_EPISODES = argNum("--max-episodes", 0); // 0 = 무제한

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 플랫폼별 수집기 ──────────────────────────────────────────────────────────
// extractTarget: 카탈로그 작품 → 플랫폼 수집 대상(못 뽑으면 null = 이 플랫폼 수집 대상 아님)
// fetchEpisodes: 회차 전 페이지 수집. 실패하면 null(호출측이 기존 항목을 유지한다).

function naverExternalId(title) {
  const m = /^nw-(\d+)$/.exec(title.id ?? "");
  if (!m) return null;
  // availability 에 실제 네이버 웹툰 진입점이 있는 작품만 — id 접두사만으로 단정하지 않는다.
  const ok = (title.availability ?? []).some((a) => a.platformId === "naver-webtoon");
  return ok ? m[1] : null;
}

async function fetchJson(url, headers) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    clearTimeout(to);
    return r.ok ? await r.json() : null;
  } catch {
    clearTimeout(to);
    return null;
  }
}

async function fetchHtml(url, referer) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer, Accept: "text/html" },
      signal: ctl.signal,
    });
    clearTimeout(to);
    return r.ok ? await r.text() : null;
  } catch {
    clearTimeout(to);
    return null;
  }
}

// 네이버 웹툰 회차 목록 — crawl.mjs 가 연재 시작 연도 추출에 쓰는 것과 같은 공개 API.
// 최신 회차부터(DESC) 페이지 단위로 끝까지 받는다. 중간 페이지가 실패하면 부분 수집으로
// 확정하지 않고 실패(null)로 돌려 기존 데이터를 지키는 쪽을 택한다.
async function fetchNaverEpisodes(titleId) {
  const headers = { "User-Agent": UA, Referer: "https://comic.naver.com/", Accept: "application/json" };
  const pages = [];
  let totalPages = 1;
  let totalRows = null;
  for (let page = 1; page <= totalPages; page++) {
    const payload = await fetchJson(
      `https://comic.naver.com/api/article/list?titleId=${encodeURIComponent(titleId)}&page=${page}&sort=DESC`,
      headers,
    );
    const mapped = mapNaverArticlePage(payload);
    if (!mapped) return null;
    pages.push(mapped);
    totalPages = mapped.totalPages;
    totalRows = mapped.totalRows;
    const collected = mergeEpisodePages(pages).length;
    if (MAX_EPISODES > 0 && collected >= MAX_EPISODES) {
      const episodes = mergeEpisodePages(pages).slice(-MAX_EPISODES);
      return { episodes, totalEpisodes: totalRows ?? episodes.length, partial: page < totalPages };
    }
    if (page < totalPages) await sleep(DELAY_MS);
  }
  const episodes = mergeEpisodePages(pages);
  return { episodes, totalEpisodes: totalRows ?? episodes.length, partial: false };
}

// 포스타입: 카탈로그 id(pt-<seriesId>)와 availability URL(/@<handle>/series/<seriesId>)이
// 일치할 때만 대상으로 삼는다 — 핸들은 URL에서만 얻을 수 있다.
function postypeTarget(title) {
  const m = /^pt-(\d+)$/.exec(title.id ?? "");
  if (!m) return null;
  const av = (title.availability ?? []).find((a) => a.platformId === "postype");
  if (!av || typeof av.url !== "string") return null;
  const um = /^https:\/\/www\.postype\.com\/@([\w-]+)\/series\/(\d+)\/?$/.exec(av.url.trim());
  if (!um || um[2] !== m[1]) return null;
  return { handle: um[1], seriesId: m[1] };
}

const POSTYPE_CHAIN_SAFETY_CAP = 2000; // 체인 추적 폭주 방지 상한(초과 시 partial).

// 포스타입 회차 수집 — 시리즈 페이지 임베드 상태로 첫 포스트와 총수를 확정하고,
// 공개 포스트 페이지를 nextPost 체인으로 따라가며 모은다. 중간 페이지가 실패하면
// 부분 수집으로 확정하지 않고 실패(null)로 돌린다(네이버와 동일 원칙).
// 체인이 자연 종료했는데 플랫폼 총수보다 적으면(비공개 포스트 등) partial 로 기록한다.
// --max-episodes 는 체인이 첫 화부터라 최신이 아닌 오래된 쪽부터 캡이 걸린다.
async function fetchPostypeEpisodes({ handle, seriesId }) {
  const origin = "https://www.postype.com";
  const seriesUrl = `${origin}/@${handle}/series/${seriesId}`;
  const seriesHtml = await fetchHtml(seriesUrl, `${origin}/`);
  if (!seriesHtml) return null;
  const meta = parsePostypeSeriesMeta(seriesHtml);
  if (!meta || meta.seriesId !== seriesId) return null;
  const cap = MAX_EPISODES > 0 ? MAX_EPISODES : meta.postCount;
  const want = Math.min(meta.postCount, cap, POSTYPE_CHAIN_SAFETY_CAP);
  const episodes = [];
  const visited = new Set();
  let postId = meta.firstPostId;
  while (postId !== null && episodes.length < want) {
    if (visited.has(postId)) return null; // 체인 순환 — 구조 이상으로 보고 실패 처리
    visited.add(postId);
    const html = await fetchHtml(`${origin}/@${handle}/post/${postId}`, seriesUrl);
    if (!html) return null;
    const post = parsePostypePost(html);
    if (!post || post.postId !== String(postId)) return null;
    if (post.seriesId && post.seriesId !== seriesId) return null;
    const episode = mapPostypeEpisode(post, episodes.length + 1);
    if (!episode) return null;
    episodes.push(episode);
    postId = post.nextPostId;
    if (postId !== null && episodes.length < want) await sleep(DELAY_MS);
  }
  if (episodes.length === 0) return null;
  return { episodes, totalEpisodes: meta.postCount, partial: episodes.length < meta.postCount };
}

// 리디: 카탈로그 id(rd-<bookId>)와 availability 에 리디 진입점이 있을 때만 대상.
function ridiExternalId(title) {
  const m = /^rd-(\d+)$/.exec(title.id ?? "");
  if (!m) return null;
  const ok = (title.availability ?? []).some((a) => a.platformId === "ridi");
  return ok ? m[1] : null;
}

// 리디 회차 수집 — 책 페이지 __NEXT_DATA__ 의 회차 목록 셀(첫 30건)을 파싱한다.
// 다음 페이지는 /api 전용(robots 금지)이라 hasMore 면 partial 로 기록하고,
// 플랫폼 총수를 알 수 없으므로 totalEpisodes 를 비운다(지어내지 않는다).
async function fetchRidiEpisodes(bookId) {
  const html = await fetchHtml(`https://ridibooks.com/books/${encodeURIComponent(bookId)}`, "https://ridibooks.com/");
  if (!html) return null;
  const list = parseRidiEpisodeList(extractRidiNextData(html));
  if (!list || list.books.length === 0) return null;
  let episodes = list.books.map((book, i) => mapRidiEpisode(book, i + 1)).filter((ep) => ep !== null);
  if (episodes.length === 0) return null;
  let partial = list.hasMore;
  let totalEpisodes = list.hasMore ? undefined : episodes.length;
  if (MAX_EPISODES > 0 && episodes.length > MAX_EPISODES) {
    episodes = episodes.slice(0, MAX_EPISODES);
    partial = true;
    // 전체를 임베드로 확정한 경우에만 총수를 유지한다.
    if (list.hasMore) totalEpisodes = undefined;
  }
  return { episodes, totalEpisodes, partial };
}

const PLATFORMS = {
  "naver-webtoon": { extractTarget: naverExternalId, fetchEpisodes: fetchNaverEpisodes },
  postype: { extractTarget: postypeTarget, fetchEpisodes: fetchPostypeEpisodes },
  ridi: { extractTarget: ridiExternalId, fetchEpisodes: fetchRidiEpisodes },
};

// 인기 지표 — 관련 정보 크롤과 동일한 산식(스칼라 stats 기준).
function popScore(t) {
  const s = t.stats || {};
  return (s.views || 0) + (s.likes || 0) * 5 + (s.bookmarks || 0) * 4 + (s.ratingCount || 0) * 3;
}

function loadCatalogTitles() {
  if (!existsSync(CATALOG_GZ)) {
    console.error(`카탈로그가 없습니다: ${CATALOG_GZ} — 먼저 카탈로그 스냅샷을 준비하세요.`);
    process.exit(1);
  }
  const parsed = JSON.parse(gunzipSync(readFileSync(CATALOG_GZ)).toString("utf8"));
  const titles = Array.isArray(parsed) ? parsed : parsed?.titles;
  if (!Array.isArray(titles)) {
    console.error("카탈로그에서 titles 배열을 찾지 못했습니다.");
    process.exit(1);
  }
  return titles;
}

function loadSnapshot() {
  if (!existsSync(OUT)) return {};
  try {
    const parsed = JSON.parse(readFileSync(OUT, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    // 손상된 스냅샷을 만나면 조용히 덮어쓰지 않는다 — 크래시로 알리고 사람이 확인/삭제하게.
    console.error(`기존 스냅샷(${OUT}) 파싱 실패 — 손상 가능. 확인 후 삭제하거나 복구하세요.\n`, e);
    process.exit(1);
  }
}

// 원자적 저장: tmp 에 쓰고 rename(카탈로그 ingest 와 동일). 중단 시 truncated 파일이 남지 않게.
function persist(data) {
  if (DRY_RUN) return;
  mkdirSync(dirname(OUT), { recursive: true });
  const sorted = {};
  for (const k of Object.keys(data).sort()) sorted[k] = data[k]; // 결정성(diff 안정)
  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, JSON.stringify(sorted, null, 0));
  renameSync(tmp, OUT);
}

function isFresh(entry) {
  if (!entry || typeof entry.crawledAt !== "string") return false;
  const at = Date.parse(entry.crawledAt);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < MAX_AGE_DAYS * 86_400_000;
}

async function main() {
  const platform = PLATFORMS[PLATFORM];
  if (!platform) {
    console.error(
      `미구현 플랫폼입니다: ${PLATFORM}. 구현된 플랫폼: ${Object.keys(PLATFORMS).join(", ")} ` +
        `(도달 가능성은 impl-episode-crawl.md 의 플랫폼 도달 표를 확인하세요.)`,
    );
    process.exit(2);
  }

  const titles = loadCatalogTitles();
  const existing = loadSnapshot();

  const targets = ONLY_ID
    ? titles.filter((t) => t.id === ONLY_ID)
    : [...titles]
        .filter((t) => platform.extractTarget(t) !== null)
        .sort((a, b) => popScore(b) - popScore(a))
        .slice(0, LIMIT);
  if (targets.length === 0) {
    console.error("대상 작품이 없습니다. --id 또는 --platform 을 확인하세요.");
    process.exit(1);
  }
  console.log(
    `회차 수집 시작 — 플랫폼 ${PLATFORM}, 대상 ${targets.length}개` +
      `${DRY_RUN ? " (dry-run: 파일을 쓰지 않음)" : ""}, 간격 ${DELAY_MS}ms`,
  );

  let done = 0;
  let collected = 0;
  let skipped = 0;
  let failed = 0;
  for (const title of targets) {
    const prev = existing[title.id];
    if (!REFRESH && !ONLY_ID && isFresh(prev)) {
      skipped += 1;
      continue; // resumable — 신선한 수집분은 건너뜀
    }
    const target = platform.extractTarget(title);
    if (target === null) {
      failed += 1;
      continue;
    }
    const result = await platform.fetchEpisodes(target);
    done += 1;
    if (result && result.episodes.length > 0) {
      existing[title.id] = {
        episodes: result.episodes,
        totalEpisodes: result.totalEpisodes,
        crawledAt: new Date().toISOString(),
        source: PLATFORM,
        ...(result.partial ? { partial: true } : {}),
      };
      collected += 1;
    } else {
      failed += 1; // 실패·빈 결과 — 기존 항목이 있으면 그대로 유지한다
    }
    if (done % 10 === 0) {
      console.log(`  [${done}/${targets.length}] ${title.title} — 누적 수집 ${collected}, 실패 ${failed}`);
      persist(existing); // 중간 저장(원자적) — 중단돼도 진행분 보존
    }
    await sleep(DELAY_MS);
  }

  persist(existing);
  console.log(
    `완료: 시도 ${done}개, 수집 ${collected}개, 신선분 스킵 ${skipped}개, 실패 ${failed}개. ` +
      `총 ${Object.keys(existing).length}개 작품 데이터.${DRY_RUN ? " (dry-run — 파일 미기록)" : ` → ${OUT}`}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
