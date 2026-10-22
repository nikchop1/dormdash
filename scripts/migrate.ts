/**
 * Apply SQL migrations in supabase/migrations to DATABASE_URL (Supabase), or to the
 * local PGlite database when DATABASE_URL isn't set. Safe to run repeatedly.
 */
import { getDb, migrate } from "@/lib/db";
import { dbMode } from "@/lib/env";

async function main() {
  const db = await getDb();
  if (dbMode === "pglite") {
    console.log("Local PGlite database is migrated automatically. Done.");
  } else {
    const applied = await migrate(db, { local: false });
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Already up to date.");
  }
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
