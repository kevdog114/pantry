
import { Request, Response } from 'express';
import { WeatherService } from '../services/WeatherService';

const service = new WeatherService();

export class WeatherController {

    // Use an arrow function to preserve 'this' context if needed, though here we use 'service' which is captured.
    static async getSettings(req: Request, res: Response) {
        try {
            const settings = await service.getSettings();
            res.json(settings);
        } catch (err) {
            console.error(err);
            res.status(500).send('Error fetching settings');
        }
    }

    static async updateSettings(req: Request, res: Response) {
        try {
            const { provider, lat, lon } = req.body;
            await service.updateSettings(provider, lat, lon);
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).send('Error updating settings');
        }
    }

    static async getForecast(req: Request, res: Response) {
        try {
            const start = req.query.start as string;
            const end = req.query.end as string;
            if (!start || !end) {
                res.status(400).send("Bad Request: Start and End query params required. Format: YYYY-MM-DD");
                return;
            }
            // Parse dates. Assume incoming format is compatible with Date constructor
            const data = await service.getForecast(new Date(start), new Date(end));
            res.json(data);
        } catch (err) {
            console.error(err);
            res.status(500).send('Error fetching forecast');
        }
    }
}
