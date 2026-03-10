import Image from "next/image";

export function BrandLockup({
  className,
  compact = false
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={className} style={{ display: "inline-flex", alignItems: "center" }}>
      <Image
        alt="Logo da VULP AIR by Claudiatech"
        height={compact ? 30 : 48}
        priority
        src="/branding/vulp-logo.png"
        style={{ width: "auto" }}
        width={compact ? 120 : 196}
      />
    </div>
  );
}
