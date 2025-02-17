import logging
import asyncio
import websockets
import json
import re
from typing import Dict
import socketio
from websocket_automation import run_automation
from browser_use.logging_config import setup_logging

# Initialize logging
setup_logging()
logger = logging.getLogger("py_ws_server")

# Store setup data temporarily, keyed by goalId
setup_data_store: Dict[str, dict] = {}

class AutomationServer:
    """
    WebSocket server that handles automation setup and execution.
    Manages initial setup connections and subsequent Socket.IO automation.
    """
    
    def __init__(self, host: str = "localhost", port: int = 8765):
        self.host = host
        self.port = port
        
    async def start(self):
        """Start the WebSocket server"""
        server = await websockets.serve(
            self._handle_setup_connection,
            self.host,
            self.port
        )
        logger.info(f"Setup server running on ws://{self.host}:{self.port}")
        await asyncio.Future()  # Run indefinitely

    async def _handle_setup_connection(self, websocket):
        """
        Handle initial setup connection and prepare automation.
        Extracts setup data and initiates automation process.
        """
        try:
            # Parse setup message
            setup_data = await self._parse_setup_message(websocket)
            
            # Extract goal step ID from connection path
            goal_id = await self._extract_goal_id(websocket)
            
            # Store setup data for automation
            self._store_setup_data(goal_id, setup_data)

            #getting requestId
            requestId = setup_data.get("requestId")
            
            # Send success response
            await self._send_success_response(websocket, requestId)
            
            # Start automation process
            await self._run_automation(goal_id, setup_data)
            
        except Exception as e:
            logger.error(f"Setup connection failed: {str(e)}", exc_info=True)
            await websocket.close(1011, str(e))

    async def _parse_setup_message(self, websocket) -> dict:
        """Parse and extract setup data from incoming message"""
        message = await websocket.recv()
        data = json.loads(message)
        
        if isinstance(data, dict) and 'data' in data:
            try:
                return json.loads(data['data'])
            except json.JSONDecodeError:
                return data['data']
        return data

    async def _extract_goal_id(self, websocket) -> str:
        """Extract goal step ID from WebSocket connection path"""
        path = websocket.request.path
        match = re.match(r'/([^/]+)', path)
        if not match:
            raise ValueError("Invalid connection path")
        return match.group(1)

    def _store_setup_data(self, goal_id: str, setup_data: dict):
        """Store setup data for later use in automation"""
        setup_data_store[goal_id] = {
            "connectionUrl": setup_data.get("connectionUrl"),
            "task": setup_data.get("task"),
            "testCaseId": setup_data.get("testCaseId"),
            "requestId": setup_data.get("requestId")
        }
        logger.debug(f"Stored setup data for {goal_id}")

    async def _send_success_response(self, websocket, requestId: str):
        """Send success response for setup connection"""
        await websocket.send(json.dumps({
            "type": "AGENT_GOAL_START_RES",
            "requestId": requestId
        }))
        await websocket.close()

    async def _run_automation(self, goal_id: str, setup_data: dict):
        """Initialize and run the automation process"""
        try:
            automation_uri = self._build_automation_uri(goal_id, setup_data)
            task = setup_data_store[goal_id].get("task")
            connection_url = setup_data_store[goal_id].get("connectionUrl")
            requestId = setup_data_store[goal_id].get("requestId")
            testCaseId = setup_data_store[goal_id].get("testCaseId")

            await self._execute_automation(
                automation_uri,
                connection_url,
                task,
                goal_id,
                requestId,
                testCaseId
            )
        finally:
            if goal_id in setup_data_store:
                del setup_data_store[goal_id]

    def _build_automation_uri(self, goal_id: str, setup_data: dict) -> str:
        """Build the Socket.IO automation URI with query parameters"""
        return (
            f"http://localhost:8877?type=agent&goalId={goal_id}"
            f"&testCaseId={setup_data.get('testCaseId')}"
        )

    async def _execute_automation(
        self,
        automation_uri: str,
        connection_url: str,
        task: str,
        goal_id: str,
        requestId: str,
        testCaseId: str
    ):
        """Execute the automation process using Socket.IO connection"""
        sio = socketio.AsyncClient()
        try:
            await sio.connect(automation_uri, transports=["websocket"])
            logger.info(f"Socket.IO automation connection established for {goal_id}")
            
            async def send_message(msg: dict) -> bool:
                """Send message through Socket.IO connection"""
                if 'type' not in msg:
                    msg['type'] = 'AGENT_SUB_GOAL_UPDATE'
                try:
                    await sio.emit("message", json.dumps(msg), callback=True)
                    return True
                except Exception as e:
                    logger.error(f"Failed to send message: {str(e)}")
                    return False

            # Run automation task
            await run_automation(connection_url, task, send_message, goal_id)
            
            # Send completion message
            await sio.emit("message", json.dumps({
                "type": "AGENT_GOAL_STOP_RES",
                "requestId": requestId,
                "testCaseId": testCaseId,
                "success": True
            }))
            
        except Exception as e:
            logger.error(f"Automation failed: {str(e)}", exc_info=True)
            await self._handle_automation_error(sio, goal_id, str(e), requestId, testCaseId)
        finally:
            await sio.disconnect()

    async def _handle_automation_error(self, sio, error_msg: str, requestId: str, testCaseId: str):
        """Handle and report automation errors"""
        try:
            await sio.emit("message", json.dumps({
                "type": "AGENT_GOAL_STOP_RES",
                "requestId": requestId,
                "testCaseId": testCaseId,
                "error": error_msg,
                "success": False
            }))
        except Exception as e:
            logger.error(f"Failed to send error message: {str(e)}")

def main():
    """Initialize and start the automation server"""
    server = AutomationServer()
    asyncio.run(server.start())

if __name__ == "__main__":
    main()
