import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { spaceKoParticle } from "./hud/space-korean";
import type { StudioVirtualSlotLeaseSnapshot } from "./studio-virtual-space-slot-lease";
import type { StudioWorldInteractionSlotDefinition } from "./studio-virtual-space-world-manifest";

export function StudioVirtualSpaceSeatsPanel({ slots, snapshot, approachingSlotId, onSelect, onRelease, preferredSlotId, onPreferSlot }: {
  readonly slots: readonly StudioWorldInteractionSlotDefinition[];
  readonly snapshot: StudioVirtualSlotLeaseSnapshot;
  readonly approachingSlotId: string | null;
  readonly onSelect: (slotId: string) => void;
  readonly onRelease: () => void;
  readonly preferredSlotId?: string | null;
  readonly onPreferSlot?: (slotId: string) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceSeatsPanel");
  if (!slots.length) return null;
  const occupiedIds = new Set(snapshot.occupied.map((item) => item.slotId));
  const freeSlots = snapshot.available ? slots.filter((slot) => !occupiedIds.has(slot.id)) : [];
  const preferredFreeSlot = preferredSlotId ? freeSlots.find((slot) => slot.id === preferredSlotId) ?? null : null;
  const recommendedSlot = preferredFreeSlot ?? freeSlots[0] ?? null;
  const hasActiveClaim =
    snapshot.status === "held" ||
    snapshot.status === "requesting" ||
    approachingSlotId !== null;

  return <section className="vs2-panel" aria-label={bt("함께 쓰는 작업 자리", "Shared workspaces")} data-space-interactive="true">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">{bt("작업 자리", "Workspaces")}</h2>
      {snapshot.available ? (
        <span
          className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold text-fg-2"
          data-available-seats={freeSlots.length}
          data-occupied-seats={occupiedIds.size}
        >
          {bt(`여유 ${freeSlots.length}석 · 사용 ${occupiedIds.size}석`, `${freeSlots.length} open · ${occupiedIds.size} in use`)}
        </span>
      ) : null}
    </div>
    <p className="mt-2 text-xs text-fg-2">{bt("빈 자리를 선택하면 그곳으로 이동해 사용을 확인해요. 문서 편집 권한은 달라지지 않아요.", "Choose an available desk to walk there and confirm its use. Document permissions remain separate.")}</p>
    {onPreferSlot ? <p className="mt-2 text-xs text-fg-2">{bt("자주 쓰는 자리를 기억할 수 있어요. 기억한 자리도 사용할 때마다 빈자리인지 확인해요.", "Remember a preferred desk. Its availability is checked each time you use it.")}</p> : null}
    {!snapshot.available ? <p role="status" className="mt-2 text-xs text-fg-2">{bt("공유 자리 확인을 지원하는 팀 서버 연결이 필요해요.", "Shared spaces require a team connection that supports server-confirmed reservations.")}</p> : null}
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="min-h-9 rounded-lg border border-line px-3 text-xs font-semibold disabled:opacity-50"
        disabled={!snapshot.available || !recommendedSlot || hasActiveClaim}
        onClick={() => {
          if (recommendedSlot) onSelect(recommendedSlot.id);
        }}
        aria-label={bt("빠른 빈자리 추천 착석", "Quick claim recommended desk")}
      >
        {preferredFreeSlot
          ? bt(`⚡ 내 선호 자리(${preferredFreeSlot.labelKo}) 바로 이동`, `⚡ Walk to preferred desk (${preferredFreeSlot.labelEn})`)
          : bt("⚡ 빠른 빈자리 추천 착석", "⚡ Quick claim available desk")}
      </button>
    </div>
    <ul className="mt-3 space-y-2">
      {slots.map((slot) => {
        const occupied = snapshot.occupied.find((item) => item.slotId === slot.id);
        const held = snapshot.status === "held" && snapshot.slotId === slot.id;
        const pending = approachingSlotId === slot.id || (snapshot.status === "requesting" && snapshot.slotId === slot.id);
        return <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-2">
          <span className="min-w-0 flex-1 break-words text-xs"><strong>{bt(slot.labelKo, slot.labelEn)}</strong>{preferredSlotId === slot.id ? <span className="mt-1 block font-semibold text-accent">{bt("기억한 내 자리", "Your preferred desk")}</span> : null}<span className="mt-1 block text-fg-2">{held ? bt("내가 사용 중", "In use by you") : pending ? bt("자리로 이동·확인 중", "Approaching / confirming") : occupied ? bt(`${occupied.owner.displayName} 사용 중`, `In use by ${occupied.owner.displayName}`) : snapshot.available ? bt("비어 있음", "Available") : bt("확인 필요", "Not confirmed")}</span></span>
          <div className="flex flex-wrap gap-2">
          {onPreferSlot ? <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" aria-pressed={preferredSlotId === slot.id} aria-label={bt(`${spaceKoParticle(slot.labelKo, "을")} 내 자리로 기억`, `Remember ${slot.labelEn} as my desk`)} onClick={() => onPreferSlot(slot.id)}>{preferredSlotId === slot.id ? bt("내 자리", "My desk") : bt("자리 기억", "Remember desk")}</button> : null}
          {held || pending ? <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" onClick={onRelease}>{held ? bt("그만 사용", "Leave") : bt("이동 취소", "Cancel approach")}</button>
            : <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs disabled:opacity-50" disabled={!snapshot.available || Boolean(occupied)} onClick={() => onSelect(slot.id)} aria-label={bt(`${slot.labelKo} 사용하기`, `Use ${slot.labelEn}`)}>{bt("이동·사용", "Walk & use")}</button>}
          </div>
        </li>;
      })}
    </ul>
    {snapshot.status === "lost" || snapshot.status === "denied" ? <p role="status" className="mt-2 text-xs text-fg-2">{bt("자리 사용을 확인하지 못했어요. 연결과 빈 자리를 확인한 뒤 다시 선택해 주세요.", "The reservation could not be confirmed. Check your connection and choose an available space again.")}</p> : null}
  </section>;
}
