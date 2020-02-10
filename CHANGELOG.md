# [2.0.0](https://github.com/uport-project/ethr-did-resolver/compare/1.0.3...2.0.0) (2020-01-24)


### Bug Fixes

* require a configuration to be used when initializing the resolver ([3adc029](https://github.com/uport-project/ethr-did-resolver/commit/3adc029150e86886b8951cec4295e0a97c232c11))


### BREAKING CHANGES

* this removes the fallback hardcoded RPC URLs and will fail early when a wrong configuration (or none) is provided to `getResolver()`

## [1.0.3](https://github.com/uport-project/ethr-did-resolver/compare/v1.0.2...1.0.3) (2019-11-11)


### Bug Fixes

* remove ejs module distribution ([780ec08](https://github.com/uport-project/ethr-did-resolver/commit/780ec08d49340858ae34d8f504265cb267a3173f)), closes [#39](https://github.com/uport-project/ethr-did-resolver/issues/39)
