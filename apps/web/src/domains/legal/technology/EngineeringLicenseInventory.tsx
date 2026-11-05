import { translateCurrentStaticSourceText, translateBilingualValueForActiveLocale, useBilingualI18nRevision, formatI18nTemplate, getActiveI18nLocale } from "@/shared/lib/i18n-bilingual-copy";
import { AlertTriangle, ExternalLink, Search } from "lucide-react";
import { useState } from "react";

import type { LocalizedText } from "./engineering-story-content";
import {
  ENGINEERING_LIBRARY_LICENSE_REVIEWED_AT,
  ENGINEERING_LIBRARY_LICENSES,
  ENGINEERING_MODEL_ASSET_LICENSES,
  type EngineeringLicenseFlag,
  type EngineeringLicenseSurface,
} from "./engineering-license-inventory";

const LIBRARIES = ENGINEERING_LIBRARY_LICENSES;

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringLicenseInventory", ko, en);

const SURFACES: readonly { readonly id: EngineeringLicenseSurface; readonly title: LocalizedText }[] = [
  { id: "web", title: { ko: "웹·스튜디오 런타임", en: "Web and Studio runtime" } },
  { id: "api", title: { ko: "API 서버", en: "API server" } },
  { id: "mobile", title: { ko: "모바일 앱", en: "Mobile app" } },
  { id: "labs", title: { ko: "실험·보조 앱", en: "Lab and companion apps" } },
];

const FLAG_LABELS: Record<EngineeringLicenseFlag, LocalizedText> = {
  "weak-copyleft": { ko: "약한 카피레프트", en: "Weak copyleft" },
  "noncommercial": { ko: "비상업 조건", en: "Non-commercial terms" },
  "custom-license": { ko: "자체 라이선스", en: "Custom license" },
};

