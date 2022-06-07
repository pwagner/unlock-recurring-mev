require("dotenv").config();
require("@nomiclabs/hardhat-waffle");

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.4",
  networks: {
    hardhat: {
      chainId: 4,
      forking: {
        url: process.env.RINKEBY_RPC_URL
      }
    },
    testnet: {
      url: process.env.RINKEBY_RPC_URL,
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [ process.env.PRIVATE_KEY ] : [],
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};
