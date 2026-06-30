import { cn } from '@aljeel/ui';
import Image from 'next/image';

type AljeelLogoProps = {
  variant?: 'default' | 'light';
  className?: string;
  priority?: boolean;
};

const LOGO_WIDTH = 148;
const LOGO_HEIGHT = 113;

export function AljeelLogo({ variant = 'default', className, priority }: AljeelLogoProps) {
  const src =
    variant === 'light' ? '/aljeel-logo-light.png' : '/aljeel-logo-transparent.png';

  return (
    <Image
      src={src}
      alt="Aljeel"
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      priority={priority}
      className={cn(
        variant === 'light' ? 'h-8' : 'h-14',
        'w-auto object-contain',
        className,
      )}
    />
  );
}
