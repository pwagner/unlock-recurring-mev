const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const erc20Abi = require("../abi/ERC20.json");
const locks = require('../output/01-locks.json');

const { ethers } = hre;

async function main() {
  console.log('\nStep 2: Find relevant members/lock-key-subscribers');
  const tokens = {};
  const allowanceByTokenByAccount = {};

  // Get allowance of key price tokens for all members
  for(let lock of locks) {
    console.log('Processing lock', lock.lockAddress);
    if(!tokens[lock.tokenAddress]) {
      tokens[lock.tokenAddress] = new ethers.Contract(lock.tokenAddress, erc20Abi, ethers.provider);
    }

    const token = tokens[lock.tokenAddress];

    for(let key of lock.keys) {
      if(!allowanceByTokenByAccount[lock.tokenAddress]) allowanceByTokenByAccount[lock.tokenAddress] = {};

      if(!key.isExpired) {
        console.log('Skipping unexpired key', key.tokenId);
        continue;
      }

      if(typeof allowanceByTokenByAccount[lock.tokenAddress][key.owner] !== "undefined") {
        console.log(`Skipping already known approved amount for account ${key.owner} for token ${lock.tokenAddress} (${allowanceByTokenByAccount[lock.tokenAddress][key.owner]})`);
        continue;
      }

      const approvedAmount = await token.allowance(key.owner, lock.lockAddress);

      if(approvedAmount.eq(0)) {
        console.log('Skipping zero allowance of account', key.owner);
        continue;
      }

      allowanceByTokenByAccount[lock.tokenAddress][key.owner] = approvedAmount;
    }
  }

  // Save result in output directory.
  const outputPath = path.join(process.cwd(), 'output', '02-subscribers.json');
  fs.writeFileSync(outputPath, JSON.stringify(allowanceByTokenByAccount));
  console.log('Saved output to', outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
