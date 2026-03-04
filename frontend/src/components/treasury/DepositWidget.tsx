import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChainSelector } from "@/components/shared/ChainSelector";
import { autoBreakAmount, Cheque } from "@/lib/mock-data";
import { addCheques } from "@/lib/cheque-store";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Zap, Wrench, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { parseUnits, erc20Abi, parseEventLogs } from "viem";
import { CONTRACT_ADDRESSES } from "@/config/contracts";
import { ComplianceCashierABI } from "@/config/ComplianceCashierABI";

interface DepositWidgetProps {
  onMinted: () => void;
}

export function DepositWidget({ onMinted }: DepositWidgetProps) {
  const { chainId } = useAccount();
  const [amount, setAmount] = useState("");
  const [targetChain, setTargetChain] = useState(11155420);
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [customAmounts, setCustomAmounts] = useState<string[]>(["1000"]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Wagmi hooks
  const { writeContractAsync, isPending } = useWriteContract();
  const publicClient = usePublicClient();

  const totalCustom = customAmounts.reduce((s, v) => s + (Number(v) || 0), 0);
  const parsedAmount = Number(amount) || 0;
  const autoBreak = mode === "auto" && parsedAmount > 0 ? autoBreakAmount(parsedAmount) : [];

  function addCustomRow() {
    setCustomAmounts([...customAmounts, ""]);
  }

  function removeCustomRow(idx: number) {
    setCustomAmounts(customAmounts.filter((_, i) => i !== idx));
  }

  function updateCustomRow(idx: number, val: string) {
    const updated = [...customAmounts];
    updated[idx] = val;
    setCustomAmounts(updated);
  }

  const customExceedsTotal = mode === "custom" && parsedAmount > 0 && totalCustom > parsedAmount;

  async function handleMint() {
    const denominations = mode === "auto" ? autoBreak : customAmounts.map(v => Number(v)).filter(v => v > 0);
    if (denominations.length === 0) return;

    // We need the current chain's contract address to interact
    const currentChainId = chainId || 11155420; // fallback OP Sepolia
    const addresses = CONTRACT_ADDRESSES[currentChainId as keyof typeof CONTRACT_ADDRESSES];

    if (!addresses || addresses.cashier === "0x0000000000000000000000000000000000000000") {
      toast.error("Contract not fully deployed on this chain yet.");
      return;
    }

    setIsProcessing(true);

    try {
      const finalAmount = mode === "auto" ? amount : totalCustom.toString();
      const amountInWei = parseUnits(finalAmount || "0", 6); // Assuming USDC 6 decimals

      toast.loading("Approving USDC transfer...", { id: "tx_submit" });
      const approveTxHash = await writeContractAsync({
        address: addresses.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [addresses.vault, amountInWei] as any,
      });

      // Wait for approval transaction to be mined
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash });
      }

      toast.loading("Submitting deposit...", { id: "tx_submit" });

      let txHash;
      if (mode === "auto") {
        txHash = await writeContractAsync({
          address: addresses.cashier,
          abi: ComplianceCashierABI,
          functionName: "deposit",
          args: [amountInWei, BigInt(targetChain)] as any,
        });
      } else {
        txHash = await writeContractAsync({
          address: addresses.cashier,
          abi: ComplianceCashierABI,
          functionName: "customDeposit",
          args: [amountInWei, BigInt(targetChain), denominations.map(d => BigInt(d))] as any,
        });
      }

      toast.loading("Waiting for deposit confirmation...", { id: "tx_submit" });

      // Wait for deposit transaction to be mined
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      // Parse ChequeCreated events from the receipt to get real on-chain IDs
      let newCheques: Cheque[] = [];
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        const events = parseEventLogs({
          abi: ComplianceCashierABI as any,
          logs: receipt.logs,
          eventName: 'ChequeCreated',
        });

        newCheques = (events as any[]).map((evt) => ({
          id: evt.args.chequeId as string,
          denomination: Number(evt.args.denomination),
          targetChainId: Number(evt.args.targetChainId),
          compliance: false,
          proven: false,
          redeemed: false,
          timestamp: Date.now(),
        }));
      }

      if (newCheques.length === 0) {
        // Fallback: use denomination list if event parsing failed
        newCheques = denominations.map(denom => ({
          id: `0x${'0'.repeat(64)}`, // Will be wrong but surface the issue
          denomination: denom,
          targetChainId: targetChain,
          compliance: false,
          proven: false,
          redeemed: false,
          timestamp: Date.now(),
        }));
      }

      addCheques(newCheques);
      setAmount("");
      setCustomAmounts(["1000"]);
      onMinted();

      toast.success(`${newCheques.length} cheque${newCheques.length > 1 ? "s" : ""} minted successfully`, { id: "tx_submit" });

    } catch (err: any) {
      console.error(err);
      toast.error(err?.shortMessage || err?.message || "Failed to execute deposit transaction.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Card className="glass-panel border-glass-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          The Mint — Deposit & Create Cheques
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Token + Chain + Amount row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Token</label>
            <div className="h-10 px-3 flex items-center rounded-md bg-secondary/50 border border-glass-border text-sm font-mono">
              USDC
            </div>
          </div>
          <ChainSelector value={targetChain} onChange={setTargetChain} label="Target Chain" />
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">
              {mode === "auto" ? "Amount" : "Total Deposit Amount"}
            </label>
            <Input
              type="number"
              placeholder="e.g. 1600"
              value={mode === "auto" ? amount : (totalCustom > 0 ? totalCustom : "")}
              onChange={e => setAmount(e.target.value)}
              readOnly={mode === "custom"}
              className={`bg-secondary/50 border-glass-border font-mono ${mode === "custom" && "opacity-70 cursor-not-allowed"}`}
            />
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "auto" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("auto")}
            className="gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" /> Auto-Standard
          </Button>
          <Button
            variant={mode === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("custom")}
            className="gap-1.5"
          >
            <Wrench className="w-3.5 h-3.5" /> Custom Build
          </Button>
        </div>

        {/* Auto preview */}
        {mode === "auto" && autoBreak.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-3 rounded-lg bg-secondary/30 border border-glass-border">
            <p className="text-xs text-muted-foreground mb-2">Auto-breakdown into standard denominations:</p>
            <div className="flex flex-wrap gap-2">
              {autoBreak.map((d, i) => (
                <span key={i} className="px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-mono font-semibold">
                  {d} USDC
                </span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Custom build */}
        <AnimatePresence>
          {mode === "custom" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <p className="text-xs text-muted-foreground">Enter any denomination per cheque (minimum 100 USDC)</p>
              {customAmounts.map((val, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={val}
                    onChange={e => updateCustomRow(idx, e.target.value)}
                    className="bg-secondary/50 border-glass-border font-mono flex-1"
                    placeholder="e.g. 250"
                  />
                  <span className="text-xs text-muted-foreground">USDC</span>
                  {customAmounts.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeCustomRow(idx)} className="h-8 w-8">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={addCustomRow} className="gap-1.5 border-glass-border">
                  <Plus className="w-3.5 h-3.5" /> Add Cheque
                </Button>
                <span className="text-sm font-mono">
                  Total: <span className="text-primary font-bold">{totalCustom} USDC</span>
                </span>
              </div>
              {customExceedsTotal && (
                <Alert variant="destructive" className="py-2">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Cheque sum ({totalCustom}) exceeds deposit amount ({parsedAmount}). The contract will reject this.
                  </AlertDescription>
                </Alert>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mint button */}
        <Button
          onClick={handleMint}
          disabled={isProcessing || (mode === "auto" ? autoBreak.length === 0 : totalCustom === 0 || customExceedsTotal)}
          className="w-full h-11 font-semibold text-sm glow-green"
        >
          {isProcessing ? "Minting Cheques..." : "Deposit & Mint Cheques"}
        </Button>
      </CardContent>
    </Card>
  );
}
