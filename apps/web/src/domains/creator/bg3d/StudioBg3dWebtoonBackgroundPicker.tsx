// "3D 배경" 템플릿 탭의 원클릭 웹툰 배경 선택기 — 교실·복도·거리를 사람 키 기준 실제 크기로 한 번에 만든다.
//
// 기존 씬 템플릿은 장난감 비례라 사람을 세운 구도에 맞지 않았다. 여기 항목은 룸 빌더·거리 생성기로 짠 사람 크기 스펙이다
// (studio-bg3d-webtoon-background-templates.ts). 장면 변경은 부모가 가진 "도형 묶음 추가" 경로(addGeneratedParts)에
// 맡긴다: 이 컴포넌트는 (기존 도형 수, 카메라 뷰) → 도형 묶음을 돌려주는 함수만 만들어 넘긴다. 그래서 노드 한도 검사·한 번의
// 되돌리기 단계·첫 도형 선택은 방 만들기·복합 오브젝트와 같은 곳에서 처리된다.
//
// 자동 단면(카메라 쪽 벽 숨김)은 이 선택기에서 기본으로 켜져 있다. 켜진 채로 벽을 숨기면 그 사실을 안내하고, 숨긴 조각을
// 한 번에 되살리는 버튼을 함께 보여 준다(visible:false 도형은 뷰포트 클릭도 받지 않으므로 되살릴 길이 눈에 보여야 한다).
//
// 이 파일은 지연 청크(studio-bg3d-editor-runtime-bindings.ts 의 createLazyComponent)로만 불러온다.

import { Building2, DoorOpen, GraduationCap, Sparkles } from "lucide-react";
import { useState } from "react";

import { StudioBg3dBuildNotice } from "./StudioBg3dBuildNotice";
import {
  describeStudioBg3dBuildNotice,
  STUDIO_BG3D_AUTO_CUTAWAY_LABEL,
  STUDIO_BG3D_BUILD_FAILED_NOTICE,
  STUDIO_BG3D_PICKER_CUTAWAY_HELP,
  STUDIO_BG3D_PICKER_INTRO,
  summarizeStudioBg3dHiddenWalls,
  type StudioBg3dHiddenWallSummary,
} from "./studio-bg3d-build-notice";
import { LtToggleRow } from "./studio-bg3d-control-fields";
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
  /** 호스트의 도형 묶음 추가: 장면에 반영했으면 true(또는 더한 도형 목록), 한도·준비 상태 때문에 못 했으면 false. */
  readonly onBuild: (buildParts: StudioBg3dWebtoonBuildParts) => boolean | readonly BgPrimitive[] | undefined;
  /** "숨긴 벽 되돌리기": 이 id 의 도형을 다시 보이게 한다. 주지 않으면 버튼을 그리지 않는다. */
  readonly onShowParts?: ((ids: readonly string[]) => void) | undefined;
  /** "새로 만든 곳 보기": 방금 선택된 새 배경으로 화면을 맞춘다. 주지 않으면 버튼을 그리지 않는다. */
  readonly onFocusBuilt?: (() => void) | undefined;
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

type PickerNotice =
  | { readonly kind: "failed" }
  | {
      readonly kind: "built";
      readonly label: string;
      readonly objectCount: number;
      readonly hiddenWalls: StudioBg3dHiddenWallSummary;
      readonly wallsRestored: boolean;
      readonly anchorX: number;
    };

export function StudioBg3dWebtoonBackgroundPicker({
  disabled = false,
  autoCutaway,
  onAutoCutawayChange,
  onBuild,
  onShowParts,
  onFocusBuilt,
}: StudioBg3dWebtoonBackgroundPickerProps) {
  const [notice, setNotice] = useState<PickerNotice | null>(null);

  const build = (id: StudioBg3dWebtoonBackgroundId) => {
    const built: { current: StudioBg3dWebtoonBackgroundBuild | null } = { current: null };
    const accepted = onBuild((existingCount, view) => {
      built.current = buildStudioBg3dWebtoonBackground(id, existingCount, {
        autoCutawayCamera: autoCutaway ? view : null,
      });
      return built.current?.primitives ?? [];
    });
    const result = built.current;
    setNotice(
      accepted && result
        ? {
            kind: "built",
            label: result.entry.label,
            objectCount: result.primitives.length,
            hiddenWalls: summarizeStudioBg3dHiddenWalls(result.primitives),
            wallsRestored: false,
            anchorX: result.anchorX,
          }
        : { kind: "failed" },
    );
  };

  const restoreWalls = () => {
    if (notice?.kind !== "built") return;
    onShowParts?.(notice.hiddenWalls.ids);
    setNotice({ ...notice, wallsRestored: true });
  };

  const built = notice?.kind === "built" ? notice : null;
  const message = built
    ? describeStudioBg3dBuildNotice(built)
    : notice?.kind === "failed"
      ? STUDIO_BG3D_BUILD_FAILED_NOTICE
      : null;

  return (
    <section aria-labelledby="bg3d-webtoon-background-title">
      <h3
        id="bg3d-webtoon-background-title"
        className="mb-2 flex items-center gap-1.5 text-sm font-bold text-fg"
      >
        <Sparkles size={15} className="text-accent" aria-hidden />
        원클릭 웹툰 배경
      </h3>
      <p className="mb-2.5 text-[0.68rem] leading-relaxed text-fg-3">{STUDIO_BG3D_PICKER_INTRO}</p>

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
          label={STUDIO_BG3D_AUTO_CUTAWAY_LABEL}
          disabled={disabled}
          onChange={onAutoCutawayChange}
        />
        <p className="pb-2 text-[0.64rem] leading-relaxed text-fg-3">{STUDIO_BG3D_PICKER_CUTAWAY_HELP}</p>
      </div>

      <StudioBg3dBuildNotice
        message={message}
        disabled={disabled}
        onRestoreWalls={built && built.hiddenWalls.ids.length > 0 && !built.wallsRestored && onShowParts ? restoreWalls : undefined}
        onFocusBuilt={built && built.anchorX > 0 ? onFocusBuilt : undefined}
      />
    </section>
  );
}
