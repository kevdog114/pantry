-- CreateTable
CREATE TABLE "StockReservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stockItemId" INTEGER NOT NULL,
    "mealPlanId" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StockReservation_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StockReservation_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
