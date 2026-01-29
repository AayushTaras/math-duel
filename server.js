const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the index.html file
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Game State Storage
const roomData = {}; 

// PROBLEM TEMPLATES
const problemTemplates = [
    { q: "\\int x^{NUM1} dx", type: "power_rule" },
    { q: "\\int NUM1 x^{NUM2} dx", type: "power_rule_coeff" },
    { q: "\\int \\frac{NUM1}{x} dx", type: "ln_rule" },
    { q: "\\int e^{NUM1x} dx", type: "exp_rule" },
    { q: "\\int \\sin(NUM1x) dx", type: "sin_rule" },
    { q: "\\int \\cos(NUM1x) dx", type: "cos_rule" },
    { q: "\\int_{0}^{1} NUM1 x dx", type: "definite_simple" } 
];

function generateProblem() {
    const template = problemTemplates[Math.floor(Math.random() * problemTemplates.length)];
    const n1 = Math.floor(Math.random() * 5) + 2; // Random 2 to 6
    const n2 = Math.floor(Math.random() * 4) + 2; // Random 2 to 5

    let question = template.q.replace('NUM1', n1).replace('NUM2', n2);
    let answerFormula = "";

    // ANSWER GENERATION LOGIC (Fractional Format)
    switch (template.type) {
        case "power_rule":
            // ∫ x^n = (1/(n+1)) * x^(n+1)
            answerFormula = `(1/${n1+1})*x^${n1+1}`;
            break;

        case "power_rule_coeff":
            // ∫ n1*x^n2 = (n1/(n2+1)) * x^(n2+1)
            let p = n2 + 1;
            if (n1 % p === 0) {
                answerFormula = `${n1/p}*x^${p}`;
            } else {
                answerFormula = `(${n1}/${p})*x^${p}`;
            }
            break;

        case "ln_rule":
            // ∫ n1/x = n1 * ln(x) -> sent as log(x)
            answerFormula = `${n1}*log(x)`;
            break;

        case "exp_rule":
            // ∫ e^(n1x) = (1/n1) * e^(n1x)
            answerFormula = `(1/${n1})*exp(${n1}*x)`;
            break;

        case "sin_rule":
            // ∫ sin(n1x) = -(1/n1) * cos(n1x)
            answerFormula = `-(1/${n1})*cos(${n1}*x)`;
            break;

        case "cos_rule":
             // ∫ cos(n1x) = (1/n1) * sin(n1x)
             answerFormula = `(1/${n1})*sin(${n1}*x)`;
             break;
             
        case "definite_simple":
            // ∫ from 0 to 1 of n1*x = n1 * [x^2/2] from 0 to 1 = n1/2
            answerFormula = `${n1/2}`;
            break;
    }

    return { question, answer: answerFormula };
}

function sendNewRound(roomID) {
    if (!roomData[roomID]) return;
    
    const problem = generateProblem();
    roomData[roomID].currentAnswer = problem.answer;
    
    // Send to everyone in the room
    io.to(roomID).emit('new_round', {
        question: problem.question,
        answer: problem.answer
    });
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. CREATE GAME
    socket.on('create_game', () => {
        // Generate random 5-char ID
        const roomID = Math.random().toString(36).substring(2, 7).toUpperCase();
        
        socket.join(roomID);
        
        // Initialize Room
        roomData[roomID] = { 
            scores: {}, 
            round: 0 
        };
        roomData[roomID].scores[socket.id] = 0;

        // Tell client the ID
        socket.emit('game_created', roomID);

        // START GAME IMMEDIATELY
        sendNewRound(roomID);
    });

    // 2. JOIN GAME
    socket.on('join_game', (roomID) => {
        const room = io.sockets.adapter.rooms.get(roomID);
        
        // Check if room exists
        if (roomData[roomID]) {
            socket.join(roomID);
            roomData[roomID].scores[socket.id] = 0;
            
            // Send the current problem to the new joiner immediately
            sendNewRound(roomID);
        } else {
            console.log("Join failed: Room does not exist");
        }
    });

    // 3. I SOLVED IT
    socket.on('i_solved_it', (roomID) => {
        if (!roomData[roomID]) return;

        // Increment Score
        roomData[roomID].scores[socket.id] += 10;
        roomData[roomID].round++;

        // Update Leaderboard
        io.to(roomID).emit('update_scores', roomData[roomID].scores);

        // Trigger Next Round
        sendNewRound(roomID);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
