-- Phase 6: production data reliability.
-- Apply once against the existing MySQL/TiDB database before enabling the
-- background live scheduler.

ALTER TABLE `syncRuns`
  ADD COLUMN `latencyMs` INT NULL,
  ADD COLUMN `recordsReceived` INT NOT NULL DEFAULT 0,
  ADD COLUMN `recordsUpdated` INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS `dataCache` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `cacheKey` VARCHAR(255) NOT NULL,
  `payload` TEXT NOT NULL,
  `source` VARCHAR(128) NOT NULL,
  `storedAt` TIMESTAMP NOT NULL,
  `expiresAt` TIMESTAMP NOT NULL,
  `staleUntil` TIMESTAMP NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `dataCache_cacheKey_unique` (`cacheKey`)
);

CREATE TABLE IF NOT EXISTS `providerConflicts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `matchKey` VARCHAR(255) NOT NULL,
  `field` VARCHAR(64) NOT NULL,
  `providerA` VARCHAR(64) NOT NULL,
  `providerB` VARCHAR(64) NOT NULL,
  `valueA` TEXT NOT NULL,
  `valueB` TEXT NOT NULL,
  `winnerProvider` VARCHAR(64) NOT NULL,
  `detectedAt` TIMESTAMP NOT NULL,
  PRIMARY KEY (`id`),
  KEY `providerConflicts_detectedAt_idx` (`detectedAt`),
  KEY `providerConflicts_matchKey_idx` (`matchKey`)
);
