// Sweep contract's excess CRAA balance into LOCKED (no monthly change) via adminResetPools
// Env: PRIVATE_KEY, APECHAIN_RPC (optional), CUBE_PROXY (optional)
// Usage: node ops/sweep-excess-to-locked.js [--dry]

const { ethers } = require('ethers');

const RPC = process.env.APECHAIN_RPC || 'https://apechain.calderachain.xyz';
const PROXY = (process.env.CUBE_PROXY || '0x7dFb75F1000039D650A4C2B8a068f53090e857dD').trim();
const DRY = process.argv.includes('--dry');

const CUBE_ABI = [
  'function craToken() view returns (address)',
  'function monthlyRewardPool() view returns (uint256)',
  'function totalLockedForRewards() view returns (uint256)',
  'function adminResetPools(uint256 _locked, uint256 _monthly) external',
];
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)'
];

(async () => {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY required');
  const provider = new ethers.JsonRpcProvider(RPC);
  const signer = new ethers.Wallet(pk, provider);
  const cube = new ethers.Contract(PROXY, CUBE_ABI, signer);

  const [tokenAddr, monthly, locked] = await Promise.all([
    cube.craToken(), cube.monthlyRewardPool(), cube.totalLockedForRewards()
  ]);
  const token = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
  const balance = await token.balanceOf(PROXY);

  const accounted = monthly + locked;
  const excess = balance > accounted ? balance - accounted : 0n;

  console.log('Proxy:', PROXY);
  console.log('Token:', tokenAddr);
  console.log('Balance:', ethers.formatEther(balance));
  console.log('Accounted (monthly+locked):', ethers.formatEther(accounted));
  console.log('Excess to sweep → locked:', ethers.formatEther(excess));

  if (excess === 0n) {
    console.log('Nothing to sweep.');
    return;
  }

  if (DRY) {
    console.log('[DRY RUN] Would set locked = locked + excess, monthly unchanged');
    return;
  }

  const newLocked = locked + excess;
  const tx = await cube.adminResetPools(newLocked, monthly);
  console.log('adminResetPools tx:', tx.hash);
  await tx.wait();
  console.log('✅ Swept into locked successfully');
})();


