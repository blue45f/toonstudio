import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scanGitHubSecretScanningContent } from "./secretlint-files.mjs";

describe("scanGitHubSecretScanningContent", () => {
  it("publisher/ovsx 문맥의 36자 UUID 리터럴(OpenVSX 오탐 패턴)을 감지하고 세그먼트 조립은 통과시킨다", () => {
    const assembledUuid = ["123e4567", "e89b", "42d3", "a456", "426614174000"].join("-");
    const violatingSource = [
      "const RESOURCE_ID = \"123e4567-e89b-42d3-a456-426614174001\";",
      `const ${["PUBLISHER", "ID"].join("_")} = "${assembledUuid}";`,
    ].join("\n");

    const findings = scanGitHubSecretScanningContent(violatingSource);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.line, 2);
    assert.equal(findings[0]?.ruleId, "github-secret-scanning/openvsx-access-token");
    assert.equal(findings[0]?.message.includes(assembledUuid), false);

    const safeSource = [
      "const UUID_PREFIX = [\"123e4567\", \"e89b\", \"42d3\", \"a456\", \"4266141740\"].join(\"-\");",
      "const PUBLISHER_ID = `${UUID_PREFIX}00`;",
    ].join("\n");
    assert.deepEqual(scanGitHubSecretScanningContent(safeSource), []);
  });

  it("Cloudflare Account API Token(cfat_*) 및 Stripe API Key(sk_live_*) 패턴을 원문 노출 없이 감지한다", () => {
    const fakeCloudflareToken = ["cfat", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4"].join("_");
    const fakeStripeKey = ["sk", "live", "0123456789abcdefghijklmnop"].join("_");
    const source = [
      `CLOUDFLARE_API_TOKEN=${fakeCloudflareToken}`,
      `STRIPE_SECRET_KEY=${fakeStripeKey}`,
    ].join("\n");

    const findings = scanGitHubSecretScanningContent(source);
    assert.equal(findings.length, 2);
    assert.equal(findings[0]?.ruleId, "github-secret-scanning/cloudflare-account-api-token");
    assert.equal(findings[0]?.message.includes(fakeCloudflareToken), false);
    assert.equal(findings[1]?.ruleId, "github-secret-scanning/stripe-api-key");
    assert.equal(findings[1]?.message.includes(fakeStripeKey), false);
  });

  it("secretlint-disable-line 및 secretlint-disable-next-line 주석이 있는 줄은 예외를 존중한다", () => {
    const fakeStripeKey = ["sk", "test", "0123456789abcdefghijklmnop"].join("_");
    const source = [
      "// secretlint-disable-next-line",
      `const fixtureA = "${fakeStripeKey}";`,
      `const fixtureB = "${fakeStripeKey}"; // secretlint-disable-line`,
    ].join("\n");

    assert.deepEqual(scanGitHubSecretScanningContent(source), []);
  });
});
