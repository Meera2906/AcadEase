const STATUS_STYLES = {
  present:    "bg-[#E9FCE0] text-success",
  approved:   "bg-[#E9FCE0] text-success",
  resolved:   "bg-[#E9FCE0] text-success",
  active:     "bg-[#E9FCE0] text-success",
  absent:     "bg-[#FFE7E9] text-danger",
  rejected:   "bg-[#FFE7E9] text-danger",
  revoked:    "bg-[#FFE7E9] text-danger",
  od:         "bg-[#E8ECFF] text-signal",
  late:       "bg-[#FFF3DC] text-warning",
  pending:    "bg-[#FFF3DC] text-warning",
  "in review":"bg-[#FFF3DC] text-warning",
  open:       "bg-[#F1EFE6] text-text-secondary",
  holiday:    "bg-[#F1EFE6] text-text-secondary",
};

export default function Badge({ status, children }) {
  const key = String(status || children).toLowerCase();
  const style = STATUS_STYLES[key] || "bg-[#F1EFE6] text-text-secondary";
  return (
    <span className={`inline-block px-3 py-1 rounded-pill text-xs font-semibold capitalize ${style}`}>
      {children || status}
    </span>
  );
}
