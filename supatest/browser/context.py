import logging
from typing import Optional
from importlib import resources

from browser_use.browser import BrowserSession, BrowserProfile

logger = logging.getLogger(__name__)


class SupatestBrowserSession(BrowserSession):
    """Extended version of BrowserSession that uses Supatest extensions"""

    def __init__(
        self,
        browser_profile: BrowserProfile | None = None,
        active_page_id: str | None = None,
        **kwargs
    ):
        # Use the provided browser_profile or create a default one
        if browser_profile is None:
            browser_profile = BrowserProfile()
        
        super().__init__(browser_profile=browser_profile, **kwargs)
        self.active_page_id = active_page_id
        self.locator_js_code = resources.files('supatest.agent').joinpath('locator.js').read_text()

    async def start(self):
        """Start the browser session with Supatest extensions"""
        # Call the parent start method first
        result = await super().start()
        
        # Inject our custom JavaScript into all existing pages
        if self.browser_context and self.browser_context.pages:
            for page in self.browser_context.pages:
                try:
                    await page.evaluate(self.locator_js_code)
                except Exception as e:
                    logger.debug(f"Failed to inject locator JS into page {page.url}: {e}")
        
        # Handle active page ID if provided
        if self.active_page_id and self.browser_context:
            await self._handle_active_page_selection()
        
        return result

    async def _handle_active_page_selection(self):
        """Handle active page selection based on active_page_id"""
        if not self.active_page_id or not self.browser_context:
            return
        
        logger.info(f'active_page_id received: {self.active_page_id}')
        pages = self.browser_context.pages
        logger.info(f'available pages: {len(pages)}')
        
        # Default to first page
        target_page_index = 0
        
        # If we have CDP access, try to match the active page ID
        if self.cdp_url and pages:
            try:
                cdp_session = await pages[0].context.new_cdp_session(pages[0])
                result = await cdp_session.send('Target.getTargets')
                await cdp_session.detach()
                targets = result.get('targetInfos', [])

                # Find the target matching our active_page_id
                for target in targets:
                    if target['targetId'] == self.active_page_id:
                        # Find the corresponding page
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
                                    logger.info(f'Active Page Details: {active_page_details}')
                                    target_page_index = page_id
                                    break
                                except Exception as e:
                                    logger.debug(f'Error retrieving active page info: {e}')
                                break
                        break
            except Exception as e:
                logger.debug(f"Failed to get CDP targets: {e}")
        
        # Set the agent current page to the target page
        if 0 <= target_page_index < len(pages):
            self.agent_current_page = pages[target_page_index]
            try:
                await self.agent_current_page.bring_to_front()
                await self.agent_current_page.wait_for_load_state('load')
            except Exception as e:
                logger.debug(f"Failed to bring page to front: {e}")

    async def create_new_tab(self, url: str | None = None) -> 'Page':
        """Override to inject locator JS into new tabs"""
        page = await super().create_new_tab(url)
        
        # Inject our custom JavaScript
        try:
            await page.evaluate(self.locator_js_code)
        except Exception as e:
            logger.debug(f"Failed to inject locator JS into new tab: {e}")
        
        return page


# Backward compatibility alias
SupatestBrowserContext = SupatestBrowserSession

