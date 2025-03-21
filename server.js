const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: { origin: '*' },
  pingTimeout: 60000, // 增加超時時間，避免快速斷線
  pingInterval: 25000
});

app.use(express.static(__dirname));

const waitingUsers = { male: [], female: [] };

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
    } else {
      waitingUsers[targetGender].push(socket);
      socket.emit('waiting', '正在等待對方加入...');
      console.log(`${socket.id} (目標: ${targetGender}) 已加入 ${targetGender} 等待列表，當前長度: ${waitingUsers[targetGender].length}`);
    }
  });

  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`${socket.id} 加入房間: ${room}`);
    // 檢查房間成員，確保雙方都在
    const clients = io.sockets.adapter.rooms.get(room);
    console.log(`房間 ${room} 當前成員: ${clients ? Array.from(clients) : '無成員'}`);
  });

  socket.on('message', (msg) => {
    const room = Array.from(socket.rooms)[1];
    if (room) {
      io.to(room).emit('message', { user: socket.id, text: msg });
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
      socket.to(room).emit('partnerLeft', '對方已離開聊天');
      socket.leave(room);
    }
    console.log(`${socket.id} 離開聊天`);
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
      // 不立即觸發 partnerLeft，讓對方等待重新連線
      console.log(`${socket.id} 斷線，但保留房間 ${room} 狀態`);
    }
    console.log(`${socket.id} 已斷線`);
  });
});

http.listen(process.env.PORT || 3000, () => {
  console.log('伺服器運行於端口', process.env.PORT || 3000);
});