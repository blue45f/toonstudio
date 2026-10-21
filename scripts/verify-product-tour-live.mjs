#!/usr/bin/env node
/**
 * 제품 투어 배포 후 Remotion 실재생 게이트 (백로그 G5, 2026-10-22).
 *
 * 대상: 배포된 사이트의 /product-tour (기본 https://www.toonstudio.cloud/product-tour).
 * 로컬 개발 서버에도 같은 절차로 쓸 수 있다(`--url`).
 *
 * 확인하는 것 (전부 화면의 실제 신호로 판정한다 — 파일 존재로 대체하지 않는다):
 *  G5-1 Remotion 재생: 포스터를 눌러 재생을 시작했을 때 플레이어 섹션의
 *       `data-player-engine`이 끝까지 "remotion"이고, `data-current-frame`이
 *       전진하며, MP4 폴백 섹션(`data-player-engine="mp4"`)·폴백 안내·
 *       <video> 요소가 나타나지 않는다. (ProductTourPlayer.tsx /
 *       ProductTourMp4Player.tsx의 data 속성 계약)
 *  G5-2 내레이션·자막·챕터:
 *       - 오디오: 컴포지션 안 <audio> 요소가 있고 오류가 없으며 재생 가능
 *         상태(readyState ≥ 2)에 도달한다. 내레이션/BGM은 seekable blob으로
 *         주입되므로 src는 blob: 또는 product-tour 오디오 경로다.
 *       - 자막: 재생 초반 큐 구간(0.8s~)에 한국어 자막 문장이 화면에 뜬다.
 *       - 챕터: 챕터 레일이 10개이고, 5번 챕터(228s)를 누르면
 *         data-current-frame이 228×30 근처로 이동한다.
 *  G5-3 청크 단일 인스턴스는 이 스크립트가 아니라
 *       scripts/check-product-tour-remotion-chunks.mjs가 CI에서 본다.
 *
 * 사용법:
 *   node scripts/verify-product-tour-live.mjs [--url <URL>] [--output <json path>] [--dry-run]
 * 종료 코드: 0 통과 · 1 게이트 실패 · 2 실행 전제(Playwright 등) 미비.
 * 결과 JSON과 실패 시 스크린샷을 --output 디렉터리에 남긴다.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** 투어 정본 상수 — product-tour-content.ts / ProductTourFilm.tsx와 쌍으로 유지한다. */
export const PRODUCT_TOUR_LIVE_EXPECTATIONS = Object.freeze({
  fps: 30,
  chapterCount: 10,
  /** 챕터 레일에서 탐색 검증에 쓰는 챕터(0-기반 인덱스, 시작 초, 기대 프레임). */
  seekChapterIndex: 4,
  seekChapterStartSeconds: 228,
  seekFrameTolerance: 90,
  /** 재생 직후 자막 큐(0.8s 시작)의 한국어 문장 일부. */
  captionProbeText: "툰스튜디오는 단순히 그림 한 장을 그리는 도구",
  frameAdvanceMinimum: 30,
});

/**
 * 관측값을 게이트 판정으로 바꾼다. 브라우저 수집부와 분리해 단위 테스트한다.
 * observation 필드는 아래 수집 절차(main)가 채우는 모양 그대로다.
 */
