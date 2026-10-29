import type { StudioBg3dModelMetricPolicy } from "./studio-bg3d-model-metric-policy";

const PROVENANCE_KEY = "toonstudioSkpMetricImport";

interface ImportRoot {
  userData: Record<string, unknown>;
}

interface LoadedRoot {
  readonly userData: unknown;
  readonly children: readonly LoadedRoot[];
}

/** 등록되는 GLB의 extras에 넣는다. 장면 배치·편의 메타데이터 저장 실패와 독립인 자산의 출처 사실이다. */
export function markStudioBg3dSkpMetricImport<T extends { readonly root: ImportRoot }>(parsed: T): T {
  parsed.root.userData = {
    ...parsed.root.userData,
    [PROVENANCE_KEY]: { version: 1, sourceFormat: "skp", metricPolicy: "authored-metres" },
  };
  return parsed;
}

function policyFromUserData(value: unknown): StudioBg3dModelMetricPolicy | undefined {
  if (typeof value !== "object" || value === null || !(PROVENANCE_KEY in value)) return undefined;
  const source = value[PROVENANCE_KEY];
  return typeof source === "object" && source !== null
    && "version" in source && source.version === 1
    && "sourceFormat" in source && source.sourceFormat === "skp"
    && "metricPolicy" in source && source.metricPolicy === "authored-metres"
    ? "authored-metres" : undefined;
}

/** GLTFExporter가 한 루트를 감싸는 그룹만 따라간다. 혼합 자식 모델의 정책을 전체 모델에 확대하지 않는다. */
export function readStudioBg3dSkpMetricImport(root: LoadedRoot | undefined): StudioBg3dModelMetricPolicy | undefined {
  let current = root;
  for (let depth = 0; current && depth < 64; depth += 1) {
    const policy = policyFromUserData(current.userData);
    if (policy) return policy;
    current = current.children.length === 1 ? current.children[0] : undefined;
  }
  return undefined;
}
