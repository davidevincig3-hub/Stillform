export function isPrivateIPv4(address) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false;
  const octets = address.split('.').map(Number);
  if (
    octets.some((n) => n > 255) ||
    octets.some((n, i) => String(n) !== address.split('.')[i])
  )
    return false;
  const [a, b] = octets;
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}
