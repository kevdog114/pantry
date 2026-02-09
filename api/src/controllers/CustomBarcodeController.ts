import { NextFunction, Response, Request } from "express";
import prisma from '../lib/prisma';
import { randomUUID } from 'crypto';

// ── Helpers (same pattern as labelPrinterController) ──────────────────────────

const sendPrintCommandAndWait = async (targetSocket: any, payload: any): Promise<{ success: boolean, message: string }> => {
    return new Promise((resolve) => {
        const requestId = randomUUID();
        payload.requestId = requestId;

        const timeout = setTimeout(() => {
            cleanup();
            resolve({ success: false, message: "Print command timed out (no response from device)." });
        }, 15000);

        const listener = (data: any) => {
            if (data && data.requestId === requestId) {
                cleanup();
                resolve({ success: data.success, message: data.message });
            }
        };

        const cleanup = () => {
            clearTimeout(timeout);
            targetSocket.off('print_complete', listener);
        };

        targetSocket.on('print_complete', listener);
        targetSocket.emit('print_label', payload);
    });
};

const findTargetSocket = async (io: any, deviceType: string = 'PRINTER'): Promise<any> => {
    const connectedSockets = await io.fetchSockets();

    for (const socket of connectedSockets) {
        const pat = (socket as any).pat;
        const clientType = (socket as any).clientType;
        if (!pat || clientType !== 'bridge') continue;

        if (pat.description && pat.description.startsWith('Kiosk Login - ')) {
            const kioskName = pat.description.substring('Kiosk Login - '.length);
            const kiosk = await prisma.kiosk.findFirst({
                where: { userId: pat.userId, name: kioskName },
                include: { devices: true }
            });

            if (kiosk) {
                const printer = kiosk.devices.find((d: any) => d.type === deviceType && (d.status === 'ONLINE' || d.status === 'READY'));
                if (printer) return socket;
            }
        }
    }
    return null;
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const barcodes = await prisma.customBarcode.findMany({ orderBy: { updatedAt: 'desc' } });
        res.json(barcodes);
    } catch (e) {
        console.error('Error fetching custom barcodes', e);
        res.status(500).json({ message: "Failed to fetch custom barcodes" });
    }
};

export const getById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const id = parseInt(req.params.id);
        const barcode = await prisma.customBarcode.findUnique({ where: { id } });
        if (!barcode) return res.status(404).json({ message: "Not found" });
        res.json(barcode);
    } catch (e) {
        console.error('Error fetching custom barcode', e);
        res.status(500).json({ message: "Failed to fetch custom barcode" });
    }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const { title, data } = req.body;
        if (!data || data.trim() === '') return res.status(400).json({ message: "Barcode data is required" });

        const barcode = await prisma.customBarcode.create({
            data: { title: title || '', data: data.trim() }
        });
        res.status(201).json(barcode);
    } catch (e) {
        console.error('Error creating custom barcode', e);
        res.status(500).json({ message: "Failed to create custom barcode" });
    }
};

export const update = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const id = parseInt(req.params.id);
        const { title, data } = req.body;
        if (!data || data.trim() === '') return res.status(400).json({ message: "Barcode data is required" });

        const barcode = await prisma.customBarcode.update({
            where: { id },
            data: { title: title || '', data: data.trim() }
        });
        res.json(barcode);
    } catch (e) {
        console.error('Error updating custom barcode', e);
        res.status(500).json({ message: "Failed to update custom barcode" });
    }
};

export const deleteById = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const id = parseInt(req.params.id);
        await prisma.customBarcode.delete({ where: { id } });
        res.json({ message: "Deleted" });
    } catch (e) {
        console.error('Error deleting custom barcode', e);
        res.status(500).json({ message: "Failed to delete custom barcode" });
    }
};

// ── Print to Label Printer ───────────────────────────────────────────────────

export const printLabel = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const id = parseInt(req.params.id);
        const barcode = await prisma.customBarcode.findUnique({ where: { id } });
        if (!barcode) return res.status(404).json({ message: "Not found" });

        const io = req.app.get('io');
        const targetSocket = await findTargetSocket(io, 'PRINTER');
        if (!targetSocket) return res.status(503).json({ message: "No online label printers found." });

        const payload = {
            type: 'CUSTOM_QR_LABEL',
            data: {
                title: barcode.title,
                qrData: `HA:${barcode.data}`,
            }
        };

        const result = await sendPrintCommandAndWait(targetSocket, payload);

        if (result.success) {
            res.json({ success: true, message: "Label printed." });
        } else {
            res.status(500).json({ success: false, message: "Print failed: " + result.message });
        }
    } catch (e) {
        console.error('Error printing custom barcode label', e);
        res.status(500).json({ message: "Failed to print label" });
    }
};

// ── Print to Receipt Printer ─────────────────────────────────────────────────

export const printReceipt = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
        const id = parseInt(req.params.id);
        const { includeTitle } = req.body;
        const barcode = await prisma.customBarcode.findUnique({ where: { id } });
        if (!barcode) return res.status(404).json({ message: "Not found" });

        const io = req.app.get('io');
        const targetSocket = await findTargetSocket(io, 'RECEIPT_PRINTER');
        if (!targetSocket) return res.status(503).json({ message: "No online receipt printers found." });

        const payload = {
            type: 'CUSTOM_QR_RECEIPT',
            data: {
                title: includeTitle ? barcode.title : null,
                qrData: `HA:${barcode.data}`,
            }
        };

        const result = await sendPrintCommandAndWait(targetSocket, payload);

        if (result.success) {
            res.json({ success: true, message: "Receipt printed." });
        } else {
            res.status(500).json({ success: false, message: "Print failed: " + result.message });
        }
    } catch (e) {
        console.error('Error printing custom barcode receipt', e);
        res.status(500).json({ message: "Failed to print receipt" });
    }
};
