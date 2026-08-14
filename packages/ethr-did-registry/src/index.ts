import artifact from '../artifacts/contracts/EthereumDIDRegistry.sol/EthereumDIDRegistry.json' with { type: 'json' }
import type { EthereumDIDRegistry as EthereumDIDRegistryType } from './typechain-types/index.js'

/**
 * The compiled Hardhat artifact for `EthereumDIDRegistry` (ABI + bytecode + metadata).
 *
 * This is the legacy-compatible root export: consumers pass `EthereumDIDRegistry.abi`
 * to `new ethers.Contract(address, ...)` or `ContractFactory.fromSolidity(...)`.
 *
 * The name intentionally collides with the generated typed contract interface below —
 * the artifact is the *value* binding (`EthereumDIDRegistry.abi`) while the typed
 * contract is a *type* binding under the same name. `import { EthereumDIDRegistry }`
 * gives the artifact; `import type { EthereumDIDRegistry }` gives the typed contract
 * interface. The typed factory (`EthereumDIDRegistry__factory.connect`) returns an
 * `EthereumDIDRegistry`-typed contract instance.
 */
export const EthereumDIDRegistry = artifact

/**
 * The generated typed contract interface (TypeChain, ethers-v6 target).
 *
 * Value/type disambiguation: this type shares its name with the artifact export above,
 * which occupies the value slot. To annotate a typed connected contract, import it as
 * a type:
 *
 * ```ts
 * import { EthereumDIDRegistry } from 'ethr-did-registry' // the artifact (value)
 * import type { EthereumDIDRegistry } from 'ethr-did-registry' // the typed contract (type)
 * ```
 *
 * The deep import `ethr-did-registry/typechain-types` also exposes the raw generated
 * surface (contract type, factory, typed event namespaces).
 */
export type EthereumDIDRegistry = EthereumDIDRegistryType

/**
 * Typed factory for deploying or connecting an `EthereumDIDRegistry` contract.
 * Returns instances typed as the generated `EthereumDIDRegistry` interface.
 */
export { EthereumDIDRegistry__factory } from './typechain-types/index.js'
