export function safeReturnPath(value: string | null) {
  return value &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !/[\\\r\n\t]/.test(value) &&
    !value.startsWith('/login') &&
    !value.startsWith('/api/')
    ? value
    : '/gym';
}
