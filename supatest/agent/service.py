"""
Custom agent implementation extending browser_use base agent.
"""

from browser_use.agent import Agent

class CustomAgent(Agent):
    def __init__(self, websocket=None):
        super().__init__()
        
        """
        Override base decide_next_action to add custom action handling.
        
        Returns:
            Dict: Action to be executed with its parameters
        """
        action = await super().decide_next_action()
        
        if action and action.get("type") in self.custom_actions:
            # Handle custom action
            handler = self.custom_actions[action["type"]]
            return await handler(action)
            
        # Send action via websocket if configured
        if action:
            await self.send_action_via_ws(action)
            
        return action 