// node_modules/vitest/index.mjs
var passed = 0;
var failed = 0;
var failures = [];
var suite = "";
function eq(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => eq(a[k], b[k]));
  }
  return false;
}
function matchObject(actual, expected) {
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false;
    return Object.keys(expected).every((k) => matchObject(actual[k], expected[k]));
  }
  return eq(actual, expected);
}
function fail(msg) {
  throw new Error(msg);
}
function describe(name, fn) {
  const prev = suite;
  suite = prev ? `${prev} > ${name}` : name;
  fn();
  suite = prev;
}
function it(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${suite} > ${name}`);
  } catch (err) {
    failed += 1;
    failures.push(`${suite} > ${name}: ${err && err.message}`);
    console.log(`FAIL ${suite} > ${name}: ${err && err.message}`);
  }
}
function expect(actual) {
  return {
    toBe(exp) {
      if (!Object.is(actual, exp)) fail(`expected ${JSON.stringify(actual)} to be ${JSON.stringify(exp)}`);
    },
    toEqual(exp) {
      if (!eq(actual, exp))
        fail(`expected ${JSON.stringify(actual)} to equal ${JSON.stringify(exp)}`);
    },
    toHaveLength(exp) {
      if (!actual || actual.length !== exp)
        fail(`expected length ${actual && actual.length} to be ${exp}`);
    },
    toMatchObject(exp) {
      if (!matchObject(actual, exp))
        fail(`expected ${JSON.stringify(actual)} to match ${JSON.stringify(exp)}`);
    },
    toBeGreaterThan(exp) {
      if (!(actual > exp)) fail(`expected ${actual} > ${exp}`);
    },
    toBeDefined() {
      if (actual === void 0) fail(`expected value to be defined`);
    },
    toContain(exp) {
      if (!actual || !actual.includes(exp))
        fail(`expected ${JSON.stringify(actual)} to contain ${JSON.stringify(exp)}`);
    },
    toBeTruthy() {
      if (!actual) fail(`expected ${JSON.stringify(actual)} to be truthy`);
    }
  };
}
setTimeout(() => {
  console.log(`
== RESULT: ${passed} passed, ${failed} failed ==`);
  if (failures.length) {
    console.log(failures.join("\n"));
    process.exitCode = 1;
  }
}, 0);

// studio-dialogue-batch.ts
function dialogueExcerpt(text, max = 24) {
  const oneLine = text.replace(/\s*\n+\s*/g, " / ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, Math.max(1, max - 1)).trimEnd()}\u2026`;
}

