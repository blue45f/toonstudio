import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, ExternalLink, RotateCcw } from "lucide-react";

import { CareerGalleryHero } from "./CareerGalleryHero";
import { CareerCoverArt } from "./career-cover-art";
import { CareerPublicConfirmation } from "./career-confirmation-public";
import { useCareerPublicConfirmations } from "./use-career-public-confirmations";

import { CREATOR_HIRING_ROLES } from "../../../../../../packages/contracts/src/creator-hiring";

import type { CreatorCareerPublic, CreatorHiringRole } from "../../../../../../packages/contracts/src/creator-hiring";

import { CollabNotice, collabButton } from "../collaboration-ui";

import Link from "@/shared/navigation/router-link";
import { api, getApiErrorMessage } from "@/platform/api";
import { Container } from "@/shared/components/section";
import { StaggerReveal } from "@/shared/components/stagger-reveal";
import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const root = "/collaborations/career";

type RoleFilter = CreatorHiringRole | "all";

/**
 * 창작자 커리어 갤러리 — 공개 경력을 "전시"로 보여 주는 표면.
 *
 * 첫 화면은 전폭 히어로가 차지한다: 커버를 등록한 항목이 있으면 그 커버가
 * "이번 주 표지"로 히어로가 되고, 없거나 불러오기가 실패하면 아카이브 아트가
 * 골격을 유지한다. 대표작 아트는 창작자가 권리를 확인해 등록한 실제 커버 이미지를
 * 우선 쓰고, 등록하지 않았거나 불러오기에 실패한 항목만 작품 제목의
 * 타이포그래픽 커버로 대신한다(등록 정보 재사용).
 * 카드 상단에 아트를 가장 크게 두고, 역할 필터 칩과 협업 기록 배지(상대방 확인)를 얹는다.
 */
