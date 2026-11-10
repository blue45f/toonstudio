import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ERROR_CODES,
  foldPathCase,
  inspectAndNormalizeAssetPath,
  resolveSafeFixtureFilePath,
  validateProject,
  generateExportManifest,
  verifyExportManifest,
  compareStringsCodePoint,
  canonicalJsonStringify,
  computeFileSha256,
} from '../src/index.mjs';

const INDEX_MODULE_URL = new URL('../src/index.mjs', import.meta.url).href;
const SANDBOX_BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'toon-manifest-hardening-'));
const FIXTURE_ROOT = path.join(SANDBOX_BASE, 'fixture');
const SIBLING_OUTSIDE_ROOT = path.join(SANDBOX_BASE, 'fixture-outside');

function setupHardeningFixtures() {
  for (const sub of ['assets/images', 'assets/scripts', 'assets/a', 'assets/b', 'valid-sub']) {
    fs.mkdirSync(path.join(FIXTURE_ROOT, sub), { recursive: true });
  }
  fs.mkdirSync(path.join(SIBLING_OUTSIDE_ROOT, 'sub'), { recursive: true });

  const pngBytes = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
    'hex'
  );

  // Base valid files inside FIXTURE_ROOT
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'assets/images/ep1_p1.png'), pngBytes);
  fs.writeFileSync(
    path.join(FIXTURE_ROOT, 'assets/images/ep1_p2.webp'),
    Buffer.from('RIFF_SYNTHETIC_WEBP', 'utf8')
  );
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'assets/images/ß.png'), pngBytes);

  // Distinct inner vs outer files for absolute-symlink `..` collapse regression check
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'same.png'), Buffer.from('INNER_FIXTURE_SAME_PNG', 'utf8'));
  fs.writeFileSync(
    path.join(SIBLING_OUTSIDE_ROOT, 'same.png'),
    Buffer.from('OUTSIDE_DIFFERENT_SAME_PNG_PAYLOAD', 'utf8')
  );

  // Legitimate edge-case filenames that MUST NOT be over-rejected
  for (const rel of [
    'assets/images/100%_zoom +50% @2x #1 (최종본) [v1.2].png',
    'assets/images/ep01..02_ellipsis...scene.png',
    '..prologue_note.png',
    'assets/images/icon.png',
    'assets/images/comic1.png',
    'assets/images/token_ring.png',
  ]) {
    fs.writeFileSync(path.join(FIXTURE_ROOT, rel), pngBytes);
  }
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'assets/images/null_bg.webp'), Buffer.from('RIFF_NULL_BG', 'utf8'));
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'assets/scripts/context.json'), JSON.stringify({ scene: 'intro' }));
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'assets/images/shadow_forest.jpg'), Buffer.from('FFD8_SHADOW', 'utf8'));

  // Synthetic sensitive placeholder inside FIXTURE_ROOT (dummy text only, never real secret)
  const dotEnvName = String.fromCharCode(46, 101, 110, 118);
  fs.writeFileSync(path.join(FIXTURE_ROOT, dotEnvName), 'DUMMY_SYNTHETIC_PLACEHOLDER=1\n', 'utf8');
  fs.writeFileSync(path.join(SIBLING_OUTSIDE_ROOT, 'outside_asset.png'), pngBytes);

  // Symlink topologies inside FIXTURE_ROOT & SIBLING_OUTSIDE_ROOT
  fs.symlinkSync('./ep1_p1.png', path.join(FIXTURE_ROOT, 'assets/images/valid_internal_alias.png'));
  fs.symlinkSync('../../../fixture-outside/outside_asset.png', path.join(FIXTURE_ROOT, 'assets/images/escape_direct.png'));
  fs.symlinkSync('../b/hop2.png', path.join(FIXTURE_ROOT, 'assets/a/hop1.png'));
  fs.symlinkSync('../../../fixture-outside/outside_asset.png', path.join(FIXTURE_ROOT, 'assets/b/hop2.png'));
  fs.symlinkSync('../../../fixture-outside/missing_outside.png', path.join(FIXTURE_ROOT, 'assets/a/dangling_escape.png'));
  fs.symlinkSync('../../fixture-outside', path.join(FIXTURE_ROOT, 'assets/bounce_out'));
  fs.symlinkSync('../fixture/assets/images', path.join(SIBLING_OUTSIDE_ROOT, 'back'));
  fs.symlinkSync('./loop2.png', path.join(FIXTURE_ROOT, 'assets/a/loop1.png'));
  fs.symlinkSync('./loop1.png', path.join(FIXTURE_ROOT, 'assets/a/loop2.png'));
  fs.symlinkSync(
    path.join(SIBLING_OUTSIDE_ROOT, 'outside_asset.png'),
    path.join(FIXTURE_ROOT, 'assets/images/sibling_prefix_escape.png')
  );
  fs.symlinkSync(`../../${dotEnvName}`, path.join(FIXTURE_ROOT, 'assets/images/sneaky_sensitive_link.png'));

  // P1 Regression Symlinks: uncollapsed `..` inside absolute symlink target strings
  fs.symlinkSync(path.join(SIBLING_OUTSIDE_ROOT, 'sub'), path.join(FIXTURE_ROOT, 'escape-dir'));
  fs.symlinkSync(`${FIXTURE_ROOT}/escape-dir/../same.png`, path.join(FIXTURE_ROOT, 'alias.png'));
  fs.symlinkSync(`${FIXTURE_ROOT}/missing/../same.png`, path.join(FIXTURE_ROOT, 'dangling.png'));
  fs.symlinkSync(`${FIXTURE_ROOT}/valid-sub/../same.png`, path.join(FIXTURE_ROOT, 'valid_abs_dotdot.png'));
}

