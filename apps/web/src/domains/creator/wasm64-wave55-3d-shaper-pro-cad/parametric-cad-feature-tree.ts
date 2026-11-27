/**
 * Wave 55 3D 셰이퍼+ 비파괴 파라메트릭 CAD 히스토리 트리.
 *
 * - 과거 단계의 치수(벽체 높이, 창문 폭, 베벨 반경 등)를 수정하면 전체 솔리드를
 *   결정론적으로 재평가하고 단계별 수밀 감사(`ParametricFeatureStepAudit`)를 기록한다.
 */

import {
  booleanSolidOperation,
  type BooleanSolidOperationKind,
} from "./bsp-csg-boolean-solver";
import { auditSolidManifoldIntegrity } from "./cad-manifold-integrity-audit";
import {
  type CadSolidMesh,
  type SolidManifoldAuditReport,
} from "./cad-manifold-primitives";
import {
  extrudeSketchPushPull,
  type FaceInsetExtrudeInput,
  insetExtrudePlanarFace,
  loftCrossSectionsSolid,
  type LoftSolidInput,
  type PushPullExtrudeInput,
  revolveProfileSolid,
  type RevolveProfileInput,
} from "./direct-sketch-pushpull-manifold-kernel";
import {
  applyParametricEdgeBevel,
  type BoxSolidPrimitiveInput,
  createBoxSolidPrimitive,
  type ParametricEdgeBevelInput,
  type SolidTransformInput,
  transformSolidMesh,
} from "./parametric-fillet-chamfer-csg-kernel";

export type CadFeatureNode =
  | {
      readonly featureId: string;
      readonly kind: "sketch-extrude";
      readonly enabled?: boolean;
      readonly params: PushPullExtrudeInput;
    }
  | {
      readonly featureId: string;
      readonly kind: "revolve";
      readonly enabled?: boolean;
      readonly params: RevolveProfileInput;
    }
  | {
      readonly featureId: string;
      readonly kind: "loft";
      readonly enabled?: boolean;
      readonly params: LoftSolidInput;
    }
  | {
      readonly featureId: string;
      readonly kind: "inset-extrude";
      readonly enabled?: boolean;
      readonly params: FaceInsetExtrudeInput;
    }
  | {
      readonly featureId: string;
      readonly kind: "edge-bevel";
      readonly enabled?: boolean;
      readonly params: ParametricEdgeBevelInput;
    }
  | {
      readonly featureId: string;
      readonly kind: "boolean-csg";
      readonly enabled?: boolean;
      readonly params: {
        readonly operation: BooleanSolidOperationKind;
        readonly operand:
          | { readonly primitive: "box"; readonly box: BoxSolidPrimitiveInput }
          | { readonly primitive: "sketch-extrude"; readonly extrude: PushPullExtrudeInput };
        readonly groundToFloorY0?: boolean;
      };
    }
  | {
      readonly featureId: string;
      readonly kind: "transform";
      readonly enabled?: boolean;
      readonly params: SolidTransformInput;
    };

export type CadFeatureParamsByKind = {
  [Node in CadFeatureNode as Node["kind"]]: Node["params"];
};

export interface ParametricFeatureStepAudit {
  readonly featureId: string;
  readonly kind: CadFeatureNode["kind"];
  readonly skipped: boolean;
  readonly triangleCount: number;
  readonly signedVolumeM3: number;
  readonly isWatertight: boolean;
}

export interface ParametricTreeEvaluationResult {
  readonly solid: CadSolidMesh;
  readonly audit: SolidManifoldAuditReport;
  readonly steps: readonly ParametricFeatureStepAudit[];
  readonly deterministicHash: string;
}

