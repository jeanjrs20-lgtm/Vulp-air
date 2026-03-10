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
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_REGION: z.string().default("us-east-1"),
  STORAGE_S3_ENDPOINT: z.string().optional(),
  STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  PUBLIC_WEB_URL: z.string().default("http://localhost:3000"),
  PORT: z.coerce.number().default(3001)
}).superRefine((value, ctx) => {
  if (value.STORAGE_DRIVER !== "s3") {
    return;
  }

  const requiredFields = [
    ["STORAGE_S3_BUCKET", value.STORAGE_S3_BUCKET],
    ["STORAGE_S3_REGION", value.STORAGE_S3_REGION],
    ["STORAGE_S3_ACCESS_KEY_ID", value.STORAGE_S3_ACCESS_KEY_ID],
    ["STORAGE_S3_SECRET_ACCESS_KEY", value.STORAGE_S3_SECRET_ACCESS_KEY]
  ] as const;

  for (const [field, fieldValue] of requiredFields) {
    if (!fieldValue || !fieldValue.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} e obrigatorio quando STORAGE_DRIVER=s3`
      });
    }
  }
});

export const env = EnvSchema.parse(process.env);
