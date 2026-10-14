/**
 * WebRTC ICE 구성의 단일 출처.
 *
 * 기본값은 자격증명 없는 Cloudflare STUN(stun:stun.cloudflare.com:3478)
 * 하나뿐인 STUN 전용 구성이다. TURN 서버는 비용 발생 리스크 때문에
 * 2026-10-11 결정으로 쓰지 않기로 했고, 서버가 TURN 자격증명을 발급하는
 * 경로는 두지 않는다.
 *
 * 단, 운영자가 자체 호스팅 coturn을 이미 가지고 있는 경우에 한해, 빌드
 * 환경변수(VITE_STUDIO_TURN_URLS / VITE_STUDIO_TURN_USERNAME /
 * VITE_STUDIO_TURN_CREDENTIAL)를 직접 지정하면 그 항목만 덧붙인다.
 * 환경변수가 없거나 형식이 맞지 않으면 지정은 무시되고 STUN 전용으로
 * 시작한다. 이 자격증명은 공개 웹 번들에 그대로 들어가므로, 쓰는 경우
 * coturn 쪽에서 대역폭·릴레이 대상 제한을 함께 걸어야 한다.
 *
 * 직접 연결이 뚫리지 않는 환경(대칭 NAT·방화벽)에서는 프레즌스 직접 레인이
 * Socket.IO 릴레이로 폴백하므로(studio-live-p2p-overlay-transport의
 * "direct:relay") 공간 프레즌스는 이어진다. 음성·화면 같은 미디어 레인은
 * 릴레이 폴백 대상이 아니어서, TURN을 지정하지 않은 환경에서 직접 연결이
 * 막히면 성립하지 않는다는 한계는 그대로 남는다.
 */
export const STUDIO_ICE_STUN_URL = "stun:stun.cloudflare.com:3478";

export const STUDIO_ICE_STUN_ONLY_SERVERS: readonly RTCIceServer[] =
  Object.freeze([Object.freeze({ urls: [STUDIO_ICE_STUN_URL] })]);

/** 운영자 지정 coturn 환경변수 묶음. 셋이 모두 갖춰져야 하나의 TURN 항목이 된다. */
export interface StudioTurnEnv {
  urls?: string;
  username?: string;
  credential?: string;
}

const STUDIO_TURN_MAX_URLS = 4;
const STUDIO_TURN_URL_PATTERN = /^turns?:[A-Za-z0-9.-]+(?::\d{1,5})?(?:\?\S*)?$/;

/**
 * 환경변수 묶음에서 TURN 항목을 만든다. turn:/turns: 주소만 받고, 주소
 * 목록·사용자 이름·자격증명 중 하나라도 비면 지정 전체를 없는 것으로
 * 본다(반쪽 설정으로 연결이 어긋나는 것보다 STUN 전용이 정직하다).
 */
export function parseStudioTurnIceServer(env: StudioTurnEnv): RTCIceServer | null {
  const username = env.username?.trim() ?? "";
  const credential = env.credential?.trim() ?? "";
  if (!username || !credential) return null;
  const urls: string[] = [];
  for (const candidate of (env.urls ?? "").split(",")) {
    const url = candidate.trim();
    if (!url || !STUDIO_TURN_URL_PATTERN.test(url) || urls.includes(url)) continue;
    urls.push(url);
    if (urls.length >= STUDIO_TURN_MAX_URLS) break;
  }
  if (!urls.length) return null;
  return { urls, username, credential };
}

/**
 * ICE 서버 목록을 만든다. STUN이 항상 첫 항목이고, 유효한 coturn 지정이
 * 있을 때만 TURN 항목이 뒤에 붙는다. 매번 새 배열·새 항목으로 복사해
 * 호출부가 반환값을 바꿔도 다음 호출이 오염되지 않게 한다.
 */
export function buildStudioIceServers(env: StudioTurnEnv = {}): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: [STUDIO_ICE_STUN_URL] }];
  const turn = parseStudioTurnIceServer(env);
  if (turn) {
    servers.push({ urls: [...(turn.urls as string[])], username: turn.username, credential: turn.credential });
  }
  return servers;
}

/** 구성이 TURN 중계를 포함하는지 돌려준다. 실패 안내 문구가 실제 구성과 어긋나지 않게 하는 용도다. */
export function iceServersIncludeTurn(servers: readonly RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = server.urls === undefined ? [] : [server.urls].flat();
    return urls.some((url) => url.startsWith("turn:") || url.startsWith("turns:"));
  });
}

/**
 * 현재 ICE 구성을 돌려준다. coturn 지정은 빌드 환경변수에서만 읽으며,
 * 지정이 없으면 STUN 전용 구성이 된다.
 */
export function getStudioIceServers(): RTCIceServer[] {
  return buildStudioIceServers({
    urls: import.meta.env.VITE_STUDIO_TURN_URLS,
    username: import.meta.env.VITE_STUDIO_TURN_USERNAME,
    credential: import.meta.env.VITE_STUDIO_TURN_CREDENTIAL,
  });
}
