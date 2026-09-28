import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseBackend = process.env.DATABASE_BACKEND ?? "replit";
const connectionString =
  databaseBackend === "supabase"
    ? process.env.SUPABASE_DATABASE_URL
    : databaseBackend === "replit"
      ? process.env.DATABASE_URL
      : undefined;

if (!connectionString) {
  throw new Error(
    databaseBackend === "supabase"
      ? "SUPABASE_DATABASE_URL must be set when DATABASE_BACKEND=supabase."
      : databaseBackend === "replit"
        ? "DATABASE_URL must be set when DATABASE_BACKEND=replit."
        : `Unsupported DATABASE_BACKEND: ${databaseBackend}`,
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
