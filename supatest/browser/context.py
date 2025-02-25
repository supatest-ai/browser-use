import logging
from typing import Optional, cast

from browser_use.browser.browser import Browser
from browser_use.browser.context import BrowserContext as BaseBrowserContext
from browser_use.browser.context import BrowserContextConfig, BrowserContextState
from browser_use.browser.views import BrowserState
from supatest.dom.service import SupatestDomService
from supatest.dom.views import SupatestDOMElementNode

from supatest.browser.views import SupatestBrowserState

logger = logging.getLogger(__name__)


class SupatestBrowserContext(BaseBrowserContext):
    """Extended version of BrowserContext that uses SupatestDOMElementNode"""

    def __init__(
        self,
        browser: 'Browser',
        config: BrowserContextConfig = BrowserContextConfig(),
        state: Optional[BrowserContextState] = None,
    ):
        super().__init__(browser, config, state)

    async def _update_state(self, focus_element: int = -1) -> SupatestBrowserState:
        """Override _update_state to use SupatestDomService and return SupatestBrowserState"""
        logger.debug("[Supatest] Updating browser state")
        page = await self.get_current_page()

        # Create SupatestDomService instead of DomService
        dom_service = SupatestDomService(page)
        dom_state = await dom_service.get_clickable_elements(
            highlight_elements=self.config.highlight_elements,
            focus_element=focus_element,
            viewport_expansion=self.config.viewport_expansion,
        )

        scroll_x, scroll_y = await self.get_scroll_info(page)
        tabs = await self.get_tabs_info()

        state = SupatestBrowserState(
            element_tree=cast(SupatestDOMElementNode, dom_state.element_tree),
            selector_map=dom_state.selector_map,
            url=page.url,
            title=await page.title(),
            scroll_x=scroll_x,
            scroll_y=scroll_y,
            tabs=tabs,
        )
        logger.debug(f"[Supatest] State updated with {len(state.selector_map)} elements")
        for idx, element in state.selector_map.items():
            logger.debug(f"[Supatest] State element {idx}: {element}, supatest_locator_id: {element.supatest_locator_id}")
        return state

    async def get_dom_element_by_index(self, index: int) -> SupatestDOMElementNode:
        """Override to return SupatestDOMElementNode instead of DOMElementNode"""
        logger.debug(f"[Supatest] Getting element by index {index}")
        state = await self.get_state()
        if index not in state.selector_map:
            logger.error(f"[Supatest] No element found with index {index}")
            raise ValueError(f'No element found with index {index}')
        element = state.selector_map[index]
        if not isinstance(element, SupatestDOMElementNode):
            logger.error(f"[Supatest] Element at index {index} is not a SupatestDOMElementNode: {type(element)}")
            raise ValueError(f'Element at index {index} is not a SupatestDOMElementNode')
        logger.debug(f"[Supatest] Found element: {element}, supatest_locator_id: {element.supatest_locator_id}")
        return element

    async def get_state(self) -> SupatestBrowserState:
        """Override to return SupatestBrowserState instead of BrowserState"""
        if self.session and self.session.cached_state:
            return cast(SupatestBrowserState, self.session.cached_state)
        return await self._update_state() 