/**
 * 브라우저에서 실행하는 ONNX 모델 자산의 라이선스 현황.
 * 라이브러리 목록(engineering-license-inventory.ts)과 분리해 파일 크기 래칫을 지키며,
 * 기존 import 경로는 engineering-license-inventory.ts의 재수출로 그대로 유지된다.
 */
import type { LocalizedText } from "./engineering-story-content";

export interface EngineeringModelAssetLicense {
  readonly file: string;
  readonly license: string;
  readonly bytes: number;
  readonly rightsStatus: "declared-permissive" | "restricted" | "unverified";
  readonly role: LocalizedText;
  readonly note?: LocalizedText;
}

/**
 * 브라우저에서 실행하는 ONNX 모델 자산. 각 항목은 자산 옆의 .LICENSE.md 고지를
 * 근거로 하며, 고지가 없는 모델은 이 표에 넣지 않는다. 모델 파일은
 * apps/web/src/domains/creator/assets/에 있고 SHA-256 다이제스트로 검증한다.
 */
export const ENGINEERING_MODEL_ASSET_LICENSES: readonly EngineeringModelAssetLicense[] = [
  {
    file: "u2netp.onnx",
    license: "Apache-2.0",
    rightsStatus: "declared-permissive",
    bytes: 4574861,
    role: { ko: "일반 피사체 분리와 배경 제거", en: "General subject separation and background removal" },
  },
  {
    file: "tag2pix.onnx",
    license: "Non-commercial; redistribution restricted",
    rightsStatus: "restricted",
    bytes: 79269994,
    role: { ko: "선화에 색 태그를 조건으로 채색", en: "Colorizing line art conditioned on color tags" },
    note: { ko: "2026-11-05 확인: 원본 README는 구현 코드를 MIT로 두지만 release 가중치는 비상업 목적이며 재배포를 제한한다. ONNX 변환은 이 제한을 해소하지 않는다. 별도 허가 또는 동등 대체 검증 전 상용 배포 차단 사항이다.", en: "Reviewed 2026-11-05: the upstream README puts the implementation code under MIT but restricts release weights to non-commercial use and restricts redistribution. ONNX conversion does not resolve these terms. Commercial distribution remains blocked pending separate permission or a verified equivalent replacement." },
  },
  {
    file: "teed.onnx",
    license: "MIT",
    rightsStatus: "declared-permissive",
    bytes: 248429,
    role: { ko: "사진과 참조 이미지에서 선(엣지) 추출", en: "Extracting edges (line art) from photos and references" },
  },
  {
    file: "realesrgan-anime-6b.onnx",
    license: "BSD-3-Clause",
    rightsStatus: "declared-permissive",
    bytes: 17939941,
    role: { ko: "일러스트·애니메이션 4배 업스케일", en: "4x upscaling for illustrations and animation" },
  },
  {
    file: "animegan2-paprika.onnx",
    license: "Unresolved upstream terms",
    rightsStatus: "unverified",
    bytes: 8702673,
    role: { ko: "풍경·컷 전반의 애니메이션풍 변환", en: "Anime-style conversion for scenery and whole cuts" },
    note: { ko: "2026-11-05 확인: 원본 AnimeGANv2 README의 비상업 조건과 PyTorch 포트의 MIT 주장이 충돌한다. Paprika는 원본 가중치 변환본이며 코드의 MIT만으로 해당 가중치의 상용 권리를 확정할 수 없다. 별도 상용 허가는 미확인이다.", en: "Reviewed 2026-11-05: the original AnimeGANv2 README non-commercial terms conflict with the PyTorch port MIT claim. Paprika is converted from the original weights; the code MIT license does not establish commercial rights for those weights. Separate commercial authorization is unconfirmed." },
  },
  {
    file: "animegan2-face-paint-512-v2.onnx",
    license: "MIT (repository checkpoint)",
    rightsStatus: "declared-permissive",
    bytes: 8702673,
    role: { ko: "인물 사진의 애니메이션풍 얼굴 변환", en: "Anime-style face conversion for portraits" },
    note: { ko: "2026-11-05 확인: 별도 학습 모델의 체크포인트가 저자 관리 저장소에서 root MIT와 함께 배포되는 근거에 따른 분류다. 학습 출처는 일부만 공개돼 추가 검토하며, Paprika의 비상업 조건이 자동 적용된다고 단정하지 않는다.", en: "Reviewed 2026-11-05: this classification follows the separately trained checkpoint being distributed with the root MIT license in the author's maintained repository. Training provenance is partially documented and remains under review; Paprika's non-commercial terms are not automatically applied." },
  },
];
