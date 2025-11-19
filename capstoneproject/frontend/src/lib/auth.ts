import { supabase } from './supabase';
import type { User } from './supabase';

// ✅ Sign Up
export async function signUp(email: string, password: string, name: string, role: 'student' | 'teacher' | 'admin') {
  try {
    // Check existing user
    const { data: existingUser } = await supabase
      .from('users')
      .select('user_id')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      return { data: null, error: { message: 'User already exists' } };
    }

    const passwordHash = await hashPassword(password);

    // Insert into users table (using correct DB field names)
    const { data, error } = await supabase
      .from('users')
      .insert({
        email,
        full_name: name,
        role,
        password_hash: passwordHash
      })
      .select()
      .single();

    if (error) throw error;

    const userId = data.user_id;

    // ✅ Insert into students or teachers based on role
    if (role === 'student') {
      await supabase.from('students').insert({
        student_id: userId,
        department: '',
        year: new Date().getFullYear(),
        section: '',
        roll_number: null
      });
    } else if (role === 'teacher') {
      await supabase.from('teachers').insert({
        teacher_id: userId,
        department: '',
        designation: ''
      });
    }

    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unknown error occurred') };
  }
}

// ✅ Sign In
export async function signIn(email: string, password: string) {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !user) {
      return { data: null, error: { message: 'Invalid email or password' } };
    }

    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      return { data: null, error: { message: 'Invalid email or password' } };
    }

    const token = generateToken(user);

    const userData: User = {
      id: user.user_id,
      email: user.email,
      name: user.full_name,
      role: user.role,
      created_at: user.created_at
    };

    return { data: { user: userData, token }, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Unknown error occurred') };
  }
}

// ✅ Get Current User
export async function getCurrentUser(userId: string): Promise<User | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('user_id, email, full_name, role, created_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.user_id,
      email: data.email,
      name: data.full_name,
      role: data.role,
      created_at: data.created_at
    };
  } catch {
    return null;
  }
}

// 🔐 Password Hashing
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

// 🔑 Token Generator
function generateToken(user: any): string {
  const payload = {
    userId: user.user_id,
    email: user.email,
    role: user.role,
    exp: Date.now() + 24 * 60 * 60 * 1000
  };
  return btoa(JSON.stringify(payload));
}

export function decodeToken(token: string): any {
  try {
    const decoded = JSON.parse(atob(token));
    if (decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}
