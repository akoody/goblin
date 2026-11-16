// Админка, раздел «Способы оплаты P2P: справочник и поля реквизитов». Состояние и загрузка в хуке usePaymentMethodsAdmin: он вызывается в Admin, поэтому данные
// и черновики не теряются при переключении вкладок. Разметка в PaymentMethodsSection.
import { useEffect, useState } from "react";
import { FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { enqueueSnackbar } from "notistack";
import api from "../../../api";
import { getApiErrorMessage } from "../../../utils/notifications";
import styles from "../Admin.module.scss";

const emptyPaymentDefinition = {
  code: "",
  name: "",
  shortName: "",
  group: "banks",
  tone: "#21a038",
  speed: "обычно 1-10 мин.",
  description: "",
  fields: [
    {
      key: "fullName",
      label: "Фамилия Имя",
      required: true,
      minLength: 2,
      maxLength: 120,
      pattern: "",
      placeholder: "Иван Иванов",
    },
    {
      key: "iban",
      label: "IBAN",
      required: true,
      minLength: 24,
      maxLength: 24,
      pattern: "^ES[0-9A-Z]{22}$",
      placeholder: "ES03636...",
    },
    {
      key: "comment",
      label: "Комментарий",
      required: false,
      minLength: "",
      maxLength: 200,
      pattern: "",
      placeholder: "",
    },
  ],
  active: true,
};

const emptyPaymentField = () => ({
  key: "",
  label: "",
  required: true,
  minLength: "",
  maxLength: "",
  pattern: "",
  placeholder: "",
});

const parseFieldsText = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes("|")) {
        const [key, label, required, minLength, maxLength, pattern, placeholder] = line
          .split("|")
          .map((part) => part.trim());

        return {
          key,
          label: label || key,
          required: required !== "optional",
          minLength: minLength ? Number(minLength) : undefined,
          maxLength: maxLength ? Number(maxLength) : undefined,
          pattern: pattern || undefined,
          placeholder: placeholder || undefined,
        };
      }

      const [key, label, required] = line.split(":").map((part) => part.trim());

      return {
        key,
        label: label || key,
        required: required !== "optional",
      };
    })
    .filter((field) => field.key);

const normalizePaymentFields = (fields) =>
  (Array.isArray(fields) ? fields : parseFieldsText(fields))
    .map((field) => ({
      key: String(field.key || "").trim(),
      label: String(field.label || field.key || "").trim(),
      required: field.required !== false,
      minLength: field.minLength === "" || field.minLength === undefined ? "" : Number(field.minLength),
      maxLength: field.maxLength === "" || field.maxLength === undefined ? "" : Number(field.maxLength),
      pattern: String(field.pattern || "").trim(),
      placeholder: String(field.placeholder || "").trim(),
    }));

