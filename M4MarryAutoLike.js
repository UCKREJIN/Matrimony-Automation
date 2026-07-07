const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

// ─────────────────────────────────────────────
// 🔧 UTILITY FUNCTIONS
// ─────────────────────────────────────────────

// Returns a random delay in milliseconds between min and max
function randomDelay(min = 3000, max = 7000) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Short human-like pause (e.g. between clicks)
function shortDelay(min = 800, max = 2000) {
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

// Simulate human-like mouse wiggle
async function humanMouseWiggle(page) {
    const x = Math.floor(Math.random() * 800) + 100;
    const y = Math.floor(Math.random() * 500) + 100;
    await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 5) + 3 });
    await page.waitForTimeout(shortDelay(200, 600));
}

// ─────────────────────────────────────────────
// 🔐 CONFIGURATION
// ─────────────────────────────────────────────

// Daily like limit
const DAILY_LIKE_LIMIT = 200;

// Read credentials from environment variables (for CI) with fallback for local dev
const LOGIN_USERNAME = '77355370';
const LOGIN_PASSWORD = 'mymatrimony';
const COUNTRY_CODE = '974'; // Qatar

// Detect CI environment
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

// ─────────────────────────────────────────────
// 🚀 MAIN SCRIPT
// ─────────────────────────────────────────────

