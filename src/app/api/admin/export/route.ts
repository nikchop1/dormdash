import { apiAdmin } from "@/lib/auth/session";
import { ApiError, route } from "@/lib/http";
import { kpiSummary, ordersByBuilding, ordersBySpot, ordersPerDay, ordersPerWeek, peakHeatmap, toCsv, type KpiRange } from "@/lib/services/kpis";

const REPORTS = ["summary", "daily", "weekly", "buildings", "spots", "heatmap"] as const;

// CSV exports of every KPI table, for investor decks and spreadsheets.
export const GET = route(async (req) => {
  await apiAdmin();
  const url = new URL(req.url);
  const report = url.searchParams.get("report") as (typeof REPORTS)[number];
  const daysParam = Number(url.searchParams.get("days") ?? 30);
  const days = ([7, 30, 90, 365].includes(daysParam) ? daysParam : 30) as KpiRange;
  if (!REPORTS.includes(report)) throw new ApiError(400, "bad_report", `report must be one of: ${REPORTS.join(", ")}`);

  let rows: Record<string, unknown>[];
  switch (report) {
    case "summary": {
      const s = await kpiSummary(days);
      rows = Object.entries(s).map(([metric, value]) => ({ metric, value: typeof value === "number" ? Math.round(value * 100) / 100 : value }));
      break;
    }
    case "daily":
      rows = await ordersPerDay(days);
      break;
    case "weekly":
      rows = await ordersPerWeek(days);
      break;
    case "buildings":
      rows = await ordersByBuilding(days);
      break;
    case "spots":
      rows = await ordersBySpot(days);
      break;
    case "heatmap":
      rows = (await peakHeatmap(days)).map((r) => ({ weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][r.dow], hour_ny: r.hour, orders: r.orders }));
      break;
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows) || "no data\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="floordrop-${report}-${days}d-${date}.csv"`,
    },
  });
});