function makeSingleAssetProject(relativePath, assetType = 'image') {
  return {
    schemaVersion: '1.0.0',
    project: {
      id: 'proj-hardening-01',
      title: '경로 안전성 검증 프로젝트',
      createdAt: '2026-11-10T00:00:00.000Z',
    },
    episodes: [{ id: 'ep-1', projectId: 'proj-hardening-01', title: '1화', order: 1 }],
    scenes: [{ id: 'sc-1', episodeId: 'ep-1', title: '1씬', order: 1 }],
    panels: [{ id: 'pn-1', sceneId: 'sc-1', title: '1컷', order: 1, assetIds: ['as-1'] }],
    assets: [{ id: 'as-1', type: assetType, title: '테스트 에셋', relativePath }],
  };
}

setupHardeningFixtures();

test('46. Windows drive-relative, UNC, and Win32 device namespace paths fail with UNSAFE_ABSOLUTE_PATH', () => {
  const unsafePaths = [
    'C:assets/images/ep1_p1.png',
    'd:ep1_p1.png',
    'C:',
    '\\\\fileserver\\share\\ep1_p1.png',
    '//fileserver/share/ep1_p1.png',
    '\\\\?\\C:\\assets\\ep1_p1.png',
    '\\\\.\\PhysicalDrive0',
    '\\root_relative\\ep1_p1.png',
    ' /leading_space_abs/ep1_p1.png',
  ];
  for (const unsafePath of unsafePaths) {
    const inspection = inspectAndNormalizeAssetPath(unsafePath, 'image');
    assert.equal(inspection.valid, false, `Expected invalid for "${unsafePath}"`);
    assert.ok(inspection.issues.some((i) => i.code === ERROR_CODES.UNSAFE_ABSOLUTE_PATH));
  }
});

test('47. Percent-encoded drive/UNC/root paths and single-slash URI schemes are rejected', () => {
  for (const p of [
    '%2fassets%2fimages%2fep1_p1.png',
    '%5c%5cserver%5cshare%5cep1_p1.png',
    'C%3a%5cWorkspace%5cep1_p1.png',
    'c%3aassets/ep1_p1.png',
  ]) {
    const inspection = inspectAndNormalizeAssetPath(p, 'image');
    assert.equal(inspection.valid, false);
    assert.ok(inspection.issues.some((i) => i.code === ERROR_CODES.UNSAFE_ABSOLUTE_PATH));
  }

  for (const u of [
    ['file', ':/abs/path/ep1_p1.png'].join(''),
    ['blob', ':local/ep1_p1.png'].join(''),
    ['data', ':image/png;base64,AAAA'].join(''),
  ]) {
    const inspection = inspectAndNormalizeAssetPath(u, 'image');
    assert.equal(inspection.valid, false);
    assert.ok(inspection.issues.some((i) => i.code === ERROR_CODES.UNSAFE_URI_SCHEME));
  }
});

