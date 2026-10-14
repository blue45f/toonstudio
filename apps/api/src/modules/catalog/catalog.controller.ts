import {
  Body,
  BadRequestException,
  Controller,
  HttpCode,
  Inject,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";

import { buildAffiliateUrl } from "@toonstudio/contracts/affiliate";
import { coverImagePolicy } from "../../../../../packages/core/src/catalog";
import { getAppConfig } from "../../server/app-config";

import { searchParamsFromBody } from "../../../../../packages/core/src/search-pagination";

import { CatalogService } from "./catalog.service";
import { resolveAffiliateDestination, resolveCoverFetchUrl } from "./catalog-url-policy";
import { transcodeCoverToWidth } from "./cover-transcode";

import type { Request, Response } from "express";

type QueryMap = Record<string, string | string[] | undefined>;

interface TitleQuery {
  ids?: string;
  q?: string;
  limit?: string | number;
  sort?: string;
}

interface ReviewLikePostPayload {
  picked?: unknown;
  seedId?: unknown;
  ratings?: unknown;
  reads?: unknown;
}

interface SearchQuery {
  page?: string;
  pageSize?: string;
  ids?: string;
  sort?: string;
  q?: string;
  types?: string;
  genres?: string;
  tags?: string;
  status?: string;
  platforms?: string;
  ages?: string;
  minRating?: string;
  yearMin?: string;
  yearMax?: string;
  freeOnly?: string;
  adaptedOnly?: string;
}

interface KmasBookAndWebtoonQuery {
  title?: string;
  isbn?: string;
  listSeCd?: string;
  pictrWritrNm?: string;
  sntncWritrNm?: string;
  pltfomCdNm?: string;
  plscmpnIdNm?: string;
  startDate?: string;
  endDate?: string;
  pageNo?: string;
  viewItemCnt?: string;
}

@Controller()
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Get("/cover")
  async proxyCover(
    @Query("u") rawUrl: string | undefined,
    @Res() res: Response,
    // 폭 힌트(w)와 협상 기준(요청 Accept)은 뒤에 붙인다 — 기존 호출·테스트의
    // 위치 인자(u, res) 계약을 깨지 않기 위해서다. 둘 다 없어도 기존 동작과 동일하다.
    @Query("w") rawWidth?: string,
    @Req() req?: Request
  ) {
    // 표지 정책이 off 면(저작권 킬스위치) 제3자 표지를 일절 중계하지 않는다 — 이미 배포·캐시된
    // 정적 JSON 의 /api/cover URL 도 여기서 무력화되고, 클라이언트는 타이포그래픽 커버로 폴백한다.
    if (coverImagePolicy() === "off") return res.status(404).send("cover image disabled");
    if (!rawUrl) return res.status(400).send("missing u");

    let url = resolveCoverFetchUrl(rawUrl);
    if (!url) return res.status(403).send("forbidden host");

    // 폭 힌트는 표준 폭 목록(클라이언트 cover-proxy.ts의 COVER_STANDARD_WIDTHS와 동기)
    // 안의 값만 인정한다. 목록 밖 값은 무시하고 원본을 서빙한다 — 임의 폭이 캐시 변형
    // 키를 무한히 만들지 못하게 하는 것도 캐시 정책의 일부다.
    const width = parseCoverWidth(rawWidth);
    // 포맷 협상: 업스트림에 제안할 포맷은 서버 고정값이 아니라 최종 클라이언트가
    // 선언한 Accept에서 도출한다. AVIF를 디코딩 못 하는 클라이언트에게 협상력 있는
    // 업스트림이 AVIF 바이트를 주는 사고를 막기 위해서다.
    const upstreamAccept = coverUpstreamAccept(req?.headers?.accept);

    try {
      let upstream: globalThis.Response | null = null;
      for (let hop = 0; hop < 4; hop++) {
        // Referer 를 플랫폼 도메인으로 위조하지 않는다(핫링크 보호 우회 금지). 원본 CDN 이
        // 핫링크를 거부하면 그 거부를 존중해 표지를 표시하지 않고 타이포그래픽 커버로 폴백한다.
        const response = await fetch(url, {
          headers: {
            "User-Agent": COVER_USER_AGENT,
            Accept: upstreamAccept,
            // 폭 힌트는 클라이언트 힌트(Width)로 업스트림에 전달한다 — 수용하는 CDN은
            // 그 폭으로 내려주고 무시하는 CDN은 원본을 준다. 힌트가 무시돼 큰
            // JPEG/PNG가 도착한 경우는 아래 서빙 단계에서 서버가 직접 줄인다
            // (cover-transcode.ts — image-js 기반, WebP/AVIF·GIF는 원본 중계).
            ...(width ? { Width: String(width) } : {}),
          },
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) return res.status(502).send("bad redirect");
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, url);
          } catch {
            return res.status(502).send("bad redirect");
          }
          const nextFetchUrl = resolveCoverFetchUrl(nextUrl.toString());
          if (!nextFetchUrl) return res.status(403).send("forbidden redirect");
          url = nextFetchUrl;
          continue;
        }
        upstream = response;
        break;
      }

      if (!upstream) return res.status(502).send("too many redirects");
      if (!upstream.ok) return res.status(502).send("upstream error");

      const headerType = upstream.headers.get("content-type") ?? "";
      const body = await readCoverBody(upstream);
      if (!body) return res.status(502).send("cover too large");
      // 헤더가 이미지 타입이거나 매직바이트가 이미지면 통과. 일부 CDN(예: 네이버 확장자 없는 썸네일)은
      // 실제 이미지를 application/octet-stream 으로 응답하므로 헤더만 신뢰하지 않고 바이트로 판별한다.
      const sniffed = sniffImageType(body);
      if (!COVER_OK_TYPE.test(headerType) && !sniffed) {
        return res.status(415).send("not an image");
      }
      // 서버 픽셀 변환: 폭이 지정됐는데 업스트림이 더 큰 JPEG/PNG를 줬으면 그 폭으로
      // 줄여서 낸다(카드 폭에 맞는 바이트만 수신되게). 변환 불가·불필요하면 원본 중계.
      const servedType = sniffed ?? headerType;
      const transcoded = width ? transcodeCoverToWidth(body, servedType, width) : null;
      const servedBody = transcoded?.body ?? body;
      res.setHeader("Content-Type", transcoded?.contentType ?? servedType);
      // 표지는 제3자 저작물이라 권리침해 신고·정책 변경(킬스위치) 시 빠르게 빠져야 한다 →
      // immutable 을 쓰지 않고 재검증 가능한 캐시로 둔다(브라우저 1시간·엣지 1일·SWR 1일).
      // (2026-10-14 확인 기록: 이 정책은 의도된 값이며 변경하지 않는다. 폭 변형은 URL의
      // w 파라미터가 그대로 캐시 키가 되어 변형별로 분리 캐시된다.)
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400");
      // 응답 포맷이 요청 Accept 협상의 결과일 수 있으므로, 공용 캐시가 Accept가 다른
      // 클라이언트에게 협상 결과를 공유하지 않게 Vary 를 명시한다.
      res.setHeader("Vary", "Accept");
      return res.status(200).send(servedBody);
    } catch {
      return res.status(502).send("fetch failed");
    }
  }

  @Get("/config")
  @Header("Cache-Control", "no-store")
  async getConfig() {
    return getAppConfig();
  }

  @Get("/random")
  @Header("Cache-Control", "no-store")
  getRandom(@Query() query: QueryMap) {
    return this.catalogService.getRandomData(normalizeQueryMap(query));
  }

  @Get("/home")
  @Header("Cache-Control", "no-store, max-age=0")
  async getHome() {
    return this.catalogService.getHomeData();
  }

  @Get("/calendar")
  @Header("Cache-Control", "no-store, max-age=0")
  async getCalendar() {
    return this.catalogService.getCalendarData();
  }

  @Get("/insights")
  @Header("Cache-Control", "no-store")
  async getInsights() {
    return this.catalogService.getInsightsData();
  }

  @Get("/ranking")
  @Header("Cache-Control", "no-store, max-age=0")
  async getRanking(@Query() query: QueryMap) {
    return this.catalogService.getRankingData(normalizeQueryMap(query));
  }

  @Get("/explore")
  @Header("Cache-Control", "no-store")
  async getExplore(@Query() query: QueryMap) {
    return this.catalogService.getExploreData(normalizeQueryMap(query));
  }

  @Get("/tags")
  @Header("Cache-Control", "no-store")
  async getTags() {
    return this.catalogService.getTagCloud();
  }

  @Get("/authors")
  @Header("Cache-Control", "no-store")
  async getAuthors() {
    return this.catalogService.getAuthorDirectory();
  }

  @Get("/search")
  @Header("Cache-Control", "no-store, max-age=0")
  async getSearch(@Query() query: SearchQuery) {
    return this.catalogService.getSearchData(query);
  }

  // Large saved collections are submitted in the body instead of leaking into URLs.
  // The common session/CSRF boundary still applies; this route has no write side effects.
  @Post("/search")
  @HttpCode(200)
  @Header("Cache-Control", "no-store, max-age=0")
  async postSearch(@Body() body: unknown) {
    let query: SearchQuery;
    try {
      query = Object.fromEntries(searchParamsFromBody(body));
    } catch (error) {
      throw new BadRequestException({ error: error instanceof Error ? error.message : "Invalid search query" });
    }
    return this.catalogService.getSearchData(query);
  }

  @Get("/kmas/book-webtoons")
  @Header("Cache-Control", "no-store, max-age=0")
  async getKmasBookAndWebtoons(@Query() query: KmasBookAndWebtoonQuery) {
    return this.catalogService.getKmasBookAndWebtoonData(query);
  }

  @Post("/kmas/merge-on-access")
  @HttpCode(200)
  @Header("Cache-Control", "no-store, max-age=0")
  async mergeKmasOnAccess(@Query("force") force?: string) {
    return this.catalogService.mergeKmasOnSiteAccess({ force: force === "1" || force === "true" });
  }

  @Post("/recommend")
  @Header("Cache-Control", "no-store, max-age=0")
  async postRecommend(@Body() body: ReviewLikePostPayload) {
    return this.catalogService.getRecommendData(body);
  }

  @Get("/titles")
  @Header("Cache-Control", "no-store, max-age=0")
  async listTitles(@Query() query: TitleQuery) {
    return this.catalogService.getTitles(query);
  }

  @Get("/titles/:id")
  @Header("Cache-Control", "no-store")
  async getTitleDetail(@Param("id") id: string) {
    const data = await this.catalogService.getTitleDetail(id);
    if (!data) throw new NotFoundException("not_found");
    return data;
  }

  @Get("/titles/:id/reviews")
  @Header("Cache-Control", "no-store, max-age=0")
  async getTitleReviews(@Param("id") id: string) {
    return this.catalogService.getTitleReviews(id);
  }

  @Get("/authors/:name")
  @Header("Cache-Control", "no-store")
  async getAuthor(@Param("name") name: string) {
    const data = await this.catalogService.getAuthorData(name);
    if (!data) throw new NotFoundException("not_found");
    return data;
  }

  @Get("/go/:platformId")
  @Header("Cache-Control", "no-store, max-age=0")
  async redirectAffiliate(
    @Param("platformId") platformId: string,
    @Query("to") toUrl: string | undefined,
    @Req() req: Request,
    @Res() res: Response
  ) {
    if (!toUrl) {
      return res.status(400).send("missing destination url ('to')");
    }
    const destination = resolveAffiliateDestination(platformId, toUrl);
    if (!destination) return res.status(400).send("unsupported destination url");

    const referrer = req.headers["referer"] || "direct";
    const userAgent = req.headers["user-agent"] || "unknown";
    const timestamp = new Date().toISOString();
    console.log(`[Affiliate Click] platform=${platformId} timestamp=${timestamp} to=${toUrl} referrer=${referrer} ua=${userAgent}`);

    const finalUrl = buildAffiliateUrl(platformId, destination);
    res.redirect(302, finalUrl);
  }
}

