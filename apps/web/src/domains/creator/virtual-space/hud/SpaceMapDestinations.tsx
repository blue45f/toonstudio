import { Footprints, LocateFixed, MapPin, Search, Star, Zap } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import { studioWorldInteractions, type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { spaceKoParticle } from "./space-korean";

export interface SpaceMapRoom {
  readonly id: string;
  readonly label: string;
  readonly spawn: StudioVirtualSpacePoint;
}

const searchText = (text: string) => text.normalize("NFKC").trim().toLocaleLowerCase();

export function SpaceMapDestinations({ manifest, rooms, currentRoomId, recommended, onMoveTo, onJumpTo }: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly rooms: readonly SpaceMapRoom[];
  readonly currentRoomId: string | null;
  readonly recommended: ReadonlySet<string>;
  readonly onMoveTo: (point: StudioVirtualSpacePoint) => void;
  readonly onJumpTo?: (point: StudioVirtualSpacePoint) => void;
}) {
  const bt = useBilingual("SpaceMapDestinations");
  const listId = useId();
  const [query, setQuery] = useState("");
  const index = useMemo(() => {
    const definitions = new Map(manifest.rooms.map(room => [room.id, room]));
    const stations = new Map<string, { id: string; label: string; search: string; point: StudioVirtualSpacePoint }[]>();
    const addStation = (roomId: string, id: string, ko: string, en: string, point: StudioVirtualSpacePoint) => {
      const label = bt(ko, en);
      const entry = { id, label, search: searchText(`${label} ${ko} ${en}`), point };
      const group = stations.get(roomId);
      if (group) group.push(entry);
      else stations.set(roomId, [entry]);
    };
    for (const slot of manifest.interactionSlots ?? []) {
      addStation(slot.roomId, `seat-${slot.id}`, slot.labelKo, slot.labelEn, slot.approachPoint);
    }
    for (const item of studioWorldInteractions(manifest)) {
      addStation(item.zoneId, `tool-${item.id}`, item.labelKo, item.labelEn, item.point);
    }
    return rooms.map(room => {
      const def = definitions.get(room.id);
      const description = def?.descriptionKo && def.descriptionEn ? bt(def.descriptionKo, def.descriptionEn) : def?.descriptionKo ?? def?.descriptionEn ?? "";
      const names = searchText([room.label, def?.labelKo, def?.labelEn].join(" "));
      const search = searchText([names, description, def?.descriptionKo, def?.descriptionEn].join(" "));
      return { ...room, description, names, search, stations: stations.get(room.id) ?? [] };
    });
  }, [manifest, rooms, bt]);
  const term = searchText(query);
  const matches = useMemo(() => index.flatMap(room => {
    const stations = term ? room.stations.filter(station => station.search.includes(term)) : [];
    return room.search.includes(term) || stations.length ? [{ room, stations }] : [];
  }).sort((a, b) => Number(b.room.names.includes(term)) - Number(a.room.names.includes(term))
    || Number(b.stations.length > 0) - Number(a.stations.length > 0)), [index, term]);
  return <section className="space-map-directory" aria-label={bt("목적지 목록", "Destinations")}>
    <label className="space-map-directory__search">
      <Search size={17} aria-hidden />
      <input type="search" value={query} maxLength={120} autoComplete="off"
        aria-label={bt("방·좌석·도구 검색", "Search rooms, seats and tools")}
        placeholder={bt("방·좌석·도구 검색", "Search rooms, seats and tools")}
        onChange={event => setQuery(event.target.value)} />
    </label>
    <p role="status" className="space-map-directory__count">{matches.length
      ? (matches.length === 1 ? bt("공간 1곳", "1 room") : bt(`공간 ${matches.length}곳`, `${matches.length} rooms`))
      : term ? bt("일치하는 목적지가 없어요. 다른 방이나 좌석 이름으로 검색해 보세요.", "No destinations found. Try another room or seat name.")
        : bt("이 지도에 등록된 방이 없어요.", "There are no rooms on this map.")}</p>
    <ul className="space-map-directory__rooms">
      {matches.map(({ room, stations }) => <li key={room.id}>
        <div className="space-map-directory__room">
          <button type="button" className="space-map-directory__walk" onClick={() => onMoveTo(room.spawn)}
            aria-label={bt(`${spaceKoParticle(room.label, "으로")} 걸어가기`, `Walk to ${room.label}`)} aria-describedby={`${listId}-${room.id}`}>
            <span className="space-map-directory__pin"><MapPin size={18} aria-hidden /></span>
            <span className="space-map-directory__name"><strong>{room.label}</strong><span className="space-map-directory__detail" id={`${listId}-${room.id}`}>
              {room.description ? <small>{room.description}</small> : null}
              {room.id === currentRoomId ? <small className="space-map-directory__tag"><LocateFixed size={12} aria-hidden />{bt("현재 위치", "Current location")}</small> : null}
              {recommended.has(room.id) ? <small className="space-map-directory__tag"><Star size={12} aria-hidden />{bt("내 직군 추천", "Recommended for your role")}</small> : null}
            </span></span>
            <span className="space-map-directory__action"><Footprints size={15} aria-hidden />{bt("걷기", "Walk")}</span>
          </button>
          {onJumpTo ? <button type="button" className="space-map-directory__jump" onClick={() => onJumpTo(room.spawn)}
            aria-label={bt(`${spaceKoParticle(room.label, "으로")} 바로 가기`, `Quick travel to ${room.label}`)}>
            <Zap size={15} aria-hidden />{bt("바로 가기", "Quick travel")}
          </button> : null}
        </div>
        {stations.length ? <ul className="space-map-directory__stations">{stations.map(station => <li key={station.id}>
          <button type="button" onClick={() => onMoveTo(station.point)}
            aria-label={bt(`${spaceKoParticle(station.label, "으로")} 걸어가기`, `Walk to ${station.label}`)}>
            <Footprints size={14} aria-hidden />{station.label}
          </button>
        </li>)}</ul> : null}
      </li>)}
    </ul>
  </section>;
}