test('48. Standalone backslash separators and NTFS Alternate Data Stream colons fail with INVALID_RELATIVE_PATH', () => {
  const resBackslash = validateProject(makeSingleAssetProject('assets\\images\\ep1_p1.png'), {
    fixtureDir: FIXTURE_ROOT,
  });
  assert.equal(resBackslash.valid, false);
  assert.ok(resBackslash.errors.some((e) => e.code === ERROR_CODES.INVALID_RELATIVE_PATH));

  for (const adsPath of ['assets/images/ep1_p1.png:$DATA', 'assets/images/note.txt:ep1_p1.png']) {
    const inspection = inspectAndNormalizeAssetPath(adsPath, 'image');
    assert.equal(inspection.valid, false);
    assert.ok(inspection.issues.some((i) => i.code === ERROR_CODES.INVALID_RELATIVE_PATH));
  }
});

test('49. Mixed/double-encoded dot-dot, dot segments, encoded slashes, and trailing dots/spaces are rejected', () => {
  for (const p of [
    'assets/.%2e/100%_raw_percent/ep1_p1.png',
    'assets/%2e./ep1_p1.png',
    'assets/%252e%252e/ep1_p1.png',
    'assets/.. /ep1_p1.png',
  ]) {
    const inspection = inspectAndNormalizeAssetPath(p, 'image');
    assert.equal(inspection.valid, false);
    assert.ok(inspection.issues.some((i) => i.code === ERROR_CODES.PATH_TRAVERSAL_DETECTED));
  }

  for (const p of [
    '././assets/images/ep1_p1.png',
    'assets/./images/ep1_p1.png',
    'assets/images/.',
    '%2e/assets/images/ep1_p1.png',
    'assets/%2e/ep1_p1.png',
    'assets%2fimages%2fep1_p1.png',
    'assets//images/ep1_p1.png',
    'assets./images/ep1_p1.png',
    'assets /images/ep1_p1.png',
    'assets/images/ep1_p1.png ',
  ]) {
    const inspection = inspectAndNormalizeAssetPath(p, 'image');
    assert.equal(inspection.valid, false);
    assert.ok(inspection.issues.some((i) => i.code === ERROR_CODES.INVALID_RELATIVE_PATH));
  }
});

test('50. Raw/encoded/double-encoded NUL, control characters, and Windows reserved device names are rejected', () => {
  for (const nulPath of ['assets/images/ep1\0.png', 'assets/images/ep1%00.png', 'assets/images/ep1%2500.png']) {
    const inspection = inspectAndNormalizeAssetPath(nulPath, 'image');
    assert.equal(inspection.valid, false);
    assert.ok(inspection.issues.some((i) => i.code === ERROR_CODES.UNSAFE_NULL_BYTE));
  }

  for (const ctrlPath of ['assets/images/ep1\nline2.png', 'assets/images/ep1%0d%0a.png']) {
    const inspection = inspectAndNormalizeAssetPath(ctrlPath, 'image');
    assert.equal(inspection.valid, false);
    assert.ok(inspection.issues.some((i) => i.code === ERROR_CODES.INVALID_RELATIVE_PATH));
  }

  for (const devPath of [
    'NUL.png',
    'assets/images/con.png',
    'assets/prn/ep1_p1.png',
    'assets/images/aux.jpg',
    'assets/images/com1.png',
    'assets/images/lpt9.webp',
  ]) {
    const inspection = inspectAndNormalizeAssetPath(devPath, 'image');
    assert.equal(inspection.valid, false);
    assert.ok(inspection.issues.some((i) => i.code === ERROR_CODES.INVALID_RELATIVE_PATH));
  }
});

