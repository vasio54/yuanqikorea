const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// 提供靜態檔案（index.html 和 chat.html）
app.use(express.static(__dirname));

// 儲存等待配對的用戶
const waitingUsers = { male: [], female: [] };

io.on('connection', (socket) => {
  console.log('用戶已連線:', socket.id);

  // 處理配對請求
  socket.on('startMatching', (data) => {
    const { targetGender } = data;
    console.log(`${socket.id} 請求配對，目標性別: ${targetGender}`);

    // 假設用戶自己的性別與目標性別相反（這裡簡化處理）
    const userGender = targetGender === 'male' ? 'female' : 'male';
    socket.gender = userGender; // 記錄用戶性別
    socket.targetGender = targetGender;

    // 檢查是否有等待中的對象
    const waitingList = waitingUsers[targetGender];
    if (waitingList.length > 0) {
      const partner = waitingList.shift(); // 取出第一個等待者
      const room = `room-${socket.id}-${partner.id}`;
      
      // 通知雙方配對成功
      socket.join(room);
      partner.join(room);
      io.to(socket.id).emit('matchSuccess', { room });
      io.to(partner.id).emit('matchSuccess', { room });
      console.log(`配對成功: ${socket.id} 和 ${partner.id}，房間: ${room}`);
    } else {
      // 沒有等待者，將用戶加入等待列表
      waitingUsers[userGender].push(socket);
      socket.emit('waiting', '正在等待對方加入...');
      console.log(`${socket.id} 已加入等待列表，性別: ${userGender}`);
    }
  });

  // 加入聊天室
  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`${socket.id} 加入房間: ${room}`);
  });

  // 處理訊息
  socket.on('message', (msg) => {
    const room = Array.from(socket.rooms)[1]; // 獲取用戶所在的房間
    if (room) {
      io.to(room).emit('message', { user: socket.id, text: msg });
      console.log(`房間 ${room} 訊息: ${msg}`);
    }
  });

  // 處理輸入中
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

  // 處理離開聊天
  socket.on('leaveChat', () => {
    const room = Array.from(socket.rooms)[1];
    if (room) {
      socket.to(room).emit('partnerLeft', '對方已離開聊天');
      socket.leave(room);
    }
    sessionStorage.removeItem('targetGender');
    sessionStorage.removeItem('chatRoom');
    console.log(`${socket.id} 離開聊天`);
  });

  // 用戶斷線處理
  socket.on('disconnect', () => {
    const userGender = socket.gender || 'unknown';
    const index = waitingUsers[userGender].indexOf(socket);
    if (index !== -1) {
      waitingUsers[userGender].splice(index, 1);
      console.log(`${socket.id} 從等待列表移除`);
    }
    const room = Array.from(socket.rooms)[1];
    if (room) {
      socket.to(room).emit('partnerLeft', '對方已離開聊天');
    }
    console.log(`${socket.id} 已斷線`);
  });
});

// 啟動伺服器
http.listen(process.env.PORT || 3000, () => {
  console.log('伺服器運行於端口', process.env.PORT || 3000);
});