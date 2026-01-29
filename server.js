const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files and handle the home route
app.use(express.static(path.join(__dirname, '/')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Load Math Templates
let templates = [];
try {
    const data = fs.readFileSync('problems.json', 'utf8');
    templates = JSON.parse(data);
} catch (err) {
    console.error("problems.json not found! Using default.");
    templates = [{ "q": "\\int NUM1x^{NUM2} dx", "a_formula": "power_rule" }];
}

const roomData = {}; 

function generateFromTemplate(template) {
    let q = template.q;
    let n1 = Math.floor(Math.random() * 8) + 2; 
    let n2 = Math.floor(Math.random() * 4) + 2; 
    
    q = q.replace("NUM1", n1).replace("NUM2", n2);
    let a = template.a || ""; 

    // Logic for dynamic formulas
    if(template.a_formula === "power_rule") {
        let power = n2 + 1;
        let coeff = (n1 / power).toFixed(2);
        if (coeff.endsWith(".00")) coeff = Math.floor(n1 / power);
        a = `${coeff} * x^${power}`;
    }

    return { q: q, a: a };
}

io.on('connection', (socket) => {
    let myRoom = "";

    socket.on('create_game', () => {
        const roomID = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(roomID);
        myRoom = roomID;
        roomData[roomID] = { scores: {}, round: 0, history: [] };
        roomData[roomID].scores[socket.id] = 0;
        socket.emit('game_created', roomID);
    });

    socket.on('join_game', (roomID) => {
        const room = io.sockets.adapter.rooms.get(roomID);
        if (room && room.size === 1) {
            socket.join(roomID);
            myRoom = roomID;
            roomData[roomID].scores[socket.id] = 0;
            sendNewRound(roomID);
        }
    });

    socket.on('i_solved_it', () => {
        if (!roomData[myRoom]) return;
        roomData[myRoom].scores[socket.id] += 1;
        roomData[myRoom].history.push(socket.id);
        roomData[myRoom].round += 1;

        if (roomData[myRoom].round < 5) {
            sendNewRound(myRoom);
        } else {
            io.to(myRoom).emit('final_results', {
                scores: roomData[myRoom].scores,
                history: roomData[myRoom].history
            });
            delete roomData[myRoom];
        }
    });

    function sendNewRound(roomID) {
        const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
        const problem = generateFromTemplate(randomTemplate);
        io.to(roomID).emit('start_round', {
            problem: problem,
            scores: roomData[roomID].scores,
            roundNumber: roomData[roomID].round + 1
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live on port ${PORT}`));
