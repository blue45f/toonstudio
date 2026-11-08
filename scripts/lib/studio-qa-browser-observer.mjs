/** 브라우저에 문자열로 주입한다. 외부 참조와 사용자 문자열 저장을 금지한다. */
export function observeStudioQa(kind) {
  if (window !== window.top) return;
  globalThis.__studioQaDiagnostics?.stop();
  const samples = [];
  const limit = kind === "layout" ? 200 : 64;
  let previous = "";
  let statusChanges = 0;
  let stopped = false;
  let interval;
  let lifetime;
  let observer;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    clearTimeout(lifetime);
    observer?.disconnect();
    document.removeEventListener("change", onChange, true);
    window.removeEventListener("pagehide", stop);
  };
  const append = (sample) => {
    if (stopped) return;
    const key = JSON.stringify(sample);
    if (key === previous) return;
    previous = key;
    samples.push({ at: Math.round(performance.now()), ...sample });
    if (samples.length >= limit) stop();
  };
  const recordLayout = () => {
    if (stopped) return;
    const canvas = document.querySelector('[data-character-shaper-viewport] canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const rect = canvas.getBoundingClientRect();
    const dock = document.querySelector('[data-character-shaper-dock]');
    append({ width: canvas.width, height: canvas.height, cssWidth: rect.width,
      cssHeight: rect.height, top: rect.top, dockHeight: dock?.getBoundingClientRect().height ?? null,
      statusChanges });
  };
  const onChange = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== "file" || stopped) return;
    const files = target.files;
    const summary = [];
    for (let index = 0; index < Math.min(files?.length ?? 0, 16); index++) {
      const file = files[index];
      const type = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)
        ? file.type : "other";
      summary.push({ type, size: file.size });
    }
    append({ count: files?.length ?? 0, files: summary });
  };
  globalThis.__studioQaDiagnostics = { stop, finish: () => {
    if (kind === "layout") recordLayout();
    stop();
    delete globalThis.__studioQaDiagnostics;
    return { kind, samples, capped: samples.length === limit };
  } };
  if (kind === "layout") {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (element?.closest('[data-character-shaper] [role="status"]')) {
          statusChanges = Math.min(statusChanges + 1, Number.MAX_SAFE_INTEGER);
        }
      }
    });
    observer.observe(document, { subtree: true, childList: true, characterData: true });
    interval = setInterval(recordLayout, 100);
    recordLayout();
  } else {
    document.addEventListener("change", onChange, true);
  }
  lifetime = setTimeout(stop, 120_000);
  window.addEventListener("pagehide", stop);
}
