/** 가격이 0인 라우터와 단일 무료 모델만 선택한다. 추가 유료 기능을 켜는 복합 접미사는 제외한다. */
export function isOpenRouterFreeModel(model: string): boolean {
  const id = model.trim().toLowerCase();
  return id === "openrouter/free" || /^[a-z0-9._-]+\/[a-z0-9._-]+:free$/u.test(id);
}

// 조직이 플러그인 설정을 강제할 수 있으므로 전용 계정의 청구 차단 확인도 별도로 필요하다.
export const OPENROUTER_FREE_REQUEST_OPTIONS = {
  provider: { max_price: { prompt: 0, completion: 0, request: 0 }, allow_fallbacks: false },
  plugins: [{ id: "web", enabled: false }],
} as const;