function normalizeQueryMap(query: QueryMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === "string") out[key] = first;
    } else if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

// 표지 1장의 중계 상한. 실측 표지는 수십~수백 KB라 10MiB면 넉넉하고, 그보다 큰 응답은
// 표지가 아니라 오류 페이지·악성 대형 파일로 보고 중계하지 않는다(메모리 고갈 방지).
const COVER_MAX_BYTES = 10 * 1024 * 1024;

const COVER_OK_TYPE = /^image\/(jpeg|jpg|png|webp|avif|gif)\b/i;
const COVER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// 표지 표준 폭 — 웹 클라이언트(apps/web/src/shared/lib/cover-proxy.ts의
// COVER_STANDARD_WIDTHS)와 반드시 동기 상태로 유지한다. 여기 없는 폭은 변형으로
// 인정하지 않는다(캐시 변형 키 폭증 방지).
const COVER_STANDARD_WIDTHS: readonly number[] = [160, 320, 480, 640, 960];

// w 쿼리 값을 표준 폭으로 해석한다. Express 쿼리는 배열·객체일 수 있어 문자열만
// 받고, 숫자 형식이거나 목록 밖이면 undefined(폭 힌트 없음=원본 서빙)로 떨어진다.
export function parseCoverWidth(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return undefined;
  const width = Number(value);
  return COVER_STANDARD_WIDTHS.includes(width) ? width : undefined;
}

