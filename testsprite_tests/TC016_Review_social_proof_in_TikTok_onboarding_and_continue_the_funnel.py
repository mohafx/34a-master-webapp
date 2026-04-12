import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> Navigate to http://localhost:3000
        await page.goto("http://localhost:3000")
        
        # -> Navigate to the TikTok onboarding route with '?testsprite=true' and wait for the page to load so the onboarding UI and interactive elements appear.
        await page.goto("http://localhost:3000/tiktok?testsprite=true")
        
        # -> Retry loading the page by clicking 'Seite neu laden' (index 182) and wait for the UI to render, so we can look for the social proof/testimonials step.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div[4]/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Click the 'Ich weiß mein Datum noch nicht' button to set the qualification answer, then wait for the UI to update so the flow can continue (observe if 'Weiter' becomes active or the next onboarding content appears).
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div[2]/div/div/div/div/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Click the 'Weiter' button (index 301) to advance to the social proof/testimonials step, then wait for the UI to render and verify testimonial content is displayed.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div[2]/div[2]/div/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Click the bottom CTA 'Jetzt loslegen' (index 301) to continue the onboarding and verify the flow advances to the next registration/onboarding step.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div[2]/div[2]/div/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Re-open the Prüfungsdatum editor/onboarding entry point by clicking the 'Prüfungsdatum bearbeiten' button so I can re-run the onboarding flow and look for the social proof/testimonials step.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div/div/div/div/div/div/header/div[2]/div/div/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Close the date modal and reopen the onboarding qualification flow so we can navigate to the social proof/testimonials screen and verify its content.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div/div/div/div/div/div[4]/div/div/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div/div/div/div/div/div[3]/div/div[2]/div/div/div/div/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # -> Accept cookie consent to remove overlay, then open the Lernplan/Prüfungsdatum flow (open modal) so we can re-run the onboarding and navigate to the social proof/testimonials screen.
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div[2]/div/div[3]/button[2]').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        frame = context.pages[-1]
        # Click element
        elem = frame.locator('xpath=/html/body/div/div/div/div/div/div/div/div[3]/div/div[2]/div/div/div/div/button').nth(0)
        await asyncio.sleep(3); await elem.click()
        
        # --> Assertions to verify final state
        frame = context.pages[-1]
        assert await frame.locator("xpath=//*[contains(., 'Das sagen unsere Nutzer')]").nth(0).is_visible(), "The onboarding should display social proof testimonials so users see credible feedback."
        assert await frame.locator("xpath=//*[contains(., 'Registrieren')]").nth(0).is_visible(), "The flow should advance to the registration step after continuing from social proof."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    