// Reconcile excess → monthly AND immediately unlock (safe window near daily unlock)
// Goal: move any on-contract excess into locked without spikes in per-minute income
// Env: PRIVATE_KEY, APECHAIN_RPC (optional), CUBE_PROXY (optional)

const { ethers } = require('ethers');

const RPC = process.env.APECHAIN_RPC || 'https://apechain.calderachain.xyz';
const PROXY = (process.env.CUBE_PROXY || '0x7dFb75F1000039D650A4C2B8a068f53090e857dD').trim();

const ABI = [
  'function craToken() view returns (address)',
  'function monthlyRewardPool() view returns (uint256)',
  'function totalLockedForRewards() view returns (uint256)',
  'function lastUnlockTimestamp() view returns (uint256)',
  'function monthDuration() view returns (uint256)',
  'function monthlyUnlockPercentage() view returns (uint256)',
  'function reconcileBalances() external',
  'function unlockAndRefillMonthlyPool() external',
];
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

(async () => {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY required');

  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(pk, provider);
  const c = new ethers.Contract(PROXY, ABI, signer);

  const [token, monthly0, locked0, lastTs, dur, bps] = await Promise.all([
    c.craToken(), c.monthlyRewardPool(), c.totalLockedForRewards(), c.lastUnlockTimestamp(), c.monthDuration(), c.monthlyUnlockPercentage()
  ]);
  const erc = new ethers.Contract(token, ERC20_ABI, provider);
  const balance = await erc.balanceOf(PROXY);
  const accounted = monthly0 + locked0;
  const excess = balance > accounted ? balance - accounted : 0n;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const nextUnlock = lastTs + dur;
  const driftBefore = 300n;   // 5 мин до окна
  const driftAfter  = 60n;    // 1 мин после окна
  const inWindow = now + driftBefore >= nextUnlock && now <= nextUnlock + driftAfter;

  console.log('Proxy:', PROXY);
  console.log('now:', now.toString(), 'nextUnlock:', nextUnlock.toString(), 'inWindow:', inWindow);
  console.log('monthly0:', ethers.formatEther(monthly0));
  console.log('locked0 :', ethers.formatEther(locked0));
  console.log('unlockBps:', bps.toString(), 'bps');
  console.log('balance :', ethers.formatEther(balance));
  console.log('excess  :', ethers.formatEther(excess));

  // We will attempt unlock regardless of inWindow; if time hasn't passed, contract does nothing.
  // inWindow is logged only for reference.

  // Step 1: optional reconcile to move excess -> monthly
  let monthlyPreUnlock = monthly0;
  if (excess > 0n) {
    const tx1 = await c.reconcileBalances();
    console.log('reconcileBalances tx:', tx1.hash);
    await tx1.wait();
    monthlyPreUnlock = await c.monthlyRewardPool();
  } else {
    console.log('No excess to reconcile.');
  }
  console.log('monthly before unlock (after reconcile if any):', ethers.formatEther(monthlyPreUnlock));

  // Step 2: trigger unlock (requires UNLOCKER_ROLE). If month not elapsed, it will be a no-op.
  try {
    const tx2 = await c.unlockAndRefillMonthlyPool();
    console.log('unlockAndRefillMonthlyPool tx:', tx2.hash);
    await tx2.wait();
  } catch (e) {
    console.log('unlock attempt skipped/failed (may be not yet time or no role):', e?.shortMessage || e?.message || e);
  }

  const [monthly1, locked1] = await Promise.all([
    c.monthlyRewardPool(), c.totalLockedForRewards()
  ]);
  // Derived metrics for transparency
  const returnedToLocked = monthlyPreUnlock; // contract returns full monthly to locked during unlock
  const lockedBeforeUnlock = locked0 + monthlyPreUnlock; // before deducting new unlocked share
  const unlockedAmount = monthly1; // new monthly is the unlocked amount for the next hour
  const effBps = lockedBeforeUnlock > 0n ? (unlockedAmount * 10000n) / lockedBeforeUnlock : 0n;

  console.log('monthly1:', ethers.formatEther(monthly1));
  console.log('locked1 :', ethers.formatEther(locked1));
  console.log('returnedToLocked:', ethers.formatEther(returnedToLocked));
  console.log('unlockedAmount  :', ethers.formatEther(unlockedAmount));
  console.log('effectiveUnlockBps:', effBps.toString(), 'bps');
})();


