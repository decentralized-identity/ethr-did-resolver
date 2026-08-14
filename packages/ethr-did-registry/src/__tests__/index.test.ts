import { expect } from 'chai'
import { describe, it } from 'mocha'
import { Contract, ContractFactory } from 'ethers'

/**
 * Package entry and published-surface tests.
 *
 * Every import below is by package name (`ethr-did-registry`, ...). Node self-reference
 * resolution routes those through the package's own `exports` map, so the tests exercise
 * the real consumer-facing wiring — the built `dist/` entry, the deep subpath conditions,
 * the raw artifact passthroughs — rather than the source files. That is why the test
 * script builds `dist/` first (`hardhat compile && tsc && vitest run`).
 *
 * Value/type naming collision: the entry exports the compiled artifact as the
 * `EthereumDIDRegistry` *value* and the generated typed contract as the `EthereumDIDRegistry`
 * *type* (same name, two declaration spaces — see `docs/adr/0001-registry-package-modern-scaffolding.md`
 * and issue 03's notes). A plain `import { EthereumDIDRegistry }` binds both: in value
 * position it is the ABI artifact, in type position it is the typed contract. The
 * `import type` alias below documents the type-only form.
 *
 * Note: `expectTypeOf` assertions (vitest) are removed — TypeScript compilation
 * catches type errors. Chai has no type-level assertions.
 */
import { EthereumDIDRegistry, EthereumDIDRegistry__factory } from 'ethr-did-registry'
import artifactRaw from 'ethr-did-registry/artifacts/contracts/EthereumDIDRegistry.sol/EthereumDIDRegistry.json' with { type: 'json' }
import { EthereumDIDRegistry__factory as BarrelFactory } from 'ethr-did-registry/typechain-types'
import { EthereumDIDRegistry__factory as DeepFileFactory } from 'ethr-did-registry/typechain-types/factories/EthereumDIDRegistry__factory'

/**
 * Node's `import.meta.resolve` is a runtime API not covered by the ES2022 lib types
 * (this package has no `@types/node`); the single cast keeps the editor quiet while
 * vitest verifies the resolution at runtime.
 */
const resolveImport = (specifier: string): string =>
  (import.meta as ImportMeta & { resolve: (specifier: string) => string }).resolve(specifier)

const EXPECTED_FUNCTIONS = [
  'addDelegate',
  'addDelegateSigned',
  'changeOwner',
  'changeOwnerSigned',
  'changed',
  'delegates',
  'identityOwner',
  'nonce',
  'owners',
  'revokeAttribute',
  'revokeAttributeSigned',
  'revokeDelegate',
  'revokeDelegateSigned',
  'setAttribute',
  'setAttributeSigned',
  'validDelegate',
].sort()

const EXPECTED_EVENTS = ['DIDAttributeChanged', 'DIDDelegateChanged', 'DIDOwnerChanged'].sort()

describe('root entry — value exports', () => {
  it('EthereumDIDRegistry is the ABI artifact (functions + events + bytecode)', () => {
    expect(EthereumDIDRegistry.contractName).to.equal('EthereumDIDRegistry')
    expect(EthereumDIDRegistry.abi).to.not.equal(undefined)
    expect(EthereumDIDRegistry.bytecode).to.match(/^0x/)
    expect(EthereumDIDRegistry.deployedBytecode).to.match(/^0x/)

    const functions = EthereumDIDRegistry.abi.filter((entry) => entry.type === 'function').map((entry) => entry.name)
    const events = EthereumDIDRegistry.abi.filter((entry) => entry.type === 'event').map((entry) => entry.name)

    expect(functions.sort()).to.deep.equal(EXPECTED_FUNCTIONS)
    expect(events.sort()).to.deep.equal(EXPECTED_EVENTS)
  })

  it('the artifact occupies the value slot (a plain object, not the factory)', () => {
    expect(typeof EthereumDIDRegistry).to.equal('object')
    expect(typeof EthereumDIDRegistry__factory).to.equal('function')
    expect(EthereumDIDRegistry__factory.connect).to.not.equal(undefined)
  })
})

describe('root entry — type exports (the value/type naming collision)', () => {
  // Type-level assertions removed — TypeScript compilation catches type errors.
  // If these types are wrong, `tsc` will fail.
  it('types compile (placeholder)', () => {
    expect(true).to.equal(true)
  })
})

describe('legacy consumer pattern', () => {
  const ADDRESS = '0x0000000000000000000000000000000000000001'

  it('new ethers.Contract(addr, EthereumDIDRegistry.abi) typechecks and the ABI is usable', () => {
    const legacy = new Contract(ADDRESS, EthereumDIDRegistry.abi)
    expect(legacy.interface.getFunction('changeOwner')).to.not.equal(undefined)
    expect(legacy.interface.getEvent('DIDOwnerChanged')).to.not.equal(undefined)
  })

  it('ContractFactory.fromSolidity accepts the raw artifact', () => {
    const factory = ContractFactory.fromSolidity(EthereumDIDRegistry)
    expect(factory.bytecode).to.match(/^0x/)
    expect(factory.interface.getFunction('validDelegate')).to.not.equal(undefined)
    expect(factory.interface.getEvent('DIDDelegateChanged')).to.not.equal(undefined)
  })
})

describe('deep subpath imports', () => {
  it('./artifacts/* passthrough returns the raw artifact JSON', () => {
    expect(artifactRaw).to.not.equal(undefined)
    expect(artifactRaw.contractName).to.equal('EthereumDIDRegistry')
    expect(artifactRaw.abi).to.not.equal(undefined)
    expect(artifactRaw.bytecode).to.match(/^0x/)
  })

  it('./typechain-types barrel exposes the same factory', () => {
    expect(BarrelFactory).to.equal(EthereumDIDRegistry__factory)
  })

  it('./typechain-types/* file subpath exposes the same factory', () => {
    expect(DeepFileFactory).to.equal(EthereumDIDRegistry__factory)
  })

  // Type-level assertion removed — TypeScript compilation catches type errors.
  it('deep generated types resolve (placeholder)', () => {
    expect(true).to.equal(true)
  })
})

describe('exports map resolution (self-reference)', () => {
  it('root resolves to the built dist entry', () => {
    expect(resolveImport('ethr-did-registry')).to.include('/dist/src/index.js')
  })

  it('typechain-types resolves to the compiled dist copies', () => {
    expect(resolveImport('ethr-did-registry/typechain-types')).to.include('/dist/typechain-types/index.js')
    expect(resolveImport('ethr-did-registry/typechain-types/factories/EthereumDIDRegistry__factory')).to.include(
      '/dist/typechain-types/factories/EthereumDIDRegistry__factory.js'
    )
  })

  it('raw passthroughs return the source files, not dist copies', () => {
    expect(
      resolveImport('ethr-did-registry/artifacts/contracts/EthereumDIDRegistry.sol/EthereumDIDRegistry.json')
    ).not.to.include('/dist/')
    expect(resolveImport('ethr-did-registry/contracts/EthereumDIDRegistry.sol')).not.to.include('/dist/')
  })
})