// studio-dialogue-spellcheck.ts
var MISSPELLINGS = [
  {
    pattern: /됬/g,
    replacement: "\uB410",
    message: "'\uB42C'\uC740 \uC5C6\uB294 \uD45C\uAE30\uC608\uC694. '\uB410'\uC73C\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /됀/g,
    replacement: "\uB41C",
    message: "'\uB400'\uC740 \uC5C6\uB294 \uD45C\uAE30\uC608\uC694. '\uB41C'\uC73C\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /되요/g,
    replacement: "\uB3FC\uC694",
    message: "'\uB418\uC694'\uB294 \uC904\uC778 \uB9D0 '\uB3FC\uC694'\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /몇일/g,
    replacement: "\uBA70\uCE60",
    message: "'\uBA87\uC77C'\uC774 \uC544\uB2C8\uB77C '\uBA70\uCE60'\uC774 \uD45C\uC900 \uD45C\uAE30\uC608\uC694.",
    severity: "warning"
  },
  {
    pattern: /오랫만/g,
    replacement: "\uC624\uB79C\uB9CC",
    message: "'\uC624\uB7AB\uB9CC'\uC774 \uC544\uB2C8\uB77C '\uC624\uB79C\uB9CC'\uC73C\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /금새/g,
    replacement: "\uAE08\uC138",
    message: "'\uAE08\uC0C8'\uB294 '\uAE08\uC138'\uC758 \uC798\uBABB \uC54C\uB824\uC9C4 \uD45C\uAE30\uC608\uC694.",
    severity: "warning"
  },
  {
    pattern: /어의없/g,
    replacement: "\uC5B4\uC774\uC5C6",
    message: "'\uC5B4\uC758\uC5C6\uB2E4'\uAC00 \uC544\uB2C8\uB77C '\uC5B4\uC774\uC5C6\uB2E4'\uC608\uC694.",
    severity: "warning"
  },
  {
    pattern: /희안/g,
    replacement: "\uD76C\uD55C",
    message: "'\uD76C\uC548\uD558\uB2E4'\uAC00 \uC544\uB2C8\uB77C '\uD76C\uD55C\uD558\uB2E4'\uC608\uC694.",
    severity: "warning"
  },
  {
    pattern: /설겆이/g,
    replacement: "\uC124\uAC70\uC9C0",
    message: "'\uC124\uAC86\uC774'\uAC00 \uC544\uB2C8\uB77C '\uC124\uAC70\uC9C0'\uC608\uC694.",
    severity: "warning"
  },
  {
    pattern: /깨끗히/g,
    replacement: "\uAE68\uB057\uC774",
    message: "'\uAE68\uB057\uD788'\uAC00 \uC544\uB2C8\uB77C '\uAE68\uB057\uC774'\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /일일히/g,
    replacement: "\uC77C\uC77C\uC774",
    message: "'\uC77C\uC77C\uD788'\uAC00 \uC544\uB2C8\uB77C '\uC77C\uC77C\uC774'\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /어떻해/g,
    replacement: "\uC5B4\uB5A1\uD574",
    message: "'\uC5B4\uB5BB\uD574'\uAC00 \uC544\uB2C8\uB77C '\uC5B4\uB5A1\uD574'\uC608\uC694.",
    severity: "warning"
  },
  {
    pattern: /께요/g,
    replacement: "\uAC8C\uC694",
    message: "\uC57D\uC18D\xB7\uC758\uC9C0\uC758 \uB9D0\uB05D\uC740 '\uD560\uAC8C\uC694'\uCC98\uB7FC '\uAC8C\uC694'\uB85C \uC368\uC694. (\uC874\uB313\uB9D0 \uC870\uC0AC '\uAED8'\uC640 \uB2E4\uB985\uB2C8\uB2E4)",
    severity: "warning"
  },
  {
    pattern: /할께/g,
    replacement: "\uD560\uAC8C",
    message: "'\uD560\uAED8'\uAC00 \uC544\uB2C8\uB77C '\uD560\uAC8C'\uB85C \uC368\uC694. \uC57D\uC18D\xB7\uC758\uC9C0\uC758 \uB9D0\uB05D\uC740 '\uAC8C'\uC608\uC694. (\uC874\uB313\uB9D0 \uC870\uC0AC '\uAED8'\uC640 \uB2E4\uB985\uB2C8\uB2E4)",
    severity: "warning"
  },
  {
    pattern: /될께/g,
    replacement: "\uB420\uAC8C",
    message: "'\uB420\uAED8'\uAC00 \uC544\uB2C8\uB77C '\uB420\uAC8C'\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /줄께/g,
    replacement: "\uC904\uAC8C",
    message: "'\uC904\uAED8'\uAC00 \uC544\uB2C8\uB77C '\uC904\uAC8C'\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /그럴께/g,
    replacement: "\uADF8\uB7F4\uAC8C",
    message: "'\uADF8\uB7F4\uAED8'\uAC00 \uC544\uB2C8\uB77C '\uADF8\uB7F4\uAC8C'\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /갈께/g,
    replacement: "\uAC08\uAC8C",
    message: "'\uAC08\uAED8'\uAC00 \uC544\uB2C8\uB77C '\uAC08\uAC8C'\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /있을께/g,
    replacement: "\uC788\uC744\uAC8C",
    message: "'\uC788\uC744\uAED8'\uAC00 \uC544\uB2C8\uB77C '\uC788\uC744\uAC8C'\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /웬지/g,
    replacement: "\uC660\uC9C0",
    message: "'\uC6EC\uC9C0'\uAC00 \uC544\uB2C8\uB77C '\uC660\uC9C0'\uC608\uC694.",
    severity: "warning"
  },
  {
    pattern: /왠만/g,
    replacement: "\uC6EC\uB9CC",
    message: "'\uC660\uB9CC\uD558\uBA74'\uC774 \uC544\uB2C8\uB77C '\uC6EC\uB9CC\uD558\uBA74'\uC774\uC5D0\uC694.",
    severity: "warning"
  },
  {
    pattern: /뭐에요/g,
    replacement: "\uBB50\uC608\uC694",
    message: "'\uBB50\uC5D0\uC694'\uAC00 \uC544\uB2C8\uB77C '\uBB50\uC608\uC694'\uC608\uC694.",
    severity: "warning"
  },
  {
    pattern: /슴니다/g,
    replacement: "\uC2B5\uB2C8\uB2E4",
    message: "'\uC788\uC2B4\uB2C8\uB2E4' \uAC19\uC740 \uD45C\uAE30\uB294 '\uC788\uC2B5\uB2C8\uB2E4'\uB85C \uC368\uC694.",
    severity: "warning"
  },
  {
    pattern: /읍니다/g,
    replacement: "\uC2B5\uB2C8\uB2E4",
    message: "'\uC74D\uB2C8\uB2E4'\uB294 \uC61B \uD45C\uAE30\uC608\uC694. \uC9C0\uAE08\uC740 '\uC2B5\uB2C8\uB2E4'\uB85C \uC368\uC694.",
    severity: "info"
  },
  {
    pattern: /바램/g,
    replacement: "\uBC14\uB78C",
    message: "\uC18C\uB9DD\uC758 \uB73B\uC774\uBA74 '\uBC14\uB7A8'\uC774 \uC544\uB2C8\uB77C '\uBC14\uB78C'\uC774 \uD45C\uC900\uC774\uC5D0\uC694.",
    severity: "info"
  }
];
var SPACING_PATTERNS = [
  {
    pattern: /것같(다|아|요|네|은|고|지)/g,
    replacement: "\uAC83 \uAC19$1",
    message: "'\uAC83 \uAC19\uB2E4'\uB294 \uC758\uC874\uBA85\uC0AC '\uAC83'\uC744 \uB744\uC5B4 \uC368\uC694."
  },
  {
    pattern: /수있(다|어|는|을|고|네)/g,
    replacement: "\uC218 \uC788$1",
    message: "'\uD560 \uC218 \uC788\uB2E4'\uCC98\uB7FC \uC758\uC874\uBA85\uC0AC '\uC218'\uB97C \uB744\uC5B4 \uC368\uC694."
  },
  {
    pattern: /수없(다|어|는|을|고|네)/g,
    replacement: "\uC218 \uC5C6$1",
    message: "'\uD560 \uC218 \uC5C6\uB2E4'\uCC98\uB7FC \uC758\uC874\uBA85\uC0AC '\uC218'\uB97C \uB744\uC5B4 \uC368\uC694."
  }
];
function normalizeForDuplicate(text) {
  return text.replace(/\s+/g, " ").trim();
}
function countNonSpaceChars(text) {
  return text.replace(/\s/g, "").length;
}
function looksLikeSoundWord(word) {
  if (word.length <= 1) return true;
  const chars = Array.from(word);
  return chars.every((ch) => ch === chars[0]);
}
function checkDialogueSpelling(items, options = {}) {
  const includeHidden = options.includeHidden ?? false;
  const maxBubbleChars = options.maxBubbleChars ?? 60;
  const maxBubbleLineChars = options.maxBubbleLineChars ?? 20;
  const maxTextChars = options.maxTextChars ?? 140;
  const disabled = new Set(options.disabledRules ?? []);
  const findings = [];
  const seenTexts = /* @__PURE__ */ new Map();
  const push = (item2, ruleId, severity, message, extra) => {
    if (disabled.has(ruleId)) return;
    findings.push({
      id: `${item2.id}:${ruleId}:${extra?.fix?.start ?? findings.length}`,
      itemId: item2.id,
      pageId: item2.pageId,
      pageIndex: item2.pageIndex,
      ruleId,
      severity,
      message,
      excerpt: dialogueExcerpt(item2.text),
      ...extra?.matchText !== void 0 ? { matchText: extra.matchText } : {},
      ...extra?.fix ? { fix: extra.fix } : {}
    });
  };
  for (const item2 of items) {
    if (item2.hidden && !includeHidden) continue;
    const text = item2.text;
    if (!text.trim()) {
      push(
        item2,
        "empty-dialogue",
        item2.elType === "bubble" ? "error" : "warning",
        item2.elType === "bubble" ? "\uB9D0\uD48D\uC120 \uB0B4\uC6A9\uC774 \uBE44\uC5B4 \uC788\uC5B4\uC694. \uC758\uB3C4\uD55C \uBE48 \uB9D0\uD48D\uC120\uC778\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694." : "\uD14D\uC2A4\uD2B8 \uB0B4\uC6A9\uC774 \uBE44\uC5B4 \uC788\uC5B4\uC694. \uBD88\uD544\uC694\uD55C \uC694\uC18C\uB77C\uBA74 \uC9C0\uC6CC \uC8FC\uC138\uC694."
      );
      continue;
    }
    for (const entry of MISSPELLINGS) {
      for (const match of text.matchAll(entry.pattern)) {
        const start = match.index ?? 0;
        push(item2, "common-misspelling", entry.severity, entry.message, {
          matchText: match[0],
          fix: {
            start,
            end: start + match[0].length,
            replacement: match[0].replace(entry.pattern, entry.replacement)
          }
        });
      }
    }
    const spacingMatches = [];
    for (const entry of SPACING_PATTERNS) {
      for (const match of text.matchAll(entry.pattern)) {
        spacingMatches.push({ start: match.index ?? 0, text: match[0], entry });
      }
    }
    spacingMatches.sort((left, right) => left.start - right.start);
    for (const found of spacingMatches) {
      push(item2, "spacing-dependent-noun", "warning", found.entry.message, {
        matchText: found.text,
        fix: {
          start: found.start,
          end: found.start + found.text.length,
          replacement: found.text.replace(found.entry.pattern, found.entry.replacement)
        }
      });
    }
    for (const match of text.matchAll(/\s+([.,!?…~])/g)) {
      const start = match.index ?? 0;
      push(item2, "space-before-punctuation", "warning", "\uBB38\uC7A5\uBD80\uD638 \uC55E\uC5D0\uB294 \uACF5\uBC31\uC744 \uB450\uC9C0 \uC54A\uC544\uC694.", {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: match[1] ?? "" }
      });
    }
    for (const match of text.matchAll(/ {2,}/g)) {
      const start = match.index ?? 0;
      push(item2, "double-space", "info", "\uACF5\uBC31\uC774 \uC5EC\uB7EC \uAC1C \uC774\uC5B4\uC84C\uC5B4\uC694. \uBD99\uC5EC\uB123\uAE30 \uD754\uC801\uC77C \uC218 \uC788\uC5B4\uC694.", {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: " " }
      });
    }
    for (const match of text.matchAll(/([.!?…])([가-힣A-Za-z0-9])/g)) {
      const start = match.index ?? 0;
      push(
        item2,
        "missing-space-after-sentence",
        "info",
        "\uBB38\uC7A5\uC774 \uB05D\uB09C \uB4A4 \uACF5\uBC31 \uC5C6\uC774 \uB2E4\uC74C \uBB38\uC7A5\uC774 \uBD99\uC5B4 \uC788\uC5B4\uC694.",
        {
          matchText: match[0],
          fix: { start, end: start + match[0].length, replacement: `${match[1]} ${match[2]}` }
        }
      );
    }
    for (const match of text.matchAll(/\n{3,}/g)) {
      const start = match.index ?? 0;
      push(item2, "excess-blank-lines", "info", "\uBE48 \uC904\uC774 \uC138 \uC904 \uC774\uC0C1 \uC774\uC5B4\uC84C\uC5B4\uC694.", {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: "\n\n" }
      });
    }
    if (text !== text.trim()) {
      push(item2, "edge-space", "info", "\uB300\uC0AC \uC55E\uB4A4\uC5D0 \uACF5\uBC31\uC774 \uC788\uC5B4\uC694.", {
        fix: { start: 0, end: text.length, replacement: text.trim() }
      });
    }
    for (const match of text.matchAll(/(\S+)[ \t]+\1(?=[\s.,!?…~]|$)/g)) {
      const word = match[1] ?? "";
      if (word.length < 2 || looksLikeSoundWord(word)) continue;
      const start = match.index ?? 0;
      push(item2, "repeated-word", "warning", `\uAC19\uC740 \uB9D0\uC774 \uB450 \uBC88 \uC774\uC5B4\uC84C\uC5B4\uC694: "${word}"`, {
        matchText: match[0],
        fix: { start, end: start + match[0].length, replacement: word }
      });
    }
    const normalized = normalizeForDuplicate(text);
    if (normalized.length >= 4) {
      const first = seenTexts.get(normalized);
      if (first) {
        push(
          item2,
          "duplicate-dialogue",
          "warning",
          first.pageIndex === item2.pageIndex ? "\uC774 \uD398\uC774\uC9C0\uC5D0 \uB611\uAC19\uC740 \uB300\uC0AC\uAC00 \uB610 \uC788\uC5B4\uC694. \uBCF5\uC0AC \uC2E4\uC218\uC778\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694." : `${first.pageIndex + 1}\uD398\uC774\uC9C0\uC758 \uB300\uC0AC\uC640 \uB611\uAC19\uC544\uC694. \uBCF5\uC0AC \uC2E4\uC218\uC778\uC9C0 \uD655\uC778\uD574 \uC8FC\uC138\uC694.`
        );
      } else {
        seenTexts.set(normalized, item2);
      }
    }
    const nonSpaceChars = countNonSpaceChars(text);
    if (item2.elType === "bubble") {
      if (nonSpaceChars > maxBubbleChars) {
        push(
          item2,
          "bubble-too-long",
          "warning",
          `\uD55C \uB9D0\uD48D\uC120\uC5D0 \uB300\uC0AC\uAC00 \uAE38\uC5B4\uC694 (${nonSpaceChars}\uC790). \uB9D0\uD48D\uC120\uC744 \uB098\uB204\uBA74 \uC77D\uAE30 \uC26C\uC6CC\uC694.`
        );
      }
      const longestLine = Math.max(...text.split("\n").map((line) => countNonSpaceChars(line)));
      if (longestLine > maxBubbleLineChars) {
        push(
          item2,
          "bubble-line-too-long",
          "warning",
          `\uD55C \uC904\uC774 \uAE38\uC5B4\uC694 (${longestLine}\uC790). \uC904\uBC14\uAFC8 \uC704\uCE58\uB97C \uC870\uC815\uD574 \uBCF4\uC138\uC694.`
        );
      }
    } else if (nonSpaceChars > maxTextChars) {
      push(item2, "bubble-too-long", "info", `\uD14D\uC2A4\uD2B8\uAC00 \uAE38\uC5B4\uC694 (${nonSpaceChars}\uC790).`);
    }
    const sentenceCount = text.split(/[.!?…]+/).filter((part) => part.trim().length > 0).length;
    if (item2.elType === "bubble" && sentenceCount >= 4) {
      push(
        item2,
        "many-sentences",
        "info",
        `\uD55C \uB9D0\uD48D\uC120\uC5D0 \uBB38\uC7A5\uC774 ${sentenceCount}\uAC1C\uC608\uC694. \uB098\uB204\uBA74 \uD638\uD761\uC774 \uC0B4\uC544\uC694.`
      );
    }
    if (/([!?])\1{2,}|[.]{4,}|~{3,}/.test(text)) {
      push(
        item2,
        "repeated-punctuation",
        "info",
        "\uB290\uB08C\uD45C\xB7\uBB3C\uC74C\uD45C\xB7\uC904\uC784\uD45C\uAC00 \uB9CE\uC774 \uACB9\uCCE4\uC5B4\uC694. \uC758\uB3C4\uD55C \uC5F0\uCD9C\uC774\uBA74 \uADF8\uB300\uB85C \uB450\uC138\uC694."
      );
    }
  }
  return findings;
}
function summarizeDialogueSpellcheck(items, findings, options = {}) {
  const includeHidden = options.includeHidden ?? false;
  const byRule = {};
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const finding of findings) {
    byRule[finding.ruleId] = (byRule[finding.ruleId] ?? 0) + 1;
    if (finding.severity === "error") errorCount += 1;
    else if (finding.severity === "warning") warningCount += 1;
    else infoCount += 1;
  }
  return {
    totalItemCount: items.length,
    checkedItemCount: items.filter((item2) => includeHidden || !item2.hidden).length,
    errorCount,
    warningCount,
    infoCount,
    findingCount: findings.length,
    byRule
  };
}

