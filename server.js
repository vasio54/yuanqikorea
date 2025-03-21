const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// 設置 CSP 頭部，允許 eval() 和 WebSocket
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-eval'; connect-src 'self' ws: wss:"
    );
    next();
});

let waitingMales = [];
let waitingFemales = [];
let roomCounter = 0;

io.on('connection', (socket) => {
    console.log('有用戶連線！', socket.id);

    socket.on('startMatching', (data) => {
        console.log('收到 startMatching 事件，data:', data);
        if (!data || !data.targetGender) {
            socket.emit('error', '請先選擇聊天對象性別！');
            socket.disconnect();
            return;
        }

        const { targetGender } = data;
        const userGender = targetGender === 'male' ? 'female' : 'male';
        socket.gender = userGender;
        console.log('用戶性別:', userGender, 'socket.id:', socket.id);

        if (userGender === 'male') {
            console.log('等待中的女性數量:', waitingFemales.length);
            if (waitingFemales.length > 0) {
                const partner = waitingFemales.shift();
                const room = `room-${roomCounter++}`;
                console.log('配對成功，房間:', room);

                socket.join(room);
                partner.join(room);
                socket.currentRoom = room;
                partner.currentRoom = room;

                socket.emit('matchSuccess', { room });
                partner.emit('matchSuccess', { room });
            } else {
                waitingMales.push(socket);
                socket.emit('waiting', `正在尋找女性聊天對象...`);
            }
        } else if (userGender === 'female') {
            console.log('等待中的男性數量:', waitingMales.length);
            if (waitingMales.length > 0) {
                const partner = waitingMales.shift();
                const room = `room-${roomCounter++}`;
                console.log('配對成功，房間:', room);

                socket.join(room);
                partner.join(room);
                socket.currentRoom = room;
                partner.currentRoom = room;

                socket.emit('matchSuccess', { room });
                partner.emit('matchSuccess', { room });
            } else {
                waitingFemales.push(socket);
                socket.emit('waiting', `正在尋找男性聊天對象...`);
            }
        }
    });

    socket.on('message', (msg) => {
        console.log('收到訊息:', msg, 'socket.id:', socket.id);
        const rooms = Array.from(socket.rooms);
        console.log('用戶所在房間:', rooms);
        if (rooms.length > 1) {
            const room = rooms[1];
            console.log('轉發訊息到房間:', room);
            io.to(room).emit('message', { user: socket.id, text: msg });
        } else {
            console.log('用戶不在任何聊天室中，無法轉發訊息');
            socket.emit('error', '聊天室已失效，請重新配對！');
        }
    });

    socket.on('typing', () => {
        const room = socket.currentRoom;
        if (room) {
            socket.to(room).emit('typing');
        }
    });

    socket.on('stopTyping', () => {
        const room = socket.currentRoom;
        if (room) {
            socket.to(room).emit('stopTyping');
        }
    });

    socket.on('joinRoom', (room) => {
        console.log('用戶重新加入房間:', room, 'socket.id:', socket.id);
        socket.join(room);
        socket.currentRoom = room;
    });

    socket.on('leaveChat', () => {
        console.log('收到 leaveChat 事件，socket.id:', socket.id);
        const room = socket.currentRoom;
        if (room) {
            socket.to(room).emit('partnerLeft', '對方已離開，你將被導回首頁...');
            socket.leave(room);
            socket.currentRoom = null;
        }
    });

    socket.on('disconnect', () => {
        console.log('用戶斷線，socket.id:', socket.id);
        const room = socket.currentRoom;
        if (room) {
            socket.to(room).emit('partnerLeft', '對方已斷線，你將被導回首頁...');
        }

        if (socket.gender === 'male') {
            const index = waitingMales.indexOf(socket);
            if (index !== -1) {
                waitingMales.splice(index, 1);
            }
        } else if (socket.gender === 'female') {
            const index = waitingFemales.indexOf(socket);
            if (index !== -1) {
                waitingFemales.splice(index, 1);
            }
        }
        console.log('用戶已斷開連線', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`伺服器運行於 http://localhost:${PORT}`);
});