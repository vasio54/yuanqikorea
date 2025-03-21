const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

// 儲存等待配對的用戶，按目標性別分組
const waitingUsers = { male: [], female: [] };

io.on('connection', (socket) => {
  console.log('用戶已連線:', socket.id);

  socket.on('startMatching', (data) => {
    const { targetGender } = data;
    console.log(`${socket.id} 請求配對，目標性別: ${targetGender}`);

    // 檢查是否已在等待列表中，避免重複加入
    for (const gender in waitingUsers) {
      const index = waitingUsers[gender].indexOf(socket);
      if (index !== -1) {
        waitingUsers[gender].splice(index, 1);
        console.log(`${socket.id} 從 ${gender} 等待列表移除，避免重複`);
      }
    }

    const waitingList = waitingUsers[targetGender];
    if (waitingList.length > 0) {
      const partner = waitingList.shift(); // 取出第一個等待者
      const room = `room-${socket.id}-${partner.id}`;
      
      socket.join(room);
      partner.join(room);
      io.to(socket.id).emit('matchSuccess', { room });
      io.to(partner.id).emit('matchSuccess', { room });
      console.log(`配對成功: ${socket.id} 和 ${partner.id}，房間: ${room}`);
    } else {
      waitingUsers[targetGender].push(socket);
      socket.emit('waiting', '正在等待對方加入...');
      console.log(`${socket.id} 已加入 ${targetGender} 等待列表，當前長度: ${waitingUsers[targetGender].length}`);
    }
  });

  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`${socket.id} 加入房間: ${room}`);
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
      socket.to(room).emit('partnerLeft', '對方已離開聊天');
    }
    console.log(`${socket.id} 已斷線`);
  });
});

http.listen(process.env.PORT || 3000, () => {
  console.log('伺服器運行於端口', process.env.PORT || 3000);
});