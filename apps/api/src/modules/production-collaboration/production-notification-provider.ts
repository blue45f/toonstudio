import { Logger } from "@nestjs/common";
import { sendProtectedWebhook } from "./production-webhook-network";
import webPush from "web-push";
import {
  classifyWebPushEndpoint,
  createPublicOnlyHttpsAgent,
  WEB_PUSH_REQUEST_TIMEOUT_MS,
} from "./production-web-push-network";
import { settleWithConcurrency } from "./production-web-push-policy";

import {
  canonicalJson,
  sha256Digest,
} from "./production-integration-artifacts";
import type {
  ProductionIntegrationConfig,
} from "./production-integration-config";
import {
  externalFetchJson,
  webhookSignature,
} from "./production-integration-http";
import type {
  ProductionPushSubscriptionRecord,
} from "./production-integration.repository";
import type {
  ProductionIntegrationNotification,
} from "./production-integration.dto";

export interface ProductionNotificationProviderResult {
  readonly sent: number;
  readonly removedEndpointHashes: readonly string[];
  readonly providerResponse: Record<string, unknown>;
}

async function sendGenericWebhook(
  config: ProductionIntegrationConfig,
  body: Record<string, unknown>,
  deliveryId: string,
  post: typeof sendProtectedWebhook,
): Promise<ProductionNotificationProviderResult> {
  const url = config.notification.genericWebhookUrl;
  const secret = config.notification.genericWebhookSecret;
  if (!url || !secret) throw new Error("generic_webhook_not_configured");
  const serialized = canonicalJson(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await post(url, {
    "Content-Type": "application/json",
    "X-ToonStudio-Signature": webhookSignature(secret, serialized),
    "X-ToonStudio-Delivery-Id": deliveryId,
    "X-ToonStudio-Delivery-Timestamp": timestamp,
    "X-ToonStudio-Delivery-Signature": webhookSignature(secret, `${timestamp}\n${deliveryId}\n${serialized}`),
  }, serialized, config.timeoutMs);
  return { sent: 1, removedEndpointHashes: [], providerResponse: response ?? {} };
}
async function sendDiscord(
  config: ProductionIntegrationConfig,
  notification: ProductionIntegrationNotification,
): Promise<ProductionNotificationProviderResult> {
  const url = config.notification.discordWebhookUrl;
  if (!url) throw new Error("discord_webhook_not_configured");
  const response = await externalFetchJson<Record<string, unknown>>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `**${notification.title}**\n${notification.body}`.slice(0, 2_000),
        allowed_mentions: { parse: [] },
        embeds: notification.url
          ? [{ title: "ToonStudio에서 열기", url: notification.url }]
          : [],
      }),
    },
    config.timeoutMs,
  );
  return { sent: 1, removedEndpointHashes: [], providerResponse: response ?? {} };
}

async function sendNtfy(
  config: ProductionIntegrationConfig,
  notification: ProductionIntegrationNotification,
): Promise<ProductionNotificationProviderResult> {
  const baseUrl = config.notification.ntfyBaseUrl;
  const topic = config.notification.ntfyTopic;
  if (!baseUrl || !topic) throw new Error("ntfy_not_configured");
  const headers: Record<string, string> = {
    Title: notification.title,
    Priority: "default",
    Tags: "art,calendar",
  };
  if (notification.url) headers.Click = notification.url;
  if (config.notification.ntfyToken) {
    headers.Authorization = `Bearer ${config.notification.ntfyToken}`;
  }
  const response = await externalFetchJson<Record<string, unknown>>(
    `${baseUrl}/${encodeURIComponent(topic)}`,
    { method: "POST", headers, body: notification.body },
    config.timeoutMs,
  );
  return { sent: 1, removedEndpointHashes: [], providerResponse: response ?? {} };
}
class WebPushEndpointRejectedError extends Error {
  constructor() {
    super("web_push_endpoint_rejected");
    this.name = "WebPushEndpointRejectedError";
  }
}

// 공개 도메인이지만 허용 목록 밖인 호스트. 정책 변경만으로 사용자의 구독을 지우지 않도록 건너뛰기만 한다.
class WebPushHostNotAllowedError extends Error {
  constructor() {
    super("web_push_host_not_allowed");
    this.name = "WebPushHostNotAllowedError";
  }
}

const logger = new Logger("ProductionNotification");

