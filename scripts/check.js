import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

for (const folder of ['server', 'public', 'tests', 'scripts']) {
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.js'))) {
    const result = spawnSync(process.execPath, ['--check', join(folder, file)], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('All JavaScript syntax checks passed.');