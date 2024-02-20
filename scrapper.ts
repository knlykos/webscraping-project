import express from 'express';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PromisePool } from '@supercharge/promise-pool';

puppeteer.use(StealthPlugin());

const app = express();
const port = 3000;

app.get('/search', async (req, res) => {
    const searchTerm = req.query.q || 'Imperial Beach';
    const browser = await puppeteer.launch({ headless: false });

    try {
        const page = await browser.newPage();
        await page.goto('https://www.google.com/search?q=top+home+listing+websites+zillow');

        await page.waitForSelector('#search', { timeout: 5000 });
        const hrefs = await page.evaluate(() => {
            const xpathSelector = '//*[@id="search"]//a';
            const targetElements = document.evaluate(xpathSelector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);

            const hrefList = [];
            for (let i = 0; i < targetElements.snapshotLength; i++) {
                // @ts-ignore
                const href = targetElements.snapshotItem(i).getAttribute('href');
                if (href) {
                    hrefList.push(href);
                }
            }

            return hrefList;
        });
        console.log(hrefs[0]);
        await page.goto('https://www.zillow.com');

        await page.waitForSelector("#search-bar input", { timeout: 1000 });

        await page.focus("#search-bar input");

        await page.keyboard.type(searchTerm);

        await page.keyboard.press('Enter');

        const btnQstn = await page.waitForSelector('::-p-xpath(//*[text()="Skip this question"])', { timeout: 4000 });
        await btnQstn.click();

        await page.waitForSelector('#grid-search-results', { timeout: 5000 });

        const xpathSelector = '//*[@id="grid-search-results"]//ul//article//div//a';
        const cardsEl = await page.waitForSelector(`::-p-xpath(${xpathSelector})`, { timeout: 10000 });

        const data = await page.evaluate(() => {
            const selector = '//*[@id="grid-search-results"]//ul//article//div//a';
            const targetEl = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            const hrefList = [];
            for (let i = 0; i < targetEl.snapshotLength; i++) {
                // @ts-ignore
                const href = targetEl.snapshotItem(i).getAttribute('href');
                if (href) {
                    hrefList.push(href);
                }
            }

            return hrefList;
        });

        const uniqueSet = new Set(data);
        const uniqueArray = Array.from(uniqueSet).slice(0, 5);
        // console.log(data)

        let pages = [];
        const json = {
            listings: [],
        };
        const { results, errors } = await PromisePool.withConcurrency(2).for(uniqueArray).process(async (listing, index, pool) => {
            pages[index] = await browser.newPage();
            await pages[index].goto(listing);

            // price
            const priceSelector = 'span[data-testid="price"]';
            await pages[index].waitForSelector(priceSelector, { timeout: 10000 });
            const pagesElementHandle = await pages[index].$(priceSelector);
            let content = await pages[index].evaluate(element => element.textContent, pagesElementHandle);
            console.log(content);

            json.listings.push({ url: listing, price: content });

            await pages[index].close();
            return json;
            // price
            // address
            // beds
            // baths
            // sqft
        });

        res.json(json);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        await browser.close();
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});