import type { AuthoredIndexEntry } from "../../../../domains/authored/package-index";
import type { AuthoredPackageLoadResult, PackageIndexLoadResult } from "../../../../domains/authored/package-load-flow";

export interface PackagePanelLoader {
  loadIndex(): Promise<PackageIndexLoadResult>;
  loadPackage(entry: AuthoredIndexEntry, options: { readonly preferredLod?: number }): Promise<AuthoredPackageLoadResult>;
}

/** 브라우저 기본 로더: 두 *.browser 모듈을 지연 import한다(별도 청크). */
export const browserPackageLoader: PackagePanelLoader = {
  loadIndex: () => import("../../../../domains/authored/package-index.browser").then((module) => module.loadCharacterPackageIndex()),
  loadPackage: (entry, options) => import("../../../../domains/authored/package-loader.browser").then((module) => module.loadAuthoredPackage(entry, options)),
};
