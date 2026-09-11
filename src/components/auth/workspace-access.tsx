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
  return <main className="grid h-screen grid-cols-1 overflow-hidden bg-background text-foreground lg:grid-cols-[176px_minmax(0,1fr)]" aria-label="Opening your workspace" aria-busy="true">
    <aside className="hidden h-screen flex-col border-r border-border px-2 pb-2.5 pt-4 lg:flex">
      <div className="flex items-center gap-2.5 px-2">
        <Image src="/snitch-logo.png" alt="" width={34} height={34} className="size-7 shrink-0" priority />
        <span className="text-base font-medium tracking-[-0.02em]">Snitch</span>
      </div>
      <div className="mt-5 animate-pulse motion-reduce:animate-none">
        <div className="h-10 rounded-md bg-muted" />
        <div className="mt-5 grid gap-1.5">
          {Array.from({ length: 7 }, (_, index) => <div key={index} className="h-10 rounded-xl bg-muted/55" />)}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-3 px-2 animate-pulse motion-reduce:animate-none">
        <div className="size-11 rounded-full bg-muted" />
        <div className="h-4 w-28 rounded-full bg-muted" />
      </div>
    </aside>
    <section className="min-w-0 overflow-hidden px-5 py-5 xl:px-7">
      <span className="sr-only">Opening your workspace</span>
      <div className="mx-auto max-w-[1120px] animate-pulse motion-reduce:animate-none">
        <div className="space-y-2">
          <div className="h-8 w-4/5 rounded-lg bg-muted" />
          <div className="h-5 w-3/5 rounded bg-muted/65" />
        </div>
        <div className="mt-7 grid justify-start gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,280px))]">
          <div className="h-52 rounded-lg border border-dashed border-border bg-muted/20" />
          <div className="h-52 rounded-lg border border-border bg-muted/40" />
        </div>
      </div>
    </section>
  </main>;
}
