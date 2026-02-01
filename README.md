# @lndr/sse

A lightweight library for implementing Server-Sent Events (SSE) on the backend. This library provides an easy-to-use API for managing SSE connections and broadcasting events to connected clients.

## Features

- Simple singleton-based architecture
- Automatic connection lifecycle management
- Support for targeted and broadcast messaging
- Framework-agnostic (works with any Node.js HTTP server)
- TypeScript support with full type definitions
- Automatic SSE header configuration

## Installation

```bash
npm install @lndr/sse
```

## Quick Start

```typescript
import http from 'http';
import { Server, Hub } from '@lndr/sse';

const server = http.createServer((req, res) => {
	if (req.url === '/events') {
		// Create an SSE connection
		Server.createConnection(req, res);
		return;
	}

	// Broadcast an event to all connected clients
	Hub.emit('message', { text: 'Hello, World!' });
	res.end('Event sent');
});

server.listen(3000);
```


### Server

The `Server` singleton manages all SSE connections.

#### `Server.createConnection(req, res)`

Creates a new SSE connection from an HTTP request/response pair.

```typescript
import { Server } from '@lndr/sse';

// In your HTTP handler
Server.createConnection(req, res);
```

The connection ID is automatically determined from:

1. The `x-request-id` header (if present)
2. A randomly generated UUID v4 (fallback)


### Hub

The `Hub` singleton provides a fluent API for emitting events.

#### `Hub.emit(event, data?)`

Broadcasts an event to all connected clients.

```typescript
import { Hub } from '@lndr/sse';

Hub.emit('update', { status: 'complete' });
```

#### `Hub.to(id).emit(event, data?)`

Sends an event to a specific connection.

```typescript
// Send to a specific client
Hub.to('user-123').emit('private-message', { text: 'Hello!' });

// Broadcast to all (equivalent to Hub.emit)
Hub.to('*').emit('announcement', { text: 'Welcome!' });
```

### Connection

Each connection automatically configures the required SSE headers:

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`


## Usage Examples

### Basic Express.js Integration

```typescript
import express from 'express';
import { Server, Hub } from '@lndr/sse';

const app = express();

// SSE endpoint
app.get('/events', (req, res) => {
	Server.createConnection(req, res);
});

// Trigger an event
app.post('/notify', (req, res) => {
	Hub.emit('notification', { message: 'New notification!' });

	res.json({ success: true });
});

app.listen(3000);
```

### Targeted Messaging

```typescript
import { Server, Hub } from '@lndr/sse';

// Client connects with a custom request ID
// GET /events with header: x-request-id: user-456
app.get('/events', (req, res) => {
	Server.createConnection(req, res);
});

// Send a message to a specific user
app.post('/message/:userId', (req, res) => {
	const { userId } = req.params;

	Hub.to(userId).emit('direct-message', {
		from: 'admin',
		text: 'Hello!'
	});

	res.json({ sent: true });
});
```

### TypeScript with Custom Types

```typescript
import { Server, Hub } from '@lndr/sse';

interface NotificationPayload {
	id: string;
	title: string;
	body: string;
	timestamp: number;
}

// Type-safe event emission
Hub.emit<NotificationPayload>('notification', {
	id: 'notif-1',
	title: 'New Message',
	body: 'You have a new message',
	timestamp: Date.now()
});
```

## Client-Side Usage

Connect to your SSE endpoint using the browser's `EventSource` API:

```javascript
const eventSource = new EventSource('/events');

// Listen for specific events
eventSource.addEventListener('notification', (event) => {
	const data = JSON.parse(event.data);
	console.log('Notification:', data);
});

// Listen for all messages
eventSource.onmessage = (event) => {
	console.log('Message:', event.data);
};

// Handle connection errors
eventSource.onerror = (error) => {
	console.error('SSE error:', error);
};
```

## SSE Message Format

Events are sent in the standard SSE format:

```
id: <uuid>
event: <event-name>
data: <json-payload>

```

Example:

```
id: 550e8400-e29b-41d4-a716-446655440000
event: notification
data: {"message":"Hello, World!"}

```

## Connection Lifecycle

- Connections are automatically tracked when created via `Server.createConnection()`
- When a client disconnects, the connection is automatically removed from the pool
- Connection IDs can be specified via the `x-request-id` header for targeted messaging
