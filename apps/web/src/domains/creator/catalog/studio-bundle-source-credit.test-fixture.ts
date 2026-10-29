import { requireStudioBundleSourceCredit, type StudioBundleSourceCredit } from "./studio-bundle-source-credit";

export function studioBundleCreditFixture(overrides: Partial<StudioBundleSourceCredit> = {}): StudioBundleSourceCredit {
  return requireStudioBundleSourceCredit({
    schema: "toonstudio.bundle-source-credit.v1", assetId: "cbv1-008-park-bench-render",
    ledgerPackId: "cbv1-008-cute-park-pack", contentHash: `sha256:${"a".repeat(64)}`,
    renderPath: "/assets/studio/bundle-renders-v1/assets/cbv1-008-park-bench-render/prop.webp",
    sourceUrl: "https://rg-poly.itch.io/cute-park-pack", provider: "RG Poly",
    licenseId: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    licenseName: "CC0 1.0", serve: "allow", status: "public-domain",
    commercialUse: true, attributionRequired: false, ...overrides,
  });
}
