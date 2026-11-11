import { $ } from 'bun';
import { cpSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { generateThemes } from './themes';

const root = resolve(import.meta.dir, '..');
const outdir = join(root, 'dist');

rmSync(outdir, { recursive: true, force: true });
generateThemes(root);
await $`phyllo build docs`.cwd(root);
cpSync(join(root, 'docs/dist'), outdir, { recursive: true });
rmSync(join(root, 'docs/dist'), { recursive: true, force: true });
