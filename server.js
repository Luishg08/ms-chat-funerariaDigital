const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require('cors');
const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
//do the conection with the database
mongoose.connect('mongodb+srv://adminChat:admin12345@serviciochat.wmgtprq.mongodb.net/?w=majority')
.then(() => console.log('Conexión a MongoDB exitosa'))
.catch(err => console.error('Error de conexión a MongoDB:', err));

//crear modelo de mensaje
const mensajeSchema = new mongoose.Schema({
    id_mensaje: String,
    nombre: String,
    fecha: Date,
    hora: String,
    contenido: String
  });
  
const Mensaje = mongoose.model('Mensaje', mensajeSchema);
  

// instanciar express
const app = express();

// crear el servidor web
const server = http.createServer(app);

// configuración del servidor con las cors
const io = socketIo(server, {
    cors: {
      origin: "http://127.0.0.1:5500",
      credentials: true
    }
  });


let conexiones = {
    salas: [
        {
            nombre: "sala1",
            usuarios: []
        },
        {
            nombre: "sala2",
            usuarios: []
        }
    ]
}

let users = {};

app.get("/", (req, res) => {
    res.send("Server chat is running");
});

io.on("connection", (socket) => {
    console.log("An user connected");

    socket.on("join", (username) => {
        console.log(`${username} joined the chat with socketId ${socket.id}`)
        users[socket.id] = username;
    });

    socket.on("message", (message) => {
        const user = users[socket.id] || "User";
        const mensaje = new Mensaje({
          id_mensaje: socket.id,
          nombre: user,
          fecha: new Date(),
          hora: new Date().toLocaleTimeString(),
          contenido: message
        });
        mensaje.save(err => {
          if (err) return console.error(err);
          console.log('Mensaje guardado exitosamente en la base de datos');
        });
        io.emit("message", { user, message });
      });

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

    socket.on("disconnect", () => {
        console.log(`The user ${users[socket.id]} has left the chat.`)
        delete users[socket.id];
    });
});

const PORT = process.env.PORT || 3010;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
