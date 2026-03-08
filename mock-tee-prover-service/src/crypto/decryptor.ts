import crypto from 'crypto';

// The symmetric AES-256-GCM key used to encrypt the payload.
// In a true CC environment, this is injected securely via Key Management Service (KMS) or Remote Attestation.
// For our local mock, we load it from the environment.
const RAW_KEY = process.env.CC_ENCRYPTION_KEY || 'san_marino_mock_encryption_key_1'; //Exactly 32 bytes

// Ensure key is exactly 32 bytes for AES-256
const getEncryptionKey = (): Buffer => {
    // Basic hash to ensure exactly 32 bytes if the raw key is not
    return crypto.createHash('sha256').update(RAW_KEY).digest();
};

/**
 * Decrypts an AES-256-GCM encrypted payload.
 * Expected input format: base64 string containing concatenated [iv (12 bytes) + authTag (16 bytes) + ciphertext]
 */
export function decryptPayload(encryptedBase64: string): string {
    try {
        const key = getEncryptionKey();
        const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');

        // Extract components: [IV (12 bytes)][AuthTag (16 bytes)][Ciphertext]
        const iv = encryptedBuffer.subarray(0, 12);
        const authTag = encryptedBuffer.subarray(12, 28);
        const ciphertext = encryptedBuffer.subarray(28);

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, undefined, 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error: any) {
        throw new Error(`Failed to decrypt payload within CC mock: ${error.message}`);
    }
}
