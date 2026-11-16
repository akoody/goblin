// Админка, раздел «Поддержка: тикеты, переписка, создание обращения». Состояние и загрузка в хуке useSupportAdmin: он вызывается в Admin, поэтому данные
// и черновики не теряются при переключении вкладок. Разметка в SupportSection.
import { useEffect, useMemo, useRef, useState } from "react";
import { FiFilter, FiMessageCircle, FiSearch, FiSend, FiUser } from "react-icons/fi";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import styles from "../Admin.module.scss";
import { formatDate } from "../adminFormat";

const getTicketClientName = (ticket) =>
  ticket.user?.username || ticket.user?.email || `Клиент #${ticket.userId || "-"}`;

const priorityLabels = {
  high: "Высокий",
  normal: "Обычный",
  low: "Низкий",
};

const statusLabels = {
  all: "Все",
  open: "Открытые",
  pending: "Ожидают клиента",
  closed: "Закрытые",
};

const ticketCategoryLabels = {
  general: "Общий вопрос",
  payment: "Платежи",
  p2p: "P2P сделка",
  account: "Аккаунт",
  security: "Безопасность",
  other: "Другое",
};

export function useSupportAdmin({  } = {}) {
  const [tickets, setTickets] = useState([]);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchValue, setSearchValue] = useState("");
  const [replyText, setReplyText] = useState("");
  const [newTicketDraft, setNewTicketDraft] = useState({
    email: "",
    subject: "",
    category: "general",
    priority: "normal",
    text: "",
  });
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const messagesRef = useRef(null);
  const loadTickets = (silent = false) => {
    if (!silent) {
      setTicketsLoading(true);
    }

    api
      .get("/support/tickets")
      .then((response) => {
        const nextTickets = Array.isArray(response.data) ? response.data : [];
        setTickets(nextTickets);
        setSelectedTicketId((current) => current || nextTickets[0]?.id || null);
      })
      .catch((error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          window.location.reload();
          return;
        }

        if (!silent) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить тикеты"), {
            variant: "error",
          });
        }
      })
      .finally(() => setTicketsLoading(false));
  };
  const loadTicketMessages = (ticketId = selectedTicketId, silent = false) => {
    if (!ticketId) {
      setTicketMessages([]);
      return;
    }

    if (!silent) {
      setMessagesLoading(true);
    }

    api
      .get(`/support/tickets/${ticketId}/messages`)
      .then((response) => setTicketMessages(Array.isArray(response.data) ? response.data : []))
      .catch((error) => {
        setTicketMessages([]);
        if (!silent) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить сообщения тикета"), {
            variant: "error",
          });
        }
      })
      .finally(() => setMessagesLoading(false));
  };
  useEffect(() => {
    if (!selectedTicketId) {
      setTicketMessages([]);
      return;
    }

    loadTicketMessages(selectedTicketId);
  }, [selectedTicketId]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      loadTickets(true);
      if (selectedTicketId) {
        loadTicketMessages(selectedTicketId, true);
      }
    }, 8000);

    return () => window.clearInterval(interval);
  }, [selectedTicketId]);
  useEffect(() => {
    const node = messagesRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [ticketMessages, selectedTicketId]);
  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const matchesStatus =
        statusFilter === "all" || ticket.status === statusFilter;
      const matchesSearch =
        !normalizedSearch ||
        [
          getTicketClientName(ticket),
          ticket.user?.email,
          ticket.id,
          ticket.subject,
          ticket.lastMessage,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }, [searchValue, statusFilter, tickets]);
  const selectedTicket = useMemo(() => {
    return tickets.find((ticket) => ticket.id === selectedTicketId) || null;
  }, [selectedTicketId, tickets]);
  const waitingCount = tickets.filter((ticket) => ticket.status === "open").length;
  const onlineCount = tickets.filter((ticket) => ticket.status === "pending").length;
  const highPriorityCount = tickets.filter(
    (ticket) => ticket.priority === "high"
  ).length;
  const handleSendReply = () => {
    const trimmedReply = replyText.trim();

    if (!selectedTicket || !trimmedReply || replySending) {
      return;
    }

    setReplySending(true);
    api
      .post(`/support/tickets/${selectedTicket.id}/messages`, { text: trimmedReply })
      .then((response) => {
        setTicketMessages((current) => [...current, response.data]);
        setReplyText("");
        loadTickets(true);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось отправить ответ"), {
          variant: "error",
        });
      })
      .finally(() => setReplySending(false));
  };
  const handleCloseTicket = () => {
    if (!selectedTicket) {
      return;
    }

    api
      .patch(`/support/tickets/${selectedTicket.id}`, { status: "closed" })
      .then((response) => {
        setTickets((current) =>
          current.map((ticket) => (ticket.id === selectedTicket.id ? response.data : ticket))
        );
        enqueueSnackbar("Тикет закрыт", { variant: "success" });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось закрыть тикет"), {
          variant: "error",
        });
      });
  };
  const handleCreateSupportTicket = (event) => {
    event.preventDefault();

    const payload = {
      email: newTicketDraft.email.trim(),
      subject: newTicketDraft.subject.trim(),
      category: newTicketDraft.category,
      priority: newTicketDraft.priority,
      text: newTicketDraft.text.trim(),
    };

    if (!payload.email || !payload.subject || !payload.text || creatingTicket) {
      enqueueSnackbar("Укажите email пользователя, тему и первое сообщение", {
        variant: "warning",
      });
      return;
    }

    setCreatingTicket(true);
    api
      .post("/admin/support/tickets", payload)
      .then((response) => {
        const createdTicket = response.data;
        setTickets((current) => [
          createdTicket,
          ...current.filter((ticket) => ticket.id !== createdTicket.id),
        ]);
        setSelectedTicketId(createdTicket.id);
        setNewTicketDraft({
          email: "",
          subject: "",
          category: "general",
          priority: "normal",
          text: "",
        });
        loadTickets(true);
        loadTicketMessages(createdTicket.id, true);
        enqueueSnackbar("Тикет создан и отправлен пользователю", {
          variant: "success",
        });
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось создать тикет"), {
          variant: "error",
        });
      })
      .finally(() => setCreatingTicket(false));
  };

  useEffect(() => {
    loadTickets();
  }, []);

  return { creatingTicket, filteredTickets, handleCloseTicket, handleCreateSupportTicket, handleSendReply, highPriorityCount, loadTicketMessages, loadTickets, messagesLoading, messagesRef, newTicketDraft, onlineCount, replySending, replyText, searchValue, selectedTicket, selectedTicketId, setCreatingTicket, setMessagesLoading, setNewTicketDraft, setReplySending, setReplyText, setSearchValue, setSelectedTicketId, setStatusFilter, setTicketMessages, setTickets, setTicketsLoading, statusFilter, ticketMessages, tickets, ticketsLoading, waitingCount };
}

