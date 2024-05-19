const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require('mongoose');
const moment = require('moment');



// Conexión a la base de datos MongoDB
mongoose.connect('mongodb+srv://adminChat:admin12345@serviciochat.wmgtprq.mongodb.net/?w=majority')
  .then(() => console.log('Conexión a MongoDB exitosa'))
  .catch(err => console.error('Error de conexión a MongoDB:', err));

// Definición del modelo de la sala de chat
const SalaChat = mongoose.model('SalaChat', {
  codigoSalaChat: String,
  cliente: String,
  estadoSalaChat: Boolean
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
    idCliente: Boolean,
    socketId: String
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
    // save the socketID in the local storage
    
    console.log(socket.handshake.query.socketId);
    return next();
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
      if(sala.estadoSalaChat === false) {
        console.log("La sala está cerrada:", codigoSala);
        socket.emit("roomClosed");
        //como recibo el 
        return next(new Error("Room closed"));
      } // Continuar con la conexión si el código de la sala es válido
    });
  });
  
  // Manejar la conexión de los usuarios al servidor
  io.on("connection", (socket) => {
    console.log("New user connected:", socket.id);
    socket.on("asignarSocketId", (socketId, roomCode, nombre) => {
    Persona.findOne({ nombre: nombre, codigoSala: roomCode }, (err, persona) => {
      if (persona) {
        console.log("Actualizando el socketId:", socket.id);
        persona.socketId = socket.id;
        persona.save(err => {
          if (err) {
            console.error("Error al asignar el socketId:", err);
            return;
          }
          console.log("SocketId asignado:", socket.id);
          socket.emit("cambiarSocketIdEnLocalStorage", socket.id)
        });
    }
    })
    })

    // Permitir que el usuario se una al chat si el código de sala es válido
    socket.on("join", (username, salaCode) => {
      //Comprueba si hay un socketId en el local storage
      console.log(`${username} joined the chat with socketId ${socket.id}`);
      users[socket.id] = username;
      console.log(users[socket.id]+  "Este es el usuario");
  
      // Verificar si la sala existe
      SalaChat.findOne({ codigoSalaChat: salaCode }, (err, sala) => {
        if (sala===null) {
          console.error("Error al buscar la sala en la base de datos:", err);
          socket.emit("CodigoInvalido")
          return;
        }
        if(sala.estadoSalaChat === false) {
          console.log("La sala está cerrada:", salaCode);
          socket.emit("roomClosed");
          return;
        }
        Persona.findOne({ nombre: username, codigoSala: salaCode }, (err, persona) => {
          if (persona) {
            console.log("Usuario ya existe en la sala:", username);
            socket.emit("userExists");
          }
        })


        // Crear una nueva instancia de Persona y guardarla en la base de datos
        const persona = new Persona({
          nombre: username,
          codigoSala: salaCode,
          permiso: true, // Puedes cambiar este valor según tus necesidades
          idCliente: false, // Por defecto, no es el administrador
          socketId: socket.id
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
                socket.emit("messagePush", { user: mensaje.nombre, message: mensaje.contenido, date: `${mensaje.fecha.getFullYear()}-${mensaje.fecha.getMonth()}-${mensaje.fecha.getDate()}   ` , time: mensaje.hora });
              });
            });
          }
        });
        socket.emit("connected");
      });
    });
    
    socket.on("buscandoUsuario", (username, salaCode) => {
      Persona.findOne({ nombre: username, codigoSala: salaCode }, (err, persona) => {
        if (!persona) {
          console.log("Usuario no encontrado en la sala:", username);
          socket.emit("UsuarioNoEncontrado");
        }
      });
    })

    socket.on("addUser", (username , socketId) => {
      users[socketId] = username;
      console.log("Usuarios: "+users[socketId]);
      socket.id = socketId;
    })


    socket.on("joinAdministrator", (documentAdministrator, salaCode) => {
      console.log(`${documentAdministrator} joined the chat with socketId ${socket.id}`);
      users[socket.id] = documentAdministrator;
      console.log(users[socket.id]+  "Este es el usuario");
  
      // Verificar si la sala existe
      SalaChat.findOne({ codigoSalaChat: salaCode }, (err, sala) => {
        if (sala===null) {
          console.error("Error al buscar la sala en la base de datos:", err);
          socket.emit("CodigoInvalido")
          return;
        }
        if(sala.estadoSalaChat === false) {
          console.log("La sala está cerrada:", salaCode);
          socket.emit("roomClosed");
          return;
        }
        if(sala.cliente !== documentAdministrator){
          console.log("El administrador no es el cliente de la sala:", documentAdministrator);
          socket.emit("adminNotClient");
          return;
        }

        Persona.findOne({ nombre: "Administrator", codigoSala: salaCode }, (err, persona) => {
          if (persona) {
            console.log("Usuario ya existe en la sala:", documentAdministrator);
            socket.emit("AdminAlreadyExists");
          }
        })

        const persona = new Persona({
          nombre: "Administrator",
          codigoSala: salaCode,
          permiso: true, 
          idCliente: true, // Es el administrador
          socketId: socket.id
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
                socket.emit("messagePush", { user: mensaje.nombre, message: mensaje.contenido, date: `${mensaje.fecha.getFullYear()}-${mensaje.fecha.getMonth()}-${mensaje.fecha.getDate()}   ` , time: mensaje.hora });
              });
            });
          }
        });
        socket.emit("connectedAdministrator");
      });
    });


    socket.on("connectedwhithlocalstorage", (salaCode, username, socketId) => {
      Mensaje.find({ salaChat: salaCode }, (err, mensajes) => {
        if (err) {
          console.error("Error al buscar mensajes de la sala:", err);
          return;
        }
        // Enviar cada mensaje al usuario recién conectado
        mensajes.forEach(mensaje => {
          socket.emit("messagePush", { user: mensaje.nombre, message: mensaje.contenido, date: `${mensaje.fecha.getFullYear()}-${mensaje.fecha.getMonth()}-${mensaje.fecha.getDate()}   ` , time: mensaje.hora });
        });
      });
      if(username === "Administrator"){
        socket.emit("connectedAdministratorWhithLocalStorage");
      }
    })

    socket.on("EliminarUsuario", (username, roomCode) => {
      Persona.findOneAndDelete({ nombre: username, codigoSala: roomCode }, (err, persona) => {
        if (err) {
          console.error("Error al buscar persona en la sala:", err);
          return;
        }
        if (persona){
          console.log("Usuario eliminado de la sala:", username);
          socket.emit("UsuarioEliminado", username)
        }
      });
    })



    socket.on("ActivarPermisos", (username, roomCode) =>{
      Persona.findOne({ nombre: username, codigoSala: roomCode }, (err, persona) => {
        if (err) {
          console.error("Error al buscar persona en la sala:", err);
          return;
        }
        if (persona){
          persona.permiso = true;
          persona.save(err => {
            if (err) {
              console.error("Error al activar los permisos:", err);
              return;
            }
            console.log("Permisos activados para el usuario:", username);
            socket.emit("permisosActivados", username)
          });
        }
      });
    })


    socket.on("DesactivarPermisos", (username, roomCode) =>{
      Persona.findOne({ nombre: username, codigoSala: roomCode }, (err, persona) => {
        if (err) {
          console.error("Error al buscar persona en la sala:", err);
          return;
        }
        if (persona){
          persona.permiso = false;
          persona.save(err => {
            if (err) {
              console.error("Error al desactivar los permisos:", err);
              return;
            }
            console.log("Permisos desactivados para el usuario:", username);
            socket.emit("permisosDesactivados", username)
          });
        }
      });
    }
    )


    socket.on("GetUsers", (salaCode) => {
      Persona.find({ codigoSala: salaCode }, (err, personas) => {
        if (err) {
          console.error("Error al buscar personas en la sala:", err);
          return;
        }
        
        const users = personas.map(persona => persona.nombre);
        let lista = []
        for (const [id, username] of Object.entries(users)) {
          if(username !== "Administrator"){
          lista.push(username)
          }
        }
        console.log("Lista de usuarios en la sala:", lista);
        socket.emit("HereAreTheusers", lista);
      });
    })


    // Manejar los mensajes generales
    socket.on("message", (data) => {

      console.log("Message received:", data.message);
      const user = data.username;
      Persona.findOne({ nombre: user, codigoSala: data.salaCode }, (err, persona) => {
        if (persona){
          if(persona.permiso === true){
            console.log('El usuario tiene permiso para enviar mensajes')
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
            Mensaje.find({id_mensaje: socket.id}, (err, mensaje) => {
              if (err) {
                console.error("Error al buscar el mensaje en la base de datos:", err);
                return;
              }
              console.log(mensaje+"gola");
              let date = "gola";
              let time = mensaje.hora;
              // Enviar el mensaje a todos los usuarios en la misma sala
              io.emit("message", { user, message: data.message, date, time});
            });
        } 
        else{
          console.log('El usuario no tiene permiso para enviar mensajes')
          socket.emit("noPermission")
        }
      }
      })
      
    });



   // Manejar los mensajes privados
   socket.on("privateMessage", (data) => {
    const senderName = data.sender;
  
    // Verificar si el remitente está en la misma salaChat
    Persona.findOne({ nombre: senderName, codigoSala: data.salaCode }, (err, sender) => {
      if (err || !sender) {
        console.error("Sender not found or not in the same room:", senderName);
        return;
      }
  
      
      // Verificar si el destinatario está en la misma salaChat
      Persona.findOne({ nombre: data.recipient, codigoSala: data.salaCode }, (err, recipient) => {
        if (err || !recipient) {
          console.error("Recipient not found or not in the same room:", data.recipient);
          socket.emit("recipientNotFound");
          return;
        }
        // Obtener el socketId de la Persona
        const socketId = recipient.socketId
        if (socketId) {
          // Enviar el mensaje privado al destinatario
          io.to(socketId).emit("privateMessage", {
            user: senderName,
            recipient: data.recipient,
            message: data.message,
          });
        } else {
          console.error("SocketId not found for recipient:", data.recipient);
          socket.emit("recipientNotFound");
        }
      });
    });
  });
  

    // Manejar la desconexión de los usuarios
    socket.on("disconnect", () => {
      console.log(`The user ${users[socket.id]} has left the chat.`);
      delete users[socket.id];
    });
    
  }  
);
  
  


  const PORT = process.env.PORT || 3010;
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });


  app.use(express.json());

  app.post('/salas', (req, res) => {
    const { codigoSalaChat, cliente, estadoSalaChat } = req.body;

    const salaChat = new SalaChat({ codigoSalaChat, cliente, estadoSalaChat});

    salaChat.save((err) => {
      if (err) {
        console.error('Error al crear la sala de chat:', err);
        res.status(500).send('Internal server error');
      } else {
        console.log('Sala de chat creada exitosamente');
        res.status(200).send('Sala de chat creada exitosamente');
      }
    });
  });