export function evaluateProductTourObservation(observation) {
  const checks = [];
  const push = (id, ok, detail) => checks.push({ id, ok, detail });

  push(
    "G5-1.engine-remotion",
    observation.engine === "remotion",
    `data-player-engine=${observation.engine ?? "(없음)"}`,
  );
  push(
    "G5-1.no-mp4-fallback",
    observation.mp4VideoCount === 0 && observation.fallbackNoticePresent === false,
    `<video> ${observation.mp4VideoCount}개 · 폴백 안내 ${observation.fallbackNoticePresent ? "있음" : "없음"}`,
  );
  push(
    "G5-1.frame-advances",
    typeof observation.frameAtStart === "number"
      && typeof observation.frameAfterWait === "number"
      && observation.frameAfterWait - observation.frameAtStart
        >= PRODUCT_TOUR_LIVE_EXPECTATIONS.frameAdvanceMinimum,
    `frame ${observation.frameAtStart} → ${observation.frameAfterWait}`,
  );
  push(
    "G5-1.phase-ready",
    observation.phase === "ready" && observation.started === "true",
    `data-player-phase=${observation.phase ?? "(없음)"} · started=${observation.started ?? "(없음)"}`,
  );

  const audios = Array.isArray(observation.audioElements) ? observation.audioElements : [];
  const audioWithError = audios.filter((audio) => audio.hasError);
  const audioReady = audios.filter((audio) => audio.readyState >= 2);
  push(
    "G5-2.audio-present",
    audios.length >= 1 && audioReady.length >= 1 && audioWithError.length === 0,
    `<audio> ${audios.length}개 · ready ${audioReady.length}개 · error ${audioWithError.length}개`,
  );
  push(
    "G5-2.caption-visible",
    observation.captionFound === true,
    observation.captionFound ? "초반 큐 자막 문장이 화면에 표시됨" : "초반 큐 자막 문장을 찾지 못함",
  );
  push(
    "G5-2.chapter-count",
    observation.chapterCount === PRODUCT_TOUR_LIVE_EXPECTATIONS.chapterCount,
    `챕터 버튼 ${observation.chapterCount}개 (기대 ${PRODUCT_TOUR_LIVE_EXPECTATIONS.chapterCount}개)`,
  );
  const expectedFrame = PRODUCT_TOUR_LIVE_EXPECTATIONS.seekChapterStartSeconds
    * PRODUCT_TOUR_LIVE_EXPECTATIONS.fps;
  push(
    "G5-2.chapter-seek",
    typeof observation.frameAfterChapterSeek === "number"
      && Math.abs(observation.frameAfterChapterSeek - expectedFrame)
        <= PRODUCT_TOUR_LIVE_EXPECTATIONS.seekFrameTolerance,
    `챕터 탐색 후 frame=${observation.frameAfterChapterSeek} (기대 ${expectedFrame}±${PRODUCT_TOUR_LIVE_EXPECTATIONS.seekFrameTolerance})`,
  );

  return { ok: checks.every((check) => check.ok), checks };
}

function parseArgs(argv) {
  const args = {
    url: process.env.PRODUCT_TOUR_URL ?? "https://www.toonstudio.cloud/product-tour",
    output: "qa-results/product-tour-live/result.json",
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--url") { args.url = argv[index + 1]; index += 1; }
    else if (value === "--output") { args.output = argv[index + 1]; index += 1; }
    else if (value === "--dry-run") args.dryRun = true;
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`알 수 없는 인자: ${value}`);
  }
  return args;
}

