-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MealPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "recipeId" INTEGER,
    "productId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "MealPlan_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MealPlan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MealPlan" ("createdAt", "date", "id", "productId", "recipeId", "updatedAt") SELECT "createdAt", "date", "id", "productId", "recipeId", "updatedAt" FROM "MealPlan";
DROP TABLE "MealPlan";
ALTER TABLE "new_MealPlan" RENAME TO "MealPlan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
