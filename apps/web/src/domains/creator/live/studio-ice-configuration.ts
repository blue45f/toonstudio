/**
 * WebRTC ICE 구성의 단일 출처.
 *
 * 2026-10-11 결정: TURN 서버는 비용 발생 리스크 때문에 사용하지 않는다.
 * 그래서 이 모듈은 TURN 자격증명을 발급받는 경로를 두지 않고, ICE 구성을
 * Cloudflare STUN(stun:stun.cloudflare.com:3478) 하나로 고정한다.
 *
 * 직접 연결이 뚫리지 않는 환경(대칭 NAT·방화벽)에서는 프레즌스 직접 레인이
 * Socket.IO 릴레이로 폴백하므로(studio-live-p2p-overlay-transport의
 * "direct:relay") STUN 전용 구성이어도 공간 프레즌스는 이어진다. 음성·화면
 * 같은 미디어 레인은 릴레이 폴백 대상이 아니어서, 직접 연결이 막힌 환경에서는
 * 성립하지 않는다는 한계는 그대로 남는다.
 */
export const STUDIO_ICE_STUN_URL = "stun:stun.cloudflare.com:3478";

export const STUDIO_ICE_STUN_ONLY_SERVERS: readonly RTCIceServer[] =
  Object.freeze([Object.freeze({ urls: [STUDIO_ICE_STUN_URL] })]);

/**
 * 현재 ICE 구성을 돌려준다. 호출부가 반환값을 바꿔도 공유 상수가 오염되지
 * 않도록 매번 새 배열·새 항목으로 복사한다.
 */
export function getStudioIceServers(): RTCIceServer[] {
  return STUDIO_ICE_STUN_ONLY_SERVERS.map((server) => {
    const urls = server.urls;
    return {
      urls: typeof urls === "string" ? urls : [...(urls ?? [])],
    };
  });
}
