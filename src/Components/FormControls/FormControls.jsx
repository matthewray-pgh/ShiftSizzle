import './FormControls.scss';

export const InputField = ({ label, value, onChange, type = "text", ...rest }) => {
  return (
    <div className="input-field">
      {label && <label htmlFor={rest.name}>{label}</label>}
      <input
        id={rest.name}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        {...rest}
      />
    </div>
  );
};

export const Button = ({ children, onClick, ...rest }) => {
  return (
    <button className="button" onClick={onClick} {...rest}>
      {children}
    </button>
  );
};