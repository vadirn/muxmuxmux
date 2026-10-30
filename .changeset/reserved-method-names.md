---
"@muxmuxmux/core": minor
---

Methods named `get`, `set` or `subscribe` now fail to compile with "reserved by the store; rename this method". Before, TypeScript accepted them and the runtime silently ignored them.
