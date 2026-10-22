import { useEffect, useId, useState } from "react";

import { useT } from "@/shared/lib/i18n";

import { CHIP_BASE, CHIP_OFF, FOCUS_RING, NOTICE_TEXT, cx } from "./studio-bg3d-asset-panel-styles";
import { describeStudioBg3dOrganizationFailure } from "./studio-bg3d-organization-feedback";
import {
  buildStudioBg3dSkpMemoCandidates,
  loadStudioBg3dSkpSidecar,
  partitionStudioBg3dSkpTagNames,
} from "./studio-bg3d-skp-sidecar";

import type { StudioBg3dOrganizationController } from "./studio-bg3d-organization-controller";
import type {
  StudioBg3dSkpSidecar,
  StudioBg3dSkpSidecarLoad,
  StudioBg3dSkpSidecarNames,
  StudioBg3dSkpSourceRef,
} from "./studio-bg3d-skp-sidecar";

/** 한 번에 보여 주는 .skp 소재 수. 넘으면 "외 N개"로 줄인다. */
const MAX_VISIBLE_SOURCES = 3;

export type StudioBg3dSkpSidecarLoader = (
  contentHash: string,
  deps?: { readonly signal?: AbortSignal },
) => Promise<StudioBg3dSkpSidecarLoad>;

interface StudioBg3dOutlinerSkpSourceSectionProps {
  readonly organization: StudioBg3dOrganizationController;
  /** 선택한 오브젝트 중 .skp 에서 온 모델의 원본 정보(해시별로 한 번씩). */
  readonly sources: readonly StudioBg3dSkpSourceRef[];
  readonly selectedEntityIds: readonly string[];
  /** 장면 이름 후보 한 줄을 메모 초안에 더한다. 저장은 사용자가 따로 누른다. */
  readonly onAppendMemoLine: (line: string) => void;
  /** 시험이 저장소 대신 가짜를 주입한다. */
  readonly loadSidecar?: StudioBg3dSkpSidecarLoader;
}

type SidecarState = { readonly status: "loading" } | StudioBg3dSkpSidecarLoad;

const RETRY_CLASS = cx(
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-semibold",
  "text-fg-2 transition-colors hover:bg-raised hover:text-fg sm:min-h-9",
  FOCUS_RING,
);

/** 이름 목록을 글자로만 그린다. 파일에서 온 믿을 수 없는 글이라 링크나 마크업으로 풀지 않는다. */
function NameList({ label, names, emptyText }: { readonly label: string; readonly names: StudioBg3dSkpSidecarNames; readonly emptyText: string }) {
  const t = useT();
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-fg-2">
        {label} <span className="tabular-nums text-fg-3">{names.total}</span>
      </p>
      {!names.available || names.items.length === 0 ? (
        <p className={NOTICE_TEXT}>{emptyText}</p>
      ) : (
        <ul aria-label={label} className="flex flex-wrap gap-1.5">
          {names.items.map((name, index) => (
            <li key={`${index}:${name}`} className="max-w-full rounded-lg border border-line bg-raised px-2 py-1 text-xs text-fg-2">
              <span className="block max-w-[14rem] truncate">{name}</span>
            </li>
          ))}
        </ul>
      )}
      {names.truncated ? (
        <p className={NOTICE_TEXT}>
          {t("studio.bg3dScene.skp.truncated", { total: names.total, count: names.items.length }, "전체 {total}개 중 앞의 {count}개만 저장돼 있어요.")}
        </p>
      ) : null}
    </div>
  );
}

