// script/generate_proof_inputs.js
// Comprehensive RLP parser for eth_getProof to Noir MPT format
const ethers = require('ethers');
const fs = require('fs');
const path = require('path');
const { poseidon2Hash } = require('@zkpassport/poseidon2');

// RLP Decoding utilities
function decodeRlp(data) {
    if (typeof data === 'string') {
        data = Buffer.from(data.slice(2), 'hex');
    }
    return decodeRlpItem(data, 0)[0];
}

function decodeRlpItem(data, offset) {
    const prefix = data[offset];

    if (prefix <= 0x7f) {
        // Single byte
        return [[data[offset]], offset + 1];
    } else if (prefix <= 0xb7) {
        // Short string (0-55 bytes)
        const length = prefix - 0x80;
        return [data.slice(offset + 1, offset + 1 + length), offset + 1 + length];
    } else if (prefix <= 0xbf) {
        // Long string
        const lengthOfLength = prefix - 0xb7;
        let length = 0;
        for (let i = 0; i < lengthOfLength; i++) {
            length = length * 256 + data[offset + 1 + i];
        }
        return [data.slice(offset + 1 + lengthOfLength, offset + 1 + lengthOfLength + length),
        offset + 1 + lengthOfLength + length];
    } else if (prefix <= 0xf7) {
        // Short list (0-55 bytes total)
        const length = prefix - 0xc0;
        return decodeRlpList(data, offset + 1, length);
    } else {
        // Long list
        const lengthOfLength = prefix - 0xf7;
        let length = 0;
        for (let i = 0; i < lengthOfLength; i++) {
            length = length * 256 + data[offset + 1 + i];
        }
        return decodeRlpList(data, offset + 1 + lengthOfLength, length);
    }
}

function decodeRlpList(data, offset, length) {
    const endOffset = offset + length;
    const items = [];
    while (offset < endOffset) {
        const [item, newOffset] = decodeRlpItem(data, offset);
        items.push(item);
        offset = newOffset;
    }
    return [items, offset];
}

// Parse proof node into Noir MPT Node format
function parseProofNode(proofHex) {
    const decoded = decodeRlp(proofHex);

    // Initialize rows and row_exist
    const rows = Array(16).fill(null).map(() => Array(32).fill(0));
    const row_exist = Array(16).fill(false);
    let node_type = 0;

    if (Array.isArray(decoded) && decoded.length === 17) {
        // Branch node: 16 children + value
        node_type = 0;
        for (let i = 0; i < 16; i++) {
            if (decoded[i] && decoded[i].length === 32) {
                row_exist[i] = true;
                for (let j = 0; j < 32; j++) {
                    rows[i][j] = decoded[i][j] || 0;
                }
            } else if (decoded[i] && decoded[i].length > 0) {
                // Embedded node (hash it)
                row_exist[i] = true;
                const hash = ethers.keccak256(proofHex);
                const hashBytes = Buffer.from(hash.slice(2), 'hex');
                for (let j = 0; j < 32 && j < hashBytes.length; j++) {
                    rows[i][j] = hashBytes[j];
                }
            }
        }
    } else if (Array.isArray(decoded) && decoded.length === 2) {
        // Extension or Leaf node
        const firstNibble = (decoded[0][0] >> 4) & 0x0f;
        if (firstNibble === 0 || firstNibble === 1) {
            // Extension node
            node_type = 1;
            // rows[0] = [first_nibble, second_nibble, key_length, ...]
            rows[0][0] = (decoded[0][0] >> 4) & 0x0f;
            rows[0][1] = decoded[0][0] & 0x0f;
            rows[0][2] = decoded[0].length - 1;
            // rows[1] = key (rest of bytes)
            for (let i = 1; i < decoded[0].length && i <= 32; i++) {
                rows[1][i - 1] = decoded[0][i] || 0;
            }
            // rows[2] = value (child hash)
            if (decoded[1].length === 32) {
                for (let i = 0; i < 32; i++) {
                    rows[2][i] = decoded[1][i] || 0;
                }
            }
            row_exist[0] = true;
            row_exist[1] = true;
            row_exist[2] = true;
        } else {
            // Leaf node (terminal) - prefix 2 or 3
            // Don't include in verify_nodes - handled by verify_leaf_node
            return { rows, row_exist, node_type: 0, isLeaf: true };
        }
    }

    return { rows, row_exist, node_type, isLeaf: false };
}

