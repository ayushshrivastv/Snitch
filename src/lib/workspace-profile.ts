import type { User } from "@privy-io/node";

export const DISPLAY_NAME_MAX_LENGTH = 80;

export type WorkspaceProfile = {
  userId: string;
  name: string | null;
  initials: string;
  email?: string;
  needsName: boolean;
};

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Reject invisible control characters while allowing names in any language.
  if (/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(value)) return null;
  const name = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  return name && [...name].length <= DISPLAY_NAME_MAX_LENGTH ? name : null;
}

export function profileFromPrivyUser(user: User): WorkspaceProfile {
  let name = normalizeDisplayName(user.custom_metadata?.display_name);
  let email: string | undefined;

  for (const account of user.linked_accounts) {
    if (!email && account.type === "email") email = account.address;
    if (!email && "email" in account && typeof account.email === "string") email = account.email;
    if (name) continue;

    if ("name" in account) name = normalizeDisplayName(account.name);
    if (!name && "display_name" in account) name = normalizeDisplayName(account.display_name);
    if (!name && account.type === "telegram") {
      name = normalizeDisplayName([account.first_name, account.last_name].filter(Boolean).join(" "));
    }
    if (!name && "username" in account) name = normalizeDisplayName(account.username);
  }

  const initials = name
    ? name.split(/\s+/u).slice(0, 2).map(part => [...part][0]).join("").toLocaleUpperCase()
    : "";
  return { userId: user.id, name, initials, ...(email ? { email } : {}), needsName: !name };
}
