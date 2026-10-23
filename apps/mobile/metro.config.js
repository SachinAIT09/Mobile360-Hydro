// Metro config for the pnpm monorepo (node-linker=hoisted).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Metro watches the whole workspace; keep it out of folders that churn but never hold app code
// (git objects, build output, backups, Playwright artefacts), or it re-crawls them and pins a CPU core.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockedDirs = ['.git', 'apps/mobile/dist', 'apps/web/dist', 'apps/api/dist', '.backup', 'tests/e2e/test-results', 'tests/e2e/shots', 'playwright-report'];
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList || []),
  ...blockedDirs.map((rel) => {
    // Accept either separator so the same config works on Windows and POSIX.
    const dir = path.resolve(workspaceRoot, rel).split(/[\\/]/).map(escapeRe).join('[\\\\/]');
    return new RegExp(`^${dir}[\\\\/].*$`);
  }),
];

module.exports = config;
