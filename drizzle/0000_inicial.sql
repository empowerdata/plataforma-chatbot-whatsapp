CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."event_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('unconfigured', 'ok', 'error');--> statement-breakpoint
CREATE TYPE "public"."knowledge_kind" AS ENUM('text', 'faq', 'file', 'url');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('pending', 'indexing', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."node_kind" AS ENUM('http', 'fake');--> statement-breakpoint
CREATE TYPE "public"."number_status" AS ENUM('created', 'qr', 'connecting', 'open', 'close', 'banned');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'member');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"plan" jsonb DEFAULT '{"includedNumbers":3,"maxNumbers":0,"maxBots":0}'::jsonb NOT NULL,
	"branding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_key" text,
	"config" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"segment" text,
	"contact_name" text,
	"contact_phone" text,
	"city" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"number_id" uuid,
	"level" "event_level" DEFAULT 'info' NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evolution_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "node_kind" DEFAULT 'http' NOT NULL,
	"base_url" text NOT NULL,
	"api_key_enc" text NOT NULL,
	"capacity" integer DEFAULT 40 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_health_at" timestamp with time zone,
	"last_health_ok" boolean,
	"last_health_error" text,
	"version" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"supabase_db_url_enc" text,
	"supabase_status" "integration_status" DEFAULT 'unconfigured' NOT NULL,
	"supabase_schema_version" integer DEFAULT 0 NOT NULL,
	"supabase_checked_at" timestamp with time zone,
	"supabase_error" text,
	"openai_key_enc" text,
	"openai_model" text DEFAULT 'gpt-5.4-mini' NOT NULL,
	"openai_status" "integration_status" DEFAULT 'unconfigured' NOT NULL,
	"openai_checked_at" timestamp with time zone,
	"openai_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"bot_id" uuid NOT NULL,
	"kind" "knowledge_kind" NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source_name" text,
	"source_url" text,
	"status" "knowledge_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"client_id" uuid,
	"bot_id" uuid,
	"node_id" uuid NOT NULL,
	"label" text NOT NULL,
	"phone" text,
	"profile_name" text,
	"instance_name" text NOT NULL,
	"instance_token_enc" text,
	"webhook_token" text NOT NULL,
	"status" "number_status" DEFAULT 'created' NOT NULL,
	"status_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_qr" text,
	"last_qr_at" timestamp with time zone,
	"pairing_code" text,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bot_enabled" boolean DEFAULT true NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_number_id_numbers_id_fk" FOREIGN KEY ("number_id") REFERENCES "public"."numbers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_node_id_evolution_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."evolution_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_tokens" ADD CONSTRAINT "password_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_slug_idx" ON "accounts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "bots_account_idx" ON "bots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "clients_account_idx" ON "clients" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "events_account_idx" ON "events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "events_number_idx" ON "events" USING btree ("number_id","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_bot_idx" ON "knowledge_items" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "numbers_account_idx" ON "numbers" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "numbers_instance_idx" ON "numbers" USING btree ("instance_name");--> statement-breakpoint
CREATE UNIQUE INDEX "numbers_webhook_idx" ON "numbers" USING btree ("webhook_token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "users_account_idx" ON "users" USING btree ("account_id");