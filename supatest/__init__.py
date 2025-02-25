"""
Custom implementation extending browser_use functionality.
"""

__version__ = "0.1.0"
from browser_use.logging_config import setup_logging

setup_logging()

from browser_use.agent.prompts import SystemPrompt
from supatest.agent.service import SupatestAgent 
from supatest.agent.views import SupatestActionModel 
from supatest.agent.views import ActionResult 
from supatest.agent.views import AgentHistoryList 
from supatest.browser.browser import SupatestBrowser 
from supatest.browser.context import SupatestBrowserContext
from browser_use.browser.browser import BrowserConfig
from browser_use.browser.context import BrowserContextConfig
from supatest.controller.service import SupatestController
from supatest.dom.service import SupatestDomService 

__all__ = [
	'SupatestAgent',
	'SupatestBrowser',
	'BrowserConfig',
	'SupatestController',
	'SupatestDomService',
	'SystemPrompt',
	'ActionResult',
	'SupatestActionModel',
	'AgentHistoryList',
	'BrowserContextConfig',
	'SupatestBrowserContext',
]
