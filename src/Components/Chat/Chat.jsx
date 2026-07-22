import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import styles from './Chat.module.scss';
import api from '../../api';

const getSocketUrl = () => {
  try {
    return new URL(api.defaults.baseURL).origin;
  } catch {
    return window.location.origin;
  }
};

const Chat = ({ dealId, currentUser }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const socketRef = useRef(null);
  const messageListRef = useRef(null);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem('token');

    setLoading(true);
    setConnectionError('');

    api.get(`/message/${dealId}`)
      .then((response) => {
        if (mounted) {
          setMessages(Array.isArray(response.data) ? response.data : []);
        }
      })
      .catch(() => {
        if (mounted) {
          setConnectionError('Не удалось загрузить историю чата.');
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    socketRef.current = io(getSocketUrl(), {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    const room = `deal-${dealId}`;

    socketRef.current.on('connect', () => {
      setConnected(true);
      setConnectionError('');
      socketRef.current.emit('joinRoom', room, (response) => {
        if (!response?.ok) {
          setConnectionError(response?.message || 'Не удалось подключиться к чату сделки.');
        }
      });
    });

    socketRef.current.on('connect_error', () => {
      setConnected(false);
      setConnectionError('Нет realtime-подключения к чату. Попробуйте обновить страницу.');
    });

    socketRef.current.on('disconnect', () => {
      setConnected(false);
    });

    socketRef.current.on('message', (message) => {
      setMessages((prevMessages) => {
        if (prevMessages.some((item) => item.id === message.id)) {
          return prevMessages;
        }

        return [...prevMessages, message];
      });
    });

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.emit('leaveRoom', room);
        socketRef.current.disconnect();
      }
    };
  }, [dealId]);

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = newMessage.trim();

    if (!text || sending) return;

    setSending(true);
    setConnectionError('');

    const messagePayload = {
      room: `deal-${dealId}`,
      message: text,
      dealId: dealId,
    };

    const socket = socketRef.current;

    if (socket?.connected) {
      socket.timeout(8000).emit('sendMessage', messagePayload, (error, response) => {
        setSending(false);

        if (error || !response?.ok) {
          setConnectionError(response?.message || 'Не удалось отправить сообщение.');
          return;
        }

        setNewMessage('');
      });
      return;
    }

    try {
      const response = await api.post('/message', { dealId, text });
      setMessages((prevMessages) => [...prevMessages, response.data]);
      setNewMessage('');
      setConnectionError('Сообщение отправлено без realtime-подключения. Собеседник увидит его после обновления чата.');
    } catch {
      setConnectionError('Не удалось отправить сообщение.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.chatContainer}>
      <div className={styles.chatHeader}>
        <div>
          <strong>Чат сделки</strong>
          <span>{connected ? 'online' : 'подключение'}</span>
        </div>
      </div>

      <div ref={messageListRef} className={styles.messageList}>
        {loading && <div className={styles.chatState}>Загружаем сообщения...</div>}

        {!loading && messages.length === 0 && (
          <div className={styles.chatState}>Сообщений пока нет</div>
        )}

        {!loading && messages.map((msg) => (
          <div
            key={msg.id}
            className={`${styles.message} ${
              msg.sender?.id === currentUser.userId ? styles.myMessage : styles.otherMessage
            }`}
          >
            <div className={styles.messageContent}>
              <p><strong>{msg.sender?.username || 'Пользователь'}</strong></p>
              <p>{msg.text}</p>
              <span className={styles.timestamp}>
                {new Date(msg.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {connectionError && <div className={styles.chatError}>{connectionError}</div>}

      <form onSubmit={sendMessage} className={styles.messageInput}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Написать сообщение"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !newMessage.trim()}>
          {sending ? 'Отправка' : 'Отправить'}
        </button>
      </form>
    </div>
  );
};

export default Chat;
