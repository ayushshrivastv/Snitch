import { CompanyError } from "./company-store";
import { normalizeCompanyWalletAddress } from "./company-service";
import { getCompanyPayoutStore } from "./company-payout-store";
import type { CompanyPayoutRecord, RecordCompanyPayoutInput } from "./company-payout-types";
import { createCompanyPaymentReader } from "./company-payment-reader";
import { CompanyPaymentVerificationError, verifyCompanyPayment } from "./company-payment-verification";
import { isEthereumTransactionHash, parseEthAmount } from "../../services/ethereum";

function optionalText(value: unknown, field: string, limit: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new CompanyError(`Enter a valid ${field}.`, 400, "INVALID_PAYOUT_DETAILS");
  }
  return value.trim();
}

/** Both initial saving and recovery accept the same transfer details. */
export function parseCompanyPayoutInput(body: Record<string, unknown>): RecordCompanyPayoutInput {
  if (!isEthereumTransactionHash(body.transactionHash) || typeof body.amount !== "string" || body.amount.length > 100) {
    throw new CompanyError("Provide a transaction hash, recipient, and ETH amount.", 400, "INVALID_PAYMENT");
  }
  const to = normalizeCompanyWalletAddress(body.to);
  try { parseEthAmount(body.amount); } catch {
    throw new CompanyError("Enter a positive ETH amount with at most 18 decimal places.", 400, "INVALID_PAYMENT_AMOUNT");
  }
  return {
    transactionHash: body.transactionHash.toLowerCase(), to, amount: body.amount,
    receiverName: optionalText(body.receiverName, "recipient name", 120) || undefined,
    memo: optionalText(body.memo, "note", 1000),
  };
}

/** Recover database-persisted broadcasts even on a different device or session. */
export async function listRefreshedCompanyPayouts(userId: string, companyId: string): Promise<CompanyPayoutRecord[]> {
  const store = getCompanyPayoutStore();
  const [payouts, submissions] = await Promise.all([
    store.listForCompany(userId, companyId), store.listSubmissionsForCompany(userId, companyId),
  ]);
  const pending = [
    ...payouts.filter(payout => payout.status === "Incomplete").map(payout => ({ payout, submitted: false })),
    ...submissions.filter(item => item.nextCheckAt <= new Date().toISOString()).map(item => ({ payout: item.payout, submitted: true })),
  ];
  if (!pending.length) return mergePayouts(payouts, submissions.map(item => item.payout));

  const signal = AbortSignal.timeout(8000);
  const rpc = createCompanyPaymentReader(signal);
  let network: ReturnType<typeof rpc.getNetwork> | undefined;
  const provider = { ...rpc, getNetwork: () => network ??= rpc.getNetwork() };
  // Keep failures isolated: an unavailable RPC must not hide the durable ledger.
  // Limit concurrent RPC requests even if the company has a large pending ledger.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (next < pending.length && !signal.aborted) {
      const { payout, submitted } = pending[next++];
      try {
        const confirmation = await verifyCompanyPayment({
          from: payout.from, to: payout.to, amount: payout.amount,
          transactionHash: payout.transactionHash, provider, requireTransaction: true,
        });
        if (submitted || confirmation.status !== "Incomplete") {
          await store.saveVerified(userId, companyId, {
            from: payout.from, to: payout.to, amount: payout.amount, confirmation,
          });
        }
      } catch (error) {
        if (submitted) {
          if (error instanceof CompanyPaymentVerificationError && error.status === 422) {
            // Invalid recovery hints never become a transfer in the ledger.
            await store.discardSubmission(userId, companyId, payout.transactionHash);
          } else {
            await store.deferSubmission(userId, companyId, payout.transactionHash);
          }
        }
      }
    }
  }));
  return mergePayouts(await store.listForCompany(userId, companyId),
    (await store.listSubmissionsForCompany(userId, companyId)).map(item => item.payout));
}

function mergePayouts(verified: CompanyPayoutRecord[], submissions: CompanyPayoutRecord[]) {
  const records = new Map(submissions.map(payout => [payout.transactionHash, payout]));
  for (const payout of verified) records.set(payout.transactionHash, payout);
  return [...records.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}
