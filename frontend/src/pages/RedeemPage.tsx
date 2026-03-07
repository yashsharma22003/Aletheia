import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RedemptionPanel } from "@/components/claim/RedemptionPanel";
import { Cheque, shortenHash, getChainName } from "@/lib/cheque-types";
import { motion } from "framer-motion";
import { Banknote, ArrowLeft, User, ShieldCheck } from "lucide-react";

export default function RedeemPage() {
  const [searchParams] = useSearchParams();
  const [cheque, setCheque] = useState<Cheque | null>(null);

  const chequeId = searchParams.get("id") || "";
  const chain = Number(searchParams.get("chain")) || 10;
  const schain = Number(searchParams.get("schain")) || 11155111;
  const denom = Number(searchParams.get("denom")) || 1000;

  useEffect(() => {
    if (!chequeId) return;

    // We do NOT use local storage findCheque here anymore to ensure Claimant flow is truly stateless.
    // It operates purely off the URL parameters provided by the magic link.
    const standaloneCheque: Cheque = {
      id: chequeId,
      denomination: denom,
      sourceChainId: schain,
      targetChainId: chain,
      compliance: false, // Not relevant for claimant UI display, handled by backend
      proven: true,      // Assume proven if they are at the redeem step
      redeemed: false,
      timestamp: Date.now(),
    };

    setCheque(standaloneCheque);
  }, [chequeId, chain, schain, denom]);

  function onRedeemed() {
    if (cheque) {
      // Don't update local storage here either, keep it stateless
      setCheque({ ...cheque, redeemed: true });
    }
  }

  if (!chequeId) {
    return (
      <main className="container max-w-3xl py-8 space-y-6 animate-fade-in">
        <Card className="glass-panel border-glass-border">
          <CardContent className="p-8 text-center space-y-4">
            <p className="text-muted-foreground">No cheque ID provided.</p>
            <Button asChild variant="outline" className="border-glass-border">
              <Link to="/claim">← Back to Claim Terminal</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="container max-w-3xl py-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <User className="w-5 h-5 text-primary" />
            <span className="text-xs text-primary font-semibold uppercase tracking-widest">Claimant Portal</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Banknote className="w-7 h-7 text-primary" />
            Redeem Funds
          </h1>
          <p className="text-muted-foreground text-sm">Settlement via Chainlink Verify Oracle — no proof generation required</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/claim">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </Button>
      </div>

      {/* Zero-burden notice */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-start gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5"
      >
        <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="text-primary font-medium">Zero cryptographic burden.</span>{" "}
          You don't need to generate a proof. The Proof Registry is queried by the Chainlink Verify Oracle inside a hardware enclave.
          Just provide your Cheque ID below.
        </p>
      </motion.div>

      {/* Cheque info banner */}
      {cheque && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="glass-panel border-glass-border">
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Cheque ID</p>
                  <p className="font-mono text-xs">{shortenHash(cheque.id, 8)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Denomination</p>
                  <p className="font-mono text-sm font-bold text-primary">{cheque.denomination} USDC</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Target Chain</p>
                  <p className="text-sm">{getChainName(cheque.targetChainId)}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {cheque.redeemed && <Badge className="bg-primary/15 text-primary text-xs">Settled</Badge>}
                <Badge className="bg-secondary text-muted-foreground text-xs">Employee / Claimant</Badge>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* RedemptionPanel — always shown, no gating on proven state */}
      {cheque && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <RedemptionPanel cheque={cheque} onRedeemed={onRedeemed} />
        </motion.div>
      )}
    </main>
  );
}
