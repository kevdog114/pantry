
import prisma from './lib/prisma';

async function test() {
    try {
        console.log("Checking MealTask count...");
        const count = await prisma.mealTask.count();
        console.log("MealTask count:", count);
    } catch (e) {
        console.error("Error accessing MealTask:", e);
    } finally {
        await prisma.$disconnect();
    }
}

test();
