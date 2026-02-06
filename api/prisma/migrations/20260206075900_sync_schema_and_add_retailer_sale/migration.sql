-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "modelUsed" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "toolCallData" TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "toolCallDurationMs" INTEGER;

-- AlterTable
ALTER TABLE "MealPlan" ADD COLUMN "servingsConsumed" REAL;

-- CreateTable
CREATE TABLE "ChatSummary" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChatSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RetailerSale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productName" TEXT NOT NULL,
    "productUrl" TEXT,
    "retailer" TEXT NOT NULL,
    "salePrice" REAL,
    "originalPrice" REAL,
    "validFrom" DATETIME,
    "validTo" DATETIME,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "foundAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatSummary_sessionId_key" ON "ChatSummary"("sessionId");
