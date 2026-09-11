"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { WorkspaceProfile } from "@/lib/workspace-profile";
import { ProfileNameDialog } from "./profile-name-dialog";
import { requestWorkspaceProfile } from "./workspace-profile-request";
import { WorkspaceSessionProvider } from "./workspace-session";
import { CompanyWalletProvider } from "./company-wallet-provider";

export function ProfileWorkspace({ userId, initialProfile, getAccessToken, logout, children }: {
  userId: string;
  initialProfile: WorkspaceProfile;
  getAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  const [profile, setProfile] = useState<WorkspaceProfile>(initialProfile);
  const [profileReady, setProfileReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void requestWorkspaceProfile({ userId, getAccessToken, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setProfile(value); setError(""); setProfileReady(true); } })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "We couldn’t load your profile. Please try again.");
          setProfileReady(true);
        }
      });
    return () => controller.abort();
  }, [userId, getAccessToken, attempt]);

  async function saveName(name: string) {
    const updated = await requestWorkspaceProfile({ userId, getAccessToken, displayName: name });
    if (!updated.name || updated.needsName) throw new Error("We couldn’t save your name. Please try again.");
    setProfile(updated);
  }

  return <WorkspaceSessionProvider value={{ user: { id: userId, name: profile.name || "Your profile", email: profile.email, initials: profile.initials }, getAccessToken, logout }}>
    <CompanyWalletProvider><div className="h-screen" aria-busy={!profileReady}>{children}</div></CompanyWalletProvider>
    {profileReady && profile.needsName ? <ProfileNameDialog onSave={saveName} onSignOut={logout} /> : null}
    {error ? <div className="fixed right-4 top-4 z-[80] max-w-sm rounded-xl border border-border bg-background p-4 shadow-lg" role="alert">
      <p className="text-sm font-medium">We couldn’t finish loading your profile.</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Your workspace is open. Try syncing your profile again.</p>
      <button type="button" className="mt-3 min-h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => { setError(""); setProfileReady(false); setAttempt(value => value + 1); }}>Try again</button>
    </div> : null}
  </WorkspaceSessionProvider>;
}
