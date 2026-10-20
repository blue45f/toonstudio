import { z } from "zod";

/**
 * Unity 공간 배경 업로드의 경계 계약.
 *
 * 공간 정의가 배경을 가리키는 참조는 `uploads/<assetId>.glb`
 * 형태 하나뿐이다 (studio-unity-space-layout.dto의 background.glb
 * 패턴과 쌍). assetId는 서버가 발급하는 UUID라, 정의만 읽어서는
 * 다른 작품의 배경을 추측할 수 없고 임의 URL도 실을 수 없다.
 */

export const UnitySpaceBackgroundWorkParamsSchema = z.object({
  workId: z.string().trim().min(1).max(128),
});
export type UnitySpaceBackgroundWorkParams = z.infer<
  typeof UnitySpaceBackgroundWorkParamsSchema
>;

export const UnitySpaceBackgroundAssetParamsSchema = z.object({
  workId: z.string().trim().min(1).max(128),
  assetId: z.string().uuid(),
});
export type UnitySpaceBackgroundAssetParams = z.infer<
  typeof UnitySpaceBackgroundAssetParamsSchema
>;

export interface UnitySpaceBackgroundDto {
  assetId: string;
  /** 공간 정의 background.glb에 싣는 정본 참조 (`uploads/<assetId>.glb`). */
  glbRef: string;
  fileName: string;
  byteSize: number;
  sha256: string;
  uploadedByUserId: string;
  createdAt: string;
}

export function unitySpaceBackgroundRef(assetId: string): string {
  return `uploads/${assetId}.glb`;
}
