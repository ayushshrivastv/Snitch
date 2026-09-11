"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import HomePage from "@/app/home-client";
import { profileFromPrivyClientUser } from "@/lib/workspace-profile";
import { ProfileWorkspace } from "./profile-workspace";

export function WorkspaceAccess() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !user) router.replace("/login");
  }, [ready, authenticated, user, router]);

  async function signOut() {
    await logout();
    router.replace("/");
    router.refresh();
  }

  if (ready && authenticated && user) {
    return <ProfileWorkspace
      key={user.id}
      userId={user.id}
      initialProfile={profileFromPrivyClientUser(user)}
      getAccessToken={getAccessToken}
      logout={signOut}
    >
      <HomePage workspace />
    </ProfileWorkspace>;
  }

  return <WorkspaceLoadingShell />;
}

function WorkspaceLoadingShell() {
  return <main className="grid h-screen min-h-[40rem] grid-cols-1 overflow-hidden bg-background text-foreground md:grid-cols-[17.5rem_1fr]" aria-label="Opening your workspace" aria-busy="true">
    <aside className="hidden h-screen flex-col border-r border-border px-5 py-7 md:flex">
      <div className="flex items-center gap-3 px-2">
        <Image src="/snitch-logo.png" alt="" width={40} height={40} priority />
        <span className="text-xl font-semibold">Snitch</span>
      </div>
      <div className="mt-10 space-y-3 animate-pulse motion-reduce:animate-none">
        <div className="h-14 rounded-xl bg-muted" />
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-11 rounded-xl bg-muted/55" />)}
      </div>
      <div className="mt-auto flex items-center gap-3 px-2 animate-pulse motion-reduce:animate-none">
        <div className="size-11 rounded-full bg-muted" />
        <div className="h-4 w-28 rounded-full bg-muted" />
      </div>
    </aside>
    <section className="px-5 py-8 sm:px-9 sm:py-10">
      <span className="sr-only">Opening your workspace</span>
      <div className="max-w-5xl animate-pulse space-y-8 motion-reduce:animate-none">
        <div className="space-y-3">
          <div className="h-10 w-3/5 rounded-lg bg-muted" />
          <div className="h-5 w-2/5 rounded bg-muted/65" />
        </div>
        <div className="grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="h-72 rounded-2xl border border-dashed border-border bg-muted/20" />
          <div className="h-72 rounded-2xl border border-border bg-muted/40" />
        </div>
      </div>
    </section>
  </main>;
}
