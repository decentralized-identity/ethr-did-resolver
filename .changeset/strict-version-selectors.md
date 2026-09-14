---
'ethr-did-resolver': patch
---

reject malformed, empty and repeated `versionId` / `versionTime` query parameters with `invalidOptions` instead of resolving the latest state; `versionId` must be a block number
