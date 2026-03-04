import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComplianceGate } from "@/components/claim/ComplianceGate";
import { ProvingEngine } from "@/components/claim/ProvingEngine";
import { findCheque, updateCheque } from "@/lib/cheque-store";
import { Cheque, shortenHash, getChainName } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { Cpu, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";

type ProveStep = "compliance" | "proving" | "done";

export default function ProvePage() {
  const [searchParams] = useSearchParams();
  const [cheque, setCheque] = useState<Cheque | null>(null);
  const [step, setStep] = useState<ProveStep>("compliance");
  const [alreadyProven, setAlreadyProven] = useState(false);

  const chequeId = searchParams.get("id") || "";
  const chain = Number(searchParams.get("chain")) || 10;
  const denom = Number(searchParams.get("denom")) || 1000;

  useEffect(() => {
    if (!chequeId) return;
    const found = findCheque(chequeId);
    if (found) {
      setCheque(found);
      if (found.compliance && found.proven) {
        setAlreadyProven(true);
      }
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

  function onCompliancePassed() {
    setStep("proving");
  }

  function onProofVerified() {
    if (cheque) {
      const updated = updateCheque(cheque.id, { compliance: true, proven: true });
      const refreshed = updated.find(c => c.id === cheque.id);
      if (refreshed) setCheque(refreshed);
    }
    setStep("done");
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
            <Cpu className="w-7 h-7 text-accent" />
            Validate Cheque
          </h1>
          <p className="text-muted-foreground text-sm">Compliance verification & proof generation</p>
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
              <Badge className="bg-accent/15 text-accent text-xs">Proving Flow</Badge>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Already proven state */}
      {alreadyProven && cheque && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="glass-panel border-glass-border">
            <CardContent className="p-8 text-center space-y-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
                <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
              </motion.div>
              <div>
                <p className="text-xl font-bold text-primary">Already Verified</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This cheque has already been validated on-chain. You can proceed to redemption.
                </p>
              </div>
              <Button asChild className="gap-2 glow-green">
                <Link to={`/claim/redeem${queryString}`}>
                  Go to Redemption <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Active proving flow */}
      {!alreadyProven && cheque && (
        <>
          {step === "compliance" && (
            <motion.div key="compliance" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <ComplianceGate onPassed={onCompliancePassed} />
            </motion.div>
          )}

          {step === "proving" && (
            <motion.div key="proving" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <ProvingEngine cheque={cheque} onVerified={onProofVerified} />
            </motion.div>
          )}

          {step === "done" && (
            <motion.div key="done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="glass-panel border-glass-border">
                <CardContent className="p-8 text-center space-y-4">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
                    <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
                  </motion.div>
                  <div>
                    <p className="text-xl font-bold text-primary">Proof Verified!</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your cheque has been validated on-chain. You can now redeem your funds.
                    </p>
                  </div>
                  <Button asChild className="gap-2 glow-green">
                    <Link to={`/claim/redeem${queryString}`}>
                      Go to Redemption <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </main>
  );
}