test('51. Normal filename compatibility: legitimate punctuation, literal %, multiple dots, ..prefix, and device substrings succeed', () => {
  const proj = {
    schemaVersion: '1.0.0',
    project: { id: 'proj-compat', title: '정상 파일명 호환성 테스트' },
    episodes: [{ id: 'ep-1', projectId: 'proj-compat', title: '1화', order: 1 }],
    scenes: [{ id: 'sc-1', episodeId: 'ep-1', title: '1씬', order: 1 }],
    panels: [
      {
        id: 'pn-1',
        sceneId: 'sc-1',
        title: '1컷',
        order: 1,
        assetIds: ['a-1', 'a-2', 'a-3', 'a-4', 'a-5', 'a-6', 'a-7', 'a-8', 'a-9'],
      },
    ],
    assets: [
      { id: 'a-1', type: 'image', title: '퍼센트 및 괄호', relativePath: 'assets/images/100%_zoom +50% @2x #1 (최종본) [v1.2].png' },
      { id: 'a-2', type: 'image', title: '중간 연속 점', relativePath: 'assets/images/ep01..02_ellipsis...scene.png' },
      { id: 'a-3', type: 'image', title: '선행 두 점 파일명', relativePath: '..prologue_note.png' },
      { id: 'a-4', type: 'image', title: '아이콘', relativePath: 'assets/images/icon.png' },
      { id: 'a-5', type: 'image', title: '널 배경', relativePath: 'assets/images/null_bg.webp' },
      { id: 'a-6', type: 'script', title: '컨텍스트', relativePath: 'assets/scripts/context.json' },
      { id: 'a-7', type: 'image', title: '코믹1', relativePath: 'assets/images/comic1.png' },
      { id: 'a-8', type: 'image', title: '그림자 숲', relativePath: 'assets/images/shadow_forest.jpg' },
      { id: 'a-9', type: 'image', title: '토큰 링', relativePath: 'assets/images/token_ring.png' },
    ],
  };

  const res = generateExportManifest(proj, { fixtureDir: FIXTURE_ROOT });
  assert.equal(res.ok, true, `Unexpected validation errors: ${JSON.stringify(res.validation.errors)}`);
  assert.equal(res.manifest.assets.length, 9);
  assert.equal(verifyExportManifest(res.manifest, FIXTURE_ROOT).verified, true);
});

test('52. Unicode case-folding & combined ./ + NFD/NFC + case collisions are detected', () => {
  const cases = [
    ['assets/images/Café_Cut.png'.normalize('NFC'), 'assets/images/cafe\u0301_cut.png'],
    ['assets/images/σκηνή_ς.png', 'assets/images/ΣΚΗΝΉ_Σ.PNG'],
    ['./assets/images/EP1_P1.PNG', 'assets/images/ep1_p1.png'],
  ];
  for (const [pathA, pathB] of cases) {
    const proj = {
      schemaVersion: '1.0.0',
      project: { id: 'proj-col', title: '유니코드 충돌 검사' },
      episodes: [{ id: 'ep-1', projectId: 'proj-col', title: '1화', order: 1 }],
      scenes: [{ id: 'sc-1', episodeId: 'ep-1', title: '1씬', order: 1 }],
      panels: [{ id: 'pn-1', sceneId: 'sc-1', title: '1컷', order: 1, assetIds: ['a-1', 'a-2'] }],
      assets: [
        { id: 'a-1', type: 'image', title: 'A', relativePath: pathA },
        { id: 'a-2', type: 'image', title: 'B', relativePath: pathB },
      ],
    };
    const res = validateProject(proj, { fixtureDir: FIXTURE_ROOT, verifyFiles: false });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.code === ERROR_CODES.NORMALIZATION_COLLISION_CASE));
  }
});

test('53. Direct, nested multi-hop, dangling external, bounce-back, and cyclic symlinks fail with SYMLINK_ESCAPE_DETECTED', () => {
  for (const relPath of [
    'assets/images/escape_direct.png',
    'assets/a/hop1.png',
    'assets/a/dangling_escape.png',
    'assets/bounce_out/back/ep1_p1.png',
    'assets/a/loop1.png',
  ]) {
    const resolved = resolveSafeFixtureFilePath(FIXTURE_ROOT, relPath);
    assert.equal(resolved.safe, false);
    assert.equal(resolved.code, ERROR_CODES.SYMLINK_ESCAPE_DETECTED);
  }
});

