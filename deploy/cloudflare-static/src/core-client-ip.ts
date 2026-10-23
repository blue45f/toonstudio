// PaaS ingress(onpod 등)는 x-forwarded-for·x-real-ip·cf-connecting-ip 를 앞단 주소로 덮어쓴다(2026-10-22 실측: Worker
// 경유 요청이 모두 Cloudflare 이그레스 주소로 보임). 커스텀 헤더는 그대로 통과하므로 실제 접속자 IP 를 전용 헤더로 싣는다.
// Core API 는 `AUTH_EDGE_CLIENT_IP_ENABLED=true` 일 때 같은 요청이 x-toonstudio-origin-secret 을 증명한 경우에만 이 헤더를 신뢰한다.
export const CORE_CLIENT_IP_HEADER = "x-toonstudio-client-ip";

function containsForbiddenForwardedIpCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint <= 0x20 || codePoint === 0x7f) return true;
  }
  return false;
}

/** Cloudflare 가 알려 준 접속자 IP. 비었거나 64자를 넘거나 공백·제어 문자가 있으면 null 이다(형식 검증은 API 가 한다). */
export function trustedConnectingIp(request: Request): string | null {
  const value = request.headers.get("cf-connecting-ip")?.trim();
  if (
    !value
    || value.length > 64
    || containsForbiddenForwardedIpCharacter(value)
  ) {
    return null;
  }
  return value;
}