export function SupportSection({ creatingTicket, filteredTickets, handleCloseTicket, handleCreateSupportTicket, handleSendReply, messagesLoading, messagesRef, newTicketDraft, replySending, replyText, searchValue, selectedTicket, selectedTicketId, setNewTicketDraft, setReplyText, setSearchValue, setSelectedTicketId, setStatusFilter, statusFilter, ticketMessages, ticketsLoading }) {
  return (
 (
      <section className={styles.admin_workspace}>
        <aside className={styles.admin_queue}>
          <div className={styles.admin_queueTop}>
            <div>
              <h2>Очередь</h2>
              <p>{filteredTickets.length} обращений</p>
            </div>
          </div>

          <label className={styles.admin_search}>
            <FiSearch />
            <input
              value={searchValue}
              placeholder="Клиент, тикет или сделка"
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </label>

          <div className={styles.admin_filters} aria-label="Фильтр тикетов">
            <FiFilter />
            {Object.entries(statusLabels).map(([status, label]) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? styles.admin_filterActive : ""}
                onClick={() => setStatusFilter(status)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className={styles.admin_ticketList}>
            {ticketsLoading && (
              <div className={styles.admin_empty}>Загружаем обращения...</div>
            )}

            {filteredTickets.map((ticket) => (
              <button
                key={ticket.id}
                type="button"
                className={`${styles.admin_ticketCard} ${
                  selectedTicketId === ticket.id ? styles.admin_ticketCardActive : ""
                }`}
                onClick={() => setSelectedTicketId(ticket.id)}
              >
                <div>
                  <strong>{getTicketClientName(ticket)}</strong>
                  <span>{ticketCategoryLabels[ticket.category] || ticket.category || "Обращение"} / #{ticket.id}</span>
                </div>
                <p>{ticket.lastMessage || ticket.subject}</p>
                {ticket.unread > 0 && (
                  <b className={styles.admin_unread}>{ticket.unread}</b>
                )}
                <footer>
                  <span className={styles[`admin_priority_${ticket.priority}`]}>
                    {priorityLabels[ticket.priority] || ticket.priority}
                  </span>
                  <span className={styles.admin_category}>
                    {ticketCategoryLabels[ticket.category] || ticket.category || "Без категории"}
                  </span>
                  <small>{formatDate(ticket.updatedAt || ticket.createdAt)}</small>
                </footer>
              </button>
            ))}
          </div>
        </aside>

        <div className={styles.admin_dialog}>
          {!selectedTicket && (
            <div className={styles.admin_empty}>Выберите обращение из очереди</div>
          )}

          {selectedTicket && (
            <>
              <div className={styles.admin_dialogHeader}>
                <div>
                  <h2>{getTicketClientName(selectedTicket)}</h2>
                  <p>
                    Тикет #{selectedTicket.id} / {ticketCategoryLabels[selectedTicket.category] || selectedTicket.category || "Без категории"} / {selectedTicket.subject}
                  </p>
                </div>
                <div>
                  <button type="button" onClick={handleCloseTicket}>
                    Закрыть тикет
                  </button>
                </div>
              </div>

              <div className={styles.admin_messages} ref={messagesRef}>
                {messagesLoading && (
                  <div className={styles.admin_empty}>Загружаем сообщения...</div>
                )}

                {!messagesLoading && ticketMessages.length === 0 && (
                  <div className={styles.admin_empty}>Сообщений пока нет</div>
                )}

                {!messagesLoading && ticketMessages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.sender?.role === "operator"
                        ? styles.admin_messageOperator
                        : styles.admin_messageClient
                    }
                  >
                    <p>{message.text}</p>
                    <span>{formatDate(message.createdAt)}</span>
                  </div>
                ))}
              </div>

              <div className={styles.admin_composer}>
                <input
                  value={replyText}
                  placeholder={selectedTicket.status === "closed" ? "Тикет закрыт" : "Ответить клиенту"}
                  disabled={selectedTicket.status === "closed" || replySending}
                  onChange={(event) => setReplyText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleSendReply();
                    }
                  }}
                />
                <button type="button" disabled={selectedTicket.status === "closed" || replySending} onClick={handleSendReply}>
                  <FiSend />
                </button>
              </div>
            </>
          )}
        </div>

        <aside className={styles.admin_details}>
          <form className={styles.admin_createTicket} onSubmit={handleCreateSupportTicket}>
            <div className={styles.admin_createTicketTitle}>
              <span>
                <FiMessageCircle />
              </span>
              <div>
                <h2>Написать пользователю</h2>
                <p>Создаст новый тикет и первое сообщение от поддержки.</p>
              </div>
            </div>

            <label>
              <span>Email пользователя</span>
              <input
                type="email"
                value={newTicketDraft.email}
                placeholder="user@example.com"
                autoComplete="off"
                onChange={(event) =>
                  setNewTicketDraft((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>

            <label>
              <span>Тема</span>
              <input
                value={newTicketDraft.subject}
                placeholder="Например: Уточнение по P2P сделке"
                maxLength={180}
                onChange={(event) =>
                  setNewTicketDraft((current) => ({ ...current, subject: event.target.value }))
                }
              />
            </label>

            <div className={styles.admin_createTicketRow}>
              <label>
                <span>Категория</span>
                <select
                  value={newTicketDraft.category}
                  onChange={(event) =>
                    setNewTicketDraft((current) => ({ ...current, category: event.target.value }))
                  }
                >
                  {Object.entries(ticketCategoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Приоритет</span>
                <select
                  value={newTicketDraft.priority}
                  onChange={(event) =>
                    setNewTicketDraft((current) => ({ ...current, priority: event.target.value }))
                  }
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              <span>Сообщение</span>
              <textarea
                value={newTicketDraft.text}
                placeholder="Текст, который увидит пользователь в поддержке"
                maxLength={4000}
                onChange={(event) =>
                  setNewTicketDraft((current) => ({ ...current, text: event.target.value }))
                }
              />
            </label>

            <button type="submit" disabled={creatingTicket}>
              {creatingTicket ? "Создаем..." : "Создать тикет"}
            </button>
          </form>

          <h2>Контекст</h2>

          {selectedTicket && (
            <>
              <div className={styles.admin_client}>
                <span>
                  <FiUser />
                </span>
                <div>
                  <strong>{getTicketClientName(selectedTicket)}</strong>
                  <p>{selectedTicket.user?.email}</p>
                </div>
              </div>

              <dl className={styles.admin_meta}>
                <div>
                  <dt>Тикет</dt>
                  <dd>#{selectedTicket.id}</dd>
                </div>
                <div>
                  <dt>Категория</dt>
                  <dd>{ticketCategoryLabels[selectedTicket.category] || selectedTicket.category || "-"}</dd>
                </div>
                <div>
                  <dt>Статус</dt>
                  <dd>{selectedTicket.status}</dd>
                </div>
                <div>
                  <dt>Дата</dt>
                  <dd>{formatDate(selectedTicket.createdAt)}</dd>
                </div>
              </dl>

              <div className={styles.admin_note}>
                Перед закрытием тикета проверьте статус сделки и последний ответ клиента.
              </div>
            </>
          )}
        </aside>
      </section>
      )
  );
}
