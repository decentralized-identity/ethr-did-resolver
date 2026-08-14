import { defineConfig } from 'hardhat/config'

export default defineConfig({
  networks: {
    hardhat: {
      type: 'edr-simulated',
      chainId: 1337,
      hardfork: 'prague',
      allowBlocksWithSameTimestamp: true,
    },
  },
})
