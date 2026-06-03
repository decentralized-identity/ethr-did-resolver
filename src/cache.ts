import type { CanonicalDIDEvent } from './helpers.js'

/** Cached metadata for a single block. */
export interface BlockMetadataEntry {
  /** Block number as a decimal string. */
  height: string
  /** Unix timestamp in seconds of the block. */
  timestamp: number
}

export interface EthrDidCache {
  /**
   * Returns all cached events for the given identity at the given block,
   * sorted by logIndex ASC. Returns undefined on a cache miss (block not yet cached).
   *
   * `chainId` is the canonical numeric EIP-155 chain ID.
   * `registryAddress` and `identity` must be lowercase.
   */
  getEvents(
    chainId: number,
    registryAddress: string,
    identity: string,
    blockNumber: number
  ): Promise<CanonicalDIDEvent[] | undefined>

  /**
   * Stores a single canonical event. All cache-key material is derived from
   * the event's own fields (`chainId`, `registryAddress`, `identity`,
   * `blockNumber`, `logIndex`). Implementations MUST defensively lowercase
   * address fields and return events sorted by logIndex ASC from getEvents.
   *
   * Callers (the resolver) are responsible for calling setEvent for ALL events
   * at a block before relying on getEvents for that block, ensuring the cached
   * view is complete.
   */
  setEvent(event: CanonicalDIDEvent): Promise<void>

  /**
   * Returns cached block metadata, or undefined on a cache miss.
   */
  getBlockMetadata(chainId: number, blockNumber: number): Promise<BlockMetadataEntry | undefined>

  /**
   * Stores block metadata.
   */
  setBlockMetadata(chainId: number, blockNumber: number, value: BlockMetadataEntry): Promise<void>
}

// ---------------------------------------------------------------------------
// Internal key builders
// ---------------------------------------------------------------------------

function blockKey(chainId: number, registryAddress: string, identity: string, blockNumber: number): string {
  return `${chainId}:${registryAddress.toLowerCase()}:${identity.toLowerCase()}:${blockNumber}`
}

function metadataKey(chainId: number, blockNumber: number): string {
  return `${chainId}:${blockNumber}`
}

// ---------------------------------------------------------------------------
// Default in-memory implementation
// ---------------------------------------------------------------------------

export class InMemoryEthrDidCache implements EthrDidCache {
  // Events are grouped by block: blockKey → sorted CanonicalDIDEvent[]
  private readonly eventStore = new Map<string, CanonicalDIDEvent[]>()
  private readonly metadataStore = new Map<string, BlockMetadataEntry>()

  async getEvents(
    chainId: number,
    registryAddress: string,
    identity: string,
    blockNumber: number
  ): Promise<CanonicalDIDEvent[] | undefined> {
    const events = this.eventStore.get(blockKey(chainId, registryAddress, identity, blockNumber))
    return events?.length ? events : undefined
  }

  async setEvent(event: CanonicalDIDEvent): Promise<void> {
    const key = blockKey(event.chainId, event.registryAddress, event.identity, event.blockNumber)
    const existing = this.eventStore.get(key) ?? []
    // Replace any entry with the same logIndex, then re-sort
    const updated = [...existing.filter((e) => e.logIndex !== event.logIndex), event].sort(
      (a, b) => a.logIndex - b.logIndex
    )
    this.eventStore.set(key, updated)
  }

  async getBlockMetadata(chainId: number, blockNumber: number): Promise<BlockMetadataEntry | undefined> {
    return this.metadataStore.get(metadataKey(chainId, blockNumber))
  }

  async setBlockMetadata(chainId: number, blockNumber: number, value: BlockMetadataEntry): Promise<void> {
    this.metadataStore.set(metadataKey(chainId, blockNumber), value)
  }
}
