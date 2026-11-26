export type NegotiatedImageFormat = "avif" | "webp" | "original";
export type ImageWidthBucket = 320 | 640 | 960 | 1280 | 1920;

export interface ImageFormatMap {
  readonly AVIF: "avif";
  readonly WEBP: "webp";
  readonly ORIGINAL: "original";
}

export interface NegotiatedAssetCandidate {
  readonly pathname: string;
  readonly key: string;
  readonly format: NegotiatedImageFormat;
  readonly bucket: ImageWidthBucket | null;
  readonly contentType: string | null;
  readonly isOriginal: boolean;
  readonly headers: Readonly<Record<string, string>>;
}

export interface NegotiatedAssetPlan {
  readonly pathname: string | null;
  readonly negotiable: boolean;
  readonly preferredFormat: NegotiatedImageFormat;
  readonly widthBucket: ImageWidthBucket | null;
  readonly contentHashed: boolean;
  readonly vary: string | null;
  readonly cacheControl: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly candidates: readonly NegotiatedAssetCandidate[];
}

export type FetchVariantFn = (
  candidate: NegotiatedAssetCandidate,
  request: Request,
) => Promise<Response | null | undefined> | Response | null | undefined;

export const IMAGE_FORMATS: Readonly<ImageFormatMap>;
export const IMAGE_WIDTH_BUCKETS: readonly [320, 640, 960, 1280, 1920];
export const IMAGE_DPR_MIN: 1;
export const IMAGE_DPR_MAX: 3;
export const IMAGE_FORMAT_HEADER: "X-ToonStudio-Image-Format";
export const IMAGE_BUCKET_HEADER: "X-ToonStudio-Image-Bucket";
export const IMMUTABLE_IMAGE_CACHE_CONTROL: "public, max-age=31536000, immutable";
export const REVALIDATE_IMAGE_CACHE_CONTROL: "public, max-age=3600, stale-while-revalidate=86400";

export function negotiateImageFormat(acceptHeader?: string | null): NegotiatedImageFormat;
export function normalizeImageWidthBucket(
  rawWidth?: number | string | null,
  rawDpr?: number | string | null,
): ImageWidthBucket | null;
export function isContentHashedAssetPath(pathname: string): boolean;
export function buildNegotiatedAssetCandidates(
  pathname: string,
  acceptHeader?: string | null,
  dpr?: number | string | null,
  width?: number | string | null,
): NegotiatedAssetPlan;
export function serveNegotiatedStaticImage(request: Request, fetchVariantFn: FetchVariantFn): Promise<Response>;
