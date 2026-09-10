---
name: Temporary preview port routing
description: How isolated non-artifact workflows are exposed through the Replit development domain.
---

Temporary workflows with a webview port may not be reachable at the bare development domain when artifact routing is also configured. The explicit port URL can be the working preview address.

**Why:** During an isolated preview, the workflow was healthy locally and on its configured port, while the bare development domain returned 502.

**How to apply:** For a temporary workflow, verify the configured port directly and share the development-domain URL with `:<port>` when the bare domain does not route to that workflow.