"""
Custom implementation extending browser_use functionality.
"""

__version__ = "0.1.0"
from browser_use.logging_config import setup_logging

setup_logging()

from supatest.agent.service import SupatestAgent 
from supatest.agent.views import SupatestActionModel 
from supatest.agent.views import SupatestAgentHistoryList 
from supatest.browser.browser import SupatestBrowser 
from supatest.browser.context import SupatestBrowserSession, SupatestBrowserContext
from supatest.controller.service import SupatestController
from supatest.controller.registry.service import SupatestRegistry

__all__ = [
	'SupatestAgent',
	'SupatestBrowser',
	'SupatestController',
	'SupatestActionModel',
	'SupatestAgentHistoryList',
	'SupatestBrowserSession',
	'SupatestBrowserContext',
	'SupatestRegistry',
]
