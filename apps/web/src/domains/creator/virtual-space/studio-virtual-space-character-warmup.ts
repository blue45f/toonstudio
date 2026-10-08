/**
 * 캐릭터 에셋 선적재 정책.
 *
 * 걷기 시트는 움직이는 순간에야 요청하면 도착할 때까지(수십~수백 ms) 정지 그림이 미끄러지고, 처음 쓰는 방향마다 같은 일이 반복된다.
 * 그래서 스킨이 정해지면 네 방향의 정지 그림과 걷기 시트를 미리 받아 둔다.
 * - 내 캐릭터: 항상 선적재한다.
 * - 다른 참가자: 선적재로 새로 올라올 텍스처의 추정 크기가 예산 안일 때만 선적재한다(기본 스타일 팩은 추정 약 3MB(실측 약 2MB), 드로잉·네이티브 시트는 수십 MB라 제외).
 *   한꺼번에 들어와도 지금 보이는 그림의 로드를 막지 않게 아직 받지 않은 스킨은 일정 간격으로 하나씩 요청한다(이미 받은 스킨은 기다리지 않는다).
 * - NPC·배경 배우: 걷기 시트를 거의 쓰지 않아(100초 관찰에서 0장) 선적재하지 않는다.
 */
import {
  STUDIO_PEER_WARM_MAX_BYTES,
  studioCharacterWarmAssets,
  studioCharacterWarmBytes,
  studioCharacterWarmKind,
  studioCharacterWarmOwner,
  type StudioCharacterAssetResidency,
} from "./studio-virtual-space-character-assets";
import type { StudioCharacterSkin } from "./studio-virtual-space-character-skins";

/** 다른 참가자의 새 스킨 선적재 요청 사이 최소 간격(ms). */
export const STUDIO_PEER_WARM_INTERVAL_MS = 400;

export class StudioCharacterWarmup {
  private lastPeerRequestAt = Number.NEGATIVE_INFINITY;
  /** 이 장면에서 이미 선적재를 요청한 스킨. 같은 스킨의 다른 참가자는 새로 내려받을 것이 없어 간격을 기다리지 않는다. */
  private readonly requestedSkins = new Set<string>();

  constructor(
    private readonly residency: Pick<StudioCharacterAssetResidency, "use" | "release">,
    private readonly intervalMs = STUDIO_PEER_WARM_INTERVAL_MS,
  ) {}

  /**
   * 소유자가 쓰는 스킨을 선적재 대상으로 올린다. 프레임마다 불러도 되도록 이미 처리한 스킨이면 바로 돌아온다.
   * @param doneSkinKey 이 소유자에 대해 마지막으로 처리한 스킨 키(스프라이트에 기록해 둔 값)
   * @returns 새로 기록할 처리 완료 스킨 키. 아직 처리하지 않았으면(대상이 아니거나 간격을 기다리는 중) undefined
   */
  request(owner: string, skin: StudioCharacterSkin, doneSkinKey: string | undefined, now: number): string | undefined {
    if (doneSkinKey === skin.key) return undefined;
    const kind = studioCharacterWarmKind(owner);
    if (kind === null) return undefined;
    // 새 스킨을 내려받을 차례를 기다리는 동안에는 스킨 에셋 목록을 만들지 않는다(다음 프레임에 다시 부른다).
    const fresh = kind === "peer" && !this.requestedSkins.has(skin.key);
    if (fresh && now - this.lastPeerRequestAt < this.intervalMs) return undefined;
    const assets = studioCharacterWarmAssets(skin);
    if (kind === "peer" && studioCharacterWarmBytes(skin) > STUDIO_PEER_WARM_MAX_BYTES) {
      // 예산을 넘는 스킨으로 바뀌었다면 이전 스킨의 선적재분을 반납하고 필요한 방향만 지연 적재한다.
      this.residency.release(studioCharacterWarmOwner(owner));
      return skin.key;
    }
    if (fresh) this.lastPeerRequestAt = now;
    if (kind === "peer") this.requestedSkins.add(skin.key);
    this.residency.use(studioCharacterWarmOwner(owner), assets);
    return skin.key;
  }
}
