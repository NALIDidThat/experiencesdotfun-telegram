const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function stripProtocol(value) {
  return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

const domain = process.env.REPLIT_INTERNAL_APP_DOMAIN
  || process.env.REPLIT_DEV_DOMAIN
  || process.env.EXPO_PUBLIC_DOMAIN;

if (!domain) {
  console.error('No Replit domain is available for the web build.');
  process.exit(1);
}

console.log('Building Experiences.fun as a normal web app...');

const result = spawnSync(
  'pnpm',
  ['exec', 'expo', 'export', '--platform', 'web', '--output-dir', 'web-dist', '--clear'],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:
        process.env.Google_Maps_API || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '',
      EXPO_PUBLIC_DOMAIN: stripProtocol(domain),
      EXPO_PUBLIC_REPL_ID: process.env.REPL_ID || '',
    },
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);