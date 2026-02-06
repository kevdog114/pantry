import prisma from '../lib/prisma';
import { proxyToMcp } from '../controllers/PlaywrightController';

export class SalesService {
    /**
     * Get all active sales from the database
     */
    async getAllSales() {
        return prisma.retailerSale.findMany({
            where: { isActive: true },
            orderBy: { foundAt: 'desc' }
        });
    }

    /**
     * Search for Costco sales and persist them to the database
     */
    async searchCostcoSales() {
        console.log('Starting Costco Sales Search via Playwright MCP...');

        try {
            // 1. Navigate to Costco Warehouse Savings page
            // This page typically contains the member-only savings (instant rebates)
            const navRes = await proxyToMcp({
                method: 'browser_navigate',
                params: { url: 'https://www.costco.com/warehouse-savings.html' }
            });

            if (!navRes.success) {
                throw new Error('Failed to navigate to Costco: ' + navRes.error);
            }

            // Wait for the product content to be visible
            // We use common selectors for Costco's product grid
            await proxyToMcp({
                method: 'browser_wait_for',
                params: {
                    ref: 'div[data-testid*="product"], .product, .product-tile',
                    timeout: 10000
                }
            });

            // 2. Extract Data using browser_evaluate
            // We run a script in the browser context to parse the items
            const evalRes = await proxyToMcp({
                method: 'browser_evaluate',
                params: {
                    script: `
                        () => {
                            const products = [];
                            // Try multiple selectors as Costco UI varies
                            const items = document.querySelectorAll('.product, .product-tile, [data-testid="product-tile"]');
                            
                            items.forEach(item => {
                                const nameEl = item.querySelector('.description, .product-title, [data-testid="product-description"]');
                                const linkEl = item.querySelector('a');
                                const priceEl = item.querySelector('.price, [data-testid="product-price"]');
                                const savingsEl = item.querySelector('.off-value, .savings, .discount');
                                const imageEl = item.querySelector('img');
                                
                                // Costco often has "Valid through [DATE]" in a specific div
                                const validityEl = item.querySelector('.valid-thru, .date-range');
                                
                                if (nameEl && nameEl.innerText.trim()) {
                                    products.push({
                                        productName: nameEl.innerText.trim(),
                                        productUrl: linkEl ? linkEl.href : null,
                                        salePriceText: priceEl ? priceEl.innerText.trim() : null,
                                        savingsText: savingsEl ? savingsEl.innerText.trim() : null,
                                        imageUrl: imageEl ? imageEl.src : null,
                                        validityText: validityEl ? validityEl.innerText.trim() : null
                                    });
                                }
                            });
                            return products;
                        }
                    `
                }
            });

            if (!evalRes.success) {
                // If browser_evaluate fails, maybe the results are still in a snapshot?
                // But evaluate is preferred for structured data.
                throw new Error('Failed to evaluate scraping script: ' + evalRes.error);
            }

            const scrapedData = (evalRes.result as any)?.result || evalRes.result || [];
            if (!Array.isArray(scrapedData)) {
                console.warn('Scraped data is not an array:', scrapedData);
                return { count: 0 };
            }

            console.log(`Scraped ${scrapedData.length} products from Costco.`);

            // 3. Map and Persist to database
            let newItems = 0;
            let updatedItems = 0;

            for (const item of scrapedData) {
                const salePrice = this.parsePrice(item.salePriceText);
                const savings = this.parsePrice(item.savingsText);
                const originalPrice = (salePrice !== null && savings !== null) ? salePrice + savings : null;

                // Parse "Valid through MM/DD/YY"
                let validTo: Date | null = null;
                if (item.validityText) {
                    validTo = this.parseDate(item.validityText);
                }

                // Find existing by name and retailer
                const existing = await prisma.retailerSale.findFirst({
                    where: {
                        productName: item.productName,
                        retailer: 'Costco'
                    }
                });

                if (existing) {
                    await prisma.retailerSale.update({
                        where: { id: existing.id },
                        data: {
                            productUrl: item.productUrl,
                            salePrice: salePrice,
                            originalPrice: originalPrice,
                            imageUrl: item.imageUrl,
                            validTo: validTo,
                            isActive: true,
                            updatedAt: new Date()
                        }
                    });
                    updatedItems++;
                } else {
                    await prisma.retailerSale.create({
                        data: {
                            productName: item.productName,
                            productUrl: item.productUrl,
                            retailer: 'Costco',
                            salePrice: salePrice,
                            originalPrice: originalPrice,
                            imageUrl: item.imageUrl,
                            validTo: validTo,
                            isActive: true
                        }
                    });
                    newItems++;
                }
            }

            return {
                count: scrapedData.length,
                new: newItems,
                updated: updatedItems
            };

        } catch (error) {
            console.error('Error during Costco scraping process:', error);
            throw error;
        }
    }

    /**
     * Helper to parse price from string like "$12.99" or "4.50 OFF"
     */
    private parsePrice(text: string | null): number | null {
        if (!text) return null;
        // Clean the text and find the first number
        const match = text.replace(/[^0-9.]/g, '');
        if (match) {
            const val = parseFloat(match);
            return isNaN(val) ? null : val;
        }
        return null;
    }

    /**
     * Helper to parse date from string like "Valid through 10/24/26"
     */
    private parseDate(text: string | null): Date | null {
        if (!text) return null;
        // Search for MM/DD/YY or MM/DD/YYYY
        const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (match) {
            const date = new Date(match[0]);
            return isNaN(date.getTime()) ? null : date;
        }
        return null;
    }
}