(async () => {
    let totalLiked = 0;
    let totalProfilesProcessed = 0;
    let totalPagesProcessed = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let totalAlreadyLiked = 0;
    let totalProfilesFound = 0;

    const browser = await chromium.launch({
        headless: isCI, // headless in CI, headed locally
        slowMo: isCI ? 20 : 150, // #1: reduced from 80→20 in CI (saves ~3-5 min across all actions)
        args: isCI
            ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            : ['--start-maximized']
    });

    const context = await browser.newContext({
        viewport: isCI ? { width: 1920, height: 1080 } : null, // fixed viewport in CI, full window locally
    });
    const page = await context.newPage();

    try {
        // ─────────────────────────────────────────────
        // 1️⃣ LOGIN
        // ─────────────────────────────────────────────
        console.log('🌐 Navigating directly to M4Marry Login page...');
        await page.goto('https://www.m4marry.com/login', { waitUntil: 'load', timeout: 30000 }).catch(async (err) => {
            console.log(`⚠️ Direct login navigation failed (${err.message}). Trying main page...`);
            await page.goto('https://www.m4marry.com');
            await page.waitForTimeout(randomDelay(3000, 6000));
            console.log('🔑 Clicking Login button...');
            const loginLink = page.locator('a:has-text("Login")').first();
            await loginLink.waitFor({ timeout: 15000 });
            await loginLink.click();
        });

        await page.waitForTimeout(isCI ? shortDelay(500, 800) : shortDelay(2000, 4000)); // #2: faster post-login wait in CI
        console.log(`Current page URL: ${page.url()}`);

        // Try to handle cookie consent or popups if any
        try {
            const acceptCookies = page.locator('button:has-text("Accept"), button:has-text("OK"), button:has-text("Dismiss")').first();
            if (await acceptCookies.isVisible().catch(() => false)) {
                await acceptCookies.click();
                await page.waitForTimeout(shortDelay(500, 1000));
            }
        } catch (_) { }

        // Type username with flexible locators
        console.log('📧 Entering username...');
        const usernameInput = page.locator('input#username, input[name="username"], input[type="text"]').first();
        await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
        await usernameInput.click();
        await page.waitForTimeout(shortDelay(300, 700));
        await usernameInput.fill('');
        await usernameInput.type(LOGIN_USERNAME, { delay: 80 });
        // ⚠️  The country code <select> is HIDDEN until the username field is interacted with.
        // The page reveals it dynamically via JS after the username field receives input.
        // We must wait for it to appear AFTER typing — confirmed by debug screenshots.
        await page.waitForTimeout(shortDelay(1500, 2500));

        // Select country code (Qatar +974)
        // The <select id="countryCode" class="country-code isdCd"> is a native HTML select —
        // confirmed by debug DOM dump. It only becomes visible AFTER username is typed.
        // CI needs a longer timeout (15s) vs local (5s) due to slower Ubuntu network rendering.
        // Strategy 1: Native <select> element — this is what the site actually uses.
        // Confirmed selector: select#countryCode (class="country-code isdCd" name="countryCode")
        // Timeout raised to 15000ms for CI (GitHub Actions Ubuntu is slower than local Windows).
        try {
            const countrySelect = page.locator('select#countryCode, select.country-code, select[name="countryCode"]').first();
            await countrySelect.waitFor({ state: 'visible', timeout: 15000 });
            const selectCount = await countrySelect.count();
            if (selectCount > 0 && await countrySelect.isVisible()) {
                await countrySelect.selectOption(COUNTRY_CODE);
            }
            await page.waitForTimeout(shortDelay(800, 1500));
            console.log(`✅ Country code set to +${COUNTRY_CODE}`);
        } catch (e) {
            console.log('⚠️  Country code selector not visible/found, proceeding...');
        }

        // Type password — M4Marry uses a secure-password-field web component
        console.log('🔒 Entering password...');
        const securePasswordField = page.locator('secure-password-field#password');
        const secureFieldCount = await securePasswordField.count();

        if (secureFieldCount > 0) {
            // Try to find the actual input inside the shadow DOM or the component itself
            const passwordInput = page.locator('secure-password-field#password');
            await passwordInput.waitFor({ timeout: 10000 });
            await passwordInput.click();
            await page.waitForTimeout(shortDelay(300, 700));
            // Type into the focused element
            await page.keyboard.type(LOGIN_PASSWORD, { delay: 80 });
        } else {
            // Fallback: try regular password input
            const passwordInput = page.locator('input[name="password"], input#enc-password');
            await passwordInput.first().click();
            await page.waitForTimeout(shortDelay(300, 700));
            await passwordInput.first().type(LOGIN_PASSWORD, { delay: 80 });
        }
        await page.waitForTimeout(shortDelay(1000, 2000));

        // Submit login
        // The submit button is a <button type="submit"> with text "LOGIN" — NOT input#loginSubmit.
        // Confirmed by debug screenshot debug_04_before_submit.png.
        console.log('🚪 Submitting login...');
        const submitBtn = page.locator('button[type="submit"], input#loginSubmit, button:has-text("LOGIN"), button:has-text("Login")').first();
        await submitBtn.waitFor({ state: 'visible', timeout: 10000 });
        await submitBtn.click();

        // Wait for redirect to mysite.m4marry.com — confirmed post-login URL from debug run.
        // The site redirects to https://mysite.m4marry.com/loginAuth on success.
        console.log('⏳ Waiting for post-login redirect to mysite.m4marry.com...');
        try {
            await page.waitForURL(/mysite\.m4marry\.com/, { timeout: 30000 });
            console.log(`✅ Login successful — redirected to: ${page.url()}`);
        } catch (e) {
            const currentUrl = page.url();
            if (currentUrl.includes('m4marry.com') && !currentUrl.includes('/login')) {
                console.log(`✅ Login appears successful — current URL: ${currentUrl}`);
            } else {
                console.log(`⚠️  Post-login URL unexpected: ${currentUrl}`);
                if (isCI) {
                    await page.screenshot({ path: 'login-failed-debug.png', fullPage: true });
                    console.log('📸 Saved login-failed-debug.png for inspection.');
                }
            }
        }
        await page.waitForTimeout(shortDelay(2000, 3000));

        // Human browsing on the dashboard (skip in CI — headless can't be observed)
        if (!isCI) { // #3: skip dashboard human simulation in CI
            await randomScroll(page);
            await page.waitForTimeout(randomDelay(2000, 4000));
            await humanMouseWiggle(page);
        }

        // ─────────────────────────────────────────────
        // 2️⃣ NAVIGATE TO SAVED SEARCH
        // ─────────────────────────────────────────────
        console.log('🔍 Navigating to saved search: AllMinCriteria...');

        // Navigate directly to the saved search URL
        // await page.goto('https://mysite.m4marry.com/search?searchId=192228&searchType=saved');
        // await page.waitForTimeout(randomDelay(5000, 8000)); // wait for search results to load
        await page.goto('https://mysite.m4marry.com/search?searchId=192228&searchType=saved', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        }).catch(async (err) => {
            console.log(`⚠️ Search page load timeout: ${err.message}`);
        });

        await page.waitForTimeout(isCI ? randomDelay(2000, 3500) : randomDelay(5000, 8000)); // #4: faster search page wait in CI

        // wait for actual profile list instead of full page load
        await page.locator('h2.profile-count').waitFor({
            state: 'visible',
            timeout: 30000
        });

        console.log('✅ Saved search results loaded.');
        
        await randomScroll(page);
        await page.waitForTimeout(randomDelay(2000, 4000));
        await humanMouseWiggle(page);

        // Enable "Don't Show Already Contacted" before reading counts
        try {
            const alreadyContactedCheckbox = page.locator('#alreadyContacted');

            if (await alreadyContactedCheckbox.isVisible()) {
                const isChecked = await alreadyContactedCheckbox.isChecked();

                if (!isChecked) {
                    console.log('☑️ Enabling "Already Contacted" filter...');
                    await alreadyContactedCheckbox.check();

                    // wait for results reload
                    await page.waitForTimeout(isCI ? randomDelay(1500, 2500) : randomDelay(4000, 7000)); // #5: faster filter reload wait in CI

                    // refresh profile list after reload
                    const profileCards = page.locator(
                        'h2.profile-count ~ div.col-xs-4.col-sm-4.col-md-3.col-lg-3.profiles'
                    );

                    await profileCards.first().waitFor({ state: 'visible', timeout: 15000 });

                    console.log('✅ Already Contacted filter applied. Profiles reloaded.');
                } else {
                    console.log('✅ Already Contacted filter already enabled.');
                }
            }
        } catch (filterErr) {
            console.log(`⚠️ Could not enable Already Contacted filter: ${filterErr.message}`);
        }

        // ─────────────────────────────────────────────
        // 3️⃣ READ & LOG TOTAL PROFILES FOUND
        // ─────────────────────────────────────────────
        try {
            const profileCountEl = page.locator('h2.profile-count');
            await profileCountEl.waitFor({ timeout: 15000 });
            const profileCountText = await profileCountEl.innerText();
            // Extract the number from text like "11254 Profile(s) found"
            const match = profileCountText.match(/(\d[\d,]*)\s*Profile/i);
            if (match) {
                totalProfilesFound = parseInt(match[1].replace(/,/g, ''), 10);
            }
            console.log(`\n${'═'.repeat(60)}`);
            console.log(`📊 BEFORE START: ${profileCountText.trim()}`);
            console.log(`📊 Total Profile(s) found: ${totalProfilesFound}`);
            console.log(`${'═'.repeat(60)}\n`);
        } catch (e) {
            console.log('⚠️  Could not read total profile count.');
        }

        // ─────────────────────────────────────────────
        // 4️⃣ PAGE LOOP — iterate through pages
        // ─────────────────────────────────────────────
        let hasNextPage = true;

        while (hasNextPage) {
            totalPagesProcessed++;
            console.log(`\n${'═'.repeat(60)}`);
            console.log(`📄 PAGE ${totalPagesProcessed}`);
            console.log(`${'═'.repeat(60)}`);

            await randomScroll(page);
            await page.waitForTimeout(shortDelay(1000, 2000));

            // Find profiles only from "Profile(s) found" section (exclude Top Listed Profiles)
            const profileSection = page
                .locator('h2.profile-count')
                .locator('xpath=..')
                .locator('xpath=following-sibling::*')
                .first();

            const profileCards = page.locator(
                'h2.profile-count ~ div.col-xs-4.col-sm-4.col-md-3.col-lg-3.profiles'
            );

            await page.waitForTimeout(shortDelay(1000, 2000));

            const profileCount = await profileCards.count();
            console.log(`📊 Found ${profileCount} profiles on this page.`);

            if (profileCount === 0) {
                console.log('⚠️  No profiles found on this page. Moving on...');
            }

            for (let i = 0; i < profileCount; i++) {
                // Stop if we've hit the daily limit
                if (totalLiked >= DAILY_LIKE_LIMIT) {
                    console.log(`\n🛑 Daily like limit of ${DAILY_LIKE_LIMIT} reached. Stopping script.`);
                    hasNextPage = false;
                    break;
                }

                totalProfilesProcessed++;
                console.log(`\n--- Profile ${i + 1} of ${profileCount} | Page ${totalPagesProcessed} | Liked: ${totalLiked}/${DAILY_LIKE_LIMIT} ---`);

                try {
                    // Re-query to avoid stale handles
                    const currentProfile = profileCards.nth(i)//page.locator('div.profiles, div[class*="profiles"]').nth(i);

                    // Scroll profile card into view
                    try {
                        await currentProfile.scrollIntoViewIfNeeded();
                        await page.waitForTimeout(shortDelay(500, 1000));
                    } catch (scrollErr) {
                        console.log(`⚠️  Could not scroll to profile ${i + 1}, skipping...`);
                        totalSkipped++;
                        continue;
                    }

                    // Read profile name and ID for logging
                    let profileName = 'Unknown';
                    let profileId = 'N/A';
                    try {
                        const nameEl = currentProfile.locator('span.list-profile-name').first();
                        if (await nameEl.count() > 0) {
                            profileName = (await nameEl.innerText()).trim();
                        }
                        const idEl = currentProfile.locator('span.prof-ID-no').first();
                        if (await idEl.count() > 0) {
                            profileId = (await idEl.innerText()).trim();
                        }
                    } catch (_) { /* best effort */ }
                    console.log(`   👤 Profile: ${profileName} (ID: ${profileId})`);

                    // Human pause — looking at the profile card (reduced in CI)
                    await page.waitForTimeout(isCI ? shortDelay(300, 600) : shortDelay(1500, 3000)); // #6: reduce per-profile "looking" pause in CI

                    // ─── OPEN PROFILE IN NEW TAB ───
                    const profileLink = currentProfile.locator('a.profile-link, a[href*="/profile/"]').first();
                    const linkCount = await profileLink.count();

                    if (linkCount === 0) {
                        console.log(`⏭️  No profile link found on profile ${i + 1}. Skipping...`);
                        totalSkipped++;
                        continue;
                    }

                    console.log(`🔗 Opening profile ${i + 1} (${profileName}) in new tab...`);
                    await page.waitForTimeout(shortDelay(500, 1000));

                    // Try to get href and navigate directly, with fallback to click
                    let newPage = null;
                    try {
                        const href = await profileLink.getAttribute('href');
                        if (href && !href.startsWith('javascript:')) {
                            const fullUrl = href.startsWith('http') ? href : new URL(href, page.url()).href;
                            console.log(`🧭 Navigating directly to: ${fullUrl}`);
                            newPage = await page.context().newPage();
                            await newPage.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        } else {
                            console.log(`🖱️  No valid href found, clicking link instead...`);
                            const [tab] = await Promise.all([
                                page.context().waitForEvent('page', { timeout: 25000 }),
                                profileLink.click()
                            ]);
                            newPage = tab;
                        }

                        // Wait for new tab to load
                        try {
                            await newPage.waitForLoadState('domcontentloaded', { timeout: 20000 });
                        } catch (e) {
                            console.log(`⚠️  Page load timed out for profile ${i + 1}, continuing anyway...`);
                        }
                        await newPage.waitForTimeout(isCI ? randomDelay(500, 1000) : randomDelay(1500, 3000)); // #7: reduce profile page load wait in CI

                        // Human scrolling in the profile page (skip in CI — headless can't be observed)
                        if (!isCI) { // #9: skip profile page scroll in CI
                            await randomScroll(newPage);
                            await newPage.waitForTimeout(shortDelay(1000, 2000));
                        }

                        // ─── SEND INTEREST ───
                        const sendInterestBtn = newPage.locator('a.btn-send-interest').first();
                        const hasSendInterest = await sendInterestBtn.count() > 0;

                        if (!hasSendInterest) {
                            console.log(`⏭️ "Send Interest" button not found on details page. Already sent or unavailable.`);
                            totalAlreadyLiked++;
                            continue;
                        }

                        // wait until first button is visible
                        await sendInterestBtn.waitFor({
                            state: 'visible',
                            timeout: 10000
                        });

                        console.log(`📤 Clicking main page "Send Interest" button...`);
                        await sendInterestBtn.evaluate((el) => el.click());
                        await newPage.waitForTimeout(isCI ? 500 : 2000); // #8: reduce Send Interest click wait in CI

                        console.log(`⏳ Waiting for Express Interest iframe popup...`);
                        const iframe = newPage.frameLocator('iframe.cboxIframe');
                        const popupSendInterestBtn = iframe.locator('#interestYes');

                        try {
                            await popupSendInterestBtn.waitFor({
                                state: 'visible',
                                timeout: 15000
                            });
                            console.log(`✅ Popup "Send Interest" button found inside iframe. Clicking it...`);
                            await popupSendInterestBtn.click();
                            console.log(`✅ Express Interest sent confirmation received.`);
                            totalLiked++;
                            console.log(`✅ Interest sent successfully to ${profileName} (ID: ${profileId})`);
                            console.log(`📊 Total liked/interested: ${totalLiked}/${DAILY_LIKE_LIMIT}`);
                        } catch (err) {
                            // Check if confirmation message already appeared or it is already interest expressed
                            const confirmationText = iframe.locator('.modal-data.sm-modal .text-gray, div.modal-data .text-gray');
                            if (await confirmationText.first().isVisible().catch(() => false)) {
                                console.log(`✅ Already expressed interest.`);
                                totalAlreadyLiked++;
                            } else {
                                console.log(`⚠️ Could not click Send Interest inside popup/iframe: ${err.message}`);
                                totalAlreadyLiked++;
                            }
                        }
                    } finally {
                        if (newPage) {
                            await newPage.close().catch(() => {});
                        }
                    }
                    console.log(`   🔙 Returned to search results.`);

                } catch (profileErr) {
                    totalFailed++;
                    console.log(`❌ Profile ${i + 1} on page ${totalPagesProcessed} — send interest failed: ${profileErr.message}`);
                    console.log(`   Continuing to next profile...`);
                }

                // Random pause between profiles — mimics human browsing rhythm (reduced in CI)
                await page.waitForTimeout(isCI ? randomDelay(1000, 2000) : randomDelay(3000, 7000)); // #10: BIGGEST WIN — saves ~10-12 min for 200 profiles
            }

            if (!hasNextPage) break;

            // ─────────────────────────────────────────────
            // 5️⃣ NAVIGATE TO NEXT PAGE
            // ─────────────────────────────────────────────
            console.log(`\n📖 Checking for next page...`);

            // M4Marry uses a pagination with a "next" arrow image link
            const nextPageLink = page.locator('ul.pagination li.enable a.postPage').last();
            const nextPageCount = await nextPageLink.count();

            if (nextPageCount === 0) {
                console.log('🏁 Reached the last page — no more pages to process.');
                hasNextPage = false;
                break;
            }

            console.log('➡️  Navigating to next page...');
            if (!isCI) { // skip human simulation on pagination in CI
                await randomScroll(page);
                await page.waitForTimeout(randomDelay(2000, 4000));
                await humanMouseWiggle(page);
            }
            await nextPageLink.click();
            await page.waitForTimeout(isCI ? randomDelay(1500, 3000) : randomDelay(4000, 8000)); // #11: reduce between-page delay in CI
            console.log('✅ Next page loaded.');

            // Scroll to top of new page
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(shortDelay(1000, 2000));
            await randomScroll(page);
        }

    } catch (fatalErr) {
        console.error(`\n💥 FATAL ERROR: ${fatalErr.message}`);
        console.error(fatalErr.stack);
    } finally {
        // ─────────────────────────────────────────────
        // 6️⃣ FINAL SUMMARY
        // ─────────────────────────────────────────────
        const remainingProfiles = totalProfilesFound > 0
            ? totalProfilesFound - totalLiked
            : 'N/A';

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🎉 SCRIPT COMPLETE — FINAL SUMMARY`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`📊 Total Profile(s) found:   ${totalProfilesFound}`);
        console.log(`📄 Pages processed:          ${totalPagesProcessed}`);
        console.log(`👤 Profiles processed:       ${totalProfilesProcessed}`);
        console.log(`✅ Profiles liked:           ${totalLiked}`);
        console.log(`💖 Already liked/favourited: ${totalAlreadyLiked}`);
        console.log(`⏭️  Skipped:                  ${totalSkipped}`);
        console.log(`❌ Failed:                   ${totalFailed}`);
        console.log(`📋 Remaining profiles:       ${remainingProfiles}`);
        console.log(`${'═'.repeat(60)}\n`);

        if (!isCI) await page.waitForTimeout(randomDelay(2000, 4000)); // #12: skip exit wait in CI
        await browser.close();
        console.log('🔒 Browser closed.');
    }
})();