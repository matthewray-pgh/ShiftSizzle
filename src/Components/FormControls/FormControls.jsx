import './FormControls.scss';

export const InputField = ({ label, value, onChange, type = "text", options = [], ...rest }) => {
  const inputId = rest.name ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="input-field">
      {label && <label htmlFor={inputId}>{label}</label>}
      {type === "select" ? (
        <select id={inputId} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea id={inputId} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      ) : (
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </div>
  );
};

export const Button = ({ children, onClick, className = "", ...rest }) => {
  return (
    <button className={`button ${className}`.trim()} onClick={onClick} {...rest}>
      {children}
    </button>
  );
};