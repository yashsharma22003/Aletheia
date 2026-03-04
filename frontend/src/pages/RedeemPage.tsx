import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RedemptionPanel } from "@/components/claim/RedemptionPanel";
import { findCheque, updateCheque } from "@/lib/cheque-store";
import { Cheque, shortenHash, getChainName } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { Banknote, ShieldAlert, ArrowLeft, ArrowRight } from "lucide-react";

export default function RedeemPage() {
  const [searchParams] = useSearchParams();
  const [cheque, setCheque] = useState<Cheque | null>(null);

  const chequeId = searchParams.get("id") || "";
  const chain = Number(searchParams.get("chain")) || 10;
  const denom = Number(searchParams.get("denom")) || 1000;

  useEffect(() => {
    if (!chequeId) return;
    const found = findCheque(chequeId);
    if (found) {
      setCheque(found);
    } else {
      const mockCheque: Cheque = {
        id: chequeId,
        denomination: denom,
        targetChainId: chain,
        compliance: false,
        proven: false,
        redeemed: false,
        timestamp: Date.now(),
      };
      setCheque(mockCheque);
    }
  }, [chequeId, chain, denom]);

  function onRedeemed() {
    if (cheque) {
      const updated = updateCheque(cheque.id, { redeemed: true });
      const refreshed = updated.find(c => c.id === cheque.id);
      if (refreshed) setCheque(refreshed);
    }
  }

  const queryString = `?id=${chequeId}&chain=${chain}&denom=${denom}`;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-2">
            <Banknote className="w-7 h-7 text-primary" />
            Redeem Funds
          </h1>
          <p className="text-muted-foreground text-sm">Settle your validated cheque</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to={`/claim${queryString}`}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        </Button>
      </div>

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
              <Badge className="bg-primary/15 text-primary text-xs">Redemption Flow</Badge>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Not proven - blocked */}
      {cheque && !cheque.compliance && !cheque.proven && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass-panel border-glass-border">
            <CardContent className="p-8 text-center space-y-4">
              <ShieldAlert className="w-16 h-16 text-muted-foreground mx-auto" />
              <div>
                <p className="text-xl font-bold">Validation Required</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This cheque must be validated before it can be redeemed. Complete the proving flow first.
                </p>
              </div>
              <Button asChild variant="outline" className="gap-2 border-glass-border">
                <Link to={`/claim/prove${queryString}`}>
                  Go to Validation <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Proven - show redemption */}
      {cheque && cheque.compliance && cheque.proven && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <RedemptionPanel cheque={cheque} onRedeemed={onRedeemed} />
        </motion.div>
      )}
    </main>
  );
}
