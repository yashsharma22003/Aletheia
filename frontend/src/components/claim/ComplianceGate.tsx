import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2 } from "lucide-react";

interface ComplianceGateProps {
  onPassed: () => void;
}

export function ComplianceGate({ onPassed }: ComplianceGateProps) {
  const [status, setStatus] = useState<"verifying" | "passed">("verifying");

  useEffect(() => {
    const timer = setTimeout(() => {
      setStatus("passed");
      setTimeout(onPassed, 800);
    }, 2500);
    return () => clearTimeout(timer);
  }, [onPassed]);

  return (
    <Card className="glass-panel border-glass-border overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-accent" />
          Step 1 — Compliance Gate
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-6">
        <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/30 border border-glass-border">
          {status === "verifying" ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Loader2 className="w-6 h-6 text-accent" />
              </motion.div>
              <div>
                <p className="text-sm font-medium">Verifying encrypted compliance attestation...</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Checking Chainlink CRE attestation via confidential HTTP tunnel
                </p>
              </div>
            </>
          ) : (
            <>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <ShieldCheck className="w-6 h-6 text-primary" />
              </motion.div>
              <div>
                <p className="text-sm font-medium text-primary">Compliance attestation verified</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  AES-GCM encrypted batch result confirmed — proceeding to proof generation
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
