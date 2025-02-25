"""
Custom implementation extending browser_use functionality.
"""

__version__ = "0.1.0"
from browser_use.logging_config import setup_logging

setup_logging()

from browser_use.agent.prompts import SystemPrompt as SystemPrompt
from supatest.agent.service import Agent as Agent
from supatest.agent.views import ActionModel as ActionModel
from supatest.agent.views import ActionResult as ActionResult
from supatest.agent.views import AgentHistoryList as AgentHistoryList
from supatest.browser.browser import SupatestBrowser as Browser
from browser_use.browser.browser import BrowserConfig as BrowserConfig
from browser_use.browser.context import BrowserContextConfig
from supatest.controller.service import SupatestController as Controller
from supatest.dom.service import SupatestDomService as DomService

__all__ = [
	'Agent',
	'Browser',
	'BrowserConfig',
	'Controller',
	'DomService',
	'SystemPrompt',
	'ActionResult',
	'ActionModel',
	'AgentHistoryList',
	'BrowserContextConfig',
]
