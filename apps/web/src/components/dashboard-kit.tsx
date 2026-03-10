"use client";

import { type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DashboardHeroProps = {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
};

type DashboardPulseCardProps = {
  label: string;
  value: ReactNode;
  note?: string;
  accentClassName?: string;
};

type DashboardMetricTileProps = {
  label: string;
  value: ReactNode;
  note?: string;
  accent?: "brand" | "teal" | "rose" | "amber" | "emerald";
  className?: string;
  valueClassName?: string;
};

type DashboardChartCardProps = {
  title: string;
  scope?: string;
  section?: string;
  className?: string;
  chartClassName?: string;
  children: ReactNode;
  footer?: ReactNode;
};

type DashboardLegendProps<T extends { name: string }> = {
  items: T[];
  getValue?: (item: T) => ReactNode;
  colors: string[];
  className?: string;
};

type DashboardShortcutCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  tags: string[];
  onClick: () => void;
};

const TONE_MAP: Record<NonNullable<DashboardMetricTileProps["accent"]>, string> = {
  brand: "text-brand-primary",
  teal: "text-teal-600",
  rose: "text-rose-600",
  amber: "text-amber-600",
  emerald: "text-emerald-700"
};

export function dashboardPieValueLabel({ value }: { value?: number }) {
  return typeof value === "number" && value > 0 ? `${value}` : "";
}

export function dashboardYAxisWithHeadroom(dataMax: number) {
  const safeMax = Number.isFinite(dataMax) ? dataMax : 0;
  if (safeMax <= 0) {
    return 1;
  }
  return Math.ceil(safeMax + Math.max(1, safeMax * 0.25));
}

export function dashboardBarValueLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
}) {
  const { value } = props;
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return (
    <text
      fill="#07384D"
      fontSize={12}
      fontWeight={800}
      textAnchor="middle"
      x={x + width / 2}
      y={Math.max(y - 10, 14)}
    >
      {numericValue}
    </text>
  );
}

export function dashboardScopeLabel(windowDays: number) {
  return `Janela movel: ultimos ${windowDays} dias`;
}

export function DashboardHero({
  eyebrow,
  title,
  description,
  actions,
  aside,
  footer
}: DashboardHeroProps) {
  return (
    <section className="app-surface card dashboard-grid-hero mb-5 overflow-hidden p-5 md:p-6">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-brand-primary md:text-5xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">{description}</p>
          {actions ? <div className="mt-5 flex flex-wrap gap-2">{actions}</div> : null}
          {footer ? (
            <div className="mt-4 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{footer}</div>
          ) : null}
        </div>

        {aside ? <div className="grid gap-3 sm:grid-cols-2 xl:w-[440px]">{aside}</div> : null}
      </div>
    </section>
  );
}

export function DashboardPulseCard({
  label,
  value,
  note,
  accentClassName = "text-brand-primary"
}: DashboardPulseCardProps) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/78 p-4 shadow-[0_18px_40px_rgba(7,56,77,0.08)] backdrop-blur">
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className={cn("metric-value mt-3 text-[clamp(1.2rem,1.5vw,1.95rem)] font-black", accentClassName)}>
        {value}
      </div>
      {note ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

export function DashboardMetricTile({
  label,
  value,
  note,
  accent = "brand",
  className,
  valueClassName
}: DashboardMetricTileProps) {
  return (
    <article className={cn("app-surface card overflow-hidden p-4", className)}>
      <div className="mb-4 h-1.5 w-14 rounded-full bg-brand-background/60" />
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div
        className={cn(
          "metric-value mt-3 text-[clamp(1.4rem,1.8vw,2.35rem)] font-black",
          TONE_MAP[accent],
          valueClassName
        )}
      >
        {value}
      </div>
      {note ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
    </article>
  );
}

export function DashboardChartCard({
  title,
  scope,
  section,
  className,
  chartClassName,
  children,
  footer
}: DashboardChartCardProps) {
  return (
    <article className={cn("app-surface card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.08em] text-brand-primary">{title}</p>
          {scope ? <p className="mt-1 text-xs text-slate-500">{scope}</p> : null}
        </div>
        {section ? (
          <span className="rounded-full bg-brand-background-soft px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-brand-primary">
            {section}
          </span>
        ) : null}
      </div>
      <div className={cn("h-72", chartClassName)}>{children}</div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </article>
  );
}

export function DashboardLegend<T extends { name: string }>({
  items,
  getValue,
  colors,
  className
}: DashboardLegendProps<T>) {
  return (
    <div className={cn("mt-2 flex flex-wrap gap-2", className)}>
      {items.map((item, index) => {
        const color = colors[index % colors.length];
        return (
          <span
            className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 text-xs font-semibold"
            key={item.name}
            style={{ color }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {item.name}
            {getValue ? <>: {getValue(item)}</> : null}
          </span>
        );
      })}
    </div>
  );
}

export function DashboardShortcutCard({
  icon,
  title,
  description,
  tags,
  onClick
}: DashboardShortcutCardProps) {
  return (
    <article className="app-surface card overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-[20px] bg-brand-background-soft p-3 text-brand-primary">{icon}</div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
          Dashboard
        </span>
      </div>
      <h3 className="mt-4 text-xl font-black text-brand-primary">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            className="rounded-full border border-brand-primary/10 bg-white/75 px-3 py-1 text-xs font-semibold text-brand-primary"
            key={tag}
          >
            {tag}
          </span>
        ))}
      </div>
      <Button className="mt-5 w-full" onClick={onClick} type="button" variant="outline">
        Abrir dashboard
        <ArrowUpRight className="ml-1 h-4 w-4" />
      </Button>
    </article>
  );
}
