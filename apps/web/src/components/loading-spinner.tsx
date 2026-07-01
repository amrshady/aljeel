import { cn } from '@aljeel/ui';

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'size-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary',
        className,
      )}
    />
  );
}

export function PageLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex min-h-[50vh] items-center justify-center',
        className,
      )}
    >
      <LoadingSpinner />
    </div>
  );
}
