import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2, RefreshCw } from "lucide-react";
import { useReadContract } from "wagmi";
import { ComplianceCashierABI } from "@/config/ComplianceCashierABI";

interface ComplianceGateProps {
  chequeId: string;
  chainId: number;
  cashierAddress: string;
  onPassed: () => void;
}

export function ComplianceGate({ chequeId, chainId, cashierAddress, onPassed }: ComplianceGateProps) {
  const [status, setStatus] = useState<"verifying" | "passed">("verifying");

  // Poll the contract to check if the oracle has updated the compliance status
  const { data: chequeData, refetch } = useReadContract({
    address: cashierAddress as `0x${string}`,
    abi: ComplianceCashierABI,
    functionName: "cheques",
    args: [chequeId as `0x${string}`],
    chainId: chainId
  });

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "verifying") {
      interval = setInterval(() => {
        refetch();
      }, 3000); // poll every 3 seconds
    }
    return () => clearInterval(interval);
  }, [status, refetch]);

  useEffect(() => {
    if (chequeData) {
      // The `cheques` function returns a tuple: [owner, denomination, targetChainId, isCompliant, blockNumber]
      // isCompliant is at index 3
      const isCompliant = chequeData[3] as boolean;

      if (isCompliant && status === "verifying") {
        setStatus("passed");
        setTimeout(onPassed, 1500); // Give user time to see success state
      }
    }
  }, [chequeData, status, onPassed]);

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
                <RefreshCw className="w-6 h-6 text-accent" />
              </motion.div>
              <div>
                <p className="text-sm font-medium">Awaiting On-Chain Compliance Attestation...</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Polling {cashierAddress.slice(0, 6)}...{cashierAddress.slice(-4)} on chain {chainId} for {chequeId.slice(0, 8)}...
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
                <p className="text-sm font-medium text-primary">Compliance attestation verified on-chain</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Chainlink CRE successfully updated compliance status — proceeding to proof generation.
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
