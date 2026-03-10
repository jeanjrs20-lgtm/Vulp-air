"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/checklists/templates", label: "Templates" },
  { href: "/checklists/diagnostico", label: "Diagnostico" },
  { href: "/checklists/simulador", label: "Simulador" },
  { href: "/checklists/acompanhamento", label: "Acompanhamento" },
  { href: "/checklists/review", label: "Conferencia" }
];

export function ChecklistSectionNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("card mb-4 flex flex-wrap gap-2 p-2", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-primary transition",
            pathname.startsWith(item.href) ? "bg-brand-highlight" : "hover:bg-brand-primary/10"
          )}
          href={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
