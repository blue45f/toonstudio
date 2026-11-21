import {
  Compass,
  DoorClosed,
  DoorOpen,
  MoveDown,
  MoveLeft,
  MoveRight,
  MoveUp,
  Send,
  Sparkles,
} from "lucide-react";
import type { MouseEvent } from "react";

import {
  PLAZA_GUILD_ZONES,
  type PlazaFreelancerAvatar,
  type PlazaGuildZoneId,
  type VisibleCrowdAvatarItem,
} from "./mmorpg-global-outsourcing-plaza";
import {
  ACOUSTIC_ROOMS,
  STUDIO_WORLD_HEIGHT,
  STUDIO_WORLD_WIDTH,
  type AcousticRoomId,
  type StudioInteractiveObject,
  type StudioPhysicsWorldState,
  type Vec2,
} from "./vspace-physics-interactions-engine";

export interface StudioGlobalPlazaMapStageProps {
  readonly world: StudioPhysicsWorldState;
  readonly visibleCrowd: readonly VisibleCrowdAvatarItem[];
  readonly totalCrowdCount: number;
  readonly selectedGuildZone: PlazaGuildZoneId | "all";
  readonly selectedFreelancerId: string | null;
  readonly nearestObject: StudioInteractiveObject | null;
  readonly onSelectGuildZone: (zone: PlazaGuildZoneId | "all") => void;
  readonly onClickFloor: (point: Vec2) => void;
  readonly onStepDirection: (dx: number, dy: number) => void;
  readonly onEnterRoom: (roomId: AcousticRoomId) => void;
  readonly onInteractObject: (objectId: string) => void;
  readonly onSelectFreelancer: (freelancer: PlazaFreelancerAvatar) => void;
}

