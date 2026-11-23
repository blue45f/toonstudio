import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import {
  classifyStudio3dCanvas,
  classifyStudio3dImage,
  studio3dProductionAuditFailures,
  summarizeStudio3dProductionAudit,
} from "./lib/studio-3d-production-audit-policy.mjs";

export const DEFAULT_STUDIO_3D_AUDIT_URL = "https://www.toonstudio.cloud/studio";
export const DEFAULT_STUDIO_3D_AUDIT_OUTPUT = "artifacts/studio-3d-production-audit";
export const DEFAULT_STUDIO_3D_SURFACE_SETTLE_MS = 10_000;
export const DEFAULT_STUDIO_3D_QUIET_WINDOW_MS = 600;
export const DEFAULT_STUDIO_3D_PRE_NAV_SETTLE_MAX_MS = 6_000;
export const DEFAULT_STUDIO_3D_AUDIT_TARGETS = Object.freeze([
  Object.freeze({ name: "desktop", viewport: Object.freeze({ width: 1_440, height: 1_000 }), deviceScaleFactor: 1 }),
  Object.freeze({ name: "retina", viewport: Object.freeze({ width: 1_440, height: 1_000 }), deviceScaleFactor: 2 }),
  Object.freeze({
    name: "mobile",
    viewport: Object.freeze({ width: 390, height: 844 }),
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  }),
]);

const ENTRYPOINT_KEYWORDS = Object.freeze([
  "3d",
  "캐릭터",
  "배경",
  "소품",
  "포즈",
  "데생",
  "장면",
  "scene",
  "character",
  "background",
  "mannequin",
]);

function normalizeSingleLineText(value, maxLength = 160) {
  return String(value ?? "")
    .split(/[\r\n\t]+/u)
    .join(" ")
    .trim()
    .slice(0, maxLength);
}

