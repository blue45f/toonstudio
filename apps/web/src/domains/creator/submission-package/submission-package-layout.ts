/**
 * 투고 패키지 — ZIP 안의 파일 배치 계획(순수·결정적).
 *
 * 경로는 모두 ASCII 로 만든다. 한글 제목이나 원래 파일 이름을 경로에 쓰면 운영체제마다 유니코드 정규화
 * (NFC/NFD)가 달라 압축을 풀 때 이름이 깨지거나 충돌할 수 있기 때문이다. 원래 이름은 매니페스트에 남긴다.
 * ZIP 안에 최상위 폴더를 따로 두지 않는다 — 압축 해제 도구가 ZIP 이름으로 폴더를 만들어 주므로 이중 폴더가
 * 생기지 않게 한다.
 */
import { isReadableSubmissionPage } from "./submission-package-preflight";
import type { SubmissionImageMime, SubmissionPackageDraft } from "./submission-package-types";

export const SUBMISSION_PACKAGE_COVER_PATH = "cover.md";
export const SUBMISSION_PACKAGE_COVER_PDF_PATH = "cover.pdf";
export const SUBMISSION_PACKAGE_SYNOPSIS_PATH = "synopsis.md";
export const SUBMISSION_PACKAGE_CHARACTERS_PATH = "characters.md";
export const SUBMISSION_PACKAGE_MANIFEST_PATH = "manifest.json";

export interface PlannedSubmissionPage {
  readonly pageId: string;
  readonly path: string;
  readonly mime: SubmissionImageMime;
  readonly originalName: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

export interface PlannedSubmissionEpisode {
  readonly episodeId: string;
  readonly number: number;
  readonly directory: string;
  readonly pages: readonly PlannedSubmissionPage[];
}

export interface SubmissionPackageLayout {
  readonly coverPdf: boolean;
  readonly episodes: readonly PlannedSubmissionEpisode[];
  /** 담기는 이미지 파일 수. */
  readonly pageCount: number;
}

const EXTENSION_BY_MIME: Readonly<Record<SubmissionImageMime, string>> = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
});

function padded(value: number, digits: number): string {
  return String(value).padStart(digits, "0");
}

/**
 * 회차는 번호 순, 쪽은 초안에 놓인 순서로 담는다. 읽을 수 없는 쪽과 이미지가 없는 회차는 점검이 이미
 * 막으므로 여기서는 건너뛰기만 한다(방어).
 */
export function planSubmissionPackageLayout(
  draft: SubmissionPackageDraft,
  options: { readonly includeCoverPdf: boolean },
): SubmissionPackageLayout {
  const ordered = [...draft.episodes].sort((left, right) => left.number - right.number);
  const episodes: PlannedSubmissionEpisode[] = [];
  let pageCount = 0;
  for (const episode of ordered) {
    const readable = episode.pages.filter(isReadableSubmissionPage);
    if (readable.length === 0) continue;
    const directory = `episodes/ep-${padded(episode.number, 3)}`;
    const pageDigits = Math.max(3, String(readable.length).length);
    const pages: PlannedSubmissionPage[] = [];
    readable.forEach((page, index) => {
      if (page.mime === null || page.width === null || page.height === null) return;
      pages.push({
        pageId: page.id,
        path: `${directory}/p-${padded(index + 1, pageDigits)}.${EXTENSION_BY_MIME[page.mime]}`,
        mime: page.mime,
        originalName: page.name,
        width: page.width,
        height: page.height,
        bytes: page.size,
      });
    });
    pageCount += pages.length;
    episodes.push({ episodeId: episode.id, number: episode.number, directory, pages });
  }
  return { coverPdf: options.includeCoverPdf, episodes, pageCount };
}

/** ZIP 에 들어가는 모든 경로(표지·텍스트·매니페스트·이미지). 표지의 "묶음 구성" 목록에 쓴다. */
export function listSubmissionPackagePaths(layout: SubmissionPackageLayout): string[] {
  return [
    SUBMISSION_PACKAGE_COVER_PATH,
    ...(layout.coverPdf ? [SUBMISSION_PACKAGE_COVER_PDF_PATH] : []),
    SUBMISSION_PACKAGE_SYNOPSIS_PATH,
    SUBMISSION_PACKAGE_CHARACTERS_PATH,
    SUBMISSION_PACKAGE_MANIFEST_PATH,
    ...layout.episodes.flatMap((episode) => episode.pages.map((page) => page.path)),
  ];
}
