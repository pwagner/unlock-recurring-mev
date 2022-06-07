const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const unlockAbi = require("../abi/Unlock.json");
const publicLockAbi = require("../abi/PublicLock.json");

const { ethers } = hre;

// PublicLock v10 Creation on Rinkeby: 10444740;
const SEARCH_START_BLOCK = 10650000;

async function main() {
  console.log('\nStep 1: Find relevant locks');
  // PublicLock contract version 10 is the first one that implements `renewMembershipFor`.
  // Find compatible locks using events of the parent Unlock Protocol contract: NewLock, LockUpgraded
  const unlockProxyContractAddr = "0xD8C88BE5e8EB88E38E6ff5cE186d764676012B0b"; // Mainnet: 0x3d5409cce1d45233de1d4ebdee74b8e004abdd13

  // Load proxy contract with ABI from implementation contract to get the events.
  ethers.provider.resetEventsBlock(SEARCH_START_BLOCK);
  console.log('Searching for Unlock lock events since block', SEARCH_START_BLOCK);
  const contractUnlock = new ethers.Contract(unlockProxyContractAddr, unlockAbi, ethers.provider);

  // Find new locks via NewLock event (owner, version).
  // NOTE: For more speed testing we filter here for a specific Rinkeby lock (0x8E9F8fAb9043a09aF9C35bCB9f9e29e9B0eD1DD3).
  const newLockEvents = await contractUnlock.queryFilter(contractUnlock.filters.NewLock(null, "0x8E9F8fAb9043a09aF9C35bCB9f9e29e9B0eD1DD3"), SEARCH_START_BLOCK)
  console.log('NewLock events', newLockEvents.length);

  const allLockAddresses = await Promise.all(
    newLockEvents.map(async event => {
      const block = await ethers.provider.getBlock(event.blockNumber);
      return await getLockState(event.args.newLockAddress, block.timestamp);
    })
  );
  const relevantLocks = allLockAddresses.filter( ({ version, gasRefundValue }) => version != 0);
  console.log(`Found ${relevantLocks.length} relevant locks from NewLock events`);

  // Find upgraded locks via LockUpgraded event (address, version).
  const upgradedLockEvents = await contractUnlock.queryFilter(contractUnlock.filters.LockUpgraded(), SEARCH_START_BLOCK);
  console.log('LockUpgraded events', upgradedLockEvents.length);

  const v10UpgradedLocks = upgradedLockEvents
    .filter(event => event.args.version == 10)
    .filter(event => relevantLocks.indexOf(event.args.lockAddress) < 0);
  const relevantUpgradedLocks = (await Promise.all(v10UpgradedLocks
    .map(async event => {
      const block = await ethers.provider.getBlock(event.blockNumber);
      return await getLockState(event.args.lockAddress, block.timestamp);
    })
  )).filter( ({ version }) => version != 0);
  console.log(`Found ${relevantUpgradedLocks.length} relevant locks from LockUpgraded events`);
  relevantLocks.push(...relevantUpgradedLocks);

  // Save result in output directory.
  const outputPath = path.join(process.cwd(), 'output', '01-locks.json');
  fs.writeFileSync(outputPath, JSON.stringify(relevantLocks));
  console.log('Saved output to', outputPath);
}

const getLockState = async (lockAddress, creationBlockTimestamp) => {

  try {
    const lockContract = new ethers.Contract(lockAddress, publicLockAbi, ethers.provider);
    const version = await lockContract.publicLockVersion();
    if (version < 10) throw "Lock version too old"

    const gasRefundValue = await lockContract.gasRefundValue();
    // console.log('gasRefundValue', gasRefundValue);
    if (gasRefundValue <= 0) throw "Lock without gas refund"

    const tokenAddress = await lockContract.tokenAddress();
    // console.log('tokenAddress', tokenAddress);
    if(tokenAddress == ethers.constants.AddressZero) throw "Lock not priced in ERC20"

    const numberOfOwners = await lockContract.numberOfOwners();
    if(numberOfOwners <= 0) throw "Lock without key-holders"

    const expirationDuration = await lockContract.expirationDuration();
    if(expirationDuration.lte(0) || expirationDuration.gte(ethers.constants.MaxUint256)) throw "Lock without expiration"

    // TODO: check if lock CAN have expired keys at this point in time!
    // If first purchased key hasn't expired yet, skip rest.
    const now = Math.floor((new Date()).getTime() / 1000);
    const firstPossibleExpiration = creationBlockTimestamp + Number(expirationDuration);

    if(now < firstPossibleExpiration) {
      throw "Lock too fresh (impossible to have expired keys yet)";
    }

    const keyPrice = await lockContract.keyPrice();

    const keys = [];
    try {
      // FIXME: Can numberOfOwners be different from number of keys?
      for(let tokenId = 1; tokenId <= numberOfOwners; tokenId++) {
        const owner = await lockContract.ownerOf(tokenId);
        const expiresAtBigNumber = await lockContract.keyExpirationTimestampFor(tokenId)
        keys.push({
          tokenId,
          owner,
          expiryDate: new Date(expiresAtBigNumber * 1000),
          isExpired: expiresAtBigNumber.lte(now) // Could also use conract's isValidKey method
        })
      }
    } catch (err) {
      console.log('Skipping keys for lock', lockAddress, err);
    }

    return {
      lockAddress,
      version,
      gasRefundValue,
      tokenAddress,
      numberOfOwners,
      expirationDuration,
      keyPrice,
      keys
    };
  } catch(err) {
    console.log('Skipping lock', lockAddress, err);

    return {
      lockAddress,
      version: 0
    };
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
