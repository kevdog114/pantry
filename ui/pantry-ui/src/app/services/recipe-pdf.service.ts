import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import { Recipe } from '../types/recipe';
import { ChatRecipe } from '../components/recipe-card/recipe-card.component';

export interface PdfRecipeData {
    title: string;
    description?: string;
    prepTime?: string;
    cookTime?: string;
    totalTime?: string;
    yield?: string;
    ingredients: string[];
    instructions: string[];
    source?: string;
}

@Injectable({
    providedIn: 'root'
})
export class RecipePdfService {

    constructor() { }

    generatePdf(data: PdfRecipeData) {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);
        let y = 20;

        // Title
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');

        // Split title if it's too long
        const titleLines = doc.splitTextToSize(data.title, contentWidth);
        doc.text(titleLines, margin, y);
        y += (10 * titleLines.length) + 5;

        // Description
        if (data.description) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'italic');
            const descLines = doc.splitTextToSize(data.description, contentWidth);
            doc.text(descLines, margin, y);
            y += (5 * descLines.length) + 10;
        }

        // Meta Info
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        let metaText = '';
        if (data.prepTime) metaText += `Prep: ${data.prepTime}   `;
        if (data.cookTime) metaText += `Cook: ${data.cookTime}   `;
        if (data.totalTime) metaText += `Total: ${data.totalTime}   `;
        if (data.yield) metaText += `Yield: ${data.yield}`;

        if (metaText) {
            doc.text(metaText, margin, y);
            y += 10;
        }

        // Source
        if (data.source) {
            doc.setFontSize(9);
            doc.setTextColor(100);
            const sourceLines = doc.splitTextToSize(`Source: ${data.source}`, contentWidth);
            doc.text(sourceLines, margin, y);
            doc.setTextColor(0); // Reset color
            y += (5 * sourceLines.length) + 5;
        } else {
            y += 5;
        }

        // Line separator
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        // Ingredients
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Ingredients', margin, y);
        y += 8;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        data.ingredients.forEach(ing => {
            const ingLines = doc.splitTextToSize(`• ${ing}`, contentWidth - 5);
            if (y + (5 * ingLines.length) > 280) {
                doc.addPage();
                y = 20;
            }
            doc.text(ingLines, margin + 5, y);
            y += (5 * ingLines.length) + 2;
        });

        y += 10;

        // Instructions
        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Instructions', margin, y);
        y += 8;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        data.instructions.forEach((inst, index) => {
            const stepPrefix = `${index + 1}. `;
            const instLines = doc.splitTextToSize(`${stepPrefix}${inst}`, contentWidth - 5);

            if (y + (5 * instLines.length) > 280) {
                doc.addPage();
                y = 20;
            }

            doc.text(instLines, margin + 5, y);
            y += (5 * instLines.length) + 4;
        });

        // Save
        // Sanitize filename
        const filename = data.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf';
        doc.save(filename);
    }

    // Adapter for internal Recipe type
    generateFromRecipe(recipe: Recipe) {
        const data: PdfRecipeData = {
            title: recipe.title,
            description: recipe.description,
            prepTime: recipe.prepTime ? `${recipe.prepTime} min` : undefined,
            cookTime: recipe.cookTime ? `${recipe.cookTime} min` : undefined,
            totalTime: recipe.totalTime ? `${recipe.totalTime} min` : undefined,
            yield: recipe.yield || undefined,
            ingredients: recipe.ingredients?.map(i => {
                let text = i.name;
                if (i.amount) text += ` - ${i.amount} ${i.unit || ''}`;
                return text;
            }) || [],
            instructions: recipe.steps?.map(s => s.description) || [],
            source: recipe.source || undefined
        };
        this.generatePdf(data);
    }

    // Adapter for ChatRecipe type
    generateFromChatRecipe(recipe: ChatRecipe) {
        const data: PdfRecipeData = {
            title: recipe.title,
            description: recipe.description,
            prepTime: recipe.time?.prep,
            cookTime: recipe.time?.cook,
            totalTime: recipe.time?.total,
            // ChatRecipe doesn't seem to have yield?
            ingredients: recipe.ingredients.map(i => {
                let text = i.name;
                if (i.amount) text += ` - ${i.amount} ${i.unit || ''}`;
                return text;
            }),
            instructions: recipe.instructions,
            source: 'Gemini AI'
        };
        this.generatePdf(data);
    }
}