async function sendWebPush(
  config: ProductionIntegrationConfig,
  notification: ProductionIntegrationNotification,
  subscriptions: readonly ProductionPushSubscriptionRecord[],
  truncation: { readonly projectId: string; readonly omitted: number },
): Promise<ProductionNotificationProviderResult> {
  const subject = config.notification.vapidSubject;
  const publicKey = config.notification.vapidPublicKey;
  const privateKey = config.notification.vapidPrivateKey;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("web_push_not_configured");
  }
  const { omitted } = truncation;
  if (omitted > 0) {
    // 저장된 구독이 전송 상한보다 많으면 최근 갱신순 상위만 보내고 나머지는 알림도 오류도 없이 빠진다. 개수만 남긴다.
    logger.warn(
      `프로젝트 ${truncation.projectId} 의 웹 푸시 구독이 전송 상한(${config.notification.webPush.maxSubscriptionsPerProject}건)보다 많아 `
      + `최근 갱신순 ${subscriptions.length}건에만 보내고 ${omitted}건은 제외했습니다. 제외된 기기는 알림도 오류도 받지 않습니다. `
      + "상한은 PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT 로 올릴 수 있습니다(최대 1000).",
    );
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: notification.url ?? "/production",
    tag: "toonstudio-production",
  });
  // 구독 endpoint 는 사용자가 등록한 값이다. 등록 시 검증을 통과하지 못한 과거 데이터는 요청 없이
  // 정리 대상으로 돌려주고, 허용 목록 밖 호스트는 요청 없이 건너뛰며, 나머지는 공개 주소로만 접속하는
  // 전용 에이전트로 동시성 상한 안에서 전송한다.
  const { allowedHosts, fanOutConcurrency } = config.notification.webPush;
  const agent = createPublicOnlyHttpsAgent();
  const results = await settleWithConcurrency(
    subscriptions,
    fanOutConcurrency,
    async (subscription) => {
      const verdict = classifyWebPushEndpoint(subscription.endpoint, allowedHosts);
      if (verdict.kind === "rejected") throw new WebPushEndpointRejectedError();
      if (verdict.kind === "host-not-allowed") throw new WebPushHostNotAllowedError();
      await webPush.sendNotification(
        {
          endpoint: verdict.url.href,
          expirationTime: subscription.expirationTime,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
        {
          TTL: 24 * 60 * 60,
          urgency: "normal",
          agent,
          timeout: WEB_PUSH_REQUEST_TIMEOUT_MS,
        },
      );
      return subscription.endpointHash;
    },
  );
  agent.destroy();
  const removedEndpointHashes: string[] = [];
  let sent = 0;
  let skippedHostNotAllowed = 0;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const subscription = subscriptions[index];
    if (!result || !subscription) continue;
    if (
      result.status === "rejected"
      && result.reason instanceof WebPushEndpointRejectedError
    ) {
      removedEndpointHashes.push(subscription.endpointHash);
      continue;
    }
    if (
      result.status === "rejected"
      && result.reason instanceof WebPushHostNotAllowedError
    ) {
      skippedHostNotAllowed += 1;
      continue;
    }
    if (result.status === "fulfilled") {
      sent += 1;
      continue;
    }
    const statusCode = typeof result.reason === "object"
      && result.reason !== null
      && "statusCode" in result.reason
      ? Number(result.reason.statusCode)
      : null;
    if (statusCode === 404 || statusCode === 410) {
      removedEndpointHashes.push(subscription.endpointHash);
    }
  }
  return {
    sent,
    removedEndpointHashes,
    providerResponse: {
      attempted: subscriptions.length,
      sent,
      expired: removedEndpointHashes.length,
      skippedHostNotAllowed,
      truncated: omitted > 0,
      omitted,
    },
  };
}
export async function sendProductionNotification(input: {
  readonly config: ProductionIntegrationConfig;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly notification: ProductionIntegrationNotification;
  readonly subscriptions: readonly ProductionPushSubscriptionRecord[];
  /** 전송 상한 때문에 subscriptions 에서 빠진 구독 수(웹 푸시 전송 결과의 truncated 표시에 쓴다). */
  readonly omittedSubscriptions?: number;
}, dependencies: { readonly webhookPost: typeof sendProtectedWebhook } = { webhookPost: sendProtectedWebhook }): Promise<ProductionNotificationProviderResult> {
  const body = {
    version: 1,
    type: "production.notification",
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    title: input.notification.title,
    body: input.notification.body,
    url: input.notification.url ?? null,
    emittedAt: new Date().toISOString(),
  };
  switch (input.notification.channel) {
    case "generic-webhook":
      return sendGenericWebhook(input.config, body, sha256Digest(canonicalJson([input.projectId, input.notification.mutationId])), dependencies.webhookPost);
    case "discord":
      return sendDiscord(input.config, input.notification);
    case "ntfy":
      return sendNtfy(input.config, input.notification);
    case "web-push":
      return sendWebPush(
        input.config,
        input.notification,
        input.subscriptions,
        { projectId: input.projectId, omitted: Math.max(0, input.omittedSubscriptions ?? 0) },
      );
  }
}
