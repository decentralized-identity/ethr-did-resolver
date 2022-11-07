# [8.0.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/7.0.2...8.0.0) (2022-11-07)


### Bug Fixes

* **spec:** remove ambiguity around deletion ([#178](https://github.com/decentralized-identity/ethr-did-resolver/issues/178)) ([da8e22e](https://github.com/decentralized-identity/ethr-did-resolver/commit/da8e22e74449f81e18bf5b23202f9e2f98627f23)), closes [#177](https://github.com/decentralized-identity/ethr-did-resolver/issues/177)


### BREAKING CHANGES

* **spec:** This is a breaking change of the spec as "soft deletion" of non-updated DIDs is no longer considered valid.

## [7.0.2](https://github.com/decentralized-identity/ethr-did-resolver/compare/7.0.1...7.0.2) (2022-10-24)


### Bug Fixes

* **build:** add named exports to esm wrapper ([#176](https://github.com/decentralized-identity/ethr-did-resolver/issues/176)) ([725ed25](https://github.com/decentralized-identity/ethr-did-resolver/commit/725ed250074f19e5d18d8e2b55454391102d5401)), closes [#175](https://github.com/decentralized-identity/ethr-did-resolver/issues/175)

## [7.0.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/7.0.0...7.0.1) (2022-10-17)


### Bug Fixes

* **deps:** update did-resolver to 4.0.1 ([#172](https://github.com/decentralized-identity/ethr-did-resolver/issues/172)) ([ce38d01](https://github.com/decentralized-identity/ethr-did-resolver/commit/ce38d01802344db76eae7f753a067fba4fd759de))

# [7.0.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.2.3...7.0.0) (2022-10-17)


### Bug Fixes

* **build:** transpile for commonjs, use wrapper for esm ([#170](https://github.com/decentralized-identity/ethr-did-resolver/issues/170)) ([5eba679](https://github.com/decentralized-identity/ethr-did-resolver/commit/5eba679b159fc88cef6e4ac8a59e0c3553747443))


### BREAKING CHANGES

* **build:** previous versions (<7.0.0) would be transpiled twice by microbundle, but this seems to be [anti-pattern](https://redfin.engineering/node-modules-at-war-why-commonjs-and-es-modules-cant-get-along-9617135eeca1)

Please raise an issue on https://github.com/decentralized-identity/ethr-did-resolver if this change is incompatible with your tech stack and there are no workarounds.

# [7.0.0-alpha.3](https://github.com/decentralized-identity/ethr-did-resolver/compare/7.0.0-alpha.2...7.0.0-alpha.3) (2022-10-14)


### Bug Fixes

* **build:** use commonjs module in tsconfig ([e66d054](https://github.com/decentralized-identity/ethr-did-resolver/commit/e66d054e8c6af9f90bcd55389786488f16ed1ce4))
* **ci:** run tests on a matrix of node versions ([3825ac0](https://github.com/decentralized-identity/ethr-did-resolver/commit/3825ac04889ec0fc2564cc82c8b94b51a521ef85))

# [7.0.0-alpha.2](https://github.com/decentralized-identity/ethr-did-resolver/compare/7.0.0-alpha.1...7.0.0-alpha.2) (2022-10-14)


### Bug Fixes

* **build:** build commonjs and also expose esm wrapper ([522c199](https://github.com/decentralized-identity/ethr-did-resolver/commit/522c1999877c26dd3b1959111cd9d155987ada19))

# [7.0.0-alpha.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.2.4-alpha.1...7.0.0-alpha.1) (2022-10-13)


### Bug Fixes

* add esm wrapper instead of double transpile ([d2bbeaf](https://github.com/decentralized-identity/ethr-did-resolver/commit/d2bbeafbd2d77308f12d73f952b0b9940431dd83))


### BREAKING CHANGES

* ESM is only supported through a wrapper

## [6.2.4-alpha.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.2.3...6.2.4-alpha.1) (2022-10-13)


### Bug Fixes

* create alpha release ([1d5d5f2](https://github.com/decentralized-identity/ethr-did-resolver/commit/1d5d5f21e3d9f13500faf1acfdef89819589606c))

## [6.2.3](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.2.2...6.2.3) (2022-10-12)


### Bug Fixes

* e2e tests with deprecated ethr test networks ([0fd9915](https://github.com/decentralized-identity/ethr-did-resolver/commit/0fd99151303182b8ee659bcbd72a8e7211702a1d))
* hex values getting wrongly encoded to utf8 for setAttributeSigned ([c5c8989](https://github.com/decentralized-identity/ethr-did-resolver/commit/c5c8989289d8f4db7716eec8e4bb3979485c3394))

## [6.2.2](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.2.1...6.2.2) (2022-09-07)


### Bug Fixes

* export MetaSignature type ([62f250a](https://github.com/decentralized-identity/ethr-did-resolver/commit/62f250a16067761ebbefefe01af59306d27cffe7))

## [6.2.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.2.0...6.2.1) (2022-09-06)


### Bug Fixes

* track legacy deployments, fix nonce calculation, export contract ([#167](https://github.com/decentralized-identity/ethr-did-resolver/issues/167)) ([c0d0366](https://github.com/decentralized-identity/ethr-did-resolver/commit/c0d036618fd17f46053a6dd736e72d1aca91f358)), closes [#165](https://github.com/decentralized-identity/ethr-did-resolver/issues/165) [#166](https://github.com/decentralized-identity/ethr-did-resolver/issues/166)

# [6.2.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.1.0...6.2.0) (2022-09-05)


### Features

* add controller support for meta/signed transactions ([#164](https://github.com/decentralized-identity/ethr-did-resolver/issues/164)) ([ce93e70](https://github.com/decentralized-identity/ethr-did-resolver/commit/ce93e703415ed7ea120cdb95bd1f32951e3b062a))

# [6.1.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.0.2...6.1.0) (2022-08-04)


### Features

* add experimental support for ServiceEndpoint objects ([#163](https://github.com/decentralized-identity/ethr-did-resolver/issues/163)) ([3919a25](https://github.com/decentralized-identity/ethr-did-resolver/commit/3919a25746d68d42ed79c3437a7e0734aa19b46c))

## [6.0.2](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.0.1...6.0.2) (2022-07-08)


### Bug Fixes

* revert aurora tweaks and use known deployments in config ([#161](https://github.com/decentralized-identity/ethr-did-resolver/issues/161)) ([e238a9f](https://github.com/decentralized-identity/ethr-did-resolver/commit/e238a9f6c081e4c898391d3c80c2d4ab52f93677))

## [6.0.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/6.0.0...6.0.1) (2022-06-06)


### Bug Fixes

* **ci:** groom the build scripts and dependencies ([#156](https://github.com/decentralized-identity/ethr-did-resolver/issues/156)) ([9a53958](https://github.com/decentralized-identity/ethr-did-resolver/commit/9a53958e3a711d50416594f78a9b2a86ad5e9f93))

# [6.0.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/5.0.4...6.0.0) (2022-06-05)


### Bug Fixes

* **doc:** update LD [@context](https://github.com/context) ([#154](https://github.com/decentralized-identity/ethr-did-resolver/issues/154)) ([29c196a](https://github.com/decentralized-identity/ethr-did-resolver/commit/29c196a507f086e24113c7254e082cccd4978af3)), closes [#151](https://github.com/decentralized-identity/ethr-did-resolver/issues/151)
* **doc:** update spec to use new CAIP10 format ([77a4f67](https://github.com/decentralized-identity/ethr-did-resolver/commit/77a4f670859da3e7bbbd5f0c9d39cf490579fd79))
* update blockchainAccountId to the new CAIP10 format ([#153](https://github.com/decentralized-identity/ethr-did-resolver/issues/153)) ([9c3f401](https://github.com/decentralized-identity/ethr-did-resolver/commit/9c3f4011d525f0b7295cb3e0226a423513e3460f)), closes [#152](https://github.com/decentralized-identity/ethr-did-resolver/issues/152)


### BREAKING CHANGES

* **doc:** Since the context definitions most often have to be embedded in apps, this requires apps to download the new definition.
* Apps have to update their processing of `blockchainAccountId` to use the [new CAIP10 format](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-10.md)

## [5.0.4](https://github.com/decentralized-identity/ethr-did-resolver/compare/5.0.3...5.0.4) (2022-01-20)


### Bug Fixes

* broaden window for event logs processing (fix Aurora) ([#149](https://github.com/decentralized-identity/ethr-did-resolver/issues/149)) ([5ee6bed](https://github.com/decentralized-identity/ethr-did-resolver/commit/5ee6beda7547fdc2dca4a3a2f0f62442c676861f))

## [5.0.3](https://github.com/decentralized-identity/ethr-did-resolver/compare/5.0.2...5.0.3) (2022-01-13)


### Bug Fixes

* **deps:** remove querystring in favor of UrlSearchParams ([cd5e596](https://github.com/decentralized-identity/ethr-did-resolver/commit/cd5e596b688d73c4a47b2f59b19021d66e77679d))

## [5.0.2](https://github.com/decentralized-identity/ethr-did-resolver/compare/5.0.1...5.0.2) (2021-11-10)


### Bug Fixes

* **deps:** bump ethers to ^5.5.0 ([c39788a](https://github.com/decentralized-identity/ethr-did-resolver/commit/c39788a3de71b60cd962b23d073f35cff95c63d7))

## [5.0.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/5.0.0...5.0.1) (2021-11-10)


### Bug Fixes

* **deps:** bump did-resolver to 3.1.3+ ([0ddde4b](https://github.com/decentralized-identity/ethr-did-resolver/commit/0ddde4b7ec3946bee22cc29e42dbba2dedd06585))

# [5.0.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.3.5...5.0.0) (2021-11-10)


### Bug Fixes

* remove 0x prefix from publicKeyHex ([#147](https://github.com/decentralized-identity/ethr-did-resolver/issues/147)) ([063ee67](https://github.com/decentralized-identity/ethr-did-resolver/commit/063ee67a6107f325edff34b7aa89daa26b33a8c5)), closes [#140](https://github.com/decentralized-identity/ethr-did-resolver/issues/140)


### BREAKING CHANGES

* `publicKeyHex` values in the DID document no longer contain a `0x` prefix

## [4.3.5](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.3.4...4.3.5) (2021-11-10)


### Bug Fixes

* reference /enc/ keys in `keyAgreement` section of DID doc ([#146](https://github.com/decentralized-identity/ethr-did-resolver/issues/146)) ([5d507ef](https://github.com/decentralized-identity/ethr-did-resolver/commit/5d507ef3d31014fb298f33219d1ce9ff71a0b566)), closes [#145](https://github.com/decentralized-identity/ethr-did-resolver/issues/145)

## [4.3.4](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.3.3...4.3.4) (2021-06-24)


### Bug Fixes

* maintenance of dependencies, bots and build scripts ([#136](https://github.com/decentralized-identity/ethr-did-resolver/issues/136)) ([0d3fcf7](https://github.com/decentralized-identity/ethr-did-resolver/commit/0d3fcf74630549252605253b51415cc248b6e4d5))

## [4.3.3](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.3.2...4.3.3) (2021-04-23)


### Bug Fixes

* strip milliseconds from dateTime strings ([#129](https://github.com/decentralized-identity/ethr-did-resolver/issues/129)) ([3e958af](https://github.com/decentralized-identity/ethr-did-resolver/commit/3e958afc37916aa3f6de3c7e7a8cf41e0718df34)), closes [#126](https://github.com/decentralized-identity/ethr-did-resolver/issues/126)

## [4.3.2](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.3.1...4.3.2) (2021-04-22)


### Bug Fixes

* use rpcUrl in controller config ([#128](https://github.com/decentralized-identity/ethr-did-resolver/issues/128)) ([5302536](https://github.com/decentralized-identity/ethr-did-resolver/commit/53025365030df2d132156c15e6982e81af6d9ef2)), closes [#127](https://github.com/decentralized-identity/ethr-did-resolver/issues/127)

## [4.3.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.3.0...4.3.1) (2021-04-22)


### Bug Fixes

* ignore query string when interpreting identifiers ([#123](https://github.com/decentralized-identity/ethr-did-resolver/issues/123)) ([5508f8a](https://github.com/decentralized-identity/ethr-did-resolver/commit/5508f8a45149417eac44dae0103e6f7edb566c83)), closes [#122](https://github.com/decentralized-identity/ethr-did-resolver/issues/122)

# [4.3.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.2.0...4.3.0) (2021-04-20)


### Features

* add `assertionMethod` by default to didDocument ([#124](https://github.com/decentralized-identity/ethr-did-resolver/issues/124)) ([11b2096](https://github.com/decentralized-identity/ethr-did-resolver/commit/11b20967fae66b784a527d92c39cd29f6dbe6b10)), closes [#117](https://github.com/decentralized-identity/ethr-did-resolver/issues/117) [#115](https://github.com/decentralized-identity/ethr-did-resolver/issues/115)

# [4.2.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.1.0...4.2.0) (2021-04-16)


### Features

* versioning ([#121](https://github.com/decentralized-identity/ethr-did-resolver/issues/121)) ([b794d69](https://github.com/decentralized-identity/ethr-did-resolver/commit/b794d6975cb92ea5c87882546951d5d0771bde4f)), closes [#119](https://github.com/decentralized-identity/ethr-did-resolver/issues/119) [#118](https://github.com/decentralized-identity/ethr-did-resolver/issues/118) [#119](https://github.com/decentralized-identity/ethr-did-resolver/issues/119) [#118](https://github.com/decentralized-identity/ethr-did-resolver/issues/118)

# [4.1.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.0.1...4.1.0) (2021-04-14)


### Features

* export `EthrDidController` helper class ([#120](https://github.com/decentralized-identity/ethr-did-resolver/issues/120)) ([745100d](https://github.com/decentralized-identity/ethr-did-resolver/commit/745100d6cbfd1170af483efb2bdd93784f8fd7a6))

## [4.0.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/4.0.0...4.0.1) (2021-03-26)


### Bug Fixes

* **deps:** use Resolvable type from did-resolver ([d213ae6](https://github.com/decentralized-identity/ethr-did-resolver/commit/d213ae650a7ae706ffad92f3b213c478dd41883c))

# [4.0.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/3.1.0...4.0.0) (2021-03-15)


### Features

* upgrade to latest did core spec ([#99](https://github.com/decentralized-identity/ethr-did-resolver/issues/99)) ([#109](https://github.com/decentralized-identity/ethr-did-resolver/issues/109)) ([#111](https://github.com/decentralized-identity/ethr-did-resolver/issues/111)) ([2a023b1](https://github.com/decentralized-identity/ethr-did-resolver/commit/2a023b15a3a6cba1da05f8439dacb26e898104f1)), closes [#105](https://github.com/decentralized-identity/ethr-did-resolver/issues/105) [#95](https://github.com/decentralized-identity/ethr-did-resolver/issues/95) [#106](https://github.com/decentralized-identity/ethr-did-resolver/issues/106) [#83](https://github.com/decentralized-identity/ethr-did-resolver/issues/83) [#85](https://github.com/decentralized-identity/ethr-did-resolver/issues/85) [#83](https://github.com/decentralized-identity/ethr-did-resolver/issues/83) [#85](https://github.com/decentralized-identity/ethr-did-resolver/issues/85) [#95](https://github.com/decentralized-identity/ethr-did-resolver/issues/95) [#105](https://github.com/decentralized-identity/ethr-did-resolver/issues/105) [#106](https://github.com/decentralized-identity/ethr-did-resolver/issues/106)


### BREAKING CHANGES

* The return type is `DIDResolutionResult` which wraps a `DIDDocument`.
* No errors are thrown during DID resolution. Please check `result.didResolutionMetadata.error` instead.
* This DID core spec requirement will break for users expecting `publicKey`, `ethereumAddress`, `Secp256k1VerificationKey2018` entries in the DID document. They are replaced with `verificationMethod`, `blockchainAccountId` and `EcdsaSecp256k1VerificationKey2019` and `EcdsaSecp256k1RecoveryMethod2020` depending on the content.

# [3.1.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/3.0.3...3.1.0) (2021-03-15)


### Features

* upgrade to latest did core spec ([#99](https://github.com/decentralized-identity/ethr-did-resolver/issues/99)) ([#109](https://github.com/decentralized-identity/ethr-did-resolver/issues/109)) ([d46eea3](https://github.com/decentralized-identity/ethr-did-resolver/commit/d46eea3ad4d85450f75a645ea9b33aa5223dd7b0)), closes [#105](https://github.com/decentralized-identity/ethr-did-resolver/issues/105) [#95](https://github.com/decentralized-identity/ethr-did-resolver/issues/95) [#106](https://github.com/decentralized-identity/ethr-did-resolver/issues/106) [#83](https://github.com/decentralized-identity/ethr-did-resolver/issues/83) [#85](https://github.com/decentralized-identity/ethr-did-resolver/issues/85) [#83](https://github.com/decentralized-identity/ethr-did-resolver/issues/83) [#85](https://github.com/decentralized-identity/ethr-did-resolver/issues/85) [#95](https://github.com/decentralized-identity/ethr-did-resolver/issues/95) [#105](https://github.com/decentralized-identity/ethr-did-resolver/issues/105) [#106](https://github.com/decentralized-identity/ethr-did-resolver/issues/106)

## [3.0.3](https://github.com/decentralized-identity/ethr-did-resolver/compare/3.0.2...3.0.3) (2020-12-17)


### Bug Fixes

* **deps:** update dependency buffer to v6 ([#93](https://github.com/decentralized-identity/ethr-did-resolver/issues/93)) ([e1dc861](https://github.com/decentralized-identity/ethr-did-resolver/commit/e1dc8612b32c06b8bbb046fe6003d70ca1b3960d))
* **types:** simplify type exports ([#101](https://github.com/decentralized-identity/ethr-did-resolver/issues/101)) ([90ca9b5](https://github.com/decentralized-identity/ethr-did-resolver/commit/90ca9b5b3fb13c9531b542eb9fc8d3e51454d4b1))

## [3.0.2](https://github.com/decentralized-identity/ethr-did-resolver/compare/3.0.1...3.0.2) (2020-12-09)


### Bug Fixes

* **deps:** update dependency did-resolver to v2.1.2 ([8c2294e](https://github.com/decentralized-identity/ethr-did-resolver/commit/8c2294e83d8dd87df8a7ce2f860b3ad57ce27190))

## [3.0.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/3.0.0...3.0.1) (2020-11-09)


### Bug Fixes

* reverse events to have consistent order ([#87](https://github.com/decentralized-identity/ethr-did-resolver/issues/87)) ([08b9692](https://github.com/decentralized-identity/ethr-did-resolver/commit/08b9692b8c6abf1da158fb3ce3dc4d49d9393068)), closes [/github.com/decentralized-identity/ethr-did-resolver/issues/86#issuecomment-699961595](https://github.com//github.com/decentralized-identity/ethr-did-resolver/issues/86/issues/issuecomment-699961595)

# [3.0.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/2.4.0...3.0.0) (2020-08-24)


### Bug Fixes

* change 'owner' to 'controller' to follow W3C Spec ([#75](https://github.com/decentralized-identity/ethr-did-resolver/issues/75)) ([#81](https://github.com/decentralized-identity/ethr-did-resolver/issues/81)) ([af37b3f](https://github.com/decentralized-identity/ethr-did-resolver/commit/af37b3fe66dedda688156bb421948364c3ab3606))


### BREAKING CHANGES

* JWTs that refer to the `did:ethr:...#owner` key in their header may be considered invalid after this upgrade, as the key id is now `did:ethr:...#controller`

# [2.4.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/2.3.4...2.4.0) (2020-08-21)


### Features

* add ability to use a compressed publicKey as identifier ([#73](https://github.com/decentralized-identity/ethr-did-resolver/issues/73)) ([e257eb3](https://github.com/decentralized-identity/ethr-did-resolver/commit/e257eb3b1681d7cde1a67e8056e4757589ceaaac)), closes [#56](https://github.com/decentralized-identity/ethr-did-resolver/issues/56)

## [2.3.4](https://github.com/decentralized-identity/ethr-did-resolver/compare/2.3.3...2.3.4) (2020-08-19)


### Bug Fixes

* **deps:** update dependency did-resolver to v2.1.1 ([1a4cbca](https://github.com/decentralized-identity/ethr-did-resolver/commit/1a4cbca3b849bc2ec6fea13df2ebae945bda499d))

## [2.3.3](https://github.com/decentralized-identity/ethr-did-resolver/compare/2.3.2...2.3.3) (2020-08-14)


### Bug Fixes

* **deps:** update dependency did-resolver to v2.1.0 ([b26d387](https://github.com/decentralized-identity/ethr-did-resolver/commit/b26d3878a2716f9cffcfa8d3fb918239254a9fc2))

## [2.3.2](https://github.com/decentralized-identity/ethr-did-resolver/compare/2.3.1...2.3.2) (2020-07-07)


### Bug Fixes

* **deps:** update dependency did-resolver to v2 ([#68](https://github.com/decentralized-identity/ethr-did-resolver/issues/68)) ([831ec17](https://github.com/decentralized-identity/ethr-did-resolver/commit/831ec17f7f1511295420f88e9869a4f85cb121da))

## [2.3.1](https://github.com/decentralized-identity/ethr-did-resolver/compare/2.3.0...2.3.1) (2020-07-04)


### Bug Fixes

* **deps:** update dependency ethjs-contract to ^0.2.0 ([b667ce6](https://github.com/decentralized-identity/ethr-did-resolver/commit/b667ce6757f01d39e6302d962d314d92901d3ffe))

# [2.3.0](https://github.com/decentralized-identity/ethr-did-resolver/compare/2.2.0...2.3.0) (2020-07-03)


### Bug Fixes

* **deps:** update dependency did-resolver to v1.1.0 ([ab47058](https://github.com/decentralized-identity/ethr-did-resolver/commit/ab470589d900f7abb97c80025405506b5ed422b8))


### Features

* add encryption key support for ethr-did-documents ([2f5825c](https://github.com/decentralized-identity/ethr-did-resolver/commit/2f5825cfa7540a470fea31c9dd89b873f659b2ec)), closes [#52](https://github.com/decentralized-identity/ethr-did-resolver/issues/52)

# [2.2.0](https://github.com/uport-project/ethr-did-resolver/compare/2.1.0...2.2.0) (2020-02-25)


### Features

* add encryption key support for ethr-did-documents ([dff7b0f](https://github.com/uport-project/ethr-did-resolver/commit/dff7b0f3efe562be315aa636ddb3ab3e4fded486)), closes [#52](https://github.com/uport-project/ethr-did-resolver/issues/52)

# [2.1.0](https://github.com/uport-project/ethr-did-resolver/compare/2.0.0...2.1.0) (2020-02-10)


### Features

* Add types declaration stubb ([05944b1](https://github.com/uport-project/ethr-did-resolver/commit/05944b16f51c33814bdc146a9d8629cb04e6a5fd))

# [2.0.0](https://github.com/uport-project/ethr-did-resolver/compare/1.0.3...2.0.0) (2020-01-24)


### Bug Fixes

* require a configuration to be used when initializing the resolver ([3adc029](https://github.com/uport-project/ethr-did-resolver/commit/3adc029150e86886b8951cec4295e0a97c232c11))


### BREAKING CHANGES

* this removes the fallback hardcoded RPC URLs and will fail early when a wrong configuration (or none) is provided to `getResolver()`

## [1.0.3](https://github.com/uport-project/ethr-did-resolver/compare/v1.0.2...1.0.3) (2019-11-11)


### Bug Fixes

* remove ejs module distribution ([780ec08](https://github.com/uport-project/ethr-did-resolver/commit/780ec08d49340858ae34d8f504265cb267a3173f)), closes [#39](https://github.com/uport-project/ethr-did-resolver/issues/39)
