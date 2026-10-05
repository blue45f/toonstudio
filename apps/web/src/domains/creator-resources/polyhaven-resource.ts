/**
 * polyhaven-resource.ts
 *
 * Poly Haven 전용 종류(kind) 판별과 카테고리 정의.
 *
 * 종류는 클라이언트 계약(CreatorResource)에 필드로 실리지 않는다. 서버 provider
 * (apps/api/src/modules/creator-resources/polyhaven-provider.ts의 normalize)가
 * 종류 라벨을 설명 문자열 끝의 메타 구간 첫머리에 합성해 넣는 것이 유일한 도달
 * 경로다: `[원문 설명, "HDRI · indoor · 최대 8K · 태그 …"].join(" · ")`.
 * 메타 구간은 항상 설명의 꼬리이고, 메타 안의 독립 구간 중 종류 라벨과 정확히
 * 일치하는 것은 종류 구간뿐이므로(분류는 일반 단어, 해상도는 "최대 …", 폴리곤은
 * "폴리곤 …", 태그는 "태그 …"로 시작한다) 뒤에서부터 찾은 첫 라벨 구간이 종류다.
 * 원문 설명에 같은 라벨이 독립 구간으로 우연히 들어 있어도, 꼬리의 메타가 이긴다.
 */
import type { CreatorResource } from "@/shared/lib/creator-resources";

export type PolyHavenKind = "hdri" | "texture" | "model";

/** 종류 라벨 — 서버 provider의 typeLabel과 같은 문자열을 쓴다. */
export const POLYHAVEN_KIND_LABELS: Record<PolyHavenKind, string> = {
  hdri: "HDRI",
  texture: "텍스처",
  model: "3D 모델",
};

const KIND_BY_LABEL: ReadonlyMap<string, PolyHavenKind> = new Map([
  ["HDRI", "hdri"],
  ["텍스처", "texture"],
  ["3D 모델", "model"],
]);

export interface PolyHavenCategory {
  kind: PolyHavenKind;
  /** 행 제목 옆 한 줄 설명. 종류 자체에 대한 사실만 적는다. */
  blurb: string;
  /**
   * 카테고리 검색어. 서버 검색의 해이스택에 종류 라벨이 포함돼 있어, 종류 라벨
   * 검색이 실제로 그 종류를 걸러 낸다. 타일 클릭 시 같은 검색을 실행한다.
   */
  query: string;
}

/** 시안 S4-03의 검색 전 카테고리 행 3종. */
export const POLYHAVEN_CATEGORIES: readonly PolyHavenCategory[] = [
  { kind: "hdri", blurb: "조명·반사를 결정하는 360° 환경 이미지", query: "HDRI" },
  { kind: "texture", blurb: "벽·바닥·천 같은 표면 질감 맵", query: "텍스처" },
  { kind: "model", blurb: "장면에 배치하는 소품·가구 모델", query: "3D 모델" },
];

/** 행·타일에 필요한 최소 실자료 수. 모자라면 행 자체를 만들지 않는다(위장 방지). */
export const POLYHAVEN_CATEGORY_TILE_COUNT = 4;

/**
 * 자료의 종류를 설명 메타에서 복원한다. 판별할 수 없으면 null — 모르는 종류를
 * 추측해서 배지를 달지 않는다.
 */
export function polyHavenKindOf(item: CreatorResource): PolyHavenKind | null {
  if (item.provider !== "polyhaven") return null;
  const segments = item.description.split(" · ");
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const kind = KIND_BY_LABEL.get(segments[index] ?? "");
    if (kind) return kind;
  }
  return null;
}

/** 결과 카드 장식 — Poly Haven 표면에서만 쓴다. HDRI 타일은 2:1 파노라마 비율. */
export function polyHavenCardDecoration(item: CreatorResource): { kindLabel: string | null; wideTile: boolean } {
  const kind = polyHavenKindOf(item);
  return {
    kindLabel: kind ? POLYHAVEN_KIND_LABELS[kind] : null,
    wideTile: kind === "hdri",
  };
}
