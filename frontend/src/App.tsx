import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import Index from "./pages/Index";
import Treasury from "./pages/Treasury";
import ClaimTerminal from "./pages/ClaimTerminal";
import ProvePage from "./pages/ProvePage";
import RedeemPage from "./pages/RedeemPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <AppHeader />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/treasury" element={<Treasury />} />
            <Route path="/claim" element={<ClaimTerminal />} />
            <Route path="/claim/prove" element={<ProvePage />} />
            <Route path="/claim/redeem" element={<RedeemPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
