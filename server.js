const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/chat.html', (req, res) => {
    res.sendFile(__dirname + '/public/chat.html');
});

const waitingUsers = { male: [], female: [] };
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('用戶已連線，socket.id:', socket.id);

    socket.on('startMatching', (data) => {
        const { targetGender } = data;
        if (!['male', 'female'].includes(targetGender)) {
            socket.emit('error', '無效的性別選擇！');
            return;
        }

        const oppositeGender = targetGender === 'male' ? 'female' : 'male';
        if (waitingUsers[oppositeGender].length > 0) {
            const partnerSocketId = waitingUsers[oppositeGender].shift();
            const roomId = `room-${socket.id}-${partnerSocketId}`;
            socket.join(roomId);
            io.to(partnerSocketId).emit('matchSuccess', { room: roomId });
            socket.emit('matchSuccess', { room: roomId });
            rooms.set(roomId, { users: [socket.id, partnerSocketId], active: true });
            console.log(`配對成功，房間 ${roomId}: ${socket.id} 和 ${partnerSocketId}`);
        } else {
            waitingUsers[targetGender].push(socket.id);
            socket.emit('waiting', '正在尋找聊天對象，請稍候...');
            console.log(`用戶 ${socket.id} 正在等待，目標性別: ${targetGender}`);
        }
    });

    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        console.log(`用戶 ${socket.id} 加入房間 ${roomId}`);
    });

    socket.on('message', (msg) => {
        const roomsArray = Array.from(socket.rooms);
        const roomId = roomsArray.find(room => room !== socket.id);
        if (roomId) {
            io.to(roomId).emit('message', { user: socket.id, text: msg });
            console.log(`房間 ${roomId} 訊息: ${msg} (來自 ${socket.id})`);
        }
    });

    socket.on('typing', () => {
        const roomsArray = Array.from(socket.rooms);
        const roomId = roomsArray.find(room => room !== socket.id);
        if (roomId) {
            socket.to(roomId).emit('typing');
        }
    });

    socket.on('stopTyping', () => {
        const roomsArray = Array.from(socket.rooms);
        const roomId = roomsArray.find(room => room !== socket.id);
        if (roomId) {
            socket.to(roomId).emit('stopTyping');
        }
    });

    socket.on('leaveChat', () => {
        const roomsArray = Array.from(socket.rooms);
        const roomId = roomsArray.find(room => room !== socket.id);
        if (roomId) {
            socket.to(roomId).emit('partnerLeft', '對方已離開聊天！');
            rooms.delete(roomId);
            console.log(`用戶 ${socket.id} 主動離開房間 ${roomId}`);
        }
        socket.disconnect();
    });

    socket.on('disconnect', () => {
        console.log(`用戶 ${socket.id} 斷線`);
        const roomsArray = Array.from(socket.rooms);
        const roomId = roomsArray.find(room => room !== socket.id);
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                // 設置延遲，給予用戶重新連線的機會
                setTimeout(() => {
                    // 檢查用戶是否重新連線
                    if (!io.sockets.sockets.get(socket.id)) {
                        // 用戶未重新連線，通知另一方並清除房間
                        socket.to(roomId).emit('partnerLeft', '對方已離開聊天！');
                        rooms.delete(roomId);
                        console.log(`用戶 ${socket.id} 斷線超過 30 秒，房間 ${roomId} 已清除`);
                    } else {
                        console.log(`用戶 ${socket.id} 已重新連線，房間 ${roomId} 保持活躍`);
                    }
                }, 30000); // 延遲 30 秒
            }
        }

        // 從等待列表中移除
        for (const gender in waitingUsers) {
            const index = waitingUsers[gender].indexOf(socket.id);
            if (index !== -1) {
                waitingUsers[gender].splice(index, 1);
                console.log(`用戶 ${socket.id} 從等待列表 (${gender}) 中移除`);
            }
        }
    });
});

http.listen(3000, () => {
    console.log('伺服器運行於 http://localhost:3000');
});