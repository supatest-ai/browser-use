import os
import logging
import asyncio
import json
from typing import Dict
from urllib.parse import parse_qs

import socketio
from aiohttp import web

from websocket_automation import run_automation
from browser_use.logging_config import setup_logging

# Initialize logging
setup_logging()
logger = logging.getLogger("py_ws_server")

# Store setup data temporarily, keyed by goalId
setup_data_store: Dict[str, dict] = {}

class AutomationServer:
    """
    Socket.IO server that handles automation setup and execution.
    Manages initial setup connections and subsequent Socket.IO automation.
    """

    def __init__(self):
        # Cloud Run will provide PORT as an environment variable.
        # Default to 8765 if not found.
        self.host = "0.0.0.0"
        self.port = int(os.getenv("PORT", "8765"))

        # Create an AsyncServer instance
        self.sio = socketio.AsyncServer(
            async_mode='aiohttp',
            cors_allowed_origins="*"
        )
        # Attach server to an aiohttp web application
        self.app = web.Application()
        self.sio.attach(self.app)

        # Register events
        @self.sio.event
        async def connect(sid, environ, auth):
            """When a client connects, store the environ so we can access it later."""
            logger.info(f"Client connected: {sid}, path={environ.get('PATH_INFO')}")
            # Store the environ in the built-in dictionary
            self.sio.environ[sid] = environ

        @self.sio.event
        async def disconnect(sid):
            logger.info(f"Client disconnected: {sid}")
            # Optionally remove from self.sio.environ
            self.sio.environ.pop(sid, None)

        @self.sio.on("setup_connection")
        async def handle_setup_connection(sid, data):
            """
            Receives the setup data and triggers the automation logic.
            """
            # Retrieve the environ from self.sio.environ
            environ = self.sio.environ.get(sid)
            await self._handle_setup_connection(sid, data, environ)

    async def start(self):
        """
        Start the Socket.IO server
        """
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, host=self.host, port=self.port)
        await site.start()
        logger.info(f"Setup server running on http://{self.host}:{self.port}")
        # Keep the server running forever
        await asyncio.Event().wait()

    async def _handle_setup_connection(self, sid, data, environ):
        """
        Parse the setup data from the Socket.IO event, identify goalId from query,
        and proceed with storing and automation logic.
        """
        try:
            # 1) Parse setup message
            setup_data = self._parse_setup_message(data)

            # 2) Extract goalId from query string
            if not environ:
                raise ValueError("No environ data found for this connection.")

            qs = environ.get('QUERY_STRING', '')  # e.g. "goalId=abc123"
            parsed = parse_qs(qs)
            goal_id = parsed.get('goalId', [None])[0]
            if not goal_id:
                raise ValueError("Missing 'goalId' in query string")

            # 3) Store setup data
            self._store_setup_data(goal_id, setup_data)

            # 4) Get requestId
            requestId = setup_data.get("requestId")

            # 5) Send success response
            await self._send_success_response(sid, requestId)

            # 6) Start automation
            await self._run_automation(goal_id, setup_data)

        except Exception as e:
            logger.error(f"Setup connection failed: {str(e)}", exc_info=True)
            await self.sio.emit("setup_error", {"error": str(e)}, to=sid)
            await self.sio.disconnect(sid)

    def _parse_setup_message(self, data) -> dict:
        """
        In Socket.IO, 'data' is usually already parsed JSON.
        Handle nested 'data' if needed.
        """
        if isinstance(data, dict) and 'data' in data:
            try:
                return json.loads(data['data'])
            except json.JSONDecodeError:
                return data['data']
        return data

    def _store_setup_data(self, goal_id: str, setup_data: dict):
        """
        Store setup data for later use
        """
        setup_data_store[goal_id] = {
            "connectionUrl": setup_data.get("connectionUrl"),
            "task": setup_data.get("task"),
            "testCaseId": setup_data.get("testCaseId"),
            "requestId": setup_data.get("requestId")
        }
        logger.debug(f"Stored setup data for {goal_id}")

    async def _send_success_response(self, sid, requestId: str):
        """
        Send success response to the TS client, then optionally disconnect.
        """
        await self.sio.emit(
            "setup_success",
            {
                "type": "AGENT_GOAL_START_RES",
                "requestId": requestId
            },
            to=sid
        )
        await self.sio.disconnect(sid)

    async def _run_automation(self, goal_id: str, setup_data: dict):
        """
        Initialize and run the automation process
        """
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
        """
        Build the Socket.IO automation URI with query params
        """
        base_url = os.getenv("AUTOMATION_BASE_URL", "http://localhost:8877")  # Default to localhost if not set
        return (
            f"{base_url}?type=agent&goalId={goal_id}"
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
        """
        Use a separate Socket.IO AsyncClient to connect to the TS server on port 8877
        for the actual automation.
        """
        sio = socketio.AsyncClient()
        try:
            await sio.connect(automation_uri, transports=["websocket"])
            logger.info(f"Socket.IO automation connection established for goalId={goal_id}")

            async def send_message(msg: dict) -> bool:
                """Send a JSON-encoded message to the TS server."""
                if 'type' not in msg:
                    msg['type'] = 'AGENT_SUB_GOAL_UPDATE'
                try:
                    await sio.emit("message", json.dumps(msg), callback=True)
                    return True
                except Exception as e:
                    logger.error(f"Failed to send message: {str(e)}")
                    return False

            # Run the actual automation
            success = await run_automation(
                connection_url, task, send_message, goal_id, requestId, testCaseId
            )
            logger.info(f"Automation completed with success: {success}")

            stop_message = {
                "type": "AGENT_GOAL_STOP_RES",
                "goalId": goal_id,
                "requestId": requestId,
                "testCaseId": testCaseId,
                "success": True
            }
            await send_message(stop_message)

        except Exception as e:
            logger.error(f"Automation failed: {str(e)}", exc_info=True)
            await self._handle_automation_error(sio, goal_id, str(e), requestId, testCaseId)
        finally:
            logger.info("Disconnecting from automation")
            try:
                await sio.disconnect()
            except Exception as e:
                logger.error(f"Error during disconnect: {str(e)}")

    async def _handle_automation_error(self, sio, goal_id: str, error_msg: str, requestId: str, testCaseId: str):
        """
        Send an error message to the TS server if automation fails.
        """
        try:
            error_message = {
                "type": "AGENT_GOAL_STOP_RES",
                "goalId": goal_id,
                "requestId": requestId,
                "testCaseId": testCaseId,
                "error": error_msg,
                "success": False
            }
            logger.info(f"Sending error message: {error_message}")
            await sio.emit("message", json.dumps(error_message), namespace="/")
            logger.info("Error message sent successfully")
        except Exception as e:
            logger.error(f"Failed to send error message: {str(e)}", exc_info=True)

def main():
    """Initialize and start the automation server using Socket.IO"""
    server = AutomationServer()
    asyncio.run(server.start())

if __name__ == "__main__":
    main()
