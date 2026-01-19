import "./ShiftCard.scss";

export const ShiftCard = ({ 
  title,
  details,
  id = null,
 }) => {
  return (
    <div className="shift-card" key={id}>
      <div className="shift-card__title">{title}</div>
      <div className="shift-card__details">
        {details}
      </div>
    </div>
  );
}