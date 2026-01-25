-- CreateTable
CREATE TABLE "RecipeQuickAction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recipeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecipeQuickAction_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
