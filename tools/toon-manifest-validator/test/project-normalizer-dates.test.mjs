import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { parseDeterministicCreatedAt } from '../src/projectNormalizer.mjs';
import {
  ERROR_CODES,
  validateProject,
  generateExportManifest,
  canonicalJsonStringify,
} from '../src/index.mjs';

const NORMALIZER_MODULE_URL = new URL('../src/projectNormalizer.mjs', import.meta.url).href;
const INDEX_MODULE_URL = new URL('../src/index.mjs', import.meta.url).href;

const SYNTHETIC_ASSET_SHA256 =
  '4ffd8bb30991e3a6f28d1d03f1aedcd02ccf8e0cc16bb9e969e7bc2bda1ddf03';

function makeSyntheticProject(createdAt) {
  return {
    schemaVersion: '1.0.0',
    project: {
      id: 'proj-date-boundary-01',
      title: '날짜 경계 검증 프로젝트',
      createdAt,
    },
    episodes: [{ id: 'ep-1', projectId: 'proj-date-boundary-01', title: '1화', order: 1 }],
    scenes: [{ id: 'sc-1', episodeId: 'ep-1', title: '1씬', order: 1 }],
    panels: [{ id: 'pn-1', sceneId: 'sc-1', title: '1컷', order: 1, assetIds: ['as-1'] }],
    assets: [
      {
        id: 'as-1',
        type: 'image',
        title: '합성 이미지',
        relativePath: 'assets/images/cut01.png',
        expectedSha256: SYNTHETIC_ASSET_SHA256,
      },
    ],
  };
}

test('65. Proleptic Gregorian leap-year boundaries accept valid 0000/0004/0096/0400/1600/2000/2400 Feb 29 timestamps', () => {
  const validLeapInputs = [
    ['0000-02-29T00:00:00Z', '0000-02-29T00:00:00.000Z'],
    ['0000-02-29T23:59:59.999Z', '0000-02-29T23:59:59.999Z'],
    ['0004-02-29T00:00:00Z', '0004-02-29T00:00:00.000Z'],
    ['0096-02-29T12:30:45.5Z', '0096-02-29T12:30:45.500Z'],
    ['0400-02-29T00:00:00Z', '0400-02-29T00:00:00.000Z'],
    ['1600-02-29T00:00:00Z', '1600-02-29T00:00:00.000Z'],
    ['2000-02-29T00:00:00Z', '2000-02-29T00:00:00.000Z'],
    ['2400-02-29T00:00:00Z', '2400-02-29T00:00:00.000Z'],
  ];

  for (const [raw, expectedIso] of validLeapInputs) {
    const parsed = parseDeterministicCreatedAt(raw);
    assert.deepEqual(parsed, { valid: true, canonicalIso: expectedIso }, `Expected valid for "${raw}"`);

    const manifestRes = generateExportManifest(makeSyntheticProject(raw), { verifyFiles: false });
    assert.equal(manifestRes.ok, true, `Expected manifest generation to pass for "${raw}"`);
    assert.equal(manifestRes.manifest.studioArchiveManifest.createdAt, expectedIso);
  }
});

test('66. Century and non-leap boundaries reject 0001/0099/0100/0200/0300/1900/2100 Feb 29 while allowing Feb 28', () => {
  for (const nonLeapFeb28 of [
    ['0001-02-28T23:59:59Z', '0001-02-28T23:59:59.000Z'],
    ['0099-02-28T23:59:59Z', '0099-02-28T23:59:59.000Z'],
    ['0100-02-28T23:59:59Z', '0100-02-28T23:59:59.000Z'],
    ['1900-02-28T23:59:59Z', '1900-02-28T23:59:59.000Z'],
  ]) {
    assert.deepEqual(parseDeterministicCreatedAt(nonLeapFeb28[0]), {
      valid: true,
      canonicalIso: nonLeapFeb28[1],
    });
  }

  for (const invalidFeb29 of [
    '0001-02-29T00:00:00Z',
    '0099-02-29T00:00:00Z',
    '0100-02-29T00:00:00Z',
    '0200-02-29T00:00:00Z',
    '0300-02-29T00:00:00Z',
    '1900-02-29T00:00:00Z',
    '2100-02-29T00:00:00Z',
  ]) {
    assert.deepEqual(
      parseDeterministicCreatedAt(invalidFeb29),
      { valid: false, canonicalIso: null },
      `Expected invalid for "${invalidFeb29}"`
    );

    const validation = validateProject(makeSyntheticProject(invalidFeb29), { verifyFiles: false });
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.code === ERROR_CODES.INVALID_PROJECT_TIMESTAMP));
  }
});

