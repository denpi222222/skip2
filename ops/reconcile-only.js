// Unconditional reconcileBalances once per run
// Env: PRIVATE_KEY, APECHAIN_RPC (optional), CUBE_PROXY (optional)

const { ethers } = require('ethers');

const RPC = process.env.APECHAIN_RPC || 'https://apechain.calderachain.xyz';
const PROXY = (process.env.CUBE_PROXY || '0x7dFb75F1000039D650A4C2B8a068f53090e857dD').trim();

const ABI = [
  'function monthlyRewardPool() view returns (uint256)',
  'function totalLockedForRewards() view returns (uint256)',
  'function reconcileBalances() external'
];

(async () => {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY required');
  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(pk, provider);
  const c = new ethers.Contract(PROXY, ABI, signer);

  const [m0, l0] = await Promise.all([
    c.monthlyRewardPool(), c.totalLockedForRewards()
  ]);
  console.log('before.monthly:', ethers.formatEther(m0));
  console.log('before.locked :', ethers.formatEther(l0));

  const tx = await c.reconcileBalances();
  console.log('reconcileBalances tx:', tx.hash);
  await tx.wait();

  const [m1, l1] = await Promise.all([
    c.monthlyRewardPool(), c.totalLockedForRewards()
  ]);
  console.log('after.monthly :', ethers.formatEther(m1));
  console.log('after.locked  :', ethers.formatEther(l1));
})().catch((e) => { console.error(e); process.exit(1); });


