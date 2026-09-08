"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { AuthScreen } from "./auth-screen";

export function LoginView() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const opened = useRef(false);
  const [error, setError] = useState("");
  const { login } = useLogin({
    onComplete: () => router.replace("/workspace"),
    onError: (code) => {
      if (code !== "exited_auth_flow") setError("Sign-in could not be completed. Please try again.");
    },
  });

  useEffect(() => {
    if (!ready) return;
    if (authenticated) { router.replace("/workspace"); return; }
    if (!opened.current) { opened.current = true; login(); }
  }, [ready, authenticated, login, router]);

  return <AuthScreen title="Your company. Your workspace." description="Sign in to manage company accounts, invoices, and payments.">
    <button className="snitch-auth__button" type="button" disabled={!ready || authenticated} onClick={() => { setError(""); login(); }}>
      {!ready || authenticated ? <><LoaderCircle size={17} className="snitch-auth__spinner" aria-hidden="true" />{authenticated ? "Opening workspace…" : "Connecting…"}</> : <>Continue with email <ArrowRight size={17} aria-hidden="true" /></>}
    </button>
    {error && <p className="snitch-auth__error" role="alert">{error}</p>}
    <Link href="/?demo=1" className="snitch-auth__secondary">Explore the workspace first</Link>
  </AuthScreen>;
}
