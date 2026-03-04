import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GeometricLoader } from "@/components/shared/GeometricLoader";
import { Cheque, generateMockTxHash, shortenHash, MOCK_WALLET } from "@/lib/mock-data";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, AlertTriangle, CheckCircle2, Wallet, PenTool } from "lucide-react";

interface ProvingEngineProps {
  cheque: Cheque;
  onVerified: () => void;
}

type ProvingStage = "idle" | "signing" | "fetching_mpt" | "compiling_witness" | "synthesizing_snark" | "proof_ready" | "submitting" | "verified" | "error";

const STAGE_LABELS: Record<string, string> = {
  signing: "Requesting wallet signature (personal_sign)...",
  fetching_mpt: "Fetching MPT storage proofs via eth_getProof...",
  compiling_witness: "Compiling Noir witness (nargo execute)...",
  synthesizing_snark: "Synthesizing SNARK via UltraHonk/Barretenberg...",
  submitting: "Submitting proof on-chain for verification...",
};

export function ProvingEngine({ cheque, onVerified }: ProvingEngineProps) {
  const [stage, setStage] = useState<ProvingStage>("idle");
  const [proofHash, setProofHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipientAddress, setRecipientAddress] = useState(MOCK_WALLET.address);
  const [signed, setSigned] = useState(false);
  const [signing, setSigning] = useState(false);

  async function handleSign() {
    setSigning(true);
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    setSigned(true);
    setSigning(false);
  }

  async function runProvingFlow() {
    setError(null);
    const stages: ProvingStage[] = ["signing", "fetching_mpt", "compiling_witness", "synthesizing_snark"];

    for (const s of stages) {
      setStage(s);
      await new Promise(r => setTimeout(r, 1800 + Math.random() * 1200));
    }

    const hash = generateMockTxHash();
    setProofHash(hash);
    setStage("proof_ready");
  }

  async function submitProofOnChain() {
    setStage("submitting");
    await new Promise(r => setTimeout(r, 2000));
    setStage("verified");
    setTimeout(onVerified, 1000);
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

              {!signed ? (
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

          {["signing", "fetching_mpt", "compiling_witness", "synthesizing_snark", "submitting"].includes(stage) && (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center py-6">
              <GeometricLoader stage={STAGE_LABELS[stage]} color="accent" size={80} />

              {/* Progress dots */}
              <div className="flex items-center gap-2 mt-6">
                {["signing", "fetching_mpt", "compiling_witness", "synthesizing_snark"].map((s, i) => {
                  const stageIdx = ["signing", "fetching_mpt", "compiling_witness", "synthesizing_snark"].indexOf(stage as string);
                  return (
                    <div
                      key={s}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i <= stageIdx ? "bg-accent" : "bg-muted"
                      }`}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}

          {stage === "proof_ready" && proofHash && (
            <motion.div key="ready" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-xs text-muted-foreground mb-1">zk-SNARK Proof Generated</p>
                <p className="font-mono text-xs text-primary break-all">{shortenHash(proofHash, 16)}</p>
              </div>
              <Button onClick={submitProofOnChain} className="w-full gap-2 glow-green">
                <CheckCircle2 className="w-4 h-4" /> Submit Proof On-Chain
              </Button>
            </motion.div>
          )}

          {stage === "verified" && (
            <motion.div key="verified" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6 space-y-3">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
                <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
              </motion.div>
              <p className="text-sm font-medium text-primary">Proof verified on-chain — Compliance set to true</p>
              <p className="text-xs text-muted-foreground">Proceeding to redemption...</p>
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
              <Button onClick={() => setStage("idle")} variant="outline" className="w-full border-glass-border">
                Reset Proving Engine
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
