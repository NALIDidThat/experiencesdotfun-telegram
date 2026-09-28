import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const databaseBackend = process.env.DATABASE_BACKEND ?? "replit";
let connectionString: string;

if (databaseBackend === "supabase") {
  if (!process.env.SUPABASE_DATABASE_URL) {
    throw new Error("SUPABASE_DATABASE_URL must be set when DATABASE_BACKEND=supabase.");
  }
  connectionString = process.env.SUPABASE_DATABASE_URL;
} else if (databaseBackend === "replit") {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set when DATABASE_BACKEND=replit.");
  }
  connectionString = process.env.DATABASE_URL;
} else {
  throw new Error(`Unsupported DATABASE_BACKEND: ${databaseBackend}`);
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
