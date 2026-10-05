import type { NetworkInterfaceInfo } from 'node:os';
export function isPrivateIPv4(address: string): boolean;
export function lanAddresses(
  interfaces: Record<string, NetworkInterfaceInfo[] | undefined>,
): { name: string; address: string }[];
export function selectLanAddress(
  addresses: { name: string; address: string }[],
  requested?: string,
): string;
