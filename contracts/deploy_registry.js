const { createWalletClient, http, encodeDeployData } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { optimismSepolia } = require('viem/chains');
const fs = require('fs');

async function main() {
    const pk = process.env.PRIVATE_KEY;
    if (!pk.startsWith('0x')) process.env.PRIVATE_KEY = '0x' + pk;
    
    const account = privateKeyToAccount(process.env.PRIVATE_KEY);
    const client = createWalletClient({
        account,
        chain: optimismSepolia,
        // using public endpoint
        transport: http("https://sepolia.optimism.io")
    });

    const bytecode = fs.readFileSync('/tmp/proof_registry_bytecode.txt', 'utf8').trim();
    // the ABI needs the constructor: constructor(address _forwarderAddress)
    const abi = [{"inputs":[{"internalType":"address","name":"_forwarderAddress","type":"address"}],"stateMutability":"nonpayable","type":"constructor"}];
    const forwarderAddress = "0xA2888380dFF3704a8AB6D1CD1A8f69c15FEa5EE3";

    console.log("Preparing deployment...");
    const data = encodeDeployData({
        abi,
        bytecode,
        args: [forwarderAddress]
    });

    console.log("Broadcasting from: " + account.address);
    try {
        const txHash = await client.sendTransaction({
            to: null,
            data
        });
        console.log("Deploy hash:", txHash);
    } catch(e) {
        console.error(e);
    }
}
main();
