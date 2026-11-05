// Writes functions/.env.local for emulator runs (loaded only by the Functions emulator).
import { writeFileSync, rmSync } from 'node:fs';
const file = new URL('../functions/.env.local', import.meta.url);
if (process.env.GEYES_DISABLE_TRIGGERS === '1') writeFileSync(file, 'GEYES_DISABLE_TRIGGERS=1\n');
else rmSync(file, { force: true });
