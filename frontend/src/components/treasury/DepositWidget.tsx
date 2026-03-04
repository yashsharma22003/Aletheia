import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChainSelector } from "@/components/shared/ChainSelector";
import { autoBreakAmount, generateChequeId, Cheque } from "@/lib/mock-data";
import { addCheques } from "@/lib/cheque-store";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Zap, Wrench, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DepositWidgetProps {
  onMinted: () => void;
}

export function DepositWidget({ onMinted }: DepositWidgetProps) {
  const [amount, setAmount] = useState("");
  const [targetChain, setTargetChain] = useState(10);
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [customAmounts, setCustomAmounts] = useState<string[]>(["1000"]);
  const [minting, setMinting] = useState(false);

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

    setMinting(true);

    // Simulate blockchain delay
    await new Promise(r => setTimeout(r, 1500));

    const newCheques: Cheque[] = denominations.map(denom => ({
      id: generateChequeId(),
      denomination: denom,
      targetChainId: targetChain,
      compliance: false,
      proven: false,
      redeemed: false,
      timestamp: Date.now(),
    }));

    addCheques(newCheques);
    setMinting(false);
    setAmount("");
    setCustomAmounts(["1000"]);
    onMinted();
    toast.success(`${newCheques.length} cheque${newCheques.length > 1 ? "s" : ""} minted successfully`);
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
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="bg-secondary/50 border-glass-border font-mono"
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
          disabled={minting || (mode === "auto" ? autoBreak.length === 0 : totalCustom === 0 || customExceedsTotal)}
          className="w-full h-11 font-semibold text-sm glow-green"
        >
          {minting ? "Minting Cheques..." : "Deposit & Mint Cheques"}
        </Button>
      </CardContent>
    </Card>
  );
}