export function validateAuditHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new Error(`유효하지 않은 감사 URL입니다: ${normalizeSingleLineText(rawUrl, 120)}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`감사 URL은 http/https만 허용됩니다: ${parsed.protocol}`);
  }
  return parsed.toString();
}

export function normalizeAuditRequestUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return Object.freeze({ origin: "(empty)", pathname: "(empty)", normalizedUrl: "(empty)", hasQuery: false });
  }
  try {
    const parsed = new URL(rawUrl);
    return Object.freeze({
      origin: parsed.origin,
      pathname: parsed.pathname,
      normalizedUrl: `${parsed.origin}${parsed.pathname}`,
      hasQuery: parsed.search.length > 0,
    });
  } catch {
    return Object.freeze({ origin: "(invalid-url)", pathname: "(invalid-url)", normalizedUrl: "(invalid-url)", hasQuery: false });
  }
}

export function classifyStudio3dFailedRequest(entry) {
  const errorText = normalizeSingleLineText(entry?.error ?? "unknown", 120) || "unknown";
  const method = normalizeSingleLineText(entry?.method ?? "GET", 16).toUpperCase() || "GET";
  const resourceType = normalizeSingleLineText(entry?.resourceType ?? "other", 32).toLowerCase() || "other";
  const phase = normalizeSingleLineText(entry?.phase ?? "unknown", 48) || "unknown";
  const urlInfo = normalizeAuditRequestUrl(entry?.url);

  let category = "other-request-failure";
  let actionable = true;
  let reasonKo = "기타 요청 실패";

  if (errorText === "net::ERR_ABORTED") {
    category = "aborted-navigation-or-prefetch";
    actionable = false;
    reasonKo =
      phase === "navigation-to-character" || phase === "surface-open"
        ? "라우트 전환 중 진행 중이던 청크·에셋 요청 취소(ERR_ABORTED)"
        : "프리페치·지연 로딩 취소(ERR_ABORTED)";
  } else if (
    errorText.includes("ERR_BLOCKED_BY_CLIENT")
    || errorText.includes("ERR_BLOCKED_BY_ORB")
    || errorText.includes("ERR_BLOCKED_BY_RESPONSE")
    || errorText.includes("ERR_BLOCKED_BY_CSP")
  ) {
    category = "blocked-by-policy";
    actionable = true;
    reasonKo = "브라우저 정책(CSP·CORS·ORB) 차단";
  } else if (
    errorText.includes("ERR_NAME_NOT_RESOLVED")
    || errorText.includes("ERR_CONNECTION_")
    || errorText.includes("ERR_TIMED_OUT")
    || errorText.includes("ERR_INTERNET_DISCONNECTED")
    || errorText.includes("ERR_SSL_")
    || errorText.includes("ERR_CERT_")
    || errorText.includes("ERR_FAILED")
  ) {
    category = "network-or-dns-error";
    actionable = true;
    reasonKo = "네트워크·DNS·TLS 연결 오류";
  }

  return Object.freeze({
    method,
    resourceType,
    error: errorText,
    phase,
    category,
    actionable,
    reasonKo,
    origin: urlInfo.origin,
    pathname: urlInfo.pathname,
    normalizedUrl: urlInfo.normalizedUrl,
    hasQuery: urlInfo.hasQuery,
  });
}

export function groupStudio3dFailedRequests(failedRequests = [], httpErrors = []) {
  const byCategory = {};
  const byError = {};
  const groupMap = new Map();
  let abortedCount = 0;
  let actionableCount = 0;

  for (const raw of failedRequests ?? []) {
    const item = classifyStudio3dFailedRequest(raw);
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    byError[item.error] = (byError[item.error] ?? 0) + 1;
    if (item.actionable) actionableCount += 1;
    else abortedCount += 1;

    const key = `${item.category}|${item.error}|${item.resourceType}|${item.method}|${item.normalizedUrl}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.phases.add(item.phase);
    } else {
      groupMap.set(key, {
        category: item.category,
        actionable: item.actionable,
        reasonKo: item.reasonKo,
        error: item.error,
        resourceType: item.resourceType,
        method: item.method,
        normalizedUrl: item.normalizedUrl,
        pathname: item.pathname,
        count: 1,
        phases: new Set([item.phase]),
      });
    }
  }

  const normalizedHttpErrors = (httpErrors ?? []).map((entry) => {
    const urlInfo = normalizeAuditRequestUrl(entry?.url);
    return Object.freeze({
      status: Number(entry?.status ?? 0),
      normalizedUrl: urlInfo.normalizedUrl,
      pathname: urlInfo.pathname,
    });
  });

  const groups = [...groupMap.values()]
    .map((group) =>
      Object.freeze({
        category: group.category,
        actionable: group.actionable,
        reasonKo: group.reasonKo,
        error: group.error,
        resourceType: group.resourceType,
        method: group.method,
        normalizedUrl: group.normalizedUrl,
        pathname: group.pathname,
        count: group.count,
        phases: Object.freeze([...group.phases].sort()),
      }),
    )
    .sort((a, b) => Number(b.actionable) - Number(a.actionable) || b.count - a.count || a.normalizedUrl.localeCompare(b.normalizedUrl));

  return Object.freeze({
    totalCount: (failedRequests ?? []).length,
    abortedCount,
    actionableCount,
    httpErrorCount: normalizedHttpErrors.length,
    byCategory: Object.freeze(byCategory),
    byError: Object.freeze(byError),
    groups: Object.freeze(groups),
    httpErrors: Object.freeze(normalizedHttpErrors),
  });
}

export function splitStudio3dFailedRequestGroups(groupedSummary) {
  const groups = Array.isArray(groupedSummary?.groups) ? groupedSummary.groups : [];
  return Object.freeze({
    actionableGroups: Object.freeze(groups.filter((group) => Boolean(group?.actionable))),
    nonBlockingAbortedGroups: Object.freeze(groups.filter((group) => !group?.actionable)),
  });
}

