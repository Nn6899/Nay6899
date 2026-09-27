export function formatDate(dateStringOrTimestamp: string | number | Date): string {
  if (!dateStringOrTimestamp) return '';
  const date = new Date(dateStringOrTimestamp);
  if (isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
