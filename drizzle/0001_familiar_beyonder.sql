ALTER TYPE "public"."user_role" ADD VALUE 'client';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_client_idx" ON "users" USING btree ("client_id");