import { Skeleton } from "@/components/ui/misc";

// Shaped like the order status screen: overline, big ETA, runner row, timeline.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-14 md:px-6" aria-busy="true" aria-label="Loading order">
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-3 w-16" />
          <Skeleton className="mt-2 h-14 w-48" />
        </div>
        <Skeleton className="h-12 w-20" />
      </div>
      <div className="mt-6 flex items-center gap-3 border-y border-line py-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="mt-6 space-y-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="size-6" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