export function usePaymentMethodsAdmin({  } = {}) {
  const [paymentDefinitions, setPaymentDefinitions] = useState([]);
  const [paymentDefinitionsLoading, setPaymentDefinitionsLoading] = useState(false);
  const [paymentDefinitionDraft, setPaymentDefinitionDraft] = useState(emptyPaymentDefinition);
  const [editingPaymentCode, setEditingPaymentCode] = useState(null);
  const loadPaymentDefinitions = (silent = false) => {
    if (!silent) {
      setPaymentDefinitionsLoading(true);
    }

    api
      .get("/payment-methods/definitions?includeInactive=1")
      .then((response) => {
        setPaymentDefinitions(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        if (!silent) {
          enqueueSnackbar(getApiErrorMessage(error, "Не удалось загрузить способы оплаты"), {
            variant: "error",
          });
        }
      })
      .finally(() => setPaymentDefinitionsLoading(false));
  };
  const activePaymentDefinitionCount = paymentDefinitions.filter((method) => method.active).length;
  const handlePaymentDraftChange = (field, value) => {
    setPaymentDefinitionDraft((current) => ({ ...current, [field]: value }));
  };
  const handleEditPaymentDefinition = (method) => {
    setEditingPaymentCode(method.code);
    setPaymentDefinitionDraft({
      code: method.code,
      name: method.name,
      shortName: method.shortName,
      group: method.group,
      tone: method.tone,
      speed: method.speed,
      description: method.description || "",
      fields: normalizePaymentFields(method.fields),
      active: method.active,
    });
  };
  const handleResetPaymentDefinition = () => {
    setEditingPaymentCode(null);
    setPaymentDefinitionDraft(emptyPaymentDefinition);
  };
  const handleSavePaymentDefinition = (event) => {
    event.preventDefault();

    const fields = normalizePaymentFields(paymentDefinitionDraft.fields);

    if (!paymentDefinitionDraft.name.trim() || fields.length === 0) {
      enqueueSnackbar("Укажите название и хотя бы одно поле реквизитов", { variant: "error" });
      return;
    }

    for (const field of fields) {
      if (!field.key || !field.label) {
        enqueueSnackbar("У каждого поля должен быть ключ и название", { variant: "error" });
        return;
      }

      if (field.minLength !== "" && (!Number.isFinite(field.minLength) || field.minLength < 0)) {
        enqueueSnackbar(`${field.label}: минимум должен быть числом от 0`, { variant: "error" });
        return;
      }

      if (field.maxLength !== "" && (!Number.isFinite(field.maxLength) || field.maxLength < 0)) {
        enqueueSnackbar(`${field.label}: максимум должен быть числом от 0`, { variant: "error" });
        return;
      }

      if (field.minLength !== "" && field.maxLength !== "" && field.minLength > field.maxLength) {
        enqueueSnackbar(`${field.label}: минимум не может быть больше максимума`, { variant: "error" });
        return;
      }

      if (field.pattern) {
        try {
          new RegExp(field.pattern);
        } catch {
          enqueueSnackbar(`${field.label}: некорректный regex`, { variant: "error" });
          return;
        }
      }
    }

    const payload = {
      code: paymentDefinitionDraft.code,
      name: paymentDefinitionDraft.name,
      shortName: paymentDefinitionDraft.shortName || paymentDefinitionDraft.name,
      group: paymentDefinitionDraft.group,
      tone: paymentDefinitionDraft.tone,
      speed: paymentDefinitionDraft.speed,
      description: paymentDefinitionDraft.description,
      fields,
      active: paymentDefinitionDraft.active,
    };
    const request = editingPaymentCode
      ? api.patch(`/payment-methods/definitions/${editingPaymentCode}`, payload)
      : api.post("/payment-methods/definitions", payload);

    request
      .then(() => {
        enqueueSnackbar(editingPaymentCode ? "Способ оплаты обновлен" : "Способ оплаты добавлен", {
          variant: "success",
        });
        handleResetPaymentDefinition();
        loadPaymentDefinitions(true);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось сохранить способ оплаты"), {
          variant: "error",
        });
      });
  };
  const handleTogglePaymentDefinition = (method) => {
    api
      .patch(`/payment-methods/definitions/${method.code}`, {
        ...method,
        active: !method.active,
      })
      .then(() => {
        enqueueSnackbar(!method.active ? "Способ оплаты включен" : "Способ оплаты выключен", {
          variant: "success",
        });
        loadPaymentDefinitions(true);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось изменить статус способа оплаты"), {
          variant: "error",
        });
      });
  };
  const handlePaymentFieldChange = (index, fieldName, value) => {
    setPaymentDefinitionDraft((current) => ({
      ...current,
      fields: normalizePaymentFields(current.fields).map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, [fieldName]: value } : field
      ),
    }));
  };
  const handleAddPaymentField = () => {
    setPaymentDefinitionDraft((current) => ({
      ...current,
      fields: [...normalizePaymentFields(current.fields), emptyPaymentField()],
    }));
  };
  const handleRemovePaymentField = (index) => {
    setPaymentDefinitionDraft((current) => ({
      ...current,
      fields: normalizePaymentFields(current.fields).filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };
  const handleDeletePaymentDefinition = (method) => {
    const confirmed = window.confirm(`Удалить способ оплаты "${method.name}"?`);
    if (!confirmed) return;

    api
      .delete(`/payment-methods/definitions/${method.code}`)
      .then(() => {
        enqueueSnackbar("Способ оплаты удален", { variant: "success" });
        if (editingPaymentCode === method.code) {
          handleResetPaymentDefinition();
        }
        loadPaymentDefinitions(true);
      })
      .catch((error) => {
        enqueueSnackbar(getApiErrorMessage(error, "Не удалось удалить способ оплаты"), {
          variant: "error",
        });
      });
  };

  useEffect(() => {
    loadPaymentDefinitions();
  }, []);

  return { activePaymentDefinitionCount, editingPaymentCode, handleAddPaymentField, handleDeletePaymentDefinition, handleEditPaymentDefinition, handlePaymentDraftChange, handlePaymentFieldChange, handleRemovePaymentField, handleResetPaymentDefinition, handleSavePaymentDefinition, handleTogglePaymentDefinition, loadPaymentDefinitions, paymentDefinitionDraft, paymentDefinitions, paymentDefinitionsLoading, setEditingPaymentCode, setPaymentDefinitionDraft, setPaymentDefinitions, setPaymentDefinitionsLoading };
}

export function PaymentMethodsSection({ activePaymentDefinitionCount, editingPaymentCode, handleAddPaymentField, handleDeletePaymentDefinition, handleEditPaymentDefinition, handlePaymentDraftChange, handlePaymentFieldChange, handleRemovePaymentField, handleResetPaymentDefinition, handleSavePaymentDefinition, handleTogglePaymentDefinition, loadPaymentDefinitions, paymentDefinitionDraft, paymentDefinitions, paymentDefinitionsLoading }) {
  return (
 (
        <section className={styles.admin_payments}>
          <div className={styles.admin_paymentsTop}>
            <div>
              <h2>Справочник способов оплаты</h2>
              <p>{activePaymentDefinitionCount} активных из {paymentDefinitions.length}</p>
            </div>
            <button type="button" onClick={() => loadPaymentDefinitions()} disabled={paymentDefinitionsLoading}>
              <FiRefreshCw />
              {paymentDefinitionsLoading ? "Обновляем" : "Обновить"}
            </button>
          </div>

          <div className={styles.admin_paymentsGrid}>
            <form className={styles.admin_paymentForm} onSubmit={handleSavePaymentDefinition}>
              <h3>{editingPaymentCode ? "Редактирование" : "Новый способ"}</h3>
              <label>
                <span>Код</span>
                <input
                  value={paymentDefinitionDraft.code}
                  disabled={Boolean(editingPaymentCode)}
                  placeholder="sber, sepa, santander"
                  onChange={(event) => handlePaymentDraftChange("code", event.target.value)}
                />
              </label>
              <div>
                <label>
                  <span>Название</span>
                  <input
                    value={paymentDefinitionDraft.name}
                    placeholder="СберБанк"
                    onChange={(event) => handlePaymentDraftChange("name", event.target.value)}
                  />
                </label>
                <label>
                  <span>Коротко</span>
                  <input
                    value={paymentDefinitionDraft.shortName}
                    placeholder="Сбер"
                    onChange={(event) => handlePaymentDraftChange("shortName", event.target.value)}
                  />
                </label>
              </div>
              <div>
                <label>
                  <span>Группа</span>
                  <select
                    value={paymentDefinitionDraft.group}
                    onChange={(event) => handlePaymentDraftChange("group", event.target.value)}
                  >
                    <option value="fast">Быстрые переводы</option>
                    <option value="banks">Банки</option>
                    <option value="wallets">Кошельки</option>
                    <option value="cash">Наличные и другое</option>
                    <option value="other">Другое</option>
                  </select>
                </label>
                <label>
                  <span>Цвет</span>
                  <input
                    value={paymentDefinitionDraft.tone}
                    placeholder="#21a038"
                    onChange={(event) => handlePaymentDraftChange("tone", event.target.value)}
                  />
                </label>
              </div>
              <label>
                <span>Скорость</span>
                <input
                  value={paymentDefinitionDraft.speed}
                  placeholder="обычно 1-10 мин."
                  onChange={(event) => handlePaymentDraftChange("speed", event.target.value)}
                />
              </label>
              <label>
                <span>Описание</span>
                <input
                  value={paymentDefinitionDraft.description}
                  placeholder="Перевод по реквизитам продавца"
                  onChange={(event) => handlePaymentDraftChange("description", event.target.value)}
                />
              </label>
              <div className={styles.admin_paymentFields}>
                <div className={styles.admin_paymentFieldsTop}>
                  <span>Поля реквизитов</span>
                  <button type="button" onClick={handleAddPaymentField}>
                    Добавить поле
                  </button>
                </div>
                <small>
                  Для SEPA Spain используйте IBAN: обязательное поле, 24 символа, regex ^ES[0-9A-Z]&#123;22&#125;$, пример ES03636...
                </small>

                {normalizePaymentFields(paymentDefinitionDraft.fields).map((field, index) => (
                  <article key={`${field.key || "field"}-${index}`} className={styles.admin_paymentFieldCard}>
                    <div>
                      <label>
                        <span>Ключ</span>
                        <input
                          value={field.key}
                          placeholder="iban"
                          onChange={(event) => handlePaymentFieldChange(index, "key", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Название</span>
                        <input
                          value={field.label}
                          placeholder="IBAN"
                          onChange={(event) => handlePaymentFieldChange(index, "label", event.target.value)}
                        />
                      </label>
                    </div>
                    <div>
                      <label>
                        <span>Мин. символов</span>
                        <input
                          type="number"
                          min="0"
                          value={field.minLength}
                          placeholder="24"
                          onChange={(event) => handlePaymentFieldChange(index, "minLength", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Макс. символов</span>
                        <input
                          type="number"
                          min="0"
                          value={field.maxLength}
                          placeholder="24"
                          onChange={(event) => handlePaymentFieldChange(index, "maxLength", event.target.value)}
                        />
                      </label>
                    </div>
                    <label>
                      <span>Regex формата</span>
                      <input
                        value={field.pattern}
                        placeholder="^ES[0-9A-Z]{22}$"
                        onChange={(event) => handlePaymentFieldChange(index, "pattern", event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Пример / placeholder</span>
                      <input
                        value={field.placeholder}
                        placeholder="ES03636..."
                        onChange={(event) => handlePaymentFieldChange(index, "placeholder", event.target.value)}
                      />
                    </label>
                    <footer>
                      <label className={styles.admin_paymentSwitch}>
                        <input
                          type="checkbox"
                          checked={field.required !== false}
                          onChange={(event) => handlePaymentFieldChange(index, "required", event.target.checked)}
                        />
                        <span>Обязательное</span>
                      </label>
                      <button type="button" onClick={() => handleRemovePaymentField(index)}>
                        <FiTrash2 />
                        Удалить поле
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
              <label className={styles.admin_paymentSwitch}>
                <input
                  type="checkbox"
                  checked={paymentDefinitionDraft.active}
                  onChange={(event) => handlePaymentDraftChange("active", event.target.checked)}
                />
                <span>Доступен пользователям</span>
              </label>
              <div className={styles.admin_paymentFormActions}>
                <button type="submit">{editingPaymentCode ? "Сохранить" : "Добавить"}</button>
                <button type="button" onClick={handleResetPaymentDefinition}>Сбросить</button>
              </div>
            </form>

            <div className={styles.admin_paymentList}>
              {paymentDefinitionsLoading && (
                <div className={styles.admin_dealsEmpty}>Загружаем способы оплаты...</div>
              )}

              {!paymentDefinitionsLoading && paymentDefinitions.map((method) => (
                <article key={method.code} className={!method.active ? styles.admin_paymentCardMuted : styles.admin_paymentCard}>
                  <div>
                    <span style={{ "--method-tone": method.tone }}>{method.shortName}</span>
                    <div>
                      <strong>{method.name}</strong>
                      <p>{method.description || method.speed}</p>
                    </div>
                    <b>{method.active ? "Активен" : "Выключен"}</b>
                  </div>
                  <ul>
                    {(method.fields || []).map((field) => (
                      <li key={field.key}>
                        <span>{field.label}</span>
                        {field.required !== false && <em>обяз.</em>}
                        {(field.minLength || field.maxLength) && (
                          <small>
                            {field.minLength || 0}-{field.maxLength || "∞"} симв.
                          </small>
                        )}
                        {field.pattern && <small>regex</small>}
                      </li>
                    ))}
                  </ul>
                  <footer>
                    <button type="button" onClick={() => handleEditPaymentDefinition(method)}>
                      Изменить
                    </button>
                    <button type="button" onClick={() => handleTogglePaymentDefinition(method)}>
                      {method.active ? "Выключить" : "Включить"}
                    </button>
                    <button type="button" onClick={() => handleDeletePaymentDefinition(method)}>
                      <FiTrash2 />
                      Удалить
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          </div>
        </section>
      )
  );
}
