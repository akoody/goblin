// Сделка маркета или гаранта: ход, оплата, спор, чат. С admin: вид администратора.
import { useEffect, useRef, useState } from "react";
import { ChatProfile } from '../../Components/Chat/ChatProfile';
import { useParams } from "react-router-dom";
import { enqueueSnackbar } from "notistack";
import { FiCopy } from "react-icons/fi";
import api from "../../api";
import styles from "./Commerce.module.scss";
import { Shell, State } from "./CommerceUi";
import { actions, date, labels, money, prefix, useData, useMutation } from "./commerceApi";

export function CommerceDeal({ admin = false }) {
  const { id } = useParams(),
    request = useData(`/deals/${id}`),
    me = useData("/me"),
    mutation = useMutation();
  const [message, setMessage] = useState(""),
    [attachment, setAttachment] = useState(null),
    [note, setNote] = useState(""),
    [copied, setCopied] = useState(false);
  const readMessageAttempts = useRef(new Set());
  const attachmentInput=useRef(null);
  const downloadingAttachment=useRef(false);
  const messagesRef = useRef(null);
  const followingMessages = useRef(true);
  const [newMessages, setNewMessages] = useState(false);
  const lastMessageId = request.data?.messages?.at(-1)?.id;
  const toLatest = () => {
    const list = messagesRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    followingMessages.current = true;
    setNewMessages(false);
  };
  useEffect(() => {
    followingMessages.current = true;
    setNewMessages(false);
    setAttachment(null);
    if(attachmentInput.current)attachmentInput.current.value="";
  }, [id]);
  useEffect(() => {
    if (!lastMessageId) return;
    if (followingMessages.current) toLatest();
    else setNewMessages(true);
  }, [lastMessageId]);
  useEffect(() => {
    const timer = window.setInterval(request.reload, 7000);
    return () => window.clearInterval(timer);
  }, [request.reload]);
  useEffect(() => {
    if (!admin || !request.data?.deal) return;
    const latestMessageId = Number(request.data.messages?.at(-1)?.id || 0);
    if (!latestMessageId) return;
    const readKey = `${id}:${latestMessageId}`;
    if (readMessageAttempts.current.has(readKey)) return;
    readMessageAttempts.current.add(readKey);
    api.post(prefix + `/admin/deals/${id}/read`).catch(() => {
      enqueueSnackbar("Не удалось обновить отметку о прочтении чата", {
        variant: "error",
      });
    });
  }, [admin, id, request.data]);
  const d = request.data?.deal,
    user = me.data?.user?.id;
  const buyer = d && String(d.buyer_id) === String(user),
    seller = d && String(d.seller_id) === String(user);
  const act = (action) =>
    mutation.run(async () => {
      const confirmations = {
        fund: "Зарезервировать USDT на сделке?",
        complete: "Подтвердить получение и перевести USDT продавцу?",
        refund: "Вернуть зарезервированные USDT покупателю?",
        "resolve-pay": "Перевести зарезервированные USDT продавцу?",
        "resolve-refund": "Вернуть зарезервированные USDT покупателю?",
        "admin-cancel": "Отменить сделку без движения средств?",
      };
      if (confirmations[action] && !window.confirm(confirmations[action]))
        return;
      await api.post(prefix + `${admin ? "/admin" : ""}/deals/${id}/action`, {
        action,
        note,
      });
      setNote("");
      await request.reload();
      me.reload();
    });
  const send = (e) => {
    e.preventDefault();
    mutation.run(async () => {
      if(attachment){
        const metadata=new TextEncoder().encode(JSON.stringify({name:attachment.name,caption:message}));
        const length=new DataView(new ArrayBuffer(4));
        length.setUint32(0,metadata.length);
        await api.post(prefix+`/deals/${id}/attachments`,new Blob([length.buffer,metadata,attachment],{type:"application/octet-stream"}),
          {headers:{"Content-Type":"application/octet-stream"}});
        setAttachment(null);
        if(attachmentInput.current)attachmentInput.current.value="";
      }else await api.post(prefix + `/deals/${id}/messages`, { text: message });
      setMessage("");
      followingMessages.current = true;
      request.reload();
    });
  };
  async function downloadAttachment(message){
    if(downloadingAttachment.current)return;
    downloadingAttachment.current=true;
    try{
      const {data}=await api.get(prefix+`/deals/${id}/attachments/${message.attachment_id}`,{responseType:"blob"});
      const url=URL.createObjectURL(data);
      const link=document.createElement("a");
      link.href=url;
      link.download=message.attachment_name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
    }catch{
      enqueueSnackbar("Не удалось скачать вложение",{variant:"error"});
    }finally{
      downloadingAttachment.current=false;
    }
  }
  return (
    <Shell
      title={d?.title || "Сделка"}
      description="Условия, защищённая оплата и переписка участников."
    >
      <State request={request} />
      <State request={me} />
      {d && (
        <div className={styles.columns}>
          <section className={styles.panel}>
            <div className={styles.inline}>
              <h2>{money(d.amount, d.currency)}</h2>
              <span className={styles.status}>{labels[d.status]}</span>
            </div>
            <p>
              Покупатель: {d.buyer_name || "Ожидается"}
              <br />
              Продавец: {d.seller_name || "Ожидается"}
            </p>
            {d.kind === "ESCROW" && (
              <p className={styles.dealFee}>
                Комиссия гаранта: {Number(d.guarantor_fee_percent || 0)}% из выплаты продавцу при успешном завершении.
              </p>
            )}
            <h3>Условия</h3>
            <p className={styles.terms}>{d.terms}</p>
            <a className={styles.chatLink} href="#deal-chat">Перейти к чату ↓</a>
            {d.status === "WAITING" && (
              <>
                <p>
                  Передайте ссылку только вашему контрагенту: первый
                  присоединившийся займёт свободное место.
                </p>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${window.location.origin}/commerce/deals/${id}`,
                      );
                      setCopied(true);
                    } catch {
                      enqueueSnackbar("Скопируйте ссылку из адресной строки", {
                        variant: "info",
                      });
                    }
                  }}
                >
                  <FiCopy />{" "}
                  {copied ? "Ссылка скопирована" : "Скопировать приглашение"}
                </button>
              </>
            )}
            {request.data.canJoin ? (
              <button
                className={styles.primary}
                disabled={mutation.busy}
                onClick={() =>
                  mutation.run(async () => {
                    await api.post(prefix + `/deals/${id}/join`);
                    request.reload();
                  })
                }
              >
                Принимаю условия - присоединиться
              </button>
            ) : (
              <>
                {buyer && d.status === "READY" && (
                  <>
                    <p>
                      Резервирование списывает {money(d.amount, d.currency)} с
                      доступного баланса. Средства защищены до завершения
                      сделки.
                    </p>
                    <button
                      className={styles.primary}
                      disabled={mutation.busy}
                      onClick={() => act("fund")}
                    >
                      Принять условия и зарезервировать USDT
                    </button>
                  </>
                )}
                {seller && d.status === "FUNDED" && (
                  <button
                    className={styles.primary}
                    disabled={mutation.busy}
                    onClick={() => act("deliver")}
                  >
                    Заказ передан покупателю
                  </button>
                )}
                {buyer && d.status === "DELIVERED" && (
                  <>
                    <p>
                      Подтверждайте только после проверки: оплата будет
                      переведена продавцу.
                    </p>
                    <button
                      className={styles.primary}
                      disabled={mutation.busy}
                      onClick={() => act("complete")}
                    >
                      Подтвердить получение и оплатить
                    </button>
                  </>
                )}
                {(buyer || seller) &&
                  ["WAITING", "READY"].includes(d.status) && (
                    <button
                      disabled={mutation.busy}
                      onClick={() => act("cancel")}
                    >
                      Отменить сделку
                    </button>
                  )}
                {(buyer || seller) &&
                  ["FUNDED", "DELIVERED"].includes(d.status) && (
                    <>
                      <label>
                        Причина спора
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={2000}
                        />
                      </label>
                      <button
                        disabled={mutation.busy || note.trim().length < 5}
                        onClick={() => act("dispute")}
                      >
                        Открыть спор
                      </button>
                      {seller && (
                        <button
                          disabled={mutation.busy}
                          onClick={() => act("refund")}
                        >
                          Вернуть деньги покупателю
                        </button>
                      )}
                    </>
                  )}
                {d.status === "DISPUTED" && (
                  <p>
                    Средства остаются в резерве. Администратор проверит условия
                    и переписку.
                  </p>
                )}
                {admin && ["WAITING", "READY", "FUNDED", "DELIVERED", "DISPUTED"].includes(d.status) && (
                  <>
                    <label>
                      Причина решения администратора
                      <textarea
                        aria-label="Причина решения администратора"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={2000}
                      />
                    </label>
                    {d.funded_at && ["FUNDED", "DELIVERED", "DISPUTED"].includes(d.status) ? (
                      <>
                        <button className={styles.primary} disabled={mutation.busy || note.trim().length < 5} onClick={() => act("resolve-pay")}>
                          Выплатить {money(d.amount, d.currency)} продавцу
                        </button>
                        <button disabled={mutation.busy || note.trim().length < 5} onClick={() => act("resolve-refund")}>
                          Вернуть {money(d.amount, d.currency)} покупателю
                        </button>
                      </>
                    ) : ["WAITING", "READY"].includes(d.status) ? (
                      <button disabled={mutation.busy || note.trim().length < 5} onClick={() => act("admin-cancel")}>
                        Отменить сделку без перевода средств
                      </button>
                    ) : (
                      <p>Для перевода требуется активный резерв средств.</p>
                    )}
                  </>
                )}
              </>
            )}
            <details>
              <summary>История сделки</summary>
              {request.data.events.map((ev, i) => (
                <p key={i}>
                  <small>{date(ev.created_at)}</small>
                  <br />
                  {actions[ev.action] || ev.action}
                  {ev.note && `: ${ev.note}`}
                </p>
              ))}
            </details>
          </section>
          <section id="deal-chat" className={`${styles.panel} ${styles.chatPanel}`}>
            <h2>Чат сделки</h2>
            <p className={styles.chatNote}>Обновляется автоматически. Обсуждайте условия и передачу заказа здесь.</p>
            {!request.data.canJoin && (
              <>
                <div ref={messagesRef} className={styles.messages} role="log" aria-label="Сообщения сделки" onScroll={e => {
                  const list = e.currentTarget;
                  followingMessages.current = list.scrollHeight - list.scrollTop - list.clientHeight < 70;
                  if (followingMessages.current) setNewMessages(false);
                }}>
                  {request.data.messages.map((m) => (
                    <article className={`${styles.message} ${String(m.sender_id) === String(user) ? styles.ownMessage : ''}`} key={m.id}>
                      <ChatProfile profile={m.sender||{username:m.sender_name}}/>
                      <small>{date(m.created_at)}</small>
                      {m.text&&<p>{m.text}</p>}
                      {m.attachment_id&&<button type="button" className={styles.attachmentDownload} onClick={()=>downloadAttachment(m)}>
                        Скачать {m.attachment_name} · {new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(Math.max(0.1,Number(m.attachment_size)/1024))} КБ
                      </button>}
                    </article>
                  ))}
                  {!request.data.messages.length && (
                    <p>Передача и обсуждение заказа происходят здесь.</p>
                  )}
                </div>
                {newMessages && <button type="button" onClick={toLatest}>Новые сообщения ↓</button>}
                {!["COMPLETED", "REFUNDED", "CANCELLED"].includes(d.status) && (
                  <form onSubmit={send} className={styles.messageForm}>
                    <label>
                      Сообщение
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={2000}
                        rows={3}
                        placeholder="Напишите сообщение…"
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if ((attachment||message.trim()) && !mutation.busy) e.currentTarget.form.requestSubmit(); } }}
                        required={!attachment}
                      />
                    </label>
                    {d.kind==="ESCROW"&&<label className={styles.attachmentPicker}>
                      Файл, фото или видео до 20 МБ
                      <input ref={attachmentInput} type="file" disabled={mutation.busy} onChange={event=>{
                        const file=event.target.files?.[0];
                        if(file&&(!file.size||file.size>20_000_000)){
                          event.target.value="";
                          setAttachment(null);
                          enqueueSnackbar("Выберите непустой файл размером до 20 МБ",{variant:"error"});
                          return;
                        }
                        setAttachment(file||null);
                      }}/>
                    </label>}
                    {attachment&&<button type="button" disabled={mutation.busy} className={styles.attachmentDownload}
                      onClick={()=>{setAttachment(null);if(attachmentInput.current)attachmentInput.current.value="";}}>Убрать вложение</button>}
                    <button
                      className={styles.primary}
                      disabled={mutation.busy || (!attachment&&!message.trim())}
                    >
                      {mutation.busy ? attachment?'Проверка файла…':'Отправка…' : 'Отправить'}
                    </button>
                    <span className={styles.chatNote}>{message.length}/2000 · Ctrl/⌘ + Enter - отправить</span>
                  </form>
                )}
              </>
            )}
            {request.data.canJoin && (
              <p>Чат появится после принятия условий.</p>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
