import { Request, Response } from 'express';
import { SalesService } from '../services/SalesService';

const salesService = new SalesService();

/**
 * Get all active retailer sales from the database
 */
export async function getSales(req: Request, res: Response) {
    try {
        const sales = await salesService.getAllSales();
        res.json(sales);
    } catch (error: any) {
        console.error('Error fetching sales:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to fetch sales' });
    }
}

/**
 * Trigger a new Costco sales search via Playwright automation
 */
export async function triggerCostcoSearch(req: Request, res: Response) {
    try {
        // This is a long-running process, but for now we'll wait for it.
        // In a more complex app, this might be a background job.
        const result = await salesService.searchCostcoSales();
        res.json({
            success: true,
            message: 'Costco sales search completed',
            ...result
        });
    } catch (error: any) {
        console.error('Error during Costco sales search:', error);
        res.status(500).json({ success: false, error: error.message || 'Scraping process failed' });
    }
}
