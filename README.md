# Home CCTV - Sistema de Vigilancia Casero

Sistema cerrado de CCTV que convierte smartphones viejos en cámaras de seguridad, con acceso desde tu PC o remoto.

## Funcionalidades

- **Cámaras en vivo**: Ve el feed de cada cámara en tiempo real desde tu navegador
- **Detección de movimiento**: Alertas automáticas cuando se detecta movimiento
- **Grabación por movimiento**: Graba solo cuando hay actividad (ahorra espacio)
- **Visión nocturna**: Usa el flash del teléfono como luz infrarroja
- **Intercom bidireccional**: Habla y escucha a través de las cámaras
- **Acceso externo**: Ve las cámaras desde fuera de tu hogar
- **Capturas de pantalla**: Toma fotos de cualquier cámara al instante

## Requisitos

- **Teléfonos (cámaras)**: Android con navegador Chrome actualizado
- **PC Servidor**: Windows/Mac/Linux con Node.js instalado
- **Red**: Todos los dispositivos en la misma red WiFi (para acceso local)

## Instalación Rápida

### 1. Instalar Node.js
Descarga e instala Node.js desde https://nodejs.org (versión LTS)

### 2. Descargar el proyecto
```bash
# Clonar o descargar los archivos
cd home-cctv
npm install
```

### 3. Iniciar el servidor
```bash
npm start
```

### 4. Abrir el Dashboard (PC)
En tu navegador: `http://localhost:3000/dashboard`

### 5. Conectar las cámaras (Teléfonos)
En cada teléfono, abre una de estas páginas:

| Página | Función | URL |
|--------|---------|-----|
| **Solo Cámara** | Envía video al servidor | `http://[IP]:3000/camera` |
| **Móvil** | Cámara + Monitor (ver otras cámaras) | `http://[IP]:3000/mobile` |

**Recomendado**: Usa `/mobile` en todos los teléfonos para que cada uno pueda ser cámara Y monitor a la vez.

## Configuración

### Archivo `.env`
Copia `config/default.env` como `.env` y edita:

```env
PORT=3000                    # Puerto del servidor
ACCESS_KEY=tu-clave-segura   # Clave de acceso
MOTION_SENSITIVITY=30        # Sensibilidad (1-100)
RECORD_INTERVAL=10           # Segundos de grabación por evento
```

### Obtener IP de tu PC
En PowerShell:
```powershell
ipconfig | findstr "IPv4"
```

## Uso

### Dashboard (PC)
1. Abre `http://localhost:3000/dashboard`
2. Ingresa la clave de acceso
3. Haz clic en ▶ en cada cámara para ver el stream

### Cámaras (Teléfonos)
1. Abre `http://[IP-PC]:3000/mobile` en Chrome
2. Ingresa un nombre para el dispositivo (ej: "Sala", "Cochera")
3. Ingresa la clave de acceso
4. Toca "Conectar"
5. Posiciona el teléfono en la zona a vigilar

### Modo Monitor (ver otras cámaras desde el teléfono)
1. Abre `http://[IP-PC]:3000/mobile` en Chrome
2. Inicia sesión con la misma clave
3. Toca la pestaña "Monitor" abajo
4. Verás todas las cámaras conectadas
5. Toca "▶ Ver" en la cámara que quieras monitorear

### Funciones del Dashboard (PC)
| Botón | Función |
|-------|---------|
| ▶ | Conectar stream de video |
| 🎙 | Activar intercom (hablar por el teléfono) |
| 🌙 | Encender/apagar visión nocturna |
| 📷 | Tomar captura de pantalla |

### Funciones de la App Móvil (Teléfono)
**Pestaña Cámara:**
| Botón | Función |
|-------|---------|
| 🔄 | Cambiar cámara frontal/trasera |
| 🌙 | Visión nocturna (flash LED) |
| ⏺ | Grabar manualmente |
| 🎤 | Silenciar micrófono |
| 👁 | Activar/desactivar detección de movimiento |

**Pestaña Monitor:**
| Botón | Función |
|-------|---------|
| ▶ Ver | Conectar stream de otra cámara |
| 🎙 Hablar | Intercom con esa cámara |
| 📷 Foto | Captura de pantalla |
| 🌙 IR | Encender flash de la cámara remota |

## Acceso Externo

### Opción 1: Port Forwarding (Gratis)
1. Entra a la configuración de tu router (generalmente `192.168.1.1`)
2. Busca "Port Forwarding" o "Reenvío de puertos"
3. Crea una regla: Puerto externo `3000` → IP interna de tu PC → Puerto `3000`
4. Usa tu IP pública: `http://[IP-PUBLICA]:3000/dashboard`

### Opción 2: Tailscale (Recomendado - Gratis)
1. Instala Tailscale en tu PC y teléfonos
2. Inicia sesión en la misma cuenta
3. Accede via la IP de Tailscale: `http://[TAILSCALE-IP]:3000/dashboard`

### Opción 3: ngrok
```bash
# Instalar ngrok
npm install -g ngrok

# Iniciar
ngrok http 3000
```
Usa la URL que ngrok te proporcione.

## Seguridad

- Cambia la `ACCESS_KEY` en el archivo `.env`
- Si usas acceso externo, usa HTTPS (Tailscale lo proporciona automáticamente)
- No expongas el puerto sin autenticación

## Solución de Problemas

### La cámara no conecta
- Verifica que el teléfono y PC estén en la misma red WiFi
- Usa Chrome en el teléfono (no funciona bien en otros navegadores)
- Permite el acceso a cámara y micrófono cuando el navegador lo solicite

### No hay audio
- Verifica que el micrófono no esté silenciado (botón 🎤)
- En Android, permite el acceso al micrófono en la configuración de Chrome

### Stream con lag
- Reduce la resolución en la cámara (editar `camera.html`)
- Acércate al router WiFi
- Usa 5GHz en lugar de 2.4GHz si es posible

## Estructura del Proyecto

```
home-cctv/
├── server/
│   └── index.js          # Servidor principal + signaling WebRTC
├── public/
│   ├── camera.html        # Página para teléfonos (cámaras)
│   └── dashboard.html     # Dashboard de visualización
├── recordings/            # Carpeta de grabaciones
├── config/
│   └── default.env        # Configuración por defecto
├── .env                   # Tu configuración (no compartir)
├── .gitignore
├── package.json
└── README.md
```

## Tecnologías

- **Node.js + Express**: Servidor web
- **Socket.IO**: Comunicación en tiempo real
- **WebRTC**: Streaming de video peer-to-peer
- **Canvas API**: Detección de movimiento por comparación de frames
- **MediaRecorder API**: Grabación de video/audio

## Licencia

Proyecto personal - Usa responsablemente.
