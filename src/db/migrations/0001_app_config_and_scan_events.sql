CREATE TABLE "app_config" (
	"id" text PRIMARY KEY NOT NULL,
	"spreadsheet_id" text NOT NULL,
	"tab" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"exam_number" text NOT NULL,
	"room_code" text NOT NULL,
	"ta_andrew_id" text NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
