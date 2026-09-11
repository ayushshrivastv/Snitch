import type { Metadata } from "next";
import { WorkspaceAccess } from "@/components/auth/workspace-access";

export const metadata: Metadata = { title: "Workspace | Snitch" };

export default function WorkspacePage() {
  return <WorkspaceAccess />;
}