export function createInFlightRequestTracker(page, { now = () => Date.now() } = {}) {
  const pending = new Set();
  const onRequest = (request) => { pending.add(request); };
  const onDone = (request) => { pending.delete(request); };
  page.on("request", onRequest);
  page.on("requestfinished", onDone);
  page.on("requestfailed", onDone);

  const summarize = (initialPending, startedAt) => {
    const remainingPending = pending.size;
    return Object.freeze({
      initialPending,
      remainingPending,
      drainedCount: Math.max(0, initialPending - remainingPending),
      elapsedMs: Math.max(0, now() - startedAt),
      quiescent: remainingPending === 0,
    });
  };

  const waitForQuiescence = async ({
    timeoutMs = DEFAULT_STUDIO_3D_PRE_NAV_SETTLE_MAX_MS,
    quietWindowMs = DEFAULT_STUDIO_3D_QUIET_WINDOW_MS,
    pollIntervalMs = 50,
  } = {}) => {
    const startedAt = now();
    const initialPending = pending.size;
    if (timeoutMs <= 0) return summarize(initialPending, startedAt);
    let quietSince = pending.size === 0 ? startedAt : null;
    const effectiveQuietWindow = Math.min(Math.max(0, quietWindowMs), timeoutMs);
    while (now() - startedAt < timeoutMs) {
      const currentNow = now();
      if (pending.size === 0) {
        if (quietSince === null) quietSince = currentNow;
        if (currentNow - quietSince >= effectiveQuietWindow) return summarize(initialPending, startedAt);
      } else {
        quietSince = null;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return summarize(initialPending, startedAt);
  };

  return Object.freeze({
    pendingCount: () => pending.size,
    waitForQuiescence,
    dispose: () => {
      page.off?.("request", onRequest);
      page.off?.("requestfinished", onDone);
      page.off?.("requestfailed", onDone);
      pending.clear();
    },
  });
}

export function parseStudio3dAuditArgs(argv = process.argv.slice(2)) {
  let url = DEFAULT_STUDIO_3D_AUDIT_URL;
  let output = DEFAULT_STUDIO_3D_AUDIT_OUTPUT;
  let settleTimeoutMs = DEFAULT_STUDIO_3D_SURFACE_SETTLE_MS;
  let dryRun = false;
  let targetNames = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--url" && argv[i + 1]) {
      url = argv[++i];
    } else if (arg === "--output" && argv[i + 1]) {
      output = argv[++i];
    } else if (arg === "--settle-ms" && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 60_000) {
        throw new Error("--settle-ms 값은 0~60000 사이 숫자여야 합니다.");
      }
      settleTimeoutMs = Math.floor(parsed);
    } else if (arg === "--targets" && argv[i + 1]) {
      targetNames = argv[++i]
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      return Object.freeze({ help: true, dryRun: true, url, outputDir: path.resolve(output), settleTimeoutMs, targets: DEFAULT_STUDIO_3D_AUDIT_TARGETS });
    } else {
      throw new Error(`알 수 없는 인자입니다: ${normalizeSingleLineText(arg, 64)}`);
    }
  }

  const validatedUrl = validateAuditHttpUrl(url);
  const selectedTargets = targetNames
    ? DEFAULT_STUDIO_3D_AUDIT_TARGETS.filter((item) => targetNames.includes(item.name))
    : DEFAULT_STUDIO_3D_AUDIT_TARGETS;
  if (selectedTargets.length === 0) {
    throw new Error(`유효한 --targets 대상이 없습니다 (허용: desktop, retina, mobile).`);
  }

  return Object.freeze({
    help: false,
    dryRun,
    url: validatedUrl,
    outputDir: path.resolve(output),
    settleTimeoutMs,
    targets: Object.freeze(selectedTargets),
  });
}

