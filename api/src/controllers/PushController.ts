import { Request, Response } from "express";
import prisma from '../lib/prisma';
import webpush from 'web-push';
import { SystemSetting } from "@prisma/client";

// Ensure keys exist or generate them
async function getVapidKeys() {
    const settings = await prisma.systemSetting.findMany({
        where: {
            key: {
                in: ['vapid_public_key', 'vapid_private_key', 'vapid_subject']
            }
        }
    });

    let publicKey = settings.find(s => s.key === 'vapid_public_key')?.value;
    let privateKey = settings.find(s => s.key === 'vapid_private_key')?.value;
    let subject = settings.find(s => s.key === 'vapid_subject')?.value;

    if (!publicKey || !privateKey) {
        const keys = webpush.generateVAPIDKeys();
        publicKey = keys.publicKey;
        privateKey = keys.privateKey;

        await prisma.systemSetting.upsert({ where: { key: 'vapid_public_key' }, update: { value: publicKey }, create: { key: 'vapid_public_key', value: publicKey } });
        await prisma.systemSetting.upsert({ where: { key: 'vapid_private_key' }, update: { value: privateKey }, create: { key: 'vapid_private_key', value: privateKey } });
    }

    if (!subject) {
        // Default subject (should be a mailto or URL)
        subject = 'mailto:admin@example.com';
        await prisma.systemSetting.upsert({ where: { key: 'vapid_subject' }, update: { value: subject }, create: { key: 'vapid_subject', value: subject } });
    }

    return { publicKey, privateKey, subject };
}

export const getPublicKey = async (req: Request, res: Response) => {
    try {
        const { publicKey } = await getVapidKeys();
        res.json({ publicKey });
    } catch (error) {
        console.error("Error getting VAPID key:", error);
        res.status(500).json({ message: "Error retrieveing configuration" });
    }
};

export const subscribe = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any).id;
        const subscription = req.body;

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            res.status(400).json({ message: "Invalid subscription object" });
            return;
        }

        // Check if subscription already exists for this user
        const existing = await prisma.pushSubscription.findFirst({
            where: {
                userId,
                endpoint: subscription.endpoint
            }
        });

        if (existing) {
            // Update keys if they changed
            await prisma.pushSubscription.update({
                where: { id: existing.id },
                data: {
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth,
                    userAgent: req.headers['user-agent'] || 'Unknown Device'
                }
            });
        } else {
            await prisma.pushSubscription.create({
                data: {
                    userId,
                    endpoint: subscription.endpoint,
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth,
                    userAgent: req.headers['user-agent'] || 'Unknown Device'
                }
            });
        }

        res.json({ message: "Subscribed successfully" });
    } catch (error) {
        console.error("Error subscribing:", error);
        res.status(500).json({ message: "Error processing subscription" });
    }
};

export const sendTestNotification = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any).id;
        const { publicKey, privateKey, subject } = await getVapidKeys();

        webpush.setVapidDetails(subject, publicKey, privateKey);

        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId }
        });

        const payload = JSON.stringify({
            notification: {
                title: 'Test Notification',
                body: 'This is a test notification from your Pantry app!',
                icon: 'assets/icons/icon-72x72.png',
                vibrate: [100, 50, 100],
                data: {
                    dateOfArrival: Date.now(),
                    primaryKey: 1
                }
            }
        });

        const promises = subscriptions.map(sub => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };

            return webpush.sendNotification(pushSubscription, payload)
                .catch(async (err) => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Subscription has expired or is no longer valid
                        console.log(`Deleting expired subscription for user ${userId}`);
                        await prisma.pushSubscription.delete({ where: { id: sub.id } });
                    } else {
                        throw err;
                    }
                });
        });

        await Promise.all(promises);

        res.json({ message: `Sent test notification to ${subscriptions.length} devices` });
    } catch (error) {
        console.error("Error sending notification:", error);
        res.status(500).json({ message: "Error sending notification" });
    }
};

export const getSubscriptions = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any).id;
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId },
            select: {
                id: true,
                userAgent: true,
                createdAt: true,
                endpoint: true
            }
        });
        res.json(subscriptions);
    } catch (error) {
        console.error("Error fetching subscriptions:", error);
        res.status(500).json({ message: "Error fetching subscriptions" });
    }
};

export const deleteSubscription = async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any).id;
        const id = parseInt(req.params.id);

        const sub = await prisma.pushSubscription.findFirst({
            where: { id, userId }
        });

        if (!sub) {
            res.status(404).json({ message: "Subscription not found" });
            return;
        }

        await prisma.pushSubscription.delete({ where: { id } });
        res.json({ message: "Subscription deleted" });
    } catch (error) {
        console.error("Error deleting subscription:", error);
        res.status(500).json({ message: "Error deleting subscription" });
    }
};
