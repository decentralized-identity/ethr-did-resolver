// @ts-expect-error we're still a CJS project and imports don't work properly
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