test('54. Valid internal symlink succeeds while internal symlink to sensitive file inside fixture fails with SENSITIVE_FILE_REJECTED', () => {
  const validRes = generateExportManifest(makeSingleAssetProject('assets/images/valid_internal_alias.png'), {
    fixtureDir: FIXTURE_ROOT,
  });
  assert.equal(validRes.ok, true);

  const sneakyRes = validateProject(makeSingleAssetProject('assets/images/sneaky_sensitive_link.png'), {
    fixtureDir: FIXTURE_ROOT,
  });
  assert.equal(sneakyRes.valid, false);
  assert.ok(sneakyRes.errors.some((e) => e.code === ERROR_CODES.SENSITIVE_FILE_REJECTED));
});

test('55. Real fixture root boundary rejects sibling prefix-sharing directory ("fixture" vs "fixture-outside")', () => {
  const res = validateProject(makeSingleAssetProject('assets/images/sibling_prefix_escape.png'), {
    fixtureDir: FIXTURE_ROOT,
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.code === ERROR_CODES.SYMLINK_ESCAPE_DETECTED));
});

test('56. Strict verification order: fs.readFileSync is NEVER called before static path & symlink containment validation', (t) => {
  const readSpy = t.mock.method(fs, 'readFileSync');
  const invalidCandidates = [
    '../fixture-outside/outside_asset.png',
    'C:assets/images/ep1_p1.png',
    'assets\\images\\ep1_p1.png',
    String.fromCharCode(46, 101, 110, 118),
    'assets/images/ep1_p1.png%00.png',
    'assets/images/escape_direct.png',
    'assets/a/hop1.png',
    'assets/bounce_out/back/ep1_p1.png',
    'assets/images/sneaky_sensitive_link.png',
  ];

  for (const badPath of invalidCandidates) {
    assert.equal(generateExportManifest(makeSingleAssetProject(badPath), { fixtureDir: FIXTURE_ROOT }).ok, false);
    const craftedManifest = {
      manifestVersion: '1.0.0',
      schemaVersion: '1.0.0',
      assets: [{ id: 'as-1', type: 'image', normalizedPath: badPath, sizeBytes: 33, sha256: '0'.repeat(64) }],
      integrity: { algorithm: 'SHA-256', assetTreeHash: '0'.repeat(64), manifestContentHash: '0'.repeat(64) },
    };
    assert.equal(verifyExportManifest(craftedManifest, FIXTURE_ROOT).verified, false);
  }
  assert.equal(readSpy.mock.calls.length, 0);
});

test('57. verifyExportManifest rejects non-canonical normalizedPath and unsorted manifest.assets', () => {
  const baseRes = generateExportManifest(
    {
      schemaVersion: '1.0.0',
      project: { id: 'proj-sort', title: '정렬 검증' },
      episodes: [{ id: 'ep-1', projectId: 'proj-sort', title: '1화', order: 1 }],
      scenes: [{ id: 'sc-1', episodeId: 'ep-1', title: '1씬', order: 1 }],
      panels: [{ id: 'pn-1', sceneId: 'sc-1', title: '1컷', order: 1, assetIds: ['as-1', 'as-2'] }],
      assets: [
        { id: 'as-1', type: 'image', title: '컷1', relativePath: 'assets/images/ep1_p1.png' },
        { id: 'as-2', type: 'image', title: '컷2', relativePath: 'assets/images/ep1_p2.webp' },
      ],
    },
    { fixtureDir: FIXTURE_ROOT }
  );
  assert.equal(baseRes.ok, true);

  const unsortedManifest = JSON.parse(JSON.stringify(baseRes.manifest));
  unsortedManifest.assets.reverse();
  const unsortedCheck = verifyExportManifest(unsortedManifest, FIXTURE_ROOT);
  assert.equal(unsortedCheck.verified, false);
  assert.ok(unsortedCheck.errors.some((e) => e.code === ERROR_CODES.ARCHIVE_MANIFEST_INVALID));

  const unnormalizedManifest = JSON.parse(JSON.stringify(baseRes.manifest));
  unnormalizedManifest.assets[0].normalizedPath = './assets/images/ep1_p1.png';
  const unnormCheck = verifyExportManifest(unnormalizedManifest, FIXTURE_ROOT);
  assert.equal(unnormCheck.verified, false);
  assert.ok(unnormCheck.errors.some((e) => e.code === ERROR_CODES.INVALID_RELATIVE_PATH));
});