// Parse Account from RLP
function parseAccount(accountRlp, address) {
    const decoded = decodeRlp(accountRlp);

    // Decode: [nonce, balance, storageHash, codeHash]
    const nonceBytes = decoded[0] || [];
    const balanceBytes = decoded[1] || [];
    const storageHash = decoded[2] || Array(32).fill(0);
    const codeHash = decoded[3] || Array(32).fill(0);

    // Pad to expected sizes
    const nonce = Array(8).fill(0);
    for (let i = 0; i < nonceBytes.length && i < 8; i++) {
        nonce[i] = nonceBytes[i];
    }

    const balance = Array(32).fill(0);
    for (let i = 0; i < balanceBytes.length && i < 32; i++) {
        balance[i] = balanceBytes[i];
    }

    const storageHashArr = Array(32).fill(0);
    for (let i = 0; i < storageHash.length && i < 32; i++) {
        storageHashArr[i] = storageHash[i];
    }

    const codeHashArr = Array(32).fill(0);
    for (let i = 0; i < codeHash.length && i < 32; i++) {
        codeHashArr[i] = codeHash[i];
    }

    return {
        nonce,
        nonce_length: nonceBytes.length,
        balance,
        balance_length: balanceBytes.length,
        address: hexToBytes(address, 20),
        storage_hash: storageHashArr,
        code_hash: codeHashArr
    };
}

// Parse StorageSlot from RLP-decoded leaf
function parseStorageSlotFromRLP(slotKey, storageProof) {
    // If there's no proof, return zeros
    if (!storageProof || storageProof.length === 0) {
        return {
            slot_numebr: hexToBytes(slotKey, 32),
            value: Array(32).fill(0),
            value_length: 0
        };
    }

    // Get the last proof node (the leaf)
    const leafHex = storageProof[storageProof.length - 1];
    const leafDecoded = decodeRlp(leafHex);
    // leafDecoded = [key, value]
    const leafValue = leafDecoded[1];

    // The value is RLP-decoded already - just use it directly
    const valueBytes = Array.from(leafValue);
    const valuePadded = new Array(32).fill(0);
    for (let i = 0; i < valueBytes.length && i < 32; i++) {
        valuePadded[i] = valueBytes[i];
    }

    console.log(`Storage value from RLP: length=${valueBytes.length}, value[0]=${valueBytes[0] || 0}`);

    return {
        slot_numebr: hexToBytes(slotKey, 32),
        value: valuePadded,
        value_length: valueBytes.length
    };
}

function hexToBytes(hex, length) {
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const padded = clean.padStart(length * 2, '0');
    const result = [];
    for (let i = 0; i < length; i++) {
        result.push(parseInt(padded.slice(i * 2, i * 2 + 2), 16));
    }
    return result;
}

function bytesToToml(arr) {
    return `[${arr.join(', ')}]`;
}

function boolToToml(arr) {
    return `[${arr.map(b => b ? 'true' : 'false').join(', ')}]`;
}

