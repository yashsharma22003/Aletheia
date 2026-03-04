import { Cheque, shortenHash, getChainName } from "@/lib/mock-data";
import { generateMagicLink } from "@/lib/cheque-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface ChequeLedgerProps {
  cheques: Cheque[];
}

export function ChequeLedger({ cheques }: ChequeLedgerProps) {
  function copyMagicLink(cheque: Cheque) {
    const link = window.location.origin + generateMagicLink(cheque);
    navigator.clipboard.writeText(link);
    toast.success("Magic Link copied to clipboard");
  }

  return (
    <Card className="glass-panel border-glass-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5 text-accent" />
          Cheque Ledger
          <Badge variant="secondary" className="ml-2 font-mono text-xs">{cheques.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {cheques.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No cheques minted yet. Use The Mint above to create cheques.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-glass-border hover:bg-transparent">
                  <TableHead className="text-xs uppercase tracking-wider">Cheque ID</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Denomination</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Target Chain</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">Time</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cheques.map((cheque, i) => (
                  <motion.tr
                    key={cheque.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-glass-border hover:bg-secondary/30"
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {shortenHash(cheque.id)}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold">
                      {cheque.denomination} <span className="text-muted-foreground text-xs">USDC</span>
                    </TableCell>
                    <TableCell className="text-sm">{getChainName(cheque.targetChainId)}</TableCell>
                    <TableCell>
                      {cheque.redeemed ? (
                        <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">Settled</Badge>
                      ) : cheque.compliance ? (
                        <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Proven</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {new Date(cheque.timestamp).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyMagicLink(cheque)}
                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3 h-3" /> Copy Link
                      </Button>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