test('58. Determinism: StudioProjectGraphV1 produces identical manifest & SHA-256 across shuffled nodes, assetUsages, assets, and object keys', () => {
  const makeGraph = (reverseAll) => {
    const pnScope = { version: 1, projectId: 'proj:det:01', episodeId: 'ep:01', sceneId: 'sc:01', panelId: 'pn:01' };
    const nodes = [
      { version: 1, id: 'ep:01', kind: 'episode', parentId: null, scope: { version: 1, projectId: 'proj:det:01', episodeId: 'ep:01' }, label: '제1화', order: 1 },
      { version: 1, id: 'sc:01', kind: 'scene', parentId: 'ep:01', scope: { version: 1, projectId: 'proj:det:01', episodeId: 'ep:01', sceneId: 'sc:01' }, label: '장면 1', order: 1 },
      { version: 1, id: 'pn:01', kind: 'panel', parentId: 'sc:01', scope: pnScope, label: '패널 1', order: 1 },
    ];
    const assetUsages = [
      { version: 1, id: 'usage:01', assetId: 'as:img:1', assetRevisionId: 'rev:1', licenseGrantId: 'lic:1', scope: pnScope, insertedAt: '2026-11-10T00:00:00.000Z' },
      { version: 1, id: 'usage:02', assetId: 'as:img:2', assetRevisionId: 'rev:2', licenseGrantId: 'lic:1', scope: pnScope, insertedAt: '2026-11-10T00:00:00.000Z' },
    ];
    const assets = [
      { id: 'as:img:1', type: 'image', label: '이미지 1', displayPath: 'assets/images/ep1_p1.png' },
      { id: 'as:img:2', type: 'image', label: '이미지 2', displayPath: 'assets/images/ep1_p2.webp' },
    ];
    if (reverseAll) {
      nodes.reverse();
      assetUsages.reverse();
      assets.reverse();
      return { assets, assetUsages, nodes, title: '결정성 그래프 프로젝트', projectId: 'proj:det:01', version: 1 };
    }
    return { version: 1, projectId: 'proj:det:01', title: '결정성 그래프 프로젝트', nodes, assetUsages, assets };
  };

  const resA = generateExportManifest(makeGraph(false), { fixtureDir: FIXTURE_ROOT });
  const resB = generateExportManifest(makeGraph(true), { fixtureDir: FIXTURE_ROOT });
  assert.equal(resA.ok, true);
  assert.equal(resB.ok, true);
  assert.equal(canonicalJsonStringify(resA.manifest), canonicalJsonStringify(resB.manifest));
  assert.equal(resA.manifest.integrity.manifestContentHash, resB.manifest.integrity.manifestContentHash);
});

test('59. Determinism: NFD vs NFC metadata, timezone-equivalent createdAt, and supplementary Unicode code-point sorting', () => {
  const projNfc = makeSingleAssetProject('assets/images/ep1_p1.png');
  projNfc.project.title = '달빛 스튜디오'.normalize('NFC');
  projNfc.project.createdAt = '2026-11-10T00:00:00.000Z';
  projNfc.panels[0].dialogue = '안녕하세요 웹툰!'.normalize('NFC');

  const projNfd = makeSingleAssetProject('assets/images/ep1_p1.png');
  projNfd.project.title = '달빛 스튜디오'.normalize('NFD');
  projNfd.project.createdAt = '2026-11-10T09:00:00+09:00';
  projNfd.panels[0].dialogue = '안녕하세요 웹툰!'.normalize('NFD');

  const resNfc = generateExportManifest(projNfc, { fixtureDir: FIXTURE_ROOT });
  const resNfd = generateExportManifest(projNfd, { fixtureDir: FIXTURE_ROOT });
  assert.equal(resNfc.ok, true);
  assert.equal(resNfd.ok, true);
  assert.equal(resNfc.manifest.integrity.manifestContentHash, resNfd.manifest.integrity.manifestContentHash);
  assert.equal(canonicalJsonStringify(resNfc.manifest), canonicalJsonStringify(resNfd.manifest));

  assert.equal(compareStringsCodePoint('！', '🎨'), -1);
  assert.equal(compareStringsCodePoint('🎨', '！'), 1);
});