async function collectObservation(page) {
  const section = page.locator("#product-tour-video");
  await section.waitFor({ state: "visible", timeout: 30_000 });

  const chapterCount = await page
    .locator(".product-tour-player__chapter > button")
    .count();

  // 재생은 사용자 입력 안에서 시작해야 소리가 막히지 않는 구조라 포스터를 실제로 누른다.
  await page.locator(".product-tour-player__poster").click();

  const readState = async () => page.evaluate(() => {
    const root = document.querySelector("#product-tour-video");
    if (!root) return null;
    const audios = [...root.querySelectorAll("audio")].map((audio) => ({
      readyState: audio.readyState,
      hasError: Boolean(audio.error),
      paused: audio.paused,
    }));
    return {
      engine: root.getAttribute("data-player-engine"),
      phase: root.getAttribute("data-player-phase"),
      started: root.getAttribute("data-player-started"),
      frame: Number(root.getAttribute("data-current-frame") ?? "NaN"),
      videoCount: root.querySelectorAll("video").length,
      fallbackNotice: Boolean(root.querySelector(".product-tour-player__fallback-notice")),
      audios,
      text: root.textContent ?? "",
    };
  });

  // 프레임 전진 대기 (최대 30초). 엔진이 mp4로 뒤집히면 즉시 관측을 마친다.
  let start = await readState();
  const deadline = Date.now() + 30_000;
  let after = start;
  while (Date.now() < deadline) {
    after = await readState();
    if (!after || after.engine !== "remotion") break;
    if (
      start && Number.isFinite(start.frame) && Number.isFinite(after.frame)
      && after.frame - start.frame >= PRODUCT_TOUR_LIVE_EXPECTATIONS.frameAdvanceMinimum
      && after.phase === "ready"
    ) break;
    if (start && (!Number.isFinite(start.frame) || start.frame === after.frame)) start = after;
    await page.waitForTimeout(500);
  }

  // 자막: 재생 초반 큐 구간 문장이 컴포지션 오버레이에 뜨는지 본다.
  let captionFound = Boolean(after?.text.includes(PRODUCT_TOUR_LIVE_EXPECTATIONS.captionProbeText));
  if (!captionFound) {
    try {
      await page.waitForFunction(
        (probe) => document.querySelector("#product-tour-video")?.textContent?.includes(probe),
        PRODUCT_TOUR_LIVE_EXPECTATIONS.captionProbeText,
        { timeout: 15_000 },
      );
      captionFound = true;
    } catch { /* 아래 판정에서 실패로 기록된다 */ }
  }

  // 챕터 탐색: 5번 챕터(228s)를 눌러 프레임이 해당 위치로 이동하는지 본다.
  let frameAfterChapterSeek = null;
  const buttons = page.locator(".product-tour-player__chapter > button");
  if (await buttons.count() > PRODUCT_TOUR_LIVE_EXPECTATIONS.seekChapterIndex) {
    await buttons.nth(PRODUCT_TOUR_LIVE_EXPECTATIONS.seekChapterIndex).click();
    await page.waitForTimeout(1_500);
    const seekState = await readState();
    frameAfterChapterSeek = Number.isFinite(seekState?.frame) ? seekState.frame : null;
    if (seekState) after = seekState;
  }

  return {
    engine: after?.engine ?? null,
    phase: after?.phase ?? null,
    started: after?.started ?? null,
    frameAtStart: Number.isFinite(start?.frame) ? start.frame : null,
    frameAfterWait: Number.isFinite(after?.frame) ? after.frame : null,
    mp4VideoCount: after?.videoCount ?? 0,
    fallbackNoticePresent: Boolean(after?.fallbackNotice),
    audioElements: after?.audios ?? [],
    captionFound,
    chapterCount,
    frameAfterChapterSeek,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      "사용법: node scripts/verify-product-tour-live.mjs [--url <URL>] [--output <json path>] [--dry-run]\n",
    );
    return 0;
  }
  if (args.dryRun) {
    process.stdout.write(
      [
        "[product-tour-live] dry-run — 실행 계획만 출력합니다.",
        `  대상: ${args.url}`,
        "  절차: 페이지 열기 → 챕터 10개 확인 → 포스터 클릭 → Remotion 엔진·프레임 전진·자막·오디오 확인 → 5번 챕터 탐색 확인",
        "  산출물: 결과 JSON + 실패 시 스크린샷 (" + args.output + ")",
      ].join("\n") + "\n",
    );
    return 0;
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    process.stderr.write(
      "[product-tour-live] Playwright가 설치돼 있지 않아 실재생을 확인할 수 없습니다. "
      + "`pnpm install` 후 다시 실행하세요. (미실행을 통과로 보고하지 않습니다)\n",
    );
    return 2;
  }

  const outputPath = resolve(args.output);
  const screenshotPath = outputPath.replace(/\.json$/u, "") + "-failure.png";
  // 프록시를 거쳐야 하는 실행 환경에서는 PRODUCT_TOUR_PROXY로 지정한다(값은 결과에 기록하지 않는다).
  const proxyServer = process.env.PRODUCT_TOUR_PROXY;
  const browser = await chromium.launch({
    headless: true,
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
  });
  const result = { url: args.url, measuredAt: new Date().toISOString(), ok: false, checks: [], observation: null };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(args.url, { waitUntil: "load", timeout: 60_000 });
    result.observation = await collectObservation(page);
    const evaluation = evaluateProductTourObservation(result.observation);
    result.checks = evaluation.checks;
    result.ok = evaluation.ok;
    if (!result.ok) {
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      result.screenshot = screenshotPath;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await browser.close();
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  for (const check of result.checks) {
    process.stdout.write(`[product-tour-live] ${check.ok ? "통과" : "실패"} ${check.id} — ${check.detail}\n`);
  }
  if (result.error) {
    process.stderr.write(`[product-tour-live] 수집 오류 — ${result.error}\n`);
    return 2;
  }
  process.stdout.write(
    `[product-tour-live] ${result.ok ? "전체 통과" : "게이트 실패"} — 결과: ${outputPath}\n`,
  );
  return result.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      process.stderr.write(`[product-tour-live] 실행 오류 — ${error.message}\n`);
      process.exitCode = 2;
    },
  );
}
