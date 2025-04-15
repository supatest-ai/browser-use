import logging
from typing import Optional

from browser_use.browser.browser import Browser
from browser_use.browser.context import BrowserContext
from browser_use.browser.context import BrowserContextConfig, BrowserContextState, BrowserSession

logger = logging.getLogger(__name__)


class SupatestBrowserContext(BrowserContext):
    """Extended version of BrowserContext that uses SupatestDOMElementNode"""

    def __init__(
        self,
        browser: 'Browser',
        config: BrowserContextConfig = BrowserContextConfig(),
        state: Optional[BrowserContextState] = None,
        active_page_id: Optional[str] = None
    ):
        super().__init__(browser, config, state)
        self.active_page_id = active_page_id

    async def _initialize_session(self):
        """Initialize the browser session with Supatest extensions"""
        logger.debug('Initializing browser context')

        playwright_browser = await self.browser.get_playwright_browser()
        context = await self._create_context(playwright_browser)
        self._page_event_handler = None

        # Get or create a page to use
        pages = context.pages
        logger.info(f'active_page_id received: {self.active_page_id}')
        logger.info(f'available pages: {pages}')
        
        # making the tabId 0 as default 
        tabId = 0
        page_info = {}
        if self.browser.config.cdp_url:
            cdp_session = await pages[0].context.new_cdp_session(pages[0])
            result = await cdp_session.send('Target.getTargets')
            await cdp_session.detach()
            targets = result.get('targetInfos', [])

            # If active_page_id is provided, only process that specific page
            if self.active_page_id is not None:
                for target in targets:
                    if target['targetId'] == self.active_page_id:
                        for page_id, page in enumerate(pages):
                            if page.url == target['url']:
                                try:
                                    title = await page.title()
                                    active_page_details = {
                                        "Page ID": page_id,
                                        "Target ID": target["targetId"],
                                        "URL": page.url,
                                        "Title": title
                                    }
                                    print(f'Active Page Details: {active_page_details}')
                                    tabId = page_id
                                except Exception as e:
                                    print(f'Error retrieving active page info: {e}')
                                break
                        break

        self.session = BrowserSession(
            context=context,
            cached_state=None,
        )

        active_page = None
        if self.browser.config.cdp_url:
            # If we have a saved target ID, try to find and activate it
            if self.state.target_id:
                targets = await self._get_cdp_targets()
                for target in targets:
                    if target['targetId'] == self.state.target_id:
                        # Find matching page by URL
                        for page in pages:
                            if page.url == target['url']:
                                active_page = page
                                break
                        break


        if not active_page:
            if pages:
                active_page = pages[tabId]
                logger.debug('Using existing page')
            else:
                active_page = await context.new_page()
                logger.debug('Created new page')

            # Get target ID for the active page
            if self.browser.config.cdp_url:
                targets = await self._get_cdp_targets()
                for target in targets:
                    if target['url'] == active_page.url:
                        self.state.target_id = target['targetId']
                        break

        # Bring page to front
        await active_page.bring_to_front()
        await active_page.wait_for_load_state('load')

        return self.session

