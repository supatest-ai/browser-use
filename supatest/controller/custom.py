"""
Custom controller implementation extending browser_use base controller functionality.
"""

from typing import Dict, Optional
import asyncio
import json
from browser_use.controller import Controller
from ..agent.service import CustomAgent
from ..browser.custom import CustomBrowser
from ..dom.custom import CustomDOMManager

class CustomController(Controller):
    def __init__(self, websocket=None, headless: bool = False, custom_options: Optional[Dict] = None):
        """
        Initialize custom controller with websocket support.
        
        Args:
            websocket: Websocket connection for action communication
            headless (bool): Whether to run browser in headless mode
            custom_options (Dict): Additional browser options
        """
        # Initialize custom browser
        browser = CustomBrowser(headless=headless, custom_options=custom_options)
        
        # Initialize custom DOM manager
        dom_manager = CustomDOMManager(browser.driver)
        
        # Initialize custom agent with websocket
        agent = CustomAgent(websocket=websocket)
        
        super().__init__(browser, dom_manager, agent)
        self.websocket = websocket
        
    async def handle_ws_message(self, message: str) -> None:
        """
        Handle incoming websocket message.
        
        Args:
            message (str): Incoming message
        """
        try:
            data = json.loads(message)
            action_type = data.get("type")
            
            if action_type == "execute_action":
                await self.execute_action(data.get("action", {}))
            elif action_type == "get_state":
                state = self.get_current_state()
                if self.websocket:
                    await self.websocket.send_json({"type": "state", "data": state})
                    
        except json.JSONDecodeError:
            print(f"Invalid JSON message received: {message}")
        except Exception as e:
            print(f"Error handling message: {str(e)}")
            
    async def execute_action(self, action: Dict) -> None:
        """
        Execute action and send result via websocket.
        
        Args:
            action (Dict): Action to execute
        """
        try:
            result = await super().execute_action(action)
            
            if self.websocket:
                await self.websocket.send_json({
                    "type": "action_result",
                    "action": action,
                    "result": result
                })
                
        except Exception as e:
            error_msg = str(e)
            if self.websocket:
                await self.websocket.send_json({
                    "type": "action_error",
                    "action": action,
                    "error": error_msg
                })
                
    def get_current_state(self) -> Dict:
        """
        Get enhanced current state including DOM and browser info.
        
        Returns:
            Dict: Current state
        """
        base_state = super().get_current_state()
        
        # Add enhanced state information
        enhanced_state = {
            **base_state,
            "cookies": self.browser.get_cookies(),
            "window_size": {
                "width": self.browser.driver.get_window_size()["width"],
                "height": self.browser.driver.get_window_size()["height"]
            }
        }
        
        return enhanced_state 