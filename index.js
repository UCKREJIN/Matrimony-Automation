const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

// Returns a random delay in milliseconds between min and max
function randomDelay(min = 3000, max = 7000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Short human-like pause (e.g. between clicks)
function shortDelay(min = 800, max = 2000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Simulate a human slowly typing into a field
async function humanType(page, selector, text) {
    await page.click(selector);
    await page.waitForTimeout(shortDelay(300, 700));
    for (const char of text) {
        await page.type(selector, char, { delay: Math.floor(Math.random() * 120) + 60 }); // 60–180ms per key
    }
    await page.waitForTimeout(shortDelay(400, 900));
}

// Simulate a small random scroll — looks human
async function randomScroll(page) {
    const scrollAmount = Math.floor(Math.random() * 400) + 100; // 100–500px
    await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount);
    await page.waitForTimeout(shortDelay(500, 1200));
    await page.evaluate((amount) => window.scrollBy(0, -amount / 2), scrollAmount); // scroll back a bit
    await page.waitForTimeout(shortDelay(300, 800));
}

(async () => {
    const browser = await chromium.launch({
        headless: false,
        slowMo: 150, // subtle global slowdown on every Playwright action
        args: ['--start-maximized']
    });

    const context = await browser.newContext({
        viewport: null, // use full window size
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // 1️⃣ LOGIN
    console.log('Navigating to site...');
    await page.goto('https://www.chavaramatrimony.com');
    await page.waitForTimeout(randomDelay(3000, 6000)); // wait like a human reading the page

    console.log('Clicking Login button...');
    await page.click('a[href="/login"]');
    await page.waitForTimeout(shortDelay(1000, 2000));

    console.log('Clicking "TRY ANOTHER WAY"...');
    await page.locator('button', { hasText: 'TRY ANOTHER WAY' }).click();
    await page.waitForTimeout(shortDelay(1000, 2000));

    console.log('Selecting "Login with Password"...');
    await page.locator('button', { hasText: 'Login with Password' }).click();
    await page.waitForTimeout(shortDelay(1000, 2000));

    // Type credentials slowly like a human
    console.log('Entering credentials...');
    const emailInput = page.locator('input[name="userId"]');
    await emailInput.waitFor({ timeout: 10000 });
    await humanType(page, 'input[name="userId"]', 'rojanmathew333@gmail.com');
    await page.waitForTimeout(shortDelay(800, 1500));
    await humanType(page, 'input[name="password"]', 'chavara123@');
    await page.waitForTimeout(shortDelay(1000, 2000));

    console.log('Submitting login...');
    await page.click('button[type="submit"].btn-primary:has-text("Login")');
    await page.waitForTimeout(randomDelay(4000, 8000)); // wait for dashboard to fully load

    // Go to Saved Searches
    console.log('Opening Search menu...');
    await page.click('button:has-text("Search")');
    await page.waitForTimeout(shortDelay(1000, 2000));

    await page.click('li:has-text("Saved Search")');
    await page.waitForTimeout(randomDelay(2000, 4000));

    console.log('Opening saved search: All Other...');
    await page.locator('div:has(p:text("All Other"))').locator('button:has-text("View")').first().click();
    await page.waitForTimeout(randomDelay(3000, 6000)); // let results load fully

    // Bump pagination to 100 per page
    console.log('Changing pagination to 100...');
    await page.getByRole('button', { name: '20', exact: true }).first().click();
    await page.waitForTimeout(shortDelay(800, 1500));
    await page.locator('button[role="menuitem"]:has-text("100")').click();
    await page.waitForTimeout(randomDelay(3000, 5000)); // wait for 100 profiles to render

    // 2️⃣ PROFILE LOOP
    while (true) {
        await page.waitForSelector('div.relative.rounded-lg.border.bg-white');

        const profiles = await page.locator('div.relative.rounded-lg.border.bg-white').all();
        console.log(`\nFound ${profiles.length} profiles on this page`);

        for (let i = 0; i < profiles.length; i++) {
            console.log(`\n--- Profile ${i + 1} of ${profiles.length} ---`);

            // Re-query to avoid stale handles
            const currentProfiles = await page.locator('div.relative.rounded-lg.border.bg-white').all();
            const profile = currentProfiles[i];

            if (!profile) {
                console.log(`Profile ${i + 1} not found in DOM, skipping...`);
                continue;
            }

            // Human pause before clicking profile
            await page.waitForTimeout(shortDelay(1500, 3000));

            // Click profile — opens new tab
            const [newPage] = await Promise.all([
                page.context().waitForEvent('page'),
                profile.click()
            ]);

            // Wait for new tab to fully load
            try {
                await newPage.waitForLoadState('load', { timeout: 30000 });
            } catch (e) {
                console.log(`⚠️  Page load timed out for profile ${i + 1}, continuing anyway...`);
            }
            await newPage.waitForTimeout(randomDelay(3000, 6000)); // human reading time

            // Scroll down a bit, like a human skimming the profile
            await randomScroll(newPage);

            // 3️⃣ READ DENOMINATION
            // HTML: label div has text "Denomination", value is in a sibling div > div.text-black
            let denomination = '';
            try {
                const denominationLocator = newPage.locator(
                    'div:has(> div:text-is("Denomination")) div.text-black'
                ).first();

                await denominationLocator.waitFor({ timeout: 8000 });
                denomination = (await denominationLocator.innerText()).trim();
                console.log(`Denomination: "${denomination}"`);
            } catch (e) {
                console.log(`Denomination field not found — skipping profile.`);
            }

            // Split CSV denomination into individual entries
            const denominationArray = denomination
                .split(',')
                .map(d => d.trim())
                .filter(d => d.length > 0);

            console.log('Parsed denominations:', denominationArray);

            // 4️⃣ SHORTLIST if any entry matches "Any" or "Orthodox"
            const isMatch = denominationArray.some(d => d === 'Any' || d === 'Orthodox');

            if (isMatch) {
                console.log(`✅ Match found → shortlisting profile ${i + 1}...`);
                try {
                    // Pause before clicking shortlist — human hesitation
                    await newPage.waitForTimeout(shortDelay(1500, 3000));

                    await newPage.locator('button[aria-label="Shortlist"]').waitFor({ timeout: 7000 });
                    await newPage.locator('button[aria-label="Shortlist"]').click();
                    await newPage.waitForTimeout(shortDelay(1000, 2000));

                    // Type the comment slowly
                    await humanType(newPage, 'textarea[name="comment"]', 'Shortlisted for you by Rejin');
                    await newPage.waitForTimeout(shortDelay(1000, 2000));

                    await newPage.click('button:has-text("ADD")');
                    await newPage.waitForTimeout(randomDelay(3000, 5000)); // wait for confirmation
                    console.log(`✅ Profile ${i + 1} shortlisted successfully.`);
                } catch (e) {
                    console.log(`❌ Profile ${i + 1} - Shortlist action failed: ${e.message}`);
                }
            } else {
                console.log(`⏭️  Denomination does not match — skipping shortlist.`);
                // Human pause even when skipping, so the pattern isn't uniform
                await newPage.waitForTimeout(shortDelay(1000, 2500));
            }

            // Close tab and return to list
            await newPage.close();

            // Random pause between profiles — mimics human browsing rhythm
            await page.waitForTimeout(randomDelay(4000, 9000));
            await page.waitForSelector('div.relative.rounded-lg.border.bg-white');
        }

        // 5️⃣ NEXT PAGE
        const nextButton = page.locator('button[aria-label="next-page"]:not([disabled])');

        if (await nextButton.count() === 0) {
            console.log('\nNo more pages. All done!');
            break;
        }

        console.log('\nMoving to next page...');
        await page.waitForTimeout(randomDelay(3000, 6000)); // pause before paging
        await nextButton.click();
        await page.waitForSelector('div.relative.rounded-lg.border.bg-white');
        await page.waitForTimeout(randomDelay(2000, 4000)); // let new page settle
    }

    console.log('Done!');
    await page.waitForTimeout(randomDelay(2000, 4000));
    await browser.close();
})();