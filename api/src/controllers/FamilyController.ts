import { Request, Response } from "express";
import prisma from '../lib/prisma';

export const getMembers = async (req: Request, res: Response) => {
    try {
        const members = await prisma.familyMember.findMany();
        res.json(members);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch family members" });
    }
};

export const createMember = async (req: Request, res: Response) => {
    try {
        const { name, dateOfBirth, preferences } = req.body;
        const member = await prisma.familyMember.create({
            data: {
                name,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                preferences
            }
        });
        res.json(member);
    } catch (error) {
        res.status(500).json({ error: "Failed to create family member" });
    }
};

export const updateMember = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, dateOfBirth, preferences } = req.body;
        const member = await prisma.familyMember.update({
            where: { id: parseInt(id) },
            data: {
                name,
                dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                preferences
            }
        });
        res.json(member);
    } catch (error) {
        res.status(500).json({ error: "Failed to update family member" });
    }
};

export const deleteMember = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.familyMember.delete({
            where: { id: parseInt(id) }
        });
        res.json({ message: "Member deleted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete family member" });
    }
};

export const getGeneralPreferences = async (req: Request, res: Response) => {
    try {
        const setting = await prisma.systemSetting.findUnique({
            where: { key: 'family_general_preferences' }
        });
        res.json({ preferences: setting?.value || '' });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch general preferences" });
    }
};

export const saveGeneralPreferences = async (req: Request, res: Response) => {
    try {
        const { preferences } = req.body;
        const setting = await prisma.systemSetting.upsert({
            where: { key: 'family_general_preferences' },
            update: { value: preferences },
            create: { key: 'family_general_preferences', value: preferences }
        });
        res.json(setting);
    } catch (error) {
        res.status(500).json({ error: "Failed to save general preferences" });
    }
};
