import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cheque, generateMockTxHash, getExplorerUrl, shortenHash } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { Banknote, ExternalLink, PartyPopper, Loader2 } from "lucide-react";

interface RedemptionPanelProps {
  cheque: Cheque;
  onRedeemed: () => void;
}

export function RedemptionPanel({ cheque, onRedeemed }: RedemptionPanelProps) {
  const [status, setStatus] = useState<"ready" | "processing" | "settled">(cheque.redeemed ? "settled" : "ready");
  const [txHash, setTxHash] = useState<string | null>(cheque.settlementTxHash || null);

  async function handleRedeem() {
    setStatus("processing");
    // Simulate API call to POST /api/v1/settlement/redeem
    await new Promise(r => setTimeout(r, 2500));
    const hash = generateMockTxHash();
    setTxHash(hash);
    setStatus("settled");
    onRedeemed();
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
            <Button onClick={handleRedeem} className="w-full h-12 gap-2 glow-green text-base font-semibold">
              <Banknote className="w-5 h-5" /> Redeem {cheque.denomination} USDC
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
