import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia, optimismSepolia, arbitrumSepolia, baseSepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Aletheia Protocol',
  projectId: 'YOUR_PROJECT_ID',
  chains: [sepolia, optimismSepolia, arbitrumSepolia, baseSepolia],
});
