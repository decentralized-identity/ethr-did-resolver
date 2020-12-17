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
