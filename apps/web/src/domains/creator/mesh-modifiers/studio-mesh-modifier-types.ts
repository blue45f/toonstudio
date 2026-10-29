import type { StudioEditableMesh, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

export const STUDIO_MESH_MODIFIER_STACK_REVISION = 1 as const;

export type StudioMeshModifierKind =
  | "mirror"
  | "array"
  | "boolean"
  | "solidify"
  | "bevel"
  | "subdivision"
  | "weld"
  | "decimate"
  | "simple-deform";

export type StudioMeshBooleanOp = "union" | "difference" | "intersection";

export interface StudioMeshMirrorModifier {
  readonly kind: "mirror";
  readonly id: string;
  readonly enabled: boolean;
  readonly axis: "x" | "y" | "z";
  readonly merge: boolean;
  readonly mergeThreshold: number;
  readonly bisect: boolean;
  readonly clip: boolean;
}

export interface StudioMeshArrayModifier {
  readonly kind: "array";
  readonly id: string;
  readonly enabled: boolean;
  readonly count: number;
  readonly offset: StudioMeshVec3;
  readonly mode: "linear" | "radial";
  readonly radialAngleRad?: number;
  readonly realizeInstances: boolean;
  /** 미지정 문서는 기존 고정 간격과 직렬화 해시를 유지한다. */
  readonly useConstantOffset?: boolean;
  readonly useRelativeOffset?: boolean;
  readonly relativeOffset?: StudioMeshVec3;
}

export interface StudioMeshBooleanModifier {
  readonly kind: "boolean";
  readonly id: string;
  readonly enabled: boolean;
  readonly operation: StudioMeshBooleanOp;
  /** Stable cutter provenance for UI selection/rebinding; geometry remains self-contained below. */
  readonly operandAssetId?: string;
  /** Operand mesh serialized as triangle soup for solid commit. */
  readonly operand: {
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
  };
}

export interface StudioMeshSolidifyModifier {
  readonly kind: "solidify";
  readonly id: string;
  readonly enabled: boolean;
  readonly thickness: number;
  readonly evenThickness: boolean;
  readonly rim: boolean;
  /** 미지정은 기존 0..thickness 배치, 명시는 Blender 방식의 두께 중심이다. */
  readonly offset?: number;
}

export interface StudioMeshBevelModifier {
  readonly kind: "bevel";
  readonly id: string;
  readonly enabled: boolean;
  readonly amount: number;
  readonly segments: number;
  readonly angleLimitRad: number;
  readonly weightInfluence: number;
}

export interface StudioMeshSubdivisionModifier {
  readonly kind: "subdivision";
  readonly id: string;
  readonly enabled: boolean;
  readonly levels: number;
  readonly smooth: boolean;
}

export interface StudioMeshWeldModifier {
  readonly kind: "weld";
  readonly id: string;
  readonly enabled: boolean;
  readonly quantum: number;
}

export interface StudioMeshDecimateModifier {
  readonly kind: "decimate";
  readonly id: string;
  readonly enabled: boolean;
  readonly ratio: number;
}

export type StudioMeshSimpleDeformMode = "twist" | "taper" | "stretch";

export interface StudioMeshSimpleDeformModifier {
  readonly kind: "simple-deform";
  readonly id: string;
  readonly enabled: boolean;
  readonly mode: StudioMeshSimpleDeformMode;
  readonly axis: "x" | "y" | "z";
  /** twist rotation at the far end, radians. */
  readonly angleRad: number;
  /** taper scale at the far end (1 = untouched); stretch factor along the axis. */
  readonly factor: number;
}

export type StudioMeshModifier =
  | StudioMeshMirrorModifier
  | StudioMeshArrayModifier
  | StudioMeshBooleanModifier
  | StudioMeshSolidifyModifier
  | StudioMeshBevelModifier
  | StudioMeshSubdivisionModifier
  | StudioMeshWeldModifier
  | StudioMeshDecimateModifier
  | StudioMeshSimpleDeformModifier;

/** Exact JSON-safe DTO. Boolean typed arrays are deliberately encoded as dense number arrays. */
export type StudioMeshModifierDto =
  | {
      readonly kind: "mirror";
      readonly id: string;
      readonly enabled: boolean;
      readonly axis: "x" | "y" | "z";
      readonly merge: boolean;
      readonly mergeThreshold: number;
      readonly bisect: boolean;
      readonly clip: boolean;
    }
  | {
      readonly kind: "array";
      readonly id: string;
      readonly enabled: boolean;
      readonly count: number;
      readonly offset: StudioMeshVec3;
      readonly mode: "linear" | "radial";
      readonly radialAngleRad?: number;
      readonly realizeInstances: boolean;
      readonly useConstantOffset?: boolean;
      readonly useRelativeOffset?: boolean;
      readonly relativeOffset?: StudioMeshVec3;
    }
  | {
      readonly kind: "boolean";
      readonly id: string;
      readonly enabled: boolean;
      readonly operation: StudioMeshBooleanOp;
      readonly operandAssetId?: string;
      readonly operand: {
        readonly positions: readonly number[];
        readonly indices: readonly number[];
      };
    }
  | {
      readonly kind: "solidify";
      readonly id: string;
      readonly enabled: boolean;
      readonly thickness: number;
      readonly evenThickness: boolean;
      readonly rim: boolean;
      readonly offset?: number;
    }
  | {
      readonly kind: "bevel";
      readonly id: string;
      readonly enabled: boolean;
      readonly amount: number;
      readonly segments: number;
      readonly angleLimitRad: number;
      readonly weightInfluence: number;
    }
  | {
      readonly kind: "subdivision";
      readonly id: string;
      readonly enabled: boolean;
      readonly levels: number;
      readonly smooth: boolean;
    }
  | {
      readonly kind: "weld";
      readonly id: string;
      readonly enabled: boolean;
      readonly quantum: number;
    }
  | {
      readonly kind: "decimate";
      readonly id: string;
      readonly enabled: boolean;
      readonly ratio: number;
    }
  | {
      readonly kind: "simple-deform";
      readonly id: string;
      readonly enabled: boolean;
      readonly mode: StudioMeshSimpleDeformMode;
      readonly axis: "x" | "y" | "z";
      readonly angleRad: number;
      readonly factor: number;
    };

export interface StudioMeshModifierStackDto {
  readonly revision: typeof STUDIO_MESH_MODIFIER_STACK_REVISION;
  /** Array order is evaluation order and therefore part of the persisted authority. */
  readonly modifiers: readonly StudioMeshModifierDto[];
}

export type StudioMeshModifierStackSnapshot = StudioMeshModifierStackDto;

export interface StudioMeshModifierStack {
  readonly revision: typeof STUDIO_MESH_MODIFIER_STACK_REVISION;
  readonly source: StudioEditableMesh;
  readonly modifiers: readonly StudioMeshModifier[];
}

export type StudioMeshModifierFailureCode =
  | "boolean-empty"
  | "boolean-failed"
  | "budget-exceeded"
  | "invalid-parameter"
  | "invalid-stack";

export type StudioMeshModifierResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: StudioMeshModifierFailureCode;
      readonly detail: string;
      readonly diagnostics?: readonly string[];
    };

/** Solid boolean commit backend (Manifold-class contract). */
export interface StudioSolidBooleanBackend {
  boolean(input: {
    readonly left: { readonly positions: Float32Array; readonly indices: Uint32Array };
    readonly right: { readonly positions: Float32Array; readonly indices: Uint32Array };
    readonly operation: StudioMeshBooleanOp;
  }): Promise<{
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
    readonly diagnostic?: string;
  }>;
}
