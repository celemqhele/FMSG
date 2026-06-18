"use client";

import Link from "next/link";
import { useTransition } from "@/components/providers/transition-provider";
import type { ComponentProps } from "react";

type TransitionLinkProps = ComponentProps<typeof Link>;

export function TransitionLink({ onClick, ...props }: TransitionLinkProps) {
  const { startTransition } = useTransition();

  return (
    <Link
      {...props}
      onClick={(e) => {
        startTransition();
        onClick?.(e);
      }}
    />
  );
}
