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
  inputMode,
  autoComplete,
  className,
}) => {
  return (
    <label className={styles.inputLabel}>
      <span className={styles.placeholder}>{placeholder}</span>
      <input
        required={required}
        inputMode={inputMode}
        type={type || "text"}
        readOnly={readonly}
        value={value}
        name={name}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        title={title}
        autoComplete={autoComplete}
        className={className}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
};
