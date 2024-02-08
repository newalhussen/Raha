/** End-to-end tests run against the configured Postgres+PostGIS database (see .env). */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: 'test/.*\.e2e-spec\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json', diagnostics: { ignoreCodes: [151001] } }] },
  testTimeout: 180000,
  maxWorkers: 1,
};
