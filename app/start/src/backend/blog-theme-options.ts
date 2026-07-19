import { resolveBlogTheme } from './blog-themes';
import { optionValue, saveOption } from './db/options';

/** One-time migration: legacy Chred installs → Azure + red accent. */
export async function migrateLegacyBlogThemeOptions() {
  const rawActive = await optionValue('active_theme', 'Azure');
  const azureAccent = await optionValue('azure_accent', 'blue');
  const resolved = resolveBlogTheme(rawActive, azureAccent);
  if (resolved.migratedFrom === 'Chred') {
    await saveOption('active_theme', 'Azure');
    await saveOption('azure_accent', 'red');
  }
}
