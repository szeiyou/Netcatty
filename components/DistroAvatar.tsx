import React, { memo } from 'react';
import { Host } from '../types';
import { normalizeDistroId } from '../domain/host';
import { cn } from '../lib/utils';
import { Server } from 'lucide-react';

export const DISTRO_LOGOS: Record<string, string> = {
  ubuntu: "/distro/ubuntu.svg",
  debian: "/distro/debian.svg",
  centos: "/distro/centos.svg",
  rocky: "/distro/rocky.svg",
  fedora: "/distro/fedora.svg",
  arch: "/distro/arch.svg",
  alpine: "/distro/alpine.svg",
  amazon: "/distro/amazon.svg",
  opensuse: "/distro/opensuse.svg",
  redhat: "/distro/redhat.svg",
  oracle: "/distro/oracle.svg",
  kali: "/distro/kali.svg",
};

export const DISTRO_COLORS: Record<string, string> = {
  ubuntu: "bg-[#E95420]",
  debian: "bg-[#A81D33]",
  centos: "bg-[#9C27B0]",
  rocky: "bg-[#0B9B69]",
  fedora: "bg-[#3C6EB4]",
  arch: "bg-[#1793D1]",
  alpine: "bg-[#0D597F]",
  amazon: "bg-[#FF9900]",
  opensuse: "bg-[#73BA25]",
  redhat: "bg-[#EE0000]",
  oracle: "bg-[#C74634]",
  kali: "bg-[#0F6DB3]",
  default: "bg-slate-600",
};

type DistroAvatarProps = { host: Host; fallback: string; className?: string; size?: 'sm' | 'md' | 'lg' };

const DistroAvatarInner: React.FC<DistroAvatarProps> = ({ host, fallback, className, size }) => {
  const distro = normalizeDistroId(host.distro) || (host.distro || '').toLowerCase();
  const logo = DISTRO_LOGOS[distro];
  const [errored, setErrored] = React.useState(false);
  const bg = DISTRO_COLORS[distro] || DISTRO_COLORS.default;

  // Determine size classes based on className or size prop
  // If className contains h-6 or w-6, use small sizing
  const isSmall = size === 'sm' || (className?.includes('h-6') || className?.includes('w-6'));
  const isMedium = size === 'md' || (className?.includes('h-8') || className?.includes('w-8') || className?.includes('h-9') || className?.includes('w-9') || className?.includes('h-10') || className?.includes('w-10'));

  // Use rounded (4px) for small, rounded-md (6px) for medium, rounded-lg (8px) for large
  const borderRadius = isSmall ? 'rounded' : isMedium ? 'rounded-md' : 'rounded-lg';
  const iconSize = isSmall ? 'h-3.5 w-3.5' : isMedium ? 'h-5 w-5' : 'h-7 w-7';
  const serverIconSize = isSmall ? 'h-3 w-3' : isMedium ? 'h-4 w-4' : 'h-5 w-5';

  if (logo && !errored) {
    return (
      <div className={cn("h-12 w-12 flex items-center justify-center border border-border/40 overflow-hidden", borderRadius, bg, className)}>
        <img
          src={logo}
          alt={host.distro || host.os}
          className={cn("object-contain invert brightness-0", iconSize)}
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  return (
    <div className={cn("h-10 w-10 flex items-center justify-center bg-primary/15 text-primary", borderRadius, className)}>
      <Server className={serverIconSize} />
    </div>
  );
};

export const DistroAvatar = memo(DistroAvatarInner);
DistroAvatar.displayName = 'DistroAvatar';
