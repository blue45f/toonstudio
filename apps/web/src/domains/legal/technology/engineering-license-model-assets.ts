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
    bytes: 4574861,
    role: { ko: "일반 피사체 분리와 배경 제거", en: "General subject separation and background removal" },
  },
  {
    file: "tag2pix.onnx",
    license: "MIT",
    bytes: 79269994,
    role: { ko: "선화에 색 태그를 조건으로 채색", en: "Colorizing line art conditioned on color tags" },
  },
  {
    file: "teed.onnx",
    license: "MIT",
    bytes: 248429,
    role: { ko: "사진과 참조 이미지에서 선(엣지) 추출", en: "Extracting edges (line art) from photos and references" },
  },
  {
    file: "realesrgan-anime-6b.onnx",
    license: "BSD-3-Clause",
    bytes: 17939941,
    role: { ko: "일러스트·애니메이션 4배 업스케일", en: "4x upscaling for illustrations and animation" },
  },
  {
    file: "animegan2-paprika.onnx",
    license: "MIT",
    bytes: 8702673,
    role: { ko: "풍경·컷 전반의 애니메이션풍 변환", en: "Anime-style conversion for scenery and whole cuts" },
    note: { ko: "가중치는 MIT 라이선스 배포본(bryandlee/animegan2-pytorch)을 직접 변환했다. 원본 TensorFlow 저장소에는 라이선스 파일이 없어, 권리 근거는 채택한 배포본의 MIT로 한정한다.", en: "Weights were converted directly from the MIT-licensed distribution (bryandlee/animegan2-pytorch). The original TensorFlow repository ships no license file, so the rights basis is limited to the adopted distribution's MIT license." },
  },
  {
    file: "animegan2-face-paint-512-v2.onnx",
    license: "MIT",
    bytes: 8702673,
    role: { ko: "인물 사진의 애니메이션풍 얼굴 변환", en: "Anime-style face conversion for portraits" },
    note: { ko: "가중치는 MIT 라이선스 배포본(bryandlee/animegan2-pytorch)을 직접 변환했다. 원본 TensorFlow 저장소에는 라이선스 파일이 없어, 권리 근거는 채택한 배포본의 MIT로 한정한다.", en: "Weights were converted directly from the MIT-licensed distribution (bryandlee/animegan2-pytorch). The original TensorFlow repository ships no license file, so the rights basis is limited to the adopted distribution's MIT license." },
  },
];