test('60. P1 Regression: Absolute symlink "${root}/escape-dir/../same.png" traversing escaping intermediate symlink is blocked', () => {
  const osRealAlias = fs.realpathSync.native(path.join(FIXTURE_ROOT, 'alias.png'));
  const osRealOutsideSame = fs.realpathSync.native(path.join(SIBLING_OUTSIDE_ROOT, 'same.png'));
  assert.equal(osRealAlias, osRealOutsideSame);
  assert.notEqual(
    computeFileSha256(path.join(FIXTURE_ROOT, 'same.png')),
    computeFileSha256(osRealOutsideSame)
  );

  const resolved = resolveSafeFixtureFilePath(FIXTURE_ROOT, 'alias.png');
  assert.equal(resolved.safe, false);
  assert.equal(resolved.code, ERROR_CODES.SYMLINK_ESCAPE_DETECTED);

  const genRes = generateExportManifest(makeSingleAssetProject('alias.png'), { fixtureDir: FIXTURE_ROOT });
  assert.equal(genRes.ok, false);
  assert.ok(genRes.validation.errors.some((e) => e.code === ERROR_CODES.SYMLINK_ESCAPE_DETECTED));
});

test('61. P1 Regression: Absolute symlink "${root}/missing/../same.png" fails with MISSING_ASSET_FILE while valid "${root}/valid-sub/../same.png" matches OS realpath', () => {
  const danglingResolved = resolveSafeFixtureFilePath(FIXTURE_ROOT, 'dangling.png');
  assert.equal(danglingResolved.safe, false);
  assert.equal(danglingResolved.code, ERROR_CODES.MISSING_ASSET_FILE);

  const validDotDot = resolveSafeFixtureFilePath(FIXTURE_ROOT, 'valid_abs_dotdot.png');
  assert.equal(validDotDot.safe, true);
  assert.equal(
    validDotDot.resolvedPath,
    fs.realpathSync.native(path.join(FIXTURE_ROOT, 'valid_abs_dotdot.png'))
  );
});

test('62. P1 Regression: Idempotent Unicode case folding catches "ß.png" vs "ẞ.png" vs "SS.PNG" and "ᾼ.png" vs "ᾳ.png"', () => {
  assert.equal(foldPathCase('ß.png'), 'ss.png');
  assert.equal(foldPathCase('ẞ.png'), 'ss.png');
  assert.equal(foldPathCase('SS.PNG'), 'ss.png');
  assert.equal(foldPathCase('ᾼ.png'), foldPathCase('ᾳ.png'));

  for (const verifyFiles of [false, true]) {
    const proj = {
      schemaVersion: '1.0.0',
      project: { id: 'proj-sharp-s', title: '유니코드 ß/ẞ 충돌 검증' },
      episodes: [{ id: 'ep-1', projectId: 'proj-sharp-s', title: '1화', order: 1 }],
      scenes: [{ id: 'sc-1', episodeId: 'ep-1', title: '1씬', order: 1 }],
      panels: [{ id: 'pn-1', sceneId: 'sc-1', title: '1컷', order: 1, assetIds: ['a-lower', 'a-upper'] }],
      assets: [
        { id: 'a-lower', type: 'image', title: '소문자 에스체트', relativePath: 'assets/images/ß.png' },
        { id: 'a-upper', type: 'image', title: '대문자 에스체트', relativePath: 'assets/images/ẞ.png' },
      ],
    };
    const res = validateProject(proj, { fixtureDir: FIXTURE_ROOT, verifyFiles });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.code === ERROR_CODES.NORMALIZATION_COLLISION_CASE));
  }
});

