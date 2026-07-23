"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "@/components/providers/transition-provider";
import type { ComponentProps, ReactNode } from "react";

interface TransitionLinkProps extends Omit<ComponentProps<typeof Link>, "href"> {
  href: string;
  children: ReactNode;
}

export function TransitionLink({ href, children, onClick, className }: TransitionLinkProps) {
  const { startTransition } = useTransition();
  const pathname = usePathname();

  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (pathname !== href) {
          startTransition();
        }
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
