// Entry point the harness runs: node /bot/main.ts
// Reads every case from the input mount and writes /output/answers.json. The mount
// paths come from the environment (MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR): in the
// grader's container they are /input and /output, and on the process driver (grade-local)
// they are the host directories the harness passes — hardcoding /input and /output
// would write to the wrong place there. The V8 flag is set before solve.js is
// imported, the way the baseline turns off incremental marking; the /output directory
// itself is never removed, only its contents are replaced by the single answers file
// this program writes.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run } = await import('./solve.js');

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8'));
const answers = [];
for (const c of cases) {
  answers.push(run(c.input));
}
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers) + '\n');

