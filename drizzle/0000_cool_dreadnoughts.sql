-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "YOUTUBE_CHANNELS" (
	"youtube_channel" text PRIMARY KEY NOT NULL,
	"last_updated" bigint
);
--> statement-breakpoint
CREATE TABLE "INSTALLATIONS" (
	"location" text PRIMARY KEY NOT NULL,
	"api_gateway" text NOT NULL,
	"command_permissions" json NOT NULL,
	"autonomous_permissions" json NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SUBSCRIPTIONS" (
	"location" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "location_scope" PRIMARY KEY("location","scope")
);
--> statement-breakpoint
CREATE TABLE "SUBSCRIPTION_CHANNELS" (
	"location" text NOT NULL,
	"scope" text NOT NULL,
	"channel_id" text NOT NULL,
	CONSTRAINT "pk" PRIMARY KEY("location","scope","channel_id")
);
--> statement-breakpoint
ALTER TABLE "SUBSCRIPTIONS" ADD CONSTRAINT "installation_location" FOREIGN KEY ("location") REFERENCES "public"."INSTALLATIONS"("location") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "SUBSCRIPTION_CHANNELS" ADD CONSTRAINT "fk" FOREIGN KEY ("location","scope") REFERENCES "public"."SUBSCRIPTIONS"("location","scope") ON DELETE cascade ON UPDATE no action;
*/