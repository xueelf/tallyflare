import type { Theme, ThemeSource } from '../core/svg';

/** 主题不打包进 Worker，避免 base64 撑大脚本。 */
export function createThemeSource(
  assets: Fetcher,
  origin: string,
): ThemeSource {
  return {
    async load(name: string): Promise<Theme | null> {
      const response = await assets.fetch(
        new URL(`/themes/${encodeURIComponent(name)}.json`, origin),
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Could not load counter theme: ${name}`);
      }

      return response.json<Theme>();
    },
  };
}
