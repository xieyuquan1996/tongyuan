import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/data/**'],
    // Integration tests share a single Postgres db; the upstream_keys table is
    // not user-scoped and a couple of tests assume an empty pool (failover,
    // playground.all-upstreams-down). Run files sequentially so those tests
    // don't race with e2e tests that seed rows into the same table.
    fileParallelism: false,
  },
})
