import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { Link } from "react-router-dom";
import { MATERIAL_WEATHER_CITIES } from "@toonstudio/core/material-intent-plan";

import { RESOURCE_BUTTON } from "../navigation";
import {
  HUB_CARD_LIMIT,
  HUB_LIBRARY_PATH,
  hubLensSlots,
  hubMarketHref,
  hubNeedsCity,
  matchSavedResources,
  providerShortName,
  providerSiteUrl,
  studioDropAsset,
} from "./material-hub-model";
import { MaterialHubResultCard } from "./MaterialHubResultCard";
import { HUB_SKELETON } from "./material-hub-styles";

import type { ReactNode } from "react";
import type { MaterialAsset } from "../material-atlas/model";
import type { HubErrorCode, HubLensView, HubOverrides, HubSlot, HubSlotState } from "./material-hub-model";
import type { MaterialIntentLens, MaterialIntentPlan, MaterialMarketKind, MaterialMarketLicense } from "@toonstudio/core/material-intent-plan";
import type { CreatorResource } from "@/shared/lib/creator-resources";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

type Translate = (ko: string, en: string) => string;

export interface MaterialHubResultsProps {
  /** 마지막으로 찾은(커밋한) 계획과 조정 */
  readonly plan: MaterialIntentPlan;
  readonly overrides: HubOverrides;
  /** 켜 둔 렌즈 */
  readonly views: readonly HubLensView[];
  readonly slots: Readonly<Record<string, HubSlotState>>;
  readonly saved: readonly CreatorResource[];
  readonly saveDisabled: boolean;
  readonly onSearchSlots: (slots: readonly HubSlot[]) => void;
  readonly onRetry: (slot: HubSlot) => void;
  readonly onLoadMore: (key: string) => void;
  readonly onToggleSaved: (item: CreatorResource) => void;
  readonly onSendToStudio: (asset: MaterialAsset) => void;
  readonly onPickCity: (city: string) => void;
}

function errorMessage(bt: Translate, code: HubErrorCode | null): string {
  switch (code) {
    case "rate_limited": return bt("요청이 많습니다. 1분 뒤에 다시 시도하세요.", "Too many requests. Try again in a minute.");
    case "timeout": return bt("응답이 늦어 중단했어요. 다시 시도하세요.", "The provider answered too slowly. Try again.");
    case "format": return bt("응답의 형식을 확인하지 못했어요. 다시 시도하거나 공식 사이트를 이용하세요.", "The response could not be verified. Try again or use the official site.");
    case "network": return bt("네트워크 오류로 불러오지 못했어요. 연결을 확인하고 다시 시도하세요.", "A network error stopped the request. Check your connection and try again.");
    default: return bt("검색 서버에 연결하지 못했어요. 다시 시도하거나 공식 사이트를 이용하세요.", "The search server could not be reached. Try again or use the official site.");
  }
}

const MARKET_KIND_LABEL: Readonly<Record<MaterialMarketKind, readonly [string, string]>> = {
  template: ["템플릿", "Templates"],
  asset: ["2D 에셋", "2D assets"],
  "3d-asset": ["3D 에셋", "3D assets"],
  "3d-preset": ["3D 프리셋", "3D presets"],
  brush: ["브러시", "Brushes"],
  palette: ["팔레트", "Palettes"],
  filter: ["보정·효과", "Filters"],
};

const MARKET_LICENSE_LABEL: Readonly<Record<MaterialMarketLicense, string>> = {
  "cc0-1.0": "CC0 1.0",
  "cc-by-4.0": "CC BY 4.0",
  "cc-by-nc-4.0": "CC BY-NC 4.0",
};

