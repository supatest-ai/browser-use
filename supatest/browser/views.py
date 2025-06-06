from dataclasses import dataclass, field
from typing import Dict, Optional

from browser_use.browser.views import (
    BrowserStateSummary,
    TabInfo,
)
from browser_use.dom.views import DOMElementNode


@dataclass
class SupatestBrowserState(BrowserStateSummary):
    """Extended version of BrowserStateSummary that uses SupatestDOMElementNode"""
    url: str = ""
    title: str = ""
    scroll_x: int = 0
    scroll_y: int = 0
    element_tree: Optional[DOMElementNode] = None
    selector_map: Dict[int, DOMElementNode] = field(default_factory=dict)
    tabs: list[TabInfo] = field(default_factory=list)

    def __post_init__(self):
        self.selector_map = self.selector_map or {}
        self.tabs = self.tabs or [] 