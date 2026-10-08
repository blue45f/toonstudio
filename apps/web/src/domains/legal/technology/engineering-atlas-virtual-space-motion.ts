import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 3: 이동·충돌·관성·카메라 · 길 찾기(A*).
 * 경로·수치는 2026-10-07 기준 코드에서 직접 확인한 값이다.
 */

const V = "apps/web/src/domains/creator/virtual-space";

export const VIRTUAL_SPACE_MOTION_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "movement-collision-inertia-camera",
    category: "virtual-space",
    name: "Arcade Physics",
    title: t("관성이 있는 걷기와 부드럽게 따라오는 카메라", "Walking with inertia and a smoothly following camera"),
    status: "live",
    tagline: t(
      "조금씩 빨라지며 걷고, 벽에 처음 닿을 때 살짝 튕기고, 카메라는 프레임과 무관하게 따라옵니다.",
      "You speed up gradually, bounce slightly off a wall once, and the camera follows at a steady feel.",
    ),
    background: [
      t(
        "가상 스튜디오에서 방향키를 누르면 아바타가 곧바로 최고 속도로 튀어 나가지 않고 자전거처럼 조금씩 속도가 붙습니다. 놓으면 미끄러지듯 멈추고, 벽에 부딪히면 살짝 튕깁니다. 이런 '손맛'은 몇 가지 물리 계산으로 만듭니다. 카메라도 아바타에 딱 붙지 않고 약간 늦게, 그러나 항상 같은 속도감으로 따라옵니다.",
        "In the virtual studio, pressing an arrow key does not launch your avatar to top speed instantly; it builds up gradually like a bicycle. When you let go it glides to a stop, and it bounces slightly off walls. This feel comes from a few physics calculations. The camera too does not stick to the avatar; it follows slightly behind, but always with the same sense of speed.",
      ),
      t(
        "매 프레임의 순서는 이렇습니다. ① 키보드·조이스틱·클릭 경로를 방향 벡터로 바꿉니다. ② 목표 속도를 정하고 가속·감속 한도 안에서 현재 속도를 목표로 보냅니다(출발할 때는 120ms 동안 가속을 15%에서 100%로 서서히 올립니다). ③ 급회전이면 속도를 최대 45%까지 줄입니다. ④ 그 속도를 Phaser Arcade 물리 몸체에 넣어 벽과 가구에 막히게 합니다. ⑤ 벽에 처음 닿은 프레임에만 반발 속도를 한 번 줍니다. 물리는 60fps 고정 스텝이라 프레임률이 달라도 결과가 같습니다.",
        "Each frame goes like this. 1) Keyboard, joystick or click-path input becomes a direction vector. 2) A target speed is chosen and the current speed is moved toward it within acceleration and deceleration limits (on starting, acceleration ramps from 15% to 100% over 120 ms). 3) A sharp turn cuts speed down to at most 45%. 4) That speed goes to a Phaser Arcade physics body so walls and furniture block it. 5) Only on the first frame of touching a wall is a rebound velocity applied once. Physics runs on a fixed 60 fps step, so results match across frame rates.",
      ),
      t(
        "카메라는 목표 지점에 매 프레임 일정 비율씩 다가가는 방식(lerp)입니다. 60fps 기준 계수 0.12 를 프레임 길이에 맞춰 환산해(1−(1−0.12)^(dt×60)) 30fps 기기에서도 같은 속도로 따라가고, 델타 상한(0.05초)으로 탭 복귀 뒤 화면이 튀지 않게 합니다. 작은 떨림은 36px 데드존으로 무시하고, 월드 가장자리 160px 안에서는 추종을 미리 늦춥니다. 모션 감소 설정에서는 반발·룩어헤드·흔들림이 꺼집니다.",
        "The camera moves a fixed fraction toward its target each frame (lerp). The 60 fps coefficient 0.12 is converted for the real frame length (1−(1−0.12)^(dt×60)) so a 30 fps device follows at the same speed, and a delta cap (0.05 s) stops the view from jumping after returning to the tab. Small jitters are ignored by a 36 px dead zone, and the follow slows early within 160 px of a world edge. With reduced motion, bounce, look-ahead and shake are switched off.",
      ),
      t(
        "대안은 즉시 가속·정지하는 단순 이동입니다. 구현은 쉽지만 '살아 있는 느낌'이 덜합니다. 대신 관성 이동은 벽 근처에서 끼기 쉬워서 끼임 감지, 직각 방향 밀어내기, 고스트 모드(G 키) 같은 보완 장치를 따로 두었습니다. 숫자는 설계값이며, 바라보는 방향 타입은 위·아래·왼·오른 4종입니다(8방향 걷기가 아닙니다).",
        "The alternative is plain movement with instant acceleration and stopping. It is easy to build but feels less alive. Inertial movement tends to snag near walls, so there are separate safeguards: stuck detection, a perpendicular nudge and a ghost mode (G key). The numbers are design values, and the facing type has four values: up, down, left and right (it is not 8-way walking).",
      ),
    ],
    keyPoints: [
      t("가속·감속으로 걷고 급회전은 속도를 줄입니다", "Walks with acceleration and slows on sharp turns"),
      t("벽에 처음 닿을 때만 한 번 살짝 튕깁니다", "Bounces slightly once, only on first wall contact"),
      t("카메라는 프레임률과 무관하게 같은 속도감", "The camera keeps the same feel at any frame rate"),
    ],
    diagram: {
      id: "movement-collision-inertia-camera-diagram",
      kind: "graph",
      title: t("한 프레임 안의 이동 파이프라인", "The movement pipeline inside one frame"),
      caption: t(
        "입력이 관성과 회전 감속을 거쳐 물리 몸체로 들어가고, 위치를 카메라가 따라갑니다.",
        "Input passes inertia and turn slowdown into the physics body, and the camera follows the position.",
      ),
      alt: t(
        "키보드·조이스틱·클릭 경로 입력이 관성 이징과 급회전 감속을 거친 속도로 바뀌어 Arcade 물리 몸체에 적용됩니다. 벽에 처음 닿으면 반발 속도가 만들어져 다음 프레임의 속도로 이어지고, 몸체의 위치를 카메라가 지연 추종합니다.",
        "Keyboard, joystick and click-path input becomes a speed shaped by inertia easing and sharp-turn slowdown and is applied to the Arcade physics body. On first wall contact a rebound speed is produced and carried into the next frame, while the camera follows the body's position with a lag.",
      ),
      nodes: [
        { id: "input", label: t("입력", "Input"), sub: t("키보드·조이스틱·클릭 경로", "Keys, joystick, click path"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "ease", label: t("관성 이징", "Inertia easing"), sub: t("가속·감속 + 120ms 램프", "Accel, decel, 120 ms ramp"), tone: "local", at: [1, 0] },
        { id: "turn", label: t("급회전 감속", "Turn slowdown"), sub: t("최대 45%까지", "Down to 45%"), tone: "local", at: [2, 0] },
        { id: "body", label: t("Arcade 몸체", "Arcade body"), sub: t("60fps 고정 스텝", "Fixed 60 fps step"), tone: "good", at: [3, 0] },
        { id: "bounce", label: t("충돌 반발", "Rebound"), sub: t("첫 접촉 때 한 번", "Once on first contact"), tone: "warn", at: [4, 0] },
        { id: "camera", label: t("카메라 추종", "Camera follow"), sub: t("lerp 0.12 · 데드존 36px", "lerp 0.12, 36 px dead zone"), tone: "local", at: [3, 1] },
      ],
      edges: [
        { from: "input", to: "ease", label: t("방향", "direction") },
        { from: "ease", to: "turn", label: t("속도", "speed") },
        { from: "turn", to: "body", label: t("적용", "apply") },
        { from: "body", to: "bounce", label: t("벽 접촉", "wall hit") },
        { from: "bounce", to: "ease", label: t("이어받기", "carry on"), style: "dashed" },
        { from: "body", to: "camera", label: t("위치", "position") },
      ],
    },
    usage: [
      {
        feature: t("공간 화면 · 걷기와 벽 충돌", "Spatial screen · walking and wall collisions"),
        role: t(
          "입력을 방향 벡터로 바꾸고 관성 이징·급회전 감속을 거친 속도를 Arcade 몸체에 넣어 벽·가구 충돌을 처리합니다. 걷기 속도는 장소 프로필과 지형에 따라 바뀝니다.",
          "Input becomes a direction vector, and the speed shaped by inertia easing and turn slowdown goes into the Arcade body to handle wall and furniture collisions. Walking speed varies with the place profile and terrain.",
        ),
        paths: [
          `${V}/StudioVirtualSpacePhaserCanvas.tsx`,
          `${V}/studio-virtual-space-motion.ts`,
          `${V}/studio-virtual-space-motion-easing.ts`,
          `${V}/studio-virtual-space-locomotion-presentation.ts`,
        ],
        route: "/studio/space",
      },
      {
        feature: t("충돌 반발과 다른 사람 화면 전파", "Rebound and propagation to others' screens"),
        role: t(
          "벽에 처음 닿은 순간에만 반발을 주고(약한 접촉·모션 감소·효과 낮음에서는 끔), 같은 반발을 속도 값으로 다른 사람 화면에도 보냅니다.",
          "Rebound is applied only at the moment of first wall contact (off for weak contact, reduced motion and low effects), and the same rebound is sent to other people's screens as a velocity.",
        ),
        paths: [`${V}/studio-virtual-space-collision-response.ts`, `${V}/studio-virtual-space-presence-protocol.ts`],
      },
      {
        feature: t("카메라 추종과 연출", "Camera follow and direction"),
        role: t(
          "프레임 독립 lerp·데드존·가장자리 소프트존·룩어헤드로 아바타를 따라가며, 카메라 모드 follow · steady · cinematic 을 지원합니다.",
          "Follows the avatar with frame-independent lerp, a dead zone, an edge soft zone and look-ahead, and supports the camera modes follow, steady and cinematic.",
        ),
        paths: [
          `${V}/studio-virtual-space-presentation.ts#studioCameraLerp`,
          `${V}/studio-virtual-space-world-camera.ts`,
          `${V}/studio-virtual-space-camera-director.ts`,
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("가속·감속 한도 안에서 속도 옮기기", "Moving speed within acceleration limits"),
        language: "ts",
        code: `// 입력 방향 → 목표 속도 → 가속/감속 한도 안에서 현재 속도를 목표로 보낸다(motion.ts 의 단순화).
type V = { x: number; y: number };
const ACCEL = 1500; // 속도를 올릴 때(px/s²)
const DECEL = 2100; // 줄이거나 반대로 꺾을 때(px/s²)

export function stepVelocity(cur: V, input: V, dtSec: number, maxSpeed = 160): V {
  const mag = Math.max(1, Math.hypot(input.x, input.y)); // 대각선도 최고 속도를 넘지 않게 정규화
  const target = { x: (input.x / mag) * maxSpeed, y: (input.y / mag) * maxSpeed };
  const slowing = Math.hypot(target.x, target.y) < Math.hypot(cur.x, cur.y) || target.x * cur.x + target.y * cur.y < 0;
  const dt = Math.min(0.05, Math.max(0, dtSec)); // 긴 프레임 하나에 순간이동하지 않게 50ms 상한
  const limit = (slowing ? DECEL : ACCEL) * dt;
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const diff = Math.hypot(dx, dy);
  const k = diff > 0 ? Math.min(1, limit / diff) : 1;
  return { x: cur.x + dx * k, y: cur.y + dy * k };
}`,
        codeEn: `// Input direction → target speed → move the current speed toward it within accel limits (simplified from motion.ts).
type V = { x: number; y: number };
const ACCEL = 1500; // when speeding up (px/s²)
const DECEL = 2100; // when slowing down or reversing (px/s²)

export function stepVelocity(cur: V, input: V, dtSec: number, maxSpeed = 160): V {
  const mag = Math.max(1, Math.hypot(input.x, input.y)); // normalize so diagonals do not exceed top speed
  const target = { x: (input.x / mag) * maxSpeed, y: (input.y / mag) * maxSpeed };
  const slowing = Math.hypot(target.x, target.y) < Math.hypot(cur.x, cur.y) || target.x * cur.x + target.y * cur.y < 0;
  const dt = Math.min(0.05, Math.max(0, dtSec)); // cap at 50 ms so one long frame cannot teleport
  const limit = (slowing ? DECEL : ACCEL) * dt;
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const diff = Math.hypot(dx, dy);
  const k = diff > 0 ? Math.min(1, limit / diff) : 1;
  return { x: cur.x + dx * k, y: cur.y + dy * k };
}`,
        explain: t(
          "한 프레임에 바꿀 수 있는 속도의 양(limit)이 정해져 있어서 속도가 서서히 붙고 서서히 줄어듭니다. 멈추거나 반대로 꺾을 때는 감속값(더 큰 값)을 써서 반응이 빠릅니다.",
          "The amount the speed can change in one frame (limit) is bounded, so speed builds and fades gradually. Stopping or reversing uses the larger deceleration value so the response is quick.",
        ),
        source: `${V}/studio-virtual-space-motion.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("프레임 길이와 무관한 카메라 추종 계수", "A camera follow factor independent of frame length"),
        language: "ts",
        code: `// 60fps 기준 추종 계수(base)를 프레임 길이에 맞는 계수로 환산한다(studioCameraLerp).
export const cameraLerp = (dtSec: number, base = 0.12): number =>
  1 - Math.pow(1 - base, Math.min(0.05, Math.max(0, dtSec)) * 60);

export function follow(camera: number, target: number, dtSec: number): number {
  return camera + (target - camera) * cameraLerp(dtSec); // 프레임이 길어도 같은 속도로 수렴
}
// 60fps(dt≈0.0167): 약 0.12 / 30fps(dt≈0.0333): 약 0.23 → 두 프레임 몫을 한 번에 따라간다`,
        codeEn: `// Convert a 60 fps follow factor (base) into one for the real frame length (studioCameraLerp).
export const cameraLerp = (dtSec: number, base = 0.12): number =>
  1 - Math.pow(1 - base, Math.min(0.05, Math.max(0, dtSec)) * 60);

export function follow(camera: number, target: number, dtSec: number): number {
  return camera + (target - camera) * cameraLerp(dtSec); // converges at the same speed even with long frames
}
// 60 fps (dt≈0.0167): about 0.12 / 30 fps (dt≈0.0333): about 0.23 → catches up two frames' worth at once`,
        explain: t(
          "매 프레임 12% 씩 다가가는 규칙을 시간 기준으로 바꾼 식입니다. 프레임이 두 배 길면 계수가 약 두 배가 되어 사람이 느끼는 추종 속도가 같아집니다. 델타 상한 0.05초는 탭 복귀 뒤 화면이 튀는 것을 막습니다.",
          "This turns 'approach 12% each frame' into a time-based rule. With a frame twice as long the factor roughly doubles, so the perceived follow speed stays the same. The 0.05 s delta cap prevents a jump after returning to the tab.",
        ),
        source: `${V}/studio-virtual-space-presentation.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Gaffer On Games · Fix Your Timestep!", url: "https://gafferongames.com/post/fix_your_timestep/", kind: "article", note: t("고정 시간 간격이 필요한 이유", "Why a fixed time step matters") },
      { title: "Phaser · Arcade Physics", url: "https://docs.phaser.io/phaser/concepts/physics/arcade", kind: "docs", note: t("몸체·충돌·고정 스텝 설정", "Bodies, collisions and fixed-step settings") },
      { title: "Phaser · Cameras", url: "https://docs.phaser.io/phaser/concepts/cameras", kind: "docs", note: t("추종·경계·줌", "Follow, bounds and zoom") },
      { title: "Rory Driscoll · Frame rate independent damping using lerp", url: "https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/", kind: "article", note: t("프레임 독립 lerp 의 수식", "The math of frame-independent lerp") },
      { title: "MDN · prefers-reduced-motion", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion", kind: "docs", note: t("모션 감소 설정", "The reduced-motion setting") },
    ],
    chapterIds: ["virtual-studio-world-authority", "performance"],
    talk: {
      pitch: t(
        "방향키를 누르면 아바타가 바로 최고 속도로 튀어 나가지 않고 조금씩 빨라지고, 놓으면 미끄러지듯 멈춥니다. 벽에는 처음 닿을 때 한 번만 살짝 튕기고, 카메라는 프레임률이 달라도 같은 속도감으로 따라옵니다. 모션 감소 설정을 켜면 튕김과 카메라 연출은 꺼집니다.",
        "Press an arrow key and the avatar builds speed gradually instead of rocketing off, and glides to a stop when released. It bounces slightly once on first contact with a wall, and the camera follows with the same feel at any frame rate. With reduced motion on, bounce and camera effects are off.",
      ),
      analogy: t(
        "자전거를 타는 느낌입니다. 페달을 밟으면 서서히 빨라지고, 급히 방향을 꺾으면 속도를 줄이며, 벽에 닿으면 살짝 밀려납니다. 카메라는 뒤따라오는 촬영 감독인데 아주 작은 움직임에는 반응하지 않습니다.",
        "It feels like riding a bicycle: you speed up slowly, slow down for a sharp turn, and are nudged back by a wall. The camera is a film director trailing behind who ignores very small movements.",
      ),
      questions: [
        {
          question: t("8방향으로 걷나요?", "Does it walk in eight directions?"),
          answer: t(
            "움직임은 연속적이지만 바라보는 방향 타입은 위·아래·왼·오른 4종입니다. 대각선 움직임은 4방향 중 하나로 표시하고, 경계에서 깜빡이지 않도록 전환 임계값을 달리 둡니다(수평으로 바뀔 때 1.18배, 유지할 때 0.82배).",
            "Movement is continuous but the facing type has four values: up, down, left and right. Diagonal movement is shown as one of the four, with different switch thresholds (1.18× to turn horizontal, 0.82× to stay) so it does not flicker at the boundary.",
          ),
        },
        {
          question: t("프레임이 낮은 기기에서는요?", "What about low-frame-rate devices?"),
          answer: t(
            "물리는 60fps 고정 스텝이고 카메라 추종은 프레임 길이를 환산한 계수를 쓰므로 속도감이 같습니다. 한 프레임이 50ms 를 넘으면 상한으로 잘라 순간이동을 막습니다.",
            "Physics uses a fixed 60 fps step and the camera factor is converted for frame length, so the feel is the same. A frame longer than 50 ms is capped to prevent teleporting.",
          ),
        },
        {
          question: t("최고 속도는 몇인가요?", "What is the top speed?"),
          answer: t(
            "장소 프로필에 따라 다릅니다. 일러스트풍 내장 장소의 걷기 속도는 160px/s(달리기 ×1.3)이고 지형 배율도 곱해집니다. physics 모듈의 210 은 기본 설정값이며 플레이어 최고 속도로 쓰이는 값이 아닙니다.",
            "It depends on the place profile. In illustrated built-in places the walking speed is 160 px/s (sprint ×1.3) and terrain multipliers apply. The 210 in the physics module is a default setting, not the value used as the player's top speed.",
          ),
        },
      ],
      pitfall: t(
        "속도·가속 숫자를 하나로 못 박지 마세요. 장소 프로필·지형·달리기에 따라 바뀌는 설계값이고 체감 측정은 없습니다. 오래된 벤치마크 문서(VIRTUAL_SPACE_BENCHMARK_2026-10-01.md)의 8방향 스프라이트·감속 2200 서술은 현재 코드와 다릅니다.",
        "Do not pin the speed and acceleration to a single number. They are design values that vary with place profile, terrain and sprinting, and no feel measurement exists. The older benchmark document (VIRTUAL_SPACE_BENCHMARK_2026-10-01.md) describing 8-direction sprites and deceleration 2200 does not match the current code.",
      ),
    },
    technologies: ["Phaser 3", "Arcade Physics", "requestAnimationFrame"],
    facts: [
      { value: "1500 / 2100 px/s²", label: t("기본 가속 / 감속(지형·게임필 배율 적용 전, 설계값)", "Base acceleration / deceleration (before terrain and game-feel factors, design value)"), source: `${V}/studio-virtual-space-motion.ts` },
      { value: "160px/s", label: t("일러스트풍 내장 장소의 걷기 속도(설계값)", "Walking speed in illustrated built-in places (design value)"), source: `${V}/studio-virtual-space-locomotion-presentation.ts` },
      { value: "120ms", label: t("출발 가속 램프 길이", "Length of the start acceleration ramp"), source: `${V}/studio-virtual-space-motion-easing.ts` },
      { value: "90px/s · 40%", label: t("반발 최소 충격 속도 · 반발 속도 상한(최고 속도 대비)", "Minimum impact speed for rebound and rebound cap (of top speed)"), source: `${V}/studio-virtual-space-collision-response.ts` },
      { value: "36px", label: t("카메라 데드존 반경(설계값)", "Camera dead-zone radius (design value)"), source: `${V}/studio-virtual-space-locomotion-transitions.ts` },
      { value: "160px", label: t("카메라 가장자리 소프트존 폭(설계값)", "Camera edge soft-zone width (design value)"), source: `${V}/studio-virtual-space-world-camera.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "pathfinding-astar-los",
    category: "virtual-space",
    name: "A* pathfinding",
    title: t("벽을 돌아 목적지까지 걷는 길 찾기", "Finding a way around walls to the destination"),
    status: "live",
    tagline: t(
      "월드를 격자로 바꿔 A* 로 가장 싼 길을 찾고, 시선 검사로 꺾임을 줄입니다.",
      "The world becomes a grid, A* finds the cheapest path, and line-of-sight checks straighten it.",
    ),
    background: [
      t(
        "바닥을 클릭하면 아바타가 벽을 돌아 그곳까지 걸어갑니다. 내비게이션 앱이 도로망에서 길을 찾는 일이 방 안에서 일어나는 셈입니다. 방, 벽, 가구를 바둑판 모양 격자로 바꿔 놓고, 갈 수 있는 칸을 따라 가장 비용이 적은 길을 찾습니다.",
        "Click the floor and the avatar walks around walls to reach it. It is like a navigation app finding a route through a road network, but inside a room. Rooms, walls and furniture are turned into a chessboard-like grid, and the cheapest path along walkable cells is found.",
      ),
      t(
        "순서는 이렇습니다. ① 월드의 충돌 사각형을 격자에 올립니다. 칸 크기는 max(6, ceil(sqrt(가로×세로/40000)))로 정해, 월드가 커져도 전체 칸 수가 약 4만 개를 넘지 않게 칸 간격을 넓힙니다. ② 출발점에서 목적지까지 직선이 통하면 탐색 없이 바로 그 점으로 갑니다. 아니면 A* 가 8방향으로 퍼지며 '지금까지의 비용 + 목표까지 남은 직선거리'가 가장 작은 칸부터 열어 봅니다(최소 힙). ③ 계단처럼 꺾인 경로에서, 현재 점에서 시선이 통하는 가장 먼 점으로 건너뛰어 꺾임을 줄입니다(string pulling). ④ 같은 출발·도착은 캐시합니다(경로 2,000개까지).",
        "The steps are: 1) Place the world's collision rectangles on a grid; the cell size is max(6, ceil(sqrt(width×height/40000))), so the gap widens as the world grows to keep the total near 40,000 cells. 2) If a straight line from the start to the goal is walkable, it goes there without any search. Otherwise A* spreads in eight directions, opening the cell with the smallest 'cost so far plus straight-line distance remaining' first (a min-heap). 3) On the staircase-shaped path, skip to the farthest point visible from the current one to remove bends (string pulling). 4) Identical start and goal pairs are cached (up to 2,000 paths).",
      ),
      t(
        "왜 A* 일까요? 모든 칸을 균일하게 살피는 다익스트라보다 목표 방향을 우선해 적게 탐색하고, 격자 기반이라 기존 충돌 사각형을 그대로 쓸 수 있습니다. 대안인 내비게이션 메시(navmesh)는 경로가 더 매끄럽지만 월드 데이터에서 메시를 만드는 단계가 따로 필요합니다. 격자의 계단 모양은 시선 스무딩으로 보완하고, 칸 수 예산으로 비용이 월드 크기에 끌려가지 않게 했습니다. 같은 격자는 월드 검증(도달 가능성)과 가구 배치 검사에도 쓰입니다.",
        "Why A*? It explores less than Dijkstra, which looks at every cell evenly, because it prefers the goal's direction, and being grid-based it reuses the existing collision rectangles as they are. The alternative, a navigation mesh, gives smoother paths but needs a separate step to build the mesh from world data. The grid's staircase look is fixed by line-of-sight smoothing, and the cell budget keeps cost from growing with world size. The same grid also serves world validation (reachability) and furniture placement checks.",
      ),
      t(
        "한계: 한 번의 탐색이 펼칠 수 있는 칸은 최대 15만 개입니다. 목적지가 막혀 있으면 목표가 보이는 가까운 걷기 가능 지점을 링 모양으로 넓혀 가며(최대 32링) 찾습니다. 목적지가 움직일 때 다시 계산할 시점을 정하는 함수(24px 넘게 움직이면 즉시, 아니면 350ms 간격)는 코드와 테스트에 있지만 제품 코드에서 호출하는 곳을 찾지 못했습니다. 숫자는 설계값이며 월드 크기별 실측 시간은 확인하지 못했습니다. 클릭 이동은 마우스에서 동작하고, 터치에서는 '탭 이동' 조작 모드를 골랐을 때만 동작합니다.",
        "Limits: one search may expand at most 150,000 cells. If the destination is blocked, a nearby walkable point from which the goal is visible is found by widening rings (up to 32). A function that decides when to recompute for a moving goal (immediately beyond 24 px of movement, otherwise every 350 ms) exists in code and tests, but no product call site was found. The numbers are design values, and per-world-size timings were not measured here. Click-to-move works with a mouse, and with touch only when the 'tap to move' control mode is chosen.",
      ),
    ],
    keyPoints: [
      t("벽을 피하는 가장 싼 길을 찾습니다", "Finds the cheapest path around walls"),
      t("시선이 통하면 건너뛰어 꺾임을 줄입니다", "Skips ahead where sight lines are clear to cut bends"),
      t("월드가 커지면 칸 간격을 넓혀 칸 수를 묶습니다", "Widens cells as the world grows to cap the cell count"),
    ],
    diagram: {
      id: "pathfinding-astar-los-diagram",
      kind: "graph",
      title: t("클릭에서 걷기까지의 길 찾기 흐름", "From a click to walking: the pathfinding flow"),
      caption: t(
        "목적지를 정리하고, 격자 위에서 A* 로 찾은 길을 시선 검사로 펴서 따라 걷습니다.",
        "The destination is tidied, A* finds a path on the grid, line-of-sight straightens it, and the avatar follows.",
      ),
      alt: t(
        "목적지를 클릭하면 막힌 곳이면 가까운 걷기 가능 지점으로 보정합니다. 내비 격자 위에서 A* 가 경로를 찾고 시선 스무딩이 꺾임을 줄이면 아바타가 그 경로를 따라 걷습니다.",
        "After a destination click it is adjusted to the nearest walkable point if blocked. A* finds a path on the navigation grid, line-of-sight smoothing removes bends, and the avatar follows that path.",
      ),
      nodes: [
        { id: "click", label: t("목적지 클릭", "Click a goal"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "arrive", label: t("도착점 확인", "Check the goal"), sub: t("막혔으면 가까운 곳", "Nearest if blocked"), tone: "local", at: [1, 0] },
        { id: "astar", label: t("A* 탐색", "A* search"), sub: t("8방향 · 최소 힙", "8 ways, min-heap"), tone: "good", at: [2, 0] },
        { id: "smooth", label: t("시선 스무딩", "Line-of-sight smoothing"), sub: t("꺾임을 줄임", "Fewer bends"), tone: "local", at: [3, 0] },
        { id: "walk", label: t("경로 따라 걷기", "Walk the path"), tone: "local", shape: "pill", at: [4, 0] },
        { id: "grid", label: t("내비 격자", "Navigation grid"), sub: t("칸 약 4만 개 이하", "At most ~40k cells"), tone: "neutral", shape: "cylinder", at: [2, 1] },
      ],
      edges: [
        { from: "click", to: "arrive", label: t("목적지", "goal") },
        { from: "arrive", to: "astar", label: t("도착점", "target") },
        { from: "grid", to: "astar", label: t("칸 정보", "cells") },
        { from: "astar", to: "smooth", label: t("격자 경로", "grid path") },
        { from: "smooth", to: "walk", label: t("매끈한 경로", "smooth path") },
      ],
    },
    usage: [
      {
        feature: t("공간 화면 · 클릭 이동", "Spatial screen · click to move"),
        role: t(
          "마우스(터치는 탭 이동 모드)로 바닥을 누르면 A* 경로를 만들어 따라 걷고, 키보드·조이스틱을 쓰면 경로를 취소합니다.",
          "Pressing the floor with a mouse (or touch in tap-to-move mode) builds an A* path to follow, and using the keyboard or joystick cancels it.",
        ),
        paths: [`${V}/StudioVirtualSpacePhaserCanvas.tsx#setPathTo`, `${V}/studio-virtual-space-world-pathfinding.ts#findStudioWorldPath`],
        route: "/studio/space",
      },
      {
        feature: t("NPC 이동과 길 안내", "NPC movement and guiding"),
        role: t(
          "NPC 가 일과 장소로 걸어가고, 안내 NPC 가 목적지까지 길을 안내할 때 같은 길 찾기를 씁니다.",
          "NPCs walk to their activities, and a guide NPC uses the same pathfinding when leading someone to a destination.",
        ),
        paths: [`${V}/studio-virtual-space-npc-director.ts`, `${V}/studio-virtual-space-npc-guide.ts`],
      },
      {
        feature: t("월드 검증 · 도달 가능성", "World validation · reachability"),
        role: t(
          "같은 격자로 상호작용 지점·좌석 접근로·NPC 일과 장소에 걸어서 닿을 수 있는지 확인하고, 닿을 수 없으면 월드를 거절합니다.",
          "The same grid checks that interaction points, seat approaches and NPC activity spots are reachable on foot, and rejects the world if not.",
        ),
        paths: [`${V}/studio-virtual-space-world-manifest.ts#validateStudioWorldManifest`, `${V}/studio-virtual-space-world-connectivity.ts`],
      },
      {
        feature: t("꾸미기 배치 · 길 막힘 방지", "Decoration placement · keep paths open"),
        role: t(
          "가구를 놓기 전후의 연결성을 비교해, 이어져 있던 곳이 끊기는 배치를 거절합니다.",
          "It compares connectivity before and after placing furniture and rejects a placement that cuts off previously connected areas.",
        ),
        paths: [`${V}/studio-virtual-space-decoration-layout.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("시선이 통하면 건너뛰는 경로 스무딩", "Path smoothing that skips where sight is clear"),
        language: "ts",
        code: `// 격자 경로에서 "직선으로 갈 수 있는 가장 먼 점"으로 건너뛰어 꺾임을 줄인다(string pulling).
type P = { x: number; y: number };

export function smooth(start: P, path: readonly P[], canWalk: (a: P, b: P) => boolean): P[] {
  if (path.length <= 2) return [...path];
  const out: P[] = [];
  let anchor = start;
  let index = 0;
  while (index < path.length) {
    let far = index;
    for (let candidate = path.length - 1; candidate >= index; candidate -= 1) {
      if (canWalk(anchor, path[candidate]!)) { far = candidate; break; } // 가장 먼 점부터 시도
    }
    out.push(path[far]!);
    anchor = path[far]!;
    index = far + 1;
  }
  return out;
}`,
        codeEn: `// From a grid path, jump to the farthest point reachable in a straight line to remove bends (string pulling).
type P = { x: number; y: number };

export function smooth(start: P, path: readonly P[], canWalk: (a: P, b: P) => boolean): P[] {
  if (path.length <= 2) return [...path];
  const out: P[] = [];
  let anchor = start;
  let index = 0;
  while (index < path.length) {
    let far = index;
    for (let candidate = path.length - 1; candidate >= index; candidate -= 1) {
      if (canWalk(anchor, path[candidate]!)) { far = candidate; break; } // try the farthest point first
    }
    out.push(path[far]!);
    anchor = path[far]!;
    index = far + 1;
  }
  return out;
}`,
        explain: t(
          "앵커에서 경로의 끝쪽부터 거꾸로 '직선으로 걸을 수 있나?'를 물어 처음 통과하는 점으로 건너뜁니다. canWalk 는 벽과 아바타 반경을 고려한 선분 검사입니다.",
          "From the anchor it asks from the end of the path backwards 'can I walk there in a straight line?' and jumps to the first point that passes. canWalk is a segment check that accounts for walls and the avatar's radius.",
        ),
        source: `${V}/studio-virtual-space-world-pathfinding.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("월드 크기에 맞춰 칸 간격 정하기", "Choosing the cell size from the world size"),
        language: "ts",
        code: `// 월드가 커져도 격자 칸 수가 약 4만 개를 넘지 않게 칸 간격을 키운다(최소 6px).
const MIN_GRID = 6;
const TARGET_CELLS = 40_000;

export const navGrid = (width: number, height: number): number => {
  const area = Number.isFinite(width) && Number.isFinite(height) ? Math.max(0, width) * Math.max(0, height) : 0;
  return Math.max(MIN_GRID, Math.ceil(Math.sqrt(area / TARGET_CELLS)));
};

// navGrid(1280, 960) → 6px 간격(약 3.4만 칸)
// navGrid(3072, 1920) → 13px 간격(약 3.5만 칸)`,
        codeEn: `// As the world grows, widen the cell gap so the grid stays under about 40,000 cells (minimum 6 px).
const MIN_GRID = 6;
const TARGET_CELLS = 40_000;

export const navGrid = (width: number, height: number): number => {
  const area = Number.isFinite(width) && Number.isFinite(height) ? Math.max(0, width) * Math.max(0, height) : 0;
  return Math.max(MIN_GRID, Math.ceil(Math.sqrt(area / TARGET_CELLS)));
};

// navGrid(1280, 960) → 6 px gap (about 34k cells)
// navGrid(3072, 1920) → 13 px gap (about 35k cells)`,
        explain: t(
          "넓이를 목표 칸 수로 나눈 값의 제곱근이 칸 한 변입니다. 그래서 월드가 커질수록 칸이 거칠어지는 대신 탐색 비용은 거의 일정한 예산 안에 머뭅니다.",
          "The square root of area divided by the target cell count is the side of a cell. A bigger world gets coarser cells, while search cost stays within a roughly fixed budget.",
        ),
        source: `${V}/studio-virtual-space-world-connectivity.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Red Blob Games · Introduction to A*", url: "https://www.redblobgames.com/pathfinding/a-star/introduction.html", kind: "guide", note: t("그림으로 배우는 A*", "A* explained with pictures") },
      { title: "Red Blob Games · Implementation of A*", url: "https://www.redblobgames.com/pathfinding/a-star/implementation.html", kind: "guide", note: t("우선순위 큐와 코드", "Priority queue and code") },
      { title: "Amit Patel · Game Programming Resources", url: "https://theory.stanford.edu/~amitp/GameProgramming/", kind: "article", note: t("휴리스틱·격자·지도 표현 모음", "Heuristics, grids and map representations") },
      { title: "Wikipedia · A* search algorithm", url: "https://en.wikipedia.org/wiki/A*_search_algorithm", kind: "article", note: t("알고리즘 개요", "Algorithm overview") },
    ],
    chapterIds: ["virtual-studio-world-authority", "performance"],
    talk: {
      pitch: t(
        "바닥을 클릭하면 아바타가 벽을 돌아 목적지까지 걸어갑니다. 월드를 격자로 바꿔 A* 라는 길 찾기 알고리즘으로 가장 싼 길을 찾고, 시선이 통하는 곳은 건너뛰어 꺾임을 줄입니다. 월드가 커지면 칸 간격을 넓혀 칸 수를 약 4만 개 이하로 묶어 비용을 예산 안에 둡니다. 같은 격자가 월드 검증과 가구 배치 검사에도 쓰입니다.",
        "Click the floor and the avatar walks around walls to the destination. The world becomes a grid, the A* algorithm finds the cheapest path, and line-of-sight skipping removes bends. As the world grows the cell gap widens to keep cells under about 40,000, holding cost within a budget. The same grid also powers world validation and furniture placement checks.",
      ),
      analogy: t(
        "내비게이션 앱이 도로망 대신 방의 바닥을 바둑판으로 보고 길을 찾는 것과 같습니다. 찾은 길이 계단 모양이면 '저기까지는 곧장 가도 되겠네' 하고 모서리를 잘라 냅니다.",
        "It is like a navigation app that sees the room floor as a chessboard instead of a road network. If the route looks like stairs, it notices 'I can walk straight to there' and cuts the corners.",
      ),
      questions: [
        {
          question: t("월드가 커지면 느려지지 않나요?", "Doesn't it slow down as the world grows?"),
          answer: t(
            "칸 수를 약 4만 개로 묶는 산식이 답입니다. 월드가 커지면 칸이 거칠어져 탐색 비용을 예산 안에 둡니다. 다만 월드 크기별 실측 시간은 확인하지 못했습니다.",
            "The formula that caps cells near 40,000 is the answer: a bigger world gets coarser cells so search cost stays within budget. Per-size timings were not measured, though.",
          ),
        },
        {
          question: t("목적지가 벽 안이면요?", "What if the destination is inside a wall?"),
          answer: t(
            "가까운 걷기 가능 지점을 링 모양으로 넓혀 가며 찾고, 목적지가 보이는 곳을 먼저 고릅니다. 가구 뒤가 아니라 앞에 멈추게 하려는 규칙입니다.",
            "It widens rings to find the nearest walkable point, preferring spots from which the destination is visible, so the avatar stops in front of furniture rather than behind it.",
          ),
        },
        {
          question: t("모바일에서도 클릭 이동이 되나요?", "Does click-to-move work on mobile?"),
          answer: t(
            "터치에서는 조작 방식을 '탭 이동'으로 골랐을 때만 동작합니다. 기본 조작은 화면 조이스틱입니다.",
            "With touch it works only if the control mode is set to tap-to-move. The default control is the on-screen joystick.",
          ),
        },
      ],
      pitfall: t(
        "'최적 경로'라고 단정하지 마세요. 격자 근사에 시선 스무딩을 더한 경로이며, 탐색 한도(15만 칸)와 칸 수 예산은 설계값입니다. '목적지가 움직이면 350ms 마다 재계산'은 제품에 연결된 동작으로 말하지 마세요. 월드별 성능 측정은 확인하지 못했습니다.",
        "Do not call it an 'optimal path'. It is a grid approximation plus line-of-sight smoothing, and the search cap (150,000 cells) and cell budget are design values. Do not describe 'recompute every 350 ms when the goal moves' as wired behavior. Per-world performance measurements were not verified.",
      ),
    },
    technologies: ["A* pathfinding", "Phaser 3", "TypeScript"],
    facts: [
      { value: "40,000칸", label: t("내비 격자 목표 칸 수(설계값)", "Target navigation-grid cell count (design value)"), source: `${V}/studio-virtual-space-world-connectivity.ts` },
      { value: "150,000칸", label: t("한 번의 탐색이 펼칠 수 있는 최대 칸 수(설계값)", "Maximum cells one search may expand (design value)"), source: `${V}/studio-virtual-space-world-pathfinding.ts` },
      { value: "9px", label: t("길 찾기에 쓰는 플레이어 충돌 반경(설계값)", "Player collision radius used by pathfinding (design value)"), source: `${V}/studio-virtual-space-world-pathfinding.ts` },
      { value: "2,000개", label: t("경로 캐시 상한(설계값)", "Path cache cap (design value)"), source: `${V}/studio-virtual-space-world-pathfinding.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
