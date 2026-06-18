"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "@/components/providers/transition-provider";
import type { ComponentProps, ReactNode } from "react";

interface TransitionLinkProps extends Omit<ComponentProps<"a">, "href"> {
  href: string;
  children: ReactNode;
}

export function TransitionLink({ href, children, onClick, className }: TransitionLinkProps) {
  const router = useRouter();
  const { startTransition } = useTransition();

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        startTransition();
        onClick?.(e);
        router.push(href);
      }}
    >
      {children}
    </a>
  );
}
