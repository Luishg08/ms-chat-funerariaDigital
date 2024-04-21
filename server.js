const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require('mongoose');

// Conexión a la base de datos MongoDB
mongoose.connect('mongodb+srv://adminChat:admin12345@serviciochat.wmgtprq.mongodb.net/?w=majority')
  .then(() => console.log('Conexión a MongoDB exitosa'))
  .catch(err => console.error('Error de conexión a MongoDB:', err));

// Definición del modelo de la sala de chat
const SalaChat = mongoose.model('SalaChat', {
  codigoSalaChat: String
});

// Definición del modelo del mensaje
const mensajeSchema = new mongoose.Schema({
  id_mensaje: String,
  nombre: String,
  fecha: Date,
  hora: String,
  contenido: String,
  salaChat: String
});

const Mensaje = mongoose.model('Mensaje', mensajeSchema);

const personaSchema = new mongoose.Schema({
    nombre: String,
    fechaIngreso: { type: Date, default: Date.now },
    permiso: Boolean,
    codigoSala: String,
    idCliente: Boolean
  });
  
  const Persona = mongoose.model('Persona', personaSchema);

// Instanciar express
const app = express();

// Crear el servidor web
const server = http.createServer(app);

// Configuración del servidor con las cors
const io = socketIo(server, {
  cors: {
    origin: "http://127.0.0.1:5500",
    credentials: true
  }
});

let users = {};

// Verificar el código de la sala antes de permitir que el usuario se una al chat
io.use((socket, next) => {
    const codigoSala = socket.handshake.query.codigoSala;
  
    SalaChat.findOne({ codigoSalaChat: codigoSala }, (err, sala) => {
      if (err) {
        console.error("Error al buscar la sala en la base de datos:", err);
        return next(new Error("Internal server error"));
      }
      if (!sala) {
        console.log("Código de sala inválido:", codigoSala);
        socket.emit("invalidRoomCode");
        return next(new Error("Invalid room code"));
      }
      return next(); // Continuar con la conexión si el código de la sala es válido
    });
  });
  
  // Manejar la conexión de los usuarios al servidor
  io.on("connection", (socket) => {
    console.log("An user connected");
  
    // Permitir que el usuario se una al chat si el código de sala es válido
    socket.on("join", (username, salaCode) => {
      console.log(`${username} joined the chat with socketId ${socket.id}`);
      users[socket.id] = username;
  
      // Verificar si la sala existe
      SalaChat.findOne({ codigoSalaChat: salaCode }, (err, sala) => {
        if (err) {
          console.error("Error al buscar la sala en la base de datos:", err);
          return;
        }
        if (!sala) {
          console.log("Código de sala no se ha encontrado:", salaCode);
          socket.emit("invalidRoomCode");
          return;
        }
  
        // Crear una nueva instancia de Persona y guardarla en la base de datos
        const persona = new Persona({
          nombre: username,
          codigoSala: salaCode,
          permiso: true, // Puedes cambiar este valor según tus necesidades
          idCliente: false // Por defecto, no es el administrador
        });
        persona.save(err => {
          if (err) {
            console.error("Error creating Persona:", err);
          } else {
            console.log('Persona created successfully:', persona);
  
            // Enviar todos los mensajes asociados a esta sala al nuevo usuario
            Mensaje.find({ salaChat: salaCode }, (err, mensajes) => {
              if (err) {
                console.error("Error al buscar mensajes de la sala:", err);
                return;
              }
              // Enviar cada mensaje al usuario recién conectado
              mensajes.forEach(mensaje => {
                socket.emit("message", { user: mensaje.nombre, message: mensaje.contenido });
              });
            });
          }
        });
      });
    });
  
    // Manejar los mensajes generales
    socket.on("message", (data) => {
      console.log("Message received:", data.message);
      const user = users[socket.id] || "User";
      const mensaje = new Mensaje({
        id_mensaje: socket.id,
        nombre: user,
        fecha: new Date(),
        hora: new Date().toLocaleTimeString(),
        contenido: data.message,
        salaChat: data.salaCode // Usar el código de la sala recibido del cliente
      });
      mensaje.save(err => {
        if (err) return console.error(err);
        console.log('Mensaje guardado exitosamente en la base de datos');
      });
      io.emit("message", { user, message: data.message });
    });
  
    // Manejar los mensajes privados
    socket.on("privateMessage", (data) => {
      const user = users[socket.id] || "User";
      const recipientSocket = Object.keys(users).find(
        (socketId) => users[socketId] === data.recipient
      );
      if (recipientSocket) {
        io.to(recipientSocket).emit("privateMessage", {
          user,
          recipient: data.recipient,
          message: data.message,
        });
      }
    });
  
    // Manejar la desconexión de los usuarios
    socket.on("disconnect", () => {
      console.log(`The user ${users[socket.id]} has left the chat.`);
      delete users[socket.id];
    });
  });
  
  const PORT = process.env.PORT || 3010;
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
