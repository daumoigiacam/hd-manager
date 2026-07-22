# Sprint 4 - Performance

Date: 2026-07-22

## Safe optimizations present

- Performance monitor is opt-in and does not add production overhead unless enabled.
- Hidden documents are not sampled for memory metrics.
- Runtime monitor listeners and History API patches are cleaned up.
- Google delivery markers avoid unnecessary recreation when only the selection callback changes.
- Existing Vite production chunking, CSS splitting, minification, and source-map omission remain enabled.
- Existing debounced/throttled/chunked rendering utilities remain available in `src/services/renderOptimization.js`.

## Measurements

Source: `test-results/hd-manager-performance-2026-07-22T02-57-55-448Z.*` and `test-results/hd-manager-big-stress-2026-07-22T02-57-55-432Z.*`.

- KPI gate: PASS in local simulation.
- Big stress simulation: 1,000 customers, 10,000 products, 100,000 transactions, 5,000 orders, 500 employees, 100,000 notifications, 100,000 histories, and 100,000 inventory records.
- Peak RSS: approximately 236 MB in the Node simulation.
- Event-loop maximum: approximately 30.7 ms.
- Crash in simulation: none.

## Open bottlenecks

- The scale suite reports broad listener/read pressure at larger user counts.
- The estimated FPS in the Node stress simulation is not a device FPS measurement.
- Android CPU, GPU, RAM, WebView ANR, and real Firestore latency still require device/cloud instrumentation.
