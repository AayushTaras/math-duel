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
    
    q = q.replace(/NUM1/g, n1).replace(/NUM2/g, n2);
    let a = ""; 

    if (template.a) {
        a = template.a.replace(/NUM1/g, n1).replace(/NUM2/g, n2); 
    }

    // Dynamic Formula Logic
    switch(template.a_formula) {
        case "power_rule":
            let p = n2 + 1;
            let c = (n1 / p).toFixed(2);
            if (c.endsWith(".00")) c = Math.floor(n1 / p);
            a = `${c}*x^${p}`;
            break;
            
        case "ln_rule":
            // For ∫ (n1 / x) dx = n1 * ln(x)
            // We use log(x) for Math.js compatibility
            a = `${n1}*log(x)`;
            break;

        case "exp_rule":
            // For ∫ e^(n1*x) dx = (1/n1) * e^(n1*x)
            let expCoeff = (1 / n1).toFixed(2);
            a = `${expCoeff}*exp(${n1}*x)`;
            break;

        case "sin_rule":
            let sCoeff = (1 / n1).toFixed(2);
            a = `-${sCoeff}*cos(${n1}*x)`;
            break;
            
         case "cos_rule":
            // NEW: ∫ cos(n1*x) dx = (1/n1) * sin(n1*x)
            let cCoeff = (1 / n1).toFixed(2);
            if (cCoeff.endsWith(".00")) cCoeff = "1";
            a = `${cCoeff}*sin(${n1}*x)`;
            break;
    }

    // Final clean-up: standardized minus signs
    a = a.replace(/[\u2012\u2013\u2014\u2212]/g, '-');
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
        // Add a 500ms delay so the final "Correct" feedback 
        // has time to show up before the Results screen hides it.
        const finalData = {
            scores: roomData[myRoom].scores,
            history: roomData[myRoom].history
        };
        
        setTimeout(() => {
            io.to(myRoom).emit('final_results', finalData);
            delete roomData[myRoom];
        }, 500); 
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



