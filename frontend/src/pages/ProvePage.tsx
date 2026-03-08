import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComplianceGate } from "@/components/claim/ComplianceGate";
import { ProvingEngine } from "@/components/claim/ProvingEngine";
import { findCheque, updateCheque } from "@/lib/cheque-store";
import { Cheque, shortenHash, getChainName } from "@/lib/cheque-types";
import { CHAINS } from "@/config/contracts";
import { motion } from "framer-motion";
import { Cpu, CheckCircle2, ArrowRight, ArrowLeft, Building2, Banknote } from "lucide-react";

type ProveStep = "compliance" | "proving" | "done";

export default function ProvePage() {
  const [searchParams] = useSearchParams();
  const [cheque, setCheque] = useState<Cheque | null>(null);
  const [step, setStep] = useState<ProveStep>("compliance");
  const [alreadyProven, setAlreadyProven] = useState(false);

  const chequeId = searchParams.get("id") || "";
  const chain = Number(searchParams.get("chain")) || 10;
  const schain = Number(searchParams.get("schain")) || 11155111;
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
        sourceChainId: schain,
        targetChainId: chain,
        compliance: false,
        proven: false,
        redeemed: false,
        timestamp: Date.now(),
      };
      setCheque(mockCheque);
    }
  }, [chequeId, chain, schain, denom]);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-accent" />
            <span className="text-xs text-accent font-semibold uppercase tracking-widest">Prover Portal</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Cpu className="w-7 h-7 text-accent" />
            Generate ZK Proof
          </h1>
          <p className="text-muted-foreground text-sm">Compliance gate → Barretenberg proof synthesis → On-chain registration</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to={`/claim`}>
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
              <Badge className="bg-accent/15 text-accent text-xs">Prover</Badge>
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
                <p className="text-xl font-bold text-primary">Proof Already Registered</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This cheque's ZK proof has been submitted and registered on-chain. The claimant can now redeem independently.
                </p>
              </div>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button asChild variant="outline" className="gap-2 border-glass-border">
                  <Link to="/claim">← Claim Terminal</Link>
                </Button>
                <Button asChild className="gap-2 glow-green">
                  <Link to={`/claim/redeem${queryString}`}>
                    Redeem This Cheque <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Active proving flow */}
      {!alreadyProven && cheque && (
        <>
          {step === "compliance" && (
            <motion.div key="compliance" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <ComplianceGate
                chequeId={cheque.id}
                chainId={chain}
                cashierAddress={CHAINS.find(c => c.id === chain)?.cashierAddress || "0x00...00"}
                onPassed={onCompliancePassed}
              />
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
                <CardContent className="p-8 text-center space-y-6">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200 }}>
                    <CheckCircle2 className="w-16 h-16 text-primary mx-auto" />
                  </motion.div>
                  <div>
                    <p className="text-xl font-bold text-primary">Proof Registered On-Chain</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                      The ZK proof has been submitted to the Proof Registry via Chainlink CRE.
                      The cheque is now claimable. Share the chequeId with the recipient.
                    </p>
                  </div>

                  {/* Non-mandatory redeem prompt */}
                  <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
                    <div className="flex items-center gap-2 justify-center">
                      <Banknote className="w-4 h-4 text-primary" />
                      <p className="text-sm font-medium text-primary">Testing end-to-end?</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      If you want to verify the full redemption flow (e.g. for testing purposes), you can proceed to the Claimant Portal for this cheque now.
                    </p>
                    <Button asChild className="gap-2 glow-green">
                      <Link to={`/claim/redeem${queryString}`}>
                        Redeem This Cheque <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>

                  <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                    <Link to="/claim">← Back to Claim Terminal</Link>
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
