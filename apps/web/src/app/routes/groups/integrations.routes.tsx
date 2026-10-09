import { createElement, type ComponentType } from "react";

import { defineAppRoutes, type AppRouteDefinition } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

type LazyPageModule = Record<string, ComponentType>;

function lazyPage(load: () => Promise<unknown>, name: string) {
  return lazyRetry(
    () => load().then((module) => ({
      default: (module as LazyPageModule)[name]!,
    })),
    name,
  );
}

function route(id: string, path: string, Page: ComponentType): AppRouteDefinition {
  return { id, path, element: createElement(Page) };
}

const IntegrationCenterPage = lazyPage(
  () => import("@/domains/integrations/IntegrationCenterPage"),
  "IntegrationCenterPage",
);
const AutomationHubPage = lazyPage(
  () => import("@/domains/integrations/AutomationHubPage"),
  "AutomationHubPage",
);
const PublishCenterPage = lazyPage(
  () => import("@/domains/integrations/PublishCenterPage"),
  "PublishCenterPage",
);
const DeveloperPlatformPage = lazyPage(
  () => import("@/domains/integrations/DeveloperPlatformPage"),
  "DeveloperPlatformPage",
);
const ApiKeyHubPage = lazyPage(
  () => import("@/domains/integrations/api-key-hub/ApiKeyHubPage"),
  "ApiKeyHubPage",
);

export const integrationRoutes = defineAppRoutes([
  route("integration-center", "/settings/integrations", IntegrationCenterPage),
  route("integration-api-key-hub", "/settings/api-keys", ApiKeyHubPage),
  route("automation-hub", "/automation", AutomationHubPage),
  // 발행 표면 역할 구분 (O-06, 2026-10-09): /publish는 외부 채널(외부 웹툰 플랫폼·RSS/JSON 피드)
  // 배포 패키지를 만드는 발행 센터이고, 스튜디오 문서에 결박된 검수·게시 명령 센터는 /studio/publish다.
  // 본문이 다른 분화 표면이라 합치지 않고 역할만 명시해 유지한다.
  route("publish-center", "/publish", PublishCenterPage),
  route("developer-platform", "/developers", DeveloperPlatformPage),
]);
