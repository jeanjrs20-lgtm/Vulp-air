import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const cwd = process.cwd();
dotenv.config({ path: path.resolve(cwd, "apps/api/.env") });
dotenv.config({ path: path.resolve(cwd, ".env") });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_FROM: z.string().default("VULP AIR <no-reply@local>"),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("../../storage"),
  PUBLIC_WEB_URL: z.string().default("http://localhost:3000"),
  PORT: z.coerce.number().default(3001)
});

export const env = EnvSchema.parse(process.env);
