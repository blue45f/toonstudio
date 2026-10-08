/**
 * 뷰어 페이지(`window.__kitPreview`)와 CLI(Playwright) 사이의 요청·응답 형식(순수 타입).
 * 모든 값은 JSON으로 왕복 가능해야 한다(Playwright `page.evaluate` 경계). 실패는 예외 대신 `ok:false`와 LabFailure로 돌려준다.
 */
import type { LabFailure } from "../../contracts";
import type { SceneFeatureState } from "../scene-features";
import type { KitPreviewColorKey, KitPreviewMorphAssignment, KitPreviewPoseRequest, KitPreviewQuality, KitPreviewShading, KitPreviewToonOverrides, KitPreviewViewId } from "./cli-args";
import type { PreviewSourceKind } from "./kit-plan-adapter";
import type { StaticReport } from "./summary";
import type { PreviewWarning } from "./warnings";

export type { LabFailure };

export const KIT_PREVIEW_API_VERSION = 2;

export interface KitPreviewFileRef {
  /** 페이지가 fetch할 주소(CLI의 임시 정적 서버) */
  readonly url: string;
  /** 보고서에 쓸 이름(보통 파일 이름) */
  readonly label: string;
  /** CLI가 디스크의 원본에서 계산한 SHA-256(소문자 hex). 엔진이 받은 바이트를 이 값으로 검증한다(검증을 끄지 않는다). */
  readonly sha256: string;
  /** CLI가 잰 바이트 수. 엔진이 받은 바이트 수를 이 값과 대조한다. */
  readonly bytes: number;
}

/** 어느 소스 경로로 올렸는지(요약 JSON `sourceKind`) */
export interface KitPreviewSourceInfo {
  readonly kind: PreviewSourceKind;
  /** 판정 근거(한글) */
  readonly reasonKo: string;
  /** `--legacy-merge`로 강제했는지 */
  readonly forced: boolean;
}

export interface KitPreviewLoadRequest {
  /** 첫 번째 = 베이스 */
  readonly files: readonly KitPreviewFileRef[];
  readonly colors: Readonly<Partial<Record<KitPreviewColorKey, string>>>;
  readonly roleOverrides: Readonly<Record<string, string>>;
  readonly hairLod: number;
  readonly morphs: readonly KitPreviewMorphAssignment[];
  readonly pose: KitPreviewPoseRequest;
  readonly quality: KitPreviewQuality;
  /** 툰 셰이딩 덮어쓰기(렌더 때 적용). 없는 값은 소스 종류별 기본값. */
  readonly toon: KitPreviewToonOverrides;
  /** true면 키트 이름 자동 감지를 건너뛰고 기존 병합(package) 경로를 쓴다 */
  readonly legacyMerge: boolean;
  /** true면 엔진을 만들지 않고 정적 검사·병합 점검까지만 한다 */
  readonly inspectOnly: boolean;
  /** 엔진 생성·셰이더 준비 대기 상한(ms) */
  readonly timeoutMs: number;
}

export interface RuntimePartRow {
  readonly id: string;
  readonly partId: number;
  readonly role: string;
  readonly materialPreset: string;
  readonly materialClass: string;
  readonly triangles: number;
  readonly vertices: number;
  readonly morphTargets: number;
  readonly skinned: boolean;
  readonly hasAlbedoTexture: boolean;
  readonly visible: boolean;
  readonly forceHidden: boolean;
  readonly colorHex: string;
}

export interface KitPreviewRuntimeReport {
  /** 소스 경로와 무결성 검증 사실(엔진이 바이트 수·SHA-256을 플랜과 대조했다) */
  readonly source: KitPreviewSourceInfo & { readonly integrityVerified: boolean };
  /** 툰 모드에 실제로 쓰는 셰이딩(소스 종류별 기본값 + CLI 덮어쓰기) */
  readonly toon: { readonly rampSteps: number; readonly rim: boolean; readonly outline: string; readonly faceSdfShadow: boolean };
  readonly engine: { readonly backend: string; readonly engineVersion: string; readonly renderer: string | null };
  readonly rig: {
    readonly poseConvention: string;
    readonly boneCount: number;
    readonly humanoidBoneCount: number;
    readonly auxiliaryBoneCount: number;
    readonly skeletonBoneCount: number;
    readonly morphNameCount: number;
    readonly notes: readonly string[];
  };
  readonly parts: readonly RuntimePartRow[];
  readonly morph: {
    readonly requested: number;
    readonly applied: Readonly<Record<string, number>>;
    readonly expanded: readonly string[];
    readonly unknown: ReadonlyArray<{ readonly name: string; readonly candidates: readonly string[] }>;
  };
  readonly pose: { readonly id: string; readonly bonesSet: number; readonly skippedBones: readonly string[]; readonly framingScale: number };
  /** 엔진의 장면 기능 가용성(CSM·SSS·IBL·morph 텍스처 모드 등) */
  readonly features: Readonly<Record<string, SceneFeatureState>> | null;
  readonly timingsMs: { readonly engineCreate: number; readonly prepare: number; readonly loadSource: number; readonly apply: number };
}

export type KitPreviewLoadResult =
  | { readonly ok: true; readonly source: KitPreviewSourceInfo; readonly report: StaticReport; readonly runtime: KitPreviewRuntimeReport | null; readonly warnings: readonly PreviewWarning[] }
  | {
      readonly ok: false;
      readonly stage: "fetch" | "prepare" | "engine" | "load";
      readonly failure: LabFailure;
      /** 소스 종류를 판정하기 전에 실패했으면 null */
      readonly source: KitPreviewSourceInfo | null;
      readonly report: StaticReport | null;
      readonly warnings: readonly PreviewWarning[];
    };

export interface KitPreviewRenderRequest {
  readonly view: KitPreviewViewId;
  readonly shading: KitPreviewShading;
  readonly size: number;
  readonly transparent: boolean;
  readonly background: string;
  readonly quality: KitPreviewQuality;
  /** 셰이더 컴파일 대기 상한(ms). 소프트웨어 렌더러는 PBR 한 변종에 수 초~10초 이상 걸린다. */
  readonly timeoutMs: number;
}

export interface KitPreviewRenderOk {
  readonly ok: true;
  readonly view: KitPreviewViewId;
  readonly shading: KitPreviewShading;
  readonly width: number;
  readonly height: number;
  /** PNG(base64, data URL 접두 없음) */
  readonly png: string;
  /** 준비 대기(셰이더 컴파일 등)에 쓴 시간 */
  readonly readyMs: number;
  /** 마지막 프레임 렌더 + 읽기 + PNG 인코딩 시간 */
  readonly renderMs: number;
  /** 배경과 다른(투명이면 알파 > 0인) 픽셀의 비율 0..1 */
  readonly coverage: number;
  readonly notes: readonly string[];
  readonly warnings: readonly PreviewWarning[];
  readonly hud: { readonly drawCalls: number; readonly activeMeshes: number; readonly triangles: number } | null;
}

export type KitPreviewRenderResult = KitPreviewRenderOk | { readonly ok: false; readonly view: KitPreviewViewId; readonly shading: KitPreviewShading; readonly failure: LabFailure; readonly warnings: readonly PreviewWarning[] };

export interface KitPreviewApi {
  readonly version: typeof KIT_PREVIEW_API_VERSION;
  load(request: KitPreviewLoadRequest): Promise<KitPreviewLoadResult>;
  render(request: KitPreviewRenderRequest): Promise<KitPreviewRenderResult>;
  dispose(): Promise<void>;
}
