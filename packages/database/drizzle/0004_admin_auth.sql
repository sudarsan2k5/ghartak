ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_password_hash_argon2id" CHECK ("password_hash" is null or ("password_hash" ~ '^[$]argon2id[$]' and char_length("password_hash") between 50 and 255));--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "admin_sessions_token_hash_format" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "admin_sessions_expires_after_create" CHECK ("expires_at" > "created_at"),
	CONSTRAINT "admin_sessions_revoked_after_create" CHECK ("revoked_at" is null or "revoked_at" >= "created_at")
);--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_sessions_user_id_idx" ON "admin_sessions" USING btree ("user_id");
