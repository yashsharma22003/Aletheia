import {
    cre,
    getNetwork,
    Runner,
    type Runtime,
    prepareReportRequest,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, parseAbiParameters, type Hex, keccak256 } from 'viem'
import { z } from 'zod'

// ============================================================================
// Configuration Schema
// ============================================================================

const ConfigSchema = z.object({
    chains: z.array(z.object({
        chainId: z.string(),
        chainName: z.string(),
        rpcUrl: z.string().optional(),
        // The ProofRegistry on this chain (source of truth for proof hashes)
        registryAddress: z.string().optional(),
        // The ComplianceCashier on this chain (destination for fund release)
        cashierAddress: z.string().optional(),
    }))
});

type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Input Payload
//
// The employee (or the frontend on their behalf) calls the verify_oracle
// HTTP trigger with:
//   - chequeId:       The cheque they want to redeem
//   - proof:          The full raw zkSNARK proof (hex string, 0x-prefixed)
//   - recipient:      The address to release funds to
//   - sourceChainId:  The chain the ComplianceCashier lives on
//   - targetChainId:  The chain the ProofRegistry lives on
// ============================================================================

type VerifyPayload = {
    chequeId: string;
    proof: string;          // Full proof hex bytes (only used for hashing here)
    recipient: string;      // Employee wallet address to send funds to
    sourceChainId: number | string;  // Chain where ComplianceCashier lives
    targetChainId: number | string;  // Chain where ProofRegistry lives
}

// ============================================================================
// HTTP Trigger Handler
// ============================================================================

const onHttpTrigger = (runtime: Runtime<Config>, requestPayload: any): string => {
    console.log(`[VerifyOracle] Received redemption request.`);

    // Parse the payload (same Buffer-unwrapping pattern as proof_oracle)
    let payload: any = {};

    try {
        const raw = JSON.parse(JSON.stringify(requestPayload));

        const findFields = (obj: any): boolean => {
            if (!obj || typeof obj !== 'object') return false;

            if (obj.chequeId && obj.proof && obj.recipient) {
                payload = obj;
                return true;
            }

            if (obj.type === 'Buffer' && obj.data) {
                try {
                    const arr = Array.isArray(obj.data) ? obj.data : Object.values(obj.data).map(Number);
                    const parsed = JSON.parse(Buffer.from(arr).toString('utf-8'));
                    if (parsed.chequeId && parsed.proof && parsed.recipient) {
                        payload = parsed;
                        return true;
                    }
                } catch (e) { /* ignore */ }
            }

            for (const key of Object.keys(obj)) {
                if (findFields(obj[key])) return true;
                if (typeof obj[key] === 'string') {
                    try {
                        const parsedStr = JSON.parse(obj[key]);
                        if (findFields(parsedStr)) return true;
                    } catch (e) { /* ignore */ }
                }
            }
            return false;
        };

        if (typeof requestPayload === 'string') {
            try {
                if (!findFields(JSON.parse(requestPayload))) findFields(raw);
            } catch (e) { findFields(raw); }
        } else {
            findFields(raw);
        }
    } catch (e) {
        return "Error: Failed to process input payload";
    }

    const { chequeId, proof, recipient, sourceChainId, targetChainId } = payload;

    if (!chequeId || !proof || !recipient || !sourceChainId || !targetChainId) {
        return `Error: Missing required fields. Got: ${Object.keys(payload).join(', ')}`;
    }

    // ---- 1. Hash the proof ----
    // The proof_oracle already stored keccak256(proof) in ProofRegistry.
    // We re-hash here inside the Chainlink DON enclave for trustless verification.
    const proofHex: Hex = proof.startsWith('0x') ? proof as Hex : `0x${proof}`;
    const proofHash = keccak256(proofHex);

    console.log(`[VerifyOracle] Cheque: ${chequeId}`);
    console.log(`[VerifyOracle] Computed proof hash: ${proofHash}`);
    console.log(`[VerifyOracle] Recipient: ${recipient}`);

    const targetChain = runtime.config.chains.find(c => c.chainId === targetChainId.toString());
    const sourceChain = runtime.config.chains.find(c => c.chainId === sourceChainId.toString());

    if (!targetChain || !targetChain.registryAddress || targetChain.registryAddress === "0x0000000000000000000000000000000000000000") {
        return `Error: ProofRegistry not configured for targetChainId ${targetChainId}`;
    }

    if (!sourceChain || !sourceChain.cashierAddress || sourceChain.cashierAddress === "0x0000000000000000000000000000000000000000") {
        return `Error: ComplianceCashier not configured for sourceChainId ${sourceChainId}`;
    }

    // ---- 2. Read the stored hash from ProofRegistry on the target chain ----
    // The DON calls ProofRegistry.proofHashes(chequeId) to get the registered hash,
    // then verifies it matches our locally computed hash.
    // [NOTE: In production, use an EVMRead capability here for on-chain read.]
    // For now, we trust the proof submission path and write the release report.

    // ---- 3. Write release report to ComplianceCashier on the source chain ----
    try {
        // Payload type 1 = Release
        // (uint8 payloadType, bytes32 chequeId, bytes32 proofHash, address recipient)
        const reportPayload = encodeAbiParameters(
            parseAbiParameters('uint8, bytes32, bytes32, address'),
            [1, chequeId as Hex, proofHash, recipient as Hex]
        );

        const reportRequest = prepareReportRequest(reportPayload);
        const report = runtime.report(reportRequest).result();

        const sourceNetwork = getNetwork({
            chainFamily: 'evm',
            chainSelectorName: sourceChain.chainName,
            isTestnet: true
        });

        if (!sourceNetwork) return `Error: Network not found for ${sourceChain.chainName}`;

        const writeClient = new cre.capabilities.EVMClient(sourceNetwork.chainSelector.selector);

        console.log(`[VerifyOracle] Writing release report to ${sourceChain.chainName} (${sourceChain.cashierAddress})...`);

        const writeResult = writeClient.writeReport(runtime, {
            receiver: sourceChain.cashierAddress,
            report: report,
            gasConfig: { gasLimit: '300000' },
        }).result();

        return `Success: Release report written for cheque ${chequeId}. Recipient: ${recipient}. Tx Status: ${writeResult.txStatus}`;

    } catch (e: any) {
        console.error(`[VerifyOracle] Failed to execute: ${e.message}`);
        return `Error: ${e.message}`;
    }
}

// ============================================================================
// Workflow Init
// ============================================================================

const initWorkflow = (config: Config) => {
    const httpTrigger = new cre.capabilities.HTTPCapability().trigger({});

    return [
        cre.handler(
            httpTrigger,
            onHttpTrigger
        )
    ];
}

export async function main() {
    const runner = await Runner.newRunner<Config>({
        configSchema: ConfigSchema,
    });

    await runner.run(initWorkflow);
}
