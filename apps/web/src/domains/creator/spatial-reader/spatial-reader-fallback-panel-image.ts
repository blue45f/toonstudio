/** 깨진 컷 이미지 감지 시 정상 작품으로 오해하지 않도록 '이미지 로드 실패 대체 표시' 문구를 명시한 SVG 데이터 URI. */
export function fallbackPanelImage(isKo: boolean): string {
  const label = isKo
    ? "이미지 로드 실패 · 원본 작품이 아닌 대체 표시"
    : "Image load failed · Fallback placeholder (not original artwork)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" rx="16" fill="#18181b"/><rect x="16" y="16" width="608" height="328" rx="12" fill="none" stroke="#71717a" stroke-width="2" stroke-dasharray="8 6"/><text x="320" y="184" text-anchor="middle" fill="#e4e4e7" font-family="sans-serif" font-size="16" font-weight="600">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
