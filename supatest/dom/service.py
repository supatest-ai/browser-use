import gc
import json
import logging
from dataclasses import dataclass
from importlib import resources
from typing import TYPE_CHECKING, Optional, Tuple, Dict, cast

if TYPE_CHECKING:
    from playwright.async_api import Page

from browser_use.dom.service import DomService, ViewportInfo
from browser_use.dom.views import DOMBaseNode, DOMTextNode, CoordinateSet, DOMElementNode
from browser_use.utils import time_execution_async

from supatest.dom.views import SupatestDOMElementNode, SupatestDOMState

logger = logging.getLogger(__name__)


class SupatestDomService(DomService):
    def __init__(self, page: 'Page'):
        super().__init__(page)
        # Override the JS code to use our custom buildDomTree
        self.js_code = resources.read_text('supatest.dom', 'buildDomTree.js')

    @time_execution_async('--get_clickable_elements')
    async def get_clickable_elements(
        self,
        highlight_elements: bool = True,
        focus_element: int = -1,
        viewport_expansion: int = 0,
    ) -> SupatestDOMState:
        element_tree, selector_map = await self._build_dom_tree(highlight_elements, focus_element, viewport_expansion)
        # Cast the types to match SupatestDOMState requirements
        supatest_tree = cast(SupatestDOMElementNode, element_tree)
        supatest_map = cast(Dict[int, SupatestDOMElementNode], selector_map)
        return SupatestDOMState(element_tree=supatest_tree, selector_map=supatest_map)

    async def _build_dom_tree(
        self,
        highlight_elements: bool,
        focus_element: int,
        viewport_expansion: int,
    ) -> Tuple[SupatestDOMElementNode, Dict[int, SupatestDOMElementNode]]:
        # Override return type annotation to match our custom types
        result = await super()._build_dom_tree(highlight_elements, focus_element, viewport_expansion)
        return cast(Tuple[SupatestDOMElementNode, Dict[int, SupatestDOMElementNode]], result)

    def _parse_node(
        self,
        node_data: dict,
    ) -> Tuple[Optional[DOMBaseNode], list[int]]:
        if not node_data:
            return None, []

        # Process text nodes immediately
        if node_data.get('type') == 'TEXT_NODE':
            text_node = DOMTextNode(
                text=node_data['text'],
                is_visible=node_data['isVisible'],
                parent=None,
            )
            return text_node, []

        # Process coordinates if they exist
        viewport_coordinates = None
        page_coordinates = None
        viewport_info = None

        if 'viewport' in node_data:
            viewport_info = ViewportInfo(
                width=node_data['viewport']['width'],
                height=node_data['viewport']['height'],
            )

        # Create element node with supatest_locator_id
        element_node = SupatestDOMElementNode(
            tag_name=node_data['tagName'],
            xpath=node_data['xpath'],
            attributes=node_data.get('attributes', {}),
            children=[],
            is_visible=node_data.get('isVisible', False),
            is_interactive=node_data.get('isInteractive', False),
            is_top_element=node_data.get('isTopElement', False),
            highlight_index=node_data.get('highlightIndex'),
            shadow_root=node_data.get('shadowRoot', False),
            parent=None,
            viewport_coordinates=viewport_coordinates,
            page_coordinates=page_coordinates,
            viewport_info=viewport_info,
            supatest_locator_id=node_data.get('attributes', {}).get('supatest_locator_id')
        )

        children_ids = node_data.get('children', [])

        return element_node, children_ids 