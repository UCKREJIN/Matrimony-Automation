const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

// Detect CI environment
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// Returns a random delay in milliseconds between min and max
function randomDelay(min = 3000, max = 7000) {
    if (isCI) {
        return Math.floor((Math.random() * (max - min + 1) + min) * 0.1);
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Short human-like pause (e.g. between clicks)
function shortDelay(min = 800, max = 2000) {
    if (isCI) {
        return Math.floor((Math.random() * (max - min + 1) + min) * 0.1);
    }
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Simulate a small random scroll — looks human
async function randomScroll(page) {
    const scrollAmount = Math.floor(Math.random() * 400) + 100; // 100–500px
    await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount);
    await page.waitForTimeout(shortDelay(500, 1200));
    await page.evaluate((amount) => window.scrollBy(0, -amount / 2), scrollAmount); // scroll back a bit
    await page.waitForTimeout(shortDelay(300, 800));
}

// Daily like/message limit
const DAILY_LIKE_LIMIT = 40;

// Read credentials from environment variables (for CI) with fallback for local dev
const LOGIN_EMAIL = process.env.LOGIN_EMAIL || 'rojanmathew333@gmail.com';
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || 'chavara123@';

(async () => {
    const browser = await chromium.launch({
        headless: isCI, // headless in CI, headed locally
        slowMo: isCI ? 80 : 150,
        args: isCI
            ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            : ['--start-maximized']
    });

    const context = await browser.newContext({
        viewport: isCI ? { width: 1920, height: 1080 } : null, // fixed viewport in CI, full window locally
    });
    const page = await context.newPage();

    // 1️⃣ LOGIN
    console.log('Navigating to site...');
    await page.goto('https://www.chavaramatrimony.com');
    await page.waitForTimeout(randomDelay(3000, 6000)); // wait like a human reading the page

    console.log('Clicking Login button...');
    await page.click('a[href="/login"]');
    await page.waitForTimeout(shortDelay(2000, 4000));

    console.log('Clicking "TRY ANOTHER WAY"...');
    // Looking for the button that has "TRY ANOTHER WAY" text
    await page.locator('button', { hasText: 'TRY ANOTHER WAY' }).click();
    await page.waitForTimeout(shortDelay(1000, 2000));

    console.log('Selecting "Login with Password"...');
    // Looking for the button that contains "Login with Password" inside it
    await page.locator('button', { hasText: 'Login with Password' }).click();
    await page.waitForTimeout(shortDelay(1000, 2000));

    // Type credentials slowly like a human
    console.log('Entering credentials...');
    const emailInput = page.locator('input[name="userId"]');
    await emailInput.waitFor({ timeout: 10000 });
    await emailInput.click();
    await page.waitForTimeout(shortDelay(300, 700));
    await page.type('input[name="userId"]', LOGIN_EMAIL, { delay: 80 });
    await page.waitForTimeout(shortDelay(800, 1500));

    await page.click('input[name="password"]');
    await page.waitForTimeout(shortDelay(300, 700));
    await page.type('input[name="password"]', LOGIN_PASSWORD, { delay: 80 });
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

    console.log('Opening saved search: Allother...');
    await page.locator('div:has(p:text("Allother"))').locator('button:has-text("View")').first().click();
    await page.waitForTimeout(randomDelay(3000, 6000)); // let results load fully

    // Bump pagination to 100 per page
    console.log('Changing pagination to 100...');
    await page.getByRole('button', { name: '20', exact: true }).first().click();
    await page.waitForTimeout(shortDelay(800, 1500));
    await page.locator('button[role="menuitem"]:has-text("100")').click();
    await page.waitForTimeout(randomDelay(3000, 5000)); // wait for 100 profiles to render

    // 2️⃣ PROFILE LOOP — like up to DAILY_LIKE_LIMIT profiles
    let totalLiked = 0;

    await page.waitForSelector('div.relative.rounded-lg.border.bg-white');

    const profiles = await page.locator('div.relative.rounded-lg.border.bg-white').all();
    console.log(`\nFound ${profiles.length} profiles on this page`);

    for (let i = 0; i < profiles.length; i++) {
        // Stop if we've hit the daily limit
        if (totalLiked >= DAILY_LIKE_LIMIT) {
            console.log(`\n🛑 Daily like limit of ${DAILY_LIKE_LIMIT} reached. Stopping script.`);
            break;
        }

        console.log(`\n--- Profile ${i + 1} of ${profiles.length} (Liked so far: ${totalLiked}/${DAILY_LIKE_LIMIT}) ---`);

        // Re-query to avoid stale handles
        const currentProfiles = await page.locator('div.relative.rounded-lg.border.bg-white').all();
        const profile = currentProfiles[i];

        if (!profile) {
            console.log(`Profile ${i + 1} not found in DOM, skipping...`);
            continue;
        }

        // Scroll the profile card into view
        try {
            await profile.scrollIntoViewIfNeeded();
            await page.waitForTimeout(shortDelay(500, 1000));
        } catch (e) {
            console.log(`Could not scroll to profile ${i + 1}, skipping...`);
            continue;
        }

        // 3️⃣ CLICK THE "SEND MESSAGE" (LIKE) BUTTON on the profile card
        try {
            // Human pause before clicking
            await page.waitForTimeout(shortDelay(1500, 3000));

            const likeButton = profile.locator('button[aria-label="Send message"]');
            const likeButtonCount = await likeButton.count();

            if (likeButtonCount === 0) {
                console.log(`⏭️  No "Send message" button found on profile ${i + 1} — already liked or unavailable. Skipping...`);
                continue;
            }

            console.log(`💌 Clicking "Send message" button on profile ${i + 1}...`);
            await likeButton.first().click();
            await page.waitForTimeout(shortDelay(1500, 3000)); // wait for popup to appear

            // 4️⃣ CHECK IF DAILY LIMIT EXHAUSTED POPUP APPEARED
            const limitPopup = page.locator('div.text-base:has-text("You have reached the maximum number of messages allowed for today")');
            const radioButton = page.locator('input[type="radio"][name="messageCode"][value="20"]');

            // Race: check which popup appeared
            const limitVisible = await limitPopup.isVisible().catch(() => false);

            if (limitVisible) {
                console.log(`\n🛑 Daily message limit exhausted! The site says no more messages until tomorrow.`);
                // Click the Ok button to dismiss
                const okButton = page.locator('button[type="submit"].btn-primary:has-text("Ok")');
                try {
                    await okButton.waitFor({ timeout: 5000 });
                    await page.waitForTimeout(shortDelay(500, 1000));
                    await okButton.click();
                    console.log(`Clicked Ok to dismiss the popup.`);
                } catch (e) {
                    console.log(`Could not click Ok button: ${e.message}`);
                }
                break; // exit the for loop
            }

            // 5️⃣ SELECT THE 2ND RADIO BUTTON (value="20") IN THE POPUP
            await radioButton.waitFor({ timeout: 8000 });
            await page.waitForTimeout(shortDelay(500, 1000)); // human pause before selecting
            await radioButton.click();
            console.log(`📝 Selected message option (value="20")`);
            await page.waitForTimeout(shortDelay(800, 1500));

            // 6️⃣ CLICK THE SEND BUTTON in the popup
            const sendButton = page.locator('button[type="submit"].btn-primary:has-text("Send")');
            await sendButton.waitFor({ timeout: 5000 });
            await page.waitForTimeout(shortDelay(500, 1000)); // human pause before sending
            await sendButton.click();
            console.log(`✅ Message sent for profile ${i + 1}`);
            await page.waitForTimeout(randomDelay(2000, 4000)); // wait for confirmation/popup to close

            totalLiked++;
            console.log(`📊 Total liked: ${totalLiked}/${DAILY_LIKE_LIMIT}`);

        } catch (e) {
            console.log(`❌ Profile ${i + 1} - Like action failed: ${e.message}`);
        }

        // Random pause between profiles — mimics human browsing rhythm
        await page.waitForTimeout(randomDelay(3000, 7000));
    }

    console.log(`\n🎉 Done! Total profiles liked: ${totalLiked}`);
    await page.waitForTimeout(randomDelay(2000, 4000));
    await browser.close();
})();