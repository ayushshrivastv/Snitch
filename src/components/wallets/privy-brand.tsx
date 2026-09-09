import Image from "next/image";
import { cn } from "@/lib/utils";

export type PrivyBrandProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  markOnly?: boolean;
};

const sizes = {
  sm: { mark: "size-6", wordmark: "h-[18px]", gap: "gap-2" },
  md: { mark: "size-8", wordmark: "h-[22px]", gap: "gap-2.5" },
  lg: { mark: "size-10", wordmark: "h-[26px]", gap: "gap-3" },
} as const;

/**
 * Original Privy kit assets, without recoloring or altered artwork.
 * Privy-square-blurple.svg: https://drive.google.com/uc?export=download&id=1hHQIy-rokO_F3k9R1qIjse3Q6206SicO
 * Privy_Wordmark_Black.svg: https://drive.google.com/uc?export=download&id=1zqZjJ6G44M2jcMYl-tGRtwFPaivZMts_
 * Both are provided by https://www.privy.io/brand-guidelines.
 */
export function PrivyBrand({ className, size = "md", markOnly = false }: PrivyBrandProps) {
  const scale = sizes[size];

  return (
    <span role="img" aria-label="Privy" className={cn("inline-flex shrink-0 items-center", scale.gap, className)}>
      <Image
        src="/brands/privy-color.svg"
        alt=""
        width={200}
        height={200}
        className={cn("shrink-0", scale.mark)}
      />
      {!markOnly ? (
        <Image
          src="/brands/privy-wordmark.svg"
          alt=""
          width={258}
          height={78}
          className={cn("w-auto shrink-0 dark:invert", scale.wordmark)}
        />
      ) : null}
    </span>
  );
}