test('67. Invalid calendar dates (April 31, 30-day months, month/day/time out-of-range) never auto-rollover', () => {
  const validMonthEnds = [
    ['2000-01-31T00:00:00Z', '2000-01-31T00:00:00.000Z'],
    ['2000-03-31T00:00:00Z', '2000-03-31T00:00:00.000Z'],
    ['2000-04-30T23:59:59Z', '2000-04-30T23:59:59.000Z'],
    ['2000-05-31T00:00:00Z', '2000-05-31T00:00:00.000Z'],
    ['2000-06-30T23:59:59Z', '2000-06-30T23:59:59.000Z'],
    ['2000-07-31T00:00:00Z', '2000-07-31T00:00:00.000Z'],
    ['2000-08-31T00:00:00Z', '2000-08-31T00:00:00.000Z'],
    ['2000-09-30T23:59:59Z', '2000-09-30T23:59:59.000Z'],
    ['2000-10-31T00:00:00Z', '2000-10-31T00:00:00.000Z'],
    ['2000-11-30T23:59:59Z', '2000-11-30T23:59:59.000Z'],
    ['2000-12-31T23:59:59.123456789Z', '2000-12-31T23:59:59.123Z'],
  ];

  for (const [raw, expectedIso] of validMonthEnds) {
    assert.deepEqual(parseDeterministicCreatedAt(raw), { valid: true, canonicalIso: expectedIso });
  }

  const invalidCalendarInputs = [
    '2000-04-31T00:00:00Z',
    '0000-04-31T00:00:00Z',
    '2000-04-31T09:00:00+09:00',
    '2000-02-30T00:00:00Z',
    '0000-02-30T00:00:00Z',
    '2000-02-31T00:00:00Z',
    '2000-06-31T00:00:00Z',
    '2000-09-31T00:00:00Z',
    '2000-11-31T00:00:00Z',
    '2000-01-32T00:00:00Z',
    '2000-12-32T00:00:00Z',
    '2000-00-10T00:00:00Z',
    '2000-13-01T00:00:00Z',
    '2000-04-00T00:00:00Z',
    '2000-04-30T24:00:00Z',
    '2000-04-30T23:60:00Z',
    '2000-04-30T23:59:60Z',
  ];

  for (const invalidRaw of invalidCalendarInputs) {
    assert.deepEqual(
      parseDeterministicCreatedAt(invalidRaw),
      { valid: false, canonicalIso: null },
      `Expected invalid without rollover for "${invalidRaw}"`
    );
  }
});

test('68. Valid and invalid timezone offsets are strictly distinguished', () => {
  const validOffsets = [
    ['2000-02-29T12:00:00Z', '2000-02-29T12:00:00.000Z'],
    ['2000-02-29t12:00:00z', '2000-02-29T12:00:00.000Z'],
    ['2000-02-29T12:00:00+00:00', '2000-02-29T12:00:00.000Z'],
    ['2000-02-29T12:00:00-00:00', '2000-02-29T12:00:00.000Z'],
    ['2000-02-29T21:00:00+09:00', '2000-02-29T12:00:00.000Z'],
    ['2000-02-29T17:30:00+05:30', '2000-02-29T12:00:00.000Z'],
    ['2000-02-29T17:45:00+05:45', '2000-02-29T12:00:00.000Z'],
    ['2000-03-01T02:00:00+14:00', '2000-02-29T12:00:00.000Z'],
    ['2000-02-29T00:00:00-12:00', '2000-02-29T12:00:00.000Z'],
    ['2000-02-29T23:59:00+23:59', '2000-02-29T00:00:00.000Z'],
  ];

  for (const [raw, expectedIso] of validOffsets) {
    assert.deepEqual(
      parseDeterministicCreatedAt(raw),
      { valid: true, canonicalIso: expectedIso },
      `Expected valid offset for "${raw}"`
    );
  }

  const invalidOffsets = [
    '2000-02-29T12:00:00',
    '0000-02-29T00:00:00',
    '2000-02-29T12:00:00+24:00',
    '2000-02-29T12:00:00-24:00',
    '2000-02-29T12:00:00+09:60',
    '2000-02-29T12:00:00-05:60',
    '2000-02-29T12:00:00+9:00',
    '2000-02-29T12:00:00+09:0',
    '2000-02-29T12:00:00+0900',
    '2000-02-29T12:00:00+09',
    '2000-02-29T12:00:00Z+09:00',
    '2000-02-29 12:00:00Z',
  ];

  for (const badOffset of invalidOffsets) {
    assert.deepEqual(
      parseDeterministicCreatedAt(badOffset),
      { valid: false, canonicalIso: null },
      `Expected invalid offset for "${badOffset}"`
    );
  }
});

test('69. Same-instant offsets across year 0000 and 2000 leap-day boundaries canonicalize to identical UTC ISO and SHA-256', () => {
  const yearZeroSameInstant = [
    '0000-02-29T12:00:00Z',
    '0000-02-29T21:00:00+09:00',
    '0000-02-29T06:30:00-05:30',
    '0000-03-01T02:00:00+14:00',
    '0000-02-29T00:00:00-12:00',
  ];

  const baselineZero = generateExportManifest(makeSyntheticProject(yearZeroSameInstant[0]), {
    verifyFiles: false,
  });
  assert.equal(baselineZero.ok, true);
  assert.equal(baselineZero.manifest.studioArchiveManifest.createdAt, '0000-02-29T12:00:00.000Z');

  for (const eqRaw of yearZeroSameInstant.slice(1)) {
    const candidate = generateExportManifest(makeSyntheticProject(eqRaw), { verifyFiles: false });
    assert.equal(candidate.ok, true, `Expected valid manifest for "${eqRaw}"`);
    assert.equal(candidate.manifest.studioArchiveManifest.createdAt, '0000-02-29T12:00:00.000Z');
    assert.equal(
      candidate.manifest.integrity.manifestContentHash,
      baselineZero.manifest.integrity.manifestContentHash
    );
    assert.equal(
      canonicalJsonStringify(candidate.manifest),
      canonicalJsonStringify(baselineZero.manifest)
    );
  }

  // Non-leap century 1900 offset crossing March 1 backwards lands on Feb 28, not Feb 29
  assert.deepEqual(parseDeterministicCreatedAt('1900-03-01T06:00:00+09:00'), {
    valid: true,
    canonicalIso: '1900-02-28T21:00:00.000Z',
  });
});

test('70. Cross-TZ environment independence holds across TZ=UTC, TZ=Asia/Seoul, and TZ=America/New_York', () => {
  const probeScript = `
    import { parseDeterministicCreatedAt } from ${JSON.stringify(NORMALIZER_MODULE_URL)};
    import { generateExportManifest } from ${JSON.stringify(INDEX_MODULE_URL)};
    const baseProject = ${JSON.stringify(makeSyntheticProject('0000-02-29T09:00:00+09:00'))};
    const manifestRes = generateExportManifest(baseProject, { verifyFiles: false });
    process.stdout.write(JSON.stringify({
      leapZeroUtc: parseDeterministicCreatedAt('0000-02-29T00:00:00Z'),
      leapZeroOffset: parseDeterministicCreatedAt('0000-02-29T09:00:00+09:00'),
      century1900Invalid: parseDeterministicCreatedAt('1900-02-29T00:00:00Z'),
      century0100Invalid: parseDeterministicCreatedAt('0100-02-29T00:00:00Z'),
      year0099Invalid: parseDeterministicCreatedAt('0099-02-29T00:00:00Z'),
      april31Invalid: parseDeterministicCreatedAt('2000-04-31T00:00:00Z'),
      missingTzInvalid: parseDeterministicCreatedAt('0000-02-29T00:00:00'),
      manifestOk: manifestRes.ok,
      manifestCreatedAt: manifestRes.manifest?.studioArchiveManifest?.createdAt ?? null,
      manifestHash: manifestRes.manifest?.integrity?.manifestContentHash ?? null,
    }));
  `;

  const runInTz = (tz) =>
    JSON.parse(
      childProcess.execFileSync(process.execPath, ['--input-type=module', '-e', probeScript], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      })
    );

  const utcOut = runInTz('UTC');
  const seoulOut = runInTz('Asia/Seoul');
  const nyOut = runInTz('America/New_York');

  assert.equal(utcOut.manifestOk, true);
  assert.equal(utcOut.manifestCreatedAt, '0000-02-29T00:00:00.000Z');
  assert.equal(utcOut.leapZeroUtc.canonicalIso, '0000-02-29T00:00:00.000Z');
  assert.equal(utcOut.leapZeroOffset.canonicalIso, '0000-02-29T00:00:00.000Z');
  assert.equal(utcOut.century1900Invalid.valid, false);
  assert.equal(utcOut.century0100Invalid.valid, false);
  assert.equal(utcOut.year0099Invalid.valid, false);
  assert.equal(utcOut.april31Invalid.valid, false);
  assert.equal(utcOut.missingTzInvalid.valid, false);

  assert.deepEqual(seoulOut, utcOut);
  assert.deepEqual(nyOut, utcOut);
});
