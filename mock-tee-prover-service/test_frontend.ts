import crypto from 'crypto';

// The symmetric AES-256-GCM key used to encrypt the payload.
// MUST match the key in the decryptor module.
const RAW_KEY = process.env.CC_ENCRYPTION_KEY || 'san_marino_mock_encryption_key_1234567890'; // 32 bytes fallback

// Ensure key is exactly 32 bytes for AES-256
const getEncryptionKey = (): Buffer => {
    return crypto.createHash('sha256').update(RAW_KEY).digest();
};

/**
 * Encrypts a payload into an AES-256-GCM base64 string.
 * Output format: base64 string containing concatenated [iv (12 bytes) + authTag (16 bytes) + ciphertext]
 */
export function encryptPayload(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8');
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);

    const authTag = cipher.getAuthTag();

    const encryptedBuffer = Buffer.concat([iv, authTag, ciphertext]);
    return encryptedBuffer.toString('base64');
}

// Construct our mock frontend payload
const mockWitnessParams = {
    rpcUrl: "http://127.0.0.1:8545",
    contractAddress: "0x1234567890123456789012345678901234567890",
    depositorAddress: "0x0000000000000000000000000000000000000000",
    recipient: "0",
    nonce: 1,
    targetChainId: 11155420,  // OP Sepolia to trigger the correct oracle config
    denomination: 1000,
    privateKey: "0x1234567890123456789012345678901234567890123456789012345678901234" // Mock private key for local test
};

// Encrypt the payload simulating the frontend CC setup
const plaintextJSON = JSON.stringify(mockWitnessParams);
const encryptedPayload = encryptPayload(plaintextJSON);

console.log("=== Mock Frontend ===");
console.log("Original Payload:", plaintextJSON);
console.log("\nAES-GCM Encrypted Ciphertext:\n", encryptedPayload);

// Dispatch to backend
console.log("\nDispatching to POST http://localhost:3000/api/prove ...");

fetch("http://localhost:3000/api/prove", {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({ encryptedPayload })
}).then(res => res.json())
    .then(data => console.log("\nBackend CC-Enclave Response:", data))
    .catch(err => console.error("Fetch Error:", err));
