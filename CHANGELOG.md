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
