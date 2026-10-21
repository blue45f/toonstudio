import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 3: Phaser 캔버스의 이동·충돌·카메라 · 격자 A* 길 찾기.
 * 3D 무대 제거(2026-10-21) 뒤 현행 웹 구현 기준으로 다시 썼다. 경로·수치는
 * 현행 코드 파일에서 직접 확인한 값만 쓴다.
 */

const V = "apps/web/src/domains/creator/virtual-space";

export const VIRTUAL_SPACE_MOTION_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "movement-collision-inertia-camera",
    category: "virtual-space",
    name: "Phaser stage movement",
    title: t("움직임·충돌·카메라는 Phaser 캔버스와 웹 모듈이 계산한다", "Movement, collisions and the camera are computed by the Phaser canvas and web modules"),
    status: "live",
    tagline: t(
      "걷기와 카메라는 Phaser 캔버스가 맡고, 순수 모듈이 관성·충돌·카메라 수치를 계산합니다.",
      "The Phaser canvas owns walking and the camera, and pure modules compute the inertia, collision and camera figures.",
    ),
    background: [
      t(
        "가상 스튜디오의 공간 화면은 웹 캔버스가 직접 그립니다. Phaser 캔버스가 같은 문서 안에서 걷기·벽과 가구의 충돌·카메라 추종을 Arcade 물리로 계산하고, 가속·감속 같은 이동 수치는 순수 타입스크립트 모듈이 따로 계산합니다. 따로 서빙되는 무대 빌드는 없고 웹 앱 자체가 무대입니다.",
        "The virtual studio space is drawn by a web canvas directly. A Phaser canvas in the same document computes walking, collisions with walls and furniture, and camera following with Arcade physics, while movement figures such as acceleration and deceleration are computed by pure TypeScript modules. There is no separately served stage build; the web app itself is the stage.",
      ),
      t(
        "셸과의 경계는 같은 프로세스 안의 브리지 객체입니다. 페이지가 브리지 객체를 캔버스에 prop으로 넘기면 캔버스는 위치·구역 변화를 콜백으로 돌려줍니다. 실시간 티켓은 캔버스가 아니라 협업 전송 층이 소비합니다. 다른 참가자와의 동기화는 프레즌스 프로토콜이 맡습니다. 와이어 이름은 toonstudio-space-v1이고, 위치·상태 패킷은 90ms 간격으로 흐르며 패킷 하나는 1,024바이트를 넘지 않습니다.",
        "The boundary with the shell is a bridge object inside the same process. The page passes the bridge object to the canvas as a prop, and the canvas returns position and zone changes through callbacks. Realtime tickets are consumed by the collaboration transport layer, not the canvas. Sync with other participants runs over the presence protocol: the wire is named toonstudio-space-v1, position and state packets flow every 90 ms, and one packet stays within 1,024 bytes.",
      ),
      t(
        "이동 수치도 웹 코드에서 확인할 수 있습니다. 기본 이동 설정은 가속 1,500, 감속 2,100, 최대 속도 205이고, 카메라는 lerp 0.12로 따라갑니다. 벽에 부딪히면 반발 모듈이 충돌 속도의 최대 40%까지 되돌립니다. 마지막 위치는 기기 로컬에 저장하되 보관 기간은 두지 않고, 같은 장소면 조용히 복원하고 다른 장소면 물어봅니다. 실시간 방은 Worker 설정으로 방당 연결 64가 상한입니다.",
        "Movement figures can also be verified in the web code. The default motion settings are acceleration 1,500, deceleration 2,100 and a top speed of 205, and the camera follows with a lerp of 0.12. On hitting a wall, a bounce module returns up to 40 percent of the impact speed. The last position is stored on the device with no retention period: the same place restores silently and a different place asks first. The realtime room is capped at 64 connections per room by Worker settings.",
      ),
    ],
    keyPoints: [
      t("움직임·충돌·카메라는 Phaser 캔버스와 순수 모듈이 소유", "Movement, collisions and the camera are owned by the Phaser canvas and pure modules"),
      t("셸과는 브리지 객체와 콜백으로 위치·구역만 주고받음", "Only position and zone cross to the shell, via a bridge object and callbacks"),
      t("프레즌스는 90ms 간격, 패킷 상한 1,024바이트", "Presence flows every 90 ms with a 1,024-byte packet cap"),
    ],
    diagram: {
      id: "movement-collision-inertia-camera-diagram",
      kind: "graph",
      title: t("캔버스와 셸 사이의 움직임 동기화", "Movement sync between the canvas and the shell"),
      caption: t(
        "캔버스가 움직임을 계산하고, 셸은 브리지와 프레즌스로 위치·상태를 나눕니다.",
        "The canvas computes movement, and the shell shares position and state over the bridge and presence.",
      ),
      alt: t(
        "Phaser 캔버스가 이동·충돌·카메라를 계산하고, 위치·구역을 브리지 콜백으로 셸에 알립니다. 위치는 프레즌스 패킷으로 다른 참가자에게 전파되고, 셸은 마지막 위치를 기기 로컬에 저장합니다.",
        "The Phaser canvas computes movement, collisions and the camera, and reports position and zone to the shell through bridge callbacks. Positions travel to other participants as presence packets, and the shell stores the last position on the device.",
      ),
      nodes: [
        { id: "shell", label: t("웹 셸", "Web shell"), sub: t("계정·티켓·패널", "Account, ticket, panels"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "bridge", label: t("브리지", "Bridge"), sub: t("브리지 객체", "Bridge object"), tone: "local", at: [1, 0] },
        { id: "stage", label: t("Phaser 캔버스", "Phaser canvas"), sub: t("이동·충돌·카메라", "Move, collide, camera"), tone: "good", at: [2, 0] },
        { id: "presence", label: t("프레즌스", "Presence"), sub: t("90ms 위치·상태", "90 ms position"), tone: "local", at: [3, 0] },
        { id: "peers", label: t("다른 참가자", "Other peers"), sub: t("위치·상태 수신", "Receive state"), tone: "local", shape: "pill", at: [4, 0] },
        { id: "store", label: t("위치 저장", "Position store"), sub: t("기기 로컬 · 기간 없음", "Local, no expiry"), tone: "neutral", at: [2, 1] },
      ],
      edges: [
        { from: "shell", to: "bridge", label: t("브리지 객체", "bridge object") },
        { from: "bridge", to: "stage", label: t("prop 전달", "pass prop") },
        { from: "stage", to: "presence", label: t("위치", "position") },
        { from: "presence", to: "peers", label: t("전파", "relay") },
        { from: "stage", to: "store", label: t("위치 통지", "position") },
      ],
    },
    usage: [
      {
        feature: t("공간 화면 · Phaser 캔버스", "Spatial screen · Phaser canvas"),
        role: t(
          "페이지가 Phaser 캔버스를 같은 문서에 마운트하고, 캔버스가 공간 렌더와 이동·충돌·카메라를 소유합니다. 계정·티켓은 셸과 전송 층이 맡습니다.",
          "The page mounts the Phaser canvas in the same document, and the canvas owns space rendering and movement, collisions and the camera. The shell and transport layer own accounts and tickets.",
        ),
        paths: [
          `${V}/StudioVirtualSpacePhaserCanvas.tsx`,
          `${V}/StudioVirtualSpacePageRoot.tsx`,
        ],
        route: "/studio/space",
      },
      {
        feature: t("프레즌스 브리지 · 위치·상태 동기화", "Presence bridge · position and state sync"),
        role: t(
          "캔버스가 보고한 위치·바라보는 방향·구역을 와이어 패킷으로 인코딩해 다른 참가자와 주고받고, 오래된 피어는 만료시킵니다.",
          "Positions, facing and zones reported by the canvas are encoded as wire packets, exchanged with other participants, and stale peers expire.",
        ),
        paths: [`${V}/studio-virtual-space-presence-protocol.ts`, `${V}/studio-virtual-space-presence.ts`],
      },
      {
        feature: t("캔버스↔셸 브리지와 마지막 위치 저장", "Canvas-shell bridge and last-position store"),
        role: t(
          "브리지 객체가 요청·이벤트 타입을 정의하고, 마지막 위치의 기기 로컬 저장(기간 제한 없음)과 복원 판정을 순수 모듈이 맡습니다. 캔버스는 이 경계로만 셸과 이야기합니다.",
          "The bridge object defines the request and event types, and pure modules own the on-device last-position store (no retention limit) and the resume decision. The canvas talks to the shell only across this boundary.",
        ),
        paths: [`${V}/studio-virtual-space-engine-bridge.ts`, `${V}/studio-virtual-space-last-position.ts`],
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
          "캔버스가 만든 위치·상태는 이 패킷 모양으로만 셸 밖으로 나갑니다. 크기 상한을 넘는 패킷은 보내지 않으며, 전송 간격과 하트비트도 프로토콜 상수로 고정돼 있습니다.",
          "Position and state made by the canvas leave the shell only in this packet shape. A packet over the size cap is not sent, and the send interval and heartbeat are fixed as protocol constants.",
        ),
        source: `${V}/studio-virtual-space-presence-protocol.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("마지막 위치 저장과 복원 판정", "Saving the last position and the resume decision"),
        language: "ts",
        code: `// 마지막 위치는 기기 로컬에 저장한다(last-position 모듈의 단순화).
const PREFIX = "toonspectrum:virtual-space-last-position:v1";

export interface LastPositionRecord { placeId: string; point: { x: number; y: number }; savedAt: number }

export function resumeDecision(record: LastPositionRecord, placeId: string): "silent" | "ask" {
  return record.placeId === placeId ? "silent" : "ask"; // 보관 기간은 없고 장소 일치가 복원 방식을 정한다
}

export function saveLastPosition(projectId: string, record: LastPositionRecord): void {
  try {
    window.localStorage.setItem(PREFIX + ":" + projectId, JSON.stringify(record));
  } catch {
    // 저장 실패는 복원을 포기할 뿐 공간 동작에 영향을 주지 않는다.
  }
}`,
        codeEn: `// The last position is stored on the device (simplified from the last-position module).
const PREFIX = "toonspectrum:virtual-space-last-position:v1";

export interface LastPositionRecord { placeId: string; point: { x: number; y: number }; savedAt: number }

export function resumeDecision(record: LastPositionRecord, placeId: string): "silent" | "ask" {
  return record.placeId === placeId ? "silent" : "ask"; // no retention period; the place match decides the restore mode
}

export function saveLastPosition(projectId: string, record: LastPositionRecord): void {
  try {
    window.localStorage.setItem(PREFIX + ":" + projectId, JSON.stringify(record));
  } catch {
    // A failed save only gives up restoring; it never affects the space.
  }
}`,
        explain: t(
          "위치 복원은 셸의 일입니다. 저장 시각만 기록하고 보관 기간은 두지 않으며, 같은 장소면 조용히 복원하고 다른 장소면 사용자에게 물어봅니다. 서버에는 위치를 저장하지 않습니다.",
          "Restoring position is the shell's job. Only the save time is recorded, with no retention period: the same place restores silently and a different place asks the user first. The position is not stored on a server.",
        ),
        source: `${V}/studio-virtual-space-last-position.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Phaser · Documentation", url: "https://docs.phaser.io/", kind: "docs", note: t("무대 엔진 문서", "Stage engine documentation") },
      { title: "MDN · requestAnimationFrame", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame", kind: "docs", note: t("프레임 루프의 바탕", "The basis of the frame loop") },
      { title: "MDN · Web Storage API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API", kind: "docs", note: t("기기 로컬 저장", "On-device storage") },
      { title: "MDN · Canvas API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API", kind: "docs", note: t("캔버스 렌더링", "Canvas rendering") },
    ],
    chapterIds: ["virtual-studio-world-authority", "performance"],
    talk: {
      pitch: t(
        "공간에서 걷고 벽에 부딪히고 카메라가 따라오는 일은 웹 코드 안에서 일어납니다. Phaser 캔버스가 Arcade 물리로 이동·충돌·카메라를 계산하고, 순수 모듈이 가속 1,500·감속 2,100·최대 속도 205 같은 이동 수치를 정합니다. 위치와 상태는 프레즌스 패킷으로 90ms 간격 주고받습니다.",
        "Walking, hitting walls and the camera following happen inside the web code. The Phaser canvas computes movement, collisions and the camera with Arcade physics, and pure modules set movement figures such as acceleration 1,500, deceleration 2,100 and a top speed of 205. Position and state cross as presence packets every 90 ms.",
      ),
      analogy: t(
        "무대와 로비가 한 건물에 있는 극장입니다. 배우(캔버스)가 무대에서 연기하고, 로비(셸)는 표를 끊고 안내합니다. 로비는 배우의 걸음을 대신 계산하지 않지만, 배우가 알려 준 위치는 다른 관객에게 전합니다.",
        "It is a theatre where the stage and the lobby share one building. The actor (the canvas) performs on stage, and the lobby (the shell) sells tickets and guides visitors. The lobby does not compute the actor's steps, but it relays the positions the actor reports to the other visitors.",
      ),
      questions: [
        {
          question: t("가속도 같은 무대 안 수치는 얼마인가요?", "What are the stage-internal numbers, like acceleration?"),
          answer: t(
            "웹 코드에서 직접 확인할 수 있습니다. 기본 이동 설정은 가속 1,500, 감속 2,100, 최대 속도 205이고, 카메라 추종 lerp는 0.12입니다. 전부 가상 스튜디오의 순수 모듈에 상수로 있습니다.",
            "They can be verified directly in the web code. The default motion settings are acceleration 1,500, deceleration 2,100 and a top speed of 205, and the camera follow lerp is 0.12. All of them live as constants in the virtual studio's pure modules.",
          ),
        },
        {
          question: t("캔버스 밖에서는 움직임을 다루지 않나요?", "Is movement handled anywhere outside the canvas?"),
          answer: t(
            "물리 계산은 캔버스가 합니다. 셸은 브리지 객체로 이모트나 순간이동 같은 요청을 보내고, 캔버스가 보고한 위치를 프레즌스로 전파하며, 마지막 위치를 기기 로컬에 저장해 복원하는 일까지만 맡습니다.",
            "Physics runs in the canvas. The shell only sends requests such as emotes or teleports through the bridge object, relays the positions the canvas reports over presence, and stores the last position on the device for restoring.",
          ),
        },
        {
          question: t("다른 사람 아바타는 어떻게 따라오나요?", "How do other people's avatars keep up?"),
          answer: t(
            "각 클라이언트가 자기 아바타의 위치·방향·구역을 프레즌스 패킷으로 보내고, 받는 쪽이 그 상태로 상대 아바타를 표시합니다. 하트비트는 2,500ms 간격이고 10,000ms 동안 소식이 없으면 피어는 만료됩니다.",
            "Each client sends its avatar's position, facing and zone as presence packets, and the receiving side renders the peer from that state. The heartbeat runs every 2,500 ms, and a peer expires after 10,000 ms without news.",
          ),
        },
      ],
      pitfall: t(
        "무대 안 수치를 웹 코드에서 확인할 수 없다고 말하지 마세요. 가속 1,500·감속 2,100·카메라 lerp 0.12는 현행 순수 모듈의 상수입니다. 반대로 마지막 위치에 30일 같은 보관 기간은 없으니, 없는 수치를 있는 것처럼 말하지 마세요.",
        "Do not say stage-internal numbers cannot be verified from the web code. Acceleration 1,500, deceleration 2,100 and a camera lerp of 0.12 are constants in the current pure modules. Conversely, the last position has no 30-day retention period, so do not present a number that does not exist.",
      ),
    },
    technologies: ["Phaser", "Arcade Physics", "TypeScript", "presence protocol"],
    facts: [
      { value: "toonstudio-space-v1", label: t("프레즌스 와이어 이름", "Presence wire name"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "90ms", label: t("프레즌스 전송 간격(설계값)", "Presence send interval (design value)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "2,500ms · 10,000ms", label: t("하트비트 간격 · 피어 만료 기준(설계값)", "Heartbeat interval and peer expiry threshold (design values)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "1,024바이트", label: t("프레즌스 패킷 크기 상한(fixtures 패킷 제외)", "Presence packet size cap (except fixtures packets)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "1,500 · 2,100 · 205", label: t("이동 가속 · 감속 · 최대 속도(설계값)", "Movement acceleration, deceleration and top speed (design values)"), source: `${V}/studio-virtual-space-motion.ts` },
      { value: "64", label: t("실시간 방당 연결 상한(Worker 설정값)", "Realtime connections cap per room (Worker setting)"), source: "deploy/cloudflare-realtime/wrangler.jsonc" },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "pathfinding-astar-los",
    category: "virtual-space",
    name: "Phaser stage A* pathfinding",
    title: t("길 찾기는 격자 A*와 시야 평탄화로 웹 코드가 계산한다", "Pathfinding is computed by grid A* and line-of-sight smoothing in web code"),
    status: "live",
    tagline: t(
      "클릭 이동과 NPC 순찰은 A*가 길을 찾고, 순수 모듈이 탐색·캐시 한도를 담당합니다.",
      "Click-to-move and NPC patrols run on A*; pure modules own the search and its caps.",
    ),
    background: [
      t(
        "바닥을 클릭하면 아바타가 벽을 돌아 걷고, NPC가 순찰 경로를 따라 이동하는 일은 웹 코드 안에서 일어납니다. 순수 모듈이 격자 위에서 A* 탐색을 돌리고(g 비용 힙, 8방향, 코너 커팅 방지), 캔버스가 클릭 지점을 모듈에 넘기는 진입점(setPathTo)을 엽니다. NPC 디렉터와 가이드는 탐색 결과를 순찰로 이어 줍니다.",
        "Clicking the floor so the avatar walks around walls, and NPCs moving along their patrol routes, happen inside the web code. A pure module runs A* search over the grid (a g-cost heap, eight directions, corner-cutting prevention), and the canvas opens an entry point (setPathTo) that hands click targets to the module. The NPC director and guide turn search results into patrols.",
      ),
      t(
        "월드의 재료는 매니페스트가 정합니다. 순찰 경로는 정의 하나에 최대 256점까지 실을 수 있고, NPC 배열 전체는 월드 총량 상한(4,096개) 안에서 들어갑니다. NPC 정의에는 대사 필드가 없으며, 인사는 근접 모듈이 거리를 보고 따로 거는 일입니다.",
        "The world manifest decides the ingredients. A patrol route may carry up to 256 points in one definition, and the whole NPC array fits within the world total cap of 4,096. NPC definitions carry no dialogue field; greetings are triggered separately by the proximity module watching distance.",
      ),
      t(
        "탐색 한도도 웹 코드에 상수로 있습니다. 탐색은 150,000칸까지 확장하고, 경로 캐시는 2,000개, 직선 캐시는 20,000개를 유지하며, 이동 중 재계산은 350ms 간격으로 제한합니다. 셸의 프레즌스 표현 모듈은 다른 참가자의 위치 표본을 100ms 지연으로 보간하고 최대 250ms까지 외삽합니다.",
        "Search caps also live as constants in the web code. A search expands up to 150,000 cells, the path cache holds 2,000 entries and the line-of-sight cache 20,000, and replanning while moving is limited to a 350 ms interval. The shell's presence presentation module interpolates other participants' position samples with a 100 ms delay and extrapolates up to 250 ms.",
      ),
    ],
    keyPoints: [
      t("길 찾기는 격자 A*와 시야 평탄화가 맡습니다", "Pathfinding belongs to grid A* with line-of-sight smoothing"),
      t("캔버스의 setPathTo가 클릭을 경로로 잇습니다", "The canvas setPathTo entry turns clicks into paths"),
      t("탐색·캐시 한도는 순수 모듈의 상수입니다", "Search and cache caps are constants in the pure module"),
    ],
    diagram: {
      id: "pathfinding-astar-los-diagram",
      kind: "graph",
      title: t("매니페스트와 캐스트가 A* 길 찾기로 이어지는 흐름", "How the manifest and cast feed A* pathfinding"),
      caption: t(
        "순수 모듈이 A*로 경로를 계산하면, 캔버스와 NPC 디렉터가 그 경로를 따라 걷습니다.",
        "A pure module computes the route with A*, and the canvas and the NPC director walk along it.",
      ),
      alt: t(
        "월드 매니페스트의 타일·NPC 순찰과 NPC 캐스트 데이터가 길 찾기 모듈로 들어갑니다. A*가 경로를 계산하고 시야 평탄화로 다듬으면, 아바타와 NPC가 그 경로를 따라 걷습니다.",
        "The world manifest's tiles and NPC patrols, together with NPC cast data, enter the pathfinding module. A* computes a route and line-of-sight smoothing refines it, and avatars and NPCs walk along it.",
      ),
      nodes: [
        { id: "def", label: t("월드 매니페스트", "World manifest"), sub: t("순찰·NPC·타일", "Patrol, NPCs, tiles"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "stage", label: t("길 찾기 모듈", "Pathfinding module"), sub: t("A* · 평탄화", "A*, smoothing"), tone: "local", at: [1, 0] },
        { id: "nav", label: t("A* 탐색", "A* search"), sub: t("힙 · 8방향", "Heap, 8-way"), tone: "good", at: [2, 0] },
        { id: "walk", label: t("경로 따라 걷기", "Walk the route"), sub: t("클릭 이동·NPC 순찰", "Click-to-move, NPC patrol"), tone: "local", shape: "pill", at: [3, 0] },
        { id: "cast", label: t("NPC 캐스트", "NPC cast"), sub: t("그린 캐스트 8종", "8 drawn cast members"), tone: "neutral", shape: "cylinder", at: [1, 1] },
      ],
      edges: [
        { from: "def", to: "stage", label: t("재료", "input") },
        { from: "cast", to: "stage", label: t("캐스트", "cast") },
        { from: "stage", to: "nav", label: t("탐색", "search") },
        { from: "nav", to: "walk", label: t("경로", "route") },
      ],
    },
    usage: [
      {
        feature: t("월드 길 찾기 · A*와 평탄화", "World pathfinding · A* and smoothing"),
        role: t(
          "격자 A*와 코너 커팅 방지, 시야 평탄화, 탐색·캐시 상한이 순수 모듈에 있습니다. 클릭 이동과 NPC 순찰이 이 경로를 씁니다.",
          "Grid A* with corner-cutting prevention, line-of-sight smoothing, and the search and cache caps live in a pure module. Click-to-move and NPC patrols use this path.",
        ),
        paths: [`${V}/studio-virtual-space-world-pathfinding.ts`],
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
        feature: t("공간 화면 · 클릭 진입점과 피어 표현", "Spatial screen · click entry and peer presentation"),
        role: t(
          "캔버스의 setPathTo가 포인터 클릭을 경로 요청으로 바꾸고, NPC 디렉터·가이드가 순찰을 잇습니다. 다른 참가자의 움직임은 프레즌스 표현 모듈의 타임라인 보간으로 매끄럽게 보입니다.",
          "The canvas setPathTo turns pointer clicks into path requests, and the NPC director and guide carry patrols onward. Other participants' movement is shown smoothly through the presence presentation module's timeline interpolation.",
        ),
        paths: [`${V}/StudioVirtualSpacePhaserCanvas.tsx`, `${V}/studio-virtual-space-npc-director.ts`, `${V}/studio-virtual-space-presentation.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("탐색·캐시 상한과 재계산 간격", "Search and cache caps and the repath interval"),
        language: "ts",
        code: `// 길 찾기 모듈의 탐색·캐시 상한(단순화).
export const MAX_EXPANSIONS = 150_000; // 한 번의 탐색이 확장할 수 있는 칸 수 상한
export const MAX_LINE_CACHE = 20_000; // 직선(보이는지) 판정 캐시 상한
export const MAX_PATH_CACHE = 2_000; // 계산한 경로 캐시 상한
export const LIVE_REPATH_MS = 350; // 이동 중 재계산 간격

export function canExpand(expansions: number): boolean {
  return expansions < MAX_EXPANSIONS; // 상한을 넘으면 탐색을 멈추고 찾지 못함으로 돌려준다
}`,
        codeEn: `// Search and cache caps of the pathfinding module (simplified).
export const MAX_EXPANSIONS = 150_000; // max cells one search may expand
export const MAX_LINE_CACHE = 20_000; // cap of the line-of-sight judgement cache
export const MAX_PATH_CACHE = 2_000; // cap of the computed-path cache
export const LIVE_REPATH_MS = 350; // replanning interval while moving

export function canExpand(expansions: number): boolean {
  return expansions < MAX_EXPANSIONS; // past the cap the search stops and reports not found
}`,
        explain: t(
          "탐색이 무한히 커지지 않도록 상한이 모듈 상수로 고정돼 있습니다. 상한을 넘는 목표는 길을 찾지 못한 것으로 처리하고, 직선 캐시가 있으면 벽 검사를 건너뜁니다.",
          "Caps are fixed as module constants so a search cannot grow without bound. A target past the cap is treated as not found, and a line-of-sight cache hit skips the wall checks.",
        ),
        source: `${V}/studio-virtual-space-world-pathfinding.ts`,
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
          "패널과 대화처럼 이름만 필요한 곳은 이 조회만 씁니다. 캐스트는 NPC 자료이며, NPC 디렉터와 Phaser 캔버스가 이 인물들을 순찰 경로 위로 움직입니다.",
          "Places that need only a name, such as panels and dialogue, use just this lookup. The cast is NPC material, and the NPC director and the Phaser canvas move these characters along their patrol routes.",
        ),
        source: `${V}/studio-virtual-space-npc-cast.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Red Blob Games · Introduction to A*", url: "https://www.redblobgames.com/pathfinding/a-star/introduction.html", kind: "guide", note: t("격자 길 찾기의 배경 지식", "Background reading on grid pathfinding") },
      { title: "Wikipedia · A* search algorithm", url: "https://en.wikipedia.org/wiki/A*_search_algorithm", kind: "article", note: t("A* 알고리즘 개요", "An overview of the A* algorithm") },
      { title: "Phaser · Documentation", url: "https://docs.phaser.io/", kind: "docs", note: t("무대 엔진 문서", "Stage engine documentation") },
      { title: "MDN · Canvas API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API", kind: "docs", note: t("캔버스 렌더링", "Canvas rendering") },
    ],
    chapterIds: ["virtual-studio-world-authority", "performance"],
    talk: {
      pitch: t(
        "바닥을 클릭해 벽을 돌아 걷는 길 찾기와 NPC가 순찰 경로를 따라 움직이는 일은 웹 코드의 격자 A*가 맡습니다. 탐색은 150,000칸 상한 안에서 돌고, 계산한 경로는 2,000개까지 캐시에 남습니다. 캔버스는 setPathTo로 클릭을 경로 요청으로 바꾸고, NPC 디렉터가 순찰을 잇습니다.",
        "Pathfinding that walks around walls after a floor click, and NPCs following their patrol routes, belong to grid A* in the web code. A search runs within a 150,000-cell cap, and computed paths stay in a cache of up to 2,000 entries. The canvas turns clicks into path requests with setPathTo, and the NPC director carries patrols onward.",
      ),
      analogy: t(
        "순수 모듈은 내비게이션 엔진이고, 캔버스와 디렉터는 운전자입니다. 어디로 가야 하는지는 자료(매니페스트)가 말하고, 실제 길 계산은 엔진이, 운전은 운전자가 합니다.",
        "The pure module is the navigation engine, and the canvas and the director are the drivers. Where to go is stated by the data (the manifest); the engine computes the actual route, and the drivers drive it.",
      ),
      questions: [
        {
          question: t("셸에 A* 길 찾기가 남아 있나요?", "Is A* pathfinding still in the shell?"),
          answer: t(
            "네, 공간 화면의 현행 길 찾기가 격자 A*입니다. 클릭 지점을 넘기는 setPathTo 진입점과 NPC 디렉터·가이드가 현행으로 동작하고, 캐스트 데이터와 피어 표현 모듈도 함께 씁니다.",
            "Yes, the space screen's current pathfinding is grid A*. The setPathTo entry that hands over click targets and the NPC director and guide run as current code, together with the cast data and the peer presentation module.",
          ),
        },
        {
          question: t("NPC는 어떤 동선을 따라가나요?", "Which routes do NPCs follow?"),
          answer: t(
            "월드 매니페스트의 순찰(patrol) 배열을 따릅니다. 순찰 점은 정의 하나에 최대 256개까지 허용되고, 점 사이 경로는 A*가 계산합니다. NPC 정의에는 대사 필드가 없고, 인사는 근접 모듈이 거리를 보고 따로 겁니다.",
            "They follow the patrol arrays in the world manifest. A patrol may hold up to 256 points in one definition, and A* computes the path between points. NPC definitions carry no dialogue field; greetings are triggered separately by the proximity module watching distance.",
          ),
        },
        {
          question: t("길 찾기 성능은 얼마나 제한되나요?", "How limited is pathfinding performance?"),
          answer: t(
            "탐색 확장 150,000칸, 경로 캐시 2,000개, 직선 캐시 20,000개가 상한이고, 이동 중 재계산은 350ms 간격으로 제한됩니다. 전부 길 찾기 모듈의 상수에서 확인할 수 있습니다.",
            "A search may expand 150,000 cells, the path cache holds 2,000 entries and the line-of-sight cache 20,000, and replanning while moving is limited to a 350 ms interval. All of them can be verified in the pathfinding module's constants.",
          ),
        },
      ],
      pitfall: t(
        "무대 내비게이션이 길 찾기를 맡는다고 말하지 마세요. 현행 길 찾기는 웹 코드의 격자 A*이며 탐색 150,000칸·경로 캐시 2,000개 같은 수치가 정본입니다. 반대로 NPC 6명·동선 16점·대사 12줄 같은 삭제된 공간 정의의 상한을 현행처럼 말하지 마세요.",
        "Do not say stage navigation owns pathfinding. The current pathfinding is grid A* in the web code, and figures such as the 150,000-cell search cap and the 2,000-entry path cache are canonical. Conversely, do not present the removed space definition's caps, such as 6 NPCs, 16 route points and 12 lines, as current.",
      ),
    },
    technologies: ["A* search", "TypeScript", "Phaser", "zod"],
    facts: [
      { value: "150,000칸", label: t("A* 탐색 확장 상한", "A* search expansion cap"), source: `${V}/studio-virtual-space-world-pathfinding.ts` },
      { value: "2,000개 · 20,000개", label: t("경로 캐시 · 직선 캐시 상한", "Path cache and line-of-sight cache caps"), source: `${V}/studio-virtual-space-world-pathfinding.ts` },
      { value: "350ms", label: t("이동 중 재계산 간격(설계값)", "Replanning interval while moving (design value)"), source: `${V}/studio-virtual-space-world-pathfinding.ts` },
      { value: "최대 256점", label: t("NPC 순찰 경로 점 상한(정의 하나)", "Cap on NPC patrol points in one definition"), source: `${V}/studio-virtual-space-world-manifest.ts` },
      { value: "8종", label: t("그린 NPC 캐스트 수", "Drawn NPC cast members"), source: `${V}/studio-virtual-space-npc-cast.ts` },
      { value: "100ms / 250ms", label: t("셸 피어 타임라인 보간 지연 / 외삽 상한(설계값)", "Shell peer-timeline interpolation delay and extrapolation cap (design values)"), source: `${V}/studio-virtual-space-presentation.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
