CREATE TABLE "proctors" (
	"andrew_id" text PRIMARY KEY NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
