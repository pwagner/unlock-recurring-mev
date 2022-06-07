# unlock-recurring-mev
An approach to capture MEV from [Unlock Protocol's recurring membership subscriptions](https://docs.unlock-protocol.com/unlock/creators/recurring-memberships "Unlock Protocol's recurring membership subscriptions").

**Warning:** This repo is an experimental proof-of-concept and NOT ready for production use! I strongly recommend testing it on the Rinkeby test-network first.

This repo is intended as an inspiration for MEV searchers to support the Unlock Protocol ecosystem by automatically renewing the memberships of subscribed members. I hope you'll find the code and coments helpful.

## Recurring Memberships
Since Unlock Protocol released version 10 of its PublicLock contract, there is a new method called `renewMembershipFor`, which allows anyone to renew the expired key of a membership subscriber.

The MEV search can be broken down into four steps:
1. Find relevant locks
2. Find relevant subscribers
3. Find profitable MEV opportunities
4. Extract value (renew memberships)

## Getting started

Copy `.env.sample` and save it as  `.env` with your `RINKEBY_RPC_URL` (e.g. from [Alchemy](https://alchemy.com/?r=jgyNjIwNzE5OTQ5M "Alchemy")). If you want to make transactions in the final step, you can insert your `PRIVATE_KEY`, too.

Run the script of each step and watch the `output` directory for results:

1. `npx hardhat run scripts/01-find-locks.js --network testnet`
2. `npx hardhat run scripts/02-find-subscribers.js --network testnet`
3. `npx hardhat run scripts/03-find-profitable.js --network testnet`
4. `npx hardhat run scripts/04-renew-memberships.js --network testnet`

Or simply serially run all with `npm start`.
