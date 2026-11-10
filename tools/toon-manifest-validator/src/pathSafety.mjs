import path from 'node:path';
import fs from 'node:fs';
import {
  ALLOWED_EXTENSIONS_BY_TYPE,
  ALL_ALLOWED_EXTENSIONS,
  SENSITIVE_PATH_PATTERNS,
  ERROR_CODES,
} from './schema.mjs';

const MAX_SYMLINK_HOPS = 32;
const WINDOWS_RESERVED_DEVICE_RE =
  /^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(\..*)?$/iu;

/**
 * Checks ASCII C0/DEL control characters (0x01..0x1F, 0x7F) without control-regex literals.
 */
function hasAsciiControlChar(value) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code >= 0x01 && code <= 0x1f) || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Idempotent, locale-independent Unicode case folding on NFC text.
 * Iterates to a fixed point so multi-step pairs such as German `ẞ` -> `ß` -> `ss`
 * and Greek prosgegrammeni `ᾼ` -> `ᾳ` -> `αι` converge to the exact same key
 * as `ß`/`SS` and `ᾳ`/`ΑΙ`.
 */
export function foldPathCase(value) {
  let current = String(value).normalize('NFC');
  for (let i = 0; i < 4; i++) {
    const next = current.toUpperCase().toLowerCase().normalize('NFC');
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Tolerant percent-byte decoder: decodes valid %XX UTF-8 sequences without throwing on
 * literal '%' in legitimate filenames (e.g., "100%_zoom.png", "+50% @2x.png").
 */
function decodePercentOnceTolerant(input) {
  return input.replace(/(?:%[0-9a-fA-F]{2})+/g, (match) => {
    const bytes = [];
    for (let i = 0; i < match.length; i += 3) {
      bytes.push(Number.parseInt(match.slice(i + 1, i + 3), 16));
    }
    return Buffer.from(bytes).toString('utf8');
  });
}

function hasParentDotSegment(candidate) {
  return candidate.split(/[\\/]/).some((seg) => seg === '..' || seg.trimEnd() === '..');
}

function isStrictlyInsideRoot(rootDir, candidatePath) {
  const rel = path.relative(rootDir, candidatePath);
  return (
    rel !== '' &&
    rel !== '.' &&
    rel !== '..' &&
    !rel.startsWith(`..${path.sep}`) &&
    !rel.startsWith('../') &&
    !path.isAbsolute(rel)
  );
}

function isSameOrInsideRoot(rootDir, candidatePath) {
  return candidatePath === rootDir || isStrictlyInsideRoot(rootDir, candidatePath);
}

function matchesSensitivePattern(candidate) {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(candidate));
}

/**
 * Inspects and normalizes a relative asset path purely in memory (zero filesystem calls),
 * enforcing ToonStudio's safePath rules (`studio-archive-manifest.ts` & `studio-publishing-package.ts`),
 * Windows/UNC/drive/device safety, backslash/dot/encoding/NUL checks, Unicode NFC, and sensitive file exclusion.
 */
export function inspectAndNormalizeAssetPath(rawPath, assetType) {
  const issues = [];
  const pushIssueOnce = (code, message) => {
    if (!issues.some((i) => i.code === code)) {
      issues.push({ code, message });
    }
  };

  if (typeof rawPath !== 'string' || rawPath.trim().length === 0) {
    pushIssueOnce(ERROR_CODES.EMPTY_ASSET_PATH, 'Asset relativePath must be a non-empty string.');
    return { valid: false, issues, normalizedPath: null, canonicalKey: null, extension: null };
  }

  const decodedPass1 = decodePercentOnceTolerant(rawPath);
  const decodedPass2 = decodePercentOnceTolerant(decodedPass1);
  const trimmedRaw = rawPath.trim();
  const trimmedDecoded = decodedPass2.trim();

  // 1. Null byte & control character checks (raw, single-encoded, double-encoded)
  if (
    rawPath.includes('\0') ||
    decodedPass1.includes('\0') ||
    decodedPass2.includes('\0') ||
    /%00/i.test(rawPath) ||
    /%2500/i.test(rawPath)
  ) {
    pushIssueOnce(ERROR_CODES.UNSAFE_NULL_BYTE, `Null byte detected in path "${rawPath}".`);
  }

  if (
    hasAsciiControlChar(rawPath) ||
    hasAsciiControlChar(decodedPass1) ||
    hasAsciiControlChar(decodedPass2)
  ) {
    pushIssueOnce(
      ERROR_CODES.INVALID_RELATIVE_PATH,
      `Control characters are not allowed in asset path "${rawPath}".`
    );
  }

  // 2. Reject Windows drive prefixes (C:\, C:/, C:relative, C:), UNC (\\server\share, //server/share),
  //    Win32 device namespaces (\\?\, \\.\), and POSIX/Windows root-leading slashes (/..., \...),
  //    including whitespace-padded or percent-encoded forms.
  const isDriveOrRooted = (str) =>
    /^[a-zA-Z]:/.test(str) ||
    /^\\\\/.test(str) ||
    str.startsWith('/') ||
    str.startsWith('\\');

  if (
    isDriveOrRooted(rawPath) ||
    isDriveOrRooted(trimmedRaw) ||
    isDriveOrRooted(decodedPass1) ||
    isDriveOrRooted(trimmedDecoded)
  ) {
    pushIssueOnce(
      ERROR_CODES.UNSAFE_ABSOLUTE_PATH,
      `Absolute, UNC, or drive-prefixed path is not allowed: "${rawPath}".`
    );
  } else if (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedRaw) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmedDecoded)
  ) {
    // 3. Reject URI schemes (https://, file:///..., file:/..., data:, custom-scheme://, etc.)
    pushIssueOnce(
      ERROR_CODES.UNSAFE_URI_SCHEME,
      `URI schemes are not allowed in relative asset path "${rawPath}".`
    );
  }

  // 4. Reject parent traversal ("..") across raw, backslash, Win32 trailing-space, and 1x/2x encoded forms
  if (
    hasParentDotSegment(rawPath) ||
    hasParentDotSegment(decodedPass1) ||
    hasParentDotSegment(decodedPass2)
  ) {
    pushIssueOnce(
      ERROR_CODES.PATH_TRAVERSAL_DETECTED,
      `Path traversal sequence ("..") detected in "${rawPath}".`
    );
  }

  // 5. Reject leading/trailing whitespace on path, trailing slash, encoded path separators (%2f, %5c),
  //    backslashes, colons (NTFS ADS), dot segments, Windows reserved device names, and trailing dot/space segments
  if (rawPath !== trimmedRaw) {
    pushIssueOnce(
      ERROR_CODES.INVALID_RELATIVE_PATH,
      `Leading or trailing whitespace is not allowed in relative path: "${rawPath}".`
    );
  }

  if (rawPath.endsWith('/') || rawPath.endsWith('\\') || trimmedRaw === '.') {
    pushIssueOnce(
      ERROR_CODES.INVALID_RELATIVE_PATH,
      `Path must point to a file, not a directory: "${rawPath}".`
    );
  }

  if (/%2f|%5c/i.test(rawPath) || /%2f|%5c/i.test(decodedPass1)) {
    if (
      !issues.some(
        (i) =>
          i.code === ERROR_CODES.PATH_TRAVERSAL_DETECTED ||
          i.code === ERROR_CODES.UNSAFE_ABSOLUTE_PATH
      )
    ) {
      pushIssueOnce(
        ERROR_CODES.INVALID_RELATIVE_PATH,
        `Percent-encoded path separators are not allowed: "${rawPath}".`
      );
    }
  }

  const slashConverted = rawPath.replace(/\\/g, '/');
  const hadBackslash = rawPath.includes('\\');
  const hadDoubleSlash = /\/\/+/.test(slashConverted);
  const hadLeadingDotSlash =
    rawPath.startsWith('./') && !rawPath.startsWith('././') && !rawPath.startsWith('.//');

  if (
    hadBackslash &&
    !issues.some(
      (i) =>
        i.code === ERROR_CODES.PATH_TRAVERSAL_DETECTED ||
        i.code === ERROR_CODES.UNSAFE_ABSOLUTE_PATH
    )
  ) {
    pushIssueOnce(
      ERROR_CODES.INVALID_RELATIVE_PATH,
      `Backslash path separator is not allowed in relative path: "${rawPath}".`
    );
  }

  if (
    (rawPath.includes(':') || decodedPass2.includes(':')) &&
    !issues.some(
      (i) =>
        i.code === ERROR_CODES.UNSAFE_ABSOLUTE_PATH ||
        i.code === ERROR_CODES.UNSAFE_URI_SCHEME
    )
  ) {
    pushIssueOnce(
      ERROR_CODES.INVALID_RELATIVE_PATH,
      `Colon character (NTFS stream or drive syntax) is not allowed in relative path: "${rawPath}".`
    );
  }

  const rawParts = slashConverted.split('/');
  const strippedParts = hadLeadingDotSlash ? rawParts.slice(1) : rawParts;

  const decodedSlash = (hadLeadingDotSlash ? decodedPass2.slice(2) : decodedPass2).replace(
    /\\/g,
    '/'
  );
  const decodedParts = decodedSlash.split('/');

  if (
    strippedParts.length === 0 ||
    strippedParts.some((seg) => seg === '' || seg === '.' || seg === '..') ||
    decodedParts.some((seg) => seg === '.' || seg === '..')
  ) {
    if (!issues.some((i) => i.code === ERROR_CODES.PATH_TRAVERSAL_DETECTED)) {
      pushIssueOnce(
        ERROR_CODES.INVALID_RELATIVE_PATH,
        `Path contains empty or dot segments: "${rawPath}".`
      );
    }
  }

  for (const seg of strippedParts) {
    if (!seg) continue;
    if (seg !== seg.trim() || seg.endsWith('.')) {
      if (!issues.some((i) => i.code === ERROR_CODES.PATH_TRAVERSAL_DETECTED)) {
        pushIssueOnce(
          ERROR_CODES.INVALID_RELATIVE_PATH,
          `Path segment "${seg}" has unsafe leading/trailing whitespace or trailing dot in "${rawPath}".`
        );
      }
      break;
    }
    const decodedSeg = decodePercentOnceTolerant(decodePercentOnceTolerant(seg)).normalize('NFC');
    if (WINDOWS_RESERVED_DEVICE_RE.test(seg) || WINDOWS_RESERVED_DEVICE_RE.test(decodedSeg)) {
      pushIssueOnce(
        ERROR_CODES.INVALID_RELATIVE_PATH,
        `Windows reserved device name "${seg}" is not allowed in "${rawPath}".`
      );
      break;
    }
  }

  const nonEmptySegments = strippedParts.filter((seg) => seg !== '' && seg !== '.');
  const joinedForNorm = nonEmptySegments.join('/');
  const nfcPath = joinedForNorm.normalize('NFC');
  const nfdPath = joinedForNorm.normalize('NFD');
  const wasNfd = joinedForNorm !== nfcPath && joinedForNorm === nfdPath;
  const canonicalKey = foldPathCase(nfcPath);

  // 6. Sensitive / secret file pattern check (raw, NFC, and decoded forms)
  const decodedNfc = decodedParts.filter(Boolean).join('/').normalize('NFC');
  if (
    matchesSensitivePattern(nfcPath) ||
    matchesSensitivePattern(slashConverted) ||
    matchesSensitivePattern(decodedNfc)
  ) {
    pushIssueOnce(
      ERROR_CODES.SENSITIVE_FILE_REJECTED,
      `Sensitive or credential file path is strictly prohibited: "${rawPath}".`
    );
  }

  // 7. Extension & asset type validation
  const ext = path.posix.extname(nfcPath).toLowerCase();
  const knownTypes = Object.keys(ALLOWED_EXTENSIONS_BY_TYPE);
  if (!knownTypes.includes(assetType)) {
    pushIssueOnce(
      ERROR_CODES.UNKNOWN_ASSET_TYPE,
      `Unknown asset type "${assetType}". Allowed types: ${knownTypes.join(', ')}.`
    );
  } else if (!ext || !ALL_ALLOWED_EXTENSIONS.includes(ext)) {
    pushIssueOnce(
      ERROR_CODES.UNSUPPORTED_EXTENSION,
      `Extension "${ext || '(none)'}" in "${rawPath}" is not supported.`
    );
  } else {
    const allowedForType = ALLOWED_EXTENSIONS_BY_TYPE[assetType];
    if (!allowedForType.includes(ext)) {
      pushIssueOnce(
        ERROR_CODES.ASSET_TYPE_EXTENSION_MISMATCH,
        `Extension "${ext}" is not valid for asset type "${assetType}" (expected one of: ${allowedForType.join(', ')}).`
      );
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
 * Walks path segments hop-by-hop from `realRoot` using `lstatSync` + `readlinkSync` WITHOUT
 * lexically collapsing `..` in symlink targets beforehand, matching OS kernel path resolution
 * while guaranteeing no intermediate or final hop ever escapes `realRoot`.
 */
export function resolveSafeFixtureFilePath(fixtureDir, normalizedRelativePath) {
  if (
    typeof fixtureDir !== 'string' ||
    fixtureDir.trim().length === 0 ||
    typeof normalizedRelativePath !== 'string' ||
    normalizedRelativePath.length === 0
  ) {
    return {
      safe: false,
      code: ERROR_CODES.INVALID_RELATIVE_PATH,
      message: `Invalid fixture root or relative path "${normalizedRelativePath}".`,
      resolvedPath: null,
    };
  }

  if (
    normalizedRelativePath.includes('\0') ||
    normalizedRelativePath.includes('\\') ||
    normalizedRelativePath.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalizedRelativePath)
  ) {
    return {
      safe: false,
      code: ERROR_CODES.PATH_OUTSIDE_FIXTURE_ROOT,
      message: `Unsafe non-normalized path rejected before filesystem access: "${normalizedRelativePath}".`,
      resolvedPath: null,
    };
  }

  const initialSegments = normalizedRelativePath.split('/');
  if (initialSegments.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return {
      safe: false,
      code: initialSegments.includes('..')
        ? ERROR_CODES.PATH_OUTSIDE_FIXTURE_ROOT
        : ERROR_CODES.INVALID_RELATIVE_PATH,
      message: `Relative path contains invalid segments: "${normalizedRelativePath}".`,
      resolvedPath: null,
    };
  }

  const resolvedRoot = path.resolve(fixtureDir);
  const lexicalCandidate = path.resolve(resolvedRoot, normalizedRelativePath);
  if (!isStrictlyInsideRoot(resolvedRoot, lexicalCandidate)) {
    return {
      safe: false,
      code: ERROR_CODES.PATH_OUTSIDE_FIXTURE_ROOT,
      message: `Resolved path escapes fixture root directory: "${normalizedRelativePath}".`,
      resolvedPath: null,
    };
  }

  let realRoot;
  try {
    realRoot = fs.realpathSync(resolvedRoot);
    const rootStat = fs.statSync(realRoot);
    if (!rootStat.isDirectory()) {
      return {
        safe: false,
        code: ERROR_CODES.PATH_OUTSIDE_FIXTURE_ROOT,
        message: `Fixture root is not a directory: "${fixtureDir}".`,
        resolvedPath: null,
      };
    }
  } catch (err) {
    return {
      safe: false,
      code: ERROR_CODES.MISSING_ASSET_FILE,
      message: `Fixture root directory is unavailable: "${fixtureDir}" (${err.message}).`,
      resolvedPath: null,
    };
  }

  const realPrefix = realRoot === '/' ? '/' : `${realRoot}/`;
  const resolvedPrefix = resolvedRoot === '/' ? '/' : `${resolvedRoot}/`;

  let currentDir = realRoot;
  const queue = [...initialSegments];
  let symlinkHops = 0;
  let encounteredSymlink = false;

  while (queue.length > 0) {
    const seg = queue.shift();
    if (seg === '' || seg === '.') {
      continue;
    }

    if (seg === '..') {
      if (currentDir === realRoot) {
        return {
          safe: false,
          code: ERROR_CODES.SYMLINK_ESCAPE_DETECTED,
          message: `Symlink target for "${normalizedRelativePath}" escapes fixture root.`,
          resolvedPath: null,
        };
      }
      const parentDir = path.dirname(currentDir);
      if (!isSameOrInsideRoot(realRoot, parentDir)) {
        return {
          safe: false,
          code: ERROR_CODES.SYMLINK_ESCAPE_DETECTED,
          message: `Symlink target for "${normalizedRelativePath}" escapes fixture root.`,
          resolvedPath: null,
        };
      }
      currentDir = parentDir;
      continue;
    }

    const nextPath = path.join(currentDir, seg);
    if (!isStrictlyInsideRoot(realRoot, nextPath)) {
      return {
        safe: false,
        code: encounteredSymlink
          ? ERROR_CODES.SYMLINK_ESCAPE_DETECTED
          : ERROR_CODES.PATH_OUTSIDE_FIXTURE_ROOT,
        message: `Resolved path for "${normalizedRelativePath}" escapes fixture root.`,
        resolvedPath: null,
      };
    }

    let lstat;
    try {
      lstat = fs.lstatSync(nextPath);
    } catch (err) {
      return {
        safe: false,
        code: ERROR_CODES.MISSING_ASSET_FILE,
        message:
          err && err.code === 'ENOENT'
            ? `Asset file does not exist in fixture directory: "${normalizedRelativePath}".`
            : `Unable to stat asset file "${normalizedRelativePath}": ${err.message}`,
        resolvedPath: nextPath,
      };
    }

    if (lstat.isSymbolicLink()) {
      encounteredSymlink = true;
      symlinkHops += 1;
      if (symlinkHops > MAX_SYMLINK_HOPS) {
        return {
          safe: false,
          code: ERROR_CODES.SYMLINK_ESCAPE_DETECTED,
          message: `Symlink loop or excessive symlink depth (>${MAX_SYMLINK_HOPS}) detected for "${normalizedRelativePath}".`,
          resolvedPath: nextPath,
        };
      }

      let rawTarget;
      try {
        rawTarget = fs.readlinkSync(nextPath);
      } catch (err) {
        return {
          safe: false,
          code: ERROR_CODES.MISSING_ASSET_FILE,
          message: `Unable to read symlink for "${normalizedRelativePath}": ${err.message}`,
          resolvedPath: nextPath,
        };
      }

      if (
        !rawTarget ||
        rawTarget.includes('\0') ||
        rawTarget.includes('\\') ||
        /^[a-zA-Z]:/.test(rawTarget)
      ) {
        return {
          safe: false,
          code: ERROR_CODES.SYMLINK_ESCAPE_DETECTED,
          message: `Unsafe symlink target "${rawTarget}" for "${normalizedRelativePath}".`,
          resolvedPath: nextPath,
        };
      }

      if (path.isAbsolute(rawTarget)) {
        // Never collapse "." or ".." lexically with path.resolve/normalize before walking disk entries:
        // intermediate symlinks (`escape-dir/..`) and missing directories (`missing/..`) must be
        // traversed segment-by-segment just like OS kernel path resolution.
        const collapsedTarget = rawTarget.replace(/\/+/g, '/');
        let rawSuffix = null;

        if (collapsedTarget === realRoot || collapsedTarget === realPrefix) {
          rawSuffix = '';
        } else if (collapsedTarget.startsWith(realPrefix)) {
          rawSuffix = collapsedTarget.slice(realPrefix.length);
        } else if (
          resolvedRoot !== realRoot &&
          (collapsedTarget === resolvedRoot || collapsedTarget === resolvedPrefix)
        ) {
          rawSuffix = '';
        } else if (resolvedRoot !== realRoot && collapsedTarget.startsWith(resolvedPrefix)) {
          rawSuffix = collapsedTarget.slice(resolvedPrefix.length);
        }

        if (rawSuffix === null) {
          return {
            safe: false,
            code: ERROR_CODES.SYMLINK_ESCAPE_DETECTED,
            message: `Symlink target for "${normalizedRelativePath}" escapes fixture root.`,
            resolvedPath: nextPath,
          };
        }

        currentDir = realRoot;
        if (rawSuffix.length > 0) {
          queue.unshift(...rawSuffix.split('/'));
        }
      } else {
        const collapsedRel = rawTarget.replace(/\/+/g, '/');
        queue.unshift(...collapsedRel.split('/'));
      }
      continue;
    }

    if (queue.length > 0) {
      if (!lstat.isDirectory()) {
        return {
          safe: false,
          code: ERROR_CODES.MISSING_ASSET_FILE,
          message: `Intermediate path component "${seg}" is not a directory in "${normalizedRelativePath}".`,
          resolvedPath: nextPath,
        };
      }
      currentDir = nextPath;
      continue;
    }

    const resolvedRelPosix = path
      .relative(realRoot, nextPath)
      .split(path.sep)
      .join('/')
      .normalize('NFC');
    if (matchesSensitivePattern(resolvedRelPosix)) {
      return {
        safe: false,
        code: ERROR_CODES.SENSITIVE_FILE_REJECTED,
        message: `Resolved target "${resolvedRelPosix}" for "${normalizedRelativePath}" is a prohibited sensitive file.`,
        resolvedPath: nextPath,
      };
    }

    if (!lstat.isFile()) {
      return {
        safe: false,
        code: ERROR_CODES.NOT_A_REGULAR_FILE,
        message: `Asset target "${normalizedRelativePath}" is not a regular file.`,
        resolvedPath: nextPath,
      };
    }

    if (lstat.size === 0) {
      return {
        safe: false,
        code: ERROR_CODES.EMPTY_ASSET_FILE,
        message: `Asset file "${normalizedRelativePath}" is empty (0 bytes).`,
        resolvedPath: nextPath,
      };
    }

    return {
      safe: true,
      code: null,
      message: null,
      resolvedPath: nextPath,
      sizeBytes: lstat.size,
      isSymlink: encounteredSymlink,
    };
  }

  return {
    safe: false,
    code: ERROR_CODES.NOT_A_REGULAR_FILE,
    message: `Asset target "${normalizedRelativePath}" resolved to a directory instead of a file.`,
    resolvedPath: currentDir,
  };
}
