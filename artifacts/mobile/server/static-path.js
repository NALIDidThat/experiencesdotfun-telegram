const fs = require('fs');
const path = require('path');

function isWithinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`));
}

function safeStaticPath(pathname, { staticRoot, basePath = '' } = {}) {
  if (typeof pathname !== 'string' || typeof staticRoot !== 'string') {
    return null;
  }

  const root = path.resolve(staticRoot);
  const mountedAt = basePath.replace(/\/+$/, '');
  let requestPath = pathname;

  if (mountedAt) {
    if (pathname === mountedAt) {
      requestPath = '/';
    } else if (pathname.startsWith(`${mountedAt}/`)) {
      requestPath = pathname.slice(mountedAt.length);
    } else {
      return null;
    }
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  let candidate;
  try {
    candidate = path.resolve(root, decodedPath.replace(/^\/+/, ''));
  } catch {
    return null;
  }

  if (!isWithinRoot(root, candidate)) {
    return null;
  }

  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(root);
  } catch {
    return null;
  }

  try {
    const canonicalCandidate = fs.realpathSync(candidate);
    return isWithinRoot(canonicalRoot, canonicalCandidate)
      ? canonicalCandidate
      : null;
  } catch (error) {
    // Missing files are passed to the server's SPA fallback, but other
    // filesystem errors fail closed.
    return error && error.code === 'ENOENT' ? candidate : null;
  }
}

module.exports = { safeStaticPath };
