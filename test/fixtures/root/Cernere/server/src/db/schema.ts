import { pgTable, text, uuid, boolean, bigint, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  totpSecret: text("totp_secret"),
  phoneNumber: text("phone_number"),
  passwordHash: text("password_hash"),
});

export const projectOauthTokens = pgTable("project_oauth_tokens", {
  id: uuid("id").primaryKey(),
  projectKey: text("project_key").notNull(),
  userId: uuid("user_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
});
