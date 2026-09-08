"use client";

import { createContext, useContext, type ReactNode } from "react";

export type WorkspaceSession = {
  user: {
    id: string;
    name: string;
    email?: string;
    initials: string;
  };
  getAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
};

const WorkspaceSessionContext = createContext<WorkspaceSession | null>(null);

export function WorkspaceSessionProvider({
  value,
  children,
}: {
  value: WorkspaceSession;
  children: ReactNode;
}) {
  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession(): WorkspaceSession | null {
  return useContext(WorkspaceSessionContext);
}