function SidecarBody({
  sidecar,
  organization,
  selectedEntityIds,
  onAppendMemoLine,
}: {
  readonly sidecar: StudioBg3dSkpSidecar;
  readonly organization: StudioBg3dOrganizationController;
  readonly selectedEntityIds: readonly string[];
  readonly onAppendMemoLine: (line: string) => void;
}) {
  const t = useT();
  const [feedback, setFeedback] = useState<string | null>(null);
  const { suggestions: tagSuggestions, rejected: skippedTagNames } = partitionStudioBg3dSkpTagNames(sidecar);
  const memoCandidates = buildStudioBg3dSkpMemoCandidates(sidecar);

  const addTag = (tag: string) => {
    if (selectedEntityIds.length === 0) return;
    const result = organization.addTag(selectedEntityIds, tag);
    if (result.ok) {
      setFeedback(t("studio.bg3dScene.status.tagAdded", "태그를 붙였어요."));
      return;
    }
    const copy = describeStudioBg3dOrganizationFailure(result.reason, "tag");
    setFeedback(t(copy.key, copy.fallback));
  };

  return (
    <div className="space-y-3">
      <NameList
        label={t("studio.bg3dScene.skp.components", "컴포넌트 이름")}
        names={sidecar.components}
        emptyText={t("studio.bg3dScene.skp.noNames", "이 파일에는 읽을 수 있는 이름이 없어요.")}
      />

      <div className="space-y-1">
        <NameList
          label={t("studio.bg3dScene.skp.tags", "태그(레이어) 이름")}
          names={sidecar.tags}
          emptyText={t("studio.bg3dScene.skp.noNames", "이 파일에는 읽을 수 있는 이름이 없어요.")}
        />
        {tagSuggestions.length > 0 ? (
          <div className="space-y-1">
            <p className={NOTICE_TEXT}>
              {t("studio.bg3dScene.skp.tagHint", "고른 오브젝트에 이름을 태그로 붙일 수 있어요. 자동으로 붙이지는 않아요.")}
            </p>
            <ul aria-label={t("studio.bg3dScene.skp.tagSuggestions", "태그로 붙일 이름")} className="flex flex-wrap gap-1.5">
              {tagSuggestions.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    className={cx(CHIP_BASE, CHIP_OFF)}
                    disabled={selectedEntityIds.length === 0}
                    aria-label={t("studio.bg3dScene.skp.addTag", { tag }, "{tag} 태그로 붙이기")}
                    onClick={() => addTag(tag)}
                  >
                    <span className="max-w-[10rem] truncate">{tag}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {skippedTagNames > 0 ? (
          <p className={NOTICE_TEXT}>
            {t("studio.bg3dScene.skp.tagSkipped", { count: skippedTagNames }, "{count}개는 태그 규칙에 맞지 않아 제안하지 않아요.")}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <NameList
          label={t("studio.bg3dScene.skp.scenes", "장면 이름")}
          names={sidecar.scenes}
          emptyText={t("studio.bg3dScene.skp.noNames", "이 파일에는 읽을 수 있는 이름이 없어요.")}
        />
        <p className={NOTICE_TEXT}>
          {t(
            "studio.bg3dScene.skp.sceneHint",
            "장면 이름은 메모 후보로만 보여 줘요. 카메라 위치나 표시 상태는 되살리지 않아요.",
          )}
        </p>
        {memoCandidates.length > 0 ? (
          <ul aria-label={t("studio.bg3dScene.skp.memoCandidates", "메모 후보")} className="space-y-1">
            {memoCandidates.map((line) => (
              <li key={line} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-2 py-1">
                <span className="min-w-0 truncate text-xs text-fg-2">{line}</span>
                <button
                  type="button"
                  className={cx(CHIP_BASE, CHIP_OFF, "shrink-0")}
                  aria-label={t("studio.bg3dScene.skp.addMemo", { line }, "{line} 메모에 붙이기")}
                  onClick={() => onAppendMemoLine(line)}
                >
                  {t("studio.bg3dScene.skp.addMemoShort", "메모에 붙이기")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <p role="status" className={feedback ? NOTICE_TEXT : "sr-only"}>
        {feedback ?? ""}
      </p>
    </div>
  );
}

function SkpSourceNames({
  source,
  organization,
  selectedEntityIds,
  onAppendMemoLine,
  loadSidecar,
}: {
  readonly source: StudioBg3dSkpSourceRef;
  readonly organization: StudioBg3dOrganizationController;
  readonly selectedEntityIds: readonly string[];
  readonly onAppendMemoLine: (line: string) => void;
  readonly loadSidecar: StudioBg3dSkpSidecarLoader;
}) {
  const t = useT();
  const [state, setState] = useState<SidecarState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const { contentHash } = source;

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadSidecar(contentHash, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setState(result);
    });
    return () => controller.abort();
  }, [contentHash, loadSidecar, attempt]);

  return (
    <div role="group" aria-labelledby={titleId} className="space-y-2 rounded-lg border border-line bg-panel p-2">
      <p id={titleId} className="truncate text-xs font-bold text-fg">
        {source.name}
      </p>
      {state.status === "loading" ? (
        <p role="status" className={NOTICE_TEXT}>
          {t("studio.bg3dScene.skp.loading", "이름 기록을 불러오는 중이에요.")}
        </p>
      ) : state.status === "failed" ? (
        <div className="space-y-1.5">
          <p role="alert" className={cx(NOTICE_TEXT, "font-semibold text-accent")}>
            {t("studio.bg3dScene.skp.failed", "이름 기록을 읽지 못했어요. 잠시 후 다시 시도해 주세요.")}
          </p>
          <button type="button" className={RETRY_CLASS} onClick={() => setAttempt((value) => value + 1)}>
            {t("studio.bg3dScene.skp.retry", "다시 시도")}
          </button>
        </div>
      ) : state.status === "missing" ? (
        <p className={NOTICE_TEXT}>
          {t(
            "studio.bg3dScene.skp.missing",
            "이 소재의 이름 기록이 없어요. 이름 기록은 .skp를 가져온 기기에만 남아요. 다른 기기에서 가져온 소재라면 .skp 파일을 다시 가져와 주세요.",
          )}
        </p>
      ) : (
        <SidecarBody
          sidecar={state.sidecar}
          organization={organization}
          selectedEntityIds={selectedEntityIds}
          onAppendMemoLine={onAppendMemoLine}
        />
      )}
    </div>
  );
}

/**
 * 선택한 .skp 소재가 가져올 때 남긴 컴포넌트·태그(레이어)·장면 이름을 글자로 보여 준다.
 * 이 화면이 하는 일은 이름 보기와 사용자가 직접 누르는 태그·메모 옮기기뿐이다 — SketchUp 의 컴포넌트 계층,
 * 태그 표시 상태, 장면(카메라)은 복원하지 않으며 위 안내문이 그 사실을 그대로 말한다.
 */
export function StudioBg3dOutlinerSkpSourceSection({
  organization,
  sources,
  selectedEntityIds,
  onAppendMemoLine,
  loadSidecar = loadStudioBg3dSkpSidecar,
}: StudioBg3dOutlinerSkpSourceSectionProps) {
  const t = useT();
  const headingId = useId();
  if (sources.length === 0) return null;
  const visible = sources.slice(0, MAX_VISIBLE_SOURCES);
  return (
    <section aria-labelledby={headingId} className="space-y-2" data-studio-bg3d-skp-sources="">
      <h4 id={headingId} className="text-xs font-bold text-fg-2">
        {t("studio.bg3dScene.skp.heading", "원본 SKP 이름")}
      </h4>
      <p className={NOTICE_TEXT}>
        {t(
          "studio.bg3dScene.skp.scope",
          "SketchUp 파일에 적힌 이름만 가져와요. 컴포넌트 계층, 태그(레이어) 표시 상태, 장면(카메라)은 되살리지 않아요.",
        )}
      </p>
      {visible.map((source) => (
        <SkpSourceNames
          key={source.contentHash}
          source={source}
          organization={organization}
          selectedEntityIds={selectedEntityIds}
          onAppendMemoLine={onAppendMemoLine}
          loadSidecar={loadSidecar}
        />
      ))}
      {sources.length > visible.length ? (
        <p className={NOTICE_TEXT}>
          {t("studio.bg3dScene.skp.more", { count: sources.length - visible.length }, "외 {count}개 소재는 하나씩 골라서 볼 수 있어요.")}
        </p>
      ) : null}
    </section>
  );
}
