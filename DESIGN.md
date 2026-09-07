---
version: "alpha"
name: Snitch Workspace
description: A restrained financial operations interface for company-owned onchain wallets.
colors:
  primary: "oklch(0.205 0 0)"
  on-primary: "oklch(0.985 0 0)"
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  border: "oklch(0.922 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  small: "0.5rem"
  medium: "0.625rem"
  large: "0.875rem"
spacing:
  xs: "0.25rem"
  small: "0.5rem"
  medium: "1rem"
  large: "1.5rem"
  xlarge: "2rem"
components:
  status-muted:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.large}"
    padding: "{spacing.small}"
  secondary-copy:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.body}"
  divider:
    backgroundColor: "{colors.border}"
    height: "1px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.medium}"
    height: "2.5rem"
  button-secondary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.medium}"
    height: "2.5rem"
  panel:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.large}"
    padding: "{spacing.large}"
  destructive-action:
    backgroundColor: "{colors.background}"
    textColor: "{colors.destructive}"
    rounded: "{rounded.medium}"
    height: "2.5rem"
---

## Overview

Snitch uses quiet financial infrastructure as its visual model: clear records, strong ownership cues, and calm security states. Interfaces should feel precise and credible without looking dense or institutional. Every screen must make the selected company, wallet, network, and action consequence easy to understand.

## Colors

The workspace is neutral and light. Primary actions use near-black with white text. Muted gray surfaces organize secondary information without competing with balances or records. Green appears only for verified success, amber only for pending state, and destructive red only for irreversible actions.

## Typography

Use the system sans-serif stack for product UI. Titles are compact and moderately weighted. Body copy stays short, direct, and readable at 14px. Use monospaced text only for addresses, transaction hashes, API routes, and numbered technical steps.

## Layout

Use a consistent 24px content rhythm on desktop and 20px on compact screens. Group related settings inside one dominant panel, then place supporting information in smaller adjacent sections. Keep primary controls close to the information they affect. Long wallet addresses must wrap without forcing horizontal page scrolling.

## Elevation & Depth

Prefer borders and subtle surface shifts over shadows. A dominant settings panel may use one soft, wide shadow to separate it from the page. Interactive overlays use the existing strong backdrop and clear focus treatment.

## Shapes

Controls use 8–10px corners. Major panels may use 14px corners. Status badges may be fully rounded when they communicate a compact state. Avoid decorative pills for headings or ordinary labels.

## Components

Wallet pages take their visual rhythm from Dune Discover: an editorial serif page title, restrained section labels, and a flat grid of light cards. Keep exact balances prominent and public wallet identity nearby. Use 8px card corners and consistent 16px gaps. Privy branding uses the official purple mark and proportional wordmark. Place CFO verification inside the export popup; the page action is “Export Privy company wallet” and the popup action is “Verify.”

Primary buttons are near-black, at least 40px tall, and use a visible focus ring. Secondary buttons use a white surface and neutral border. Security flows present their steps in order and put the approval control at the end. Wallet identity panels always show the company, network, address, Chief Financial Officer, and connection state together.

Keep company wallet identity in Overview. Wallet settings contains the full-width Privy export card, Company account and Team access links, and the wallet-access footer. The wallet workspace has one viewport-bounded scroll area with no scroll chaining; positioned accessibility status elements stay contained within the wallet page.

## Do's and Don'ts

Do explain what a signature authorizes before requesting it. Do show loading, rejection, and unavailable states beside the initiating control. Do keep key export inside Privy’s protected interface. Don’t imply that Snitch can see, recover, or store an exported private key. Don’t use approximate symbols for blockchain balances. Don’t hide irreversible actions behind unlabeled icons.