// 업스트림에 제안할 Accept를 최종 클라이언트의 Accept에서 도출한다(포맷 협상).
// 클라이언트가 AVIF/WebP를 선언했을 때만 그 포맷을 제안하고, Accept 헤더 자체가
// 없으면(브라우저가 아닌 소비자) 기존 고정 제안과 동일하게 최신 포맷까지 제안한다.
export function coverUpstreamAccept(clientAccept: string | undefined): string {
  if (!clientAccept) return "image/avif,image/webp,image/*,*/*;q=0.8";
  const accept = clientAccept.toLowerCase();
  if (accept.includes("image/avif")) return "image/avif,image/webp,image/*,*/*;q=0.8";
  if (accept.includes("image/webp")) return "image/webp,image/*,*/*;q=0.8";
  return "image/*,*/*;q=0.8";
}

// 업스트림 본문을 상한까지만 읽는다. 선언된 Content-Length가 상한을 넘으면 본문을 아예
// 읽지 않고, 길이를 속이거나 청크 응답이면 누적량이 상한을 넘는 순간 읽기를 중단한다.
// 상한 초과 시 null — 호출부는 502로 거절한다.
async function readCoverBody(response: globalThis.Response): Promise<Buffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > COVER_MAX_BYTES) return null;
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > COVER_MAX_BYTES ? null : buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > COVER_MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// 응답 바이트의 매직넘버로 이미지 포맷 판별 (헤더가 octet-stream/누락이어도 실제 이미지면 인식).
// HTML 에러페이지 등 비이미지는 null → 415 유지.
function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}
