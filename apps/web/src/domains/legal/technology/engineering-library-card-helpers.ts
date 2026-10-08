import { externalLinkForName } from "./engineering-external-links";
import type { LibraryCard } from "./engineering-library-guide-types";

/**
 * 라이브러리 카드 화면이 쓰는 순수 도우미(컴포넌트 파일에서 함수를 내보내면 Fast Refresh 규칙에 걸려 따로 둔다).
 */

export interface LibraryOfficialLink {
  readonly name: string;
  readonly url: string;
}

/**
 * 카드 이름에서 공식 링크가 있는 부분만 모은다. 이름이 여러 부품을 " · " 로 묶은 경우(예: "Vello · ThorVG")
 * 부품마다 `engineering-external-links.ts` 레지스트리에서 찾고, 뒤에 붙은 괄호 설명("CanvasKit (Skia)")은 떼고 찾는다.
 * 레지스트리에 없는 이름은 링크 없이 지나간다 — 주소를 지어내지 않는다.
 */
export function officialLinksForName(name: string): readonly LibraryOfficialLink[] {
  const seen = new Set<string>();
  const links: LibraryOfficialLink[] = [];
  for (const raw of [name, ...name.split(" · ")]) {
    const trimmed = raw.trim();
    const bare = trimmed.replace(/\s*\([^)]*\)\s*$/u, "").trim();
    const url = externalLinkForName(trimmed) ?? externalLinkForName(bare);
    if (url && !seen.has(url)) {
      seen.add(url);
      links.push({ name: bare, url });
    }
  }
  return links;
}

/**
 * 사용 조건이 까다로운 라이선스(비상업·카피레프트·자체 라이선스)인지. 화면에서 눈에 띄게 표시하는 용도이며
 * 법률 판단이 아니다 — 적격성은 이 페이지가 결론 내지 않고 "별도 확인" 대상으로 남긴다.
 */
export function isLicenseCaution(license: string): boolean {
  return /CC-BY-NC|(?:^|[^A-Za-z])[AL]?GPL|MPL-|CeCILL|SSPL|BUSL|Remotion/iu.test(license);
}

export type LicenseBasisKind = "package" | "file" | "standard";

/** 라이선스 칸의 근거: 설치본 패키지, 저장소 안의 근거 파일, 또는 표준·서비스 조건. */
export function licenseBasis(card: LibraryCard): { readonly kind: LicenseBasisKind; readonly value: string } {
  if (card.package) return { kind: "package", value: card.package };
  if (card.licenseSource) return { kind: "file", value: card.licenseSource };
  return { kind: "standard", value: "" };
}

/** 오픈소스 지도 행으로 가는 주소(지도 표가 `#map-open-source-<행 id>` 앵커를 가진다). */
export function mapRowHref(rowId: string): string {
  return `/about/technology/atlas#map-open-source-${rowId}`;
}
