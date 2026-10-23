// Extends app.json. When exporting the web build (`expo export`), the app is
// served by the API server under /app, so assets and routes need that base path.
const isExport = process.argv.includes('export');

module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...(config.experiments || {}),
    ...(isExport ? { baseUrl: '/app' } : {}),
  },
});
