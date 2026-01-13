
import prisma from '../lib/prisma';

export class WeatherService {
    private static readonly USER_AGENT = 'PantryApp/1.0 (my-email@example.com)'; // Update if needed

    async getSettings() {
        const settings = await prisma.systemSetting.findMany({
            where: {
                key: { in: ['weather_provider', 'weather_lat', 'weather_lon'] }
            }
        });

        const config: any = {};
        settings.forEach(s => config[s.key] = s.value);
        return {
            provider: config['weather_provider'] || 'disabled',
            lat: config['weather_lat'],
            lon: config['weather_lon']
        };
    }

    async updateSettings(provider: string, lat?: string, lon?: string) {
        await prisma.systemSetting.upsert({
            where: { key: 'weather_provider' },
            update: { value: provider },
            create: { key: 'weather_provider', value: provider }
        });

        if (lat) {
            await prisma.systemSetting.upsert({
                where: { key: 'weather_lat' },
                update: { value: lat },
                create: { key: 'weather_lat', value: lat }
            });
        }

        if (lon) {
            await prisma.systemSetting.upsert({
                where: { key: 'weather_lon' },
                update: { value: lon },
                create: { key: 'weather_lon', value: lon }
            });
        }

        // Trigger update if enabled
        if (provider !== 'disabled') {
            this.syncWeather(); // Fire and forget
        }
    }

    async syncWeather() {
        console.log('Syncing weather...');
        const settings = await this.getSettings();
        if (settings.provider === 'weather.gov') {
            await this.syncWeatherGov(settings.lat, settings.lon);
        }
    }

    private async syncWeatherGov(lat: string, lon: string) {
        if (!lat || !lon) {
            console.error('Missing specific coordinates for weather.gov');
            return;
        }

        try {
            // 1. Get Point Metadata
            const pointUrl = `https://api.weather.gov/points/${lat},${lon}`;
            const pointRes = await fetch(pointUrl, {
                headers: { 'User-Agent': WeatherService.USER_AGENT }
            });
            if (!pointRes.ok) throw new Error(`Weather point fetch failed: ${pointRes.statusText}`);
            const pointData = await pointRes.json();
            const forecastUrl = pointData.properties.forecast;

            // 2. Get Forecast
            const forecastRes = await fetch(forecastUrl, {
                headers: { 'User-Agent': WeatherService.USER_AGENT }
            });
            if (!forecastRes.ok) throw new Error(`Weather forecast fetch failed: ${forecastRes.statusText}`);
            const forecastData = await forecastRes.json();
            const periods = forecastData.properties.periods;

            // 3. Process Periods
            // We want to group by day.
            const dailyMap = new Map<string, any>();

            for (const period of periods) {
                const dateStr = period.startTime.split('T')[0];

                if (!dailyMap.has(dateStr)) {
                    dailyMap.set(dateStr, {
                        date: new Date(dateStr),
                        high: null,
                        low: null,
                        condition: period.shortForecast,
                        precipChance: 0,
                        icon: period.icon,
                        provider: 'weather.gov'
                    });
                }

                const entry = dailyMap.get(dateStr);

                // Update max precip chance
                if (period.probabilityOfPrecipitation?.value) {
                    entry.precipChance = Math.max(entry.precipChance, period.probabilityOfPrecipitation.value);
                }

                // Is Daytime?
                if (period.isDaytime) {
                    entry.high = period.temperature;
                    entry.condition = period.shortForecast;
                    entry.icon = period.icon;
                } else {
                    entry.low = period.temperature;
                    // If we don't have a high (e.g. starting at night), we might miss condition/icon.
                    // Keep existing if present.
                }
            }

            // 4. Save to DB
            for (const val of dailyMap.values()) {
                await prisma.dailyWeather.upsert({
                    where: { date: val.date },
                    update: {
                        highTemp: val.high,
                        lowTemp: val.low,
                        condition: val.condition,
                        precipitationChance: val.precipChance,
                        icon: val.icon,
                        provider: 'weather.gov',
                        updatedAt: new Date()
                    },
                    create: {
                        date: val.date,
                        highTemp: val.high,
                        lowTemp: val.low,
                        condition: val.condition,
                        precipitationChance: val.precipChance || 0,
                        icon: val.icon,
                        provider: 'weather.gov'
                    }
                });
            }
            console.log('Weather synced successfully.');

        } catch (err) {
            console.error('Error syncing weather:', err);
        }
    }

    async getForecast(startDate: Date, endDate: Date) {
        return prisma.dailyWeather.findMany({
            where: {
                date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            orderBy: { date: 'asc' }
        });
    }
}