test('63. P2 Regression: Timezone-less createdAt is rejected identically and explicit-TZ createdAt yields identical SHA across TZ=UTC and TZ=Asia/Seoul', () => {
  for (const invalidTs of ['2026-11-10T09:00:00', '2026-11-10', '2026-02-30T00:00:00Z', '   ']) {
    const proj = makeSingleAssetProject('assets/images/ep1_p1.png');
    proj.project.createdAt = invalidTs;
    const res = validateProject(proj, { fixtureDir: FIXTURE_ROOT, verifyFiles: false });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.code === ERROR_CODES.INVALID_PROJECT_TIMESTAMP));
  }

  const probeScript = `
    import { generateExportManifest } from ${JSON.stringify(INDEX_MODULE_URL)};
    const base = ${JSON.stringify(makeSingleAssetProject('assets/images/ep1_p1.png'))};
    base.assets[0].expectedSha256 = '4ffd8bb30991e3a6f28d1d03f1aedcd02ccf8e0cc16bb9e969e7bc2bda1ddf03';
    const noTz = structuredClone(base);
    noTz.project.createdAt = '2026-11-10T09:00:00';
    const resNoTz = generateExportManifest(noTz, { verifyFiles: false });
    const withOffset = structuredClone(base);
    withOffset.project.createdAt = '2026-11-10T09:00:00+09:00';
    const resOffset = generateExportManifest(withOffset, { verifyFiles: false });
    process.stdout.write(JSON.stringify({
      noTzOk: resNoTz.ok,
      noTzCodes: resNoTz.validation.errors.map((e) => e.code),
      offsetOk: resOffset.ok,
      offsetHash: resOffset.manifest?.integrity?.manifestContentHash,
      offsetCreatedAt: resOffset.manifest?.studioArchiveManifest?.createdAt,
    }));
  `;

  const runWithTz = (tz) =>
    JSON.parse(
      childProcess.execFileSync(process.execPath, ['--input-type=module', '-e', probeScript], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      })
    );

  const outUtc = runWithTz('UTC');
  const outSeoul = runWithTz('Asia/Seoul');

  assert.equal(outUtc.noTzOk, false);
  assert.equal(outSeoul.noTzOk, false);
  assert.deepEqual(outUtc.noTzCodes, [ERROR_CODES.INVALID_PROJECT_TIMESTAMP]);
  assert.deepEqual(outSeoul.noTzCodes, [ERROR_CODES.INVALID_PROJECT_TIMESTAMP]);
  assert.equal(outUtc.offsetOk, true);
  assert.equal(outSeoul.offsetOk, true);
  assert.equal(outUtc.offsetCreatedAt, '2026-11-10T00:00:00.000Z');
  assert.equal(outUtc.offsetHash, outSeoul.offsetHash);
});

test('64. Barrier Regression: Duplicate/colliding asset paths and mixed valid+escaping assets perform 0 fs.readFileSync calls even for the first asset', (t) => {
  const readSpy = t.mock.method(fs, 'readFileSync');
  const multiAssetScenarios = [
    ['assets/images/ep1_p1.png', 'assets/images/ep1_p1.png'],
    ['assets/images/ß.png', 'assets/images/ẞ.png'],
    ['assets/images/ep1_p1.png', 'alias.png'],
  ];

  for (const [firstPath, secondPath] of multiAssetScenarios) {
    const proj = {
      schemaVersion: '1.0.0',
      project: { id: 'proj-barrier', title: '배리어 검증', createdAt: '2026-11-10T00:00:00.000Z' },
      episodes: [{ id: 'ep-1', projectId: 'proj-barrier', title: '1화', order: 1 }],
      scenes: [{ id: 'sc-1', episodeId: 'ep-1', title: '1씬', order: 1 }],
      panels: [{ id: 'pn-1', sceneId: 'sc-1', title: '1컷', order: 1, assetIds: ['as-1', 'as-2'] }],
      assets: [
        { id: 'as-1', type: 'image', title: '첫 에셋', relativePath: firstPath },
        { id: 'as-2', type: 'image', title: '둘째 에셋', relativePath: secondPath },
      ],
    };
    assert.equal(generateExportManifest(proj, { fixtureDir: FIXTURE_ROOT }).ok, false);

    const craftedManifest = {
      manifestVersion: '1.0.0',
      schemaVersion: '1.0.0',
      assets: [
        { id: 'as-1', type: 'image', normalizedPath: firstPath, sizeBytes: 33, sha256: '0'.repeat(64) },
        { id: 'as-2', type: 'image', normalizedPath: secondPath, sizeBytes: 33, sha256: '0'.repeat(64) },
      ],
      integrity: { algorithm: 'SHA-256', assetTreeHash: '0'.repeat(64), manifestContentHash: '0'.repeat(64) },
    };
    assert.equal(verifyExportManifest(craftedManifest, FIXTURE_ROOT).verified, false);
  }
  assert.equal(readSpy.mock.calls.length, 0);
});
