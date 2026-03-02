import { createServer } from "http";
import prisma from "../src/lib/prisma";
import * as crypto from "crypto";
import app from "../src/app";

async function runTest() {
    const port = 4301;
    const testServer = createServer(app);
    await new Promise<void>((resolve) => {
        testServer.listen(port, () => {
            console.log(`Test server running on port ${port}`);
            resolve();
        });
    });

    console.log("Finding user...");
    const user = await prisma.user.findFirst();
    if (!user) {
        console.error("No user found");
        process.exit(1);
    }

    console.log("Creating PAT...");
    const patString = crypto.randomBytes(32).toString('hex');
    const hashedPat = crypto.createHash('sha256').update(patString).digest('hex');
    const pat = await prisma.personalAccessToken.create({
        data: {
            description: "Test Token",
            token: hashedPat,
            userId: user.id
        }
    });

    console.log(`Testing /v1/models on port ${port}...`);

    // Testing models endpoint
    let res = await fetch(`http://127.0.0.1:${port}/v1/models`, {
        headers: {
            'Authorization': `Bearer ${patString}`
        }
    });

    console.log("Status:", res.status);
    let data = await res.json();
    console.log(JSON.stringify(data, null, 2));

    console.log("\nTesting /v1/chat/completions...");
    res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${patString}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gemini-flash-latest',
            messages: [{ role: 'user', content: 'Say hello world' }],
            stream: true
        })
    });

    console.log("Status:", res.status);

    // Read SSE stream
    if (res.body) {
        const decoder = new TextDecoder('utf-8');
        for await (const chunk of res.body) {
            console.log("Chunk:", decoder.decode(chunk as Buffer).trim());
        }
    }

    testServer.close();
    process.exit(0);
}

runTest().catch(e => {
    console.error(e);
    process.exit(1);
});