function computeDeterministicMeshHash(solid: CadSolidMesh): string {
  let hash = 0x811c9dc5;
  const mix = (val: number): void => {
    const quantized = Math.round(val * 1e4);
    hash ^= quantized & 0xffffffff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  };
  mix(solid.vertices.length);
  mix(solid.triangles.length);
  mix(solid.signedVolumeM3);
  for (const v of solid.vertices) {
    mix(v[0]);
    mix(v[1]);
    mix(v[2]);
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * 비파괴 파라메트릭 CAD 히스토리 트리.
 * 과거 단계의 치수(벽체 높이, 창문 폭, 베벨 반경 등)를 수정하면 전체 솔리드를 결정론적으로 재평가한다.
 */
export class ParametricCadFeatureTree {
  private readonly features: CadFeatureNode[];

  constructor(initialFeatures: readonly CadFeatureNode[] = []) {
    this.features = [...initialFeatures];
  }

  addFeature(node: CadFeatureNode): this {
    if (this.features.some((f) => f.featureId === node.featureId)) {
      throw new Error(`이미 존재하는 피처 ID입니다: ${node.featureId}`);
    }
    this.features.push(node);
    return this;
  }

  updateFeatureParams<K extends CadFeatureNode["kind"]>(
    featureId: string,
    kind: K,
    updater: (prev: CadFeatureParamsByKind[K]) => CadFeatureParamsByKind[K],
  ): this {
    const idx = this.features.findIndex((f) => f.featureId === featureId);
    if (idx < 0) throw new Error(`피처를 찾을 수 없습니다: ${featureId}`);
    const target = this.features[idx];
    if (!target || target.kind !== kind) {
      throw new Error(`피처 종류가 일치하지 않습니다: ${featureId}`);
    }
    const prevParams = target.params as CadFeatureParamsByKind[K];
    const nextParams = updater(prevParams);
    this.features[idx] = {
      ...target,
      params: nextParams,
    } as CadFeatureNode;
    return this;
  }

  toggleFeature(featureId: string, enabled: boolean): this {
    const idx = this.features.findIndex((f) => f.featureId === featureId);
    if (idx < 0) throw new Error(`피처를 찾을 수 없습니다: ${featureId}`);
    const target = this.features[idx];
    if (target) this.features[idx] = { ...target, enabled };
    return this;
  }

  removeFeature(featureId: string): this {
    const idx = this.features.findIndex((f) => f.featureId === featureId);
    if (idx >= 0) this.features.splice(idx, 1);
    return this;
  }

  getFeatures(): readonly CadFeatureNode[] {
    return this.features.slice();
  }

  evaluate(): ParametricTreeEvaluationResult {
    let current: CadSolidMesh | null = null;
    const steps: ParametricFeatureStepAudit[] = [];

    for (const node of this.features) {
      if (node.enabled === false) {
        steps.push({
          featureId: node.featureId,
          kind: node.kind,
          skipped: true,
          triangleCount: current?.triangles.length ?? 0,
          signedVolumeM3: current?.signedVolumeM3 ?? 0,
          isWatertight: current ? auditSolidManifoldIntegrity(current).isWatertight : false,
        });
        continue;
      }

      if (node.kind === "sketch-extrude") {
        current = extrudeSketchPushPull(node.params);
      } else if (node.kind === "revolve") {
        current = revolveProfileSolid(node.params);
      } else if (node.kind === "loft") {
        current = loftCrossSectionsSolid(node.params);
      } else {
        if (!current) {
          throw new Error(`선행 베이스 솔리드 없이 수정 피처(${node.featureId})를 평가할 수 없습니다.`);
        }
        if (node.kind === "inset-extrude") {
          current = insetExtrudePlanarFace(current, node.params);
        } else if (node.kind === "edge-bevel") {
          current = applyParametricEdgeBevel(current, node.params).solid;
        } else if (node.kind === "transform") {
          current = transformSolidMesh(current, node.params);
        } else {
          const operandSolid =
            node.params.operand.primitive === "box"
              ? createBoxSolidPrimitive(node.params.operand.box)
              : extrudeSketchPushPull(node.params.operand.extrude);
          current = booleanSolidOperation(current, operandSolid, node.params.operation, {
            id: `${current.id}-${node.featureId}`,
            groundToFloorY0: node.params.groundToFloorY0 ?? false,
          });
        }
      }

      const stepAudit = auditSolidManifoldIntegrity(current);
      steps.push({
        featureId: node.featureId,
        kind: node.kind,
        skipped: false,
        triangleCount: current.triangles.length,
        signedVolumeM3: current.signedVolumeM3,
        isWatertight: stepAudit.isWatertight,
      });
    }

    if (!current) {
      throw new Error("활성화된 CAD 피처가 없어 솔리드를 평가할 수 없습니다.");
    }
    const finalAudit = auditSolidManifoldIntegrity(current);
    return {
      solid: current,
      audit: finalAudit,
      steps,
      deterministicHash: computeDeterministicMeshHash(current),
    };
  }
}