export function StudioGlobalPlazaMapStage({
  world,
  visibleCrowd,
  totalCrowdCount,
  selectedGuildZone,
  selectedFreelancerId,
  nearestObject,
  onSelectGuildZone,
  onClickFloor,
  onStepDirection,
  onEnterRoom,
  onInteractObject,
  onSelectFreelancer,
}: StudioGlobalPlazaMapStageProps) {
  const openDoorIds = new Set(
    world.objects.filter((obj) => obj.kind === "meeting-door" && obj.active).map((obj) => obj.id),
  );

  const handleSvgClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * STUDIO_WORLD_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * STUDIO_WORLD_HEIGHT;
    onClickFloor({ x: Math.round(x), y: Math.round(y) });
  };

  // LOD 분포 통계 (60fps 공간 컬링 상태 확인용)
  let fullBubbleCount = 0;
  let compactCount = 0;
  let dotCount = 0;
  for (const item of visibleCrowd) {
    if (item.lod === "full-bubble") fullBubbleCount += 1;
    else if (item.lod === "compact-badge") compactCount += 1;
    else dotCount += 1;
  }

  return (
    <div className="space-y-3" data-testid="gpp-map-stage">
      {/* 회의실 빠른 입장 & 길드 존 필터 바 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="회의실 바로 이동">
          {ACOUSTIC_ROOMS.map((room) => {
            const isCurrent = world.activeRoomId === room.id;
            const doorObj = room.doorObjectId
              ? world.objects.find((obj) => obj.id === room.doorObjectId)
              : null;
            return (
              <button
                key={room.id}
                type="button"
                className="gpp-chip-btn"
                aria-pressed={isCurrent}
                data-testid={`gpp-enter-room-${room.id}`}
                onClick={() => onEnterRoom(room.id)}
              >
                {doorObj ? (
                  doorObj.active ? (
                    <DoorOpen className="size-3.5 text-good" aria-hidden="true" />
                  ) : (
                    <DoorClosed className="size-3.5 text-bad" aria-hidden="true" />
                  )
                ) : (
                  <Compass className="size-3.5 text-accent" aria-hidden="true" />
                )}
                <span>{room.nameKo}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="gpp-pill" data-tone="accent" data-testid="gpp-lod-summary">
            <span className="gpp-pill-dot" />
            군중 {visibleCrowd.length}/{totalCrowdCount}명 · LOD({fullBubbleCount}/{compactCount}/{dotCount})
          </span>
          <span className="gpp-pill" data-tone="good">
            스태미나 {Math.round(world.stamina)}%
          </span>
        </div>
      </div>

      {/* 길드 존 필터 칩 */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="광장 길드 존 필터">
        <button
          type="button"
          className="gpp-chip-btn"
          aria-pressed={selectedGuildZone === "all"}
          onClick={() => onSelectGuildZone("all")}
        >
          전체 길드 광장 (4존)
        </button>
        {PLAZA_GUILD_ZONES.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className="gpp-chip-btn"
            aria-pressed={selectedGuildZone === zone.id}
            data-testid={`gpp-guild-filter-${zone.id}`}
            onClick={() => onSelectGuildZone(zone.id)}
          >
            {zone.nameKo}
          </button>
        ))}
      </div>

      {/* 인터랙티브 2D 물리·광장 공간 SVG 맵 */}
      <div className="gpp-map-frame">
        <svg
          viewBox={`0 0 ${STUDIO_WORLD_WIDTH} ${STUDIO_WORLD_HEIGHT}`}
          className="gpp-map-svg"
          role="img"
          aria-label="가상 스튜디오 회의실 및 글로벌 MMORPG 외주 광장 공간 맵"
          data-testid="gpp-spatial-svg"
          onClick={handleSvgClick}
        >
          {/* 1. 밀폐 음향 회의실 3종 */}
          {ACOUSTIC_ROOMS.filter((room) => room.id !== "open-lounge").map((room) => (
            <g key={room.id}>
              <rect
                x={room.bounds.minX}
                y={room.bounds.minY}
                width={room.bounds.maxX - room.bounds.minX}
                height={room.bounds.maxY - room.bounds.minY}
                rx={10}
                className="gpp-svg-room"
                data-active={world.activeRoomId === room.id ? "true" : "false"}
              />
              <text x={room.bounds.minX + 12} y={room.bounds.minY + 20} className="gpp-svg-label">
                {room.nameKo}
              </text>
              <text x={room.bounds.minX + 12} y={room.bounds.minY + 34} className="gpp-svg-sublabel">
                방음 {room.wallAttenuationDb}dB · {openDoorIds.has(room.doorObjectId ?? "") ? "문 열림" : "완전 차폐"}
              </text>
            </g>
          ))}

          {/* 2. MMORPG 4대 글로벌 외주 길드 존 */}
          {PLAZA_GUILD_ZONES.map((zone) => (
            <g key={zone.id} opacity={selectedGuildZone === "all" || selectedGuildZone === zone.id ? 1 : 0.35}>
              <rect
                x={zone.bounds.minX}
                y={zone.bounds.minY}
                width={zone.bounds.maxX - zone.bounds.minX}
                height={zone.bounds.maxY - zone.bounds.minY}
                rx={12}
                className="gpp-svg-guild"
                data-accent={zone.accentToken}
              />
              <text x={zone.bounds.minX + 10} y={zone.bounds.minY + 18} className="gpp-svg-label">
                {zone.nameKo}
              </text>
            </g>
          ))}

          {/* 3. 강체 벽 & 방음 슬라이딩 도어 & 테이블 콜라이더 */}
          {world.colliders.map((box) => {
            const isDoor = Boolean(box.doorObjectId);
            const doorOpen = Boolean(box.doorObjectId && openDoorIds.has(box.doorObjectId));
            return (
              <rect
                key={box.id}
                x={box.minX}
                y={box.minY}
                width={box.maxX - box.minX}
                height={box.maxY - box.minY}
                rx={isDoor ? 3 : 4}
                className={isDoor ? "gpp-svg-door" : "gpp-svg-wall"}
                data-open={doorOpen ? "true" : "false"}
              />
            );
          })}

          {/* 4. 10종 스튜디오 인터랙션 오브젝트 */}
          {world.objects.map((obj) => (
            <g
              key={obj.id}
              onClick={(event) => {
                event.stopPropagation();
                onInteractObject(obj.id);
              }}
            >
              <rect
                x={obj.x - 14}
                y={obj.y - 12}
                width={28}
                height={24}
                rx={6}
                className="gpp-svg-object"
                data-active={obj.active ? "true" : "false"}
              />
              <text x={obj.x} y={obj.y + 23} textAnchor="middle" className="gpp-svg-sublabel">
                {obj.nameKo.slice(0, 8)}
              </text>
            </g>
          ))}

          {/* 5. 대규모 글로벌 프리랜서 군중 아바타 (LOD 컬링 렌더링) */}
          {visibleCrowd.map(({ avatar, lod }) => {
            const isSelected = avatar.id === selectedFreelancerId;
            const radius = lod === "full-bubble" ? 10 : lod === "compact-badge" ? 7.5 : 5;
            const avatarClass = [
              avatar.presenceKind === "live-online" ? "gpp-svg-avatar-live" : "gpp-svg-avatar-async",
              isSelected ? "gpp-svg-avatar-selected" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <g
                key={avatar.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectFreelancer(avatar);
                }}
              >
                <circle cx={avatar.x} cy={avatar.y} r={radius} className={avatarClass} />
                {lod === "full-bubble" ? (
                  <g>
                    <rect
                      x={avatar.x - 62}
                      y={avatar.y - 36}
                      width={124}
                      height={22}
                      rx={6}
                      className="gpp-svg-bubble-bg"
                    />
                    <text x={avatar.x} y={avatar.y - 22} textAnchor="middle" className="gpp-svg-sublabel">
                      [{avatar.countryCode}] {avatar.displayName.slice(0, 9)} · ₩{Math.round(avatar.ratePerCutKrw / 1000)}k
                    </text>
                  </g>
                ) : lod === "compact-badge" ? (
                  <text x={avatar.x} y={avatar.y - 11} textAnchor="middle" className="gpp-svg-sublabel">
                    {avatar.countryCode}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* 6. 비행 중인 응원 종이비행기 / 스티커 물리 소품 */}
          {world.projectiles.map((proj) => (
            <g key={proj.id}>
              <circle
                cx={proj.body.x}
                cy={proj.body.y}
                r={proj.body.radius}
                className="gpp-svg-projectile"
              />
              <text x={proj.body.x + 10} y={proj.body.y - 6} className="gpp-svg-sublabel">
                {proj.kind === "paper-plane" ? "✈" : "★"} ({proj.bounces})
              </text>
            </g>
          ))}

          {/* 7. 클릭 이동 웨이포인트 & 내 아바타 */}
          {world.targetPoint ? (
            <circle
              cx={world.targetPoint.x}
              cy={world.targetPoint.y}
              r={8}
              className="gpp-svg-player-aura"
            />
          ) : null}

          <g>
            {world.focusBuffSec > 0 ? (
              <circle
                cx={world.player.x}
                cy={world.player.y}
                r={world.player.radius + 7}
                className="gpp-svg-player-aura"
              />
            ) : null}
            <circle
              cx={world.player.x}
              cy={world.player.y}
              r={world.player.radius}
              className="gpp-svg-player"
            />
            <text x={world.player.x} y={world.player.y + 4} textAnchor="middle" className="gpp-svg-label">
              나
            </text>
          </g>
        </svg>
      </div>

      {/* 이동 조작 & 최근접 오브젝트 상호작용 & 물리 상태 로그 */}
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="아바타 물리 이동 패드">
          <button
            type="button"
            className="gpp-btn"
            aria-label="위로 이동"
            data-testid="gpp-move-up"
            onClick={() => onStepDirection(0, -1)}
          >
            <MoveUp className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="gpp-btn"
            aria-label="왼쪽 이동"
            data-testid="gpp-move-left"
            onClick={() => onStepDirection(-1, 0)}
          >
            <MoveLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="gpp-btn"
            aria-label="아래로 이동"
            data-testid="gpp-move-down"
            onClick={() => onStepDirection(0, 1)}
          >
            <MoveDown className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="gpp-btn"
            aria-label="오른쪽 이동"
            data-testid="gpp-move-right"
            onClick={() => onStepDirection(1, 0)}
          >
            <MoveRight className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="gpp-btn"
            data-variant="warn"
            data-testid="gpp-throw-plane-btn"
            onClick={() => onInteractObject("obj-paper-plane-01")}
          >
            <Send className="size-4" aria-hidden="true" />
            <span>종이비행기 투척 ({world.projectiles.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2 text-xs">
          <div className="min-w-0">
            <p className="font-semibold text-fg" data-testid="gpp-interaction-log">
              {world.lastInteractionLog}
            </p>
            <p className="gpp-num text-fg-2">
              위치 ({Math.round(world.player.x)}, {Math.round(world.player.y)}) · 조명 {world.lightingMood} · 버프{" "}
              {Math.round(world.focusBuffSec)}초
            </p>
          </div>
          {nearestObject ? (
            <button
              type="button"
              className="gpp-btn"
              data-variant="primary"
              data-testid="gpp-interact-nearest-btn"
              onClick={() => onInteractObject(nearestObject.id)}
            >
              <Sparkles className="size-3.5" aria-hidden="true" />
              <span>{nearestObject.nameKo} 사용</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* 10종 스튜디오 상호작용 오브젝트 빠른 실행 그리드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label="스튜디오 상호작용 오브젝트">
        {world.objects.map((obj) => (
          <button
            key={obj.id}
            type="button"
            className="flex min-h-11 flex-col items-start justify-center rounded-xl border border-line bg-card px-3 py-2 text-left text-xs hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"
            data-testid={`gpp-obj-btn-${obj.id}`}
            onClick={() => onInteractObject(obj.id)}
          >
            <span className="font-bold text-fg">{obj.nameKo}</span>
            <span className="mt-0.5 text-fg-2">{obj.stateLabelKo}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
