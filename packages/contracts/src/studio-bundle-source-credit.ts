import { z } from "zod";

export const STUDIO_BUNDLE_SOURCE_CREDIT_SCHEMA = "toonstudio.bundle-source-credit.v1" as const;
export const STUDIO_BUNDLE_CC0_DEED = "https://creativecommons.org/publicdomain/zero/1.0/";
const safeText = (maximum: number) => z.string().min(1).max(maximum).refine((value) =>
  value === value.trim() && ![...value].some((character) => {
    const point = character.codePointAt(0) ?? 0;
    return point < 32 || (point >= 127 && point <= 159);
  }));

function publicHttps(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash ? url : null;
  } catch { return null; }
}

export function isPublicStudioBundleSourceUrl(value: string): boolean {
  const url = publicHttps(value);
  if (!url) return false;
  return (/^[a-z0-9][a-z0-9-]*\.itch\.io$/u.test(url.hostname)
    && /^\/[a-z0-9][a-z0-9-]*\/?$/u.test(url.pathname)
    && !/^\/(download|private|dashboard|api)(\/|$)/u.test(url.pathname))
    || (url.hostname === "itch.io" && /^\/b\/\d+\/[a-z0-9][a-z0-9-]*\/?$/u.test(url.pathname));
}

/** 공개 증빙의 참조를 담은 기록이며 서명된 이용 허락이나 구매 영수증은 아니다. */
export const StudioBundleSourceCreditSchema = z.object({
  schema: z.literal(STUDIO_BUNDLE_SOURCE_CREDIT_SCHEMA),
  assetId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,199}$/u),
  ledgerPackId: z.string().regex(/^(?:cbv1-[0-9]{3}-[a-z0-9-]{1,180}|rg-poly-food-pack)$/u),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  renderPath: z.string().max(512).regex(/^\/assets\/studio\/(?:bundle-renders-v1\/assets\/[a-z0-9-]+\/(?:prop|background)|bundle-scenes-v1\/[a-z0-9-]+)\.webp$/u),
  sourceUrl: safeText(512).refine(isPublicStudioBundleSourceUrl),
  provider: safeText(80),
  licenseId: safeText(160),
  licenseUrl: safeText(512).refine((value) => publicHttps(value) !== null).nullable(),
  licenseName: safeText(160),
  serve: z.literal("allow"),
  status: z.enum(["licensed", "public-domain"]),
  commercialUse: z.literal(true),
  attributionRequired: z.literal(false),
}).strict().superRefine((credit, context) => {
  if (![ `/assets/studio/bundle-renders-v1/assets/${credit.assetId}/prop.webp`, `/assets/studio/bundle-scenes-v1/${credit.assetId}.webp` ].includes(credit.renderPath)) {
    context.addIssue({ code: "custom", message: "번들 렌더 경로와 소재 ID가 일치하지 않습니다." });
  }
  const cc0 = credit.licenseId.toLowerCase() === "cc0-1.0";
  if (cc0 !== (credit.status === "public-domain") || (cc0 && credit.licenseUrl !== STUDIO_BUNDLE_CC0_DEED)) {
    context.addIssue({ code: "custom", message: "번들 라이선스와 원장 판정·공식 deed가 일치하지 않습니다." });
  }
});

export type StudioBundleSourceCredit = z.infer<typeof StudioBundleSourceCreditSchema>;

export function parseStudioBundleSourceCredit(value: unknown): StudioBundleSourceCredit | null {
  const parsed = StudioBundleSourceCreditSchema.safeParse(value);
  return parsed.success ? Object.freeze(parsed.data) : null;
}

export function requireStudioBundleSourceCredit(value: unknown): StudioBundleSourceCredit {
  const credit = parseStudioBundleSourceCredit(value);
  if (!credit) throw new TypeError("번들 렌더의 출처·권리·콘텐츠 해시 기록이 올바르지 않습니다.");
  return credit;
}

export function hasValidStudioBundleSceneCredit(type: string, props: Record<string, unknown>, candidates: Iterable<[string, unknown]> = []): boolean {
  for (const [key, value] of candidates) {
    if ((key === "base:bundleSourceCredit" || key === "prop:bundleSourceCredit") && !parseStudioBundleSourceCredit(value)) return false;
  }
  return !Object.hasOwn(props, "bundleSourceCredit") || ((type === "frame" || (type === "reference" && props.elementType === "image")) && parseStudioBundleSourceCredit(props.bundleSourceCredit) !== null);
}
