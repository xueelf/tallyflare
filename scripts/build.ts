import { $, Glob } from 'bun';
import { cp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Journal, LevelDebug } from 'annal';

import { generateThemes } from './themes';

const logger = new Journal({ scope: 'build', level: LevelDebug });
const root = resolve(import.meta.dir, '..');
const outdir = join(root, 'dist');

await rm(outdir, { recursive: true, force: true });
logger.info('Output directory cleaned');

const themes = await generateThemes(root);
logger.info(`Counter themes generated (${themes.length})`);

await $`phyllo build docs`.cwd(root).quiet();
logger.info('Documentation built');

await cp(join(root, 'docs/dist'), outdir, { recursive: true });
await rm(join(root, 'docs/dist'), { recursive: true, force: true });
logger.info('Build completed');

const outputPaths = await Array.fromAsync(
  new Glob('**/*').scan({ absolute: true, cwd: outdir }),
);
const outputSizes = await Promise.all(
  outputPaths.map(path => Bun.file(path).stat()),
);
const outputBytes = outputSizes.reduce((bytes, stat) => bytes + stat.size, 0);
const outputSize = `${(outputBytes / 1000).toFixed(2)} KB`;

logger.debug(`Output: ${outdir}`);
logger.debug(`Artifacts: ${outputPaths.length} files, ${outputSize}`);
