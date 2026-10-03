import 'react';

export default function AttendanceRoleSelector({ positions = [], value, onChange, disabled = false }) {
  if (positions.length < 2) return null;
  return <div role="group" aria-label="Công việc chấm công" className="mt-3 flex gap-2 overflow-x-auto pb-1">
    {positions.map(position => <button key={position} type="button" aria-pressed={value === position}
      disabled={disabled} onClick={() => onChange(position)}
      className={`min-h-10 shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${value === position ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700'}`}>
      {position}
    </button>)}
  </div>;
}
