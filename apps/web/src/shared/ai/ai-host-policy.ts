/**
 * 클라우드 AI 주소의 호스트 판정(사설망·루프백·로컬 이름).
 *
 * 사용자가 입력한 연결 주소가 사설망으로 향하면 API 키를 가진 요청이 내부 서비스로 가므로 막는다.
 * 판정은 WHATWG URL 이 돌려주는 정규형 호스트 이름 기준이다. URL 은 `[::ffff:127.0.0.1]` 를
 * `[::ffff:7f00:1]` 로, `127.1` 을 `127.0.0.1` 로 바꾸고 끝 점(`localhost.`)은 그대로 둔다.
 * 문자열 접두사 비교만으로는 이런 표기를 놓치므로 IPv6 는 8개 묶음으로 풀어 내장된 IPv4 까지 검사한다.
 */

function privateIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)) return false;
  const octets = hostname.split(".").map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function ipv4FromGroups(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/** 콜론이 든 호스트 이름을 16비트 묶음 8개로 푼다. 올바른 IPv6 표기가 아니면 null. */
function parseIpv6Groups(hostname: string): readonly number[] | null {
  let text = hostname;
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(text);
  if (dotted) {
    const octets = dotted.slice(1).map(Number);
    if (octets.some((value) => value > 255)) return null;
    const [o1 = 0, o2 = 0, o3 = 0, o4 = 0] = octets;
    text = `${text.slice(0, dotted.index)}${((o1 << 8) | o2).toString(16)}:${((o3 << 8) | o4).toString(16)}`;
  }
  const sides = text.split("::");
  if (sides.length > 2) return null;
  const parseSide = (side: string): number[] => (
    side === ""
      ? []
      : side.split(":").map((part) => (/^[0-9a-f]{1,4}$/u.test(part) ? Number.parseInt(part, 16) : Number.NaN))
  );
  const head = parseSide(sides[0] ?? "");
  const tail = sides.length === 2 ? parseSide(sides[1] ?? "") : [];
  const groups = sides.length === 2
    ? [...head, ...Array.from({ length: 8 - head.length - tail.length }, () => 0), ...tail]
    : head;
  if (groups.length !== 8 || groups.some((value) => !Number.isInteger(value))) return null;
  return groups;
}

/** IPv6 안에 IPv4 를 담는 형식(매핑·번역·호환·NAT64·6to4)에서 내장 IPv4 를 꺼낸다. */
function embeddedIpv4(groups: readonly number[]): string | null {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
  const zeroPrefix64 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;
  if (zeroPrefix64 && g4 === 0xffff && g5 === 0) return "0.0.0.0"; // ::ffff:0:a.b.c.d (SIIT 번역) 전체를 사설로 본다.
  if (zeroPrefix64 && g4 === 0 && g5 === 0xffff) return ipv4FromGroups(g6, g7); // ::ffff:a.b.c.d (IPv4 매핑)
  if (zeroPrefix64 && g4 === 0 && g5 === 0) return ipv4FromGroups(g6, g7); // ::a.b.c.d (IPv4 호환, 폐기됨)
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return ipv4FromGroups(g6, g7); // 64:ff9b::a.b.c.d (NAT64)
  }
  if (g0 === 0x2002) return ipv4FromGroups(g1, g2); // 2002:aabb:ccdd:: (6to4)
  return null;
}

function privateIpv6(hostname: string): boolean {
  const groups = parseIpv6Groups(hostname);
  if (!groups) return true; // 올바르지 않은 표기는 공개 주소로 취급하지 않는다.
  const first = groups[0] ?? 0;
  const loopbackOrUnspecified = groups.slice(0, 7).every((value) => value === 0) && (groups[7] ?? 0) <= 1;
  if (loopbackOrUnspecified) return true;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 고유 로컬
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 링크 로컬
  if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 사이트 로컬(폐기됨)
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 멀티캐스트
  const embedded = embeddedIpv4(groups);
  return embedded !== null && privateIpv4(embedded);
}

export function isPrivateOrLocalAiHostname(value: string): boolean {
  const hostname = value.trim().toLowerCase().replace(/^\[|\]$/gu, "").replace(/\.$/u, "");
  if (!hostname) return true;
  if (
    hostname === "localhost"
    || hostname === "0.0.0.0"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".lan")
    || hostname.endsWith(".internal")
  ) {
    return true;
  }
  if (privateIpv4(hostname)) return true;
  if (!hostname.includes(":")) return false;
  return privateIpv6(hostname);
}
