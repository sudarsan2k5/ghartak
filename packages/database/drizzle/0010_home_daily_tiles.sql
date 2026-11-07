ALTER TABLE "categories" ADD COLUMN "image_object_key" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "image_delivery_path" text;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_image_pair" CHECK (("image_object_key" IS NULL) = ("image_delivery_path" IS NULL));--> statement-breakpoint
CREATE TABLE "home_daily_tiles" (
	"position" integer PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"category_id" uuid,
	"image_object_key" text,
	"image_delivery_path" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "home_daily_tiles_position_range" CHECK ("position" BETWEEN 1 AND 4),
	CONSTRAINT "home_daily_tiles_label_length" CHECK (char_length("label") BETWEEN 1 AND 40),
	CONSTRAINT "home_daily_tiles_image_pair" CHECK (("image_object_key" IS NULL) = ("image_delivery_path" IS NULL))
);--> statement-breakpoint
ALTER TABLE "home_daily_tiles" ADD CONSTRAINT "home_daily_tiles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "home_daily_tiles" ("position", "label", "category_id") VALUES
	(1, 'Vegetables', (SELECT "id" FROM "categories" WHERE "slug" = 'produce')),
	(2, 'Atta, Rice & Dal', (SELECT "id" FROM "categories" WHERE "slug" = 'staples')),
	(3, 'Oil, Ghee & Masala', NULL),
	(4, 'Drinks & Biscuits', NULL);
