const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const socket = require('socket.io');
const cors = require('cors');
const io = socket(server, {
    cors: {
        origin: '*',
    },
});

app.use(
    cors({
        origin: 'http://localhost:3000',
    })
);

let rooms = [];

io.on('connection', (socket) => {
    socket.on('join room', (roomId) => {
        rooms.push(socket.id);
        console.log('Rooms:', rooms);
        
        // Find another user in the room (for a 2-user connection)
        const otherUser = rooms.find((id) => id !== socket.id);
        if (otherUser) {
            socket.to(otherUser).emit('user conencted', socket.id);
        }
    });

    socket.on('sending signal', (payload) => {
        io.to(payload.target).emit('user joined', payload);
    });

    socket.on('returning signal', (payload) => {
        io.to(payload.target).emit('receiving returned signal', payload);
    });

    socket.on('disconnect', () => {
        console.log('Rooms before disconnect:', rooms);
        rooms = rooms.filter((id) => id !== socket.id);
        console.log('Rooms after disconnect:', rooms);
        console.log('User disconnected:', socket.id);
    });
});

server.listen(8000, () => {
    console.log('Server running on port 8000');
});   