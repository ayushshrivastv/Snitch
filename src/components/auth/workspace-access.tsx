"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { LoaderCircle } from "lucide-react";
import HomePage from "@/app/home-client";
import { ProfileWorkspace } from "./profile-workspace";
import { AuthScreen } from "./auth-screen";
import { startWorkspaceVerification, type WorkspaceVerification } from "./workspace-verification";

export function WorkspaceAccess() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const router = useRouter();
  const [verification, setVerification] = useState<WorkspaceVerification | null>(null);
  const [attempt, setAttempt] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !userId) { router.replace("/login"); return; }
    return startWorkspaceVerification({ userId, getAccessToken, onResult: setVerification });
  }, [ready, authenticated, userId, getAccessToken, router, attempt]);

  async function signOut() {
    await logout();
    router.replace("/");
    router.refresh();
  }

  const current = verification?.userId === userId ? verification : null;
  if (ready && authenticated && user && current?.verified) {
    return <ProfileWorkspace key={user.id} userId={user.id} getAccessToken={getAccessToken} logout={signOut}><HomePage workspace /></ProfileWorkspace>;
  }

  return <AuthScreen title={current?.error ? "Let’s reconnect." : "Opening your workspace."} description={current?.error || "Confirming your sign-in with Snitch."}>
    {current?.error ? <><button className="snitch-auth__button" onClick={() => { setVerification(null); setAttempt(value => value + 1); }}>Try again</button><button className="snitch-auth__secondary" onClick={() => void signOut()}>Sign out</button></> : <div className="snitch-auth__status" role="status"><LoaderCircle size={18} className="snitch-auth__spinner" aria-hidden="true" />Verifying session…</div>}
  </AuthScreen>;
}
