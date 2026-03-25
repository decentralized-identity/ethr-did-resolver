import { HardhatUserConfig } from 'hardhat/config'

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      chainId: 1337,
      hardfork: 'prague',
      allowBlocksWithSameTimestamp: true,
    },
  },
}

export default config
