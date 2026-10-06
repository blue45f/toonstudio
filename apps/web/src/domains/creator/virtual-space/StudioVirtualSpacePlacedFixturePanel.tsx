import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_BUILD_CATALOG,
  studioBuildCatalogEntryById,
  type StudioBuildCatalogEntry,
  type StudioBuildPlacementRequest,
} from "./studio-virtual-space-build-mode";
import {
  studioBuildFixturePlaceable,
  studioBuildGhostReactionFrame,
  studioBuildPlacedFixture,
} from "./studio-virtual-space-build-mode-vitality";
import type { StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import { studioVirtualDecorationNavigationWorld } from "./studio-virtual-space-decoration-layout";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  STUDIO_PLACED_FIXTURE_LIMIT,
  studioPlacedFixturePointNear,
} from "./studio-virtual-space-placed-fixtures";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/** 고정물 층에 배치할 수 있는 카탈로그 항목(조명·화이트보드·스크린). 커피 머신은 제외된다. */
const PLACEABLE_ENTRIES: readonly StudioBuildCatalogEntry[] = Object.freeze(
  STUDIO_BUILD_CATALOG.filter((entry) => studioBuildFixturePlaceable(entry.id)),
);

/**
 * 빌드 모드 상태 가구 배치 패널 (VS 120 웨이브 4 B 후속 — 라이브 연결).
 *
 * 카탈로그에서 고르면 내 주변 빈 지점에 배치 요청을 만들고, 페이지가 소유한
 * 목록이 캔버스를 거쳐 fx 고정물 층에 동기화된다. 배치 목록은 이 브라우저에만
 * 저장된다(공간 꾸미기와 달리 서버 계약이 없다). 고스트 미리보기 반응 프레임은
 * 항목마다 "켜진 모습" 배지로 보여 줘, 놓기 전에 어떤 반응인지 알 수 있게 한다.
 * 실제 고스트 렌더링 표면(캔버스 배치 모드)은 아직 없어 미리보기는 배지까지다.
 */
export function StudioVirtualSpacePlacedFixturePanel({ world, decorations, selfPoint, requests, onRequestsChange }: {
  readonly world: StudioVirtualSpaceWorldManifest;
  readonly decorations: StudioVirtualDecorationState;
  readonly selfPoint: StudioVirtualSpacePoint;
  readonly requests: readonly StudioBuildPlacementRequest[];
  readonly onRequestsChange: (next: readonly StudioBuildPlacementRequest[]) => void;
}) {
  const bt = useBilingual("StudioVirtualSpacePlacedFixturePanel");
  const [notice, setNotice] = useState("");
  const limitReached = requests.length >= STUDIO_PLACED_FIXTURE_LIMIT;
  const place = (entry: StudioBuildCatalogEntry) => {
    if (limitReached) return;
    const navigationWorld = studioVirtualDecorationNavigationWorld(world, decorations);
    const occupied: StudioVirtualSpacePoint[] = [
      ...requests.map((request) => request.point),
      ...decorations.placements.map((placement) => ({ x: placement.x, y: placement.y })),
    ];
    const point = studioPlacedFixturePointNear(navigationWorld, occupied, selfPoint);
    if (!point) {
      setNotice(bt("주변에 놓을 빈 자리가 없어요. 다른 곳으로 이동한 뒤 다시 시도해 주세요.", "No free spot nearby. Move somewhere emptier and try again."));
      return;
    }
    setNotice("");
    onRequestsChange([...requests, {
      entryId: entry.id, category: "furniture", refId: entry.refId, point, rotation: 0,
    }]);
  };
  const removeAt = (index: number) => {
    onRequestsChange(requests.filter((_, current) => current !== index));
  };
  return <fieldset>
    <legend>{bt("반응하는 가구 배치", "Place reactive furniture")}</legend>
    <p>{bt("다가가서 E·X를 누르면 켜고 끄는 가구예요. 내 주변 빈 자리에 놓이고, 배치는 이 기기에만 저장돼요.", "Furniture that toggles when you walk up and press E or X. It is placed on a free spot near you, and the layout is saved on this device only.")}</p>
    <div className="studio-vspace-customization-catalog">
      {PLACEABLE_ENTRIES.map((entry) => {
        const signature = studioBuildGhostReactionFrame(entry.id, 0, false)?.label;
        return <button key={entry.id} type="button" disabled={limitReached} onClick={() => place(entry)}
          aria-label={bt(`${entry.labelKo} 배치`, `Place ${entry.labelEn}`)}>
          <span aria-hidden>{entry.icon}</span>
          <span>{bt(entry.labelKo, entry.labelEn)}</span>
          {signature ? <small>{bt(signature.ko, signature.en)}</small> : null}
        </button>;
      })}
    </div>
    <p>{bt(`${requests.length} / ${STUDIO_PLACED_FIXTURE_LIMIT}개 배치됨`, `${requests.length} / ${STUDIO_PLACED_FIXTURE_LIMIT} placed`)}</p>
    {notice ? <p className="studio-decoration-notice" role="status">{notice}</p> : null}
    {requests.length > 0 ? <div className="studio-vspace-customization-placed">
      {requests.map((request, index) => {
        const entry = studioBuildCatalogEntryById(request.entryId);
        const fixture = studioBuildPlacedFixture(request);
        const label = entry ? bt(entry.labelKo, entry.labelEn) : request.refId;
        return <button key={fixture?.objectId ?? `${request.entryId}@${index}`} type="button" onClick={() => removeAt(index)}
          aria-label={bt(`${label} 치우기`, `Remove ${label}`)}>
          <span>{label} · {Math.round(request.point.x)}, {Math.round(request.point.y)}</span><Trash2 size={14} aria-hidden />
        </button>;
      })}
    </div> : null}
  </fieldset>;
}
