require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 50e6,
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const ACCESS_KEY = process.env.ACCESS_KEY || 'homecctv2024';
const MOTION_SENSITIVITY = parseInt(process.env.MOTION_SENSITIVITY) || 30;
const RECORDINGS_DIR = process.env.RECORDINGS_DIR || './recordings';

// Ensure recordings directory exists
if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// State
const cameras = new Map();        // cameraId -> { id, name, socketId, status, lastMotion }
const dashboardClients = new Set(); // socketIds of dashboard viewers
const motionEvents = [];           // recent motion events
const recordings = new Map();      // cameraId -> { chunks: [], active: boolean }

// Simple auth middleware
function checkAuth(socket, next) {
  const key = socket.handshake.auth?.key || socket.handshake.query?.key;
  if (key === ACCESS_KEY) {
    return next();
  }
  return next(new Error('Unauthorized'));
}

io.use(checkAuth);

io.on('connection', (socket) => {
  console.log(`[CONNECT] ${socket.id}`);

  // === CAMERA REGISTRATION ===
  socket.on('camera:register', (data) => {
    const { name } = data;
    const cameraId = uuidv4().slice(0, 8);
    
    cameras.set(cameraId, {
      id: cameraId,
      name: name || `Camera ${cameras.size + 1}`,
      socketId: socket.id,
      status: 'online',
      lastMotion: null
    });

    socket.cameraId = cameraId;
    socket.role = 'camera';

    console.log(`[CAMERA] Registered: ${name} (${cameraId})`);
    
    // Notify all dashboards
    io.to('dashboard').emit('camera:registered', cameras.get(cameraId));
    // Notify all other cameras (so they can see each other in monitor mode)
    socket.broadcast.emit('camera:online', cameras.get(cameraId));
    // Confirm to this camera
    socket.emit('camera:registered', { cameraId, name: cameras.get(cameraId).name });
  });

  // === WEBRTC SIGNALING ===
  socket.on('signal:offer', (data) => {
    const { targetSocketId, offer } = data;
    io.to(targetSocketId).emit('signal:offer', {
      fromSocketId: socket.id,
      cameraId: socket.cameraId,
      offer
    });
  });

  socket.on('signal:answer', (data) => {
    const { targetSocketId, answer } = data;
    io.to(targetSocketId).emit('signal:answer', {
      fromSocketId: socket.id,
      answer
    });
  });

  socket.on('signal:ice-candidate', (data) => {
    const { targetSocketId, candidate } = data;
    io.to(targetSocketId).emit('signal:ice-candidate', {
      fromSocketId: socket.id,
      candidate
    });
  });

  // === MOTION DETECTION ===
  socket.on('motion:detected', (data) => {
    const camera = cameras.get(socket.cameraId);
    if (!camera) return;

    const event = {
      id: uuidv4(),
      cameraId: socket.cameraId,
      cameraName: camera.name,
      timestamp: new Date().toISOString(),
      level: data.level || 'medium',
      screenshot: data.screenshot || null
    };

    camera.lastMotion = event.timestamp;
    motionEvents.unshift(event);
    if (motionEvents.length > 100) motionEvents.pop();

    console.log(`[MOTION] ${camera.name} at ${event.timestamp} (level: ${event.level})`);

    // Notify all dashboards
    io.to('dashboard').emit('motion:detected', event);
  });

  // === INTERCOM (Two-way audio) ===
  socket.on('intercom:start', (data) => {
    const { cameraId } = data;
    const camera = cameras.get(cameraId);
    if (!camera) return;
    io.to(camera.socketId).emit('intercom:start', { fromDashboard: socket.id });
  });

  socket.on('intercom:stop', (data) => {
    const { cameraId } = data;
    const camera = cameras.get(cameraId);
    if (!camera) return;
    io.to(camera.socketId).emit('intercom:stop', { fromDashboard: socket.id });
  });

  socket.on('intercom:audio', (data) => {
    const { cameraId, audio } = data;
    const camera = cameras.get(cameraId);
    if (!camera) return;
    io.to(camera.socketId).emit('intercom:audio', { audio, fromDashboard: socket.id });
  });

  socket.on('intercom:audio-back', (data) => {
    const { dashboardSocketId, audio } = data;
    io.to(dashboardSocketId).emit('intercom:audio-back', { audio, fromSocketId: socket.id });
  });

  // === NIGHT VISION (Flash LED) ===
  socket.on('nightvision:on', () => {
    if (!socket.cameraId) return;
    socket.emit('nightvision:on');
    console.log(`[NIGHTVISION] ON for camera ${socket.cameraId}`);
  });

  socket.on('nightvision:off', () => {
    if (!socket.cameraId) return;
    socket.emit('nightvision:off');
    console.log(`[NIGHTVISION] OFF for camera ${socket.cameraId}`);
  });

  // === RECORDING CONTROL ===
  socket.on('recording:start', (data) => {
    const { cameraId } = data;
    const camera = cameras.get(cameraId);
    if (!camera) return;
    io.to(camera.socketId).emit('recording:start');
  });

  socket.on('recording:stop', (data) => {
    const { cameraId } = data;
    const camera = cameras.get(cameraId);
    if (!camera) return;
    io.to(camera.socketId).emit('recording:stop');
  });

  socket.on('recording:chunk', (data) => {
    const { cameraId, chunk, timestamp } = data;
    const dateDir = new Date().toISOString().slice(0, 10);
    const dir = path.join(RECORDINGS_DIR, cameraId, dateDir);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filename = `${timestamp}.webm`;
    const filepath = path.join(dir, filename);
    
    try {
      const buffer = Buffer.from(chunk, 'base64');
      fs.writeFileSync(filepath, buffer);
    } catch (err) {
      console.error('[RECORDING] Error saving chunk:', err.message);
    }
  });

  // === DASHBOARD ===
  socket.on('dashboard:join', () => {
    socket.join('dashboard');
    socket.role = 'dashboard';
    dashboardClients.add(socket.id);
    
    // Send current cameras list
    socket.emit('cameras:list', Array.from(cameras.values()));
    socket.emit('motion:history', motionEvents.slice(0, 50));
    
    console.log(`[DASHBOARD] Client connected: ${socket.id}`);
  });

  socket.on('dashboard:request-cameras', () => {
    socket.emit('cameras:list', Array.from(cameras.values()));
  });

  // === CHAT / MESSAGES ===
  socket.on('message:send', (data) => {
    const { cameraId, text } = data;
    const camera = cameras.get(cameraId);
    if (!camera) return;
    io.to(camera.socketId).emit('message:receive', { text });
  });

  // === DISCONNECT ===
  socket.on('disconnect', () => {
    if (socket.cameraId) {
      const camera = cameras.get(socket.cameraId);
      if (camera) {
        camera.status = 'offline';
        io.to('dashboard').emit('camera:offline', { cameraId: socket.cameraId });
        socket.broadcast.emit('camera:offline', { cameraId: socket.cameraId });
        console.log(`[CAMERA] Offline: ${camera.name}`);
        
        // Keep camera in list but mark offline
        setTimeout(() => {
          cameras.delete(socket.cameraId);
          io.to('dashboard').emit('camera:removed', { cameraId: socket.cameraId });
          socket.broadcast.emit('camera:removed', { cameraId: socket.cameraId });
        }, 30000); // Remove after 30s if not reconnected
      }
    }
    
    if (socket.role === 'dashboard') {
      dashboardClients.delete(socket.id);
    }
    
    console.log(`[DISCONNECT] ${socket.id}`);
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Root page - landing with links
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Home CCTV</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; }
    h1 { color: #00d4ff; margin-bottom: 10px; }
    p { color: #666; margin-bottom: 30px; }
    .links { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 300px; }
    a { display: block; padding: 16px; background: #1a1a1a; border: 1px solid #222; border-radius: 10px; color: #fff; text-decoration: none; text-align: center; font-size: 16px; transition: all 0.2s; }
    a:hover { background: #00d4ff; color: #000; border-color: #00d4ff; }
    .small { font-size: 12px; color: #444; margin-top: 30px; }
  </style>
</head>
<body>
  <h1>Home CCTV</h1>
  <p>Sistema de Vigilancia Casero</p>
  <div class="links">
    <a href="/mobile">Movil (Camara + Monitor)</a>
    <a href="/dashboard">Dashboard (PC)</a>
    <a href="/camera">Solo Camara</a>
  </div>
  <p class="small">Clave por defecto: homecctv2024</p>
</body>
</html>`);
});

// Camera page
app.get('/camera', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'camera.html'));
});

// Dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Mobile page (cámara + monitor en un solo dispositivo)
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'mobile.html'));
});

// API: Get recordings list
app.get('/api/recordings', (req, res) => {
  const result = {};
  
  if (fs.existsSync(RECORDINGS_DIR)) {
    const cameraDirs = fs.readdirSync(RECORDINGS_DIR);
    
    for (const camDir of cameraDirs) {
      const camPath = path.join(RECORDINGS_DIR, camDir);
      if (!fs.statSync(camPath).isDirectory()) continue;
      
      result[camDir] = {};
      const dateDirs = fs.readdirSync(camPath);
      
      for (const dateDir of dateDirs) {
        const datePath = path.join(camPath, dateDir);
        if (!fs.statSync(datePath).isDirectory()) continue;
        
        result[camDir][dateDir] = fs.readdirSync(datePath);
      }
    }
  }
  
  res.json(result);
});

// API: Get motion events
app.get('/api/motion', (req, res) => {
  res.json(motionEvents.slice(0, 100));
});

// API: Get connected cameras
app.get('/api/cameras', (req, res) => {
  res.json(Array.from(cameras.values()));
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('=========================================');
  console.log('   HOME CCTV SYSTEM - Servidor Iniciado');
  console.log('=========================================');
  console.log(`  Dashboard:  http://localhost:${PORT}/dashboard`);
  console.log(`  Cámaras:    http://localhost:${PORT}/camera`);
  console.log(`  Móvil:      http://localhost:${PORT}/mobile`);
  console.log(`  API:        http://localhost:${PORT}/api/cameras`);
  console.log(`  Clave:     ${ACCESS_KEY}`);
  console.log('=========================================');
  console.log('');
  
  // Show local IPs
  const os = require('os');
  const interfaces = os.networkInterfaces();
  console.log('  IPs de tu red local:');
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`    ${name}: ${iface.address}:${PORT}`);
      }
    }
  }
  console.log('');
});
