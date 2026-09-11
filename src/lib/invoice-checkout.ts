import { sendEthPayment, type EthereumWallet } from "../../services/ethereum";

/** Retry verification independently of sending; a recovered hash never authorizes a resend. */
export async function runInvoiceCheckout({ invoiceId, amount, treasury, available, signal, pendingHash, checkStatus, getWallet, rememberHash, confirm }: {
  invoiceId: string;
  amount: string;
  treasury?: string;
  available: boolean;
  signal: AbortSignal;
  pendingHash: () => string | null;
  checkStatus: (signal: AbortSignal) => Promise<boolean>;
  getWallet: () => Promise<EthereumWallet>;
  rememberHash: (hash: string) => void;
  confirm: (hash: string, signal: AbortSignal) => Promise<void>;
}) {
  signal.throwIfAborted();
  const recovering = Boolean(pendingHash());
  if (await checkStatus(signal)) return;
  if (recovering || pendingHash() || !available || !treasury) return;
  const wallet = await getWallet();
  signal.throwIfAborted();
  // Another payer can finish while the wallet selection window is open.
  if (await checkStatus(signal) || pendingHash()) return;
  signal.throwIfAborted();
  const sent = await sendEthPayment({ to: treasury, amount, invoiceId, wallet });
  // Preserve a broadcast even when checkout closes while the wallet is signing.
  rememberHash(sent.transactionHash);
  // The public receipt save must outlive the screen that requested the transfer.
  await confirm(sent.transactionHash, AbortSignal.timeout(15_000));
}
