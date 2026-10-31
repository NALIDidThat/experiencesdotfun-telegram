const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

const { createServer } = require('./serve');
const { safeStaticPath } = require('./static-path');

let temporaryRoot;
let staticRoot;
let server;
let port;

before(async () => {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'experiences-static-'));
  staticRoot = path.join(temporaryRoot, 'web-dist');
  const siblingRoot = path.join(temporaryRoot, 'web-dist-escape');
  fs.mkdirSync(path.join(staticRoot, 'assets'), { recursive: true });
  fs.mkdirSync(siblingRoot, { recursive: true });
  fs.writeFileSync(path.join(staticRoot, 'index.html'), '<main>app shell</main>');
  fs.writeFileSync(path.join(staticRoot, 'assets', 'app.js'), 'window.appReady = true;');
  fs.writeFileSync(path.join(siblingRoot, 'secret.txt'), 'outside the static root');
  fs.symlinkSync(
    path.join(siblingRoot, 'secret.txt'),
    path.join(staticRoot, 'escape.txt'),
  );

  server = createServer({ staticRoot });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(async () => {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (temporaryRoot) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

function get(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: pathname }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
  });
}

test('allows in-root paths and mounted app paths', () => {
  assert.equal(
    safeStaticPath('/assets/app.js', { staticRoot }),
    path.join(staticRoot, 'assets', 'app.js'),
  );
  assert.equal(
    safeStaticPath('/mini/assets/app.js', { staticRoot, basePath: '/mini' }),
    path.join(staticRoot, 'assets', 'app.js'),
  );
  assert.equal(
    safeStaticPath('/mini-escape/assets/app.js', { staticRoot, basePath: '/mini' }),
    null,
  );
});

test('rejects sibling-prefix, encoded traversal, malformed, and symlink escapes', () => {
  assert.equal(
    safeStaticPath('/../web-dist-escape/secret.txt', { staticRoot }),
    null,
  );
  assert.equal(
    safeStaticPath('/%2e%2e/web-dist-escape/secret.txt', { staticRoot }),
    null,
  );
  assert.equal(safeStaticPath('/bad%2', { staticRoot }), null);
  assert.equal(safeStaticPath('/escape.txt', { staticRoot }), null);
});

test('serves valid assets and keeps SPA route fallback working', async () => {
  const asset = await get('/assets/app.js');
  assert.equal(asset.status, 200);
  assert.equal(asset.body, 'window.appReady = true;');

  const route = await get('/experiences/123');
  assert.equal(route.status, 200);
  assert.equal(route.body, '<main>app shell</main>');
});

test('does not serve files reached through symlink or encoded traversal paths', async () => {
  const symlink = await get('/escape.txt');
  assert.equal(symlink.status, 403);
  assert.notEqual(symlink.body, 'outside the static root');

  const traversal = await get('/%2e%2e/web-dist-escape/secret.txt');
  assert.notEqual(traversal.body, 'outside the static root');
});
