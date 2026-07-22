import React from "react";
import styles from "./Input.module.scss";

export const Input = ({
  onChange,
  value,
  placeholder,
  readonly,
  type,
  name,
  minLength,
  maxLength,
  pattern,
  title,
  required = true,
}) => {
  return (
    <label className={styles.inputLabel}>
      <input
        required={required}
        type={type || "text"}
        readOnly={readonly}
        value={value}
        name={name}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        title={title}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className={styles.placeholder}>{placeholder}</div>
    </label>
  );
};
