import * as React from "react"

import { cn } from "@/lib/utils"

function ButtonGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
}) {
  return (
    <div
      data-slot="button-group"
      role="group"
      data-orientation={orientation}
      className={cn(
        "inline-flex overflow-hidden rounded-lg border border-border bg-background",
        orientation === "vertical" && "flex-col",
        className,
      )}
      {...props}
    />
  )
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
}) {
  return (
    <div
      data-slot="button-group-separator"
      role="separator"
      aria-orientation={orientation}
      className={cn(
        orientation === "vertical" ? "h-auto w-px" : "h-px w-auto",
        "bg-border",
        className,
      )}
      {...props}
    />
  )
}

function ButtonGroupText({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="button-group-text"
      className={cn(
        "inline-flex h-8 items-center px-3 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText }
