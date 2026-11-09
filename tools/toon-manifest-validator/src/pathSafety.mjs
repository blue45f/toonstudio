import path from 'node:path';
import fs from 'node:fs';
import {
  ALLOWED_EXTENSIONS_BY_TYPE,
  ALL_ALLOWED_EXTENSIONS,
  SENSITIVE_PATH_PATTERNS,
  ERROR_CODES,
} from './schema.mjs';

/**
 * Inspects and normalizes a relative asset path without touching the filesystem first,
 * enforcing ToonStudio's safePath rules (`studio-archive-manifest.ts` & `studio-publishing-package.ts`)
 * plus Unicode NFC, case-collision, traversal, and sensitive file exclusion.
 */
export function inspectAndNormalizeAssetPath(rawPath, assetType) {
  const issues = [];

  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    issues.push({
      code: ERROR_CODES.EMPTY_ASSET_PATH,
      message: 'Asset relativePath must be a non-empty string.',
    });
    return { valid: false, issues, normalizedPath: null, canonicalKey: null, extension: null };
  }

  // 1. Null byte check
  if (rawPath.includes('\0') || /%00/i.test(rawPath)) {
    issues.push({
      code: ERROR_CODES.UNSAFE_NULL_BYTE,
      message: `Null byte detected in path "${rawPath}".`,
    });
  }

  // 2. Reject URL schemes (http://, https://, file://, data:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawPath) || /^data:/i.test(rawPath)) {
    issues.push({
      code: ERROR_CODES.UNSAFE_URI_SCHEME,
      message: `URI schemes are not allowed in relative asset path "${rawPath}".`,
    });
  }

  // 3. Reject Windows drive letters (C:\ or C:/), UNC paths (\\server\share), or leading slash (/etc/passwd)
  if (
    /^[a-zA-Z]:[\\/]/.test(rawPath) ||
    /^[a-zA-Z]:$/.test(rawPath) ||
    /^\\\\/.test(rawPath) ||
    rawPath.startsWith('/') ||
    rawPath.startsWith('\\')
  ) {
    issues.push({
      code: ERROR_CODES.UNSAFE_ABSOLUTE_PATH,
      message: `Absolute or drive-rooted path is not allowed: "${rawPath}".`,
    });
  }

  // 4. Decode URL-encoded traversal checks (e.g., %2e%2e, %2f, %5c)
  let decodedForCheck = rawPath;
  try {
    decodedForCheck = decodeURIComponent(rawPath);
  } catch {
    // Keep rawPath if malformed percent encoding
  }
  if (
    /(^|[\\/])\.\.([\\/]|$)/.test(rawPath) ||
    /(^|[\\/])\.\.([\\/]|$)/.test(decodedForCheck) ||
    /%2e%2e/i.test(rawPath) ||
    /\.\.[\\/]/.test(rawPath)
  ) {
    issues.push({
      code: ERROR_CODES.PATH_TRAVERSAL_DETECTED,
      message: `Path traversal sequence ("..") detected in "${rawPath}".`,
    });
  }

  // 5. Reject trailing slash or dot-only segments
  if (rawPath.endsWith('/') || rawPath.endsWith('\\') || rawPath.trim() === '.') {
    issues.push({
      code: ERROR_CODES.INVALID_RELATIVE_PATH,
      message: `Path must point to a file, not a directory: "${rawPath}".`,
    });
  }

  // Convert backslashes to forward slashes and collapse redundant slashes for canonical comparison
  const slashConverted = rawPath.replace(/\\/g, '/');
  const hadBackslash = rawPath.includes('\\');
  const hadDoubleSlash = /\/\/+/.test(slashConverted);
  const hadLeadingDotSlash = slashConverted.startsWith('./');

  // Split segments and inspect "." segments inside path
  const rawSegments = slashConverted.split('/').filter((seg, idx) => !(idx === 0 && seg === '.'));
  if (rawSegments.some((seg) => seg === '.' || seg === '..' || seg.trim() === '')) {
    if (!issues.some((i) => i.code === ERROR_CODES.PATH_TRAVERSAL_DETECTED)) {
      issues.push({
        code: ERROR_CODES.INVALID_RELATIVE_PATH,
        message: `Path contains empty or dot segments: "${rawPath}".`,
      });
    }
  }

  const nfcPath = rawSegments.join('/').normalize('NFC');
  const nfdPath = rawSegments.join('/').normalize('NFD');
  const wasNfd = rawSegments.join('/') !== nfcPath && rawSegments.join('/') === nfdPath;

  // Canonical collision key: NFC + lowercase
  const canonicalKey = nfcPath.toLowerCase();

  // 6. Sensitive / secret file pattern check
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(nfcPath) || pattern.test(rawPath)) {
      issues.push({
        code: ERROR_CODES.SENSITIVE_FILE_REJECTED,
        message: `Sensitive or credential file path is strictly prohibited: "${rawPath}".`,
      });
      break;
    }
  }

  // 7. Extension & asset type validation
  const ext = path.posix.extname(nfcPath).toLowerCase();
  const knownTypes = Object.keys(ALLOWED_EXTENSIONS_BY_TYPE);
  if (!knownTypes.includes(assetType)) {
    issues.push({
      code: ERROR_CODES.UNKNOWN_ASSET_TYPE,
      message: `Unknown asset type "${assetType}". Allowed types: ${knownTypes.join(', ')}.`,
    });
  } else if (!ext || !ALL_ALLOWED_EXTENSIONS.includes(ext)) {
    issues.push({
      code: ERROR_CODES.UNSUPPORTED_EXTENSION,
      message: `Extension "${ext || '(none)'}" in "${rawPath}" is not supported.`,
    });
  } else {
    const allowedForType = ALLOWED_EXTENSIONS_BY_TYPE[assetType];
    if (!allowedForType.includes(ext)) {
      issues.push({
        code: ERROR_CODES.ASSET_TYPE_EXTENSION_MISMATCH,
        message: `Extension "${ext}" is not valid for asset type "${assetType}" (expected one of: ${allowedForType.join(', ')}).`,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    rawPath,
    normalizedPath: nfcPath,
    canonicalKey,
    extension: ext,
    normalizationMeta: {
      wasNfd,
      hadBackslash,
      hadDoubleSlash,
      hadLeadingDotSlash,
      hadUppercase: nfcPath !== canonicalKey,
    },
  };
}

/**
 * Safely resolves a normalized relative path inside an explicit fixture root directory.
 * Never walks arbitrary directories; checks lexical containment and realpath symlink containment.
 */
export function resolveSafeFixtureFilePath(fixtureDir, normalizedRelativePath) {
  const resolvedRoot = path.resolve(fixtureDir);
  const candidatePath = path.resolve(resolvedRoot, normalizedRelativePath);

  const relativeFromRoot = path.relative(resolvedRoot, candidatePath);
  if (
    relativeFromRoot.startsWith('..') ||
    path.isAbsolute(relativeFromRoot) ||
    relativeFromRoot === ''
  ) {
    return {
      safe: false,
      code: ERROR_CODES.PATH_OUTSIDE_FIXTURE_ROOT,
      message: `Resolved path escapes fixture root directory: "${normalizedRelativePath}".`,
      resolvedPath: null,
    };
  }

  let lstat;
  try {
    lstat = fs.lstatSync(candidatePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return {
        safe: false,
        code: ERROR_CODES.MISSING_ASSET_FILE,
        message: `Asset file does not exist in fixture directory: "${normalizedRelativePath}".`,
        resolvedPath: candidatePath,
      };
    }
    return {
      safe: false,
      code: ERROR_CODES.MISSING_ASSET_FILE,
      message: `Unable to stat asset file "${normalizedRelativePath}": ${err.message}`,
      resolvedPath: candidatePath,
    };
  }

  const realRoot = fs.realpathSync(resolvedRoot);
  let realCandidate;
  try {
    realCandidate = fs.realpathSync(candidatePath);
  } catch {
    return {
      safe: false,
      code: ERROR_CODES.MISSING_ASSET_FILE,
      message: `Broken symlink or unreadable target for "${normalizedRelativePath}".`,
      resolvedPath: candidatePath,
    };
  }

  const realRelative = path.relative(realRoot, realCandidate);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative) || realRelative === '') {
    return {
      safe: false,
      code: ERROR_CODES.SYMLINK_ESCAPE_DETECTED,
      message: `Symlink target for "${normalizedRelativePath}" escapes fixture root.`,
      resolvedPath: candidatePath,
    };
  }

  const stat = fs.statSync(realCandidate);
  if (!stat.isFile()) {
    return {
      safe: false,
      code: ERROR_CODES.NOT_A_REGULAR_FILE,
      message: `Asset target "${normalizedRelativePath}" is not a regular file.`,
      resolvedPath: realCandidate,
    };
  }

  if (stat.size === 0) {
    return {
      safe: false,
      code: ERROR_CODES.EMPTY_ASSET_FILE,
      message: `Asset file "${normalizedRelativePath}" is empty (0 bytes).`,
      resolvedPath: realCandidate,
    };
  }

  return {
    safe: true,
    code: null,
    message: null,
    resolvedPath: realCandidate,
    sizeBytes: stat.size,
    isSymlink: lstat.isSymbolicLink(),
  };
}