// studio-dialogue-spellcheck.test.ts
function item(partial) {
  return {
    pageId: "p1",
    pageIndex: 0,
    elType: "bubble",
    text: "",
    hidden: false,
    locked: false,
    ...partial
  };
}
describe("checkDialogueSpelling", () => {
  it("\uBE48 \uB9D0\uD48D\uC120\uC740 error, \uBE48 \uD14D\uC2A4\uD2B8\uB294 warning\uC73C\uB85C \uC54C\uB9B0\uB2E4", () => {
    const findings = checkDialogueSpelling([
      item({ id: "b1", text: "  " }),
      item({ id: "t1", elType: "text", text: "" })
    ]);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ itemId: "b1", ruleId: "empty-dialogue", severity: "error" });
    expect(findings[1]).toMatchObject({ itemId: "t1", ruleId: "empty-dialogue", severity: "warning" });
  });
  it("\uC790\uC8FC \uD2C0\uB9AC\uB294 \uD45C\uAE30\uB97C \uC7A1\uACE0 \uACE0\uCE58\uAE30 \uD6C4\uBCF4\uB97C \uC81C\uC2DC\uD55C\uB2E4", () => {
    const findings = checkDialogueSpelling([
      item({ id: "b1", text: "\uADF8\uAC8C \uB42C\uB2E4\uB2C8, \uBA87\uC77C\uC774\uB098 \uAC78\uB9B0 \uAC70\uC57C?" })
    ]);
    const fixes = findings.filter((f) => f.ruleId === "common-misspelling");
    expect(fixes.map((f) => f.fix?.replacement)).toEqual(["\uB410", "\uBA70\uCE60"]);
    const first = fixes[0];
    expect(first?.fix).toBeDefined();
  });
  it("\uB744\uC5B4 \uC4F4 \uC758\uC874\uBA85\uC0AC\uB294 \uAC74\uB4DC\uB9AC\uC9C0 \uC54A\uACE0 \uBD99\uC740 \uACBD\uC6B0\uB9CC \uC7A1\uB294\uB2E4", () => {
    const ok = checkDialogueSpelling([item({ id: "b1", text: "\uD560 \uC218 \uC788\uC5B4. \uADF8\uB7F4 \uAC83 \uAC19\uC544." })]);
    expect(ok.filter((f) => f.ruleId === "spacing-dependent-noun")).toHaveLength(0);
    const bad = checkDialogueSpelling([item({ id: "b2", text: "\uD560\uC218\uC788\uC5B4. \uADF8\uB7F4 \uAC83\uAC19\uC544." })]);
    const spacing = bad.filter((f) => f.ruleId === "spacing-dependent-noun");
    expect(spacing.map((f) => f.fix?.replacement)).toEqual(["\uC218 \uC788\uC5B4", "\uAC83 \uAC19\uC544"]);
  });
  it("\uBB38\uC7A5\uBD80\uD638 \uC55E \uACF5\uBC31\uACFC \uC5F0\uC18D \uACF5\uBC31\uC744 \uC7A1\uB294\uB2E4", () => {
    const findings = checkDialogueSpelling([item({ id: "b1", text: "\uC815\uB9D0  \uBAB0\uB77C !" })]);
    expect(findings.some((f) => f.ruleId === "double-space")).toBe(true);
    expect(findings.some((f) => f.ruleId === "space-before-punctuation")).toBe(true);
  });
  it("\uC9E7\uC740 \uB300\uB2F5\uC758 \uBC18\uBCF5\uC740 \uC911\uBCF5\uC73C\uB85C \uCE58\uC9C0 \uC54A\uACE0, \uAE34 \uB300\uC0AC\uC758 \uBCF5\uC0AC\uB294 \uC7A1\uB294\uB2E4", () => {
    const short = checkDialogueSpelling([
      item({ id: "b1", text: "\uC751." }),
      item({ id: "b2", text: "\uC751." })
    ]);
    expect(short.filter((f) => f.ruleId === "duplicate-dialogue")).toHaveLength(0);
    const copied = checkDialogueSpelling([
      item({ id: "b3", text: "\uC624\uB298\uC740 \uC5EC\uAE30\uAE4C\uC9C0\uB9CC \uD558\uC790." }),
      item({ id: "b4", pageIndex: 1, pageId: "p2", text: "\uC624\uB298\uC740 \uC5EC\uAE30\uAE4C\uC9C0\uB9CC \uD558\uC790." })
    ]);
    const dup = copied.filter((f) => f.ruleId === "duplicate-dialogue");
    expect(dup).toHaveLength(1);
    expect(dup[0]?.itemId).toBe("b4");
    expect(dup[0]?.message).toContain("1\uD398\uC774\uC9C0");
  });
  it("\uAC19\uC740 \uC5B4\uC808 \uBC18\uBCF5\uC744 \uC7A1\uB418 \uC758\uC131\uC5B4\uB294 \uC81C\uC678\uD55C\uB2E4", () => {
    const findings = checkDialogueSpelling([
      item({ id: "b1", text: "\uB098\uB294 \uB098\uB294 \uBAB0\uB790\uC5B4. \uD558\uD558 \uD558\uD558 \uC6C3\uC5C8\uB2E4." })
    ]);
    const repeated = findings.filter((f) => f.ruleId === "repeated-word");
    expect(repeated).toHaveLength(1);
    expect(repeated[0]?.matchText).toContain("\uB098\uB294");
  });
  it("\uAE34 \uB9D0\uD48D\uC120\uACFC \uAE34 \uD55C \uC904\uC744 \uACBD\uACE0\uD55C\uB2E4", () => {
    const longLine = "\uAC00\uB098\uB2E4\uB77C\uB9C8\uBC14\uC0AC\uC544\uC790\uCC28\uCE74\uD0C0\uD30C\uD558\uAC00\uB098\uB2E4\uB77C\uB9C8\uBC14\uC0AC\uC544\uC790\uCC28\uCE74\uD0C0\uD30C\uD558";
    const findings = checkDialogueSpelling([item({ id: "b1", text: longLine })]);
    expect(findings.some((f) => f.ruleId === "bubble-line-too-long")).toBe(true);
  });
  it("\uC228\uAE40 \uB300\uC0AC\uB294 \uAE30\uBCF8 \uC81C\uC678, \uC635\uC158\uC744 \uC8FC\uBA74 \uD3EC\uD568\uD55C\uB2E4", () => {
    const hidden = [item({ id: "b1", text: "\uB42C\uB2E4", hidden: true })];
    expect(checkDialogueSpelling(hidden)).toHaveLength(0);
    expect(checkDialogueSpelling(hidden, { includeHidden: true }).length).toBeGreaterThan(0);
  });
  it("\uC7A0\uAE34 \uB300\uC0AC\uB3C4 \uAC80\uC0AC\uD55C\uB2E4(\uC77D\uAE30\uB294 \uC7A0\uAE08\uACFC \uBB34\uAD00)", () => {
    const findings = checkDialogueSpelling([item({ id: "b1", text: "\uB42C\uB2E4", locked: true })]);
    expect(findings.some((f) => f.ruleId === "common-misspelling")).toBe(true);
  });
  it("\uADDC\uCE59\uC744 \uB044\uBA74 \uADF8 \uADDC\uCE59\uC758 \uC9C0\uC801\uC774 \uC0AC\uB77C\uC9C4\uB2E4", () => {
    const findings = checkDialogueSpelling([item({ id: "b1", text: "\uB42C\uB2E4" })], {
      disabledRules: ["common-misspelling"]
    });
    expect(findings).toHaveLength(0);
  });
  it("\uC694\uC57D\uC740 \uC2EC\uAC01\uB3C4\xB7\uADDC\uCE59\uBCC4 \uAC74\uC218\uB97C \uC9D1\uACC4\uD55C\uB2E4", () => {
    const items = [item({ id: "b1", text: "" }), item({ id: "b2", text: "\uB42C\uB2E4" })];
    const findings = checkDialogueSpelling(items);
    const summary = summarizeDialogueSpellcheck(items, findings);
    expect(summary.checkedItemCount).toBe(2);
    expect(summary.errorCount).toBe(1);
    expect(summary.warningCount).toBe(1);
    expect(summary.byRule["common-misspelling"]).toBe(1);
  });
  it("'-\uAED8' \uB9D0\uB05D(\uC694 \uC5C6\uB294 \uD615\uD0DC)\uB3C4 \uC7A1\uB418, \uC874\uB313\uB9D0 \uC870\uC0AC '\uAED8'\uB294 \uC9C0\uC801\uD558\uC9C0 \uC54A\uB294\uB2E4", () => {
    const flagged = checkDialogueSpelling([
      item({ id: "k1", text: "\uB0B4\uAC00 \uAF2D \uD560\uAED8!" }),
      item({ id: "k2", text: "\uADF8\uAC74 \uB0B4\uAC00 \uC904\uAED8." }),
      item({ id: "k3", text: "\uB0B4\uC77C \uAC08\uAED8!" }),
      item({ id: "k4", text: "\uAC71\uC815 \uB9C8, \uB420\uAED8." }),
      item({ id: "k5", text: "\uC5EC\uAE30 \uC788\uC744\uAED8." })
    ]).filter((f) => f.ruleId === "common-misspelling");
    expect(flagged.map((f) => f.fix?.replacement)).toEqual([
      "\uD560\uAC8C",
      "\uC904\uAC8C",
      "\uAC08\uAC8C",
      "\uB420\uAC8C",
      "\uC788\uC744\uAC8C"
    ]);
    const honorific = checkDialogueSpelling([
      item({ id: "h1", text: "\uC120\uC0DD\uB2D8\uAED8 \uB4DC\uB9B4 \uB9D0\uC500" }),
      item({ id: "h2", text: "\uC5B4\uBA38\uB2C8\uAED8 \uC548\uBD80 \uC804\uD574\uC918" }),
      item({ id: "h3", text: "\uD560\uBA38\uB2C8\uAED8 \uC6A9\uB3C8 \uBC1B\uC558\uC5B4" })
    ]);
    expect(honorific.filter((f) => f.ruleId === "common-misspelling")).toHaveLength(0);
  });
});
