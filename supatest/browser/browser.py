from browser_use.browser.browser import Browser, BrowserConfig, BrowserContextConfig
from browser_use.browser.views import BrowserStateSummary

from supatest.browser.context import SupatestBrowserSession


class SupatestBrowser(Browser):
    """Extended version of Browser that uses SupatestBrowserSession"""

    async def new_context(
        self,
        **context_kwargs,
    ) -> SupatestBrowserSession:
        """Override new_context to return SupatestBrowserSession instead of BrowserContext"""
        merged_config = {**self.config.browser_context_config.model_dump(), **context_kwargs}
        
        return SupatestBrowserSession(config=BrowserContextConfig(**merged_config), browser=self)

    async def create_context(
        self, 
        state: BrowserStateSummary | None = None, 
        config: BrowserConfig | None = None,
    ) -> SupatestBrowserSession:
        """Override create_context to return SupatestBrowserSession instead of BrowserContext"""
        return SupatestBrowserSession(self, config, state) 