const FLAG_NOTES: Record<EngineeringLicenseFlag, LocalizedText> = {
  "weak-copyleft": {
    ko: "파일·라이브러리 단위로 카피레프트가 붙습니다. 해당 구성 요소 자체를 수정해 재배포하면 그 부분의 소스 공개 의무가 생기므로, 수정 여부와 결합 방식을 출시 전에 확인합니다.",
    en: "Copyleft applies at file or library scope. Modifying and redistributing that component can trigger source-disclosure duties for that part, so modification and combination are rechecked before release.",
  },
  "noncommercial": {
    ko: "상업 이용을 허용하지 않는 조건입니다. 외부 Mixbox 패키지는 2026-11-05 변경에서 제거했습니다. 실행 차단과 배포 산출물의 포함 검사는 별개이며, 이 페이지의 분류는 법률 판단이 아닙니다.",
    en: "Commercial use is not permitted under these terms. The external Mixbox package is removed in the 2026-11-05 change. Runtime blocking and checking distribution artifacts are separate tasks; this page records classifications, not a legal judgment.",
  },
  "custom-license": {
    ko: "Remotion 4.0.536의 자체 라이선스는 개인 또는 직원 3명 이하 영리 조직의 무료 상업 사용을 허용합니다. 운영자가 설명한 개인·1인 운영 전제에 따라 유지합니다. 일반 FAQ는 조직 전체 3명 이하를 기준으로 안내하므로 개발자 한 명의 인원수로 대신하지 않으며, 실제 조직 인원은 독립 검증하지 않았습니다. 비상업 조건인 Tag2Pix 가중치와는 다른 항목입니다.",
    en: "Remotion 4.0.536 permits free commercial use by individuals and for-profit entities with up to 3 employees. It is retained under the operator's stated individual, one-person premise. The general FAQ uses total organizational headcount of up to 3 people, not just the number of developers; actual headcount was not independently verified. This differs from the non-commercial Tag2Pix weights.",
  },
};

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)}MB`;
}

/** 패키지 메타데이터에서 확인한 공식 링크가 있으면 이름을 외부 링크로 그린다. */
function LibraryName({ library, className }: { readonly library: (typeof LIBRARIES)[number]; readonly className: string }) {
  if (!library.url) return <span className={className}>{library.name}</span>;
  return (
    <a
      href={library.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} inline-flex items-center gap-1.5 underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      {library.name}
      <ExternalLink size={12} aria-hidden="true" className="shrink-0 text-fg-3" />
    </a>
  );
}

export function EngineeringLicenseInventory() {
  useBilingualI18nRevision();

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase(getActiveI18nLocale());
  const visibleLibraries = normalizedQuery
    ? LIBRARIES.filter((library) =>
        [library.name, library.license, library.role.ko, library.role.en]
          .join(" ")
          .toLocaleLowerCase(getActiveI18nLocale())
          .includes(normalizedQuery))
    : LIBRARIES;
  const flagged = LIBRARIES.filter((library) => library.flag);

  return (
    <section className="mt-16" aria-labelledby="library-inventory-title">
      <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.technology.EngineeringLicenseInventory", "en", "LIBRARY INVENTORY")}</p>
      <h2 id="library-inventory-title" className="mt-3 text-2xl font-black tracking-tight text-fg sm:text-3xl">
        {bi("실제로 설치해 쓰는 라이브러리와 라이선스", "The libraries actually installed, and their licenses")}
      </h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
        {bi(
          `${ENGINEERING_LIBRARY_LICENSE_REVIEWED_AT} 직접 의존성 스냅샷에 2026-11-05 wasm-vips 제거를 반영한 ${LIBRARIES.length}개 목록입니다. 나머지 버전·라이선스를 모두 현행 기준으로 재검토한 목록은 아닙니다. 현재 전체 인벤토리는 배포 빌드가 생성하는 THIRD_PARTY_NOTICES와 라이선스 audit를 확인합니다.`,
          `This ${LIBRARIES.length}-entry list is the ${ENGINEERING_LIBRARY_LICENSE_REVIEWED_AT} direct-dependency snapshot with the 2026-11-05 removal of wasm-vips applied. All other versions and licenses have not been freshly re-reviewed here. Use the build-generated THIRD_PARTY_NOTICES and license audit for the current full inventory.`,
        )}
      </p>

      <div className="mt-7 rounded-[1.75rem] border border-accent/25 bg-accent-soft/25 p-6">
        <h3 className="flex items-center gap-2 text-lg font-black text-fg">
          <AlertTriangle size={18} className="text-accent" aria-hidden="true" />
          {bi("조건을 따로 확인하는 라이브러리", "Libraries whose terms need separate review")}
        </h3>
        <p className="mt-3 text-sm leading-7 text-fg-2">
          {bi("강한 카피레프트(GPL·AGPL)인 직접 의존성은 없습니다. 아래는 약한 카피레프트, 비상업 조건, 자체 라이선스처럼 배포 방식에 따라 의무가 달라지는 항목만 모은 것입니다.", "No direct dependency carries a strong copyleft (GPL/AGPL) license. Below are only the entries whose duties change with the distribution model: weak copyleft, non-commercial terms and custom licenses.")}
        </p>
        <ul className="mt-5 space-y-3">
          {flagged.map((library) => (
            <li key={library.name} className="rounded-2xl border border-line/70 bg-card/80 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <LibraryName library={library} className="font-mono text-sm font-bold text-fg" />
                <span className="rounded-full border border-line bg-panel px-2.5 py-1 font-display text-[0.64rem] font-bold text-fg-2">{library.license}</span>
                {library.flag ? (
                  <span className="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 font-display text-[0.64rem] font-bold text-accent">
                    {bi(FLAG_LABELS[library.flag].ko, FLAG_LABELS[library.flag].en)}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-6 text-fg-2">{bi(library.role.ko, library.role.en)}</p>
              {library.flag ? (
                <p className="mt-2 border-t border-line/60 pt-2 text-xs leading-6 text-fg-3">{bi(FLAG_NOTES[library.flag].ko, FLAG_NOTES[library.flag].en)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10 max-w-xl">
        <label htmlFor="engineering-library-search" className="text-xs font-black text-fg">
          {bi("라이브러리·라이선스 검색", "Search libraries and licenses")}
        </label>
        <div className="relative mt-2">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
          <input
            id="engineering-library-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={bi("예: three, MPL, CRDT", "e.g. three, MPL, CRDT")}
            className="min-h-11 w-full rounded-2xl border border-line bg-card py-2 pl-10 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </div>
        <p className="mt-2 text-[0.72rem] text-fg-3" role="status">
          {formatI18nTemplate(String(bi("{value0}개 / 전체 {value1}개 라이브러리", "{value0} of {value1} libraries")), { value0: visibleLibraries.length, value1: LIBRARIES.length })}
        </p>
      </div>

      {SURFACES.map((surface) => {
        const rows = visibleLibraries.filter((library) => library.surface === surface.id);
        if (rows.length === 0) return null;
        return (
          <div key={surface.id} className="mt-8">
            <h3 className="text-base font-black text-fg">{bi(surface.title.ko, surface.title.en)}</h3>
            <div className="mt-3 overflow-hidden rounded-[1.75rem] border border-line/70 bg-panel/55">
              <div className="hidden grid-cols-[1.2fr_0.9fr_1.5fr] gap-5 border-b border-line bg-raised/70 px-6 py-3 font-display text-[0.64rem] font-black uppercase tracking-[0.12em] text-fg-3 lg:grid">
                <span>{bi("라이브러리", "Library")}</span>
                <span>{bi("라이선스", "License")}</span>
                <span>{bi("쓰이는 자리", "Where it is used")}</span>
              </div>
              {rows.map((library) => (
                <article key={library.name} className="grid gap-3 border-b border-line/70 px-5 py-4 last:border-b-0 sm:px-6 lg:grid-cols-[1.2fr_0.9fr_1.5fr] lg:gap-5">
                  <div>
                    <LibraryName library={library} className="font-mono text-[0.82rem] font-bold text-fg" />
                    <p className="mt-0.5 font-mono text-[0.68rem] text-fg-3">{library.version}</p>
                  </div>
                  <div>
                    <span className="inline-flex items-center gap-2 text-xs font-bold text-fg-2">
                      {library.license}
                      {library.flag ? (
                        <span className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 font-display text-[0.6rem] font-bold text-accent">
                          {bi(FLAG_LABELS[library.flag].ko, FLAG_LABELS[library.flag].en)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <p className="text-xs leading-6 text-fg-2">{bi(library.role.ko, library.role.en)}</p>
                </article>
              ))}
            </div>
          </div>
        );
      })}
      {visibleLibraries.length === 0 ? (
        <div className="mt-8 rounded-[1.75rem] border border-line/70 bg-panel/55 px-6 py-10 text-center">
          <p className="text-sm font-black text-fg">{bi("검색과 일치하는 라이브러리가 없습니다.", "No library matches the search.")}</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {bi("검색 초기화", "Reset search")}
          </button>
        </div>
      ) : null}

      <div className="mt-12">
        <h3 className="text-base font-black text-fg">{bi("브라우저에서 실행하는 AI 모델 자산", "AI model assets running in the browser")}</h3>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
          {bi("모델별 배포 라이선스와 학습 출처를 구분해 기록합니다. 아래 표는 현재 포함된 자산의 상태이며, 고지 파일이나 SHA-256 일치가 상용 이용 허가를 뜻하지 않습니다. Tag2Pix는 비상업·재배포 제한, Paprika는 원본 조건 충돌이 있습니다. Face Paint는 저장소의 MIT 체크포인트를 사용하며 학습 출처의 추가 검토가 남아 있습니다. 파일 해시는 세션 전에 검사합니다.", "Distribution licenses and training provenance are recorded per model. This table records currently included assets; a notice file or matching SHA-256 does not grant commercial permission. Tag2Pix has non-commercial and redistribution restrictions, and Paprika has conflicting upstream terms. Face Paint uses the repository's MIT checkpoint, with further training-provenance review remaining. File hashes are checked before a session opens.")}
        </p>
        <div className="mt-4 overflow-hidden rounded-[1.75rem] border border-line/70 bg-panel/55">
          <div className="hidden grid-cols-[1.2fr_0.7fr_0.5fr_1.4fr] gap-5 border-b border-line bg-raised/70 px-6 py-3 font-display text-[0.64rem] font-black uppercase tracking-[0.12em] text-fg-3 lg:grid">
            <span>{bi("모델 파일", "Model file")}</span>
            <span>{bi("라이선스", "License")}</span>
            <span>{bi("크기", "Size")}</span>
            <span>{bi("쓰이는 자리", "Where it is used")}</span>
          </div>
          {ENGINEERING_MODEL_ASSET_LICENSES.map((model) => (
            <article key={model.file} className="grid gap-3 border-b border-line/70 px-5 py-4 last:border-b-0 sm:px-6 lg:grid-cols-[1.2fr_0.7fr_0.5fr_1.4fr] lg:gap-5">
              <p className="font-mono text-[0.82rem] font-bold text-fg">{model.file}</p>
              <div className="text-xs font-bold text-fg-2">
                <p>{model.license}</p>
                {model.rightsStatus === "restricted" ? <p className="mt-1">{bi("이용·재배포 제한", "Use and redistribution restrictions")}</p> : null}
                {model.rightsStatus === "unverified" ? <p className="mt-1">{bi("권리 확인 대기", "Rights verification pending")}</p> : null}
              </div>
              <p className="font-mono text-[0.72rem] text-fg-3">{formatMegabytes(model.bytes)}</p>
              <div>
                <p className="text-xs leading-6 text-fg-2">{bi(model.role.ko, model.role.en)}</p>
                {model.note ? <p className="mt-1 text-xs leading-6 text-fg-3">{bi(model.note.ko, model.note.en)}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
