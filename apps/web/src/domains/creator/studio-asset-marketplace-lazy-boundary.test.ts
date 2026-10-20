import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./StudioAssetMenuPanel.tsx", import.meta.url),
  "utf8"
);
// 지연 경계 모듈: 로더·Lazy 쌍은 크기 래칫 때문에 이 파일로 분리됐다.
// 패널이 초기 그래프 밖에 있다는 계약은 두 파일을 함께 봐야 성립한다.
const boundarySource = readFileSync(
  new URL(
    "./asset-menu/studio-asset-marketplace-lazy-panels.tsx",
    import.meta.url
  ),
  "utf8"
);
const loadingFallbackSource = source.slice(
  source.indexOf("function StudioAssetMarketplaceLoading()"),
  source.indexOf("export interface StudioAssetMenuPanelProps")
);

describe("Studio asset marketplace lazy boundary", () => {
  it("keeps all marketplace panels out of the initial asset-menu module graph", () => {
    // \b 가 없으면 Lazy 접두사가 붙은 래퍼 import(LazyStudio…)까지 걸린다.
    // 패널 본체의 정적 import만 금지하는 것이 이 계약의 의도다.
    expect(source).not.toMatch(
      /import\s+\{[^}]*\bStudioCommunityMarketplacePanel\b[^}]*\}\s+from/u
    );
    expect(source).not.toMatch(
      /import\s+\{[^}]*\bStudioCreatorPackMarketplacePanel\b[^}]*\}\s+from/u
    );
    expect(source).not.toMatch(
      /import\s+\{[^}]*\bStudioOriginalAssetMarketplacePanel\b[^}]*\}\s+from/u
    );
    expect(boundarySource).not.toMatch(
      /import\s+\{[^}]*\bStudioCommunityMarketplacePanel\b[^}]*\}\s+from/u
    );
    expect(boundarySource).not.toMatch(
      /import\s+\{[^}]*\bStudioCreatorPackMarketplacePanel\b[^}]*\}\s+from/u
    );
    expect(boundarySource).not.toMatch(
      /import\s+\{[^}]*\bStudioOriginalAssetMarketplacePanel\b[^}]*\}\s+from/u
    );
    // 동적 import 문자열을 그대로 쓰면 경계 스캐너가 테스트 파일의
    // 문자열까지 import로 세므로, 같은 문자열을 정규식으로 단언한다.
    expect(boundarySource).toMatch(
      /import\("\.\.\/StudioCommunityMarketplacePanel"\)/u
    );
    expect(boundarySource).toMatch(
      /import\("\.\.\/StudioCreatorPackMarketplacePanel"\)/u
    );
    expect(boundarySource).toMatch(
      /import\("\.\.\/StudioOriginalAssetMarketplacePanel"\)/u
    );
    expect(boundarySource).toContain("createStudioIntentLazyLoader");
    expect(boundarySource).toContain("lazyRetry");
  });

  it("preloads on intent and retains an accessible, stable loading surface", () => {
    expect(source).toContain("onPointerEnter={preloadStudioAssetMarketplacePanels}");
    expect(source).toContain("onPointerDown={preloadStudioAssetMarketplacePanels}");
    expect(source).toContain("onFocus={preloadStudioAssetMarketplacePanels}");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('data-studio-asset-marketplace-loading="true"');
    expect(source).toContain('data-studio-asset-marketplace-skeleton-row=');
    expect(source).toContain("motion-reduce:animate-none");
    expect(loadingFallbackSource).not.toContain("animate-spin");
    expect(loadingFallbackSource).not.toContain("Loader2");
    expect(source).toContain('data-studio-asset-marketplace-lazy-boundary="true"');
  });
});
