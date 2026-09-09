"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import type { WorkspaceProfile } from "@/lib/workspace-profile";
import { AuthScreen } from "./auth-screen";
import { ProfileNameDialog } from "./profile-name-dialog";
import { requestWorkspaceProfile } from "./workspace-profile-request";
import { WorkspaceSessionProvider } from "./workspace-session";
import { CompanyWalletProvider } from "./company-wallet-provider";

export function ProfileWorkspace({ userId, getAccessToken, logout, children }: {
  userId: string;
  getAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [profile, setProfile] = useState<WorkspaceProfile | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void requestWorkspaceProfile({ userId, getAccessToken, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setProfile(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "We couldn’t load your profile. Please try again."); });
    return () => controller.abort();
  }, [userId, getAccessToken, attempt]);

  if (!profile || profile.userId !== userId) {
    return <AuthScreen title={error ? "Let’s reconnect." : "Opening your workspace."} description={error || "Getting your profile ready."}>
      {error ? <><button className="snitch-auth__button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button><button className="snitch-auth__secondary" onClick={() => void logout().catch(() => setError("We couldn’t sign out. Please try again."))}>Sign out</button></> : <div className="snitch-auth__status" role="status"><LoaderCircle size={18} className="snitch-auth__spinner" aria-hidden="true" />Loading profile…</div>}
    </AuthScreen>;
  }

  async function saveName(name: string) {
    const updated = await requestWorkspaceProfile({ userId, getAccessToken, displayName: name });
    if (!updated.name || updated.needsName) throw new Error("We couldn’t save your name. Please try again.");
    setProfile(updated);
  }

  return <WorkspaceSessionProvider value={{ user: { id: userId, name: profile.name || "Your profile", email: profile.email, initials: profile.initials }, getAccessToken, logout }}>
    {profile.needsName ? <>
      <AuthScreen title="Welcome to Snitch." description="Your company workspace starts here." />
      <ProfileNameDialog onSave={saveName} onSignOut={logout} />
    </> : <CompanyWalletProvider>{children}</CompanyWalletProvider>}
  </WorkspaceSessionProvider>;
}