function nodeToToml(node) {
    const rowsStr = node.rows.map(row => `[${row.join(', ')}]`).join(', ');
    return `node_type = "${node.node_type}"
row_exist = ${boolToToml(node.row_exist)}
rows = [${rowsStr}]`;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 5) {
        console.log("Usage: node generate_proof_inputs.js <rpcUrl> <vaultAddress> <noteIndex> <recipient> <privateKey>");
        process.exit(1);
    }

    const [rpcUrl, vaultAddress, noteIndexArg, recipient, privateKey] = args;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey);
    const noteIndex = BigInt(noteIndexArg);
    const denomination = 100n;

    console.log(`\n=== Generating Prover.toml with RLP parsing ===`);
    console.log(`Vault: ${vaultAddress}`);
    console.log(`Depositor: ${wallet.address}`);

    // Calculate storage slot
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const innerSlot = ethers.keccak256(
        abiCoder.encode(["address", "uint256"], [wallet.address, 0])
    );
    const slotKey = ethers.keccak256(
        abiCoder.encode(["uint256", "bytes32"], [denomination, innerSlot])
    );

    console.log(`Storage Slot: ${slotKey}`);

    // Fetch proofs
    const proof = await provider.send("eth_getProof", [vaultAddress, [slotKey], "latest"]);
    const block = await provider.getBlock("latest");

    console.log(`State Root: ${block.stateRoot}`);
    console.log(`Storage Value: ${proof.storageProof[0].value}`);
    console.log(`Account Proof Nodes: ${proof.accountProof.length}`);
    console.log(`Storage Proof Nodes: ${proof.storageProof[0].proof.length}`);

    // Parse account proof nodes (excluding leaf nodes)
    const MAX_DEPTH = 10;
    const accountNodesRaw = proof.accountProof.map(p => parseProofNode(p)).filter(n => !n.isLeaf);
    const accountNodes = [];
    for (let i = 0; i < MAX_DEPTH; i++) {
        if (i < accountNodesRaw.length) {
            accountNodes.push(accountNodesRaw[i]);
        } else {
            accountNodes.push({
                rows: Array(16).fill(null).map(() => Array(32).fill(0)),
                row_exist: Array(16).fill(false),
                node_type: 0,
                isLeaf: false
            });
        }
    }
    console.log(`Account proof nodes (non-leaf): ${accountNodesRaw.length}`);

    // Parse storage proof nodes (excluding leaf nodes)
    const storageNodesRaw = proof.storageProof[0].proof.map(p => parseProofNode(p)).filter(n => !n.isLeaf);
    const storageNodes = [];
    for (let i = 0; i < MAX_DEPTH; i++) {
        if (i < storageNodesRaw.length) {
            storageNodes.push(storageNodesRaw[i]);
        } else {
            storageNodes.push({
                rows: Array(16).fill(null).map(() => Array(32).fill(0)),
                row_exist: Array(16).fill(false),
                node_type: 0,
                isLeaf: false
            });
        }
    }
    console.log(`Storage proof nodes (non-leaf): ${storageNodesRaw.length}`);

    // Calculate leaf hashes
    const accountLeafHash = proof.accountProof.length > 0
        ? hexToBytes(ethers.keccak256(proof.accountProof[proof.accountProof.length - 1]), 32)
        : Array(32).fill(0);
    const storageLeafHash = proof.storageProof[0].proof.length > 0
        ? hexToBytes(ethers.keccak256(proof.storageProof[0].proof[proof.storageProof[0].proof.length - 1]), 32)
        : Array(32).fill(0);

    // Parse account data directly from RLP-decoded leaf
    // The account leaf is the last item in accountProof
    const accountLeafHex = proof.accountProof[proof.accountProof.length - 1];
    const accountLeafDecoded = decodeRlp(accountLeafHex);
    // accountLeafDecoded = [key, value] where value is RLP-encoded account
    const accountRlpValue = accountLeafDecoded[1];
    // Decode the account: [nonce, balance, storageHash, codeHash]
    const accountData = decodeRlp(Buffer.from(accountRlpValue));

    // Extract with correct byte lengths
    const nonceBytes = accountData[0].length > 0 ? Array.from(accountData[0]) : [];
    const balanceBytes = accountData[1].length > 0 ? Array.from(accountData[1]) : [];
    const storageHashBytes = Array.from(accountData[2]);
    const codeHashBytes = Array.from(accountData[3]);

    // Pad to expected sizes
    const noncePadded = new Array(8).fill(0);
    for (let i = 0; i < nonceBytes.length && i < 8; i++) {
        noncePadded[i] = nonceBytes[i];
    }
    const balancePadded = new Array(32).fill(0);
    for (let i = 0; i < balanceBytes.length && i < 32; i++) {
        balancePadded[i] = balanceBytes[i];
    }

    const account = {
        nonce: noncePadded,
        nonce_length: nonceBytes.length,
        balance: balancePadded,
        balance_length: balanceBytes.length,
        address: hexToBytes(vaultAddress, 20),
        storage_hash: storageHashBytes,
        code_hash: codeHashBytes
    };

    console.log(`Account from RLP: nonce_length=${account.nonce_length}, balance_length=${account.balance_length}`);

    // Calculate trie key indices (nibbles consumed before reaching leaf)
    // For shallow tries, this is the number of non-leaf nodes (each branch consumes 1 nibble)
    // Extension nodes consume variable nibbles based on their key length
    let accountTrieKeyIndex = 0;
    for (const node of accountNodesRaw) {
        if (node.node_type === 0) {
            // Branch node consumes 1 nibble
            accountTrieKeyIndex += 1;
        } else if (node.node_type === 1) {
            // Extension node - would need to parse key length
            // For now, estimate based on typical extension
            accountTrieKeyIndex += 2;
        }
    }
    console.log(`Account trie key index (nibbles consumed): ${accountTrieKeyIndex}`);

    let storageTrieKeyIndex = 0;
    for (const node of storageNodesRaw) {
        if (node.node_type === 0) {
            storageTrieKeyIndex += 1;
        } else if (node.node_type === 1) {
            storageTrieKeyIndex += 2;
        }
    }
    console.log(`Storage trie key index (nibbles consumed): ${storageTrieKeyIndex}`);

    // Parse storage slot
    const storageSlot = parseStorageSlotFromRLP(slotKey, proof.storageProof[0].proof);

    // === SIGNATURE GENERATION ===
    // Message = keccak256(100 || recipient || noteIndex)
    // The circuit expects this exact format
    const denomBytes = Buffer.alloc(32);
    denomBytes[31] = 100; // denomination = 100
    const recipientBytes = Buffer.from(BigInt(recipient).toString(16).padStart(64, '0'), 'hex');
    const noteIndexBytes = Buffer.from(noteIndex.toString(16).padStart(64, '0'), 'hex');

    const sigMsgPreimage = Buffer.concat([denomBytes, recipientBytes, noteIndexBytes]);
    const msgHash = ethers.keccak256(sigMsgPreimage);
    console.log(`Message hash for signature: ${msgHash}`);

    // Sign the message with the depositor's private key
    const signingKey = new ethers.SigningKey(privateKey);
    const sig = signingKey.sign(msgHash);

    // Extract r, s (each 32 bytes)
    const rBytes = hexToBytes(sig.r, 32);
    const sBytes = hexToBytes(sig.s, 32);
    const signature = [...rBytes, ...sBytes];

    // Get public key coordinates
    const pubKey = signingKey.publicKey; // 0x04 + X (32 bytes) + Y (32 bytes)
    const pubKeyX = hexToBytes('0x' + pubKey.slice(4, 68), 32);
    const pubKeyY = hexToBytes('0x' + pubKey.slice(68, 132), 32);

    console.log(`PubKeyX: ${pubKey.slice(4, 68).slice(0, 16)}...`);
    console.log(`PubKeyY: ${pubKey.slice(68, 132).slice(0, 16)}...`);
    console.log(`Signature R: ${sig.r.slice(0, 18)}...`);
    console.log(`Signature S: ${sig.s.slice(0, 18)}...`);

    // Compute nullifier hash using Poseidon2 (matches Noir's poseidon2::Poseidon2::hash)
    // The circuit computes: poseidon2([recoveredAddress, 100, noteIndex])
    const addressBigInt = BigInt(wallet.address);
    const nullifierHashBigInt = poseidon2Hash([addressBigInt, 100n, noteIndex]);
    const nullifierHash = nullifierHashBigInt.toString();
    console.log(`Nullifier hash (Poseidon2): 0x${nullifierHashBigInt.toString(16).slice(0, 16)}...`);

    const sigData = {
        pubKeyX,
        pubKeyY,
        signature
    };

    // Generate TOML
    let toml = `# Auto-generated Prover.toml
# Generated: ${new Date().toISOString()}

# === PUBLIC INPUTS ===
root = ${bytesToToml(hexToBytes(block.stateRoot, 32))}
recipient = "${BigInt(recipient).toString()}"
nullifierHash = "${nullifierHash}"
vaultAddress = ${bytesToToml(hexToBytes(vaultAddress, 20))}

# === PRIVATE INPUTS ===
slot = ${bytesToToml(hexToBytes(slotKey, 32))}
noteIndex = "${noteIndex.toString()}"
accountTrieKeyIndex = ${accountTrieKeyIndex}
storageTrieKeyIndex = ${storageTrieKeyIndex}

# === WITNESSES ===
vaultAccountProofLen = ${accountNodesRaw.length}
vaultAccountLeafHash = ${bytesToToml(accountLeafHash)}
storageProofLen = ${storageNodesRaw.length}
storageLeafHash = ${bytesToToml(storageLeafHash)}

# Signature
pubKeyX = ${bytesToToml(sigData.pubKeyX)}
pubKeyY = ${bytesToToml(sigData.pubKeyY)}
signature = ${bytesToToml(sigData.signature)}

# Account Proof Nodes
${accountNodes.map((n, i) => `[[vaultAccountProof]]\n${nodeToToml(n)}\n`).join('\n')}

# Storage Proof Nodes
${storageNodes.map((n, i) => `[[storageProof]]\n${nodeToToml(n)}\n`).join('\n')}

# Account Data
[vaultAccount]
address = ${bytesToToml(account.address)}
nonce = ${bytesToToml(account.nonce)}
nonce_length = "${account.nonce_length}"
balance = ${bytesToToml(account.balance)}
balance_length = "${account.balance_length}"
storage_hash = ${bytesToToml(account.storage_hash)}
code_hash = ${bytesToToml(account.code_hash)}

# Storage Value
[storageValue]
slot_numebr = ${bytesToToml(storageSlot.slot_numebr)}
value = ${bytesToToml(storageSlot.value)}
value_length = "${storageSlot.value_length}"
`;

    // Write file
    const outputPath = path.join(__dirname, '..', 'circuits', 'Prover.toml');
    fs.writeFileSync(outputPath, toml);
    console.log(`\n✅ Prover.toml written to: ${outputPath}`);
}

main().catch(console.error);
