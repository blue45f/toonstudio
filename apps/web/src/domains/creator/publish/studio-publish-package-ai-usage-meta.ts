import type { StudioPublishPackageAiUsage } from "../studio-publish-package";

/** 게시 패키지 설정의 AI 사용 범위 선택지와 manifest 요약이 함께 쓰는 한국어 문구. */
export const AI_USAGE_META: Record<StudioPublishPackageAiUsage, { label: string; description: string }> = {
  none: {
    label: "사용 안 함",
    description: "게시물 제작에 AI 보조·생성 결과를 사용하지 않았습니다.",
  },
  assisted: {
    label: "AI 보조",
    description: "기획·교정·참고 등 일부 과정에 사용하고 사람이 최종 결정했습니다.",
  },
  generated: {
    label: "AI 생성 포함",
    description: "게시 이미지나 텍스트에 생성 결과가 직접 포함됩니다.",
  },
};
