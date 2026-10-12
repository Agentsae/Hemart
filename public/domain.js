export function deliveryDate(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + (Number(parts.hour) >= 21 ? 2 : 1));
  return date;
}
export function total(cart, products) {
  return Object.entries(cart).reduce(
    (sum, [id, qty]) => sum + (products.find((p) => p.id === id)?.price || 0) * qty,
    0,
  );
}
export function preparation(orders) {
  const items = {};
  for (const order of orders.filter((o) => o.status !== 'Selesai'))
    for (const item of order.items) {
      items[item.id] ??= { name: item.name, unit: item.unit, qty: 0 };
      items[item.id].qty += item.qty;
    }
  return Object.values(items);
}
