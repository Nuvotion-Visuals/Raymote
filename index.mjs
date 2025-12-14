import http from 'http';
import fs from 'fs';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

let receiverPort = null;
let transmitterPort = null;
let connectedClients = [];
const buttonsFile = './buttons.json';
const configFile = './config.json';

// Load saved buttons
function loadButtons() {
  try {
    if (fs.existsSync(buttonsFile)) {
      return JSON.parse(fs.readFileSync(buttonsFile, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading buttons:', err.message);
  }
  return [];
}

// Save buttons
function saveButtons(buttons) {
  try {
    fs.writeFileSync(buttonsFile, JSON.stringify(buttons, null, 2));
  } catch (err) {
    console.error('Error saving buttons:', err.message);
  }
}

// Load saved config
function loadConfig() {
  try {
    if (fs.existsSync(configFile)) {
      return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading config:', err.message);
  }
  return { receiverPort: null, transmitterPort: null };
}

// Save config
function saveConfig(config) {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error saving config:', err.message);
  }
}

// List available serial ports (filter to only USB devices)
async function listPorts() {
  const ports = await SerialPort.list();
  
  // Filter to only show USB serial devices (ttyUSB*, ttyACM*)
  // Exclude built-in serial ports (ttyS*)
  const filteredPorts = ports.filter(port => {
    return port.path.includes('ttyUSB') || port.path.includes('ttyACM');
  });
  
  return filteredPorts.map(port => ({
    path: port.path,
    manufacturer: port.manufacturer || 'Unknown'
  }));
}

// Connect to IR receiver
async function connectToReceiver(portPath) {
  // Close existing connection if any
  if (receiverPort && receiverPort.isOpen) {
    receiverPort.close();
  }
  
  if (!portPath) {
    receiverPort = null;
    return { success: true, disconnected: true };
  }

  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path: portPath,
      baudRate: 9600,
      autoOpen: false
    });

    const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    port.on('open', () => {
      console.log(`✓ Receiver connected to ${portPath}`);
      receiverPort = port;
      resolve({ success: true });
    });

    port.on('error', (err) => {
      console.error('Receiver port error:', err.message);
      reject(err);
    });

    parser.on('data', (data) => {
      // Only broadcast decoded commands
      if (data.includes('Decoded') || data.includes('Ready to receive')) {
        const message = {
          timestamp: new Date().toLocaleTimeString(),
          data: data
        };
        
        // Send to all connected clients via SSE
        connectedClients.forEach(client => {
          client.write(`data: ${JSON.stringify(message)}\n\n`);
        });
        
        console.log(`[${message.timestamp}] ${data}`);
      }
    });

    port.open();
  });
}

// Connect to IR transmitter
async function connectToTransmitter(portPath) {
  // Close existing connection if any
  if (transmitterPort && transmitterPort.isOpen) {
    transmitterPort.close();
  }
  
  if (!portPath) {
    transmitterPort = null;
    return { success: true, disconnected: true };
  }

  return new Promise((resolve, reject) => {
    const port = new SerialPort({
      path: portPath,
      baudRate: 9600,
      autoOpen: false
    });

    port.on('open', () => {
      console.log(`✓ Transmitter connected to ${portPath}`);
      transmitterPort = port;
      resolve({ success: true });
    });

    port.on('error', (err) => {
      console.error('Transmitter port error:', err.message);
      reject(err);
    });

    port.open();
  });
}

// Send IR command to transmitter
async function sendIRCommand(protocol, bits, code) {
  return new Promise((resolve, reject) => {
    if (!transmitterPort || !transmitterPort.isOpen) {
      reject(new Error('Transmitter not connected'));
      return;
    }

    const command = `${protocol},${bits},${code}\n`;
    console.log(`Sending IR command: ${command.trim()}`);
    
    transmitterPort.write(command, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve({ success: true });
      }
    });
  });
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Serve main HTML page
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync('./public/index.html'));
  }
  
  // Serve htmx.min.js
  else if (url.pathname === '/htmx.min.js' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(fs.readFileSync('./public/htmx.min.js'));
  }
  
  // API: List available ports
  else if (url.pathname === '/api/ports' && req.method === 'GET') {
    try {
      const ports = await listPorts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ports));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  
  // API: Connect to a port
  else if (url.pathname === '/api/connect' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { port, type } = JSON.parse(body);
        let result;
        
        if (type === 'receiver') {
          result = await connectToReceiver(port);
        } else if (type === 'transmitter') {
          result = await connectToTransmitter(port);
        }
        
        // Save port configuration
        const config = loadConfig();
        if (type === 'receiver') {
          config.receiverPort = port || null;
        } else if (type === 'transmitter') {
          config.transmitterPort = port || null;
        }
        saveConfig(config);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, port, type, disconnected: result.disconnected }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  
  // API: Get configuration
  else if (url.pathname === '/api/config' && req.method === 'GET') {
    try {
      const config = loadConfig();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  
  // API: Get all buttons
  else if (url.pathname === '/api/buttons' && req.method === 'GET') {
    try {
      const buttons = loadButtons();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buttons));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  
  // API: Create a button
  else if (url.pathname === '/api/buttons' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const newButton = JSON.parse(body);
        const buttons = loadButtons();
        newButton.id = Date.now().toString();
        buttons.push(newButton);
        saveButtons(buttons);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(buttons));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  
  // API: Delete a button
  else if (url.pathname.startsWith('/api/buttons/') && req.method === 'DELETE') {
    try {
      const id = url.pathname.split('/')[3];
      let buttons = loadButtons();
      buttons = buttons.filter(b => b.id !== id);
      saveButtons(buttons);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buttons));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }
  
  // API: Send IR command
  else if (url.pathname === '/api/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { protocol, bits, code } = JSON.parse(body);
        await sendIRCommand(protocol, bits, code);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  }
  
  // API: Server-Sent Events stream for IR commands
  else if (url.pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    
    // Send a comment every 30s to keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30000);
    
    connectedClients.push(res);
    
    req.on('close', () => {
      clearInterval(keepAlive);
      connectedClients = connectedClients.filter(client => client !== res);
      console.log('Client disconnected from event stream');
    });
  }
  
  // 404
  else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const PORT = 3000;
server.listen(PORT, async () => {
  console.log('=== Raymote IR Remote Control ===');
  console.log(`\n✓ Web server running at http://localhost:${PORT}`);
  console.log('\nOpen your browser and navigate to the URL above.\n');
  
  // Auto-reconnect to saved ports
  const config = loadConfig();
  if (config.receiverPort) {
    console.log(`Attempting to reconnect receiver to ${config.receiverPort}...`);
    try {
      await connectToReceiver(config.receiverPort);
    } catch (err) {
      console.error(`Failed to reconnect receiver: ${err.message}`);
    }
  }
  if (config.transmitterPort) {
    console.log(`Attempting to reconnect transmitter to ${config.transmitterPort}...`);
    try {
      await connectToTransmitter(config.transmitterPort);
    } catch (err) {
      console.error(`Failed to reconnect transmitter: ${err.message}`);
    }
  }
});

