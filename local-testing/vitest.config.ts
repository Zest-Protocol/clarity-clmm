import {
  getClarinetVitestsArgv,
  vitestSetupFilePath,
} from '@stacks/clarinet-sdk/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // vitest-environment-clarinet boots a simnet and exposes it as `simnet`
    environment: 'clarinet',
    pool: 'forks',
    // the simnet is reset between test files, so files can share one worker
    isolate: false,
    maxWorkers: 1,
    // coverage/cost collection after the long randomized suites needs time
    hookTimeout: 300_000,
    setupFiles: [vitestSetupFilePath],
    environmentOptions: {
      clarinet: {
        ...getClarinetVitestsArgv(),
      },
    },
    env: {
      ENABLE_COSTS: String(process.argv.includes('--costs')),
    },
  },
});
