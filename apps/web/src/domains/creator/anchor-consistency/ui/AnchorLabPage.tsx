/**
 * 캐릭터 앵커 연구실 — 3D 캐릭터의 정/반측 턴테이블 앵커 세트를 만들고, 후보 이미지를 앵커와 견주어 보는 Labs 화면.
 *
 * 상태: experimental(Labs). 편집기 호스트에는 연결되어 있지 않다. 3D 스테이지에서 바로 캡처하는 대신 3D 에서 저장한 이미지를
 * 각도별로 끌어다 놓아 세트를 만든다(docs/features/anchor-consistency.md "현재와 목표").
 *
 * 경계: 이미지는 이 기기 안에서만 처리한다(네트워크 없음, 얼굴 인식·생체 정보 추출 없음). 점수는 휴리스틱 참고 값이며 같은
 * 캐릭터인지 판정하거나 일관성을 보장하지 않는다. 상태는 훅 세 개(세트·샷·후보)가 각각 소유하고 이 파일은 조립만 한다.
 */
import { useMemo } from "react";

import { Container } from "@/shared/components/section";
import { useT } from "@/shared/lib/i18n";

import "../anchor-lab-i18n";
import type { AnchorCandidateDeps } from "../anchor-candidate-session";
import { AnchorCandidatePanel } from "./AnchorCandidatePanel";
import { AnchorExportPanel } from "./AnchorExportPanel";
import { AnchorIdentityPanel } from "./AnchorIdentityPanel";
import { AnchorLimitsNotice } from "./AnchorLimitsNotice";
import { AnchorSetPanel } from "./AnchorSetPanel";
import { useAnchorCandidates } from "./use-anchor-candidates";
import { useAnchorExport, type AnchorExportDeps } from "./use-anchor-export";
import { useAnchorSetBuilder } from "./use-anchor-set-builder";
import { useAnchorShots } from "./use-anchor-shots";
import { useObjectUrls } from "./use-object-urls";

/** 시험에서 브라우저 의존(이미지 디코딩·ZIP·내려받기)을 갈아 끼우는 주입점. 운영에서는 비워 둔다. */
export interface AnchorLabDeps {
  readonly candidates?: AnchorCandidateDeps;
  readonly export?: AnchorExportDeps;
}

export function AnchorLabPage({ deps }: { readonly deps?: AnchorLabDeps } = {}) {
  const t = useT();
  const builder = useAnchorSetBuilder();
  const shots = useAnchorShots();
  const exporter = useAnchorExport({
    set: builder.set,
    frames: builder.frames,
    rights: builder.rights,
    shots: shots.frames,
    deps: deps?.export,
  });
  const candidates = useAnchorCandidates({
    frames: builder.frames,
    canAcceptFiles: builder.rightsConfirmed,
    deps: deps?.candidates,
  });
  const anchorPreviewEntries = useMemo(
    () => builder.frames.map((frame) => ({ id: frame.imageSha256, blob: new Blob([frame.bytes.slice()], { type: frame.mimeType }) })),
    [builder.frames],
  );
  const anchorPreviewUrls = useObjectUrls(anchorPreviewEntries);

  return (
    <Container size="wide" className="space-y-6 break-keep py-6 sm:space-y-8 sm:py-10 lg:py-12">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">{t("anchorLab.header.eyebrow")}</p>
        <h1 className="text-2xl font-bold text-fg sm:text-3xl">{t("anchorLab.header.title")}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-fg-2 sm:text-base">{t("anchorLab.header.lead")}</p>
      </header>

      <AnchorLimitsNotice />
      <AnchorIdentityPanel builder={builder} />
      <AnchorSetPanel builder={builder} previewUrls={anchorPreviewUrls} />
      <AnchorExportPanel builder={builder} shots={shots} exporter={exporter} />
      <AnchorCandidatePanel
        candidates={candidates}
        frames={builder.frames}
        anchorPreviewUrls={anchorPreviewUrls}
        rightsConfirmed={builder.rightsConfirmed}
      />
    </Container>
  );
}
