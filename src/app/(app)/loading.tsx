import { RowSkeleton, Skeleton } from "@/components/ui/misc";

// Shaped like a typical app screen: overline, big title, a list.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-6 md:px-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-10 w-3/4" />
      <Skeleton className="mt-2 h-10 w-1/2" />
      <Skeleton className="mt-6 mb-8 h-4 w-2/3" />
      <RowSkeleton count={5} />
    </div>
  );
}
