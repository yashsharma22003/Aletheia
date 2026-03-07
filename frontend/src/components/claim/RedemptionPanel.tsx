import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cheque, getExplorerUrl, shortenHash } from "@/lib/mock-data";
import { motion, AnimatePresence } from "framer-motion";
import { Banknote, ExternalLink, PartyPopper, Loader2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useAccount } from "wagmi";
import { useEffect, useRef } from "react";

interface RedemptionPanelProps {
  cheque: Cheque;
  onRedeemed: () => void;
}

export function RedemptionPanel({ cheque, onRedeemed }: RedemptionPanelProps) {
  const { address } = useAccount();
  const [status, setStatus] = useState<"ready" | "processing" | "settled" | "error">(cheque.redeemed ? "settled" : "ready");
  const [txHash, setTxHash] = useState<string | null>(cheque.settlementTxHash || null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Prover Service State
  const [serverUrl, setServerUrl] = useState("http://localhost:3000");
  const [recipient, setRecipient] = useState(address || "");

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup interval on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (address && !recipient) setRecipient(address);
  }, [address, recipient]);

  // Sanitize cheque.id — handles full Magic Link URLs, bare 0x hashes, or legacy random IDs
  function extractCleanChequeId(): string {
    const raw = cheque.id;
    if (!raw) return raw;
    // If it's a full URL, extract the ?id= param
    try {
      const url = new URL(raw);
      const id = url.searchParams.get('id');
      if (id && /^0x[0-9a-fA-F]{64}$/.test(id)) return id;
    } catch { /* not a URL */ }
    // If it's a bare bytes32 hex
    if (/^0x[0-9a-fA-F]{64}$/.test(raw)) return raw;
    // Otherwise return as-is (server side will handle)
    return raw;
  }

  async function handleRedeem() {
    setStatus("processing");
    setErrorMsg(null);

    try {
      // Signature is made optional for primary CCIP/CRE path
      // Only thrown if TEE verification service alternative flow explicitly requires it
      // if (!signature) throw new Error("Wallet Signature from the previous Proving phase is required to authorize redemption.");

      const serverRaw = serverUrl.replace(/\/$/, '');
      const bodyJSON = {
        chequeId: extractCleanChequeId(),
        recipientAddress: recipient,
        targetChainId: cheque.targetChainId
      };

      const res = await fetch(`${serverRaw}/api/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyJSON),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const currentJobId = data.jobId;

      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(async () => {
        try {
          // The prover service uses the same get-job endpoint for redeem jobs
          const pollRes = await fetch(`${serverRaw}/api/prove/${currentJobId}`);
          const pollData = await pollRes.json();

          if (pollData.status === 'completed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            // In a real settlement we'd extract the emitted transaction hash. We fallback to jobId if mock.
            setTxHash(pollData.txHash || currentJobId);
            setStatus("settled");
            onRedeemed();
          } else if (pollData.status === 'failed') {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            throw new Error(pollData.error || "Redemption server job failed");
          }
        } catch (e: any) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setErrorMsg(e.message || "Polling failed");
          setStatus("error");
        }
      }, 3000);

    } catch (e: any) {
      setErrorMsg(e.message || "Redemption request failed");
      setStatus("error");
    }
  }

  const explorerUrl = txHash ? getExplorerUrl(cheque.targetChainId, txHash) : "#";

  return (
    <Card className="glass-panel border-glass-border overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Banknote className="w-5 h-5 text-primary" />
          Step 3 — Redemption (Settlement)
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-6">
        {status === "ready" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground">
                Your proof has been verified on-chain. You can now redeem your funds.
                This calls the Settlement API to post the nullifier and trigger the ERC-20 transfer.
              </p>
            </div>
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground flex justify-between px-2 mb-3"
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
                    className="overflow-hidden space-y-3 pb-4"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5 flex flex-col">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Service URL</label>
                        <input value={serverUrl} onChange={e => setServerUrl(e.target.value)} className="w-full font-mono text-xs bg-background/50 border border-glass-border rounded px-2 h-8" />
                      </div>
                      <div className="space-y-1.5 flex flex-col">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Recipient (You)</label>
                        <input value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="0x..." className="w-full font-mono text-[10px] bg-background/50 border border-glass-border rounded px-2 h-8" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button onClick={handleRedeem} className="w-full h-12 gap-2 glow-green text-base font-semibold">
              <Banknote className="w-5 h-5" /> Redeem {cheque.denomination} USDC
            </Button>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Redemption Failed</p>
                <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
              </div>
            </div>
            <Button onClick={() => setStatus("ready")} variant="outline" className="w-full border-glass-border">
              Retry Redemption
            </Button>
          </motion.div>
        )}

        {status === "processing" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-8 gap-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium">Processing redemption...</p>
              <p className="text-xs text-muted-foreground mt-1">Posting nullifier hash and settling funds</p>
            </div>
          </motion.div>
        )}

        {status === "settled" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8 space-y-4"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            >
              <PartyPopper className="w-16 h-16 text-primary mx-auto" />
            </motion.div>
            <div>
              <p className="text-xl font-bold text-primary">{cheque.denomination} USDC Settled!</p>
              <p className="text-sm text-muted-foreground mt-1">Funds have been released to your wallet.</p>
            </div>
            {txHash && (
              <div className="p-3 rounded-lg bg-secondary/30 border border-glass-border inline-block">
                <p className="text-xs text-muted-foreground mb-1">Transaction Hash</p>
                <p className="font-mono text-xs">{shortenHash(txHash, 12)}</p>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent mt-2 hover:underline"
                >
                  View on Explorer <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
