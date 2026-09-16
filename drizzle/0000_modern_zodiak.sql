CREATE TABLE `dataCache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cacheKey` varchar(255) NOT NULL,
	`payload` text NOT NULL,
	`source` varchar(128) NOT NULL,
	`storedAt` timestamp NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`staleUntil` timestamp NOT NULL,
	CONSTRAINT `dataCache_id` PRIMARY KEY(`id`),
	CONSTRAINT `dataCache_cacheKey_unique` UNIQUE(`cacheKey`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerId` varchar(128) NOT NULL,
	`competition` varchar(64) NOT NULL,
	`competitionLabel` varchar(128) NOT NULL,
	`seasonId` varchar(16),
	`homeTeam` varchar(128) NOT NULL,
	`awayTeam` varchar(128) NOT NULL,
	`startTimeUtc` int NOT NULL,
	`status` varchar(32) NOT NULL,
	`homeScore` int,
	`awayScore` int,
	`isRealMadrid` int NOT NULL DEFAULT 0,
	`payload` text NOT NULL,
	`source` varchar(128) NOT NULL,
	`sourceUpdatedAt` timestamp NOT NULL,
	`verifiedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `matches_providerId_unique` UNIQUE(`providerId`)
);
--> statement-breakpoint
CREATE TABLE `providerConflicts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`matchKey` varchar(255) NOT NULL,
	`field` varchar(64) NOT NULL,
	`providerA` varchar(64) NOT NULL,
	`providerB` varchar(64) NOT NULL,
	`valueA` text NOT NULL,
	`valueB` text NOT NULL,
	`winnerProvider` varchar(64) NOT NULL,
	`detectedAt` timestamp NOT NULL,
	CONSTRAINT `providerConflicts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `syncRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(128) NOT NULL,
	`startedAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`status` varchar(32) NOT NULL,
	`matchCount` int NOT NULL DEFAULT 0,
	`latencyMs` int,
	`recordsReceived` int NOT NULL DEFAULT 0,
	`recordsUpdated` int NOT NULL DEFAULT 0,
	`error` text,
	CONSTRAINT `syncRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
