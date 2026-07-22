import { useEffect, useMemo, useRef, useState } from "react";
import { AiOutlineSend } from "react-icons/ai";
import { FiPaperclip, FiPlus, FiSearch, FiX } from "react-icons/fi";
import { TbClock, TbFileDescription } from "react-icons/tb";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import styles from "./SupportChatPage.module.scss";

const categories = [
  { value: "deal", label: "Сделка" },
  { value: "payment", label: "Платеж" },
  { value: "wallet", label: "Кошелек" },
  { value: "account", label: "Аккаунт" },
  { value: "security", label: "Безопасность" },
  { value: "other", label: "Другое" },
];

const formatTime = (value) => {
  if (!value) return "";

  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const SupportChatPage = () => {
  const [tickets, setTickets] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [creating, setCreating] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftTicket, setDraftTicket] = useState({
    subject: "",
    category: "deal",
    text: "",
  });
  const fileInputRef = useRef(null);
  const messagesRef = useRef(null);

  const loadTickets = (silent = false) => {
    if (!silent) {
      setLoadingTickets(true);
    }

    api
      .get("/support/tickets")
      .then((response) => {
        const nextTickets = Array.isArray(response.data) ? response.data : [];
        setTickets(nextTickets);
        setSelectedChatId((current) => current || nextTickets[0]?.id || null);
      })
      .catch((err) => {
        enqueueSnackbar(getApiErrorMessage(err, "Не удалось загрузить обращения"), {
          variant: "error",
        });
      })
      .finally(() => setLoadingTickets(false));
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const loadMessages = (ticketId = selectedChatId, silent = false) => {
    if (!ticketId) {
      setMessages([]);
      return;
    }

    if (!silent) {
      setLoadingMessages(true);
    }

    api
      .get(`/support/tickets/${ticketId}/messages`)
      .then((response) => setMessages(Array.isArray(response.data) ? response.data : []))
      .catch((err) => {
        enqueueSnackbar(getApiErrorMessage(err, "Не удалось загрузить сообщения"), {
          variant: "error",
        });
      })
      .finally(() => setLoadingMessages(false));
  };

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }

    loadMessages(selectedChatId);
  }, [selectedChatId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadTickets(true);
      if (selectedChatId) {
        loadMessages(selectedChatId, true);
      }
    }, 8000);

    return () => window.clearInterval(interval);
  }, [selectedChatId]);

  useEffect(() => {
    const node = messagesRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, selectedChatId]);

  const selectedChat = useMemo(() => {
    return tickets.find((chat) => chat.id === selectedChatId) || null;
  }, [selectedChatId, tickets]);

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tickets;

    return tickets.filter((ticket) =>
      [ticket.subject, ticket.lastMessage, ticket.user?.email]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, tickets]);

  const handleSelectFiles = (event) => {
    const files = Array.from(event.target.files || []);
    const nextFiles = [...selectedFiles, ...files].slice(0, 3);

    setSelectedFiles(nextFiles);
    event.target.value = "";
  };

  const handleRemoveFile = (fileIndex) => {
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((_, index) => index !== fileIndex)
    );
  };

  const handleSendMessage = () => {
    const text = [
      message.trim(),
      ...selectedFiles.map((file) => `[Вложение: ${file.name}]`),
    ].filter(Boolean).join("\n");

    if (!selectedChatId || !text || sending) {
      return;
    }

    setSending(true);
    api
      .post(`/support/tickets/${selectedChatId}/messages`, { text })
      .then((response) => {
        setMessages((current) => [...current, response.data]);
        setMessage("");
        setSelectedFiles([]);
        loadTickets(true);
      })
      .catch((err) => {
        enqueueSnackbar(getApiErrorMessage(err, "Не удалось отправить сообщение"), {
          variant: "error",
        });
      })
      .finally(() => setSending(false));
  };

  const handleCreateTicket = () => {
    if (!draftTicket.subject.trim() || !draftTicket.text.trim()) {
      enqueueSnackbar("Укажите тему и первое сообщение", { variant: "error" });
      return;
    }

    api
      .post("/support/tickets", draftTicket)
      .then((response) => {
        setTickets((current) => [response.data, ...current]);
        setSelectedChatId(response.data.id);
        setCreating(false);
        setDraftTicket({ subject: "", category: "deal", text: "" });
        enqueueSnackbar("Обращение создано", { variant: "success" });
      })
      .catch((err) => {
        enqueueSnackbar(getApiErrorMessage(err, "Не удалось создать обращение"), {
          variant: "error",
        });
      });
  };

  const handleReopenTicket = () => {
    if (!selectedChatId) {
      return;
    }

    api
      .post(`/support/tickets/${selectedChatId}/reopen`)
      .then((response) => {
        setTickets((current) =>
          current.map((ticket) => (ticket.id === selectedChatId ? response.data : ticket))
        );
        enqueueSnackbar("Обращение снова открыто", { variant: "success" });
      })
      .catch((err) => {
        enqueueSnackbar(getApiErrorMessage(err, "Не удалось открыть обращение"), {
          variant: "error",
        });
      });
  };

  return (
    <main className={styles.support}>
      <section className={styles.support_header}>
        <div>
          <h1 className="h1 title">Поддержка</h1>
          <p>Создавайте обращения и ведите переписку с оператором в одном интерфейсе.</p>
        </div>
        <button type="button" className="green-button" onClick={() => setCreating(true)}>
          <FiPlus />
          Новое обращение
        </button>
      </section>

      <section className={styles.support_layout}>
        <aside className={styles.support_sidebar}>
          <div className={styles.support_search}>
            <FiSearch />
            <input
              type="text"
              placeholder="Поиск по чатам"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className={styles.support_chatList}>
            {loadingTickets && (
              <div className={styles.support_emptySmall}>Загружаем обращения...</div>
            )}

            {!loadingTickets && filteredTickets.length === 0 && (
              <div className={styles.support_emptySmall}>Обращений пока нет</div>
            )}

            {filteredTickets.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`${styles.support_chatCard} ${
                  selectedChatId === chat.id ? styles.support_chatCard_active : ""
                }`}
                onClick={() => setSelectedChatId(chat.id)}
              >
                <div className={styles.support_chatCardTop}>
                  <div>
                    <strong>{chat.subject}</strong>
                    <span>Тикет #{chat.id}</span>
                  </div>
                  <p>
                    <TbClock />
                    {formatTime(chat.updatedAt || chat.createdAt)}
                  </p>
                </div>
                <p>{chat.lastMessage || "Нет сообщений"}</p>
                {chat.unread > 0 && (
                  <b className={styles.support_unread}>{chat.unread}</b>
                )}
                <span
                  className={
                    chat.status === "closed"
                      ? styles.support_statusWaiting
                      : styles.support_statusOnline
                  }
                >
                  {chat.status === "closed" ? "Закрыт" : "В работе"}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className={styles.support_conversation}>
          {!selectedChat && (
            <div className={styles.support_empty}>Выберите чат или создайте обращение</div>
          )}

          {selectedChat && (
            <>
              <div className={styles.support_chatHeader}>
                <div>
                  <h2>{selectedChat.subject}</h2>
                  <p>
                    Тикет #{selectedChat.id} / {selectedChat.status === "closed" ? "закрыт" : "в работе"}
                  </p>
                </div>
                <div>
                  <button type="button" onClick={() => loadMessages(selectedChatId)}>
                    Обновить
                  </button>
                  {selectedChat.status === "closed" && (
                    <button type="button" onClick={handleReopenTicket}>
                      Открыть снова
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.support_messages} ref={messagesRef}>
                {loadingMessages && (
                  <div className={styles.support_emptySmall}>Загружаем сообщения...</div>
                )}

                {!loadingMessages && messages.length === 0 && (
                  <div className={styles.support_emptySmall}>Сообщений пока нет</div>
                )}

                {!loadingMessages && messages.map((chatMessage) => (
                  <div
                    key={chatMessage.id}
                    className={
                      chatMessage.sender?.role === "operator"
                        ? styles.support_messageOperator
                        : styles.support_messageClient
                    }
                  >
                    <p>{chatMessage.text}</p>
                    <span>{formatTime(chatMessage.createdAt)}</span>
                  </div>
                ))}
              </div>

              <div className={styles.support_composer}>
                {selectedChat.status === "closed" && (
                  <div className={styles.support_closedNotice}>
                    Обращение закрыто. Можно открыть его снова или создать новое.
                  </div>
                )}
                {selectedFiles.length > 0 && (
                  <div className={styles.support_files}>
                    {selectedFiles.map((file, index) => (
                      <div key={`${file.name}-${index}`}>
                        <TbFileDescription />
                        <span>{file.name}</span>
                        <button type="button" onClick={() => handleRemoveFile(index)}>
                          <FiX />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.support_inputRow}>
                  <input ref={fileInputRef} type="file" multiple hidden onChange={handleSelectFiles} />

                  <button
                    type="button"
                    disabled={selectedChat.status === "closed" || selectedFiles.length >= 3}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FiPaperclip />
                  </button>

                  <input
                    type="text"
                    value={message}
                    placeholder={selectedChat.status === "closed" ? "Откройте обращение, чтобы написать" : "Написать"}
                    disabled={selectedChat.status === "closed" || sending}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleSendMessage();
                      }
                    }}
                  />

                  <button type="button" disabled={selectedChat.status === "closed" || sending} onClick={handleSendMessage}>
                    <AiOutlineSend />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {creating && (
        <div className={styles.support_modalOverlay} onMouseDown={() => setCreating(false)}>
          <section className={styles.support_modal} onMouseDown={(event) => event.stopPropagation()}>
            <div className={styles.support_modalTop}>
              <h2>Новое обращение</h2>
              <button type="button" onClick={() => setCreating(false)}>
                <FiX />
              </button>
            </div>
            <input
              type="text"
              placeholder="Тема"
              value={draftTicket.subject}
              onChange={(event) => setDraftTicket((current) => ({ ...current, subject: event.target.value }))}
            />
            <select
              value={draftTicket.category}
              onChange={(event) => setDraftTicket((current) => ({ ...current, category: event.target.value }))}
            >
              {categories.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
            <textarea
              placeholder="Опишите вопрос"
              value={draftTicket.text}
              onChange={(event) => setDraftTicket((current) => ({ ...current, text: event.target.value }))}
            />
            <button type="button" className="green-button" onClick={handleCreateTicket}>
              Создать обращение
            </button>
          </section>
        </div>
      )}
    </main>
  );
};

export default SupportChatPage;
