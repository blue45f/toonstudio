import { downloadIntegrationJson, downloadIntegrationText } from "./integration-platform-storage";
import type { integrationPlatformClient } from "./integration-platform-client";
import type { PublishPackageResponse } from "./integration-platform-types";

export type PublishFeedResult = Awaited<ReturnType<typeof integrationPlatformClient.buildFeedPreview>>;

export function downloadPreparedPublication(result: PublishPackageResponse) {
  downloadIntegrationJson(`publish-${result.projectId}.json`, result);
}

export function downloadPreparedRss(result: PublishFeedResult) {
  downloadIntegrationText("feed.xml", result.rss, "application/rss+xml;charset=utf-8");
}
