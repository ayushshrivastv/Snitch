"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { DISPLAY_NAME_MAX_LENGTH, normalizeDisplayName } from "@/lib/workspace-profile";
import "./profile-name-dialog.css";

export function ProfileNameDialog({ onSave, onSignOut }: {
  onSave: (name: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const validName = normalizeDisplayName(name);
    if (!validName) { setError("Enter your name to continue."); return; }
    setSaving(true);
    setError("");
    try { await onSave(validName); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn’t save your name. Please try again."); }
    finally { setSaving(false); }
  }

  async function signOut() {
    if (saving) return;
    setSaving(true);
    setError("");
    try { await onSignOut(); }
    catch { setError("We couldn’t sign out. Please try again."); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialog} className="snitch-profile" onCancel={event => event.preventDefault()} aria-labelledby="profile-name-heading" aria-describedby="profile-name-description">
    <form onSubmit={event => void submit(event)}>
      <span className="snitch-profile__eyebrow">Welcome to Snitch</span>
      <h2 id="profile-name-heading">What should we call you?</h2>
      <p id="profile-name-description">Add your name to make this workspace yours.</p>
      <label htmlFor="profile-display-name">Your name</label>
      <input id="profile-display-name" name="name" autoComplete="name" autoFocus required maxLength={DISPLAY_NAME_MAX_LENGTH} value={name} onChange={event => { setName(event.target.value); setError(""); }} placeholder="Enter your name" disabled={saving} aria-invalid={Boolean(error)} aria-describedby={error ? "profile-name-error" : undefined} />
      {error && <p id="profile-name-error" className="snitch-profile__error" role="alert">{error}</p>}
      <button className="snitch-profile__continue" type="submit" disabled={saving}>{saving ? <><LoaderCircle size={16} className="snitch-profile__spinner" aria-hidden="true" />Saving…</> : <>Continue <ArrowRight size={16} aria-hidden="true" /></>}</button>
      <button className="snitch-profile__sign-out" type="button" disabled={saving} onClick={() => void signOut()}>Sign out</button>
    </form>
  </dialog>;
}
