import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { studioNpcCastLabel, studioNpcCastSkinByKey } from "./studio-virtual-space-npc-cast";
import { studioNpcInteraction, studioNpcLabel } from "./studio-virtual-space-npc-director";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import type { StudioVirtualSpaceWorldManifest, StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

export interface StudioVirtualSpaceNpcPanelProps {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly onInteract: (interaction: StudioWorldInteractionDefinition) => void;
}

/** Keyboard and touch access to the same explicit tool choices as the canvas NPCs. */
export function StudioVirtualSpaceNpcPanel({ manifest, onInteract }: StudioVirtualSpaceNpcPanelProps) {
  const bt = useBilingual("StudioVirtualSpaceNpcPanel");
  // 자르기 없이 전부 훑는다: 앞에서 잘라 내면 상호작용이 있는 NPC가 통째로 빠질 수 있다.
  const assistants = manifest.npcs
    .filter((npc) => studioWorldCanOccupy(manifest, npc.point))
    .flatMap((npc) => {
      const interaction = studioNpcInteraction(manifest, npc);
      if (!interaction) return [];
      // 이름만 필요하므로 텍스처를 만들지 않고 라벨을 조회한다(프로시저럴 스킨 생성은 캔버스가 필요하다).
      // 레지스트리에 없는 키만 기존 폴백 스킨의 라벨을 쓴다.
      let label = studioNpcCastLabel(npc.skinKey);
      if (!label) {
        const fallbackSkin = studioNpcCastSkinByKey(npc.skinKey);
        label = { ko: fallbackSkin.labelKo, en: fallbackSkin.labelEn };
      }
      return [{ npc, interaction, label, role: studioNpcLabel(npc) }];
    });
  if (!assistants.length) return null;

  return (
    <section className="vs2-panel studio-vspace-npc-panel" data-space-interactive="true" aria-label={bt("스튜디오 도우미 NPC", "Studio NPC helpers")}>
      <h2>{bt("스튜디오 도우미", "Studio helpers")}</h2>
      <p>{bt("NPC를 선택하면 연결된 작업 도구를 열어요.", "Choose an NPC to open their workspace tool.")}</p>
      <ul className="studio-vspace-npc-list">
        {assistants.map(({ npc, interaction, label, role }) => (
          <li key={npc.id}>
            <button
              type="button"
              className="studio-vspace-npc-button"
              aria-label={`${bt(label.ko, label.en)} · ${bt(role.ko, role.en)} · ${bt("열기", "Open")} ${bt(interaction.labelKo, interaction.labelEn)}`}
              onClick={() => onInteract(interaction)}
            >
              <span className="studio-vspace-npc-identity">
                <strong>{bt(label.ko, label.en)}</strong>
                <span>{bt(role.ko, role.en)}</span>
              </span>
              <span className="studio-vspace-npc-action">{bt(interaction.labelKo, interaction.labelEn)} {bt("열기", "Open")}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