function ProviderSection({ slot, state, plan, saved, saveDisabled, onSearch, onRetry, onLoadMore, onToggleSaved, onSendToStudio }: {
  readonly slot: HubSlot;
  readonly state: HubSlotState | undefined;
  readonly plan: MaterialIntentPlan;
  readonly saved: readonly CreatorResource[];
  readonly saveDisabled: boolean;
  readonly onSearch: (slots: readonly HubSlot[]) => void;
  readonly onRetry: (slot: HubSlot) => void;
  readonly onLoadMore: (key: string) => void;
  readonly onToggleSaved: (item: CreatorResource) => void;
  readonly onSendToStudio: (asset: MaterialAsset) => void;
}) {
  const bt = useBilingual("MaterialHubResults");
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const focusAfterMore = useRef<number | null>(null);
  const name = providerShortName(slot.provider);
  const site = providerSiteUrl(slot.provider);
  const visible = state?.visible ?? 0;
  const items = state?.items ?? [];
  const shown = items.slice(0, visible);
  const canShowMore = visible < items.length;
  const canFetchMore = Boolean(state?.hasMore) && !canShowMore;
  const savedIds = new Set(saved.map((item) => item.id));
  const droppedWords = plan.unresolved.filter((word) => slot.query.includes(word));

  // "더 보기"로 새로 보이게 된 첫 카드로 초점을 옮겨, 버튼이 사라져도 키보드 위치를 잃지 않게 한다.
  useEffect(() => {
    const target = focusAfterMore.current;
    if (target === null || visible <= target) return;
    focusAfterMore.current = null;
    listRef.current?.querySelectorAll<HTMLElement>("h5")[target]?.focus();
  }, [visible]);

  const header = (
    <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h4 id={headingId} className="text-sm font-bold">{name}</h4>
      <p className="text-xs text-fg-2">{bt("검색어", "Query")} <q className="font-semibold text-fg">{slot.query}</q></p>
      {state?.total !== undefined && state.status !== "loading" ? <p className="text-xs text-fg-3">{bt(`전체 ${state.total}건`, `${state.total} in total`)}</p> : null}
      {site ? <a className="inline-flex min-h-11 items-center text-xs underline" href={site} target="_blank" rel="noopener noreferrer">{bt("공식 사이트 ↗", "Official site ↗")}</a> : null}
    </header>
  );

  let body: ReactNode;
  if (!state) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-fg-2">{bt("아직 찾지 않았어요.", "Not searched yet.")}</p>
        <button type="button" className={RESOURCE_BUTTON} onClick={() => onSearch([slot])}>{bt(`${name}에서 찾기`, `Search ${name}`)}</button>
      </div>
    );
  } else if (state.status === "loading") {
    body = (
      <div>
        <p className="mb-2 text-sm text-fg-2">{bt("공식 제공처에서 자료를 확인하고 있어요…", "Checking the official provider…")}</p>
        <ul aria-hidden="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 2 }, (_, index) => (
            <li key={index} className="overflow-hidden rounded-2xl border border-line">
              <div className={`${HUB_SKELETON} aspect-[4/3] w-full`} />
              <div className="space-y-2 p-3"><div className={`${HUB_SKELETON} h-4 w-3/4`} /><div className={`${HUB_SKELETON} h-3 w-1/2`} /></div>
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (state.status === "error") {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel p-3">
        <AlertTriangle size={16} aria-hidden="true" className="shrink-0 text-warn" />
        <p className="min-w-0 flex-1 text-sm leading-6">{errorMessage(bt, state.errorCode)}</p>
        <button type="button" className={RESOURCE_BUTTON} onClick={() => onRetry(slot)}>{bt("다시 시도", "Try again")}</button>
      </div>
    );
  } else if (state.status === "not_configured") {
    body = <p className="text-sm leading-6 text-fg-2">{bt("서버 인증키가 아직 연결되지 않아 이 제공처는 지금 쓸 수 없어요. 설정이 끝나면 같은 검색으로 이용할 수 있어요.", "This provider's server key is not connected yet, so it cannot be used right now.")}</p>;
  } else if (state.status === "unavailable") {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm leading-6 text-fg-2">{bt("제공처가 일시적으로 응답하지 않아요. 잠시 뒤 다시 시도하거나 공식 사이트를 이용하세요.", "The provider is temporarily unavailable. Try again later or use the official site.")}</p>
        <button type="button" className={RESOURCE_BUTTON} onClick={() => onRetry(slot)}>{bt("다시 시도", "Try again")}</button>
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="space-y-2 text-sm leading-6 text-fg-2">
        <p>{bt(`이 제공처에는 ‘${slot.query}’와 맞는 자료가 없어요.`, `This provider has nothing that matches “${slot.query}”.`)}</p>
        {droppedWords.length > 0
          ? <p>{bt(`사전에 없는 낱말 ‘${droppedWords.join("’, ‘")}’ 때문에 영어 제공처에서 비었을 수 있어요. 위의 칩에서 그 낱말을 끄고 다시 찾아 보세요.`, `The words outside the vocabulary (${droppedWords.join(", ")}) may have emptied this English-index provider. Turn them off above and search again.`)}</p>
          : <p>{bt("읽은 단서 칩을 줄이거나 검색어를 직접 고쳐서 다시 찾아 보세요.", "Turn off a cue chip or edit the query, then search again.")}</p>}
        <button type="button" className={RESOURCE_BUTTON} onClick={() => onRetry(slot)}>{bt("다시 시도", "Try again")}</button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        {state.status === "partial" ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
            <p>{bt("일부 응답만 받았어요. 빠진 자료가 있을 수 있어요.", "Only part of the response arrived; some items may be missing.")}</p>
            <button type="button" className={RESOURCE_BUTTON} onClick={() => onRetry(slot)}>{bt("다시 시도", "Try again")}</button>
          </div>
        ) : null}
        <ul ref={listRef} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((item) => (
            <li key={item.id} className="min-w-0">
              <MaterialHubResultCard
                item={item}
                saved={savedIds.has(item.id)}
                saveDisabled={saveDisabled}
                studioAsset={studioDropAsset(item)}
                onToggleSaved={onToggleSaved}
                onSendToStudio={onSendToStudio}
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-fg-2">{bt(`${shown.length}개 표시 · 받은 자료 ${items.length}개`, `Showing ${shown.length} of ${items.length} received`)}</p>
          {canShowMore || canFetchMore ? (
            <button
              type="button"
              className={RESOURCE_BUTTON}
              disabled={state.loadingMore}
              aria-label={bt(`${name} 더 보기`, `Show more from ${name}`)}
              onClick={() => { focusAfterMore.current = canShowMore ? visible : null; onLoadMore(slot.key); }}
            >
              {state.loadingMore ? bt("불러오는 중…", "Loading…") : canShowMore ? bt(`더 보기 · ${Math.min(items.length - visible, HUB_CARD_LIMIT)}개`, `Show ${Math.min(items.length - visible, HUB_CARD_LIMIT)} more`) : bt("다음 페이지 불러오기", "Load the next page")}
            </button>
          ) : null}
        </div>
        {state.errorCode ? (
          <p role="alert" className="text-sm text-fg">{errorMessage(bt, state.errorCode)}</p>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} aria-busy={state?.status === "loading" || undefined} className="space-y-3">
      {header}
      {body}
    </section>
  );
}

function CityPicker({ onPickCity }: { readonly onPickCity: (city: string) => void }) {
  const bt = useBilingual("MaterialHubResults");
  return (
    <div className="space-y-2">
      <p className="text-sm leading-6 text-fg-2">{bt("날씨·빛 참고는 MET Norway 위치 예보라서 도시가 필요해요. 도시를 고르면 그때 예보를 불러와요.", "Weather and light come from a MET Norway location forecast, so a city is needed. The forecast is requested only after you pick one.")}</p>
      <div role="group" aria-label={bt("예보를 볼 도시", "City for the forecast")} className="flex flex-wrap gap-2">
        {MATERIAL_WEATHER_CITIES.map((city) => <button key={city} type="button" className={RESOURCE_BUTTON} onClick={() => onPickCity(city)}>{city}</button>)}
      </div>
    </div>
  );
}

function MarketGroup({ plan }: { readonly plan: MaterialIntentPlan }) {
  const bt = useBilingual("MaterialHubResults");
  const { market } = plan;
  const chips = [
    market.kind ? bt(MARKET_KIND_LABEL[market.kind][0], MARKET_KIND_LABEL[market.kind][1]) : "",
    market.license ? MARKET_LICENSE_LABEL[market.license] : "",
    ...market.tags.map((tag) => `#${tag}`),
    market.query ? `“${market.query}”` : "",
  ].filter(Boolean);
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-fg-2">{bt("마켓 검색은 이 화면에서 요청하지 않아요. 아래를 누르면 마켓이 열리고 이 조건이 주소 필터로 들어가요.", "The market is not queried from this page. The button opens the market with these conditions as URL filters.")}</p>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{bt("적용될 조건", "Filters")}</span>
        {chips.length > 0 ? chips.map((chip) => <span key={chip} className="inline-flex min-h-8 items-center rounded-full border border-line bg-panel px-3 text-xs">{chip}</span>) : <span className="text-fg-2">{bt("조건 없이 전체 리소스", "None — all resources")}</span>}
      </p>
      <Link className={RESOURCE_BUTTON} to={hubMarketHref(plan)}>{bt("마켓에서 찾기 →", "Open in the market →")}</Link>
    </div>
  );
}

function LibraryGroup({ plan, saved, saveDisabled, onToggleSaved, onSendToStudio }: {
  readonly plan: MaterialIntentPlan;
  readonly saved: readonly CreatorResource[];
  readonly saveDisabled: boolean;
  readonly onToggleSaved: (item: CreatorResource) => void;
  readonly onSendToStudio: (asset: MaterialAsset) => void;
}) {
  const bt = useBilingual("MaterialHubResults");
  const matches = matchSavedResources(saved, plan.myLibrary.keywords).slice(0, HUB_CARD_LIMIT);
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-fg-2">{bt("이 브라우저의 저장 보드에서만 찾아요. 네트워크 요청은 없어요.", "Searches only the saved board in this browser. No network request is made.")}</p>
      {matches.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {matches.map((item) => (
            <li key={item.id} className="min-w-0">
              <MaterialHubResultCard item={item} saved saveDisabled={saveDisabled} studioAsset={studioDropAsset(item)} onToggleSaved={onToggleSaved} onSendToStudio={onSendToStudio} />
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-fg-2">{bt("저장 보드에 겹치는 자료가 아직 없어요.", "Nothing on the saved board matches yet.")}</p>}
      <Link className={RESOURCE_BUTTON} to={HUB_LIBRARY_PATH}>{bt("내 소재장(3D 포함) 열기 →", "Open my materials (incl. 3D) →")}</Link>
    </div>
  );
}

function LensGroup({ view, props }: { readonly view: HubLensView; readonly props: MaterialHubResultsProps }) {
  const bt = useBilingual("MaterialHubResults");
  const headingId = useId();
  const { plan, overrides, slots, saved, saveDisabled } = props;
  const lens: MaterialIntentLens = view.lens;
  const { slots: lensSlots, unavailable } = hubLensSlots(lens, overrides);
  const initial = lensSlots.filter((slot) => slot.initial);
  const rest = lensSlots.filter((slot) => !slot.initial);
  const requested = rest.filter((slot) => slots[slot.key]);
  const pending = rest.filter((slot) => !slots[slot.key]);
  const shownSlots = [...initial, ...requested];
  const isProviderLens = lens.providers.length > 0;
  const needsCity = hubNeedsCity(lens, overrides);

  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <header className="space-y-1">
        <h3 id={headingId} className="text-base font-bold">{bt(lens.label, lens.labelEn)}</h3>
        <p className="text-xs leading-5 text-fg-3">
          {bt(lens.reason, lens.reasonEn)}
          {lens.confidence < 0.35 ? <span> {bt("근거가 적어 신호가 약해요.", "Few cues support this, so the signal is weak.")}</span> : null}
        </p>
      </header>
      {lens.id === "market-resource" ? <MarketGroup plan={plan} /> : null}
      {lens.id === "my-library" ? <LibraryGroup plan={plan} saved={saved} saveDisabled={saveDisabled} onToggleSaved={props.onToggleSaved} onSendToStudio={props.onSendToStudio} /> : null}
      {isProviderLens && needsCity ? <CityPicker onPickCity={props.onPickCity} /> : null}
      {isProviderLens && !needsCity && shownSlots.length === 0 ? (
        <p className="text-sm text-fg-2">{bt("이 종류로는 제공처에 보낼 검색어를 만들지 못했어요. 위의 ‘제공처에 보낼 검색어’에서 직접 적어 보세요.", "No query could be built for this kind. Type one under “Queries that will be sent” above.")}</p>
      ) : null}
      {shownSlots.map((slot) => (
        <ProviderSection
          key={slot.key}
          slot={slot}
          state={slots[slot.key]}
          plan={plan}
          saved={saved}
          saveDisabled={saveDisabled}
          onSearch={props.onSearchSlots}
          onRetry={props.onRetry}
          onLoadMore={props.onLoadMore}
          onToggleSaved={props.onToggleSaved}
          onSendToStudio={props.onSendToStudio}
        />
      ))}
      {pending.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={RESOURCE_BUTTON} onClick={() => props.onSearchSlots(pending)}>
            {bt(`다른 제공처에서도 찾기 · ${pending.length}곳`, `Search ${pending.length} more provider${pending.length === 1 ? "" : "s"}`)}
          </button>
          <p className="text-xs text-fg-2">{pending.map((slot) => providerShortName(slot.provider)).join(" · ")}</p>
        </div>
      ) : null}
      {unavailable.length > 0 && !needsCity ? (
        <p className="text-xs leading-5 text-fg-3">{bt("이번 문장으로는 검색어를 만들 수 없는 제공처", "Providers that cannot be queried from this sentence")}: {unavailable.map((provider) => providerShortName(provider)).join(" · ")}</p>
      ) : null}
    </section>
  );
}

/** 종류별 결과 그룹. 켜 둔 렌즈마다 한 그룹이고, 그룹 안에서 제공처마다 loading/empty/error/retry 상태를 따로 가진다. */
export function MaterialHubResults(props: MaterialHubResultsProps) {
  const bt = useBilingual("MaterialHubResults");
  if (props.views.length === 0) {
    return <p className="text-sm text-fg-2">{bt("켜 둔 종류가 없어요. 위에서 찾을 종류를 하나 이상 켜 주세요.", "No kind is turned on. Turn at least one on above.")}</p>;
  }
  return (
    <div className="space-y-5">
      {props.views.map((view) => <LensGroup key={view.lens.id} view={view} props={props} />)}
    </div>
  );
}