function matchesEntrypointKeyword(text) {
  const lower = String(text ?? "").toLowerCase();
  return ENTRYPOINT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

async function inspectPage(page, target) {
  return page.evaluate(({ deviceScaleFactor, keywords }) => {
    const matchesKeyword = (value) => {
      const lower = String(value ?? "").toLowerCase();
      return keywords.some((keyword) => lower.includes(keyword));
    };
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && style.visibility !== "hidden"
        && style.display !== "none"
        && Number(style.opacity || "1") > 0;
    };

    const canvases = [...document.querySelectorAll("canvas")].map((canvas, index) => {
      const rect = canvas.getBoundingClientRect();
      return {
        index,
        visible: isVisible(canvas),
        cssWidth: rect.width,
        cssHeight: rect.height,
        bitmapWidth: canvas.width,
        bitmapHeight: canvas.height,
        deviceScaleFactor,
      };
    });
    const images = [...document.images].map((image, index) => {
      const rect = image.getBoundingClientRect();
      return {
        index,
        visible: isVisible(image),
        src: image.currentSrc || image.src,
        alt: image.alt,
        displayedWidth: rect.width,
        displayedHeight: rect.height,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        complete: image.complete,
        deviceScaleFactor,
      };
    });
    const interactive = [...document.querySelectorAll(
      'button, a, [role="button"], [role="tab"], [role="menuitem"]',
    )]
      .filter(isVisible)
      .map((element, index) => ({
        index,
        text: (
          element.textContent
          || element.getAttribute("aria-label")
          || element.getAttribute("title")
          || ""
        ).trim().replace(/\s+/gu, " ").slice(0, 160),
        href: element.getAttribute("href"),
      }))
      .filter((entry) => entry.text);

    let webgl = { available: false };
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") || probe.getContext("webgl");
      if (gl) {
        const debug = gl.getExtension("WEBGL_debug_renderer_info");
        webgl = {
          available: true,
          version: gl.getParameter(gl.VERSION),
          renderer: debug
            ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        };
      }
    } catch (error) {
      webgl = { available: false, error: String(error) };
    }

    return {
      title: document.title,
      location: location.href,
      bodyTextLength: document.body?.innerText.length ?? 0,
      canvases,
      images,
      webgl,
      threeDEntrypoints: interactive.filter((entry) => matchesKeyword(entry.text)),
    };
  }, { deviceScaleFactor: target.deviceScaleFactor, keywords: ENTRYPOINT_KEYWORDS });
}

async function waitForSurfaceSettle(page, settleTimeoutMs, tracker = null) {
  if (settleTimeoutMs <= 0) return null;
  await page.waitForLoadState("load", { timeout: Math.min(5_000, settleTimeoutMs) }).catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: settleTimeoutMs }).catch(() => undefined);
  if (!tracker) return null;
  return tracker.waitForQuiescence({
    timeoutMs: Math.min(settleTimeoutMs, DEFAULT_STUDIO_3D_PRE_NAV_SETTLE_MAX_MS),
    quietWindowMs: DEFAULT_STUDIO_3D_QUIET_WINDOW_MS,
  });
}

function attachPageAuditListeners(page, { consoleErrors, pageErrors, failedRequests, httpErrors }, getPhase) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error?.stack || error)));
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      error: request.failure()?.errorText ?? "unknown",
      phase: getPhase(),
    });
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().toLowerCase().includes("favicon")) {
      httpErrors.push({ url: response.url(), status: response.status() });
    }
  });
}

async function openFirstUseful3dSurface(page, baseUrl, settleTimeoutMs, setPhase, tracker) {
  const candidates = page.locator('button, a, [role="button"], [role="tab"], [role="menuitem"]');
  const count = Math.min(await candidates.count(), 300);
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const text = normalizeSingleLineText(
      (await candidate.textContent().catch(() => ""))
      || (await candidate.getAttribute("aria-label").catch(() => ""))
      || "",
    );
    if (!matchesEntrypointKeyword(text)) continue;
    try {
      setPhase("surface-open");
      await candidate.click({ timeout: 3_000 });
      await page.waitForTimeout(1_500);
      const hasVisibleCanvas = await page.locator("canvas:visible").count().catch(() => 0);
      if (hasVisibleCanvas > 0 || page.url() !== baseUrl) {
        setPhase("surface-settle");
        await waitForSurfaceSettle(page, settleTimeoutMs, tracker);
        return { text, location: page.url() };
      }
    } catch {
      // Continue with the next visible 3D-labelled control.
    }
  }
  return null;
}

