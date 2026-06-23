import { join } from 'node:path';

function pathEnv(key: string, fallback: string) {
  const value = process.env[key];
  return value && value.length > 0 ? value : fallback;
}

const assetsDir = pathEnv('SERVER_ASSETS_DIR', 'app/server/assets');

export const runtimePaths = {
  assetsDir,
  schemaFile: pathEnv('SCHEMA_FILE', join(assetsDir, 'schema.sql')),
  installerFavicon: pathEnv('INSTALLER_FAVICON', join(assetsDir, 'installer', 'favicon.svg')),
  builtinLocaleDir: pathEnv('BUILTIN_LOCALE_DIR', join(assetsDir, 'i18n', 'locales')),
  builtinThemesDir: pathEnv('BUILTIN_THEMES_DIR', 'app/web/themes'),
  builtinPluginsDir: pathEnv('BUILTIN_PLUGINS_DIR', 'app/web/plugins'),
  builtinPublicThemesDir: pathEnv('BUILTIN_PUBLIC_THEMES_DIR', 'app/web/public/themes'),
  webAppDir: pathEnv('WEB_APP_DIR', 'app/web'),
  legacyPublicDir: pathEnv('LEGACY_PUBLIC_DIR', 'app/server/assets/public'),
  adminDistDir: pathEnv('ADMIN_DIST_DIR', 'app/admin/dist'),
};

export function schemaCandidates() {
  return [runtimePaths.schemaFile, 'schema.sql'];
}
