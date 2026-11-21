import type { Page, Worker } from "playwright";

type WorkerErrorPage = Pick<Page, "on" | "workers" | "exposeFunction" | "addInitScript">;
type ReportWorkerError = (text: string, stack: string | null) => void;

/** 브라우저에 그대로 설치하며 tsx의 직렬화 헬퍼나 애플리케이션 전역에 의존하지 않는다. */
export const STUDIO_WORKER_ERROR_OBSERVER_SCRIPT = `(() => {
  const report = (text, stack) => {
    const callback = globalThis.__studioSweepWorkerFailure;
    if (typeof callback !== "function") throw new Error("Worker 오류 전달 채널이 없습니다.");
    callback(text, stack);
  };
  const registrationFailure = (error) => report(
    "Worker 오류 관측 등록 실패: " + String(error?.message ?? error),
    typeof error?.stack === "string" ? error.stack : null
  );
  try {
    const NativeWorker = globalThis.Worker;
    if (typeof NativeWorker !== "function") throw new Error("Worker 생성자가 없습니다.");
    const ObservedWorker = new Proxy(NativeWorker, {
      construct(target, args, newTarget) {
        const worker = Reflect.construct(target, args, newTarget);
        try {
          worker.addEventListener("error", (event) => {
            const location = typeof event.filename === "string" && event.filename
              ? " @ " + event.filename + ":" + event.lineno + ":" + event.colno : "";
            report("Worker error: " + (event.message || "오류 이벤트") + location,
              typeof event.error?.stack === "string" ? event.error.stack : null);
          });
          worker.addEventListener("messageerror", () => {
            report("Worker messageerror: 수신 메시지를 역직렬화하지 못했습니다.", null);
          });
        } catch (error) { registrationFailure(error); }
        return worker;
      }
    });
    if (!Reflect.set(globalThis, "Worker", ObservedWorker) || globalThis.Worker !== ObservedWorker) {
      throw new Error("Worker 생성자에 관측기를 등록할 수 없습니다.");
    }
  } catch (error) { registrationFailure(error); }
})()`;

/**
 * 페이지의 dedicated Worker console.error와 부모에 전달된 error/messageerror만 관측한다.
 * 내부 unhandledrejection·SharedWorker·ServiceWorker 전체의 관측을 보장하지 않는다.
 */
export async function installStudioWorkerErrorObserver(
  page: WorkerErrorPage,
  report: ReportWorkerError,
): Promise<void> {
  await page.exposeFunction("__studioSweepWorkerFailure", report);
  const observed = new WeakSet<Worker>();
  const observe = (worker: Worker): void => {
    if (observed.has(worker)) return;
    observed.add(worker);
    try {
      worker.on("console", (message) => {
        if (message.type() !== "error") return;
        const location = message.location();
        report(`Worker console.error: ${message.text()} @ ${location.url || worker.url()}:${location.lineNumber}`, null);
      });
    } catch (error) {
      report(`Worker 콘솔 관측 등록 실패: ${String(error instanceof Error ? error.message : error)}`,
        error instanceof Error ? error.stack ?? null : null);
    }
  };
  page.on("worker", observe);
  for (const worker of page.workers()) observe(worker);
  await page.addInitScript(STUDIO_WORKER_ERROR_OBSERVER_SCRIPT);
}
