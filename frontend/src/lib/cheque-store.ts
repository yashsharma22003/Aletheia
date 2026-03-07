import { Cheque } from "./mock-data";

const STORAGE_KEY = "aletheia_cheques";

export function loadCheques(): Cheque[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCheques(cheques: Cheque[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cheques));
}

export function addCheques(newCheques: Cheque[]): Cheque[] {
  const existing = loadCheques();
  const updated = [...newCheques, ...existing];
  saveCheques(updated);
  return updated;
}

export function updateCheque(chequeId: string, updates: Partial<Cheque>): Cheque[] {
  const cheques = loadCheques();
  const updated = cheques.map(c => c.id === chequeId ? { ...c, ...updates } : c);
  saveCheques(updated);
  return updated;
}

export function findCheque(chequeId: string): Cheque | undefined {
  return loadCheques().find(c => c.id === chequeId);
}

export function generateMagicLink(cheque: Cheque): string {
  return `/claim?id=${cheque.id}&chain=${cheque.targetChainId}&schain=${cheque.sourceChainId || 11155111}&denom=${cheque.denomination}`;
}
