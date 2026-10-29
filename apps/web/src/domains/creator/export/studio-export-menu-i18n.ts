import { registerI18nLocaleEntries } from "@/shared/lib/i18n";
import { frozenStatusText } from "../studio-frozen-status-i18n";

const ko = {
  title: "이미지로 저장",
  help: "형식을 고르고 현재 페이지 또는 여러 페이지를 다운로드하세요.",
  format: "파일 형식",
  scale: "이미지 크기",
  currentDownload: "현재 페이지 {format} 다운로드",
  currentBusy: "파일 준비 중…",
  appearance: "배경·서명 설정",
  appearanceHelp: "투명 배경과 워터마크",
  transparent: "투명 배경 (PNG·WebP)",
  transparentHelp: "배경 없이 투명하게 내보내기",
  watermark: "서명·워터마크",
  watermarkText: "워터마크 문구",
  watermarkPosition: "워터마크 위치",
  watermarkOpacity: "워터마크 투명도",
  clipboard: "현재 페이지 복사",
  clipboardHelp: "현재 페이지를 이미지로 복사해 다른 앱에 붙여넣습니다.",
  range: "페이지 범위",
  rangeHelp: "여러 페이지 저장에 적용 · {range}",
  print: "인쇄·PDF",
  printHelp: "해상도, 인쇄 규격, PDF와 콘택트시트",
  exchange: "다른 편집기용 파일",
  exchangeHelp: "PSD, SVG, CBZ, ORA와 전문 교환 형식",
  publish: "게시 준비",
  publishHelp: "플랫폼 규격, 게시 화면 보내기, 대사와 홍보 자료",
  pagesTitle: "여러 페이지 이미지",
  pagesHelp: "페이지별 이미지를 한 ZIP 파일로 저장합니다.",
  pagesAll: "전체 {count}페이지",
  pagesSelected: "선택 {count}페이지",
  zipOptions: "ZIP 저장 옵션",
  zipOptionsHelp: "압축 품질과 파일 검증 정보",
  preflightBlocked: "여러 페이지 저장 설정을 확인해 주세요.",
} as const;

const en: Record<keyof typeof ko, string> = {
  title: "Save as images",
  help: "Choose a format, then download the current page or multiple pages.",
  format: "File format",
  scale: "Image size",
  currentDownload: "Download current page as {format}",
  currentBusy: "Preparing files…",
  appearance: "Background and signature",
  appearanceHelp: "Transparent background and watermark",
  transparent: "Transparent background (PNG·WebP)",
  transparentHelp: "Export without a background",
  watermark: "Signature and watermark",
  watermarkText: "Watermark text",
  watermarkPosition: "Watermark position",
  watermarkOpacity: "Watermark opacity",
  clipboard: "Copy current page",
  clipboardHelp: "Copy the current page as an image to paste into another app.",
  range: "Page range",
  rangeHelp: "For multiple-page exports · {range}",
  print: "Print and PDF",
  printHelp: "Resolution, print settings, PDFs and contact sheets",
  exchange: "Files for other editors",
  exchangeHelp: "PSD, SVG, CBZ, ORA and specialist interchange formats",
  publish: "Prepare to publish",
  publishHelp: "Platform presets, publishing, dialogue and promotional files",
  pagesTitle: "Multiple-page images",
  pagesHelp: "Save a separate image for each page in one ZIP file.",
  pagesAll: "All {count} pages",
  pagesSelected: "Selected {count} pages",
  zipOptions: "ZIP save options",
  zipOptionsHelp: "Compression quality and file verification details",
  preflightBlocked: "Check the settings for multiple-page exports.",
};

for (const [locale, messages] of [["ko", ko], ["en", en]] as const) {
  registerI18nLocaleEntries(locale, Object.fromEntries(
    Object.entries(messages).map(([key, value]) => [`studio.exportMenu.${key}`, value]),
  ));
}

export function exportMenuText(
  key: keyof typeof ko,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return frozenStatusText(`studio.exportMenu.${key}`, params, ko[key]);
}
