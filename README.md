# Raymote - IR Remote Control

A minimal web-based IR remote control application for Linux. Capture IR commands from any remote and create custom buttons to control your devices.

### Button UI

<img width="748" height="291" alt="image" src="https://github.com/user-attachments/assets/b3162957-7585-4894-b4cc-a45b5df33afe" />

### Config UI

<img width="1122" height="1246" alt="image" src="https://github.com/user-attachments/assets/98048763-b3be-4e71-a8a5-f1a795eaf7ba" />


## Features

- 📡 Capture IR commands from any remote control
- 🎮 Create custom remote buttons with a web interface
- 📤 Transmit IR commands to control devices
- 💾 Persistent button and port configuration
- 🌐 Clean, minimal OLED black theme web UI
- 🔄 Auto-reconnects to saved serial ports on startup

## Requirements

- Node.js 20+
- USB IR receiver and transmitter devices (compatible with serial/UART communication)
- Linux (tested on Ubuntu)

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Add your user to the dialout group (optional, to avoid using sudo):
   ```bash
   sudo usermod -a -G dialout $USER
   ```
   Then log out and back in for the change to take effect.

## Usage

### Start the server

```bash
sudo node index.mjs
```

Or without sudo if you're in the dialout group:
```bash
node index.mjs
```

The server will:
- Start on `http://localhost:3000`
- Automatically reconnect to previously configured ports
- Load your saved buttons

### Web Interface

Open your browser to `http://localhost:3000`

**Remote Mode** (default):
- View and click your remote control buttons
- Click any button to send that IR command

**Config Mode** (click mode toggle in bottom-right):
- Connect receiver and transmitter ports
- Capture IR codes by pressing buttons on any remote
- Click a log entry to auto-fill the form with that code
- Create custom buttons with names
- Delete buttons you no longer need

## Supported IR Protocols

- NEC
- SONY
- RC5
- RC6
- PANASONIC_OLD
- JVC
- NECX
- SAMSUNG36
- GICABLE
- DIRECTV
- RCMM
- CYKM

## Files

- `index.mjs` - Node.js HTTP server and serial communication
- `public/index.html` - Web UI
- `buttons.json` - Saved button configurations (auto-generated)
- `config.json` - Saved port settings (auto-generated)

## Troubleshooting

### No serial ports found
- Make sure your IR devices are plugged in via USB
- Check `lsusb` to verify they're detected
- Try unplugging and replugging the devices

### Permission denied on serial ports
- Run with `sudo`, or
- Add your user to the dialout group (see Installation)

### IR commands not appearing in log
- Verify the receiver is connected to the correct port
- Check the console output for connection messages
- Try a different baud rate if 9600 doesn't work (edit `index.mjs`)

### Different baud rates
If your devices use a different baud rate, edit `index.mjs` and change:
```javascript
baudRate: 9600  // Change to 115200, 57600, 38400, etc.
```

## License

MIT
