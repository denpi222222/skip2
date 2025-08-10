// Read-only on-chain status: token, pools, timings, unlock bps, income
// Env: APECHAIN_RPC (optional), CUBE_PROXY (optional)

const { ethers } = require('ethers');

const RPC = process.env.APECHAIN_RPC || 'https://apechain.calderachain.xyz';
const PROXY = (process.env.CUBE_PROXY || '0x7dFb75F1000039D650A4C2B8a068f53090e857dD').trim();

const CUBE_ABI = [
  'function craToken() view returns (address)',
  'function monthlyRewardPool() view returns (uint256)',
  'function totalLockedForRewards() view returns (uint256)',
  'function sharePerPing() view returns (uint256)',
  'function pingInterval() view returns (uint256)',
  'function monthDuration() view returns (uint256)',
  'function monthlyUnlockPercentage() view returns (uint256)'
];
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const cube = new ethers.Contract(PROXY, CUBE_ABI, provider);
  const [tokenAddr, monthly, locked, spp, interval, monthDur, unlockBps] = await Promise.all([
    cube.craToken(), cube.monthlyRewardPool(), cube.totalLockedForRewards(), cube.sharePerPing(), cube.pingInterval(), cube.monthDuration(), cube.monthlyUnlockPercentage()
  ]);
  const erc = new ethers.Contract(tokenAddr, ERC20_ABI, provider);
  let name='ERC20', symbol='ERC20', dec=18;
  try { name = await erc.name(); } catch {}
  try { symbol = await erc.symbol(); } catch {}
  try { dec = await erc.decimals(); } catch {}

  const perMinWei = interval > 0n ? (spp * 60n) / interval : 0n;

  console.log('Proxy:', PROXY);
  console.log('Token:', tokenAddr, `(${name} ${symbol}, dec=${dec})`);
  console.log('monthlyRewardPool:', ethers.formatEther(monthly));
  console.log('totalLockedForRewards:', ethers.formatEther(locked));
  console.log('sharePerPing:', ethers.formatEther(spp));
  console.log('perMinutePerNFT:', ethers.formatUnits(perMinWei, dec));
  console.log('pingInterval (sec):', interval.toString());
  console.log('monthDuration (sec):', monthDur.toString());
  console.log('monthlyUnlockPercentage (bps):', unlockBps.toString());
})();


