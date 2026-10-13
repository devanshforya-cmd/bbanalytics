import { supabase } from './supabase-client';
import { supabaseAdmin } from './supabase-server';
import { User } from '../types';

let inMemoryUsers: User[] = [];

export async function fetchUsersFromSupabase(): Promise<User[]> {
  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { data, error } = await client.from('users').select('*').order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase fetchUsers error:', error.message);
      return inMemoryUsers;
    }
    if (data) {
      inMemoryUsers = data.map((u: any) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        fullName: u.full_name || u.name,
        role: u.role,
        password: u.password_hash,
        isSuperAdmin: u.is_super_admin,
        active: u.is_active !== false,
        dutyStatus: u.duty_status || 'ONLINE',
        assignedBrands: u.assigned_brands || ['ALL'],
        territory: u.territory || u.assigned_territory,
        reportsToId: u.reports_to_id,
        permissions: u.permissions || {},
        customPermissions: u.custom_permissions || {},
        calendarPreference: u.calendar_preference || 'BS',
      })) as User[];
    }
  } catch (err) {
    console.warn('Supabase fetchUsers error:', err);
  }
  return inMemoryUsers;
}

export function getUsers(): User[] {
  return inMemoryUsers;
}

export function getUserById(id: string): User | undefined {
  return inMemoryUsers.find((u) => u.id === id);
}

export function getUserByEmailOrPhone(input: string): User | undefined {
  const clean = input.trim().toLowerCase();
  const phoneClean = input.replace(/\D/g, '');
  return inMemoryUsers.find((u) => {
    if (u.email && u.email.toLowerCase() === clean) return true;
    if (phoneClean && u.phone && u.phone.replace(/\D/g, '') === phoneClean) return true;
    return false;
  });
}

import bcrypt from 'bcryptjs';

export async function createUser(user: User): Promise<User> {
  let passwordHash = user.password || '';
  if (passwordHash && !passwordHash.startsWith('$2a$') && !passwordHash.startsWith('$2b$')) {
    passwordHash = await bcrypt.hash(passwordHash, 12);
  }

  const normalizedUser: User = {
    ...user,
    email: user.email.toLowerCase().trim(),
    password: passwordHash,
    active: user.active !== false,
  };

  inMemoryUsers.push(normalizedUser);

  try {
    const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
    const { error } = await client.from('users').upsert({
      id: normalizedUser.id,
      name: normalizedUser.fullName,
      full_name: normalizedUser.fullName,
      email: normalizedUser.email,
      phone: normalizedUser.phone,
      role: normalizedUser.role,
      password_hash: passwordHash,
      is_super_admin: !!normalizedUser.isSuperAdmin,
      is_active: true,
      duty_status: normalizedUser.dutyStatus || 'ONLINE',
      assigned_brands: normalizedUser.assignedBrands || ['ALL'],
      assigned_territory: normalizedUser.territory || 'Kathmandu Valley',
      territory: normalizedUser.territory || 'Kathmandu Valley',
      reports_to_id: normalizedUser.reportsToId || null,
      permissions: normalizedUser.permissions || {},
      custom_permissions: normalizedUser.customPermissions || {},
      calendar_preference: normalizedUser.calendarPreference || 'AD',
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Supabase createUser error:', error);
    }
  } catch (e) {
    console.warn('Supabase createUser error:', e);
  }
  return normalizedUser;
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
  const user = inMemoryUsers.find((u) => u.id === id);
  if (user) {
    Object.assign(user, updates);
    try {
      const client = typeof window === 'undefined' ? supabaseAdmin : supabase;
      const dbUpdates: any = {};
      if (updates.fullName) {
        dbUpdates.name = updates.fullName;
        dbUpdates.full_name = updates.fullName;
      }
      if (updates.email) dbUpdates.email = updates.email.toLowerCase().trim();
      if (updates.phone) dbUpdates.phone = updates.phone;
      if (updates.role) dbUpdates.role = updates.role;
      if (updates.dutyStatus) dbUpdates.duty_status = updates.dutyStatus;
      if (updates.active !== undefined) dbUpdates.is_active = updates.active;
      if (updates.permissions) dbUpdates.permissions = updates.permissions;
      if (updates.customPermissions) dbUpdates.custom_permissions = updates.customPermissions;
      if (updates.password) {
        let pwdHash = updates.password;
        if (!pwdHash.startsWith('$2a$') && !pwdHash.startsWith('$2b$')) {
          pwdHash = await bcrypt.hash(pwdHash, 12);
        }
        user.password = pwdHash;
        dbUpdates.password_hash = pwdHash;
      }
      await client.from('users').update(dbUpdates).eq('id', id);
    } catch (e) {
      console.warn('Supabase updateUser error:', e);
    }
  }
  return user;
}
