// "3D 배경" 템플릿 탭의 원클릭 웹툰 배경 선택기 — 교실·복도·거리를 사람 키 기준 실제 크기로 한 번에 만든다.
//
// 기존 씬 템플릿은 장난감 비례라 사람을 세운 구도에 맞지 않았다. 여기 항목은 룸 빌더·거리 생성기로 짠 사람 크기 스펙이다
// (studio-bg3d-webtoon-background-templates.ts). 장면 변경은 부모가 가진 "도형 묶음 추가" 경로(addGeneratedParts)에
// 맡긴다: 이 컴포넌트는 (기존 도형 수, 카메라 뷰) → 도형 묶음을 돌려주는 함수만 만들어 넘긴다. 그래서 노드 한도 검사·한 번의
// 되돌리기 단계·첫 도형 선택은 방 만들기·복합 오브젝트와 같은 곳에서 처리된다.
//
// 이 파일은 지연 청크(studio-bg3d-editor-runtime-bindings.ts 의 createLazyComponent)로만 불러온다.

import { Building2, DoorOpen, GraduationCap, Sparkles } from "lucide-react";
import { useState } from "react";

import { LtToggleRow } from "./studio-bg3d-control-fields";
import { STUDIO_BG3D_ROOM_WALL_LABELS } from "./studio-bg3d-room-builder";
import {
  buildStudioBg3dWebtoonBackground,
  STUDIO_BG3D_WEBTOON_BACKGROUNDS,
  type StudioBg3dWebtoonBackgroundBuild,
  type StudioBg3dWebtoonBackgroundEntry,
  type StudioBg3dWebtoonBackgroundId,
} from "./studio-bg3d-webtoon-background-templates";

import type { BgPrimitive } from "../studio-background-3d-metadata";

/** 호스트가 현재 카메라(월드 좌표)를 넘겨 주는 모양. 자동 단면 판정에만 쓴다. */
export interface StudioBg3dWebtoonCameraView {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export type StudioBg3dWebtoonBuildParts = (
  existingCount: number,
  view: StudioBg3dWebtoonCameraView,
) => BgPrimitive[];

export interface StudioBg3dWebtoonBackgroundPickerProps {
  readonly disabled?: boolean;
  readonly autoCutaway: boolean;
  readonly onAutoCutawayChange: (next: boolean) => void;
  /** 호스트의 도형 묶음 추가: 장면에 반영했으면 true, 한도·준비 상태 때문에 못 했으면 false. */
  readonly onBuild: (buildParts: StudioBg3dWebtoonBuildParts) => boolean | undefined;
}

const ENTRY_ICON: Record<StudioBg3dWebtoonBackgroundId, typeof Building2> = {
  classroom: GraduationCap,
  corridor: DoorOpen,
  street: Building2,
};

const STREET_SWATCH = "#4a4a50";

function swatchColor(entry: StudioBg3dWebtoonBackgroundEntry): string {
  return entry.kind === "room" ? entry.spec.floorColor : STREET_SWATCH;
}

function describeBuilt(build: StudioBg3dWebtoonBackgroundBuild): string {
  const hidden = build.hiddenWalls.map((wall) => STUDIO_BG3D_ROOM_WALL_LABELS[wall]).join("·");
  const base = `${build.entry.label} 추가 완료 · 오브젝트 ${build.primitives.length}개`;
  return hidden
    ? `${base} · ${hidden}을 카메라에 맞춰 숨겼어요(레이어 목록에서 다시 켤 수 있어요)`
    : base;
}

export function StudioBg3dWebtoonBackgroundPicker({
  disabled = false,
  autoCutaway,
  onAutoCutawayChange,
  onBuild,
}: StudioBg3dWebtoonBackgroundPickerProps) {
  const [notice, setNotice] = useState<string | null>(null);

  const build = (id: StudioBg3dWebtoonBackgroundId) => {
    const built: { current: StudioBg3dWebtoonBackgroundBuild | null } = { current: null };
    const accepted = onBuild((existingCount, view) => {
      built.current = buildStudioBg3dWebtoonBackground(id, existingCount, {
        autoCutawayCamera: autoCutaway ? view : null,
      });
      return built.current?.primitives ?? [];
    });
    setNotice(
      accepted && built.current
        ? describeBuilt(built.current)
        : "지금은 추가하지 못했어요. 편집기를 준비하는 중이거나 오브젝트 한도에 닿았을 수 있어요.",
    );
  };

  return (
    <section aria-labelledby="bg3d-webtoon-background-title">
      <h3
        id="bg3d-webtoon-background-title"
        className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg"
      >
        <Sparkles size={15} className="text-accent" aria-hidden />
        원클릭 웹툰 배경
      </h3>
      <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">
        사람 키 기준 실제 크기(문 2.1m, 책상 윗면 0.72m, 층고 3m)로 한 번에 만듭니다. 추가한 뒤에는 벽·책상·가로등을
        하나씩 골라 옮기고 지울 수 있어요.
      </p>

      <div className="space-y-2">
        {STUDIO_BG3D_WEBTOON_BACKGROUNDS.map((entry) => {
          const Icon = ENTRY_ICON[entry.id];
          return (
            <button
              key={entry.id}
              type="button"
              disabled={disabled}
              className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-card px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => build(entry.id)}
            >
              <span
                className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-line/70"
                style={{ backgroundColor: swatchColor(entry) }}
                aria-hidden
              >
                <Icon size={15} className="text-white/85 mix-blend-luminosity" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-fg">{entry.label} 만들기</span>
                <span className="mt-0.5 block text-[0.66rem] leading-snug text-fg-3">{entry.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 rounded-xl border border-line bg-card/70 px-3">
        <LtToggleRow
          checked={autoCutaway}
          label="자동 단면 (카메라 쪽 벽 숨김)"
          disabled={disabled}
          onChange={onAutoCutawayChange}
        />
        <p className="pb-2 text-[0.64rem] leading-relaxed text-fg-3">
          교실·복도는 방 밖에서 안을 볼 때 시선을 가로막는 벽을 추가하는 순간 숨깁니다. 거리에는 벽이 없어 영향이 없어요.
        </p>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="mt-2 min-h-4 text-[0.65rem] leading-relaxed text-fg-3"
      >
        {notice}
      </p>
    </section>
  );
}
