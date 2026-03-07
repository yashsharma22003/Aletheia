import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GeometricLoader } from "@/components/shared/GeometricLoader";
import { Cheque, shortenHash } from "@/lib/mock-data";
import { updateCheque } from "@/lib/cheque-store";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, AlertTriangle, CheckCircle2, Wallet, PenTool, Link2Off, ChevronDown, ChevronUp } from "lucide-react";
import { useAccount, usePublicClient, useChainId } from "wagmi";
import { useEffect, useRef } from "react";
import { CHAINS } from "@/lib/mock-data";

interface ProvingEngineProps {
  cheque: Cheque;
  onVerified: () => void;
  /** Called with the wallet signature as soon as the user signs */
  onSigned?: (signature: string) => void;
}

type ProvingStage = "idle" | "signing" | "fetching_proof" | "submitting" | "verified" | "error";

const STAGE_LABELS: Record<string, string> = {
  signing: "Requesting wallet signature (personal_sign)...",
  fetching_proof: "Fetching raw 50MB ZK Proof from Prover Service DB...",
  submitting: "Submitting Proof + Signature to TEE Verification Enclave...",
};

export function ProvingEngine({ cheque, onVerified, onSigned }: ProvingEngineProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const [stage, setStage] = useState<ProvingStage>("idle");
  const [proofHash, setProofHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipientAddress, setRecipientAddress] = useState(address || "");
  const [signed, setSigned] = useState(false);
  const [signing, setSigning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Prover Service State
  const [serverUrl, setServerUrl] = useState("http://localhost:3000");

  // Derived state from active Wagmi Connection
  const activeChainInfo = CHAINS.find(c => c.id === chainId);
  const defaultRpcUrl = activeChainInfo?.rpcUrl || "https://sepolia.infura.io/v3/7bdf797390454aa4bddf06fe6b361d54";
  const defaultCashier = activeChainInfo?.cashierAddress || "0xd32e613a93f8D683A45163692f9B5eFE03E77Ba9";

  const [sourceRpcUrl, setSourceRpcUrl] = useState(defaultRpcUrl);
  const [sourceContractAddress, setSourceContractAddress] = useState(defaultCashier);
  const [depositorAddress, setDepositorAddress] = useState("");
  const [nonce, setNonce] = useState("0");
  const [customTargetChain, setCustomTargetChain] = useState(cheque.targetChainId.toString());
  const [walletSignature, setWalletSignature] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state if wallet switches network
  useEffect(() => {
    if (activeChainInfo?.cashierAddress) setSourceContractAddress(activeChainInfo.cashierAddress);
    if (activeChainInfo?.rpcUrl) setSourceRpcUrl(activeChainInfo.rpcUrl);
  }, [chainId, activeChainInfo]);

  // Cleanup interval on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (address && !recipientAddress) setRecipientAddress(address);
  }, [address, recipientAddress]);

  // Matches the backend symmetric key for the mock environment
  const RAW_KEY = 'san_marino_mock_encryption_key_1'; // Exactly 32 bytes

  async function encryptPayload(plaintext: string): Promise<string> {
    const enc = new TextEncoder();
    const rawKey = enc.encode(RAW_KEY);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', rawKey);

    const key = await window.crypto.subtle.importKey(
      'raw', hashBuffer, { name: 'AES-GCM' }, false, ['encrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, key, enc.encode(plaintext)
    );

    const encryptedBytes = new Uint8Array(encryptedBuffer);
    const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
    const authTag = encryptedBytes.slice(encryptedBytes.length - 16);

    const finalBuffer = new Uint8Array(iv.length + authTag.length + ciphertext.length);
    finalBuffer.set(iv, 0);
    finalBuffer.set(authTag, iv.length);
    finalBuffer.set(ciphertext, iv.length + authTag.length);

    let binary = '';
    for (let i = 0; i < finalBuffer.length; i++) binary += String.fromCharCode(finalBuffer[i]);
    return window.btoa(binary);
  }

  // Sanitize cheque.id — handles full Magic Link URLs, bare 0x hashes, or legacy random IDs
  function extractCleanChequeId(): string | undefined {
    const raw = cheque.id?.trim();
    if (!raw) return undefined;
    // If it's a full URL, extract the ?id= param
    try {
      const url = new URL(raw);
      const id = url.searchParams.get('id');
      if (id && /^0x[0-9a-fA-F]{64}$/.test(id)) return id;
    } catch { /* not a URL */ }
    // If it's a bare bytes32 hex (with or without 0x)
    const hexRegex = /^(?:0x)?([0-9a-fA-F]{64})$/;
    const match = raw.match(hexRegex);
    if (match) return `0x${match[1]}`;

    // Otherwise (random mock ID) — let server compute from nonce
    return undefined;
  }

  async function handleSign() {
    if (!window.ethereum || !address) {
      setError("Wallet not connected");
      setStage("error");
      return;
    }

    try {
      setSigning(true);
      setError(null);
      setStage("signing");

      const serverRaw = serverUrl.replace(/\/$/, '');
      const paramsRes = await fetch(`${serverRaw}/api/sign-params`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depositorAddress: depositorAddress || address,
          nonce: parseInt(nonce || "0"),
          recipient: recipientAddress,
          targetChainId: parseInt(customTargetChain),
          chequeId: extractCleanChequeId(), // ← Pass the real on-chain chequeId from Magic Link
        }),
      });
      const paramsData = await paramsRes.json();
      if (paramsData.error) throw new Error(paramsData.error);

      // Cast window.ethereum to any to avoid TS errors
      const sig = await (window.ethereum as any).request({
        method: 'personal_sign',
        params: [paramsData.messageHash, address],
      });

      setWalletSignature(sig);
      setSigned(true);
      setStage("idle");
      // Persist the signature into the cheque store so RedemptionPanel can auto-fill it
      updateCheque(cheque.id, { walletSignature: sig });
      onSigned?.(sig);

    } catch (err: any) {
      setError(err.message || "Signing failed");
      setStage("error");
    } finally {
      setSigning(false);
    }
  }

  async function runProvingFlow() {
    if (!walletSignature) return;

    try {
      setError(null);
      setStage("fetching_proof");

      const serverRaw = serverUrl.replace(/\/$/, '');
      const bodyJSON = JSON.stringify({
        sourceRpcUrl: sourceRpcUrl || defaultRpcUrl,
        sourceContractAddress: sourceContractAddress || defaultCashier,
        depositorAddress: depositorAddress || address,
        recipient: recipientAddress,
        nonce: parseInt(nonce || "0"),
        sourceChainId: cheque.sourceChainId,
        targetChainId: parseInt(customTargetChain),
        denomination: cheque.denomination,
        chequeId: extractCleanChequeId(),  // Sanitized: bare 0x... or undefined (fallback to nonce)
        signature: walletSignature,
      });

      console.log("[ProvingEngine] Sending payload to prover:", bodyJSON);

      const encryptedPayload = await encryptPayload(bodyJSON);

      const res = await fetch(`${serverRaw}/api/prove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encryptedPayload }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const currentJobId = data.jobId;
      setStage("submitting");

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${serverRaw}/api/prove/${currentJobId}`);
          const pollData = await pollRes.json();

          if (pollData.status === 'completed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            setProofHash(currentJobId); // Just store job ID as proxy for hash visual
            setStage("verified");
            setTimeout(onVerified, 1500);
          } else if (pollData.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            throw new Error(pollData.error || "Proof generation failed on server");
          }
        } catch (e: any) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setError(e.message || "Polling failed");
          setStage("error");
        }
      }, 3000);

    } catch (e: any) {
      setError(e.message || "Request failed");
      setStage("error");
    }
  }

  function handleError() {
    setError("Local Proof Generation Failed. Ensure your wallet signature is correct and your device has sufficient memory.");
    setStage("error");
  }

  return (
    <Card className="glass-panel border-glass-border overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Cpu className="w-5 h-5 text-accent" />
          Step 2 — Proving Engine (Validation)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pb-6">
        <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
          <p className="text-xs text-accent">
            ⚠ This step verifies your proof. No funds are released yet.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {stage === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="recipient" className="text-xs text-muted-foreground">Recipient Address</Label>
                  <Input
                    id="recipient"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    className="font-mono text-xs bg-background/50 border-glass-border"
                    placeholder="0x..."
                  />
                </div>

                <div className="pt-2 border-t border-glass-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground flex justify-between px-2"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    Advanced Configuration {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </Button>

                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-3 pt-3"
                      >
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Prover Service URL</Label>
                          <Input value={serverUrl} onChange={e => setServerUrl(e.target.value)} className="font-mono text-xs h-8" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Source RPC URL</Label>
                          <Input value={sourceRpcUrl} onChange={e => setSourceRpcUrl(e.target.value)} className="font-mono text-xs h-8" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Source Cashier Address</Label>
                          <Input value={sourceContractAddress} onChange={e => setSourceContractAddress(e.target.value)} className="font-mono text-xs h-8" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Depositor Address</Label>
                            <Input placeholder={address || "0x..."} value={depositorAddress} onChange={e => setDepositorAddress(e.target.value)} className="font-mono text-[10px] h-8" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Nonce</Label>
                            <Input type="number" value={nonce} onChange={e => setNonce(e.target.value)} className="font-mono text-xs h-8" />
                          </div>
                          <div className="space-y-1.5 col-span-2">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Target Chain ID</Label>
                            <Input type="number" value={customTargetChain} onChange={e => setCustomTargetChain(e.target.value)} className="font-mono text-xs h-8" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {!isConnected ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 mt-4">
                  <Link2Off className="w-4 h-4 text-destructive" />
                  <span className="text-sm text-destructive font-medium">Please connect your wallet first.</span>
                </div>
              ) : !signed ? (
                <Button
                  onClick={handleSign}
                  disabled={signing || !recipientAddress}
                  className="w-full gap-2 glow-amethyst bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {signing ? (
                    <><PenTool className="w-4 h-4 animate-pulse" /> Requesting Signature...</>
                  ) : (
                    <><Wallet className="w-4 h-4" /> Sign (Wallet Signature)</>
                  )}
                </Button>
              ) : (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span className="text-sm text-primary font-medium">Signature Obtained</span>
                </div>
              )}

              <Button
                onClick={runProvingFlow}
                disabled={!signed}
                size="lg"
                className="w-full gap-2 glow-amethyst bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Cpu className="w-4 h-4" /> Generate Claim Proof
              </Button>
            </motion.div>
          )}

          {["signing", "fetching_proof", "submitting"].includes(stage) && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-6">
              <GeometricLoader stage={STAGE_LABELS[stage]} color="accent" size={80} />

              {/* Progress dots */}
              <div className="flex items-center gap-2 mt-6">
                {["signing", "fetching_proof", "submitting"].map((s, i) => {
                  const stageIdx = ["signing", "fetching_proof", "submitting"].indexOf(stage as string);
                  return (
                    <div
                      key={s}
                      className={`w-2 h-2 rounded-full transition-all ${i <= stageIdx ? "bg-accent" : "bg-muted"
                        }`}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}



          {stage === "verified" && (
            <motion.div key="verified" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6 space-y-3">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
                <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
              </motion.div>
              <p className="text-sm font-medium text-primary">Verification successful within TEE Enclave</p>
              <p className="text-xs text-muted-foreground">Compliance validated. Proceeding to redemption...</p>
            </motion.div>
          )}

          {stage === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Proof Generation Failed</p>
                  <p className="text-xs text-muted-foreground mt-1">{error}</p>
                </div>
              </div>
              <Button onClick={() => { setStage("idle"); setSigned(false); }} variant="outline" className="w-full border-glass-border">
                Reset Proving Engine
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