async function auditCharacterWebglCanvas(page, target, baseUrl, settleTimeoutMs, setPhase, tracker) {
  let characterUrl;
  try {
    const parsed = new URL(baseUrl);
    parsed.pathname = "/studio/character";
    parsed.search = "";
    parsed.hash = "";
    characterUrl = parsed.toString();
  } catch {
    return null;
  }
  try {
    setPhase("navigation-to-character");
    await page.goto(characterUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    setPhase("character-webgl");
    await page.locator('[data-character-shaper="true"] [data-character-shaper-viewport] canvas')
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => undefined);
    await waitForSurfaceSettle(page, Math.min(settleTimeoutMs, DEFAULT_STUDIO_3D_PRE_NAV_SETTLE_MAX_MS), tracker);
    await page.waitForTimeout(1_000);
    const inspected = await inspectPage(page, target);
    const classifiedCanvases = (inspected.canvases ?? []).map(classifyStudio3dCanvas);
    return {
      url: characterUrl,
      canvases: classifiedCanvases,
      relevantCanvases: classifiedCanvases.filter((canvas) => canvas.relevant).length,
      blurryCanvases: classifiedCanvases.filter((canvas) => canvas.relevant && canvas.potentiallyBlurry).length,
    };
  } catch (error) {
    return {
      url: characterUrl,
      canvases: [],
      relevantCanvases: 0,
      blurryCanvases: 0,
      error: String(error),
    };
  }
}

export function buildStudio3dAuditMarkdown(report) {
  const { summary, failures, targets, url, generatedAt } = report;
  const maxGroupsPerTarget = 20;
  const overallFailed = report.failedRequestBreakdown ?? groupStudio3dFailedRequests(
    (targets ?? []).flatMap((item) => item.failedRequests ?? []),
    (targets ?? []).flatMap((item) => item.httpErrors ?? []),
  );
  const formatGroupLine = (group) =>
    `- [${group.actionable ? "ACTIONABLE" : "NON-BLOCKING"}][${group.category}] ${group.count}× ${group.method} ${group.pathname} (${group.resourceType}, ${group.error}, phase=${group.phases.join(",")})`;
  return [
    "# ToonStudio 3D production visual audit",
    "",
    `- Generated: ${generatedAt}`,
    `- URL: ${url}`,
    `- Blocking findings: ${failures.length}`,
    `- Navigation failures: ${summary.navigationFailures}`,
    `- Uncaught page errors: ${summary.pageErrors}`,
    `- Broken visible images: ${summary.brokenImages}`,
    `- Potentially upscaled visible images: ${summary.upscaledImages}`,
    `- Undersized visible canvas bitmaps: ${summary.blurryCanvases}`,
    `- Actionable failed requests: ${overallFailed.actionableCount} (HTTP 4xx/5xx: ${overallFailed.httpErrorCount})`,
    `- Non-blocking aborted requests (ERR_ABORTED): ${overallFailed.abortedCount}`,
    `- Targets with WebGL: ${summary.webglTargets}/${targets.length}`,
    `- Maximum visible 3D entrypoints: ${summary.threeDEntrypoints}`,
    "",
    ...(failures.length > 0 ? ["## Blocking findings", "", ...failures.map((item) => `- ${item}`), ""] : []),
    ...targets.flatMap((target) => {
      const grouped = target.failedRequestSummary ?? groupStudio3dFailedRequests(target.failedRequests, target.httpErrors);
      const { actionableGroups, nonBlockingAbortedGroups } = splitStudio3dFailedRequestGroups(grouped);
      const lines = [
        `## ${target.name}`,
        "",
        `- Viewport: ${target.viewport.width}×${target.viewport.height}; DPR ${target.deviceScaleFactor}`,
        `- Opened surface: ${target.openedSurface?.text ?? "none"}`,
        `- Visible relevant canvases: ${target.canvases.filter((item) => item.relevant).length}`,
        `- Blurry canvases: ${target.canvases.filter((item) => item.potentiallyBlurry).length}`,
        `- Broken images: ${target.images.filter((item) => item.broken).length}`,
        `- Upscaled images: ${target.images.filter((item) => item.potentiallyUpscaled).length}`,
        `- Console errors: ${target.consoleErrors.length}`,
        `- Failed requests: ${target.failedRequests.length}`,
        `- Failed request breakdown: aborted(ERR_ABORTED)=${grouped.abortedCount}, actionable(network/policy)=${grouped.actionableCount}, httpErrors(4xx/5xx)=${grouped.httpErrorCount}`,
      ];
      if (target.preNavigationSettle) {
        const settle = target.preNavigationSettle;
        lines.push(`- Pre-navigation settle: quiescent=${settle.quiescent}, drained=${settle.drainedCount}, remaining=${settle.remainingPending}, elapsed=${settle.elapsedMs}ms`);
      }
      if (actionableGroups.length > 0) {
        lines.push("", "### Actionable request failures", "", ...actionableGroups.slice(0, maxGroupsPerTarget).map(formatGroupLine));
        if (actionableGroups.length > maxGroupsPerTarget) {
          lines.push(`- ...외 ${actionableGroups.length - maxGroupsPerTarget}개 그룹 (report.json 전체 목록 참조)`);
        }
      }
      if (nonBlockingAbortedGroups.length > 0) {
        lines.push("", "### Non-blocking aborted requests (ERR_ABORTED)", "", ...nonBlockingAbortedGroups.slice(0, maxGroupsPerTarget).map(formatGroupLine));
        if (nonBlockingAbortedGroups.length > maxGroupsPerTarget) {
          lines.push(`- ...외 ${nonBlockingAbortedGroups.length - maxGroupsPerTarget}개 그룹 (report.json 전체 목록 참조)`);
        }
      }
      if (grouped.httpErrors.length > 0) {
        lines.push("", "### HTTP 4xx/5xx errors", "", ...grouped.httpErrors.slice(0, maxGroupsPerTarget).map((httpErr) => `- [HTTP ${httpErr.status}] ${httpErr.pathname}`));
      }
      lines.push("");
      return lines;
    }),
  ].join("\n");
}

