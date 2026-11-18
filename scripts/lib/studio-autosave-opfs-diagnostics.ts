
import type { StudioAutosaveOpfsBrowserDiagnostics } from "../verify-studio-autosave-opfs-session.mts";
import type { StudioNavigationSettlementReceipt } from "./studio-preview-navigation-settlement";
import type { Page } from "playwright";

export function observeStudioAutosaveOpfsPage(
  page: Page,
  browserVersion: string,
  navigationSettlements: readonly StudioNavigationSettlementReceipt[],
): StudioAutosaveOpfsBrowserDiagnostics {
  const diagnostics: {
    navigationSettlements: readonly StudioNavigationSettlementReceipt[];
    browserVersion: string;
    contentSecurityPolicy: string;
    consoleErrors: string[];
    consoleWarnings: string[];
    pageErrors: string[];
    requestFailures: string[];
    fiveHundredResponses: string[];
    cspViolations: Array<{ effectiveDirective: string; blockedUri: string }>;
    requests: Array<{ method: string; resourceType: string; url: string }>;
    responses: Array<{ status: number; url: string }>;
  } = {
    navigationSettlements,
    browserVersion,
    contentSecurityPolicy: "",
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    requestFailures: [],
    fiveHundredResponses: [],
    cspViolations: [],
    requests: [],
    responses: [],
  };
  page.on("console", message => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
    if (message.type() === "warning") diagnostics.consoleWarnings.push(message.text());
  });
  page.on("pageerror", error => diagnostics.pageErrors.push(error.message));
  page.on("request", request => {
    diagnostics.requests.push({
      method: request.method(),
      resourceType: request.resourceType(),
      url: request.url(),
    });
  });
  page.on("requestfailed", request => {
    diagnostics.requestFailures.push(
      `${request.method()} ${request.url()}: `
      + `${request.failure()?.errorText ?? "unknown failure"}`,
    );
  });
  page.on("response", response => {
    diagnostics.responses.push({
      status: response.status(),
      url: response.url(),
    });
    if (response.status() >= 500) {
      diagnostics.fiveHundredResponses.push(
        `${response.status()} ${response.url()}`,
      );
    }
  });
  return diagnostics;
}
