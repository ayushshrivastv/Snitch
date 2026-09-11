export type InvoiceLifecycleStatus = "Incomplete" | "Failed" | "Succeeded" | "Refunded" | "Disputed";

const invoiceDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function invoiceDueEnd(dueDate: string): number | null {
  const match = invoiceDatePattern.exec(dueDate);
  if (!match) return null;
  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) return null;
  return timestamp;
}

export function isInvoiceExpired(dueDate: string, now = Date.now()): boolean {
  const dueEnd = invoiceDueEnd(dueDate);
  return dueEnd !== null && dueEnd < now;
}

/** Failed payment attempts never close an invoice while its due date is active. */
export function resolveInvoiceLifecycleStatus(
  status: InvoiceLifecycleStatus,
  dueDate: string | undefined,
  now = Date.now(),
): InvoiceLifecycleStatus {
  if (status !== "Incomplete" && status !== "Failed") return status;
  if (!dueDate || invoiceDueEnd(dueDate) === null) return status;
  return isInvoiceExpired(dueDate, now) ? "Failed" : "Incomplete";
}
