/** 엔진 객체와 독립된 3D 테마 계약이다. */
export type VirtualThreeAssetRecipeThemeId = 'parkbotanical' | 'fantasyguild' | 'sflab' | 'gothicarchive' | 'vehiclegarage' | 'cafefood';
export type VirtualThreeThemeId = 'creator-campus' | VirtualThreeAssetRecipeThemeId;
export type VirtualThreeThemePreviewState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly loaded: number; readonly total: number }
  | { readonly status: 'ready' }
  | { readonly status: 'error' };
export interface VirtualThreeThemeModelRefBundle {
  readonly source: 'bundle';
  readonly assetId: string;
  readonly expectedSha256: `sha256:${string}`;
  readonly byteLength: number;
  readonly catalogId: string;
}
export interface VirtualThreeThemeModelRefGenerated {
  readonly source: 'generated';
  readonly id: string;
  readonly url: string;
  /** 기존 generated metadata의 bare 64자리 값을 그대로 보존한다. */
  readonly sha256: string;
  readonly byteLength: number;
  /** 기존 metadata 항목 ID이며 새 권리 승인이나 검증 완료 증명은 아니다. */
  readonly provenanceId: string;
}
export type VirtualThreeThemeModelRef = VirtualThreeThemeModelRefBundle | VirtualThreeThemeModelRefGenerated;
export interface VirtualThreeSurfacePBR {
  readonly baseColor: `#${string}`;
  readonly roughness: number;
  readonly metalness: number;
}
export interface VirtualThreeThemeLighting {
  readonly ambientIlluminanceLux: number;
  readonly key: { readonly illuminanceLux: number; readonly temperatureKelvin: number; readonly azimuthDegrees: number; readonly elevationDegrees: number };
  readonly fill: { readonly illuminanceLux: number; readonly temperatureKelvin: number };
}
export type VirtualThreeLayoutRoleKind = 'workstation' | 'storage' | 'seating' | 'botanical' | 'enclosure' | 'focal-object' | 'tabletop' | 'accent';
export interface VirtualThreeLayoutRole {
  readonly id: string;
  readonly kind: VirtualThreeLayoutRoleKind;
  readonly modelAssetId: string;
  readonly count: number;
  readonly intent: { readonly ko: string; readonly en: string };
}
interface VirtualThreeThemeBase {
  readonly id: VirtualThreeThemeId;
  readonly version: 1;
  readonly copy: { readonly ko: { readonly name: string; readonly description: string }; readonly en: { readonly name: string; readonly description: string } };
}
/** 기존 3D 장면 보존 어댑터 계약이다. 빈 모델 역할 목록으로 기존 공간을 대신하지 않는다. */
export interface VirtualThreePreservedBaselineTheme extends VirtualThreeThemeBase {
  readonly id: 'creator-campus';
  readonly kind: 'preserved-baseline';
  readonly preservedAdapter: {
    readonly id: 'existing-creator-world-3d-v1';
    readonly manifestPolicy: 'preserve-current-manifest';
    readonly campus: {
      readonly architecture: 'existing-campus-architecture-v1';
      readonly dioramas: 'existing-campus-10-v1';
      readonly equipment: 'existing-campus-props-v1';
      readonly generatedProps: 'preserve-existing';
      readonly workstations: 'existing-campus-interactions-v1';
    };
    readonly otherWorlds: 'existing-manifest-architecture-and-workstations-v1';
    readonly coordinates: 'preserve-logical-world';
    readonly runtimeState: 'preserve-camera-presence-actors';
  };
}
export interface VirtualThreeAssetRecipeTheme extends VirtualThreeThemeBase {
  readonly id: VirtualThreeAssetRecipeThemeId;
  readonly kind: 'asset-recipe';
  readonly surfacePBR: { readonly floor: VirtualThreeSurfacePBR; readonly wall: VirtualThreeSurfacePBR; readonly trim: VirtualThreeSurfacePBR };
  readonly lighting: VirtualThreeThemeLighting;
  readonly modelAssetIds: readonly string[];
  /** 역할·개수만 선언한다. 좌표·충돌체·스폰·경로는 후속 배치 시스템 소유다. */
  readonly layoutRoles: readonly VirtualThreeLayoutRole[];
}
export type VirtualThreeTheme = VirtualThreePreservedBaselineTheme | VirtualThreeAssetRecipeTheme;
