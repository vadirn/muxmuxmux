---
"@muxmuxmux/core": minor
"@muxmuxmux/react": minor
---

Method return types are now the union across states, plus `undefined` when a state lacks the method. Arguments must suit every state that defines the method. Exporting a controller no longer fails declaration emit with TS4023.