export function CreatorCareerGalleryPage() {
  const [items, setItems] = useState<CreatorCareerPublic[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const confirmations = useCareerPublicConfirmations(items);

  useEffect(() => {
    const controller = new AbortController();
    void api
      .get<CreatorCareerPublic[]>(`${root}/gallery`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setItems(value);
          setError("");
        }
      })
      .catch(async (caught) => {
        const message = await getApiErrorMessage(caught, "전시를 불러오지 못했어요.");
        if (!controller.signal.aborted) setError(message);
      });
    return () => controller.abort();
  }, [refresh]);

  const roleCounts = useMemo(() => {
    const counts = new Map<CreatorHiringRole, number>();
    for (const item of items ?? []) counts.set(item.role, (counts.get(item.role) ?? 0) + 1);
    return counts;
  }, [items]);

  const visibleItems = useMemo(
    () => (items ?? []).filter((item) => roleFilter === "all" || item.role === roleFilter),
    [items, roleFilter],
  );

  return (
    <Container size="wide" className="space-y-6 py-8">
      <Link className={collabButton} href="/collaborate">구인·의뢰로 돌아가기</Link>
      <CareerGalleryHero items={items} failed={error !== ""} />
      <details className="rounded-xl border border-line bg-panel px-4 py-2.5">
        <summary className="cursor-pointer text-sm font-bold text-fg-2 marker:text-accent">
          {translateCurrentStaticSourceText("domains.collaboration.hiring.CreatorCareerPanel", "ko", "면책 안내")}
        </summary>
        <p className="mt-2 pb-1 text-xs leading-6 text-fg-3">
          창작자가 공개 권리를 확인하고 올린 링크입니다. 경력은 본인 작성이며 검증 배지가 아닙니다. 커버 이미지는 창작자가 등록한 외부 주소를 그대로 불러와 보여 주며, 이곳에 복제·저장하지 않습니다.
        </p>
      </details>

      {error && (
        <div className="space-y-3">
          <CollabNotice error>{error}</CollabNotice>
          <button
            type="button"
            className={collabButton}
            onClick={() => {
              setError("");
              setItems(null);
              setRefresh((value) => value + 1);
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            다시 불러오기
          </button>
        </div>
      )}

      {items === null && !error && (
        <div role="status" aria-label="전시를 불러오는 중" className="grid gap-4 md:grid-cols-2" aria-hidden="true">
          <div className="skeleton h-40 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
          <div className="skeleton h-40 rounded-xl" />
        </div>
      )}

      {items?.length === 0 && (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
          <img src="/images/empty-library.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" className="mx-auto mb-4 h-32 w-full max-w-sm rounded-xl border border-line/60 object-cover" />
          <p className="text-sm font-medium text-fg">공개된 포트폴리오가 아직 없어요.</p>
          <p className="mt-1 text-xs leading-6 text-fg-3">경력·포트폴리오 탭에서 경력을 작성하고 공개 전시를 켜면 이곳에 표시됩니다.</p>
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="역할로 거르기">
            <button
              type="button"
              aria-pressed={roleFilter === "all"}
              onClick={() => setRoleFilter("all")}
              className={cn(
                "fx-press min-h-9 rounded-full border px-3.5 text-xs font-bold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                roleFilter === "all"
                  ? "border-accent bg-accent-soft/50 text-accent"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong",
              )}
            >
              전체 {items.length}
            </button>
            {[...roleCounts.entries()].map(([role, count]) => (
              <button
                key={role}
                type="button"
                aria-pressed={roleFilter === role}
                onClick={() => setRoleFilter(role)}
                className={cn(
                  "fx-press min-h-9 rounded-full border px-3.5 text-xs font-bold transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  roleFilter === role
                    ? "border-accent bg-accent-soft/50 text-accent"
                    : "border-line bg-panel text-fg-2 hover:border-line-strong",
                )}
              >
                {CREATOR_HIRING_ROLES[role]} {count}
              </button>
            ))}
          </div>

          {visibleItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
              <p className="text-sm font-medium text-fg">이 역할로 공개된 포트폴리오가 아직 없어요.</p>
              <p className="mt-1 text-xs leading-6 text-fg-3">다른 역할을 골라 보거나 전체 전시로 돌아가세요.</p>
              <button type="button" className={`${collabButton} mt-4`} onClick={() => setRoleFilter("all")}>
                전체 전시 보기
              </button>
            </div>
          ) : (
            <StaggerReveal className="grid gap-4 md:grid-cols-2" itemClassName="h-full">
              {visibleItems.map((item) => {
                const summary = confirmations[item.id];
                return (
                  <article
                    key={item.id}
                    id={`career-card-${item.id}`}
                    className="flex h-full scroll-mt-24 flex-col overflow-hidden rounded-2xl border border-line bg-panel"
                  >
                    <div className="relative">
                      <CareerCoverArt item={item} className="aspect-[16/8] w-full" />
                      <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                        {CREATOR_HIRING_ROLES[item.role]}
                      </span>
                      {summary ? (
                        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                          <BadgeCheck size={12} className="text-good" aria-hidden="true" />
                          상대방 확인
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col gap-2.5 p-5">
                      <h2 className="text-xl font-bold">{item.title}</h2>
                      <p className="text-sm font-semibold text-fg">
                        {item.displayName} · {CREATOR_HIRING_ROLES[item.role]} · 본인 작성
                      </p>
                      <p className="text-sm text-fg-2">
                        {item.startMonth}~{item.endMonth ?? "진행 중"}
                        {item.episodeFrom !== null ? ` · ${item.episodeFrom}~${item.episodeTo}화` : ""}
                      </p>
                      <p className="whitespace-pre-wrap text-sm">{item.scope}</p>
                      <p className="line-clamp-4 whitespace-pre-wrap text-sm text-fg-2">{item.contribution}</p>
                      <CareerPublicConfirmation summary={summary} />
                      <div className="mt-auto pt-1">
                        <a className={collabButton} href={item.portfolioUrl} target="_blank" rel="noopener noreferrer nofollow">
                          외부 포트폴리오 보기
                          <ExternalLink size={14} aria-hidden="true" />
                          <span className="sr-only">(새 탭에서 열림)</span>
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </StaggerReveal>
          )}
        </>
      )}
    </Container>
  );
}
