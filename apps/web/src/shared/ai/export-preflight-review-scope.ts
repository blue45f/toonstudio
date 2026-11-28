export const exportPreflightReviewScope = {
  ko: "검토 자료는 원고 텍스트입니다. 입력한 파일 규격은 참고값이며 그림·글꼴·납품 파일의 실제 내용은 확인 전입니다.",
  en: "This review uses the written brief. Any file measurements are reference values. The artwork, fonts, and final export have not been inspected.",
} as const;

export function formatExportPreflightReview(summary: string, scope: string = exportPreflightReviewScope.ko): string {
  const review = summary.trim();
  if (!review || review === scope) return scope;
  if (review.startsWith(`${scope}\n`) || review.startsWith(`${scope} `)) return review;
  return `${scope}\n${review}`;
}
