-- CreateTable
CREATE TABLE "DailyWeather" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "highTemp" INTEGER,
    "lowTemp" INTEGER,
    "condition" TEXT,
    "precipitationChance" INTEGER,
    "precipitationAmount" REAL,
    "provider" TEXT NOT NULL,
    "icon" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyWeather_date_key" ON "DailyWeather"("date");
