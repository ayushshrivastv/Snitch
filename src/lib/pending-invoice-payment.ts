import { isEthereumTransactionHash } from "../../services/ethereum";

type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A late response from an older attempt must not erase a newer broadcast. */
export function forgetPendingInvoicePayment(invoiceId: string, expectedHash: string, storage: RecoveryStorage): void {
  try {
    if (readPendingInvoicePayment(invoiceId, storage) === expectedHash.toLowerCase()) {
      storage.removeItem(`snitch:sepolia:pending:${invoiceId}`);
    }
  } catch { /* In-memory and server recovery remain available. */ }
}

export function readPendingInvoicePayment(invoiceId: string, storage: RecoveryStorage): string | null {
  try {
    const hash = storage.getItem(`snitch:sepolia:pending:${invoiceId}`);
    return isEthereumTransactionHash(hash) ? hash.toLowerCase() : null;
  } catch { return null; }
}

/** Public recovery hint only; the server independently verifies every receipt. */
export function rememberPendingInvoicePayment(invoiceId: string, hash: string | null, storage: RecoveryStorage): void {
  try {
    const key = `snitch:sepolia:pending:${invoiceId}`;
    if (hash === null) storage.removeItem(key);
    else if (isEthereumTransactionHash(hash)) storage.setItem(key, hash.toLowerCase());
  } catch { /* A storage failure must never cause an already-broadcast payment to be sent again. */ }
}
