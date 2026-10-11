import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 3: Godot 무대의 이동·충돌·카메라 · Godot 무대의 길 찾기.
 * 웹(Phaser) 공간 클라이언트 제거 뒤의 현행 구조로 다시 썼다. 경로·수치는
 * 셸에 남은 생존 파일에서 직접 확인한 값만 쓴다 — 무대(GDScript) 내부 수치는
 * 이 저장소에서 확인할 수 없어 수치로 적지 않는다.
 */

const V = "apps/web/src/domains/creator/virtual-space";

export const VIRTUAL_SPACE_MOTION_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "movement-collision-inertia-camera",
    category: "virtual-space",
    name: "Godot stage movement",
    title: t("움직임·충돌·카메라는 Godot 무대 안에서 일어난다", "Movement, collisions and the camera live inside the Godot stage"),
    status: "live",
    tagline: t(
      "걷기와 카메라는 Godot 무대가 맡고, 웹 셸은 프레즌스 브리지로 위치와 상태만 주고받습니다.",
      "The Godot stage owns walking and the camera; the web shell only exchanges position and state over the presence bridge.",
    ),
    background: [
      t(
        "가상 스튜디오의 공간 화면은 이제 웹 캔버스가 직접 그리지 않습니다. 웹(Phaser) 공간 클라이언트는 제거됐고, 공간은 Godot 빌드가 맡습니다. 셸 페이지가 /godot-space/index.html 빌드를 iframe으로 품으면, 걷기·벽과 가구의 충돌·카메라 추종은 전부 그 무대(GDScript) 안에서 일어납니다. 셸 코드는 아바타의 속도를 계산하지 않습니다.",
        "The virtual studio space is no longer drawn by a web canvas directly. The web (Phaser) space client was removed, and a Godot build renders the space now. The shell page embeds the /godot-space/index.html build in an iframe, and walking, collisions with walls and furniture, and camera following all happen inside that stage (GDScript). Shell code does not compute the avatar's velocity.",
      ),
      t(
        "셸이 맡는 것은 경계입니다. 계정 세션과 실시간 티켓을 무대에 건네고(__tsvs_setSession), 무대가 알려 주는 위치·구역 변화를 브리지 콜백(onPosition·onZoneChanged)으로 받습니다. 다른 참가자와의 동기화는 프레즌스 프로토콜이 맡습니다. 와이어 이름은 toonstudio-space-v1이고, 위치·상태 패킷은 90ms 간격으로 흐르며 패킷 하나는 1,024바이트를 넘지 않습니다.",
        "The shell owns the boundary. It hands the account session and realtime ticket to the stage (__tsvs_setSession) and receives position and zone changes the stage reports through bridge callbacks (onPosition, onZoneChanged). Sync with other participants runs over the presence protocol: the wire is named toonstudio-space-v1, position and state packets flow every 90 ms, and one packet stays within 1,024 bytes.",
      ),
      t(
        "셸이 위치에 대해 하는 일은 동기화와 복원뿐입니다. 마지막 위치는 기기 로컬에만 30일 동안 저장해 다음 방문에서 복원하고, 실시간 방은 Worker 설정으로 방당 연결 64가 상한입니다. 무대 안의 가속·반발·카메라 계수 같은 수치는 이 저장소의 웹 코드에서 확인할 수 없어서, 이 도감은 그런 수치를 적지 않습니다. 확인할 수 있는 값만 근거로 남깁니다.",
        "For position, the shell only syncs and restores. The last position is stored on the device only, for 30 days, and restored on the next visit, and the realtime room is capped at 64 connections per room by Worker settings. Numbers inside the stage, such as acceleration, rebound and camera factors, cannot be verified from this repository's web code, so this atlas does not list them. Only verifiable values are kept as evidence.",
      ),
    ],
    keyPoints: [
      t("움직임·충돌·카메라는 Godot 무대(GDScript)가 소유", "Movement, collisions and the camera are owned by the Godot stage (GDScript)"),
      t("셸은 iframe 브리지로 세션·위치·구역만 주고받음", "The shell exchanges only session, position and zone over the iframe bridge"),
      t("프레즌스는 90ms 간격, 패킷 상한 1,024바이트", "Presence flows every 90 ms with a 1,024-byte packet cap"),
    ],
    diagram: {
      id: "movement-collision-inertia-camera-diagram",
      kind: "graph",
      title: t("셸과 Godot 무대 사이의 움직임 동기화", "Movement sync between the shell and the Godot stage"),
      caption: t(
        "무대가 움직임을 계산하고, 셸은 브리지와 프레즌스로 위치·상태를 나눕니다.",
        "The stage computes movement, and the shell shares position and state over the bridge and presence.",
      ),
      alt: t(
        "웹 셸이 세션과 티켓을 브리지로 Godot 무대에 건네면 무대가 이동·충돌·카메라를 계산합니다. 무대가 돌려준 위치는 프레즌스 패킷으로 다른 참가자에게 전파되고, 셸은 마지막 위치를 기기 로컬에 저장합니다.",
        "The web shell hands the session and ticket to the Godot stage over the bridge, and the stage computes movement, collisions and the camera. Positions the stage reports travel to other participants as presence packets, and the shell stores the last position on the device.",
      ),
      nodes: [
        { id: "shell", label: t("웹 셸", "Web shell"), sub: t("계정·티켓·패널", "Account, ticket, panels"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "bridge", label: t("브리지", "Bridge"), sub: t("호스트 콜백", "Host callbacks"), tone: "local", at: [1, 0] },
        { id: "stage", label: t("Godot 무대", "Godot stage"), sub: t("이동·충돌·카메라", "Move, collide, camera"), tone: "good", at: [2, 0] },
        { id: "presence", label: t("프레즌스", "Presence"), sub: t("90ms 위치·상태", "90 ms position"), tone: "local", at: [3, 0] },
        { id: "peers", label: t("다른 참가자", "Other peers"), sub: t("위치·상태 수신", "Receive state"), tone: "local", shape: "pill", at: [4, 0] },
        { id: "store", label: t("위치 저장", "Position store"), sub: t("기기 로컬 · 30일", "Local, 30 days"), tone: "neutral", at: [2, 1] },
      ],
      edges: [
        { from: "shell", to: "bridge", label: t("세션", "session") },
        { from: "bridge", to: "stage", label: t("주입", "inject") },
        { from: "stage", to: "presence", label: t("위치", "position") },
        { from: "presence", to: "peers", label: t("전파", "relay") },
        { from: "stage", to: "store", label: t("위치 통지", "position") },
      ],
    },
    usage: [
      {
        feature: t("공간 화면 · Godot 무대 임베드", "Spatial screen · Godot stage embed"),
        role: t(
          "셸 페이지가 Godot 빌드를 iframe으로 품고 세션·티켓·연결 상태를 맡습니다. 공간 렌더와 이동은 무대가 소유합니다.",
          "The shell page embeds the Godot build in an iframe and owns the session, ticket and connection state. The stage owns space rendering and movement.",
        ),
        paths: [
          `${V}/StudioGodotSpaceEmbed.tsx`,
          `${V}/StudioVirtualSpacePageRoot.tsx`,
          "apps/web/public/godot-space/index.html",
        ],
        route: "/studio/space",
      },
      {
        feature: t("프레즌스 브리지 · 위치·상태 동기화", "Presence bridge · position and state sync"),
        role: t(
          "무대가 보고한 위치·바라보는 방향·구역을 와이어 패킷으로 인코딩해 다른 참가자와 주고받고, 오래된 피어는 만료시킵니다.",
          "Positions, facing and zones reported by the stage are encoded as wire packets, exchanged with other participants, and stale peers expire.",
        ),
        paths: [`${V}/studio-virtual-space-presence-protocol.ts`, `${V}/studio-virtual-space-presence.ts`],
      },
      {
        feature: t("셸↔무대 브리지와 마지막 위치 저장", "Shell-stage bridge and last-position store"),
        role: t(
          "브리지 콜백 타입과 마지막 위치의 기기 로컬 저장(30일)을 셸 보조 모듈이 맡습니다. 무대는 이 경계로만 셸과 이야기합니다.",
          "A shell support module owns the bridge callback types and the on-device last-position store (30 days). The stage talks to the shell only across this boundary.",
        ),
        paths: [`${V}/studio-godot-space-embed-support.ts`, `${V}/studio-godot-space.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("프레즌스 패킷 인코딩과 크기 상한", "Presence packet encoding and its size cap"),
        language: "ts",
        code: `// 프레즌스 패킷을 와이어 이름과 크기 상한 안에서 인코딩한다(프로토콜 모듈의 단순화).
export const WIRE = "toonstudio-space-v1";
export const PRESENCE_INTERVAL_MS = 90;
export const HEARTBEAT_MS = 2_500;
export const PACKET_MAX_BYTES = 1_024;

const packetBytes = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

export function encodePacket(packet: unknown): string | null {
  const raw = JSON.stringify(packet);
  return packetBytes(raw) <= PACKET_MAX_BYTES ? raw : null;
}`,
        codeEn: `// Encode a presence packet within the wire name and size cap (simplified from the protocol module).
export const WIRE = "toonstudio-space-v1";
export const PRESENCE_INTERVAL_MS = 90;
export const HEARTBEAT_MS = 2_500;
export const PACKET_MAX_BYTES = 1_024;

const packetBytes = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

export function encodePacket(packet: unknown): string | null {
  const raw = JSON.stringify(packet);
  return packetBytes(raw) <= PACKET_MAX_BYTES ? raw : null;
}`,
        explain: t(
          "무대가 만든 위치·상태는 이 패킷 모양으로만 셸 밖으로 나갑니다. 크기 상한을 넘는 패킷은 보내지 않으며, 전송 간격과 하트비트도 프로토콜 상수로 고정돼 있습니다.",
          "Position and state made by the stage leave the shell only in this packet shape. A packet over the size cap is not sent, and the send interval and heartbeat are fixed as protocol constants.",
        ),
        source: `${V}/studio-virtual-space-presence-protocol.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("마지막 위치는 기기 로컬에 30일만", "The last position stays on the device for 30 days"),
        language: "ts",
        code: `// 마지막 위치는 셸이 기기 로컬에만 저장한다(embed-support의 단순화).
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export interface LastPosition { spaceId: string; x: number; y: number; at: number }

export function isFresh(position: LastPosition, now: number): boolean {
  return now - position.at <= TTL_MS;
}

export function saveLastPosition(workId: string, position: LastPosition): void {
  try {
    window.localStorage.setItem("tsvs-last-position:" + workId, JSON.stringify(position));
  } catch {
    // 저장 실패는 복원을 포기할 뿐 무대 동작에 영향을 주지 않는다.
  }
}`,
        codeEn: `// The shell stores the last position on the device only (simplified from embed-support).
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface LastPosition { spaceId: string; x: number; y: number; at: number }

export function isFresh(position: LastPosition, now: number): boolean {
  return now - position.at <= TTL_MS;
}

export function saveLastPosition(workId: string, position: LastPosition): void {
  try {
    window.localStorage.setItem("tsvs-last-position:" + workId, JSON.stringify(position));
  } catch {
    // A failed save only gives up restoring; it never affects the stage.
  }
}`,
        explain: t(
          "위치 복원은 셸의 일입니다. 무대가 onPosition으로 알려 준 좌표를 작품별로 저장하고, 30일이 지난 기록은 복원에 쓰지 않습니다. 서버에는 위치를 저장하지 않습니다.",
          "Restoring position is the shell's job. Coordinates the stage reports via onPosition are stored per work, and records older than 30 days are not used for restoring. The position is not stored on a server.",
        ),
        source: `${V}/studio-godot-space-embed-support.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Godot · Using CharacterBody2D", url: "https://docs.godotengine.org/en/stable/tutorials/physics/using_character_body_2d.html", kind: "docs", note: t("무대 쪽 몸체 이동과 충돌", "Body movement and collisions on the stage side") },
      { title: "Godot · JavaScriptBridge", url: "https://docs.godotengine.org/en/stable/classes/class_javascriptbridge.html", kind: "docs", note: t("무대와 웹 셸의 브리지", "The bridge between the stage and the web shell") },
      { title: "Godot · Exporting for the Web", url: "https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html", kind: "docs", note: t("웹 빌드 배포 형태", "How the web build is shipped") },
      { title: "MDN · iframe element", url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe", kind: "docs", note: t("셸이 무대를 품는 방식", "How the shell embeds the stage") },
    ],
    chapterIds: ["virtual-studio-world-authority", "performance"],
    talk: {
      pitch: t(
        "공간에서 걷고 벽에 부딪히고 카메라가 따라오는 일은 이제 웹 코드가 아니라 Godot 무대 안에서 일어납니다. 웹 셸은 무대를 iframe으로 품고 계정·티켓·업무 패널을 맡으며, 위치와 상태는 프레즌스 브리지로 90ms 간격 주고받습니다. 무대 내부 수치는 이 저장소에서 확인할 수 없어 도감에 적지 않습니다.",
        "Walking, hitting walls and the camera following now happen inside the Godot stage, not in web code. The web shell embeds the stage in an iframe and keeps accounts, tickets and work panels, while position and state cross the presence bridge every 90 ms. Stage-internal numbers cannot be verified from this repository, so the atlas does not list them.",
      ),
      analogy: t(
        "무대는 배우가 연기하는 실제 무대이고, 셸은 표를 끊고 안내하는 로비입니다. 로비가 배우의 걸음걸이를 대신 계산하지 않듯, 셸도 움직임을 계산하지 않고 무대가 알려 준 위치를 다른 관객에게 전합니다.",
        "The stage is where the actors actually perform, and the shell is the lobby that sells tickets and guides visitors. Just as the lobby does not compute an actor's steps, the shell does not compute movement; it relays the positions the stage reports to the other visitors.",
      ),
      questions: [
        {
          question: t("가속도 같은 무대 안 수치는 얼마인가요?", "What are the stage-internal numbers, like acceleration?"),
          answer: t(
            "이 저장소의 웹 코드에서는 확인할 수 없습니다. 무대 빌드는 배포 산출물로만 들어 있어 가속·반발·카메라 계수를 수치로 적지 않습니다. 확인할 수 있는 값은 프레즌스 간격 90ms와 패킷 상한 1,024바이트 같은 셸 쪽 상수뿐입니다.",
            "They cannot be verified from this repository's web code. The stage build ships only as a built artifact, so acceleration, rebound and camera factors are not listed as numbers. The verifiable values are shell-side constants such as the 90 ms presence interval and the 1,024-byte packet cap.",
          ),
        },
        {
          question: t("셸은 움직임을 전혀 다루지 않나요?", "Does the shell handle movement at all?"),
          answer: t(
            "물리 계산은 하지 않습니다. 셸은 세션·티켓을 무대에 건네고, 무대가 보고한 위치를 프레즌스로 전파하며, 마지막 위치를 기기 로컬에 저장해 복원하는 일까지만 맡습니다.",
            "It does no physics. The shell only hands the session and ticket to the stage, relays the positions the stage reports over presence, and stores the last position on the device for restoring.",
          ),
        },
        {
          question: t("다른 사람 아바타는 어떻게 따라오나요?", "How do other people's avatars keep up?"),
          answer: t(
            "각 무대가 자기 아바타의 위치·방향·구역을 프레즌스 패킷으로 보내고, 받는 쪽 무대와 셸이 그 상태로 상대 아바타를 표시합니다. 하트비트는 2,500ms 간격이고 10,000ms 동안 소식이 없으면 피어는 만료됩니다.",
            "Each stage sends its avatar's position, facing and zone as presence packets, and the receiving stage and shell render the peer from that state. The heartbeat runs every 2,500 ms, and a peer expires after 10,000 ms without news.",
          ),
        },
      ],
      pitfall: t(
        "예전 Phaser·Arcade 물리 수치(가속 1500/2100, 카메라 lerp 0.12 등)를 현행처럼 말하지 마세요. 그 클라이언트는 제거됐습니다. 무대 안 수치는 빌드 산출물만으로 확인할 수 없으니, 모르면 모른다고 하고 셸에서 확인되는 상수만 말하세요.",
        "Do not present the old Phaser and Arcade physics numbers (acceleration 1500/2100, camera lerp 0.12 and so on) as current. That client was removed. Stage-internal numbers cannot be verified from the built artifact alone, so say they are unknown and cite only constants verifiable in the shell.",
      ),
    },
    technologies: ["Godot", "GDScript", "iframe bridge", "presence protocol"],
    facts: [
      { value: "toonstudio-space-v1", label: t("프레즌스 와이어 이름", "Presence wire name"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "90ms", label: t("프레즌스 전송 간격(설계값)", "Presence send interval (design value)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "2,500ms · 10,000ms", label: t("하트비트 간격 · 피어 만료 기준(설계값)", "Heartbeat interval and peer expiry threshold (design values)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "1,024바이트", label: t("프레즌스 패킷 크기 상한(fixtures 패킷 제외)", "Presence packet size cap (except fixtures packets)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "20,000ms", label: t("셸↔무대 브리지 핑 간격", "Shell-to-stage bridge ping interval"), source: `${V}/StudioGodotSpaceEmbed.tsx` },
      { value: "64", label: t("실시간 방당 연결 상한(Worker 설정값)", "Realtime connections cap per room (Worker setting)"), source: "deploy/cloudflare-realtime/wrangler.jsonc" },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "pathfinding-astar-los",
    category: "virtual-space",
    name: "Godot stage pathfinding",
    title: t("길 찾기는 Godot 무대의 내비게이션 쪽으로 이동했다", "Pathfinding moved to navigation on the Godot stage"),
    status: "live",
    tagline: t(
      "클릭 이동과 NPC 길 찾기는 무대가 맡고, 셸은 NPC 동선과 캐스트 데이터를 건넵니다.",
      "The stage owns click-to-move and NPC pathfinding; the shell hands over NPC routes and cast data.",
    ),
    background: [
      t(
        "바닥을 클릭하면 아바타가 벽을 돌아 걷고, NPC가 자기 동선을 따라 이동하는 일은 이제 무대 안에서 일어납니다. 예전 웹 클라이언트가 격자 위에서 하던 길 찾기는 공간 화면의 현행 동선이 아니며, 클릭 지점을 무대에 건네는 setPathTo 같은 웹 진입점도 제거됐습니다. 길 찾기는 Godot 무대의 내비게이션(NavigationAgent 계열)이 맡는 것으로 정리됐습니다.",
        "Clicking the floor so the avatar walks around walls, and NPCs moving along their routes, now happen inside the stage. The grid search the old web client ran is not the current path of the space screen, and web entry points that handed click targets to it, such as setPathTo, were removed. Pathfinding is settled as the Godot stage's navigation (the NavigationAgent family).",
      ),
      t(
        "셸이 무대에 건네는 것은 길이 아니라 재료입니다. 공간 정의 스키마는 NPC 항목마다 이름과 동선 points, 대사를 실을 수 있게 합니다. 동선 점은 2개부터 16개까지, NPC는 정의 하나에 최대 6명, 대사는 최대 12줄입니다. 배포되는 spaces.json의 NPC들도 점들을 이은 순환 동선을 그대로 갖고 있고, 무대는 그 재료로 자기 길 찾기를 돌립니다.",
        "What the shell hands the stage is not a path but the ingredients. The space-definition schema lets each NPC entry carry a name, route points and lines. A route holds 2 to 16 points, one definition holds at most 6 NPCs, and lines are capped at 12. The NPCs in the shipped spaces.json carry looped routes made of those points, and the stage runs its own pathfinding from those ingredients.",
      ),
      t(
        "셸에 남은 근거는 길찾기 코드가 아니라 데이터와 표현입니다. NPC 캐스트 데이터는 그린 캐스트 8종과 절차적 정의 7종의 이름·역할·스킨을 셸이 계속 쥐고 있고, 프레즌스 표현 모듈은 다른 참가자의 위치 표본을 100ms 지연으로 보간하고 최대 250ms까지 외삽하는 일을 맡습니다. 무대 안 내비게이션 메시나 에이전트 설정값은 이 저장소에서 확인할 수 없어 수치로 적지 않습니다.",
        "The evidence left in the shell is data and presentation, not pathfinding code. The shell still holds the NPC cast data, the names, roles and skins of 8 drawn cast members and 7 procedural definitions, and the presence presentation module interpolates other participants' position samples with a 100 ms delay and extrapolates up to 250 ms. The stage's navigation mesh and agent settings cannot be verified from this repository, so they are not listed as numbers.",
      ),
    ],
    keyPoints: [
      t("길 찾기는 Godot 무대의 내비게이션이 맡습니다", "Pathfinding belongs to navigation on the Godot stage"),
      t("셸은 NPC 동선 points와 캐스트 데이터를 건넵니다", "The shell hands over NPC route points and cast data"),
      t("셸에 남은 것은 길 찾기가 아니라 표현 보간입니다", "What remains in the shell is presentation interpolation, not pathfinding"),
    ],
    diagram: {
      id: "pathfinding-astar-los-diagram",
      kind: "graph",
      title: t("정의와 캐스트가 무대 길 찾기로 이어지는 흐름", "How definitions and cast feed stage pathfinding"),
      caption: t(
        "셸이 공간 정의와 NPC 캐스트를 건네면, 무대의 내비게이션이 길을 찾아 걷습니다.",
        "The shell hands over the space definition and NPC cast, and stage navigation finds the path and walks it.",
      ),
      alt: t(
        "공간 정의의 구역·소품·NPC 동선과 NPC 캐스트 데이터가 Godot 무대에 전달됩니다. 무대의 내비게이션이 그 재료로 경로를 계산하면 NPC와 아바타가 경로를 따라 걷습니다.",
        "The space definition's zones, props and NPC routes, together with NPC cast data, are handed to the Godot stage. Stage navigation computes a route from those ingredients, and NPCs and avatars walk along it.",
      ),
      nodes: [
        { id: "def", label: t("공간 정의", "Space definition"), sub: t("구역·소품·NPC 동선", "Zones, props, NPC routes"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "stage", label: t("Godot 무대", "Godot stage"), sub: t("정의와 캐스트 수신", "Receives definition and cast"), tone: "local", at: [1, 0] },
        { id: "nav", label: t("내비게이션", "Navigation"), sub: t("NavigationAgent", "NavigationAgent"), tone: "good", at: [2, 0] },
        { id: "walk", label: t("경로 따라 걷기", "Walk the route"), sub: t("클릭 이동·NPC 동선", "Click-to-move, NPC routes"), tone: "local", shape: "pill", at: [3, 0] },
        { id: "cast", label: t("NPC 캐스트", "NPC cast"), sub: t("그린 8종 · 절차 7종", "8 drawn, 7 procedural"), tone: "neutral", shape: "cylinder", at: [1, 1] },
      ],
      edges: [
        { from: "def", to: "stage", label: t("정의", "definition") },
        { from: "cast", to: "stage", label: t("캐스트", "cast") },
        { from: "stage", to: "nav", label: t("길 찾기", "find") },
        { from: "nav", to: "walk", label: t("경로", "route") },
      ],
    },
    usage: [
      {
        feature: t("공간 정의 · NPC 동선 전달", "Space definition · handing over NPC routes"),
        role: t(
          "공간 정의 스키마가 구역·소품과 함께 NPC 동선 points와 대사를 무대에 건넵니다. 실제 배포 정의에도 순환 동선이 들어 있습니다.",
          "The space-definition schema hands zones and props, plus NPC route points and lines, to the stage. The shipped definitions contain looped routes as well.",
        ),
        paths: [`${V}/studio-godot-space.ts`, "apps/web/public/godot-space/spaces.json"],
        route: "/studio/space",
      },
      {
        feature: t("NPC 캐스트 데이터", "NPC cast data"),
        role: t(
          "누가 어떤 역할과 모습으로 공간에 서는지는 셸의 캐스트 데이터가 정합니다. 길 찾기가 아니라 등장인물 자료입니다.",
          "Who stands in the space, in which role and appearance, is decided by cast data in the shell. It is character material, not pathfinding.",
        ),
        paths: [`${V}/studio-virtual-space-npc-cast.ts`],
      },
      {
        feature: t("공간 화면 · 무대 임베드와 피어 표현", "Spatial screen · stage embed and peer presentation"),
        role: t(
          "셸은 무대를 품고, 다른 참가자의 움직임은 프레즌스 표현 모듈의 타임라인 보간으로 매끄럽게 보입니다. 길 계산은 무대 몫입니다.",
          "The shell embeds the stage, and other participants' movement is shown smoothly through the presence presentation module's timeline interpolation. Computing paths is the stage's share.",
        ),
        paths: [`${V}/StudioGodotSpaceEmbed.tsx`, `${V}/studio-virtual-space-presentation.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("NPC 동선과 대사의 정의 상한", "Definition caps for NPC routes and lines"),
        language: "ts",
        code: `// 공간 정의가 NPC 동선과 대사를 무대에 건네는 계약(godot-space 스키마의 단순화).
export const NPC_LIMITS = {
  count: 6, // 정의 하나가 실을 수 있는 NPC 수 상한
  nameMax: 20, // 이름 최대 길이
  pointsMin: 2, // 동선 점 최소 개수
  pointsMax: 16, // 동선 점 최대 개수
  linesMax: 12, // 대사 줄 최대 개수
} as const;

export type NpcRoute = {
  name: string;
  points: readonly (readonly [number, number])[];
  lines?: readonly string[];
};`,
        codeEn: `// The contract by which a space definition hands NPC routes and lines to the stage (simplified from the godot-space schema).
export const NPC_LIMITS = {
  count: 6, // max NPCs one definition may carry
  nameMax: 20, // max name length
  pointsMin: 2, // min route points
  pointsMax: 16, // max route points
  linesMax: 12, // max lines
} as const;

export type NpcRoute = {
  name: string;
  points: readonly (readonly [number, number])[];
  lines?: readonly string[];
};`,
        explain: t(
          "셸이 검증하는 것은 동선의 모양과 상한까지입니다. 그 점들을 어떤 경로로 이을지는 무대의 내비게이션이 정하므로, 셸 스키마에는 탐색 설정이 없습니다.",
          "The shell validates only the route's shape and caps. How those points are joined into a path is decided by stage navigation, so the shell schema holds no search settings.",
        ),
        source: `${V}/studio-godot-space.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("텍스처 없이 캐스트 이름만 조회하기", "Looking up a cast name without textures"),
        language: "ts",
        code: `// 이름만 필요하면 텍스처를 만들지 않고 캐스트 라벨만 조회한다(npc-cast의 단순화).
interface CastLabel { readonly ko: string; readonly en: string }

export function castLabel(
  key: string,
  drawn: readonly { key: string; labelKo: string; labelEn: string }[],
  procedural: readonly { key: string; labelKo: string; labelEn: string }[],
): CastLabel | undefined {
  const hit = drawn.find((item) => item.key === key) ?? procedural.find((item) => item.key === key);
  return hit ? { ko: hit.labelKo, en: hit.labelEn } : undefined;
}`,
        codeEn: `// When only a name is needed, look up the cast label without building textures (simplified from npc-cast).
interface CastLabel { readonly ko: string; readonly en: string }

export function castLabel(
  key: string,
  drawn: readonly { key: string; labelKo: string; labelEn: string }[],
  procedural: readonly { key: string; labelKo: string; labelEn: string }[],
): CastLabel | undefined {
  const hit = drawn.find((item) => item.key === key) ?? procedural.find((item) => item.key === key);
  return hit ? { ko: hit.labelKo, en: hit.labelEn } : undefined;
}`,
        explain: t(
          "패널과 대화처럼 이름만 필요한 곳은 이 조회만 씁니다. 캐스트는 셸에 남은 NPC 자료이며, 무대가 이 인물들을 동선 위로 움직입니다.",
          "Places that need only a name, such as panels and dialogue, use just this lookup. The cast is NPC material left in the shell, and the stage moves these characters along their routes.",
        ),
        source: `${V}/studio-virtual-space-npc-cast.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Godot · NavigationAgent2D", url: "https://docs.godotengine.org/en/stable/classes/class_navigationagent2d.html", kind: "docs", note: t("무대 쪽 길 찾기 에이전트", "The pathfinding agent on the stage side") },
      { title: "Godot · Navigation in 2D", url: "https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_introduction_2d.html", kind: "guide", note: t("무대 내비게이션 개요", "An overview of stage navigation") },
      { title: "Red Blob Games · Introduction to A*", url: "https://www.redblobgames.com/pathfinding/a-star/introduction.html", kind: "guide", note: t("격자 길 찾기의 배경 지식", "Background reading on grid pathfinding") },
      { title: "Wikipedia · A* search algorithm", url: "https://en.wikipedia.org/wiki/A*_search_algorithm", kind: "article", note: t("예전 웹 방식의 알고리즘 개요", "An overview of the algorithm the web approach used") },
    ],
    chapterIds: ["virtual-studio-world-authority", "performance"],
    talk: {
      pitch: t(
        "바닥을 클릭해 벽을 돌아 걷는 길 찾기와 NPC가 동선을 따라 움직이는 일은 Godot 무대의 내비게이션이 맡습니다. 셸은 길을 계산하지 않고, NPC 동선 points(2~16개)와 대사, 캐스트 이름·역할 같은 재료만 공간 정의로 건넵니다. 무대 안 내비게이션 설정은 이 저장소에서 확인할 수 없어 수치로 말하지 않습니다.",
        "Pathfinding that walks around walls after a floor click, and NPCs following their routes, belong to navigation on the Godot stage. The shell does not compute paths; it only hands over ingredients such as NPC route points (2 to 16), lines, and cast names and roles in the space definition. Stage navigation settings cannot be verified from this repository, so they are not stated as numbers.",
      ),
      analogy: t(
        "셸은 운전자가 아니라 관제탑이 건네는 운항 자료에 가깝습니다. 누가 어느 순환 동선을 도는지는 자료로 건네고, 실제로 길을 골라 운전하는 일은 무대 안의 내비게이션이 합니다.",
        "The shell is less like a driver and more like the operations desk handing over route sheets. Who loops along which route is handed over as data, and actually choosing the road and driving happens in navigation inside the stage.",
      ),
      questions: [
        {
          question: t("셸에 A* 길 찾기가 남아 있나요?", "Is A* pathfinding still in the shell?"),
          answer: t(
            "공간 화면의 현행 길 찾기로는 남아 있지 않습니다. 클릭 지점을 웹 길 찾기에 건네던 진입점과 NPC 디렉터·가이드는 제거됐고, 셸에 남은 근거는 NPC 캐스트 데이터와 동선 정의, 피어 표현 모듈뿐입니다.",
            "Not as the space screen's current pathfinding. The entry points that handed click targets to web pathfinding, and the NPC director and guide, were removed; the evidence left in the shell is NPC cast data, route definitions and the peer presentation module only.",
          ),
        },
        {
          question: t("NPC는 어떤 동선을 따라가나요?", "Which routes do NPCs follow?"),
          answer: t(
            "공간 정의에 적힌 points 배열을 따릅니다. 점은 2개부터 16개까지 허용되고, 배포 정의의 NPC들은 처음 점으로 돌아오는 순환 동선을 갖고 있습니다. 점 사이를 잇는 경로는 무대가 계산합니다.",
            "They follow the points arrays written in the space definition. A route allows 2 to 16 points, and NPCs in the shipped definitions carry looped routes that return to the first point. The stage computes the path between points.",
          ),
        },
        {
          question: t("무대 안 길 찾기 성능은 얼마나 되나요?", "How fast is pathfinding inside the stage?"),
          answer: t(
            "이 저장소에서는 확인할 수 없습니다. 내비게이션 메시와 에이전트 설정은 Godot 빌드 안에 있어, 칸 수나 탐색 한도 같은 예전 웹 수치를 무대의 성능처럼 말하지 않습니다.",
            "It cannot be verified from this repository. The navigation mesh and agent settings live inside the Godot build, so old web numbers such as cell counts and search caps are not presented as stage performance.",
          ),
        },
      ],
      pitfall: t(
        "예전 격자 A*의 수치(칸 약 4만 개, 탐색 15만 칸, 캐시 2,000개)를 현행 길 찾기의 값처럼 말하지 마세요. 그 서술은 제거된 웹 클라이언트 기준입니다. 현행으로 말할 수 있는 것은 무대가 길 찾기를 맡는다는 구조와, 셸 정의의 동선 상한뿐입니다.",
        "Do not present the old grid A* numbers (about 40,000 cells, a 150,000-cell search cap, a 2,000-path cache) as values of the current pathfinding. That description belonged to the removed web client. What can be stated as current is the structure, that the stage owns pathfinding, and the route caps in the shell definition.",
      ),
    },
    technologies: ["Godot NavigationAgent", "Godot", "TypeScript", "zod"],
    facts: [
      { value: "최대 6명", label: t("공간 정의 하나가 실을 수 있는 NPC 수 상한", "Maximum NPCs one space definition may carry"), source: `${V}/studio-godot-space.ts` },
      { value: "2~16개", label: t("NPC 동선 points 개수 범위", "Range of NPC route point counts"), source: `${V}/studio-godot-space.ts` },
      { value: "최대 12줄", label: t("NPC 대사 lines 상한", "Cap on NPC dialogue lines"), source: `${V}/studio-godot-space.ts` },
      { value: "최대 24개 · 64개", label: t("공간 정의 구역(zones) · 소품(props) 상한", "Caps on zones and props in a space definition"), source: `${V}/studio-godot-space.ts` },
      { value: "8종 · 7종", label: t("그린 NPC 캐스트 · 절차적 NPC 정의 수", "Drawn NPC cast members and procedural NPC definitions"), source: `${V}/studio-virtual-space-npc-cast.ts` },
      { value: "100ms / 250ms", label: t("셸 피어 타임라인 보간 지연 / 외삽 상한(설계값)", "Shell peer-timeline interpolation delay and extrapolation cap (design values)"), source: `${V}/studio-virtual-space-presentation.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
