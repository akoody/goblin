import React, { useState, useRef, useEffect } from "react";
import styles from "./Chat.module.scss";
import bg from "../../../assets/images/Group 756.png";
import { RxReload } from "react-icons/rx";
import { FaUser } from "react-icons/fa";
import { IoSend } from "react-icons/io5";

export const Chat = () => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 1, text: "Привет!", type: "incoming" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
    { id: 2, text: "Здравствуйте!", type: "outgoing" },
  ]);
  const textareaRef = useRef(null);
  const contentRef = useRef(null);
  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  // Автоматическая высота textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    console.log(textarea.scrollHeight);

    if (textarea) {
      textarea.style.height = "40px"; // сначала сбрасываем
      textarea.style.height = `${textarea.scrollHeight + 5}px`; // потом устанавливаем
    }
  }, [message]);

  useEffect(() => {
    const chatContent = contentRef.current;
    if (chatContent) {
      chatContent.scrollTop = chatContent.scrollHeight;
    }
  }, [messages, message]); // Прокручивать при изменении сообщений или текста

  return (
    <div className={styles.chat}>
      <img src={bg} className="background" alt="" />
      <h1 className="h1 title">Pending Payment</h1>
      <div className={styles.chat_page}>
        <div className={styles.chat_top}>
          <span className="span">Report user</span>
          <section>
            <h1 className="h1">User</h1>
            <span className="span2">ФИО пользователя</span>
          </section>
          <p className={styles.chat_top_refresh}>
            <RxReload />
          </p>
        </div>
        <div className={styles.chat_content} ref={contentRef}>
          {messages.map((msg, index) => (
            <div
              style={{
                marginTop:
                  messages[index - 1]?.type == messages[index]?.type
                    ? "-10px"
                    : "0",
              }}
              key={index}
              className={`${styles.chat_message} ${
                msg.type === "incoming"
                  ? styles.chat_message_incoming
                  : styles.chat_message_outgoing
              }`}
            >
              <section
                style={{
                  opacity: msg.type == messages[index + 1]?.type ? "0" : "1",
                }}
                className={
                  msg.type === "incoming"
                    ? styles.chat_message_user
                    : styles.chat_message_outgoing_user
                }
              >
                <FaUser />
              </section>
              <div
                className={
                  msg.type === "incoming"
                    ? styles.chat_message_content
                    : styles.chat_message_outgoing_content
                }
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
        <div className={styles.chat_bottom}>
          <textarea
            ref={textareaRef}
            className={styles.chat_bottom_input}
            placeholder="Type your message..."
            value={message}
            onChange={handleInputChange}
          />
          <button>+</button>
          <button
            className={styles.chat_bottom_button}
            onClick={() => {
              if (message.trim()) {
                setMessages((prev) => [
                  ...prev,
                  { id: Date.now(), text: message, type: "outgoing" },
                ]);
                setMessage("");
              }
            }}
          >
            <IoSend />
          </button>
        </div>
      </div>
    </div>
  );
};
