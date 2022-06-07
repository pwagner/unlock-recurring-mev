const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const publicLockAbi = require("../abi/PublicLock.json");
const mevOpportunities = require('../output/03-mev-opportunities.json');

const { ethers } = hre;

async function main() {
  const [searcher, ] = await hre.ethers.getSigners();
  console.log('\nStep 4: Extracting value as searcher', searcher.address);
  const lockContracts = {}; // Lock instances by address.
  const unconfirmedTransactions = [];

  for ({ lock, key } of mevOpportunities) {
    if (!lockContracts[lock]) {
      lockContracts[lock] = new ethers.Contract(lock, publicLockAbi, searcher);
    }

    // TODO: Bundle signed tx and broadcast privately, e.g. via Flashbots!
    try {
      const tx = await lockContracts[lock].renewMembershipFor(
        key,
        searcher.address // Referrers get rewarded with UDT (not yet included in profit calculation).
      );
      unconfirmedTransactions.push(tx.wait());
    } catch (err) {
      console.log('Error trying to renew membership for', lock, key);
    }
  }

  if(!unconfirmedTransactions.length > 0) {
    console.log('No MEV to capture at this time, run completed.');
    process.exit(0);
  }

  const transactions = (await Promise.all(unconfirmedTransactions)).map(({ transactionHash }) => transactionHash);
  const result = { transactions };
  // TODO: Calculate gasSpent, gasRefundEarned, mevProfit and add them to result.

  // Save result in output directory.
  const outputPath = path.join(process.cwd(), 'output', '04-mev-result.json');
  fs.writeFileSync(outputPath, JSON.stringify(result));
  console.log('Saved output to', outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
