"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import { floatingNavLoginClass } from "@/components/ui/floating-navbar";
import { SnitchAuthProvider } from "./privy-provider";

function LoginButton({ onClick, disabled = false, pending = false, error }: {
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  error?: string;
}) {
  const errorId = useId();
  return <div className="relative">
    <button type="button" data-slot="floating-nav-login" onClick={onClick}
      disabled={disabled || pending} aria-busy={pending} aria-describedby={error ? errorId : undefined}
      className={`${floatingNavLoginClass} disabled:cursor-wait disabled:opacity-70`}>
      {pending ? "Connecting…" : "Login"}
    </button>
    {error ? <p id={errorId} role="alert" className="absolute right-0 top-[calc(100%+1rem)] w-64 rounded-xl border border-neutral-200 bg-white p-4 text-sm leading-5 text-neutral-700 shadow-lg">{error}</p> : null}
  </div>;
}

function PrivyLandingLogin() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const requested = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { login } = useLogin({
    onComplete: () => {
      // Privy also calls this on mount for existing sessions. Landing stays public
      // until the visitor explicitly clicks Login.
      if (requested.current) router.replace("/workspace");
    },
    onError: code => {
      requested.current = false;
      setPending(false);
      if (code !== "exited_auth_flow") setError("Sign-in could not be completed. Please try again.");
    },
  });

  useEffect(() => {
    if (ready) router.prefetch("/workspace");
  }, [ready, router]);

  function openLogin() {
    if (!ready || requested.current) return;
    requested.current = true;
    setError("");
    setPending(true);
    if (authenticated) router.replace("/workspace");
    else login();
  }

  return <LoginButton onClick={openLogin} disabled={!ready} pending={pending} error={error} />;
}

function UnavailableLogin() {
  const [error, setError] = useState("");
  return <LoginButton onClick={() => setError("Sign-in is unavailable. Please try again shortly.")} error={error} />;
}

export function LandingLoginButton() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return <UnavailableLogin />;
  return <SnitchAuthProvider appId={appId}><PrivyLandingLogin /></SnitchAuthProvider>;
}
