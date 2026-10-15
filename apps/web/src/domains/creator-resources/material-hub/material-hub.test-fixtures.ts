/**
 * 문장 허브 테스트 전용 픽스처. 제품 코드에서 import 하지 않는다.
 * parseResource 가 제공처별 허용 호스트로 응답을 검증하므로 픽스처도 실제 제공처 호스트를 쓴다.
 */
import type { CreatorResource, ResourceProvider } from "@/shared/lib/creator-resources";

const HOSTS: Readonly<Partial<Record<ResourceProvider, { source: (n: number) => string; image?: (n: number) => string }>>> = {
  polyhaven: { source: (n) => `https://polyhaven.com/a/brick_${n}`, image: (n) => `https://cdn.polyhaven.com/asset_img/thumbs/brick_${n}.png?width=256&height=256` },
  ambientcg: { source: (n) => `https://ambientcg.com/a/Bricks${n}`, image: (n) => `https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/512-WEBP/Bricks${n}.webp` },
  met: { source: (n) => `https://www.metmuseum.org/art/collection/search/${n}`, image: (n) => `https://images.metmuseum.org/CRDImages/as/original/DP${n}.jpg` },
  aic: { source: (n) => `https://www.artic.edu/artworks/${n}`, image: (n) => `https://www.artic.edu/iiif/2/${n}/full/843,/0/default.jpg` },
  cleveland: { source: (n) => `https://www.clevelandart.org/art/${n}` },
  rijksmuseum: { source: (n) => `https://www.rijksmuseum.nl/en/collection/${n}` },
  vam: { source: (n) => `https://collections.vam.ac.uk/item/O${n}`, image: (n) => `https://framemark.vam.ac.uk/collections/${n}/full/!100,100/0/default.jpg` },
  internetarchive: { source: (n) => `https://archive.org/details/seoul-market-${n}` },
  wikimedia: { source: () => "https://ko.wikipedia.org/wiki/%EC%84%9C%EC%9A%B8" },
  smithsonian: { source: (n) => `https://www.si.edu/object/${n}` },
  europeana: { source: (n) => `https://www.europeana.eu/item/${n}` },
  dpla: { source: (n) => `https://dp.la/item/${n}` },
  kheritage: { source: (n) => `https://www.khs.go.kr/cha/${n}` },
  tourapi: { source: (n) => `https://korean.visitkorea.or.kr/detail/${n}` },
  korean: { source: (n) => `https://stdict.korean.go.kr/word/${n}` },
  metweather: { source: () => "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=37.5665&lon=126.978" },
  gbif: { source: (n) => `https://www.gbif.org/species/${n}` },
  googlefonts: { source: () => "https://fonts.google.com/specimen/Gaegu" },
};

const LICENSE_BY_PROVIDER: Readonly<Partial<Record<ResourceProvider, CreatorResource["license"]>>> = {
  polyhaven: "CC0", ambientcg: "CC0", met: "CC0", aic: "CC0", cleveland: "CC0", vam: "reference-only", metweather: "CC-BY-4.0",
};

function isFixtureProvider(value: string): value is ResourceProvider {
  return Object.prototype.hasOwnProperty.call(HOSTS, value);
}

/** 요청 URL 의 provider 파라미터. 픽스처가 모르는 제공처면 테스트가 잘못된 것이므로 던진다. */
export function providerParam(params: URLSearchParams): ResourceProvider {
  const value = params.get("provider") ?? "";
  if (!isFixtureProvider(value)) throw new Error(`테스트 픽스처가 모르는 제공처: ${value}`);
  return value;
}

export function hubItem(provider: ResourceProvider, n: number, extra: Partial<CreatorResource> = {}): CreatorResource {
  const hosts = HOSTS[provider];
  if (!hosts) throw new Error(`테스트 픽스처에 ${provider} 호스트가 없다`);
  const license = LICENSE_BY_PROVIDER[provider] ?? "metadata-only";
  return {
    id: `${provider}:item-${n}`,
    provider,
    title: `${provider} 자료 ${n}`,
    creator: `${provider} 제공 기관`,
    description: "소재 허브 테스트용 실제 응답 모양",
    sourceUrl: hosts.source(n),
    license,
    licenseUrl: "",
    credit: `${provider} credit`,
    fetchedAt: "2026-10-05T00:00:00.000Z",
    ...(hosts.image && (license === "CC0" || license === "reference-only") ? { imageUrl: hosts.image(n) } : {}),
    ...extra,
  };
}

export function searchBody(
  provider: ResourceProvider,
  items: readonly CreatorResource[],
  extra: { status?: string; page?: number; hasMore?: boolean; message?: string; total?: number } = {},
): Response {
  return Response.json({
    provider,
    page: extra.page ?? 1,
    status: extra.status ?? "ready",
    items,
    hasMore: extra.hasMore ?? false,
    message: extra.message ?? "공식 제공처 응답",
    fetchedAt: "2026-10-05T00:00:00.000Z",
    ...(extra.total !== undefined ? { total: extra.total } : {}),
  });
}

/** 제공처 검색 요청만 골라 URLSearchParams 로 돌려준다. */
export function searchRequests(calls: readonly (readonly unknown[])[]): URLSearchParams[] {
  return calls
    .map((call) => String(call[0]))
    .filter((url) => url.includes("/api/creator-resources/search"))
    .map((url) => new URL(url, "https://local.test").searchParams);
}

export function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}
