CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`kind` text NOT NULL,
	`storage_key` text NOT NULL,
	`parsed_at` text,
	CONSTRAINT "attachments_kind_valid" CHECK(kind IN ('PDF', 'IMAGE', 'EMAIL_RAW'))
);
--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`trip_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`provider` text,
	`confirmation_number` text,
	`original_url` text,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`parsed_by` text NOT NULL,
	`cost_amount` integer,
	`cost_currency` text,
	`raw_attachment_id` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raw_attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bookings_type_valid" CHECK(type IN ('ACCOMMODATION', 'TRANSPORT', 'ACTIVITY')),
	CONSTRAINT "bookings_status_valid" CHECK(status IN ('CONFIRMED', 'PENDING', 'CANCELLED')),
	CONSTRAINT "bookings_source_valid" CHECK(source IN ('SHARE', 'PDF', 'EMAIL', 'CALENDAR', 'MANUAL')),
	CONSTRAINT "bookings_parsed_by_valid" CHECK(parsed_by IN ('DETERMINISTIC', 'LLM', 'MANUAL')),
	CONSTRAINT "bookings_cost_nonnegative" CHECK("bookings"."cost_amount" IS NULL OR "bookings"."cost_amount" >= 0),
	CONSTRAINT "bookings_cost_pair" CHECK(("bookings"."cost_amount" IS NULL) = ("bookings"."cost_currency" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `bookings_trip_id_idx` ON `bookings` (`trip_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`name` text NOT NULL,
	`address` text,
	`lat` real,
	`lng` real,
	`timezone` text,
	CONSTRAINT "locations_lat_range" CHECK("locations"."lat" IS NULL OR "locations"."lat" BETWEEN -90 AND 90),
	CONSTRAINT "locations_lng_range" CHECK("locations"."lng" IS NULL OR "locations"."lng" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE `segments` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`booking_id` text NOT NULL,
	`start_at_utc` text NOT NULL,
	`end_at_utc` text NOT NULL,
	`start_timezone` text NOT NULL,
	`end_timezone` text NOT NULL,
	`start_location_id` text,
	`end_location_id` text,
	`flight_number` text,
	`seat` text,
	`gate` text,
	`terminal` text,
	`room` text,
	`meeting_point` text,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`start_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`end_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "segments_times_ordered" CHECK("segments"."start_at_utc" <= "segments"."end_at_utc"),
	CONSTRAINT "segments_utc_format" CHECK("segments"."start_at_utc" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z' AND "segments"."end_at_utc" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z')
);
--> statement-breakpoint
CREATE INDEX `segments_booking_id_idx` ON `segments` (`booking_id`);--> statement-breakpoint
CREATE INDEX `segments_start_at_utc_idx` ON `segments` (`start_at_utc`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`title` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`cover_image` text,
	`home_timezone` text NOT NULL,
	CONSTRAINT "trips_dates_ordered" CHECK("trips"."start_date" <= "trips"."end_date")
);
