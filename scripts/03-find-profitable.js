const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const needle = require('needle');
const erc20Abi = require("../abi/ERC20.json");
const locks = require('../output/01-locks.json');
const subscriberAllowanceByToken = require('../output/02-subscribers.json');

const { ethers } = hre;
const tokens = {}; // Token contract instances by contract address.

async function main() {
  console.log('\nStep 3: Evaluate profit opportunities');
  // Convert key price to ETH using Coingecko API: https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=<token addresses>&vs_currencies=eth
  let coingeckoPrices;
  const tokenAddresses = Object.keys(subscriberAllowanceByToken).join(',');

  // NOTE: We mock a repsonse from Coingecko for the Rinkeby test token of lock 0x8E9F8fAb9043a09aF9C35bCB9f9e29e9B0eD1DD3.
  if (tokenAddresses == "0xaFF4481D10270F50f203E0763e2597776068CBc5") {
    coingeckoPrices = {
      "0xaFF4481D10270F50f203E0763e2597776068CBc5": {
        "eth": 100000000000 // NOTE: This price is that high, so that it compensates for the low gasRefundValue of 500000 wei of the token.
      }
    };
  } else {
    const response = await needle('get', `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddresses}&vs_currencies=eth`);

    if(!response || !response.body) {
      throw `Couldn't consult Coingecko API at ${apiUrl}`;
    }

    if(Object.entries(response.body).length === 0) {
      console.log('Aborting, could not find any tokens with ETH price on Coingecko');
      process.exit(0);
    }

    coingeckoPrices = response.body;
  }

  // Sort locks by highest gas refund value (= most interesting).
  const locksByRefund = [];
  for (lock of locks) {
    const gasRefundInETHBigNumber = ethers.BigNumber.from(lock.gasRefundValue)
      .mul(ethers.utils.parseEther(
        coingeckoPrices[lock.tokenAddress].eth.toString()
      ));

    // Divide by token decimals to get amount as ethers.
    if (!tokens[lock.tokenAddress]) {
       tokens[lock.tokenAddress] = new ethers.Contract(lock.tokenAddress, erc20Abi, ethers.provider);
    }
    const token = tokens[lock.tokenAddress];

    const tokenDecimals = await token.decimals();
    const gasRefundInETH = ethers.utils.formatUnits(gasRefundInETHBigNumber, tokenDecimals + 18);
    // NOTE: By mocking the Coingecko API response with a high price, we aimed for a refund greater than the upcoming swap fees (e.g. gasRefundInETH should be 0.05).

    locksByRefund.push({
      address: lock.lockAddress,
      gasRefundInETH
    });
  }
  locksByRefund.sort((a,b) => b.gasRefundInETH.sub(a.gasRefundInETH));

  // TODO: Calculate actual gas fees of all required transactions (approve, swap, etc.), and check profitability!
  const totalGasCost = 0.02; // NOTE: We assume this for testing purposes.

  // Skip locks that refund less than the gas costs.
  const relevantLocks = locksByRefund.filter(({ gasRefundInETH }) => gasRefundInETH > totalGasCost);
  console.log('Relevant locks sorted by gas refund value (descending):', relevantLocks);

  // Get subscribers who can afford renewal along with lock address and token ID
  const mevOpportunities = [];
  for({ address } of relevantLocks) {
    const lock = locks.find(({ lockAddress }) => lockAddress == address);

    for(key of lock.keys) {
      if (typeof subscriberAllowanceByToken[lock.tokenAddress][key.owner] === 'undefined') {
        // Skip under-approved (in terms of ERC20 allowance) subscribers.
        continue;
      }

      const allowance = typeof subscriberAllowanceByToken[lock.tokenAddress][key.owner] === 'BigNumber'
        ? subscriberAllowanceByToken[lock.tokenAddress][key.owner]
        : ethers.BigNumber.from(subscriberAllowanceByToken[lock.tokenAddress][key.owner]);
      if (allowance.lt(lock.keyPrice)) {
        // Skip due to insufficient allowance.
        continue;
      }

      const token = tokens[lock.tokenAddress];
      const balance = await token.balanceOf(key.owner);
      if (balance.lt(lock.keyPrice)) {
        // Skip due to insufficient balance.
        continue;
      }

      // Add potential key renewal to the output of this script.
      mevOpportunities.push({
        lock: address,
        key: key.tokenId
      });

      // Decrease allowance to further service this subscriber in the current run properly.
      subscriberAllowanceByToken[lock.tokenAddress][key.owner] = allowance.sub(ethers.BigNumber.from(lock.keyPrice));
    }

  }

  // Save result in output directory.
  const outputPath = path.join(process.cwd(), 'output', '03-mev-opportunities.json');
  fs.writeFileSync(outputPath, JSON.stringify(mevOpportunities));
  console.log('Saved output to', outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
