import type { El } from "../../../studio-element-model";

/** 새 bundle 원본 입장 없이 식별자만 바꾸면 불변 참조가 깨지므로 직접 복사 경로를 거부한다. */
export function studioBg3dSixPassCopyUnavailableReason(elements: readonly El[]): string | null {
  return elements.some((element) => element.type === "image" && (element.bg3dLtBundleReference !== undefined || element.src.startsWith("bg3d-lt-artifact:")))
    ? "봉인된 6패스 묶음의 직접 복제·잘라내기·붙여넣기는 아직 지원하지 않습니다. 원본을 유지한 정적 이미지 복사본을 사용해 주세요."
    : null;
}
