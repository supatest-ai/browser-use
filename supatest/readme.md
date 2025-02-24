# Web Automation Server

A WebSocket-based automation server that enables browser automation through Socket.IO connections.

## Overview

This project implements a WebSocket server that handles browser automation tasks through a combination of WebSocket and Socket.IO connections. It uses Python's asyncio for asynchronous operations and integrates with Azure OpenAI for intelligent automation.

## Prerequisites

- Python 3.11+
- A WebSocket-compatible browser
- Azure OpenAI API access

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd <project-directory>
```

2. Create and activate a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows, use `.venv\Scripts\activate`
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the project root with the following variables:
```
AZURE_OPENAI_API_KEY=your_api_key
AZURE_OPENAI_ENDPOINT=your_endpoint
AZURE_OPENAI_API_VERSION=2024-10-21
```

## Running the Server

To start the automation server:

```bash
python supatest/server.py
```

The server will start on `ws://localhost:8765` by default.

## Code Structure

### server.py
The main server implementation that:
- Handles initial WebSocket connections for automation setup
- Manages Socket.IO connections for ongoing automation
- Processes setup data and initiates automation tasks
- Handles error reporting and cleanup

Key components:
- `AutomationServer`: Main server class that manages WebSocket connections
- `setup_data_store`: Temporary storage for automation setup data
- WebSocket setup endpoint on port 8765
- Socket.IO automation endpoint on port 8877

### websocket_automation.py
Implements the core automation logic:
- Initializes browser automation using CDP (Chrome DevTools Protocol)
- Sets up Azure OpenAI integration for intelligent automation
- Manages browser contexts and automation agents
- Handles message passing between components

## Usage Flow

1. Client connects to WebSocket server with setup data
2. Server processes setup and stores configuration
3. Automation is initiated through Socket.IO connection
4. Agent performs requested tasks using browser automation
5. Results and updates are sent back through Socket.IO messages

## Error Handling

The server implements comprehensive error handling:
- Connection errors are caught and reported
- Automation failures are logged and communicated back to the client
- Resources are properly cleaned up after task completion or failure

## Security Notes

- Ensure proper API key management
- Use environment variables for sensitive configuration
- Implement appropriate access controls in production environments

