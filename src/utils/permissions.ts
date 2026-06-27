import { UserRole } from '@/types/database';

export function canManageInventory(role: UserRole | string): boolean {
  return role === 'owner' || role === 'manager';
}

export function canVoid(role: UserRole | string): boolean {
  return role === 'owner' || role === 'manager';
}

export function canChangePrice(role: UserRole | string): boolean {
  return role === 'owner' || role === 'manager';
}

export function canViewAudit(role: UserRole | string): boolean {
  return role === 'owner' || role === 'manager';
}

export function canViewFinancials(role: UserRole | string): boolean {
  return role === 'owner';
}

export function canManageUsers(role: UserRole | string): boolean {
  return role === 'owner';
}

export function canManageSettings(role: UserRole | string): boolean {
  return role === 'owner';
}

