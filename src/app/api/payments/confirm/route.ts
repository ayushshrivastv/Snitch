import { NextResponse } from "next/server";
import { Connection, clusterApiUrl } from "@solana/web3.js";

import {
  getConfirmedPayment,
  getInvoiceIdForSignature,
  saveConfirmedPayment,
} from "@/lib/payment-confirmations";

const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  clusterApiUrl("devnet");
const DEFAULT_SNITCH_TREASURY_WALLET =
  "J7XpHFtKQUB66NajCPdoQU4HFR8iTjS6wtq4foKA1CYn";
const EXPECTED_TREASURY_WALLET =
  process.env.NEXT_PUBLIC_SNITCH_TREASURY_WALLET ||
  process.env.SNITCH_TREASURY_WALLET ||
  DEFAULT_SNITCH_TREASURY_WALLET;

type ConfirmPaymentBody = {
  invoiceId?: string;
  amount?: string;
  stablecoin?: string;
  signature?: string;
  payer?: string;
  treasury?: string;
  mint?: string;
  privacyRail?: string;
  proofSignature?: string;
  closeProofAccountSignature?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | ConfirmPaymentBody
    | null;

  if (!body?.invoiceId || !body.signature) {
    return NextResponse.json(
      { error: "Missing invoice id or transaction signature." },
      { status: 400 },
    );
  }

  const existingPayment = getConfirmedPayment(body.invoiceId);

  if (existingPayment) {
    return NextResponse.json({
      ok: true,
      alreadyConfirmed: true,
      payment: existingPayment,
      status: existingPayment.status,
    });
  }

  const existingInvoiceForSignature = getInvoiceIdForSignature(body.signature);

  if (
    existingInvoiceForSignature &&
    existingInvoiceForSignature !== body.invoiceId
  ) {
    return NextResponse.json(
      { error: "This transaction signature is already tied to another invoice." },
      { status: 409 },
    );
  }

  if (
    EXPECTED_TREASURY_WALLET &&
    body.treasury &&
    body.treasury !== EXPECTED_TREASURY_WALLET
  ) {
    return NextResponse.json(
      { error: "Payment treasury does not match this account." },
      { status: 400 },
    );
  }

  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const status = await connection.getSignatureStatus(body.signature, {
    searchTransactionHistory: true,
  });
  const confirmationStatus = status.value?.confirmationStatus;

  if (!status.value || status.value.err) {
    return NextResponse.json(
      { error: "Transaction was not found or failed on Solana." },
      { status: 422 },
    );
  }

  if (confirmationStatus !== "confirmed" && confirmationStatus !== "finalized") {
    return NextResponse.json(
      { error: "Transaction is not confirmed yet." },
      { status: 202 },
    );
  }

  const cluster = SOLANA_RPC_URL.includes("devnet") ? "?cluster=devnet" : "";
  const payment = saveConfirmedPayment({
    invoiceId: body.invoiceId,
    amount: body.amount,
    stablecoin: body.stablecoin,
    signature: body.signature,
    payer: body.payer,
    treasury: body.treasury,
    mint: body.mint,
    privacyRail: body.privacyRail,
    proofSignature: body.proofSignature,
    closeProofAccountSignature: body.closeProofAccountSignature,
    status: "Succeeded",
    confirmationStatus,
    confirmedAt: new Date().toISOString(),
    explorerUrl: `https://explorer.solana.com/tx/${body.signature}${cluster}`,
  });

  return NextResponse.json({
    ok: true,
    payment,
    status: "Succeeded",
    confirmationStatus,
  });
}