export async function runStudio3dProductionAudit(options) {
  if (options.dryRun) {
    const plan = Object.freeze({
      schemaVersion: 2,
      mode: "dry-run",
      generatedAt: new Date().toISOString(),
      url: options.url,
      outputDir: options.outputDir,
      settleTimeoutMs: options.settleTimeoutMs,
      targets: options.targets.map((target) => ({
        name: target.name,
        viewport: target.viewport,
        deviceScaleFactor: target.deviceScaleFactor,
      })),
    });
    return { dryRun: true, plan, report: null, markdown: `${JSON.stringify(plan, null, 2)}\n`, exitCode: 0 };
  }

  await mkdir(options.outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const targetReports = [];

  try {
    for (const target of options.targets) {
      const context = await browser.newContext({
        viewport: target.viewport,
        deviceScaleFactor: target.deviceScaleFactor,
        isMobile: target.isMobile ?? false,
        hasTouch: target.hasTouch ?? false,
        locale: "ko-KR",
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const buckets = { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [] };
      let currentPhase = "studio-root";
      const setPhase = (nextPhase) => {
        currentPhase = nextPhase;
      };
      const surfaceTracker = createInFlightRequestTracker(page);
      attachPageAuditListeners(page, buckets, () => currentPhase);

      let navigationError = null;
      try {
        await page.goto(options.url, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await waitForSurfaceSettle(page, Math.min(options.settleTimeoutMs, DEFAULT_STUDIO_3D_PRE_NAV_SETTLE_MAX_MS), surfaceTracker);
        await page.waitForTimeout(2_000);
      } catch (error) {
        navigationError = String(error?.stack || error);
      }

      await page.screenshot({
        path: path.join(options.outputDir, `${target.name}-studio.png`),
        fullPage: true,
      }).catch(() => undefined);

      let rootAudit = null;
      let openedSurface = null;
      let surfaceAudit = null;
      let preNavigationSettle = null;
      let characterCanvasAudit = null;
      if (!navigationError) {
        rootAudit = await inspectPage(page, target);
        openedSurface = await openFirstUseful3dSurface(page, options.url, options.settleTimeoutMs, setPhase, surfaceTracker);
        if (openedSurface) {
          await page.screenshot({
            path: path.join(options.outputDir, `${target.name}-3d-surface.png`),
            fullPage: false,
          }).catch(() => undefined);
          surfaceAudit = await inspectPage(page, target);
        }
        setPhase("pre-navigation-settle");
        preNavigationSettle = await surfaceTracker.waitForQuiescence({
          timeoutMs: Math.min(options.settleTimeoutMs, DEFAULT_STUDIO_3D_PRE_NAV_SETTLE_MAX_MS),
          quietWindowMs: DEFAULT_STUDIO_3D_QUIET_WINDOW_MS,
        });
        const characterPage = await context.newPage();
        const characterTracker = createInFlightRequestTracker(characterPage);
        attachPageAuditListeners(characterPage, buckets, () => currentPhase);
        try {
          characterCanvasAudit = await auditCharacterWebglCanvas(
            characterPage,
            target,
            options.url,
            options.settleTimeoutMs,
            setPhase,
            characterTracker,
          );
          if (characterCanvasAudit?.relevantCanvases > 0) {
            await characterPage.screenshot({
              path: path.join(options.outputDir, `${target.name}-character-webgl.png`),
              fullPage: false,
            }).catch(() => undefined);
          }
          await characterTracker.waitForQuiescence({
            timeoutMs: Math.min(options.settleTimeoutMs, 3_000),
            quietWindowMs: DEFAULT_STUDIO_3D_QUIET_WINDOW_MS,
          });
        } finally {
          characterTracker.dispose();
          await characterPage.close().catch(() => undefined);
        }
        if (surfaceTracker.pendingCount() > 0) {
          await surfaceTracker.waitForQuiescence({
            timeoutMs: Math.min(options.settleTimeoutMs, 3_000),
            quietWindowMs: DEFAULT_STUDIO_3D_QUIET_WINDOW_MS,
          });
        }
      }
      surfaceTracker.dispose();

      const audit = surfaceAudit ?? rootAudit ?? {
        canvases: [],
        images: [],
        webgl: { available: false },
        threeDEntrypoints: [],
      };
      const mergedCanvases = [
        ...(audit.canvases ?? []).map(classifyStudio3dCanvas),
        ...(characterCanvasAudit?.canvases ?? []),
      ];
      const failedRequestSummary = groupStudio3dFailedRequests(buckets.failedRequests, buckets.httpErrors);

      targetReports.push({
        ...target,
        navigationError,
        openedSurface,
        preNavigationSettle,
        characterCanvasAudit: characterCanvasAudit
          ? {
              url: characterCanvasAudit.url,
              relevantCanvases: characterCanvasAudit.relevantCanvases,
              blurryCanvases: characterCanvasAudit.blurryCanvases,
              error: characterCanvasAudit.error ?? null,
            }
          : null,
        title: audit.title,
        location: audit.location,
        bodyTextLength: audit.bodyTextLength,
        webgl: audit.webgl,
        threeDEntrypoints: rootAudit?.threeDEntrypoints ?? [],
        canvases: mergedCanvases,
        images: (audit.images ?? []).map(classifyStudio3dImage),
        consoleErrors: buckets.consoleErrors,
        pageErrors: buckets.pageErrors,
        failedRequests: buckets.failedRequests,
        failedRequestSummary,
        httpErrors: buckets.httpErrors,
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const summary = summarizeStudio3dProductionAudit(targetReports);
  const failures = studio3dProductionAuditFailures(summary);
  const failedRequestBreakdown = groupStudio3dFailedRequests(
    targetReports.flatMap((item) => item.failedRequests),
    targetReports.flatMap((item) => item.httpErrors),
  );
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    url: options.url,
    summary,
    failedRequestBreakdown,
    failures,
    targets: targetReports,
  };
  const markdown = buildStudio3dAuditMarkdown(report);
  await writeFile(path.join(options.outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(options.outputDir, "report.md"), `${markdown}\n`);

  return { dryRun: false, plan: null, report, markdown, exitCode: failures.length > 0 ? 1 : 0 };
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const options = parseStudio3dAuditArgs(process.argv.slice(2));
    if (options.help) {
      console.log(
        "사용법: node scripts/audit-studio-3d-production.mjs [--url <http(s)://...>] [--output <dir>] [--targets desktop,retina,mobile] [--settle-ms <ms>] [--dry-run]",
      );
    } else {
      const outcome = await runStudio3dProductionAudit(options);
      if (outcome.exitCode !== 0) {
        console.error(outcome.markdown);
        process.exitCode = outcome.exitCode;
      } else {
        console.log(outcome.markdown);
      }
    }
  } catch (error) {
    console.error(`3D 운영 감사 실행 실패: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
