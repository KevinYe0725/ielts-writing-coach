ALTER TABLE "provider_connection" ADD COLUMN "vendor" text DEFAULT 'custom' NOT NULL;
UPDATE "provider_connection" SET "vendor" = 'openai' WHERE "kind" = 'openai';
UPDATE "provider_connection" SET "vendor" = 'mock' WHERE "kind" = 'mock';
