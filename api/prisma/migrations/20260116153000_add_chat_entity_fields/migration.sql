-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN "entityId" INTEGER;
ALTER TABLE "ChatSession" ADD COLUMN "entityType" TEXT;

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN "unit" TEXT;

-- CreateTable
CREATE TABLE "_RecipeToFile" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,
    CONSTRAINT "_RecipeToFile_A_fkey" FOREIGN KEY ("A") REFERENCES "File" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RecipeToFile_B_fkey" FOREIGN KEY ("B") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_RecipeToFile_AB_unique" ON "_RecipeToFile"("A", "B");

-- CreateIndex
CREATE INDEX "_RecipeToFile_B_index" ON "_RecipeToFile"("B");

