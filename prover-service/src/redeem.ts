import { createPublicClient, createWalletClient, http, encodePacked, keccak256, toHex, toBytes, recoverAddress, hashMessage } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import * as path from 'path';
import * as fs from 'fs';
import { generateProof } from './prover';
import { createJob, getJob, updateJob } from './jobs';
// @ts-ignore
import { poseidon2Hash } from '@zkpassport/poseidon2';
import { runCommand } from './prover';
import { chainsConfig } from './config';

const cashierAbi = [
    {
        "inputs": [
            { "internalType": "bytes32", "name": "chequeId", "type": "bytes32" }
        ],
        "name": "cheques",
        "outputs": [
            { "internalType": "address", "name": "owner", "type": "address" },
            { "internalType": "uint96", "name": "denomination", "type": "uint96" },
            { "internalType": "uint64", "name": "targetChainId", "type": "uint64" },
            { "internalType": "bool", "name": "isCompliant", "type": "bool" },
            { "internalType": "uint256", "name": "blockNumber", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "bytes", "name": "metadata", "type": "bytes" },
            { "internalType": "bytes", "name": "report", "type": "bytes" }
        ],
        "name": "onReport",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

// Minimal ABI for ProofRegistry
const proofRegistryAbi = [
    {
        "inputs": [
            { "internalType": "bytes32", "name": "", "type": "bytes32" }
        ],
        "name": "proofHashes",
        "outputs": [
            { "internalType": "bytes32", "name": "", "type": "bytes32" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

export interface RedeemParams {
    chequeId: string;
    recipientAddress: string;
    targetChainId: number;
}

export async function runRedeemPipeline(jobId: string, params: RedeemParams): Promise<void> {
    try {
        updateJob(jobId, { status: 'verifying' });
        console.log(`[redeem] Job ${jobId}: starting verification pipeline...`);

        const targetConfig = chainsConfig[params.targetChainId];
        const sourceConfig = chainsConfig[11155111]; // Hardcoded Source Chain for Demo

        if (!targetConfig || !targetConfig.rpcUrl || !targetConfig.proofRegistryAddress) {
            throw new Error(`Target chain config not found or incomplete for chainId ${params.targetChainId}`);
        }
        if (!sourceConfig || !sourceConfig.rpcUrl || !sourceConfig.complianceCashierAddress) {
            throw new Error(`Source chain config not found or incomplete for chainId 11155111`);
        }

        // 1. Setup EVM Client for Target Chain
        const targetClient = createPublicClient({ transport: http(targetConfig.rpcUrl) });
        const sourceClient = createPublicClient({ transport: http(sourceConfig.rpcUrl) });

        // 2. Fetch the Cheque from Source Cashier to get the actual denomination
        console.log(`[redeem] Job ${jobId}: fetching cheque details from Source ComplianceCashier...`);
        const chequeData = await sourceClient.readContract({
            address: sourceConfig.complianceCashierAddress as `0x${string}`,
            abi: cashierAbi,
            functionName: 'cheques',
            args: [params.chequeId as `0x${string}`],
        });

        const amountStr = chequeData[1].toString();
        console.log(`[redeem] Job ${jobId}: fetched cheque amount: ${amountStr}`);

        // 3. Fetch Proof Hash from Target Chain (ProofRegistry)
        console.log(`[redeem] Job ${jobId}: fetching ZK Proof Hash from Target ProofRegistry...`);
        const onChainProofHash = await targetClient.readContract({
            address: targetConfig.proofRegistryAddress as `0x${string}`,
            abi: proofRegistryAbi,
            functionName: 'proofHashes',
            args: [params.chequeId as `0x${string}`],
        });

        if (!onChainProofHash || onChainProofHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            throw new Error('Proof Hash not found in ProofRegistry (chainlink oracle may still be processing cross-chain).');
        }

        // 4. Fetch the full proof bytes locally to verify against the on-chain hash
        const proofJsonPath = path.join(__dirname, '..', 'proofs', `${params.chequeId}.json`);
        if (!fs.existsSync(proofJsonPath)) {
            throw new Error(`Local proof file not found for ${params.chequeId} at ${proofJsonPath}. Cannot finalize verification.`);
        }

        const proofData = JSON.parse(fs.readFileSync(proofJsonPath, 'utf8'));
        const proofHex = proofData.proof as `0x${string}`;

        const computedProofHash = keccak256(proofHex);
        if (computedProofHash !== onChainProofHash) {
            throw new Error(`Proof Hash mismatch! On-chain: ${onChainProofHash}, Local: ${computedProofHash}`);
        }
        console.log(`[redeem] Job ${jobId}: On-chain Proof Hash matched local proof bytes successfully.`);

        // 5. Delegate Settlement to Chainlink verify_oracle
        console.log(`[redeem] Job ${jobId}: Calling Chainlink verify_oracle to execute cross-chain settlement...`);

        const targetChainIdEVM = await targetClient.getChainId();

        const oraclePayload = {
            chequeId: params.chequeId,
            proof: proofHex,
            recipient: params.recipientAddress,
            amount: amountStr, // Dynamically fetched amount
            sourceChainId: 11155111, // ETH Sepolia natively (locked funds origin for demo)
            targetChainId: Number(targetChainIdEVM)
        };

        const verificationsDir = path.resolve(__dirname, '../../prover-service/verifications');
        if (!fs.existsSync(verificationsDir)) {
            fs.mkdirSync(verificationsDir, { recursive: true });
        }
        const verifyPayloadPath = path.join(verificationsDir, `${params.chequeId}.json`);
        // Saving the verification payload so the CRE service can fetch it
        fs.writeFileSync(verifyPayloadPath, JSON.stringify(oraclePayload, null, 2));
        console.log(`[redeem] Job ${jobId}: Saved verify payload to ${verifyPayloadPath} for CRE execution.`);

        const oracleResult = "Verification payload generated successfully.";

        updateJob(jobId, {
            status: 'completed',
            proof: oracleResult, // Store oracle success message
            publicInputs: { status: 'success' }
        });
        console.log(`[redeem] Job ${jobId}: ✅ completed successfully. Settlement delegated to Oracle!`);

    } catch (err: any) {
        console.error(`[redeem] Job ${jobId} ❌ failed:`, err.message);
        updateJob(jobId, {
            status: 'failed',
            error: err.message,
        });
    }
}
