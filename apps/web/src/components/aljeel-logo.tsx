import { cn } from '@aljeel/ui';
import Image from 'next/image';

type AljeelLogoProps = {
  variant?: 'default' | 'light';
  className?: string;
  priority?: boolean;
};

const LOGO = {
  light: { src: '/aljeel-logo.svg', width: 640, height: 452 },
  default: { src: '/aljeel-logo-transparent.png', width: 148, height: 113 },
} as const;

export function AljeelLogo({ variant = 'default', className, priority }: AljeelLogoProps) {
  const { src, width, height } = LOGO[variant];

  return (
    <Image
      src={src}
      alt="Aljeel"
      width={width}
      height={height}
      priority={priority}
      unoptimized
      className={cn(
        variant === 'light' ? 'h-12' : 'h-14',
        'w-auto overflow-visible object-contain object-left',
        className,
      )}
    />
  );
}
