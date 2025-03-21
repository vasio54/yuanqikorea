const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(__dirname));

const waitingUsers = { male: [], female: [] };
const roomMessages = {};

io.on('connection', (socket) => {
  console.log('用戶已連線:', socket.id);

  socket.on('startMatching', (data) => {
    const { targetGender } = data;
    console.log(`${socket.id} 請求配對，目標性別: ${targetGender}`);

    const oppositeTargetGender = targetGender === 'male' ? 'female' : 'male';

    for (const gender in waitingUsers) {
      const index = waitingUsers[gender].indexOf(socket);
      if (index !== -1) {
        waitingUsers[gender].splice(index, 1);
        console.log(`${socket.id} 從 ${gender} 等待列表移除，避免重複`);
      }
    }

    const waitingList = waitingUsers[oppositeTargetGender];
    if (waitingList.length > 0) {
      const partner = waitingList.shift();
      const room = `room-${socket.id}-${partner.id}`;
      
      socket.join(room);
      partner.join(room);
      io.to(socket.id).emit('matchSuccess', { room });
      io.to(partner.id).emit('matchSuccess', { room });
      console.log(`配對成功: ${socket.id} (目標: ${targetGender}) 和 ${partner.id} (目標: ${oppositeTargetGender})，房間: ${room}`);
      roomMessages[room] = [];
    } else {
      waitingUsers[targetGender].push(socket);
      socket.emit('waiting', '正在等待對方加入...');
      console.log(`${socket.id} (目標: ${targetGender}) 已加入 ${targetGender} 等待列表，當前長度: ${waitingUsers[targetGender].length}`);
    }
  });

  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`${socket.id} 加入房間: ${room}`);
    const clients = io.sockets.adapter.rooms.get(room);
    console.log(`房間 ${room} 當前成員: ${clients ? Array.from(clients) : '無成員'}`);

    if (roomMessages[room] && roomMessages[room].length > 0) {
      roomMessages[room].forEach((msg) => {
        socket.emit('message', msg);
      });
      console.log(`${socket.id} 收到緩衝訊息: ${roomMessages[room].length} 條`);
    }
  });

  socket.on('message', (msg) => {
    const room = Array.from(socket.rooms)[1];
    if (room) {
      const messageData = { user: socket.id, text: msg };
      io.to(room).emit('message', messageData);
      if (!roomMessages[room]) roomMessages[room] = [];
      roomMessages[room].push(messageData);
      console.log(`房間 ${room} 訊息: ${msg}`);
    }
  });

  socket.on('typing', () => {
    const room = Array.from(socket.rooms)[1];
    if (room) {
      socket.to(room).emit('typing');
    }
  });

  socket.on('stopTyping', () => {
    const room = Array.from(socket.rooms)[1];
    if (room) {
      socket.to(room).emit('stopTyping');
    }
  });

  socket.on('leaveChat', () => {
    const room = Array.from(socket.rooms)[1];
    if (room) {
      const clients = io.sockets.adapter.rooms.get(room);
      if (clients) {
        clients.forEach((clientId) => {
          if (clientId !== socket.id) {
            // 通知對方跳轉回 index.html
            io.to(clientId).emit('partnerLeft', '對方已離開聊天');
            const partnerSocket = io.sockets.sockets.get(clientId);
            if (partnerSocket) {
              partnerSocket.leave(room);
              console.log(`${clientId} 被踢出房間 ${room}`);
            }
          }
        });
      }
      socket.leave(room);
      delete roomMessages[room];
      console.log(`${socket.id} 離開聊天，房間 ${room} 已解散`);
    }
  });

  socket.on('disconnect', () => {
    for (const gender in waitingUsers) {
      const index = waitingUsers[gender].indexOf(socket);
      if (index !== -1) {
        waitingUsers[gender].splice(index, 1);
        console.log(`${socket.id} 從 ${gender} 等待列表移除`);
      }
    }
    const room = Array.from(socket.rooms)[1];
    if (room) {
      console.log(`${socket.id} 斷線，但保留房間 ${room} 狀態`);
    }
    console.log(`${socket.id} 已斷線`);
  });
});

http.listen(process.env.PORT || 3000, () => {
  console.log('伺服器運行於端口', process.env.PORT || 3000);
});