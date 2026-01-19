/* eslint-disable @typescript-eslint/no-var-requires */
const { NlpManager } = require('node-nlp');

class IntentEngine {
    private manager: any;
    private isTrained: boolean = false;

    constructor() {
        this.manager = new NlpManager({ languages: ['en'], forceNER: true, nlu: { log: false } });
    }

    async initialize() {
        if (this.isTrained) return;

        // Intent: shopping.add
        this.manager.addDocument('en', 'add to shopping list', 'shopping.add');
        this.manager.addDocument('en', 'add item to list', 'shopping.add');
        this.manager.addDocument('en', 'add something to my shopping list', 'shopping.add');
        this.manager.addDocument('en', 'add this to the shopping list', 'shopping.add');

        // "add [item] to shopping list" - variation
        this.manager.addDocument('en', 'add to shopping list', 'shopping.add');
        this.manager.addDocument('en', 'remind me to buy', 'shopping.add');
        this.manager.addDocument('en', 'buy', 'shopping.add');
        this.manager.addDocument('en', 'need to buy', 'shopping.add');

        // Since we are using this for "Smart Chat", we want to be conservative so we don't intercept "How do I buy a house?" as a shopping list item.
        // So "buy" might be too aggressive.

        this.manager.addDocument('en', 'add * to shopping list', 'shopping.add');
        this.manager.addDocument('en', 'add * to the list', 'shopping.add');
        this.manager.addDocument('en', 'put * on the list', 'shopping.add');

        await this.manager.train();
        this.isTrained = true;
        console.log('IntentEngine trained.');
    }

    async process(text: string) {
        if (!this.isTrained) await this.initialize();
        return this.manager.process('en', text);
    }
}

export const intentEngine = new IntentEngine();
