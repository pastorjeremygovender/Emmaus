---
name: TypeScript source test runtime
description: Why some API tests require the tsx ESM loader instead of Node's type stripping.
---

API tests that import production TypeScript modules whose internal imports use emitted `.js` specifiers must run with the `tsx/esm` loader. Node's experimental type stripping does not remap those `.js` specifiers back to `.ts` source files.

**Why:** A source-level middleware integration test failed module resolution even though direct `.ts` test imports worked; the production module graph correctly uses `.js` specifiers for its built output.

**How to apply:** Keep lightweight isolated tests on Node type stripping, but run source-graph integration tests in a separate `node --test --import=tsx/esm` subprocess.