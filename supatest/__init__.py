"""
Custom implementation extending browser_use functionality.
"""

__version__ = "0.1.0"

from .agent.service import CustomAgent
from .controller.custom import CustomController
from .dom.custom import CustomDOMManager
from .browser.custom import CustomBrowser

__all__ = [
    'CustomAgent',
    'CustomController',
    'CustomDOMManager',
    'CustomBrowser'
] 